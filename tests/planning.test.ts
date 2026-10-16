import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyPlanning, canonicalize, createEmptyState, deriveReminders, DomainError, execute, exportBackup, getPlanning, parseBackup, validateState, type Command, type DomainState, type PlanningCommand } from '../src/domain';

const BASE = Date.parse('2026-10-12T15:00:00Z');
const DUE = Date.parse('2026-10-14T15:00:00Z');
const uuid = (n: number): string => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const digest = async (text: string): Promise<string> => createHash('sha256').update(text, 'utf8').digest('hex');
function setup() {
  let serial = 1; let now = BASE; let state = createEmptyState({ databaseId: uuid(serial++), nowMs: now });
  const nextId = () => uuid(serial++);
  const run = (command: Command) => { const result = execute(state, command, { nowMs: now, operationId: nextId(), nextId }); state = result.state; return result; };
  const plan = (command: PlanningCommand, operationId = nextId()) => { state = { ...state, planning: applyPlanning(state, command, { nowMs: now, operationId, nextId }) }; return state.planning!; };
  const activity = () => run({ type: 'createActivity', name: 'Leer', emoji: '📚', color: '#6F5BFF' }).result.activityId!;
  const reminder = (activityId: string, dueAtMs = DUE) => { const command: PlanningCommand & { type: 'createReminder' } = { type: 'createReminder', id: nextId(), activityId, dueAtMs, leadMinutes: [1440, 180, 60, 30, 0], notifications: true, completionEntryId: nextId() }; plan(command); return command; };
  return { run, plan, activity, reminder, nextId, state: () => state, clock: (ms: number) => { now = ms; } };
}
function errorCode(fn: () => unknown, code: string): void { assert.throws(fn, error => error instanceof DomainError && error.code === code); }
async function reseal(text: string, mutate: (raw: any) => void): Promise<string> { const raw = JSON.parse(text); mutate(raw); raw.digest = await digest(canonicalize(raw.payload)); return JSON.stringify(raw); }

test('planning is an independent immutable audit and replay is idempotent', () => {
  const f = setup(); const activityId = f.activity(); const before = canonicalize(f.state()); const command = { type: 'createReminder', id: f.nextId(), activityId, dueAtMs: DUE, leadMinutes: [60, 0], notifications: true, completionEntryId: f.nextId() } as const;
  const mutable: PlanningCommand = { ...command, leadMinutes: [...command.leadMinutes] }; const operationId = f.nextId(); const first = f.plan(mutable, operationId);
  assert.equal(f.state().operations.length, 1); assert.equal(f.state().entries.length, 0); assert.equal(f.state().planning!.events[0].sequence, 1);
  mutable.leadMinutes.push(10); assert.deepEqual(getPlanning(f.state()).reminders[0].leadMinutes, [60, 0]);
  const replay = f.plan({ ...mutable, leadMinutes: [60, 0] }, operationId); assert.equal(replay, first);
  errorCode(() => f.plan(mutable, operationId), 'operation_conflict');
  const withoutPlanning = { ...f.state() }; delete withoutPlanning.planning; assert.equal(canonicalize(withoutPlanning), before); validateState(f.state());
});

test('existing categories/core data are untouched while reminder edits and archive replay', () => {
  const f = setup(); const reminder = f.reminder(f.activity());
  f.plan({ type: 'updateReminder', reminderId: reminder.id, changes: { leadMinutes: [15, 0], notifications: false, dueAtMs: DUE + 60_000 } });
  assert.deepEqual(getPlanning(f.state()).reminders[0].leadMinutes, [15, 0]); assert.equal(getPlanning(f.state()).reminders[0].notifications, false);
  f.plan({ type: 'archiveReminder', reminderId: reminder.id, archived: true }); assert.equal(deriveReminders(f.state(), DUE)[0].status, 'archived');
  errorCode(() => f.plan({ type: 'updateReminder', reminderId: reminder.id, changes: { notifications: true } }), 'archived_reminder');
  f.plan({ type: 'archiveReminder', reminderId: reminder.id, archived: false }); assert.equal(deriveReminders(f.state(), DUE)[0].status, 'pending'); validateState(f.state());
});

