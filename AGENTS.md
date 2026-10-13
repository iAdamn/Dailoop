# Dailoop execution contract

User authorized development on 2026-10-12 while the prior project remains at a safe checkpoint. Work only in this directory. Source requirements live in ../Dailoop-Handoff and have been read in full, including originals and hashes.

- The user opened the APK gate on 2026-10-13 with “Vamos con el APK”. Local prebuild, signed standalone APK compilation and isolated Android validation are authorized. On the same date, the user explicitly authorized creating the public GitHub repository Dailoop, publishing the existing source in coherent commits and providing downloads. Cloud builds and store publication remain outside scope; do not install on a personal device without a clear test-device instruction.
- Preserve palette and original assets. No network services, account, telemetry or remote assets in the product.
- Keep domain independent of UI/storage. Append-only audit history; confirmed persistence before success. Full validated restore with candidate/rollback.
- Root owns shared config, infrastructure, application, integration and final verification. Domain agent owns src/domain and domain tests. UI agent owns src/ui. QA owns assigned tests/docs only. Never edit another owner's files while they are active.
- Evidence must identify executed PASS/FAIL and native PENDING. Web does not validate Android.
- No credentials needed for the offline application. Keep signing secrets outside source/exports in the later authorized release phase.
