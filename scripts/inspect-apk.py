#!/usr/bin/env python3
"""Read-only Dailoop release inspection; never installs, aligns or signs the APK.

Usage (Windows; use the existing S: workspace alias for batch tools):
  python scripts/inspect-apk.py APK SDK OUTPUT_DIRECTORY
Exit 0 means every binary gate passed; exit 1 means inspection failed.
The input is hashed before and after inspection to detect concurrent changes.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import zipfile


PACKAGE = "local.dailoop.personal"
# Public fingerprint supplied independently from the private release keystore.
EXPECTED_CERTIFICATE_SHA256 = "72c065f017d9d53ead5934316a732424c2ae639beafc3c2937c4b89932b61310"
ANDROID_NAMESPACE = "http://schemas.android.com/apk/res/android:"
ABI_MACHINES = {"arm64-v8a": 183, "x86_64": 62}
BACKUP_DOMAINS = {
    "root", "file", "database", "sharedpref", "external",
    "device_root", "device_file", "device_database", "device_sharedpref",
}
# Approved, locally bundled static faces from assets/fonts/manifest.json.
EXPECTED_FONTS = {
    "DailoopSymbols.ttf": "fe973a97686a5ffd2dbdf86d1266cea44972544aa48cd26e1a80c4fb89d71d07",
    "Manrope-Bold.ttf": "4aed5d180a4f41ed21f07e678486f889bb40eb0ddf5f473769b6302f507d1e36",
    "Manrope-Medium.ttf": "88d3f8ef004b53483a202772d09acaab17ca99dd41905d9b4ab07ac635632378",
    "Manrope-Regular.ttf": "6383bd9f81e56d61139884d8e42cb7b2146a11dde4efde55c8bff1e4c2c0bbe8",
    "Manrope-SemiBold.ttf": "abbefa1f58c7355b663c19f29ffe4cd7fc8c93a9e5f8b68f08d1e9ba2bc4ba0d",
    "Outfit-Bold.ttf": "6654b93d21301ec61887d3cedd6c11d9df1b1dfb63f9cf45ac7995f6e2235ab1",
    "Outfit-SemiBold.ttf": "030d373c4e2a67d5e922a2694e1eaab3b9f1208f1301dba94a70bdebf52c1efa",
}


def digest_file(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sdk_tools(sdk: Path) -> dict[str, Path]:
    suffix = ".exe" if os.name == "nt" else ""
    names = {"aapt2": "aapt2" + suffix, "zipalign": "zipalign" + suffix,
             "apksigner": "apksigner.bat" if os.name == "nt" else "apksigner"}
    def version_key(path: Path) -> tuple[int, ...]:
        return tuple(int(n) for n in re.findall(r"\d+", path.name))
    for directory in sorted((sdk / "build-tools").iterdir(), key=version_key, reverse=True):
        tools = {name: directory / filename for name, filename in names.items()}
        if directory.is_dir() and all(path.is_file() for path in tools.values()):
            return tools
    raise FileNotFoundError("No installed build-tools version contains aapt2, apksigner and zipalign")


def run_tool(tool: Path, arguments: list[str], output: Path) -> dict:
    argv = [str(tool), *arguments]
    command: list[str] | str = argv
    if os.name == "nt" and tool.suffix.lower() == ".bat":
        # Explicit cmd, disabled delayed expansion, and quoted literal arguments.
        # Reject percent expansion and embedded quotes instead of shell-escaping them.
        if any(any(char in arg for char in ('%', '"', '\r', '\n')) for arg in argv):
            raise ValueError("Batch arguments must not contain percent, quote or newline characters")
        comspec = os.environ.get("COMSPEC", r"C:\Windows\System32\cmd.exe")
        inner = " ".join('"' + arg + '"' for arg in argv)
        command = f'"{comspec}" /d /v:off /s /c "{inner}"'
    try:
        result = subprocess.run(command, shell=False, capture_output=True, timeout=180)
        stdout = result.stdout.decode("utf-8", errors="replace")
        stderr = result.stderr.decode("utf-8", errors="replace")
        returncode = result.returncode
    except subprocess.TimeoutExpired as error:
        stdout = (error.stdout or b"").decode("utf-8", errors="replace")
        stderr = (error.stderr or b"").decode("utf-8", errors="replace") + "\nTool timed out after 180 seconds."
        returncode = -1
    output.write_text(
        "ARGV " + json.dumps(argv, ensure_ascii=False) + f"\nEXIT {returncode}\n\nSTDOUT\n"
        + stdout + "\nSTDERR\n" + stderr, encoding="utf-8")
    return {"argv": argv, "exitCode": returncode, "log": str(output),
            "stdout": stdout, "stderr": stderr}


def parse_xmltree(text: str) -> list[dict]:
    """Parse aapt2's indentation tree without confusing attributes of descendants."""
    roots: list[dict] = []
    stack: list[tuple[int, dict]] = []
    for line in text.splitlines():
        element = re.match(r"^(\s*)E:\s+([^\s(]+)", line)
        if element:
            depth = len(element[1])
            node = {"tag": element[2], "attributes": {}, "children": []}
            while stack and stack[-1][0] >= depth:
                stack.pop()
            (stack[-1][1]["children"] if stack else roots).append(node)
            stack.append((depth, node))
        elif line.lstrip().startswith("A:"):
            attr = re.match(r"^\s*A:\s+([^\s(=]+)(?:\([^)]*\))?\s*=(.*)$", line)
            if not attr or not stack:
                raise ValueError("Unsupported aapt2 attribute: " + line)
            # Build-tools 36 prints namespace URIs; older versions print aliases.
            name = ("android:" + attr[1][len(ANDROID_NAMESPACE):]
                    if attr[1].startswith(ANDROID_NAMESPACE) else attr[1])
            if name in stack[-1][1]["attributes"]:
                raise ValueError("Duplicate compiled XML attribute: " + name)
            stack[-1][1]["attributes"][name] = attr[2].strip()
    if not roots:
        raise ValueError("aapt2 returned no XML elements")
    return roots


