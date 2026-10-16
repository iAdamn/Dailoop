import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyPlanning, canonicalize, createEmptyState, deriveReminders, DomainError, execute, exportBackup, getPlanning, localDate, nextReminderDueAt, parseBackup, recurrenceDueAt, validateReminderRecurrence, validateState, type Command, type PlanningCommand, type ReminderRecurrence } from '../src/domain';

const stamp = (value: string): number => Date.parse(value);
const BASE = stamp('2026-10-11T15:00:00Z');
const MON = stamp('2026-10-12T15:00:00Z');
const TUE = stamp('2026-10-13T15:00:00Z');
const rule = (weekdays = [1, 2]): ReminderRecurrence => ({ weekdays, hour: 10, minute: 0, zone: 'America/Bogota' });
const uuid = (number: number): string => `61000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const digest = async (text: string): Promise<string> => createHash('sha256').update(text, 'utf8').digest('hex');
function setup(start = BASE) {
  let serial = 1; let now = start; let state = createEmptyState({ databaseId: uuid(serial++), nowMs: now });
  const nextId = (): string => uuid(serial++);
  const run = (command: Command) => { const result = execute(state, command, { nowMs: now, operationId: nextId(), nextId }); state = result.state; return result; };
  const plan = (command: PlanningCommand, operationId = nextId()) => { state = { ...state, planning: applyPlanning(state, command, { nowMs: now, operationId, nextId }) }; return state.planning!; };
  const activityId = run({ type: 'createActivity', name: 'Leer', emoji: '📚', color: '#6F5BFF' }).result.activityId!;
  const create = (recurrence: ReminderRecurrence | null = rule(), dueAtMs = MON) => { const command: PlanningCommand & { type: 'createReminder' } = { type: 'createReminder', id: nextId(), activityId, dueAtMs, leadMinutes: [30, 0], notifications: true, completionEntryId: nextId(), ...(recurrence ? { recurrence } : {}) }; plan(command); return command; };
  return { run, plan, create, activityId, nextId, state: () => state, clock: (value: number) => { now = value; } };
}
function errorCode(fn: () => unknown, code: string): void { assert.throws(fn, error => error instanceof DomainError && error.code === code); }
async function changed(text: string, mutate: (raw: any) => void): Promise<string> { const raw = JSON.parse(text); mutate(raw); raw.digest = await digest(canonicalize(raw.payload)); return JSON.stringify(raw); }

test('Monday and Tuesday recur at the local hour, strictly after the queried instant', () => {
  const reminder = { dueAtMs: MON, recurrence: rule() };
  assert.equal(recurrenceDueAt(reminder, '2026-10-11'), null);
  assert.equal(recurrenceDueAt(reminder, '2026-10-12'), MON);
  assert.equal(recurrenceDueAt(reminder, '2026-10-13'), TUE);
  assert.equal(recurrenceDueAt(reminder, '2026-10-14'), null);
  assert.equal(nextReminderDueAt(reminder, MON - 1), MON);
  assert.equal(nextReminderDueAt(reminder, MON), TUE);
  assert.equal(nextReminderDueAt(reminder, TUE), MON + 7 * 86_400_000);
});

test('recurrence validation rejects empty, duplicated, unordered and non-ISO days and bad fields', () => {
  for (const weekdays of [[], [0], [8], [1, 1], [2, 1], [1.5]]) errorCode(() => validateReminderRecurrence(rule(weekdays)), 'invalid_recurrence');
  for (const change of [{ hour: -1 }, { hour: 24 }, { minute: 60 }, { minute: 1.5 }]) errorCode(() => validateReminderRecurrence({ ...rule(), ...change }), 'invalid_recurrence');
  errorCode(() => validateReminderRecurrence({ ...rule(), extra: true }), 'invalid_fields');
  errorCode(() => validateReminderRecurrence({ ...rule(), zone: 'Invalid/Timezone' }), 'invalid_zone');
  const f = setup(); errorCode(() => f.plan({ ...f.create(), id: f.nextId(), completionEntryId: f.nextId(), recurrence: undefined } as unknown as PlanningCommand), 'invalid_recurrence');
});

test('daily completion advances only once per calendar day; missed past days do not accumulate', () => {
  const f = setup(); const reminder = f.create(rule([1, 2, 3, 4, 5, 6, 7])); f.clock(MON);
  f.run({ type: 'createEntry', activityId: f.activityId }); f.run({ type: 'createEntry', activityId: f.activityId });
  let rows = deriveReminders(f.state(), MON);
  assert.deepEqual(rows.map(row => [row.dueAtMs, row.status]), [[MON, 'done'], [TUE, 'pending']]);
  const later = MON + 90 * 86_400_000; rows = deriveReminders(f.state(), later);
  assert.equal(rows.filter(row => row.status === 'pending' || row.status === 'overdue').length, 1);
  assert.equal(localDate(rows.find(row => row.status !== 'done')!.dueAtMs, 'America/Bogota'), localDate(later, 'America/Bogota'));
  assert.equal(rows[0].id, reminder.id); validateState(f.state());
});

test('a completed Tuesday chooses the following Monday; a later registration repairs a missed selected date', () => {
  const f = setup(); f.create(); f.clock(TUE); f.run({ type: 'createEntry', activityId: f.activityId });
  assert.equal(deriveReminders(f.state(), TUE).find(row => row.status !== 'done')!.dueAtMs, MON + 7 * 86_400_000);
  f.run({ type: 'createEntry', activityId: f.activityId, occurredAtMs: MON });
  assert.deepEqual(deriveReminders(f.state(), TUE).map(row => row.status), ['done', 'done', 'pending']);
});

test('one registration can complete only one competing series or one-off reminder', () => {
  const f = setup(); const first = f.create(null); const second = f.create(); f.clock(MON);
  f.run({ type: 'createEntry', activityId: f.activityId });
  const rows = deriveReminders(f.state(), MON);
  assert.equal(rows.find(row => row.id === first.id)!.status, 'done');
  assert.equal(rows.find(row => row.id === second.id)!.status, 'pending');
  f.run({ type: 'createEntry', activityId: f.activityId });
  assert.equal(deriveReminders(f.state(), MON).filter(row => row.status === 'done').length, 2);
});

test('void, restore and date correction recompute completed occurrences and reopen today', () => {
  const f = setup(); f.create(); f.clock(MON);
  const entryId = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!;
  f.run({ type: 'voidEntry', entryId }); assert.deepEqual(deriveReminders(f.state(), MON).map(row => [row.dueAtMs, row.status]), [[MON, 'pending']]);
  f.run({ type: 'restoreEntry', entryId }); assert.equal(deriveReminders(f.state(), MON)[0].status, 'done');
  f.run({ type: 'correctEntry', entryId, occurredAtMs: BASE }); assert.deepEqual(deriveReminders(f.state(), MON).map(row => [row.dueAtMs, row.status]), [[MON, 'pending']]);
  f.run({ type: 'correctEntry', entryId, occurredAtMs: MON - 3_600_000 }); assert.equal(deriveReminders(f.state(), MON)[0].status, 'done');
});

test('explicit links complete future occurrences early and remain unique across reminders', () => {
  const f = setup(); const reminder = f.create(); const other = f.create(); f.clock(BASE + 60_000);
  const entryId = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!;
  const command: PlanningCommand = { type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: TUE, entryId }; const operationId = f.nextId(); const first = f.plan(command, operationId);
  assert.equal(f.plan(command, operationId), first);
  assert.deepEqual(getPlanning(f.state()).occurrenceEntries, [{ reminderId: reminder.id, dueAtMs: TUE, entryId }]);
  assert.equal(deriveReminders(f.state(), BASE + 60_000).find(row => row.id === reminder.id && row.dueAtMs === TUE)!.status, 'done');
  errorCode(() => f.plan({ ...command, reminderId: other.id }), 'duplicate_occurrence');
  const another = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!;
  errorCode(() => f.plan({ ...command, entryId: another }), 'duplicate_occurrence');
  f.run({ type: 'voidEntry', entryId }); assert.equal(deriveReminders(f.state(), TUE).filter(row => row.status === 'done').length, 0);
  f.run({ type: 'restoreEntry', entryId }); assert.equal(deriveReminders(f.state(), TUE).find(row => row.id === reminder.id && row.dueAtMs === TUE)!.status, 'done'); validateState(f.state());
});

test('linked correction to another date reopens it and cannot complete two occurrences', () => {
  const f = setup(); const reminder = f.create(); f.clock(MON);
  const entryId = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!;
  f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, entryId });
  f.clock(TUE); f.run({ type: 'correctEntry', entryId, occurredAtMs: TUE });
  const rows = deriveReminders(f.state(), TUE); assert.equal(rows.filter(row => row.status === 'done').length, 1); assert.equal(rows.find(row => row.status === 'done')!.dueAtMs, TUE);
  validateState(f.state());
});

test('links reject wrong activities, pre-series entries, unavailable days and reserved completion IDs', () => {
  const f = setup(); const before = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!;
  f.clock(BASE + 60_000); const reminder = f.create();
  errorCode(() => f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, entryId: before }), 'invalid_occurrence_entry');
  const otherActivity = f.run({ type: 'createActivity', name: 'Otra', emoji: '🌿', color: '#6F5BFF' }).result.activityId!;
  const crossed = f.run({ type: 'createEntry', activityId: otherActivity }).result.entryId!;
  errorCode(() => f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, entryId: crossed }), 'invalid_occurrence_entry');
  const entryId = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!;
  errorCode(() => f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: TUE + 86_400_000, entryId }), 'invalid_occurrence');
  const oneOff = f.create(null); f.run({ type: 'createEntry', activityId: f.activityId, id: oneOff.completionEntryId });
  errorCode(() => f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, entryId: oneOff.completionEntryId }), 'duplicate_occurrence');
});

test('future completion skips several selected occurrences and does not duplicate a same-day registration', () => {
  const f = setup(); const reminder = f.create(); f.clock(MON);
  for (const dueAtMs of [MON, TUE]) { const entryId = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!; f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs, entryId }); }
  f.run({ type: 'createEntry', activityId: f.activityId });
  assert.deepEqual(deriveReminders(f.state(), MON).map(row => [row.dueAtMs, row.status]), [[MON, 'done'], [TUE, 'done'], [MON + 7 * 86_400_000, 'pending']]);
});

test('series edits keep historical link validation and archived series render one suspended row', () => {
  const f = setup(); const reminder = f.create(); f.clock(MON);
  const entryId = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!;
  f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, entryId });
  f.plan({ type: 'updateReminder', reminderId: reminder.id, changes: { recurrence: rule([2]) } });
  assert.equal(deriveReminders(f.state(), MON).find(row => row.dueAtMs === MON)!.status, 'done'); validateState(f.state());
  f.plan({ type: 'archiveReminder', reminderId: reminder.id, archived: true }); assert.deepEqual(deriveReminders(f.state(), TUE).map(row => row.status), ['archived']);
  f.plan({ type: 'archiveReminder', reminderId: reminder.id, archived: false }); f.plan({ type: 'updateReminder', reminderId: reminder.id, changes: { recurrence: null } });
  assert.equal(Object.hasOwn(getPlanning(f.state()).reminders[0], 'recurrence'), false); validateState(f.state());
});

test('DST gap advances to the first valid minute; later folds use the earliest instant', () => {
  const reminder = { dueAtMs: stamp('2026-03-01T07:30:00Z'), recurrence: { weekdays: [7], hour: 2, minute: 30, zone: 'America/New_York' } };
  assert.equal(recurrenceDueAt(reminder, '2026-03-08'), stamp('2026-03-08T07:00:00Z'));
  const folded = { dueAtMs: stamp('2026-10-25T05:30:00Z'), recurrence: { weekdays: [7], hour: 1, minute: 30, zone: 'America/New_York' } };
  assert.equal(recurrenceDueAt(folded, '2026-11-01'), stamp('2026-11-01T05:30:00Z'));
  const explicitLater = { ...folded, dueAtMs: stamp('2026-11-01T06:30:00Z') };
  assert.equal(recurrenceDueAt(explicitLater, '2026-11-01'), explicitLater.dueAtMs);
  assert.equal(nextReminderDueAt(explicitLater, explicitLater.dueAtMs), stamp('2026-11-08T06:30:00Z'));
});

test('series use their stored zone after settings change and respect the supported upper date', () => {
  const f = setup(); f.create(); f.clock(MON); f.run({ type: 'createEntry', activityId: f.activityId, occurredAtMs: MON - 8 * 3_600_000 });
  f.run({ type: 'updateSettings', changes: { zone: 'Pacific/Honolulu' } }); assert.equal(deriveReminders(f.state(), MON)[0].status, 'done');
  const last = stamp('9999-12-31T10:00:00Z'); assert.equal(nextReminderDueAt({ dueAtMs: last, recurrence: { ...rule([1, 2, 3, 4, 5, 6, 7]), zone: 'UTC' } }, last), null);
});

test('v3 roundtrip preserves recurrence audit even after removal; strict imports reject forged links and mismatched versions', async () => {
  const f = setup(); const reminder = f.create(); f.clock(MON); const entryId = f.run({ type: 'createEntry', activityId: f.activityId }).result.entryId!;
  f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, entryId });
  f.plan({ type: 'updateReminder', reminderId: reminder.id, changes: { recurrence: null } });
  const portable = await exportBackup(f.state(), { backupId: f.nextId(), exportedAtMs: MON, appVersion: '0.5.0' }, digest);
  assert.equal(JSON.parse(portable).formatVersion, 3); assert.deepEqual((await parseBackup(portable, digest)).state, JSON.parse(canonicalize(f.state())));
  for (const formatVersion of [1, 2]) await assert.rejects(parseBackup(await changed(portable, raw => { raw.formatVersion = formatVersion; }), digest), error => error instanceof DomainError && error.code === 'invalid_format');
  const mutations = [
    (raw: any) => { raw.payload.planning.events.find((event: any) => event.command.type === 'linkReminderOccurrence').command.dueAtMs += 60_000; },
    (raw: any) => { raw.payload.planning.events.find((event: any) => event.command.type === 'linkReminderOccurrence').command.entryId = uuid(9999); },
    (raw: any) => { raw.payload.planning.events.find((event: any) => event.command.type === 'createReminder').command.recurrence.weekdays = [1, 1]; },
  ];
  for (const mutate of mutations) await assert.rejects(parseBackup(await changed(portable, mutate), digest), DomainError);
  const legacy = setup(); legacy.create(null); const v2 = await exportBackup(legacy.state(), { backupId: legacy.nextId(), exportedAtMs: MON, appVersion: '0.5.0' }, digest);
  assert.equal(JSON.parse(v2).formatVersion, 2); await assert.rejects(parseBackup(await changed(v2, raw => { raw.formatVersion = 3; }), digest), error => error instanceof DomainError && error.code === 'invalid_format');
});

test('a missing selected civil day skips to the following selected week', () => {
  const reminder = { dueAtMs: stamp('2011-12-23T20:00:00Z'), recurrence: { weekdays: [5], hour: 10, minute: 0, zone: 'Pacific/Apia' } };
  assert.equal(nextReminderDueAt(reminder, reminder.dueAtMs), stamp('2012-01-05T20:00:00Z'));
});

test('frozen series caches change at their stored local midnight after settings move zones', () => {
  const f = setup(); f.create();
  f.run({ type: 'updateSettings', changes: { zone: 'Pacific/Honolulu' } });
  const freeze = (value: any): any => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }; freeze(f.state());
  const before = stamp('2026-10-13T04:59:59.999Z');
  assert.equal(deriveReminders(f.state(), before).find(row => row.status !== 'done')!.dueAtMs, MON);
  assert.equal(deriveReminders(f.state(), before + 1).find(row => row.status !== 'done')!.dueAtMs, TUE);
});
