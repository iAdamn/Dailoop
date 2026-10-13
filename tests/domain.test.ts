import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { addCalendarDays, assertZone, buildReport, canonicalize, computeStats, createEmptyState, currentSequence, DomainError, effectiveEntries, elapsedSince, execute, exportBackup, formatTime, lastOccurredAt, localDate, localDateTimeCandidates, makePeriod, parseBackup, periodFor, previousPeriod, resolveLocalDateTime, selectActivities, startOfLocalDay, validateState, type Command, type DomainState, type ReportOptions } from '../src/domain';

const NOW = Date.parse('2026-10-12T17:00:00.000Z');
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const digest = async (text: string): Promise<string> => createHash('sha256').update(text, 'utf8').digest('hex');
function setup() {
  let serial = 1; let now = NOW; let state = createEmptyState({ databaseId: uuid(serial++), nowMs: now });
  const nextId = (): string => uuid(serial++);
  const run = (command: Command, operationId = nextId()) => { const result = execute(state, command, { nowMs: now, operationId, nextId }); state = result.state; return result; };
  return { run, nextId, state: () => state, clock: (ms: number) => { now = ms; }, activity: (name = 'Leer', isPrivate = false) => run({ type: 'createActivity', name, emoji: '📚', color: '#6F5BFF', isPrivate }).result.activityId!, entry: (activityId: string, iso: string, note = '') => run({ type: 'createEntry', activityId, occurredAtMs: Date.parse(iso), note }).result.entryId! };
}
function errorCode(fn: () => unknown, code: string): void { assert.throws(fn, (error: unknown) => error instanceof DomainError && error.code === code); }
function reportOptions(selectedActivityIds: string[], changes: Partial<ReportOptions> = {}): ReportOptions { return { from: '2026-09-01', to: '2026-09-03', zone: 'America/Bogota', generatedAtMs: NOW, selectedActivityIds, ...changes }; }
function deepFreeze<T>(value: T): T { if (value !== null && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
async function reseal(text: string, mutate: (backup: any) => void): Promise<string> { const backup = JSON.parse(text); mutate(backup); backup.digest = await digest(canonicalize(backup.payload)); return JSON.stringify(backup); }

test('empty dataset is truly empty and uses a fixed, explicit reporting zone', () => {
  const f = setup(); assert.equal(f.state().settings.zone, 'America/Bogota'); assert.equal(selectActivities(f.state()).length, 0); assert.equal(effectiveEntries(f.state()).length, 0); assert.equal(lastOccurredAt(f.state(), uuid(999)), null); assert.deepEqual(validateState(f.state()), f.state());
});
test('registration is append-only, immutable and counts multiple same-day/same-time occurrences', () => {
  const f = setup(); const activityId = f.activity(); const original = deepFreeze(f.state()); const originalJson = JSON.stringify(original);
  f.entry(activityId, '2026-09-01T08:00:00-05:00'); f.entry(activityId, '2026-09-01T08:00:00-05:00');
  assert.equal(JSON.stringify(original), originalJson); assert.equal(effectiveEntries(f.state()).length, 2); assert.equal(f.state().entries.length, 2); assert.equal(f.state().entryRevisions.length, 2); assert.equal(currentSequence(f.state()), 3); validateState(f.state());
});
test('retrying one operation does not duplicate; different intent with same operation ID fails', () => {
  const f = setup(); const activityId = f.activity(); const operationId = f.nextId(); const command: Command = { type: 'createEntry', activityId }; const first = f.run(command, operationId);
  f.clock(NOW + 5000); const retry = f.run(command, operationId); assert.equal(retry.result.entryId, first.result.entryId); assert.equal(retry.result.replayed, true); assert.equal(retry.changeSet.operations.length, 0); assert.equal(retry.state, first.state);
  errorCode(() => f.run({ ...command, note: 'Otra intención' }, operationId), 'operation_conflict'); f.run(command); assert.equal(f.state().entries.length, 2);
});
test('correction, void and restore preserve original data and latest means effective time', () => {
  const f = setup(); const a = f.activity(); const newer = f.entry(a, '2026-09-03T08:00:00-05:00', 'Original'); const retro = f.entry(a, '2026-09-01T08:00:00-05:00'); const createdAt = f.state().entries[0].createdAtMs;
  assert.equal(lastOccurredAt(f.state(), a), Date.parse('2026-09-03T08:00:00-05:00'));
  f.run({ type: 'correctEntry', entryId: retro, occurredAtMs: Date.parse('2026-09-04T08:00:00-05:00'), note: 'Corregida' }); assert.equal(lastOccurredAt(f.state(), a), Date.parse('2026-09-04T08:00:00-05:00'));
  f.run({ type: 'voidEntry', entryId: retro }); assert.equal(lastOccurredAt(f.state(), a), Date.parse('2026-09-03T08:00:00-05:00')); assert.equal(effectiveEntries(f.state()).length, 1);
  f.run({ type: 'restoreEntry', entryId: retro }); assert.equal(effectiveEntries(f.state()).length, 2); assert.equal(f.state().entries[0].createdAtMs, createdAt); assert.equal(f.state().entryRevisions.find(r => r.entryId === newer)!.note, 'Original'); assert.equal(f.state().entryRevisions.filter(r => r.entryId === retro).length, 4); validateState(f.state());
});
test('activity metadata revisions retain historical snapshot; archived data remains queryable', () => {
  const f = setup(); const a = f.activity(); const entryId = f.entry(a, '2026-09-01T08:00:00-05:00'); const originalSnapshot = f.state().entryRevisions[0].activityRevisionId;
  f.run({ type: 'updateActivity', activityId: a, changes: { name: 'Lectura', category: 'Personal', isArchived: true } }); assert.equal(selectActivities(f.state()).length, 0); assert.equal(selectActivities(f.state(), { includeArchived: true })[0].name, 'Lectura'); assert.equal(effectiveEntries(f.state())[0].activity.name, 'Lectura'); assert.equal(f.state().entryRevisions[0].activityRevisionId, originalSnapshot);
  errorCode(() => f.run({ type: 'createEntry', activityId: a }), 'archived_activity'); f.run({ type: 'correctEntry', entryId, note: 'Conservada' }); validateState(f.state());
});
test('changing entry activity and unknown command fields are rejected', () => {
  const f = setup(); const a = f.activity(); const e = f.entry(a, '2026-09-01T08:00:00-05:00'); errorCode(() => f.run({ type: 'correctEntry', entryId: e, activityId: uuid(999) } as Command), 'invalid_command');
  errorCode(() => f.run({ type: 'updateActivity', activityId: a, changes: { color: '#ffffff' as any } }), 'invalid_color'); errorCode(() => f.run({ type: 'updateSettings', changes: { weekStartsOn: 0 as any } }), 'invalid_settings');
});
test('clock reversal keeps commit ordering and cannot create negative elapsed labels', () => {
  const f = setup(); const a = f.activity(); const e = f.run({ type: 'createEntry', activityId: a }).result.entryId!; f.clock(NOW - 3_600_000); f.run({ type: 'correctEntry', entryId: e, note: 'Reloj atrasado' });
  assert.equal(elapsedSince(lastOccurredAt(f.state(), a), NOW - 3_600_000).status, 'clockChanged'); assert.equal(currentSequence(f.state()), 3); assert.ok(f.state().operations[2].recordedAtMs < f.state().operations[1].recordedAtMs); validateState(f.state());
  errorCode(() => f.run({ type: 'createEntry', activityId: a, occurredAtMs: NOW }), 'future_entry');
});
test('point-in-sequence selectors produce a coherent historical snapshot', () => {
  const f = setup(); const a = f.activity(); const e = f.entry(a, '2026-09-01T08:00:00-05:00'); const cut = currentSequence(f.state()); f.run({ type: 'voidEntry', entryId: e });
  assert.equal(effectiveEntries(f.state()).length, 0); assert.equal(effectiveEntries(f.state(), { atSequence: cut }).length, 1);
});
test('Bogotá midnight and inclusive date ranges use exclusive following-day boundaries', () => {
  const period = makePeriod({ from: '2026-09-01', to: '2026-09-03', zone: 'America/Bogota', nowMs: NOW }); assert.equal(period.startMs, Date.parse('2026-09-01T05:00:00Z')); assert.equal(period.endMs, Date.parse('2026-09-04T05:00:00Z'));
  const f = setup(); const a = f.activity(); f.entry(a, '2026-09-03T23:59:59.999-05:00'); f.entry(a, '2026-09-04T00:00:00-05:00'); assert.equal(effectiveEntries(f.state(), { fromMs: period.startMs, toMs: period.endMs }).length, 1);
});
test('DST spring-forward day is 23h; nonexistent wall time is rejected', () => {
  const period = periodFor('day', '2026-03-08', 'America/New_York', NOW); assert.equal(period.endMs - period.startMs, 23 * 3_600_000);
  assert.deepEqual(localDateTimeCandidates('2026-03-08T02:30', 'America/New_York'), []); errorCode(() => resolveLocalDateTime('2026-03-08T02:30', 'America/New_York'), 'nonexistent_time');
});
test('DST fall-back exposes both distinct instants and requires an explicit choice', () => {
  const candidates = localDateTimeCandidates('2026-11-01T01:30', 'America/New_York'); assert.deepEqual(candidates, [Date.parse('2026-11-01T05:30:00Z'), Date.parse('2026-11-01T06:30:00Z')]); errorCode(() => resolveLocalDateTime('2026-11-01T01:30', 'America/New_York'), 'ambiguous_time');
  assert.equal(resolveLocalDateTime('2026-11-01T01:30', 'America/New_York', 'later'), candidates[1]); assert.equal(formatTime(candidates[0], 'America/New_York'), '01:30:00 -04:00'); assert.equal(formatTime(candidates[1], 'America/New_York'), '01:30:00 -05:00');
});
test('IANA half-hour DST is handled and midnight gaps start at first existing local time', () => {
  const period = periodFor('day', '2026-10-04', 'Australia/Lord_Howe', NOW); assert.equal(period.endMs - period.startMs, 23.5 * 3_600_000);
  const chile = startOfLocalDay('2026-09-06', 'America/Santiago'); assert.equal(formatTime(chile, 'America/Santiago', false), '01:00:00');
});
test('calendar months, leap dates and Monday-based weeks cross year boundaries correctly', () => {
  const leap = periodFor('month', '2024-02-15', 'America/Bogota', NOW); assert.equal(leap.from, '2024-02-01'); assert.equal(leap.to, '2024-02-29'); assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  const week = periodFor('week', '2026-01-01', 'America/Bogota', NOW); assert.equal(week.from, '2025-12-29'); assert.equal(week.to, '2026-01-04'); assert.equal(previousPeriod(leap, NOW).to, '2024-01-31');
});
test('current presets keep nominal future end with cut, while custom future dates fail', () => {
  const month = periodFor('month', '2026-10-12', 'America/Bogota', NOW); assert.equal(month.to, '2026-10-31'); assert.equal(month.partial, true); errorCode(() => makePeriod({ from: '2026-10-12', to: '2026-10-13', zone: 'America/Bogota', nowMs: NOW }), 'future_period');
  errorCode(() => periodFor('day', '2026-10-13', 'America/Bogota', NOW), 'invalid_period');
});
test('changing report zone regroups calendar days without rewriting original event data', () => {
  const f = setup(); const a = f.activity(); f.entry(a, '2026-09-02T00:30:00Z'); const before = canonicalize(f.state().entryRevisions); f.run({ type: 'updateSettings', changes: { zone: 'UTC' } }); assert.equal(canonicalize(f.state().entryRevisions), before); assert.equal(localDate(f.state().entryRevisions[0].occurredAtMs, 'America/Bogota'), '2026-09-01'); assert.equal(localDate(f.state().entryRevisions[0].occurredAtMs, 'UTC'), '2026-09-02');
});
test('handoff example yields 4 records, corrected time, daily 3/1/0 and excludes void/private', () => {
  const f = setup(); const read = f.activity(); const water = f.activity('Regar plantas'); const secret = f.activity('PRIVATE_SENTINEL', true);
  f.entry(read, '2026-09-01T08:00:00-05:00'); f.entry(water, '2026-09-01T09:30:00-05:00'); f.entry(read, '2026-09-01T20:00:00-05:00'); const correction = f.entry(read, '2026-09-02T19:00:00-05:00'); f.run({ type: 'correctEntry', entryId: correction, occurredAtMs: Date.parse('2026-09-02T18:00:00-05:00') }); const voided = f.entry(water, '2026-09-03T08:00:00-05:00'); f.run({ type: 'voidEntry', entryId: voided }); f.entry(secret, '2026-09-03T10:00:00-05:00');
  const report = buildReport(f.state(), reportOptions([read, water])); assert.equal(report.total, 4); assert.deepEqual(report.totals.map(total => total.count), [3, 1]); assert.equal(report.items.filter(item => item.date === '2026-09-01').length, 3); assert.equal(report.items.filter(item => item.date === '2026-09-02').length, 1); assert.equal(report.items.filter(item => item.date === '2026-09-03').length, 0); assert.match(report.markdown, /18:00:00 -05:00/); assert.match(report.markdown, /Sin registros\. Total del día: 0/); assert.ok(!JSON.stringify(report).includes('PRIVATE_SENTINEL'));
});
test('privacy filtering applies before counts and to old notes, audit, IDs and filenames', () => {
  const f = setup(); const publicId = f.activity(); const privateId = f.activity('SECRET_ACTIVITY', true); const e = f.entry(publicId, '2026-09-01T08:00:00-05:00', 'OLD_NOTE_SECRET'); f.run({ type: 'correctEntry', entryId: e, note: 'NEW_NOTE_SECRET', reason: 'REASON_SECRET' }); f.entry(privateId, '2026-09-01T09:00:00-05:00', 'PRIVATE_NOTE_SECRET');
  const report = buildReport(f.state(), reportOptions([publicId, privateId], { includeAudit: true, includeHours: false })); const serialized = JSON.stringify(report);
  for (const secret of ['SECRET_ACTIVITY', 'OLD_NOTE_SECRET', 'NEW_NOTE_SECRET', 'REASON_SECRET', 'PRIVATE_NOTE_SECRET', publicId, privateId, e]) assert.ok(!serialized.includes(secret), secret);
  assert.equal(report.total, 1); assert.equal(report.items[0].time, undefined); assert.equal(report.audit[0].revisions[0].time, undefined); assert.match(report.markdown, /Horas de actividad omitidas por privacidad/); assert.equal(report.filename, 'dailoop-reporte-2026-09-01_a_2026-09-03.md');
  const withPrivate = buildReport(f.state(), reportOptions([privateId], { explicitPrivateActivityIds: [privateId], includeNotes: true })); assert.equal(withPrivate.total, 1); assert.match(withPrivate.markdown, /PRIVATE\\_NOTE\\_SECRET/);
});
test('current private state overrides previously public metadata', () => {
  const f = setup(); const a = f.activity('Later private'); f.entry(a, '2026-09-01T08:00:00-05:00'); f.run({ type: 'updateActivity', activityId: a, changes: { isPrivate: true } }); errorCode(() => buildReport(f.state(), reportOptions([a])), 'empty_selection'); assert.equal(buildReport(f.state(), reportOptions([a], { explicitPrivateActivityIds: [a] })).total, 1);
});
test('empty selection is rejected but selected activity with no events produces a valid report', () => {
  const f = setup(); const a = f.activity(); errorCode(() => buildReport(f.state(), reportOptions([])), 'empty_selection'); const report = buildReport(f.state(), reportOptions([a])); assert.equal(report.total, 0); assert.match(report.markdown, /Sin registros/);
  const ancient = buildReport(f.state(), reportOptions([a], { from: '1990-01-01', to: '2000-12-31' })); assert.equal(ancient.totalDays, 4018); assert.match(ancient.markdown, /4018 días/);
});
test('historical report follows latest effective state and optional void audit never adds totals', () => {
  const f = setup(); const a = f.activity(); const e = f.entry(a, '2026-09-01T08:00:00-05:00'); assert.equal(buildReport(f.state(), reportOptions([a])).total, 1); f.run({ type: 'correctEntry', entryId: e, occurredAtMs: Date.parse('2026-08-31T08:00:00-05:00') }); const outOfRange = buildReport(f.state(), reportOptions([a], { includeAudit: true })); assert.equal(outOfRange.total, 0); assert.equal(outOfRange.audit.length, 0);
  f.run({ type: 'correctEntry', entryId: e, occurredAtMs: Date.parse('2026-09-01T08:00:00-05:00') }); f.run({ type: 'voidEntry', entryId: e }); const voidAudit = buildReport(f.state(), reportOptions([a], { includeAudit: true, includeVoidedAudit: true })); assert.equal(voidAudit.total, 0); assert.equal(voidAudit.audit.length, 1); assert.equal(voidAudit.audit[0].revisions.at(-1)!.state, 'void');
});
test('Markdown escapes user HTML, remote images and table separators', () => {
  const f = setup(); const a = f.activity('<script>alert(1)</script>|X'); f.entry(a, '2026-09-01T08:00:00-05:00', '![remote](https://bad.invalid/a.png)\n**nota**'); const report = buildReport(f.state(), reportOptions([a], { includeNotes: true })); assert.ok(!report.markdown.includes('<script>')); assert.ok(!report.markdown.includes('![remote]')); assert.ok(report.markdown.includes('&lt;script&gt;')); assert.ok(report.markdown.includes('\\|X'));
});
test('interval statistics count zero gaps and previous period comparison has safe zero baseline', () => {
  const f = setup(); const a = f.activity(); f.entry(a, '2026-09-01T08:00:00-05:00'); f.entry(a, '2026-09-02T08:00:00-05:00'); f.entry(a, '2026-09-02T08:00:00-05:00'); f.entry(a, '2026-09-02T10:00:00-05:00'); const stats = computeStats(f.state(), periodFor('day', '2026-09-02', 'America/Bogota', NOW), NOW, [a]); assert.equal(stats.total, 3); assert.equal(stats.previousTotal, 1); assert.equal(stats.changePercent, 200); assert.deepEqual(stats.intervals, { count: 2, averageMs: 3_600_000, shortestMs: 0, longestMs: 7_200_000 }); const zero = computeStats(f.state(), periodFor('day', '2026-09-01', 'America/Bogota', NOW), NOW, [a]); assert.equal(zero.changePercent, null);
});
test('Unicode length uses graphemes with a separate byte bound; blank names fail', () => {
  const f = setup(); f.activity('👨‍👩‍👧‍👦'.repeat(80)); errorCode(() => f.activity('a'.repeat(81)), 'text_too_long'); errorCode(() => f.activity('   '), 'empty_text'); const a = f.activity(); f.entry(a, '2026-09-01T08:00:00-05:00', 'e\u0301'.repeat(2000)); errorCode(() => f.entry(a, '2026-09-01T08:00:00-05:00', 'x'.repeat(2001)), 'text_too_long');
});
test('canonical JSON vectors sort keys and entity IDs but preserve Unicode and other array order', async () => {
  assert.equal(canonicalize({ z: 'e\u0301', a: [{ id: 'b', v: 2 }, { v: 1, id: 'a' }], q: [3, 1] }), '{"a":[{"id":"a","v":1},{"id":"b","v":2}],"q":[3,1],"z":"é"}'); assert.notEqual(canonicalize('é'), canonicalize('e\u0301')); assert.equal(await digest(canonicalize({ b: 2, a: 1 })), '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777'); errorCode(() => canonicalize({ a: NaN }), 'invalid_number'); errorCode(() => canonicalize({ a: undefined }), 'invalid_json');
});
test('full backup round-trip retains private notes, archived activity, voids and all revisions', async () => {
  const f = setup(); const a = f.activity('Privada', true); const e = f.entry(a, '2026-09-01T08:00:00-05:00', 'PRIVATE'); f.run({ type: 'correctEntry', entryId: e, note: 'CORRECTION' }); f.run({ type: 'voidEntry', entryId: e }); f.run({ type: 'updateActivity', activityId: a, changes: { isArchived: true } }); const text = await exportBackup(f.state(), { backupId: f.nextId(), exportedAtMs: NOW, appVersion: '0.1.0' }, digest); const parsed = await parseBackup(text, digest);
  assert.equal(canonicalize(parsed.state), canonicalize(f.state())); assert.equal(parsed.summary.entries, 1); assert.equal(parsed.summary.entryRevisions, 3); assert.ok(text.includes('PRIVATE')); assert.equal(selectActivities(parsed.state).length, 0); assert.equal(effectiveEntries(parsed.state).length, 0); const repeated = await parseBackup(text, digest); assert.equal(canonicalize(repeated.state), canonicalize(parsed.state));
});
test('canonical dataset integrity is independent of database SELECT ordering', () => {
  const f = setup(); const a = f.activity(); f.entry(a, '2026-09-01T08:00:00-05:00'); f.entry(a, '2026-09-02T08:00:00-05:00'); const shuffled = structuredClone(f.state()); shuffled.operations.reverse(); shuffled.entries.reverse(); shuffled.entryRevisions.reverse(); validateState(shuffled); assert.equal(canonicalize(shuffled), canonicalize(f.state()));
});
test('malformed, truncated, checksum-altered and future backups fail without changing active state', async () => {
  const f = setup(); const a = f.activity(); f.entry(a, '2026-09-01T08:00:00-05:00'); const before = canonicalize(f.state()); const text = await exportBackup(f.state(), { backupId: f.nextId(), exportedAtMs: NOW, appVersion: '0.1.0' }, digest);
  await assert.rejects(parseBackup(text.slice(0, -20), digest), { code: 'invalid_json' }); await assert.rejects(parseBackup(text.replace('Leer', 'Otra'), digest), { code: 'checksum_mismatch' }); const future = JSON.parse(text); future.formatVersion = 99; await assert.rejects(parseBackup(JSON.stringify(future), digest), { code: 'unsupported_version' }); const extra = JSON.parse(text); extra.unrecognized = true; await assert.rejects(parseBackup(JSON.stringify(extra), digest), { code: 'invalid_fields' }); assert.equal(canonicalize(f.state()), before);
});
test('correctly checksummed files still reject orphan, duplicate, chain, offset and count corruption', async () => {
  const f = setup(); const a = f.activity(); const e = f.entry(a, '2026-09-01T08:00:00-05:00'); f.run({ type: 'correctEntry', entryId: e, note: 'new' }); const text = await exportBackup(f.state(), { backupId: f.nextId(), exportedAtMs: NOW, appVersion: '0.1.0' }, digest);
  const cases: [(b: any) => void, string][] = [[b => { b.payload.entries[0].activityId = uuid(90000); }, 'orphan_reference'], [b => { b.payload.entries.push(b.payload.entries[0]); }, 'duplicate_id'], [b => { b.payload.entryRevisions.find((r: any) => r.revisionNo === 2).previousRevisionId = uuid(90001); }, 'broken_chain'], [b => { b.payload.entryRevisions[0].occurredOffsetMinutes = 120; }, 'invalid_offset'], [b => { b.counts.entries = 99; }, 'count_mismatch'], [b => { b.payload.operations[0].sequence = 999; }, 'broken_sequence'], [b => { b.payload.entryRevisions[0] = null; }, 'invalid_object']];
  for (const [mutate, code] of cases) await assert.rejects(parseBackup(await reseal(text, mutate), digest), { code });
});
test('state validation rejects crossed chains, invalid state transitions and unknown fields', () => {
  const f = setup(); const a = f.activity(); const e = f.entry(a, '2026-09-01T08:00:00-05:00'); f.run({ type: 'voidEntry', entryId: e }); const corrupt = structuredClone(f.state()); corrupt.entryRevisions[1].state = 'active'; errorCode(() => validateState(corrupt), 'invalid_transition'); const extra = structuredClone(f.state()) as DomainState & { arbitrary?: boolean }; extra.arbitrary = true; errorCode(() => validateState(extra), 'invalid_fields');
});
test('checksummed operations cannot claim a different intent than their persisted effect', async () => {
  const f = setup(); const a = f.activity(); f.run({ type: 'updateActivity', activityId: a, changes: { name: 'Después' } }); const e = f.entry(a, '2026-09-01T08:00:00-05:00'); f.run({ type: 'correctEntry', entryId: e, note: 'Real' });
  const text = await exportBackup(f.state(), { backupId: f.nextId(), exportedAtMs: NOW, appVersion: '0.1.0' }, digest);
  const badName = await reseal(text, backup => { const op = backup.payload.operations.find((operation: any) => operation.kind === 'updateActivity'); op.intent = canonicalize({ type: 'updateActivity', activityId: a, changes: { name: 'Mentira' } }); });
  await assert.rejects(parseBackup(badName, digest), { code: 'intent_mismatch' });
  const badNote = await reseal(text, backup => { const op = backup.payload.operations.find((operation: any) => operation.kind === 'correctEntry'); op.intent = canonicalize({ type: 'correctEntry', entryId: e, note: 'Distinta' }); });
  await assert.rejects(parseBackup(badNote, digest), { code: 'intent_mismatch' });
});
test('revision kind must match its operation kind even with a valid checksum', async () => {
  const f = setup(); const a = f.activity(); const e = f.entry(a, '2026-09-01T08:00:00-05:00'); f.run({ type: 'voidEntry', entryId: e }); const text = await exportBackup(f.state(), { backupId: f.nextId(), exportedAtMs: NOW, appVersion: '0.1.0' }, digest);
  const mismatch = await reseal(text, backup => { backup.payload.entryRevisions.find((revision: any) => revision.kind === 'void').kind = 'restore'; }); await assert.rejects(parseBackup(mismatch, digest), { code: 'invalid_operation' });
});
test('report cutoff is a commit snapshot after clock reversal, with a filtered warning', () => {
  const f = setup(); const a = f.activity(); f.run({ type: 'createEntry', activityId: a }); const beforeReversal = NOW - 3_600_000; const report = buildReport(f.state(), reportOptions([a], { from: '2026-10-12', to: '2026-10-12', kind: 'day', generatedAtMs: beforeReversal })); assert.equal(report.total, 1); assert.ok(report.clockWarning); assert.match(report.markdown, /datos conocidos/);
  const secret = f.activity('Privada', true); f.run({ type: 'createEntry', activityId: secret }); const publicPast = f.activity('Pública'); f.entry(publicPast, '2026-10-12T08:00:00-05:00'); const filtered = buildReport(f.state(), reportOptions([publicPast, secret], { from: '2026-10-12', to: '2026-10-12', kind: 'day', generatedAtMs: beforeReversal })); assert.equal(filtered.total, 1); assert.equal(filtered.clockWarning, undefined);
});
test('historical IANA second offsets do not become false DST gaps or rounded report offsets', () => {
  assert.deepEqual(localDateTimeCandidates('1900-01-01T12:00', 'America/Bogota'), [Date.parse('1900-01-01T16:56:16Z')]); assert.equal(formatTime(Date.parse('1900-01-01T16:56:16Z'), 'America/Bogota'), '12:00:00 -04:56:16');
  const f = setup(); const a = f.activity(); f.entry(a, '1900-01-01T16:56:16Z'); assert.equal(f.state().entryRevisions[0].occurredOffsetSeconds, -17_776); validateState(f.state());
});
test('minutes-only prototype history loads intact and a new revision records precise offset', () => {
  const f = setup(); const a = f.activity(); const e = f.entry(a, '1900-01-01T16:56:16Z'); const legacy = structuredClone(f.state()); delete legacy.entryRevisions[0].occurredOffsetSeconds; validateState(legacy);
  const result = execute(legacy, { type: 'correctEntry', entryId: e, note: 'Nueva' }, { nowMs: NOW, operationId: f.nextId(), nextId: f.nextId }); assert.equal(result.state.entryRevisions[0].occurredOffsetSeconds, undefined); assert.equal(result.state.entryRevisions[1].occurredOffsetSeconds, -17_776); validateState(result.state);
});
test('unchanged corrections or activity edits do not create empty revisions or operations', () => {
  const f = setup(); const a = f.activity(); const e = f.entry(a, '2026-09-01T08:00:00-05:00', 'Original'); const before = canonicalize(f.state());
  errorCode(() => f.run({ type: 'correctEntry', entryId: e, occurredAtMs: Date.parse('2026-09-01T08:00:00-05:00'), occurredZone: 'America/Bogota', note: 'Original', reason: 'Solo motivo' }), 'no_changes');
  errorCode(() => f.run({ type: 'updateActivity', activityId: a, changes: { name: ' Leer ', isPrivate: false } }), 'no_changes'); assert.equal(canonicalize(f.state()), before);
});
test('repeated timezone validation remains strict for invalid, non-string and prototype-like values', () => {
  for (let repeat = 0; repeat < 5; repeat++) {
    for (const zone of ['America/Bogota', 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Chatham', 'UTC']) assert.doesNotThrow(() => assertZone(zone));
    for (const value of ['__proto__', 'constructor', 'toString', 'America/DefinitelyMissing', '', 'x'.repeat(101), null, 5, {}, { toString: () => 'UTC' }]) errorCode(() => assertZone(value), 'invalid_zone');
  }
});
test('indexed report audit preserves revision order even when storage rows are unordered', () => {
  const f = setup(); const a = f.activity(); const first = f.entry(a, '2026-09-01T08:00:00-05:00'); const second = f.entry(a, '2026-09-02T08:00:00-05:00'); f.run({ type: 'correctEntry', entryId: first, note: 'Nueva' }); f.run({ type: 'voidEntry', entryId: second }); f.run({ type: 'restoreEntry', entryId: second }); const unordered = structuredClone(f.state()); unordered.entryRevisions.reverse();
  const options = reportOptions([a], { includeAudit: true, includeNotes: true }); assert.deepEqual(buildReport(unordered, options), buildReport(f.state(), options)); assert.deepEqual(buildReport(unordered, options).audit.map(row => row.revisions.map(revision => revision.kind)), [['create', 'correct'], ['create', 'void', 'restore']]);
});