def string_value(raw: str | None) -> str | None:
    if raw is None:
        return None
    match = re.match(r'^"((?:[^"\\]|\\.)*)"', raw)
    return match[1] if match else raw


def int_value(raw: str | None) -> int | None:
    if raw is None:
        return None
    raw = re.sub(r"^\(type 0x[0-9a-fA-F]+\)", "", raw).strip()
    if raw.lower() in {"true", '"true"'}:
        return 1
    if raw.lower() in {"false", '"false"'}:
        return 0
    try:
        return int(raw, 0)
    except ValueError:
        return None


def xml_attribute(node: dict, name: str) -> str | None:
    return node["attributes"].get("android:" + name, node["attributes"].get(name))


def matching_children(node: dict, tag: str) -> list[dict]:
    return [child for child in node["children"] if child["tag"] == tag]


def excluded_domains(node: dict) -> set[str]:
    return {string_value(xml_attribute(child, "domain")) for child in node["children"]
            if child["tag"] == "exclude" and string_value(xml_attribute(child, "path")) == "."}


def resource_reference(raw: str | None) -> int | None:
    match = re.fullmatch(r"@(?:0x)?([0-9a-fA-F]+)", raw or "")
    return int(match[1], 16) if match else None


def parse_resource_files(text: str) -> dict[int, dict]:
    """Resolve IDs to actual ZIP paths, including resource-shrunk filenames."""
    resources: dict[int, dict] = {}
    current = None
    for line in text.splitlines():
        resource = re.match(r"^\s*resource\s+(0x[0-9a-fA-F]+)\s+(\S+)", line)
        if resource:
            resource_id = int(resource[1], 16)
            if resource_id in resources:
                raise ValueError("Duplicate resource ID: " + resource[1])
            current = {"id": resource[1], "name": resource[2].split(":")[-1], "files": []}
            resources[resource_id] = current
        elif current is not None:
            filename = re.match(r"^\s*\(([^)]*)\)\s+\(file\)\s+(\S+)\s+type=XML\b", line)
            if filename:
                current["files"].append({"configuration": filename[1], "path": filename[2]})
    return resources


