# Dailoop execution contract

## Active handoff: Dailoop 0.1.6 navigation patch

The user reported remaining mobile tab delay after testing 0.1.5 and requested retained screens plus dragging **only the bottom bar**. Read `docs/NAVIGATION-0.1.6.md` and `docs/NAVIGATION-0.1.6-QA.md` for the current implementation/evidence. Other visual changes await the user's next item. Keep SQLite/audit/backup behavior, existing colors/fonts and signing identity. Version 0.1.6 / Android versionCode 4; local APK and preview only. The previous authorized 0.1.5 source push is already complete; no new push/release is implied. Never operate externally controlled emulator-5580; QA exclusively operates this project's emulator-5590. Preserve versioned 0.1.5 evidence and APKs.

## Previous handoff: Dailoop 0.1.5

Execution was activated by “Ahora tú ejecuta tu parte. Let's go, let's work.” Read `docs/PROGRESS-0.1.5.md` for the current outcome and remaining acceptance criteria. The pre-execution wording below is historical context, not an instruction to restart planning. New source commits and APKs remain local for this iteration; no new GitHub release or push is implied.

The user subsequently authorized a separate Flutter implementation for Gemini Argo in sibling `../Dailoop-Flutter`. That parallel project does not change this React Native iteration's five-feature scope or activate execution here. Do not edit its app, share caches/ports/AVDs/signing material, or treat Flutter as a migration of this installed app. Its `reference/` contains a frozen copy; use each project's own instructions and data. Cloud sync and Google remain deferred in both projects.

Read `docs/PLAN-0.1.5.md` and `docs/PROGRESS-0.1.5.md` before continuing this project. The user requested a ready-to-execute development plan and will change the model before saying “ejecutar”. Until that instruction arrives, this is planning only. After it arrives, execute the five-feature plan rather than drafting another plan. Scope: fluid navigation/scrolling, visible inputs above the keyboard, 1–4 activity columns, glass-inspired motion and APK size optimization. Flutter evaluation/migration, cloud sync and Google login are explicitly deferred and are not part of 0.1.5. Preserve the existing uncommitted requirements/feedback documentation. The model recommendation is GPT-6.1 Sol with high reasoning; use the selected model rather than changing it silently. Keep source changes, native testing and signing within this workspace and the user's established authorizations; no store/cloud publication or personal-device install is implied.

User authorized development on 2026-10-12 while the prior project remains at a safe checkpoint. Work only in this directory. Source requirements live in ../Dailoop-Handoff and have been read in full, including originals and hashes.

- The user opened the APK gate on 2026-10-13 with “Vamos con el APK”. Local prebuild, signed standalone APK compilation and isolated Android validation are authorized. On the same date, the user explicitly authorized creating the public GitHub repository Dailoop, publishing the existing source in coherent commits and providing downloads. Cloud builds and store publication remain outside scope; do not install on a personal device without a clear test-device instruction.
- Preserve palette and original assets. No network services, account, telemetry or remote assets in the product.
- Keep domain independent of UI/storage. Append-only audit history; confirmed persistence before success. Full validated restore with candidate/rollback.
- Root owns shared config, infrastructure, application, integration and final verification. Domain agent owns src/domain and domain tests. UI agent owns src/ui. QA owns assigned tests/docs only. Never edit another owner's files while they are active.
- Evidence must identify executed PASS/FAIL and native PENDING. Web does not validate Android.
- No credentials needed for the offline application. Keep signing secrets outside source/exports in the later authorized release phase.