test('planning rejects missing activities, invalid offsets, times and reserved ID collisions', () => {
  const f = setup(); const reminder = f.reminder(f.activity());
  errorCode(() => f.plan({ ...reminder, id: f.nextId(), completionEntryId: f.nextId(), activityId: f.nextId() }), 'missing_activity');
  errorCode(() => f.plan({ ...reminder, id: f.nextId(), completionEntryId: f.nextId(), dueAtMs: BASE }), 'past_reminder');
  for (const leadMinutes of [[-1], [0.5], [525_601], Array.from({ length: 17 }, (_, index) => index)]) errorCode(() => f.plan({ ...reminder, id: f.nextId(), completionEntryId: f.nextId(), leadMinutes }), 'invalid_reminder_offsets');
  errorCode(() => f.plan({ ...reminder, id: f.nextId(), completionEntryId: f.nextId(), leadMinutes: [60, 60] }), 'duplicate_reminder_offsets');
  errorCode(() => f.plan({ ...reminder, id: f.nextId() }), 'duplicate_id');
  errorCode(() => f.plan({ ...reminder, id: f.state().activities[0].id, completionEntryId: f.nextId() }), 'duplicate_id');
  errorCode(() => f.plan({ ...reminder, id: f.nextId(), completionEntryId: f.state().operations[0].id }), 'duplicate_id');
  errorCode(() => f.plan({ type: 'setStreakAlerts', enabled: true, hour: 24, minute: 0 }), 'invalid_streak_alerts');
});

test('explicit completion uses one real register entry and void/restore recalculate it', () => {
  const f = setup(); const reminder = f.reminder(f.activity()); f.clock(BASE + 60_000);
  const entryId = f.run({ type: 'createEntry', activityId: reminder.activityId, id: reminder.completionEntryId }).result.entryId!;
  assert.equal(deriveReminders(f.state(), BASE + 60_000)[0].completedEntryId, entryId); assert.equal(deriveReminders(f.state(), BASE + 60_000)[0].status, 'done'); validateState(f.state());
  f.run({ type: 'voidEntry', entryId }); assert.equal(deriveReminders(f.state(), BASE + 60_000)[0].status, 'pending');
  f.run({ type: 'restoreEntry', entryId }); assert.equal(deriveReminders(f.state(), BASE + 60_000)[0].status, 'done'); assert.equal(f.state().entries.length, 1); validateState(f.state());
});

test('normal registration matches the local due date once, not every reminder on that day', () => {
  const f = setup(); const activityId = f.activity(); const first = f.reminder(activityId); const second = f.reminder(activityId, DUE + 3_600_000);
  f.clock(DUE); const entryId = f.run({ type: 'createEntry', activityId }).result.entryId!;
  let derived = deriveReminders(f.state(), DUE); assert.deepEqual(derived.map(item => item.status), ['done', 'pending']); assert.equal(derived[0].completedEntryId, entryId);
  f.clock(DUE + 3_600_000); f.run({ type: 'createEntry', activityId }); derived = deriveReminders(f.state(), DUE + 3_600_000); assert.deepEqual(derived.map(item => item.status), ['done', 'done']); assert.notEqual(derived[0].completedEntryId, derived[1].completedEntryId);
  assert.deepEqual(derived.map(item => item.id), [first.id, second.id]);
});

test('backdated, corrected and void entries change reminder completion using effective local dates', () => {
  const f = setup(); const activityId = f.activity(); f.clock(BASE - 60_000); f.run({ type: 'createEntry', activityId }); f.clock(BASE); const reminder = f.reminder(activityId);
  f.clock(DUE + 3_600_000); const entryId = f.run({ type: 'createEntry', activityId, occurredAtMs: DUE }).result.entryId!;
  assert.equal(deriveReminders(f.state(), DUE + 3_600_000)[0].status, 'done');
  f.run({ type: 'correctEntry', entryId, occurredAtMs: DUE - 86_400_000 }); assert.equal(deriveReminders(f.state(), DUE + 3_600_000)[0].status, 'overdue');
  f.run({ type: 'correctEntry', entryId, occurredAtMs: DUE }); f.run({ type: 'voidEntry', entryId }); assert.equal(deriveReminders(f.state(), DUE + 3_600_000)[0].completedEntryId, null);
  f.run({ type: 'restoreEntry', entryId }); assert.equal(deriveReminders(f.state(), DUE + 3_600_000)[0].completedEntryId, entryId); assert.equal(f.state().entries.length, 2); assert.equal(reminder.completionEntryId === entryId, false);
});