def inspect_elf(stream, size: int, abi: str) -> dict:
    header = stream.read(64)
    if len(header) != 64 or header[:4] != b"\x7fELF":
        raise ValueError("Missing ELF header")
    if header[4:7] != bytes((2, 1, 1)):
        raise ValueError("Expected a 64-bit little-endian ELF version 1")
    fields = struct.unpack("<16sHHIQQQIHHHHHH", header)
    machine, phoff, ehsize, phentsize, phnum = fields[2], fields[5], fields[8], fields[9], fields[10]
    if machine != ABI_MACHINES.get(abi):
        raise ValueError(f"ELF machine {machine} does not match ABI {abi}")
    if ehsize != 64 or phentsize != 56 or not 0 < phnum < 65535:
        raise ValueError("Unsupported or invalid ELF/program header sizes")
    if phoff < 64 or phoff + phentsize * phnum > size:
        raise ValueError("ELF program header table is outside the file")
    stream.seek(phoff)
    table = stream.read(phentsize * phnum)
    segments = []
    for index in range(phnum):
        kind, flags, offset, virtual, _physical, filesz, memsz, alignment = struct.unpack_from(
            "<IIQQQQQQ", table, index * phentsize)
        if kind != 1:  # PT_LOAD
            continue
        valid = (alignment >= 16384 and (alignment & (alignment - 1)) == 0
                 and offset % alignment == virtual % alignment
                 and offset + filesz <= size and filesz <= memsz)
        segments.append({"index": index, "flags": flags, "offset": offset,
                         "virtualAddress": virtual, "fileSize": filesz,
                         "memorySize": memsz, "alignment": alignment, "valid16KiB": valid})
    if not segments:
        raise ValueError("ELF contains no PT_LOAD segment")
    return {"machine": machine, "class": 64, "endian": "little", "segments": segments,
            "valid16KiB": all(segment["valid16KiB"] for segment in segments)}


