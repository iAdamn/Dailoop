/** Reproducible selector benchmark: npx tsx tests/streaks-performance.ts. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { activityStreaks, calendarDayCount, canonicalize, createEmptyState, effectiveEntries, execute, localDate, type ActivityStreak, type DomainState } from '../src/domain';

const NOW = Date.parse('2026-10-14T17:00:00Z');
const LAST = Date.parse('2026-10-14T16:00:00Z');
let serial = 1;
const nextId = (): string => `70000000-0000-4000-8000-${String(serial++).padStart(12, '0')}`;
function freeze(state: DomainState): DomainState {
  for (const table of ['activities', 'activityRevisions', 'entries', 'entryRevisions', 'operations'] as const) { state[table].forEach(Object.freeze); Object.freeze(state[table]); }
  Object.freeze(state.meta); Object.freeze(state.settings); return Object.freeze(state);
}
function fixture(): DomainState {
  const state = createEmptyState({ databaseId: nextId(), nowMs: LAST - 1000 * 86_400_000 });
  for (let activityIndex = 0; activityIndex < 100; activityIndex++) {
    const id = nextId(); const operationId = nextId(); const revisionId = nextId(); const createdAtMs = state.meta.createdAtMs;
    const command = { type: 'createActivity' as const, id, name: `Actividad ${activityIndex}`, emoji: '📚', color: '#6F5BFF' as const };
    state.activities.push({ id, createdAtMs });
    state.activityRevisions.push({ id: revisionId, activityId: id, revisionNo: 1, previousRevisionId: null, operationId, recordedAtMs: createdAtMs, name: command.name, emoji: command.emoji, color: command.color, isPrivate: false, isArchived: false, sortOrder: activityIndex, category: null });
    state.operations.push({ id: operationId, kind: 'createActivity', sequence: state.operations.length + 1, recordedAtMs: createdAtMs, intent: canonicalize(command), entityId: id });
  }
  for (let day = 0; day < 1000; day++) for (let activityIndex = 0; activityIndex < 100; activityIndex++) {
    const activity = state.activities[activityIndex]; const id = nextId(); const operationId = nextId(); const revisionId = nextId(); const occurredAtMs = LAST - (999 - day) * 86_400_000 + activityIndex * 1000;
    const command = { type: 'createEntry' as const, activityId: activity.id, id, occurredAtMs };
    state.entries.push({ id, activityId: activity.id, createdAtMs: NOW, creationOperationId: operationId });
    state.entryRevisions.push({ id: revisionId, entryId: id, revisionNo: 1, previousRevisionId: null, operationId, kind: 'create', occurredAtMs, occurredZone: 'America/Bogota', occurredOffsetMinutes: -300, occurredOffsetSeconds: -18_000, note: '', state: 'active', activityRevisionId: state.activityRevisions[activityIndex].id, recordedAtMs: NOW, reason: '' });
    state.operations.push({ id: operationId, kind: 'createEntry', sequence: state.operations.length + 1, recordedAtMs: NOW, intent: canonicalize(command), entityId: id });
  }
  return freeze(state);
}
function original(state: DomainState, nowMs: number): Map<string, ActivityStreak> {
  const today = localDate(nowMs, state.settings.zone); const datesByActivity = new Map<string, Set<string>>();
  for (const entry of effectiveEntries(state)) {
    if (entry.revision.occurredAtMs > nowMs) continue;
    const dates = datesByActivity.get(entry.activityId) ?? new Set<string>(); dates.add(localDate(entry.revision.occurredAtMs, state.settings.zone)); datesByActivity.set(entry.activityId, dates);
  }
  return new Map(state.activities.map(activity => {
    const dates = [...(datesByActivity.get(activity.id) ?? [])].sort().reverse(); const lastDate = dates[0] ?? null; let days = 0;
    if (lastDate && calendarDayCount(lastDate, today) <= 2) { days = 1; while (days < dates.length && calendarDayCount(dates[days], dates[days - 1]) === 2) days++; }
    return [activity.id, { days, recordedToday: lastDate === today, lastDate }] as const;
  }));
}
function measured<T>(run: () => T): { value: T; ms: number; intlCalls: number } {
  const old = Intl.DateTimeFormat.prototype.formatToParts; let intlCalls = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) { intlCalls++; return old.apply(this, args); };
  const start = performance.now();
  try { const value = run(); return { value, ms: performance.now() - start, intlCalls }; }
  finally { Intl.DateTimeFormat.prototype.formatToParts = old; }
}
const state = fixture();
const baseline = measured(() => original(state, NOW));
const cold = measured(() => activityStreaks(state, NOW)); assert.deepEqual(cold.value, baseline.value);
const ticks = measured(() => { for (let index = 1; index <= 200; index++) assert.deepEqual(activityStreaks(state, NOW + index * 15_000), baseline.value); }); assert.equal(ticks.intlCalls, 200);
const reversed = measured(() => activityStreaks(state, LAST - 1000)); assert.equal(reversed.value.get(state.activities[0].id)!.days, 999);
const nextDay = measured(() => activityStreaks(state, Date.parse('2026-10-15T05:00:00Z'))); assert.equal(nextDay.value.get(state.activities[0].id)!.days, 1000);
let updated = state; const updates: { ms: number; intlCalls: number }[] = [];
for (let index = 0; index < 6; index++) {
  const result = execute(updated, { type: 'createEntry', activityId: updated.activities[index].id }, { nowMs: NOW + index, operationId: nextId(), nextId });
  updated = freeze(result.state);
  const sample = measured(() => activityStreaks(updated, NOW + index)); assert.equal(sample.value.get(updated.activities[index].id)!.days, 1000); assert.equal(sample.intlCalls, 2); updates.push({ ms: sample.ms, intlCalls: sample.intlCalls });
}
const round = (value: number) => Math.round(value * 1000) / 1000;
console.log(JSON.stringify({ runtime: process.version, activities: 100, entries: 100_000, distinctDaysPerActivity: 1000, baseline: { ms: round(baseline.ms), intlCalls: baseline.intlCalls }, indexedCold: { ms: round(cold.ms), intlCalls: cold.intlCalls }, clockTicks: { count: 200, totalMs: round(ticks.ms), averageMs: round(ticks.ms / 200), intlCalls: ticks.intlCalls }, sameDayClockReversal: { ms: round(reversed.ms), intlCalls: reversed.intlCalls }, nextLocalMidnight: { ms: round(nextDay.ms), intlCalls: nextDay.intlCalls }, newDataSnapshots: updates.map(item => ({ ms: round(item.ms), intlCalls: item.intlCalls })) }, null, 2));
