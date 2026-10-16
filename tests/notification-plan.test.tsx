import { applyPlanning, createEmptyState, execute, type DomainState, type PlanningCommand } from '../src/domain';
import { notificationPlan } from '../src/infrastructure/notificationPlan';

const NOW = Date.parse('2026-10-14T17:00:00Z');
let serial = 0;
const nextId = () => `57000000-0000-4000-9000-${String(++serial).padStart(12, '0')}`;
const context = (nowMs = NOW) => ({ nowMs, operationId: nextId(), nextId });
function fixture(nowMs = NOW) {
  const state = createEmptyState({ databaseId: nextId(), nowMs: nowMs - 4 * 86_400_000, zone: 'America/Bogota' });
  return execute(state, { type: 'createActivity', name: 'Leer', emoji: '📖', color: '#DCCFFF' }, context(nowMs - 4 * 86_400_000)).state;
}
function planning(state: DomainState, command: PlanningCommand, nowMs = NOW): DomainState {
  return { ...state, planning: applyPlanning(state, command, context(nowMs)) };
}
function reminder(state: DomainState, dueAtMs = Date.parse('2026-10-16T17:00:00Z'), nowMs = NOW) {
  const command: PlanningCommand = { type: 'createReminder', id: nextId(), completionEntryId: nextId(), activityId: state.activities[0].id,
    dueAtMs, leadMinutes: [1440, 180, 60, 30], notifications: true };
  return { state: planning(state, command, nowMs), command };
}
function streak(state: DomainState) {
  let next = state;
  for (const occurredAtMs of ['2026-10-12T12:00:00Z', '2026-10-13T12:00:00Z'].map(Date.parse)) {
    next = execute(next, { type: 'createEntry', activityId: state.activities[0].id, occurredAtMs }, context()).state;
  }
  return planning(next, { type: 'setStreakAlerts', enabled: true, hour: 22, minute: 0 });
}

test('four chosen anticipations produce four distinct future local notifications and never mutate domain data', () => {
  const { state, command } = reminder(fixture());
  const original = JSON.stringify(state);
  const notifications = notificationPlan(state, NOW);
  expect(notifications.map(item => new Date(item.fireAtMs).toISOString())).toEqual([
    '2026-10-15T17:00:00.000Z', '2026-10-16T14:00:00.000Z', '2026-10-16T16:00:00.000Z', '2026-10-16T16:30:00.000Z',
  ]);
  expect(new Set(notifications.map(item => item.identifier)).size).toBe(4);
  expect(notifications.every(item => item.data.reminderId === command.id && item.data.databaseId === state.meta.databaseId)).toBe(true);
  expect(state.entries).toHaveLength(0);
  expect(JSON.stringify(state)).toBe(original);
});

test('a streak warning coinciding with a reminder for the same activity is sent only once', () => {
  let state = streak(fixture());
  state = planning(state, { type: 'createReminder', id: nextId(), completionEntryId: nextId(), activityId: state.activities[0].id,
    dueAtMs: Date.parse('2026-10-15T03:00:00Z'), leadMinutes: [0], notifications: true });
  const notifications = notificationPlan(state, NOW);
  expect(notifications).toHaveLength(1);
  expect(notifications[0].data.kind).toBe('reminder');
  expect(notifications[0].fireAtMs).toBe(Date.parse('2026-10-15T03:00:00Z'));
});

test('confirmed completion cancels reminder notifications; voiding the entry makes future notices eligible again', () => {
  const { state, command } = reminder(fixture());
  const completed = execute(state, { type: 'createEntry', activityId: command.activityId, id: command.completionEntryId }, context()).state;
  expect(notificationPlan(completed, NOW)).toEqual([]);
  const voided = execute(completed, { type: 'voidEntry', entryId: command.completionEntryId }, context(NOW + 1)).state;
  expect(notificationPlan(voided, NOW + 1).map(item => item.identifier)).toEqual(notificationPlan(state, NOW).map(item => item.identifier));
  expect(voided.entries).toHaveLength(1);
});

test('archiving the reminder or activity and switching off its notices removes pending notifications', () => {
  const { state, command } = reminder(fixture());
  const archived = planning(state, { type: 'archiveReminder', reminderId: command.id, archived: true });
  expect(notificationPlan(archived, NOW)).toEqual([]);
  const disabled = planning(state, { type: 'updateReminder', reminderId: command.id, changes: { notifications: false } });
  expect(notificationPlan(disabled, NOW)).toEqual([]);
  const archivedActivity = execute(streak(state), { type: 'updateActivity', activityId: command.activityId, changes: { isArchived: true } }, context()).state;
  expect(notificationPlan(archivedActivity, NOW)).toEqual([]);
});

test('changing zone replans streak warnings by wall clock while retaining the actual reminder instant', () => {
  const { state } = reminder(streak(fixture()));
  const before = notificationPlan(state, NOW);
  const changed = execute(state, { type: 'updateSettings', changes: { zone: 'UTC' } }, context()).state;
  const after = notificationPlan(changed, NOW);
  expect(before.find(item => item.data.kind === 'streak')?.fireAtMs).toBe(Date.parse('2026-10-15T03:00:00Z'));
  expect(after.find(item => item.data.kind === 'streak')?.fireAtMs).toBe(Date.parse('2026-10-14T22:00:00Z'));
  expect(after.filter(item => item.data.kind === 'reminder').map(item => item.fireAtMs)).toEqual(before.filter(item => item.data.kind === 'reminder').map(item => item.fireAtMs));
});

