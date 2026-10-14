import assert from 'node:assert/strict';
import test from 'node:test';
import { activityStreaks, canonicalize, createEmptyState, execute, type Command, type DomainState } from '../src/domain';

const uuid = (n: number): string => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function setup(nowIso = '2026-10-14T17:00:00Z', zone = 'America/Bogota') {
  let serial = 1; let now = Date.parse(nowIso); let state = createEmptyState({ databaseId: uuid(serial++), nowMs: now, zone });
  const nextId = () => uuid(serial++);
  const run = (command: Command) => { const result = execute(state, command, { nowMs: now, operationId: nextId(), nextId }); state = result.state; return result; };
  const activityId = run({ type: 'createActivity', name: 'Leer', emoji: '📚', color: '#6F5BFF' }).result.activityId!;
  const entry = (iso: string) => run({ type: 'createEntry', activityId, occurredAtMs: Date.parse(iso) }).result.entryId!;
  return { run, entry, activityId, state: () => state, streak: () => activityStreaks(state, now).get(activityId)!, clock: (iso: string) => { now = Date.parse(iso); } };
}

test('seven same-day occurrences count one day; only distinct consecutive days extend the streak', () => {
  const f = setup(); assert.deepEqual(f.streak(), { days: 0, recordedToday: false, lastDate: null });
  for (let index = 0; index < 7; index++) f.entry('2026-10-14T16:00:00Z'); assert.deepEqual(f.streak(), { days: 1, recordedToday: true, lastDate: '2026-10-14' });
  f.entry('2026-10-13T16:00:00Z'); f.entry('2026-10-12T16:00:00Z'); assert.equal(f.streak().days, 3); assert.equal(f.state().entries.length, 9);
});

test('yesterday stays alive throughout today and a missed local day breaks the chain', () => {
  const f = setup(); f.entry('2026-10-12T16:00:00Z'); f.entry('2026-10-13T16:00:00Z'); assert.deepEqual(f.streak(), { days: 2, recordedToday: false, lastDate: '2026-10-13' });
  f.clock('2026-10-15T04:59:59Z'); assert.equal(f.streak().days, 2); f.clock('2026-10-15T05:00:00Z'); assert.equal(f.streak().days, 0);
  f.entry('2026-10-15T05:00:00Z'); assert.deepEqual(f.streak(), { days: 1, recordedToday: true, lastDate: '2026-10-15' });
});

test('void, restore and time correction recalculate the flame from the effective audit', () => {
  const f = setup(); f.entry('2026-10-12T16:00:00Z'); const middle = f.entry('2026-10-13T16:00:00Z'); f.entry('2026-10-14T16:00:00Z'); assert.equal(f.streak().days, 3);
  f.run({ type: 'voidEntry', entryId: middle }); assert.equal(f.streak().days, 1); f.run({ type: 'restoreEntry', entryId: middle }); assert.equal(f.streak().days, 3);
  f.run({ type: 'correctEntry', entryId: middle, occurredAtMs: Date.parse('2026-10-11T16:00:00Z') }); assert.equal(f.streak().days, 1); assert.equal(f.state().entries.length, 3);
});

test('device clock reversal excludes future effective entries from streaks', () => {
  const f = setup(); f.entry('2026-10-13T16:00:00Z'); f.entry('2026-10-14T16:00:00Z'); f.clock('2026-10-13T17:00:00Z');
  assert.deepEqual(f.streak(), { days: 1, recordedToday: true, lastDate: '2026-10-13' });
});

test('local days and timezone changes regroup dates without rewriting history', () => {
  const f = setup('2026-10-14T17:00:00Z'); f.entry('2026-10-13T23:30:00Z'); f.entry('2026-10-14T01:00:00Z'); const audit = canonicalize(f.state().entryRevisions);
  assert.deepEqual(f.streak(), { days: 1, recordedToday: false, lastDate: '2026-10-13' });
  f.run({ type: 'updateSettings', changes: { zone: 'UTC' } }); assert.deepEqual(f.streak(), { days: 2, recordedToday: true, lastDate: '2026-10-14' }); assert.equal(canonicalize(f.state().entryRevisions), audit);
});

test('23-hour and 25-hour DST days still contribute exactly one day each', () => {
  const spring = setup('2026-03-09T18:00:00Z', 'America/New_York'); spring.entry('2026-03-07T18:00:00Z'); spring.entry('2026-03-08T17:00:00Z'); spring.entry('2026-03-09T17:00:00Z'); assert.equal(spring.streak().days, 3);
  const fall = setup('2026-11-02T18:00:00Z', 'America/New_York'); fall.entry('2026-10-31T17:00:00Z'); fall.entry('2026-11-01T05:30:00Z'); fall.entry('2026-11-01T06:30:00Z'); fall.entry('2026-11-02T17:00:00Z'); assert.equal(fall.streak().days, 3);
});

