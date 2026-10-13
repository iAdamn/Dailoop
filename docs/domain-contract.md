# Domain contract

Public imports come from `src/domain/index.ts`. Domain is pure TypeScript; IO, SHA-256, UUID generation and clocks are supplied by adapters.

`createEmptyState({ databaseId, nowMs, zone? })` creates an empty dataset. `execute(state, command, { nowMs, operationId, nextId })` returns `{ state, changeSet, result }` without mutating input. Commands and field names are defined in `src/domain/types.ts`. Reuse an operation ID only to retry exactly the same command. A second intentional registration uses a new operation ID. All IDs must be UUIDs.

The store serializes writes and executes against the latest snapshot *inside* its transaction. Insert `changeSet.activities/activityRevisions/entries/entryRevisions/operations`, replace settings only when non-null, and rebuild/update affected projections for `activityIds/entryIds`. Never rewrite original identities/revisions. Publish success only after commit. Enforce revision UPDATE/DELETE rejection in SQLite. DomainState contains source arrays, not projections. Persist revisionNo/predecessor, UTC time, original IANA zone/offset and monotonically increasing local operation sequence.

Example: `execute(state, { type: 'createEntry', activityId }, { nowMs: clock.now(), operationId: uuid(), nextId: uuid })`. Retroactive records provide `occurredAtMs` and `occurredZone`. Editing uses `correctEntry`, annulment `voidEntry`, restoration `restoreEntry`. Activity updates accept `changes` with name, emoji, color, isPrivate, isArchived, sortOrder and nullable category.

Corrections with identical effective instant, zone and note fail with `DomainError('no_changes')` before allocating a revision. A reason alone does not create an empty revision. Activity edits whose normalized fields are all unchanged behave the same way. Neither case appends an operation; retries of already committed operations still return their original idempotent result.

Selectors: `selectActivities(state, { includeArchived? })`, `effectiveEntries(state, filter?)`, `lastOccurredAt(state, activityId)`. Temporal functions expose local date/time resolution, period boundaries, offsets and formatting. Local times with two DST candidates need explicit user choice; nonexistent local times fail. Reports use exclusive upper bounds, a fixed reporting zone and a captured operation sequence. ReportOptions requires explicit selected IDs; private IDs must also occur in explicitPrivateActivityIds. Notes and audit default off; hours default on. A ReportModel contains only permitted output fields and one shared Markdown string.

`buildReport(state, options)` is synchronous. `exportBackup(state, { backupId, exportedAtMs, appVersion }, digest)` and `parseBackup(text, digest)` are asynchronous because SHA-256 is injected. The digest callback receives canonical JSON text and returns lowercase SHA-256 hex. Export includes all history and private data. parseBackup returns a validated candidate, never mutates an active store. Infrastructure must construct/migrate/reopen a separate DB, activate it with a recoverable persistent marker and retain the previous DB until validation succeeds. No merge. The same adapter contract applies to SQLite Web/IndexedDB; native SQLite still needs separate validation.

Initial size limits are handoff proposals, not measured performance guarantees. Domain arrays make the snapshot contract portable; a future optimized reader may load aggregates without altering append-only writes. Reports describe effective state at generation, not what was known on a past date. Full backup SHA-256 is integrity checking, not authentication or encryption.

## Calendar and clock decisions

Calendar arithmetic uses the pinned date-fns 4 helpers with `TZDate` from `@date-fns/tz`. Date-only labels use a UTC calendar context so the host machine's zone cannot shift a selected date. Local period boundaries are then resolved in the explicit reporting IANA zone; a local day is never assumed to last 24 hours. A UTC day count is used only to count calendar labels, not to compute zoned elapsed time.

The local-to-instant resolver explicitly enumerates nearby IANA offsets through Intl and round-trips candidate wall times. It rejects gaps and exposes both fold candidates instead of accepting a Date constructor's implicit disambiguation. Tests cover Bogotá, New York 23/25-hour days, Lord Howe's half-hour transition and Santiago's midnight gap. Native startup packages Intl/locale/timezone/Segmenter polyfills in the app; actual Hermes validation remains pending the separate Android approval. No runtime network data is needed.

Historical IANA offsets sometimes include seconds: Bogotá in 1900 used -04:56:16. The resolver and report formatter preserve those seconds. All newly written entry revisions include integer `occurredOffsetSeconds`; `occurredOffsetMinutes` remains the rounded compatibility field. Existing prototype revisions without the optional seconds field remain untouched and valid; when precision is needed for those records it is calculated from their stored UTC instant and IANA zone using the current bundled/runtime timezone rules, not claimed to be a separately preserved original offset. New revisions of such records capture the precise value. This addition does not change SQL keys or tables.