test('a zone change reevaluates the same-day association to a normal registration', () => {
  const nowMs = Date.parse('2026-10-15T01:00:00Z');
  const createdAt = Date.parse('2026-10-14T22:00:00Z');
  let state = fixture(createdAt);
  state = planning(state, { type: 'createReminder', id: nextId(), completionEntryId: nextId(), activityId: state.activities[0].id,
    dueAtMs: Date.parse('2026-10-15T03:00:00Z'), leadMinutes: [0], notifications: true }, createdAt);
  state = execute(state, { type: 'createEntry', activityId: state.activities[0].id, occurredAtMs: Date.parse('2026-10-14T23:30:00Z') }, context(nowMs)).state;
  expect(notificationPlan(state, nowMs)).toEqual([]);
  const changed = execute(state, { type: 'updateSettings', changes: { zone: 'UTC' } }, context(nowMs)).state;
  expect(notificationPlan(changed, nowMs).map(item => item.fireAtMs)).toEqual([Date.parse('2026-10-15T03:00:00Z')]);
  expect(changed.entries).toHaveLength(1);
});

test('expired anticipations are skipped rather than emitted in a burst after reopening the app', () => {
  const { state } = reminder(fixture());
  const nowMs = Date.parse('2026-10-16T15:30:00Z');
  expect(notificationPlan(state, nowMs).map(item => new Date(item.fireAtMs).toISOString())).toEqual([
    '2026-10-16T16:00:00.000Z', '2026-10-16T16:30:00.000Z',
  ]);
});


test('weekly rules schedule every chosen weekday and elapsed lead in their saved zone without a finite horizon', () => {
  const base = fixture();
  const command: PlanningCommand = { type: 'createReminder', id: nextId(), completionEntryId: nextId(), activityId: base.activities[0].id,
    dueAtMs: Date.parse('2026-10-19T14:00:00Z'), leadMinutes: [1440, 30], notifications: true,
    recurrence: { weekdays: [1, 2], hour: 9, minute: 0, zone: 'America/Bogota' } };
  const state = planning(base, command);
  const before = JSON.stringify(state);
  const plan = notificationPlan(state, NOW);
  expect(plan.map(item => new Date(item.fireAtMs).toISOString())).toEqual([
    '2026-10-18T14:00:00.000Z', '2026-10-19T13:30:00.000Z', '2026-10-19T14:00:00.000Z', '2026-10-20T13:30:00.000Z',
  ]);
  expect(plan.map(item => item.weekly?.weekday)).toEqual([2, 2, 3, 3]);
  expect(plan.every(item => item.weekly?.zone === 'America/Bogota' && item.weekly.startAtMs === command.dueAtMs)).toBe(true);
  const changed = execute(state, { type: 'updateSettings', changes: { zone: 'UTC' } }, context()).state;
  expect(notificationPlan(changed, NOW)).toEqual(plan);
  const distant = notificationPlan(state, Date.parse('2036-10-14T17:00:00Z'));
  expect(distant).toHaveLength(4);
  expect(distant.every(item => item.fireAtMs > Date.parse('2036-10-14T17:00:00Z'))).toBe(true);
  expect(JSON.stringify(state)).toBe(before);
});

test('native weekly plans canonicalize valid zone spellings without rewriting the saved recurrence',()=>{
  const base=fixture();
  const command:PlanningCommand={type:'createReminder',id:nextId(),completionEntryId:nextId(),activityId:base.activities[0].id,
    dueAtMs:Date.parse('2026-10-19T14:00:00Z'),leadMinutes:[0],notifications:true,
    recurrence:{weekdays:[1],hour:9,minute:0,zone:'america/BOGOTA'}};
  const state=planning(base,command),before=JSON.stringify(state);
  expect(notificationPlan(state,NOW)[0].weekly?.zone).toBe('America/Bogota');
  expect(JSON.stringify(state)).toBe(before);
});

test('completing a future recurring occurrence skips only that date; voiding re-enables it', () => {
  const base = fixture();
  const command: PlanningCommand = { type: 'createReminder', id: nextId(), completionEntryId: nextId(), activityId: base.activities[0].id,
    dueAtMs: Date.parse('2026-10-19T14:00:00Z'), leadMinutes: [0], notifications: true,
    recurrence: { weekdays: [1, 2], hour: 9, minute: 0, zone: 'America/Bogota' } };
  const state = planning(base, command);
  const entry = execute(state, { type: 'createEntry', activityId: command.activityId }, context());
  const completed = planning(entry.state, { type: 'linkReminderOccurrence', reminderId: command.id, dueAtMs: command.dueAtMs, entryId: entry.result.entryId! });
  const plan = notificationPlan(completed, NOW);
  expect(plan.find(item => item.weekly?.weekday === 2)?.fireAtMs).toBe(Date.parse('2026-10-26T14:00:00Z'));
  expect(plan.find(item => item.weekly?.weekday === 3)?.fireAtMs).toBe(Date.parse('2026-10-20T14:00:00Z'));
  expect(plan.every(item => item.weekly?.skipDates.includes('2026-10-19'))).toBe(true);
  const voided = execute(completed, { type: 'voidEntry', entryId: entry.result.entryId! }, context(NOW + 1)).state;
  expect(notificationPlan(voided, NOW + 1).find(item => item.weekly?.weekday === 2)?.fireAtMs).toBe(command.dueAtMs);
});
