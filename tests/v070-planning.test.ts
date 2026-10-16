import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyPlanning, canonicalize, createEmptyState, deriveReminders, DomainError, execute, exportBackup, getPlanning, parseBackup, pendingReminderOccurrence, recurrenceDueAt, validateState, type Command, type PlanningCommand, type ReminderRecurrence } from '../src/domain';
import { notificationPlan, resolveNotificationOccurrence } from '../src/infrastructure/notificationPlan';

const stamp = (value: string): number => Date.parse(value);
const BASE = stamp('2026-10-11T15:00:00Z');
const MON = stamp('2026-10-12T15:00:00Z');
const TUE = stamp('2026-10-13T15:00:00Z');
const uuid = (n: number): string => `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const digest = async (text: string): Promise<string> => createHash('sha256').update(text, 'utf8').digest('hex');
function setup(start = BASE) {
  let serial = 1; let now = start; let state = createEmptyState({ databaseId: uuid(serial++), nowMs: now });
  const nextId = (): string => uuid(serial++);
  const run = (command: Command) => { const result = execute(state, command, { nowMs: now, operationId: nextId(), nextId }); state = result.state; return result; };
  const plan = (command: PlanningCommand, operationId = nextId()) => { state = { ...state, planning: applyPlanning(state, command, { nowMs: now, operationId, nextId }) }; return state.planning!; };
  const activityId = run({ type: 'createActivity', name: 'Leer', emoji: '📚', color: '#6F5BFF' }).result.activityId!;
  const create = (recurrence: ReminderRecurrence | null = { weekdays: [1, 2], hour: 10, minute: 0, zone: 'America/Bogota' }, dueAtMs = MON) => {
    const command: PlanningCommand & { type: 'createReminder' } = { type: 'createReminder', id: nextId(), activityId, dueAtMs, leadMinutes: [30, 0], notifications: true, completionEntryId: nextId(), ...(recurrence ? { recurrence } : {}) };
    plan(command); return command;
  };
  return { run, plan, create, activityId, nextId, state: () => state, clock: (value: number) => { now = value; } };
}
function errorCode(fn: () => unknown, code: string): void { assert.throws(fn, error => error instanceof DomainError && error.code === code); }

test('snooze retains exact occurrence identity, emits one later alert and creates no entry', () => {
  const f = setup(); const reminder = f.create(null); f.clock(MON);
  const coreBefore = canonicalize({ entries: f.state().entries, operations: f.state().operations, revisions: f.state().entryRevisions });
  const command = { type: 'snoozeReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, snoozedUntilMs: MON + 30 * 60_000 } as PlanningCommand;
  const operationId = f.nextId(); const first = f.plan(command, operationId);
  assert.equal(f.plan(command, operationId), first);
  const row = deriveReminders(f.state(), MON)[0];
  assert.equal(row.dueAtMs, MON); assert.equal(row.scheduledAtMs, MON + 30 * 60_000); assert.equal(row.status, 'pending');
  const alerts = notificationPlan(f.state(), MON);
  assert.equal(alerts.length, 1); assert.equal(alerts[0].fireAtMs, MON + 30 * 60_000); assert.equal(alerts[0].data.dueAtMs, MON);
  assert.equal(canonicalize({ entries: f.state().entries, operations: f.state().operations, revisions: f.state().entryRevisions }), coreBefore);
  validateState(f.state());
});

test('skip omits exactly one selected day without recording or archiving the series', () => {
  const f = setup(); const reminder = f.create(); f.clock(MON);
  const command: PlanningCommand = { type: 'skipReminderOccurrence', reminderId: reminder.id, dueAtMs: MON };
  const operationId = f.nextId(); const first = f.plan(command, operationId);
  assert.deepEqual(deriveReminders(f.state(), MON).map(row => [row.dueAtMs, row.status]), [[MON, 'skipped'], [TUE, 'pending']]);
  assert.equal(f.state().entries.length, 0); assert.equal(f.state().operations.length, 1);
  assert.equal(getPlanning(f.state()).reminders[0].isArchived, false);
  assert.equal(pendingReminderOccurrence(f.state(), reminder.id, MON, MON), null);
  const plan = notificationPlan(f.state(), MON - 1);
  assert(plan.every(alert => alert.weekly?.skipDates.includes('2026-10-12')));
  assert(!plan.some(alert => alert.fireAtMs === MON));
  f.clock(TUE); assert.equal(f.plan(command, operationId), first);
  errorCode(() => f.plan(command), 'stale_occurrence');
  f.plan({ type: 'archiveReminder', reminderId: reminder.id, archived: true });
  f.plan({ type: 'archiveReminder', reminderId: reminder.id, archived: false });
  f.run({ type: 'createEntry', activityId: reminder.activityId, occurredAtMs: MON });
  assert.equal(deriveReminders(f.state(), TUE).find(row => row.dueAtMs === MON)?.status, 'skipped');
  validateState(f.state());
});

test('a superseding snooze cancels its previous alert; skipping cancels only that occurrence', () => {
  const f = setup(); const reminder = f.create(null); f.clock(MON);
  f.plan({ type: 'snoozeReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, snoozedUntilMs: MON + 60 * 60_000 });
  const oldAlert = notificationPlan(f.state(), MON)[0];
  f.clock(MON + 60_000);
  f.plan({ type: 'snoozeReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, snoozedUntilMs: MON + 11 * 60_000 });
  const replacement = notificationPlan(f.state(), MON + 60_000);
  assert.equal(replacement.length, 1); assert.equal(replacement[0].fireAtMs, MON + 11 * 60_000);
  assert.equal(resolveNotificationOccurrence(oldAlert.data, oldAlert.fireAtMs, f.state()), null);
  assert.deepEqual(resolveNotificationOccurrence(replacement[0].data, replacement[0].fireAtMs, f.state()), { reminderId: reminder.id, dueAtMs: MON });
  f.plan({ type: 'skipReminderOccurrence', reminderId: reminder.id, dueAtMs: MON });
  assert.deepEqual(notificationPlan(f.state(), MON + 60_000), []);
  assert.equal(resolveNotificationOccurrence(replacement[0].data, replacement[0].fireAtMs, f.state()), null);
  assert.equal(f.state().entries.length, 0); validateState(f.state());
});

test('a recurring snooze survives midnight and a later completion binds the original occurrence', () => {
  const start = stamp('2026-10-11T22:00:00Z'); const due = stamp('2026-10-11T23:50:00Z'); const until = stamp('2026-10-12T00:20:00Z');
  const f = setup(start); const reminder = f.create({ weekdays: [1, 2, 3, 4, 5, 6, 7], hour: 23, minute: 50, zone: 'UTC' }, due);
  f.clock(due); f.plan({ type: 'snoozeReminderOccurrence', reminderId: reminder.id, dueAtMs: due, snoozedUntilMs: until });
  f.clock(until);
  const pending = pendingReminderOccurrence(f.state(), reminder.id, due, until);
  assert.equal(pending?.scheduledAtMs, until);
  assert.deepEqual(deriveReminders(f.state(), until).map(row => [row.dueAtMs, row.status]), [[due, 'pending'], [due + 86_400_000, 'pending']]);
  const entryId = f.run({ type: 'createEntry', activityId: reminder.activityId }).result.entryId!;
  f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: due, entryId });
  assert.equal(deriveReminders(f.state(), until).find(row => row.dueAtMs === due)?.completedEntryId, entryId);
  assert.equal(pendingReminderOccurrence(f.state(), reminder.id, due, until), null);
  assert.equal(f.state().entries.length, 1);
  f.run({ type: 'voidEntry', entryId }); assert.equal(pendingReminderOccurrence(f.state(), reminder.id, due, until)?.scheduledAtMs, until);
  f.run({ type: 'restoreEntry', entryId }); assert.equal(pendingReminderOccurrence(f.state(), reminder.id, due, until), null);
  validateState(f.state());
});

test('stale, archived, completed and mismatched occurrence actions never touch core entries', () => {
  const f = setup(); const reminder = f.create(); f.clock(MON);
  errorCode(() => f.plan({ type: 'skipReminderOccurrence', reminderId: reminder.id, dueAtMs: MON + 60_000 }), 'stale_occurrence');
  errorCode(() => f.plan({ type: 'snoozeReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, snoozedUntilMs: MON }), 'past_snooze');
  f.clock(TUE);
  errorCode(() => f.plan({ type: 'skipReminderOccurrence', reminderId: reminder.id, dueAtMs: MON }), 'stale_occurrence');
  assert.equal(pendingReminderOccurrence(f.state(), reminder.id, MON, TUE), null);
  assert.equal(pendingReminderOccurrence(f.state(), reminder.id, TUE, TUE)?.dueAtMs, TUE);
  f.plan({ type: 'archiveReminder', reminderId: reminder.id, archived: true });
  errorCode(() => f.plan({ type: 'skipReminderOccurrence', reminderId: reminder.id, dueAtMs: TUE }), 'stale_occurrence');
  f.plan({ type: 'archiveReminder', reminderId: reminder.id, archived: false });
  const entryId = f.run({ type: 'createEntry', activityId: reminder.activityId }).result.entryId!;
  f.plan({ type: 'linkReminderOccurrence', reminderId: reminder.id, dueAtMs: TUE, entryId });
  errorCode(() => f.plan({ type: 'skipReminderOccurrence', reminderId: reminder.id, dueAtMs: TUE }), 'stale_occurrence');
  assert.equal(f.state().entries.length, 1); validateState(f.state());
});

test('new action audit selects backup4, roundtrips exactly and rejects resealed invalid action times', async () => {
  const f = setup(); const reminder = f.create(); const options = { backupId: f.nextId(), exportedAtMs: TUE, appVersion: '0.7.0' };
  const legacy = await exportBackup(f.state(), options, digest); assert.equal(JSON.parse(legacy).formatVersion, 3);
  f.clock(MON); f.plan({ type: 'snoozeReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, snoozedUntilMs: MON + 30 * 60_000 });
  const portable = await exportBackup(f.state(), options, digest); assert.equal(JSON.parse(portable).formatVersion, 4);
  assert.equal(canonicalize((await parseBackup(portable, digest)).state), canonicalize(f.state()));
  const raw = JSON.parse(portable); raw.formatVersion = 3;
  await assert.rejects(parseBackup(JSON.stringify(raw), digest), error => error instanceof DomainError && error.code === 'invalid_format');
  raw.formatVersion = 4; raw.payload.planning.events[1].command.snoozedUntilMs = MON;
  raw.digest = await digest(canonicalize(raw.payload));
  await assert.rejects(parseBackup(JSON.stringify(raw), digest), error => error instanceof DomainError && error.code === 'past_snooze');
  assert.equal(canonicalize((await parseBackup(legacy, digest)).state), canonicalize({ ...f.state(), planning: { events: f.state().planning!.events.slice(0, 1) } }));
});

test('DST gap snooze uses elapsed minutes and keeps the original selected civil occurrence', () => {
  const f = setup(stamp('2026-03-07T12:00:00Z')); const due = stamp('2026-03-08T07:00:00Z');
  const reminder = f.create({ weekdays: [7], hour: 2, minute: 30, zone: 'America/New_York' }, due);
  assert.equal(recurrenceDueAt(reminder, '2026-03-08'), due);
  const alert = notificationPlan(f.state(), stamp('2026-03-08T06:00:00Z')).find(item => item.data.leadMinutes === 30)!;
  assert.deepEqual(resolveNotificationOccurrence(alert.data, stamp('2026-03-08T06:30:00Z'), f.state()), { reminderId: reminder.id, dueAtMs: due });
  f.clock(due); f.plan({ type: 'snoozeReminderOccurrence', reminderId: reminder.id, dueAtMs: due, snoozedUntilMs: due + 30 * 60_000 });
  const plan = notificationPlan(f.state(), due); const snoozed = plan.find(item => item.data.scheduledAtMs !== undefined)!;
  assert.equal(snoozed.fireAtMs, stamp('2026-03-08T07:30:00Z')); assert.equal(snoozed.data.dueAtMs, due);
  assert(plan.filter(item => item.weekly).every(item => item.weekly!.skipDates.includes('2026-03-08'))); validateState(f.state());
});

test('weekly action resolution uses delivery date across later repeats and rejects old schedule metadata', () => {
  const f = setup(); const reminder = f.create();
  const original = notificationPlan(f.state(), BASE).find(item => item.data.recurrenceWeekday === 1 && item.data.leadMinutes === 0)!;
  const secondMonday = MON + 7 * 86_400_000;
  assert.equal(original.data.dueAtMs, MON);
  assert.deepEqual(resolveNotificationOccurrence(original.data, secondMonday, f.state()), { reminderId: reminder.id, dueAtMs: secondMonday });
  assert.equal(pendingReminderOccurrence(f.state(), reminder.id, secondMonday, secondMonday + 86_400_000), null);
  assert.equal(resolveNotificationOccurrence({ ...original.data, databaseId: f.nextId() }, secondMonday, f.state()), null);
  assert.equal(resolveNotificationOccurrence(original.data, secondMonday + 3 * 3_600_000, f.state()), null);
  f.plan({ type: 'updateReminder', reminderId: reminder.id, changes: { recurrence: { weekdays: [1, 2], hour: 11, minute: 0, zone: 'America/Bogota' } } });
  assert.equal(resolveNotificationOccurrence(original.data, secondMonday, f.state()), null);
  assert.equal(f.state().entries.length, 0); validateState(f.state());
});

test('schedule edits invalidate old snooze projection without rewriting its audit', () => {
  const f = setup(); const reminder = f.create(null); f.clock(MON);
  f.plan({ type: 'snoozeReminderOccurrence', reminderId: reminder.id, dueAtMs: MON, snoozedUntilMs: MON + 30 * 60_000 });
  const oldAction = canonicalize(f.state().planning!.events[1]);
  f.plan({ type: 'updateReminder', reminderId: reminder.id, changes: { dueAtMs: TUE } });
  const row = deriveReminders(f.state(), MON)[0]; assert.equal(row.dueAtMs, TUE); assert.equal(row.scheduledAtMs, undefined);
  assert.equal(canonicalize(f.state().planning!.events[1]), oldAction);
  assert.equal(pendingReminderOccurrence(f.state(), reminder.id, MON, MON), null); validateState(f.state());
});