def inspect(apk: Path, sdk: Path, output: Path, report: dict, expected_abis: set[str]) -> None:
    checks = report["checks"]
    def check(name: str, passed: bool, detail) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    tools = sdk_tools(sdk)
    report["tools"] = {name: str(path) for name, path in tools.items()}
    project = Path(__file__).absolute().parent.parent
    config = json.loads((project / "app.json").read_text(encoding="utf-8"))["expo"]
    expected_version = {"versionCode": config["android"]["versionCode"], "versionName": config["version"],
                        "minSdkVersion": 24, "targetSdkVersion": 36}
    report["expectedReleaseMetadata"] = expected_version
    before = digest_file(apk)
    report["apk"] = {"path": str(apk), "bytes": apk.stat().st_size, "sha256": before}
    commands = {
        "signature": ("apksigner", ["verify", "--verbose", "--print-certs", str(apk)]),
        "badging": ("aapt2", ["dump", "badging", str(apk)]),
        "permissions": ("aapt2", ["dump", "permissions", str(apk)]),
        "manifest": ("aapt2", ["dump", "xmltree", "--file", "AndroidManifest.xml", str(apk)]),
        "resources": ("aapt2", ["dump", "resources", str(apk)]),
        "zipalign": ("zipalign", ["-c", "-P", "16", "-v", "4", str(apk)]),
    }
    results = {}
    report["commands"] = {}
    for name, (tool, arguments) in commands.items():
        result = run_tool(tools[tool], arguments, output / f"apk-{name}.log")
        results[name] = result
        report["commands"][name] = {key: value for key, value in result.items()
                                   if key not in {"stdout", "stderr"}}
        check("tool." + name, result["exitCode"] == 0, {"exitCode": result["exitCode"], "log": result["log"]})

    signature_text = results["signature"]["stdout"] + results["signature"]["stderr"]
    check("signature.noDebugCertificate", "android debug" not in signature_text.lower(),
          "Certificate DN must not be Android Debug; full certificate details are in apk-signature.log")
    report["certificateSha256"] = re.findall(r"certificate SHA-256 digest:\s*([0-9a-fA-F]+)", signature_text)
    check("signature.certificateIdentified", bool(report["certificateSha256"]), report["certificateSha256"])
    check("signature.expectedCertificate", [value.lower() for value in report["certificateSha256"]]
          == [EXPECTED_CERTIFICATE_SHA256],
          {"expected": EXPECTED_CERTIFICATE_SHA256, "actual": report["certificateSha256"]})

    app = None
    resource_table = parse_resource_files(results["resources"]["stdout"])
    try:
        manifest = parse_xmltree(results["manifest"]["stdout"])
        if len(manifest) != 1 or manifest[0]["tag"] != "manifest":
            raise ValueError("Expected one manifest root")
        manifest = manifest[0]
        applications = matching_children(manifest, "application")
        if len(applications) != 1:
            raise ValueError("Expected exactly one application")
        app = applications[0]
        report["manifest"] = manifest
        package = string_value(xml_attribute(manifest, "package"))
        check("manifest.package", package == PACKAGE, package)
        sdk_nodes = matching_children(manifest, "uses-sdk")
        if len(sdk_nodes) != 1:
            raise ValueError("Expected exactly one uses-sdk declaration")
        metadata = {"versionCode": int_value(xml_attribute(manifest, "versionCode")),
                    "versionName": string_value(xml_attribute(manifest, "versionName")),
                    "minSdkVersion": int_value(xml_attribute(sdk_nodes[0], "minSdkVersion")),
                    "targetSdkVersion": int_value(xml_attribute(sdk_nodes[0], "targetSdkVersion"))}
        report["releaseMetadata"] = metadata
        for name, expected in expected_version.items():
            check("manifest." + name, metadata[name] == expected,
                  {"actual": metadata[name], "expected": expected})
        for attribute in ("debuggable", "testOnly"):
            value = xml_attribute(app, attribute)
            check("manifest." + attribute, value is None or int_value(value) == 0, value)
        for attribute in ("allowBackup", "usesCleartextTraffic"):
            value = xml_attribute(app, attribute)
            check("manifest." + attribute, value is not None and int_value(value) == 0, value)

        requested = sorted({string_value(xml_attribute(child, "name")) for child in manifest["children"]
                            if child["tag"].startswith("uses-permission")})
        custom_permission = PACKAGE + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
        declared_signature = any(
            string_value(xml_attribute(child, "name")) == custom_permission
            and int_value(xml_attribute(child, "protectionLevel")) == 2
            for child in matching_children(manifest, "permission"))
        # expo-audio uses Android's normal audio-settings permission for local playback.
        # Local optional notifications survive reboot; no push/network/badges.
        allowed = {"android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.POST_NOTIFICATIONS",
                   "android.permission.RECEIVE_BOOT_COMPLETED"}
        if declared_signature:
            allowed.add(custom_permission)
        unexpected = sorted(set(requested) - allowed)
        report["permissions"] = requested
        check("permissions.minimum", not unexpected, {"unexpected": unexpected, "requested": requested,
              "policy": "Local audio, optional local notifications/boot restore and the package's signature receiver only"})
        notification_permissions = {"android.permission.POST_NOTIFICATIONS", "android.permission.RECEIVE_BOOT_COMPLETED"}
        check("permissions.localNotifications", notification_permissions.issubset(requested),
              {"required": sorted(notification_permissions), "requested": requested})
        check("manifest.hardwareAccelerated", int_value(xml_attribute(app, "hardwareAccelerated")) not in (None, 0),
              xml_attribute(app, "hardwareAccelerated"))
        receivers = [node for node in matching_children(app, "receiver")
                     if (string_value(xml_attribute(node, "name")) or "").endswith(".NotificationsService")]
        actions = {string_value(xml_attribute(action, "name")) for receiver in receivers
                   for intent in matching_children(receiver, "intent-filter") for action in matching_children(intent, "action")}
        check("notifications.bootReceiver", len(receivers) == 1
              and int_value(xml_attribute(receivers[0], "exported")) == 0
              and {"android.intent.action.BOOT_COMPLETED", "android.intent.action.MY_PACKAGE_REPLACED"}.issubset(actions),
              {"receivers": receivers, "actions": sorted(actions)})

        for attribute, resource_name in (("fullBackupContent", "dailoop_backup_rules"),
                                         ("dataExtractionRules", "dailoop_data_extraction_rules")):
            value = xml_attribute(app, attribute)
            resource = resource_table.get(resource_reference(value))
            matches = bool(resource and resource["name"] == "xml/" + resource_name and resource["files"])
            check("manifest." + attribute, matches, {"attribute": value, "resolvedResource": resource, "expected": resource_name})
        updates = [node for node in matching_children(app, "meta-data")
                   if string_value(xml_attribute(node, "name")) == "expo.modules.updates.ENABLED"]
        check("manifest.otaDisabled", len(updates) == 1 and int_value(xml_attribute(updates[0], "value")) == 0,
              [node["attributes"] for node in updates])
    except (ValueError, TypeError) as error:
        check("manifest.parse", False, str(error))

    for name, attribute, root_tag in (("backup", "fullBackupContent", "full-backup-content"),
                                      ("extraction", "dataExtractionRules", "data-extraction-rules")):
        try:
            resource = resource_table.get(resource_reference(xml_attribute(app, attribute))) if app else None
            if not resource or not resource["files"]:
                raise ValueError("Cannot resolve manifest backup resource to compiled ZIP file")
            report[name + "Rules"] = []
            # Validate every configuration, not just the default variant.
            for index, variant in enumerate(resource["files"]):
                suffix = "" if index == 0 else "-" + str(index + 1)
                result = run_tool(tools["aapt2"], ["dump", "xmltree", "--file", variant["path"], str(apk)],
                                  output / f"apk-{name}{suffix}.log")
                report["commands"][name + suffix] = {key: value for key, value in result.items()
                                                     if key not in {"stdout", "stderr"}}
                check("tool." + name + suffix, result["exitCode"] == 0,
                      {"exitCode": result["exitCode"], "log": result["log"], "resource": variant})
                trees = parse_xmltree(result["stdout"])
                if len(trees) != 1 or trees[0]["tag"] != root_tag:
                    raise ValueError("Unexpected backup XML root")
                tree = trees[0]
                report[name + "Rules"].append({**variant, "tree": tree})
                if name == "backup":
                    groups = [("legacy", tree)]
                else:
                    cloud = matching_children(tree, "cloud-backup")
                    device = matching_children(tree, "device-transfer")
                    if len(cloud) != 1 or len(device) != 1:
                        raise ValueError("Expected exactly one cloud-backup and one device-transfer rule")
                    check("backup.cloudEncryptionFlag" + suffix, int_value(xml_attribute(cloud[0], "disableIfNoEncryptionCapabilities")) not in (None, 0),
                          xml_attribute(cloud[0], "disableIfNoEncryptionCapabilities"))
                    groups = [("cloud", cloud[0]), ("deviceTransfer", device[0])]
                for group_name, node in groups:
                    actual = excluded_domains(node)
                    check("backup." + group_name + suffix, actual == BACKUP_DOMAINS and not matching_children(node, "include"),
                          {"excludedWholeDomains": sorted(actual), "expected": sorted(BACKUP_DOMAINS), "resource": variant})
        except (ValueError, TypeError) as error:
            check("backup." + name + ".parse", False, str(error))

    with zipfile.ZipFile(apk, "r") as archive:
        entries = archive.infolist()
        counts = Counter(entry.filename for entry in entries)
        check("zip.uniqueEntries", all(count == 1 for count in counts.values()),
              [name for name, count in counts.items() if count > 1])
        corrupted = archive.testzip()
        check("zip.crc", corrupted is None, corrupted)
        inventory = [{"path": entry.filename, "bytes": entry.file_size,
                      "compressedBytes": entry.compress_size, "compression": entry.compress_type,
                      "crc32": f"{entry.CRC:08x}"} for entry in entries]
        (output / "apk-zip-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
        report["zipEntryCount"] = len(entries)
        report["fonts"] = []
        for entry in entries:
            if entry.filename.lower().endswith((".ttf", ".otf")):
                with archive.open(entry) as stream:
                    digest = hashlib.file_digest(stream, "sha256").hexdigest()
                report["fonts"].append({"path": entry.filename, "bytes": entry.file_size, "sha256": digest})
        for font_name, digest in EXPECTED_FONTS.items():
            matches = [item["path"] for item in report["fonts"] if item["sha256"] == digest]
            check("font." + font_name, bool(matches), {"expectedSha256": digest, "packagedPaths": matches})
        report["audio"] = []
        for entry in entries:
            if entry.filename.lower().endswith(".wav"):
                with archive.open(entry) as stream:
                    digest = hashlib.file_digest(stream, "sha256").hexdigest()
                report["audio"].append({"path": entry.filename, "bytes": entry.file_size, "sha256": digest})
        for sound_name in ("glass-tap.wav", "glass-tick.wav"):
            digest = digest_file(project / "assets" / "audio" / sound_name)
            matches = [item["path"] for item in report["audio"] if item["sha256"] == digest]
            check("audio." + sound_name, bool(matches), {"expectedSha256": digest, "packagedPaths": matches})
        bundles = [entry for entry in entries if entry.filename == "assets/index.android.bundle"]
        check("bundle.present", len(bundles) == 1 and bundles[0].file_size > 0,
              [{"path": entry.filename, "bytes": entry.file_size} for entry in bundles])
        if bundles:
            with archive.open(bundles[0]) as stream:
                report["bundleSha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
        generated_bundle = (project / "android" / "app" / "build"
                            / "generated" / "assets" / "react" / "release" / "index.android.bundle")
        generated_digest = digest_file(generated_bundle) if generated_bundle.is_file() else None
        report["generatedBundle"] = {"path": str(generated_bundle), "sha256": generated_digest}
        check("bundle.matchesGeneratedRelease", bool(generated_digest)
              and report.get("bundleSha256") == generated_digest,
              {"generated": report["generatedBundle"], "packagedSha256": report.get("bundleSha256")})
        libraries = [entry for entry in entries if re.match(r"^lib/[^/]+/[^/]+\.so$", entry.filename)]
        abis = {entry.filename.split("/")[1] for entry in libraries}
        check("native.abis", abis == expected_abis, {"actual": sorted(abis), "expected": sorted(expected_abis)})
        report["nativeLibraries"] = []
        for entry in libraries:
            abi = entry.filename.split("/")[1]
            info = {"path": entry.filename, "abi": abi, "bytes": entry.file_size}
            try:
                with archive.open(entry) as stream:
                    info.update(inspect_elf(stream, entry.file_size, abi))
                check("elf." + entry.filename, info["valid16KiB"], info["segments"])
            except (ValueError, struct.error, OSError) as error:
                info["error"] = str(error)
                check("elf." + entry.filename, False, str(error))
            report["nativeLibraries"].append(info)
    after = digest_file(apk)
    check("apk.unchanged", before == after, {"before": before, "after": after})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("apk", type=Path)
    parser.add_argument("sdk", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--expected-abis", required=True, help="Explicit release contract, e.g. arm64-v8a or x86_64 or arm64-v8a,x86_64")
    arguments = parser.parse_args()
    expected_abis = set(arguments.expected_abis.split(","))
    if not expected_abis or not expected_abis.issubset(ABI_MACHINES):
        parser.error("Expected ABIs must be a nonempty subset of arm64-v8a,x86_64")
    apk, sdk, output = (path.absolute() for path in (arguments.apk, arguments.sdk, arguments.output))
    if not apk.is_file() or not sdk.is_dir():
        parser.error("APK file and SDK directory must already exist")
    output.mkdir(parents=True, exist_ok=True)
    report = {"inspectionVersion": 1, "startedAt": datetime.now(timezone.utc).isoformat(), "checks": []}
    try:
        inspect(apk, sdk, output, report, expected_abis)
    except Exception as error:
        report["checks"].append({"name": "inspection.exception", "passed": False,
                                 "detail": type(error).__name__ + ": " + str(error)})
    report["passed"] = bool(report["checks"]) and all(check["passed"] for check in report["checks"])
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    (output / "apk-inspection.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    failed = [check for check in report["checks"] if not check["passed"]]
    summary = ["# APK inspection", "", "Result: " + ("PASS" if report["passed"] else "FAIL"),
               "", f"APK: `{apk}`", f"SHA-256: `{report.get('apk', {}).get('sha256', 'unavailable')}`",
               f"Size: {report.get('apk', {}).get('bytes', 'unavailable')} bytes",
               f"Checks: {len(report['checks']) - len(failed)}/{len(report['checks'])} passed", "",
               "This validates the packaged binary only. Installation, Android UI and physical-device behavior need separate evidence.", ""]
    if failed:
        summary += ["## Failures", ""]
        summary += ["- " + check["name"] + ": " + json.dumps(check["detail"], ensure_ascii=False) for check in failed]
    (output / "apk-inspection.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
    print("PASS" if report["passed"] else "FAIL", f"{len(report['checks']) - len(failed)}/{len(report['checks'])} checks")
    for check in failed:
        print(check["name"] + ": " + json.dumps(check["detail"], ensure_ascii=False))
    print(output / "apk-inspection.json")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