Report cutoff means known committed state at a captured sequence. If the device clock moves backwards after a valid registration, the already confirmed event is retained in its effective period; it is not silently removed because it now looks future. A `clockWarning` is added to ReportModel/Markdown only when an included event has that anomaly. It does not reveal excluded activities. New future registrations and newly changed future effective times are rejected. UI should explain that a partial current period is compared against the preceding complete calendar period; `previousPeriod` does not imply equal elapsed fractions.

## Validation evidence

`npm run test:domain` uses node:test/tsx with deterministic UUIDs and clocks. Fixtures verify append-only behavior, idempotency, metadata history, DST/ranges, privacy across old/new audit fields, report consistency, canonicalization vectors, full backup round-trip and malformed/semantically inconsistent candidates. A regression test demonstrated that a checksummed file with an operation intent differing from its persisted effect was accepted; validation now checks that relationship and the test passes. Storage transactions and candidate/rollback activation remain infrastructure responsibilities and need real adapter evidence.

`node --import tsx --test tests/session.test.ts` executes the actual store/session module implementations with substituted Expo IO. Two tests use real Node SQLite files, migrations, transactions, integrity checks, close/reopen and registry records. A failed final `ready` marker followed by a failed rollback marker must close handles, preserve both database files, reject pending/new reads and writes with `recoveryRequired`, and recover from the durable `activated` record only on relaunch. A successful rollback instead keeps the old dataset writable and survives reopen. Five session tests cover stale refresh success/error, the recovery barrier, recovery beginning while a mode switch awaits close, and a failed close. These seven tests pass; they do not claim Expo Web VFS or Android IO failure validation.

Infrastructure exposes `store.recoveryRequired`, `SessionSnapshot.recoveryRequired`, `SessionSnapshot.reloading` and `session.noteStoreError(error)`. UI catches must call `noteStoreError` and disable actions during recovery or mode change; the recovery instruction is to reload the application. A mode switch cannot bypass uncertain registry recovery. Session refresh captures one store identity and discards both stale values and stale failures.

## Synthetic load fixture and measured optimizations

`tests/fixtures/stress.ts` exports portable `createStressState(nowMs)`. It builds directly in O(N), without 10,000 repeated whole-state commands. It contains 50 activities (8 private), 10,000 occurrences, 1,000 corrections, 589 voids and 295 restorations: 11,884 entry revisions and 11,934 operations. There are 9,706 active occurrences, of which 8,153 are public. Notes, categories and varied historical effective dates are synthetic. The fixture is for explicit test/demo use only.

Run `node --import tsx --test tests/stress.test.ts`. Observed on Windows 10.0.26300, Node 24.15.0, AMD Ryzen 5 7600X; fixed clock 2026-10-12T17:00:00Z:

| Domain measurement | Before optimization | After optimization |
| --- | ---: | ---: |
| Validate whole state, median of 3 | 1,936.50 ms | 408.14 ms |
| Default public report, median of 3 | 142.53 ms | 124.01 ms |
| Public report with notes/audit, one sample | 2,078.00 ms | 343.59 ms |
| Pure registration command, p95 of 10 | 9.45 ms | 9.63 ms |
| Full backup export, one sample | 2,353.27 ms | 670.75 ms |
| End-of-process RSS | 1,216.88 MiB | 429.11 MiB |

Timezone validation now caches only successfully validated names in a bounded 128-item Set; invalid values and prototype-like strings still fail. A single Intl.Segmenter is reused. Report audit builds an index by selected entry ID once instead of scanning every revision for every entry, while preserving revision order and privacy filtering. Unit tests cover both strict validation and unchanged audit ordering from unordered storage rows.

The full backup is 15,693,482 bytes; default report 454,212 bytes; audit report 2,093,421 bytes. Fixture digest is `b1fca00429e7ab3f4f80beef93c8a805702be85977ed85bf9dea88e06bf6f84f`. Memory numbers are observed process totals after multiple passes, not controlled peak/retained-heap measurements. Small timing samples are descriptive, not statistical guarantees. These Node figures exclude SQLite commit/reopen, React rendering and Android. The handoff's p95 <500 ms device-registration target remains pending actual device measurement after APK authorization.
