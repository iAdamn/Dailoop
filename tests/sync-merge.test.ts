import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlanning, canonicalize, createEmptyState, execute, validateState, type Command, type DomainState, type PlanningCommand } from '../src/domain';
import { mergeSyncStates } from '../src/sync/merge';

const NOW = Date.parse('2026-10-15T17:00:00Z');
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function command(state: DomainState, value: Command, serial: number): DomainState {
  let count = serial + 1;
  return execute(state, value, { operationId: id(serial), nowMs: NOW, nextId: () => id(count++) }).state;
}
function planning(state: DomainState, value: PlanningCommand, serial: number): DomainState {
  return { ...state, planning: applyPlanning(state, value, { operationId: id(serial), nowMs: NOW, nextId: () => id(serial + 1) }) };
}
function base(): DomainState {
  return command(createEmptyState({ databaseId: id(1), nowMs: NOW }), { type: 'createActivity', name: 'Ajustes', emoji: '📚', color: '#6F5BFF', id: id(20) }, 10);
}
function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(frozen); }
  return value;
}
const divergent = { kind: 'conflict', reason: 'divergent-history' };

test('same and true append-only extension select a validated original state', () => {
  const original = base(); const next = command(original, { type: 'createEntry', activityId: id(20) }, 100);
  assert.deepEqual(mergeSyncStates(original, structuredClone(original)), { kind: 'same', state: original });
  assert.deepEqual(mergeSyncStates(original, next), { kind: 'remote', state: next });
  assert.deepEqual(mergeSyncStates(next, original), { kind: 'local', state: next });
});

test('independent entries merge losslessly, deterministically and without mutating frozen inputs', () => {
  const original = base();
  const a = frozen(command(original, { type: 'createEntry', activityId: id(20), note: 'local' }, 100));
  const b = frozen(command(original, { type: 'createEntry', activityId: id(20), note: 'remote' }, 200));
  const before = [canonicalize(a), canonicalize(b)];
  const result = mergeSyncStates(a, b); const reversed = mergeSyncStates(b, a);
  assert.equal(result.kind, 'merged'); assert.equal(reversed.kind, 'merged');
  assert.equal(canonicalize(result.state), canonicalize(reversed.state));
  assert.equal(result.state.entries.length, 2); assert.equal(result.state.entryRevisions.length, 2);
  assert.deepEqual(result.state.operations.map(row => row.sequence), [1, 2, 3]);
  assert.ok(result.state.entryRevisions.includes(a.entryRevisions[0]));
  assert.ok(result.state.entryRevisions.includes(b.entryRevisions[0]));
  validateState(result.state); assert.deepEqual([canonicalize(a), canonicalize(b)], before);
});

test('concurrent activity edits and concurrent entry corrections preserve both branches as conflict', () => {
  const original = base();
  assert.deepEqual(mergeSyncStates(command(original, { type: 'updateActivity', activityId: id(20), changes: { name: 'A' } }, 100), command(original, { type: 'updateActivity', activityId: id(20), changes: { name: 'B' } }, 200)), divergent);
  const withEntry = command(original, { type: 'createEntry', activityId: id(20), id: id(300) }, 100);
  assert.deepEqual(mergeSyncStates(command(withEntry, { type: 'correctEntry', entryId: id(300), note: 'A' }, 400), command(withEntry, { type: 'correctEntry', entryId: id(300), note: 'B' }, 500)), divergent);
});

test('concurrent activity creation cannot silently rebase original sortOrder audit', () => {
  const original = base();
  const a = command(original, { type: 'createActivity', name: 'A', emoji: '📚', color: '#6F5BFF' }, 100);
  const b = command(original, { type: 'createActivity', name: 'B', emoji: '📚', color: '#6F5BFF' }, 200);
  assert.deepEqual(mergeSyncStates(a, b), divergent);
});

test('settings on different keys combine; concurrent different values on one key conflict', () => {
  const original = base();
  const a = command(original, { type: 'updateSettings', changes: { theme: 'dark' } }, 100);
  const b = command(original, { type: 'updateSettings', changes: { hourFormat: '12h' } }, 200);
  const result = mergeSyncStates(a, b); assert.equal(result.kind, 'merged');
  assert.equal(result.state.settings.theme, 'dark'); assert.equal(result.state.settings.hourFormat, '12h'); validateState(result.state);
  const c = command(original, { type: 'updateSettings', changes: { theme: 'light' } }, 300);
  assert.deepEqual(mergeSyncStates(a, c), divergent);
});

test('independent planning creations combine; concurrent edits to one reminder conflict', () => {
  const original = base();
  const create = (n: number): PlanningCommand => ({ type: 'createReminder', id: id(n + 1), activityId: id(20), dueAtMs: NOW + 60_000, leadMinutes: [0], notifications: false, completionEntryId: id(n + 2) });
  const a = planning(original, create(100), 100); const b = planning(original, create(200), 200);
  const result = mergeSyncStates(a, b); assert.equal(result.kind, 'merged');
  assert.equal(result.state.planning!.events.length, 2); validateState(result.state);
  assert.deepEqual(mergeSyncStates(planning(a, { type: 'updateReminder', reminderId: id(101), changes: { dueAtMs: NOW + 120_000 } }, 300), planning(a, { type: 'archiveReminder', reminderId: id(101), archived: true }, 400)), divergent);
});

test('core and planning can advance independently without one false fast-forward dropping data', () => {
  const original = base();
  const a = command(original, { type: 'createEntry', activityId: id(20) }, 100);
  const b = planning(original, { type: 'setStreakAlerts', enabled: true, hour: 21, minute: 30 }, 200);
  const result = mergeSyncStates(a, b); assert.equal(result.kind, 'merged');
  assert.equal(result.state.entries.length, 1); assert.equal(result.state.planning!.events.length, 1); validateState(result.state);
});

test('different datasets, conflicting UUID payload and tampered states never fast-forward', () => {
  const original = base();
  const different = { ...original, meta: { ...original.meta, databaseId: id(999) } };
  assert.deepEqual(mergeSyncStates(original, different), { kind: 'conflict', reason: 'different-dataset' });
  const a = command(original, { type: 'createEntry', activityId: id(20), note: 'A' }, 100);
  const b = command(original, { type: 'createEntry', activityId: id(20), note: 'B' }, 100);
  assert.deepEqual(mergeSyncStates(a, b), { kind: 'conflict', reason: 'identity-collision' });
  const invalid = structuredClone(a); invalid.entryRevisions[0].note = 'tampered';
  assert.deepEqual(mergeSyncStates(original, invalid), divergent);
  const alteredSettings = { ...original, settings: { ...original.settings, zone: 'Europe/Madrid' } };
  validateState(alteredSettings);
  assert.deepEqual(mergeSyncStates(original, alteredSettings), divergent);
});

test('editing an activity alongside recording can conflict rather than altering historical snapshot', () => {
  const original = base();
  const a = command(original, { type: 'updateActivity', activityId: id(20), changes: { isArchived: true } }, 100);
  const b = command(original, { type: 'createEntry', activityId: id(20) }, 200);
  const result = mergeSyncStates(a, b);
  // Depending on deterministic operation order, preserving the original snapshot
  // is either representable or an explicit conflict. It must never rewrite it.
  if (result.kind !== 'conflict') { validateState(result.state); assert.equal(result.state.entryRevisions[0].activityRevisionId, original.activityRevisions[0].id); }
  else assert.deepEqual(result, divergent);
});