test('a pre-existing entry does not satisfy a newly created reminder on the same day', () => {
  const f = setup(); const activityId = f.activity(); f.run({ type: 'createEntry', activityId }); f.clock(BASE + 60_000); f.reminder(activityId, BASE + 3_600_000);
  assert.equal(deriveReminders(f.state(), BASE + 60_000)[0].status, 'pending');
});

test('local date matching and archived activity suppression do not rewrite entry audit', () => {
  const f = setup(); const activityId = f.activity(); f.reminder(activityId, Date.parse('2026-10-14T02:00:00Z')); f.clock(Date.parse('2026-10-14T06:00:00Z'));
  f.run({ type: 'createEntry', activityId, occurredAtMs: Date.parse('2026-10-13T19:00:00Z') }); assert.equal(deriveReminders(f.state(), Date.parse('2026-10-14T06:00:00Z'))[0].status, 'done');
  const audit = canonicalize(f.state().entryRevisions); f.run({ type: 'updateSettings', changes: { zone: 'UTC' } }); assert.equal(deriveReminders(f.state(), Date.parse('2026-10-14T06:00:00Z'))[0].status, 'overdue'); assert.equal(canonicalize(f.state().entryRevisions), audit);
  f.run({ type: 'updateActivity', activityId, changes: { isArchived: true } }); assert.equal(deriveReminders(f.state(), DUE)[0].status, 'archived');
});

test('reserved completion IDs cannot be stolen to complete another reminder', () => {
  const f = setup(); const activityId = f.activity(); const first = f.reminder(activityId); const second = f.reminder(activityId, DUE + 60_000); f.clock(DUE);
  f.run({ type: 'createEntry', activityId, id: second.completionEntryId });
  assert.deepEqual(deriveReminders(f.state(), DUE).map(item => [item.id, item.status]), [[first.id, 'pending'], [second.id, 'done']]);
});

test('streak alerts are opt-in and edits live in the planning log', () => {
  const f = setup(); assert.deepEqual(getPlanning(f.state()).streakAlerts, { enabled: false, hour: 22, minute: 0 });
  f.plan({ type: 'setStreakAlerts', enabled: true, hour: 20, minute: 15 }); f.plan({ type: 'setStreakAlerts', enabled: false, hour: 20, minute: 15 });
  assert.deepEqual(getPlanning(f.state()).streakAlerts, { enabled: false, hour: 20, minute: 15 }); assert.equal(f.state().planning!.events.length, 2); assert.equal(f.state().operations.length, 0); validateState(f.state());
});

test('legacy backup remains format 1 byte-compatible in structure; planning exports/roundtrips v2', async () => {
  const f = setup(); const activityId = f.activity(); const options = { backupId: f.nextId(), exportedAtMs: DUE, appVersion: '0.5.0' };
  const legacy = await exportBackup(f.state(), options, digest); assert.equal(JSON.parse(legacy).formatVersion, 1); assert.equal(Object.hasOwn(JSON.parse(legacy).payload, 'planning'), false); assert.deepEqual((await parseBackup(legacy, digest)).state, f.state());
  f.reminder(activityId); f.plan({ type: 'setStreakAlerts', enabled: true, hour: 22, minute: 0 }); const portable = await exportBackup(f.state(), options, digest); const raw = JSON.parse(portable);
  assert.equal(raw.formatVersion, 2); assert.equal(raw.schemaVersion, 1); assert.equal(raw.payload.meta.schemaVersion, 1); assert.deepEqual((await parseBackup(portable, digest)).state, JSON.parse(canonicalize(f.state())));
  const corrupted = JSON.parse(portable); corrupted.payload.planning.events[0].recordedAtMs++; await assert.rejects(parseBackup(JSON.stringify(corrupted), digest), error => error instanceof DomainError && error.code === 'checksum_mismatch');
  assert.deepEqual(JSON.parse(legacy).counts, raw.counts);
});