test('independent activities and a date gap do not inherit another activity streak', () => {
  const f = setup(); f.entry('2026-10-12T17:00:00Z'); f.entry('2026-10-14T16:00:00Z'); const other = f.run({ type: 'createActivity', name: 'Caminar', emoji: '🚶', color: '#6F5BFF' }).result.activityId!;
  assert.equal(f.streak().days, 1); assert.deepEqual(activityStreaks(f.state(), Date.parse('2026-10-14T17:00:00Z')).get(other), { days: 0, recordedToday: false, lastDate: null });
});

function freeze(state: DomainState): DomainState {
  for (const table of ['activities', 'activityRevisions', 'entries', 'entryRevisions', 'operations'] as const) { state[table].forEach(Object.freeze); Object.freeze(state[table]); }
  Object.freeze(state.meta); Object.freeze(state.settings); return Object.freeze(state);
}
function countIntl(run: () => void): number {
  const original = Intl.DateTimeFormat.prototype.formatToParts; let calls = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) { calls++; return original.apply(this, args); };
  try { run(); return calls; } finally { Intl.DateTimeFormat.prototype.formatToParts = original; }
}
test('frozen snapshots reuse day indexes on clock ticks without exposing a mutable cache', () => {
  const f = setup(); f.entry('2026-10-12T16:00:00Z'); f.entry('2026-10-13T16:00:00Z'); f.entry('2026-10-14T16:00:00Z'); const state = freeze(f.state()); const now = Date.parse('2026-10-14T17:00:00Z');
  activityStreaks(state, now);
  assert.equal(countIntl(() => { const result = activityStreaks(state, now + 15_000); result.get(f.activityId)!.days = 900; result.delete(f.activityId); }), 1);
  assert.equal(activityStreaks(state, now + 30_000).get(f.activityId)!.days, 3);
  assert.equal(countIntl(() => activityStreaks(state, now + 45_000)), 1);
});

test('cached indexes respect a same-day clock reversal and a later local midnight', () => {
  const f = setup(); f.entry('2026-10-12T16:00:00Z'); f.entry('2026-10-13T16:00:00Z'); f.entry('2026-10-14T16:00:00Z'); const state = freeze(f.state());
  assert.equal(activityStreaks(state, Date.parse('2026-10-14T17:00:00Z')).get(f.activityId)!.days, 3);
  assert.deepEqual(activityStreaks(state, Date.parse('2026-10-14T15:00:00Z')).get(f.activityId), { days: 2, recordedToday: false, lastDate: '2026-10-13' });
  assert.equal(activityStreaks(state, Date.parse('2026-10-14T16:00:00Z')).get(f.activityId)!.days, 3);
  assert.equal(activityStreaks(state, Date.parse('2026-10-16T05:00:00Z')).get(f.activityId)!.days, 0);
});

test('new immutable snapshots reuse unchanged revision days but invalidate corrected or void data', () => {
  const f = setup(); f.entry('2026-10-12T16:00:00Z'); const middle = f.entry('2026-10-13T16:00:00Z'); f.entry('2026-10-14T16:00:00Z'); const first = freeze(f.state()); const now = Date.parse('2026-10-14T17:00:00Z');
  activityStreaks(first, now); f.run({ type: 'correctEntry', entryId: middle, occurredAtMs: Date.parse('2026-10-11T16:00:00Z') });
  const corrected = freeze(f.state()); const calls = countIntl(() => assert.equal(activityStreaks(corrected, now).get(f.activityId)!.days, 1)); assert.equal(calls, 2);
  f.run({ type: 'voidEntry', entryId: middle }); const voided = freeze(f.state()); assert.equal(activityStreaks(voided, now).get(f.activityId)!.days, 1);
  f.run({ type: 'updateSettings', changes: { zone: 'UTC' } }); const changedZone = freeze(f.state()); assert.equal(countIntl(() => activityStreaks(changedZone, now)), 3);
});

test('unfrozen and shallow-frozen inputs remain correct when a row changes in place', () => {
  for (const shallow of [false, true]) {
    const f = setup(); f.entry('2026-10-13T16:00:00Z'); const mutable = f.state(); if (shallow) Object.freeze(mutable);
    assert.equal(activityStreaks(mutable, Date.parse('2026-10-14T17:00:00Z')).get(f.activityId)!.days, 1);
    mutable.entryRevisions[0].occurredAtMs = Date.parse('2026-10-11T16:00:00Z');
    assert.equal(activityStreaks(mutable, Date.parse('2026-10-14T17:00:00Z')).get(f.activityId)!.days, 0);
  }
});
