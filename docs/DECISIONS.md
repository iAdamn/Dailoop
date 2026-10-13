# Dailoop decisions — 2026-10-12

## Authorization and scope
The user explicitly authorized development after leaving the previous project at a safe checkpoint. This supersedes the initial requirement to finish it first. Dedicated project: C:/!Codex/Dayloop/Dailoop. No prior project files, ports, Git state or dependencies are reused. APK approval is still pending and separate; no APK, AAB, prebuild or native build will run now. Preview remains local.

## Phase plan
0. Verify dependency matrix and contracts; preserve handoff/originals.
1. Expo/RN Web shared UI, tokens and actual SQLite Web persistence spike (WASM, isolation, transactions, reload); use documented IndexedDB fallback only if spike fails.
2. Activities, quick/retroactive events and immutable audit revisions.
3. Historical periods, time zones, statistics and filters.
4. Filtered Markdown and full backup/restore with candidate/rollback.
5. Accessibility, light/dark, component/domain/storage/E2E checks and independent review. Present preview and evidence at APK gate.
6. Only after specific approval: signed autonomous Android build and physical-device checks.
7. Deliver source, documentation, evidence and approved release artifact.

Each checkpoint records behavior and evidence and permits autonomous reversible continuation. Do not call the product complete while native checks remain pending.

## Initial defaults and reconciliation
- Name Dailoop centralized. Four destinations: Inicio, Historial, Estadísticas, Ajustes. Reports visible in statistics and data settings.
- Monday weeks, configured IANA grouping zone initially from device, Spanish 24-hour UI, selectable 12-hour format. Explicit effective UTC, original zone/offset and recorded timestamp.
- Strict six-color palette. No free HEX selector. Original PNG preserved; system typography because font identity is unverified.
- Include optional activity category, intervals between events and a simple previous-period comparison from the pasted original prompt. Advanced comparison stays out of V1. Copy Markdown is included despite the dependencies document labeling it optional.
- Full portable JSON backup, no merge or extra encryption. Private data and old revisions are included and explained. A report is not a backup.
- Normal edits append revisions; void/restore never delete originals. Audit is local traceability, not tamper-proof forensics.
- All report output uses one filtered snapshot. Historical reports apply corrections current at generation.
- Proposed high-volume import limits are safety ceilings, not performance guarantees. Measure realistic data volume and disclose remaining limits.
- Handoff SOURCE_INDEX has a malformed link; leave original handoff immutable and document here.

## Evidence and limitations
Read 29 handoff files (21 Markdown, 4 JSON, SVG, 3 visually inspected PNG); 28 manifest hashes/sizes match; ZIP checksum and all 29 archived files match. No application tests existed at authorization.
Advisor parent-runtime preflight returned unavailable; no advisor consultation process launched. Root and bounded subagents retain implementation and verification responsibility.

## Risk focus
Web transaction/multipage concurrency; timezone DST ambiguity; old-note privacy leaks; interrupted restore; OS cloud/device backup; launcher alpha/masks; contrast; physical-device availability; signing preservation.

## Visual refinement authorized — 2026-10-12
The user requested glass-like sections, reflections for headings and two coherent typefaces. This supersedes the provisional system-font choice: locally bundled Outfit for headings/numbers and Manrope for body/controls, with OFL licenses and font hashes. This does not claim either face was the original logo font. Palette, original logo assets, local data contracts and the separate APK approval remain in force. See `UI-POLISH.md` for the implementation and fresh evidence.

The user rejected the first satin interpretation as insufficiently similar to Liquid Glass. The correction uses genuinely translucent surfaces, a visible shared ambient backdrop, real backdrop blur and optical edge highlights. `expo-blur@57.0.3` provides native blur; a palette-only CSS adapter provides Web blur. Decorative surfaces never blur their foreground labels or intercept input. Android uses one stable decorative target, with device performance and modal appearance explicitly pending the later native gate.