test('resealed imports reject forged planning sequences, dangling IDs and wrong payload version', async () => {
  const f = setup(); f.reminder(f.activity()); const portable = await exportBackup(f.state(), { backupId: f.nextId(), exportedAtMs: DUE, appVersion: '0.5.0' }, digest);
  const invalidSequence = await reseal(portable, raw => { raw.payload.planning.events[0].sequence = 2; }); await assert.rejects(parseBackup(invalidSequence, digest), error => error instanceof DomainError && error.code === 'invalid_planning_sequence');
  const missingActivity = await reseal(portable, raw => { raw.payload.planning.events[0].command.activityId = uuid(999); }); await assert.rejects(parseBackup(missingActivity, digest), error => error instanceof DomainError && error.code === 'missing_activity');
  const badCompletion = await reseal(portable, raw => { raw.payload.planning.events[0].command.completionEntryId = raw.payload.meta.databaseId; }); await assert.rejects(parseBackup(badCompletion, digest), error => error instanceof DomainError && error.code === 'duplicate_id');
  const wrongFormat = await reseal(portable, raw => { raw.formatVersion = 1; }); await assert.rejects(parseBackup(wrongFormat, digest), error => error instanceof DomainError && error.code === 'invalid_format');
});

test('strict replay rejects event/reminder collisions and edits before creation even after resealing', () => {
  const f = setup(); const reminder = f.reminder(f.activity()); f.plan({ type: 'updateReminder', reminderId: reminder.id, changes: { notifications: false } });
  const clone = (): DomainState => JSON.parse(JSON.stringify(f.state()));
  const duplicate = clone(); duplicate.planning!.events[1].id = duplicate.planning!.events[0].command.type === 'createReminder' ? duplicate.planning!.events[0].command.id : ''; errorCode(() => validateState(duplicate), 'duplicate_id');
  const outOfOrder = clone(); outOfOrder.planning!.events[0].sequence = 2; outOfOrder.planning!.events[1].sequence = 1; errorCode(() => validateState(outOfOrder), 'missing_reminder');
  const crossed = clone(); const otherActivity = f.activity(); f.clock(DUE); f.run({ type: 'createEntry', activityId: otherActivity, id: reminder.completionEntryId }); crossed.entries = f.state().entries; crossed.entryRevisions = f.state().entryRevisions; crossed.activities = f.state().activities; crossed.activityRevisions = f.state().activityRevisions; crossed.operations = f.state().operations; errorCode(() => validateState(crossed), 'duplicate_id');
});

test('empty planning imports roundtrip as v2 without inventing any core operations', async () => {
  const f = setup(); const state = { ...f.state(), planning: { events: [] } }; const text = await exportBackup(state, { backupId: f.nextId(), exportedAtMs: BASE, appVersion: '0.5.0' }, digest);
  assert.equal(JSON.parse(text).formatVersion, 2); assert.deepEqual((await parseBackup(text, digest)).state, state);
});

test('frozen caches respect future entries, exact due instants, clock rollback and local midnights', () => {
  const f = setup(); const activityId = f.activity(); const reminder = f.reminder(activityId);
  f.clock(DUE); const entryId = f.run({ type: 'createEntry', activityId }).result.entryId!;
  const freeze = (value: any): any => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  freeze(f.state());
  assert.equal(deriveReminders(f.state(), DUE - 1)[0].status, 'pending');
  assert.equal(deriveReminders(f.state(), DUE)[0].completedEntryId, entryId);
  assert.equal(deriveReminders(f.state(), DUE - 2)[0].status, 'pending');
  const empty = setup(); const emptyReminder = empty.reminder(empty.activity()); freeze(empty.state());
  assert.equal(deriveReminders(empty.state(), emptyReminder.dueAtMs)[0].status, 'pending');
  assert.equal(deriveReminders(empty.state(), emptyReminder.dueAtMs + 1)[0].status, 'overdue');
  assert.equal(deriveReminders(empty.state(), emptyReminder.dueAtMs)[0].status, 'pending');
  assert.equal(reminder.id, deriveReminders(f.state(), DUE)[0].id);
});

test('mutable and merely shallow-frozen input cannot acquire stale derived caches', () => {
  const f = setup(); const activityId = f.activity(); f.reminder(activityId);
  const state = f.state(); Object.freeze(state);
  assert.equal(deriveReminders(state, DUE)[0].status, 'pending');
  state.planning!.events[0].command = { type: 'archiveReminder', reminderId: getPlanning(state).reminders[0].id, archived: true };
  assert.throws(() => deriveReminders(state, DUE), error => error instanceof DomainError && error.code === 'missing_reminder');
});
