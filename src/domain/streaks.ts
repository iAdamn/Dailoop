import { effectiveEntries } from './core';
import { localDate } from './time';
import { type ActivityStreak, type DomainState, type EntryRevision } from './types';
import { assertTime } from './validation';

interface Day { date: string; ordinal: number; firstOccurredAtMs: number; consecutive: number }
interface StreakIndex {
  zone: string;
  activities: Map<string, { days: Day[]; chronological: boolean }>;
  frontiers: number[];
  result?: { today: string; frontier: number; streaks: Map<string, ActivityStreak> };
}
const indexes = new WeakMap<DomainState, StreakIndex>();
const revisionDays = new WeakMap<EntryRevision, { zone: string; date: string; ordinal: number }>();
const DAY_MS = 86_400_000;
const ordinal = (date: string): number => Date.parse(`${date}T00:00:00.000Z`) / DAY_MS;

function upperBound(values: readonly number[], value: number): number {
  let low = 0; let high = values.length;
  while (low < high) { const middle = (low + high) >>> 1; if (values[middle] <= value) low = middle + 1; else high = middle; }
  return low;
}
/** Only fully frozen domain snapshots can safely survive another selector call. */
function immutable(state: DomainState): boolean {
  return Object.isFrozen(state) && Object.isFrozen(state.settings) &&
    (['activities', 'activityRevisions', 'entries', 'entryRevisions', 'operations'] as const).every(table => Object.isFrozen(state[table]) && state[table].every(Object.isFrozen));
}
function dayOf(revision: EntryRevision, zone: string): { date: string; ordinal: number } {
  const cached = revisionDays.get(revision);
  if (cached?.zone === zone) return cached;
  const date = localDate(revision.occurredAtMs, zone); const result = { zone, date, ordinal: ordinal(date) };
  // Sharing frozen revisions between consecutive snapshots avoids repeating Intl for old rows.
  if (Object.isFrozen(revision)) revisionDays.set(revision, result);
  return result;
}
function buildIndex(state: DomainState): StreakIndex {
  const datesByActivity = new Map<string, Map<number, Day>>();
  for (const entry of effectiveEntries(state)) {
    const day = dayOf(entry.revision, state.settings.zone);
    const dates = datesByActivity.get(entry.activityId) ?? new Map<number, Day>();
    if (!dates.has(day.ordinal)) dates.set(day.ordinal, { ...day, firstOccurredAtMs: entry.revision.occurredAtMs, consecutive: 1 });
    datesByActivity.set(entry.activityId, dates);
  }
  const activities: StreakIndex['activities'] = new Map(); const frontiers: number[] = [];
  for (const activity of state.activities) {
    const days = [...(datesByActivity.get(activity.id)?.values() ?? [])].sort((a, b) => a.ordinal - b.ordinal);
    let chronological = true;
    for (let index = 0; index < days.length; index++) {
      const day = days[index]; const previous = days[index - 1];
      if (previous) { if (day.ordinal === previous.ordinal + 1) day.consecutive = previous.consecutive + 1; if (day.firstOccurredAtMs < previous.firstOccurredAtMs) chronological = false; }
      frontiers.push(day.firstOccurredAtMs);
    }
    activities.set(activity.id, { days, chronological });
  }
  frontiers.sort((a, b) => a - b);
  return { zone: state.settings.zone, activities, frontiers };
}
function latestEligible(days: readonly Day[], nowMs: number): number {
  let low = 0; let high = days.length;
  while (low < high) { const middle = (low + high) >>> 1; if (days[middle].firstOccurredAtMs <= nowMs) low = middle + 1; else high = middle; }
  return low - 1;
}
function copyResult(result: ReadonlyMap<string, ActivityStreak>): Map<string, ActivityStreak> {
  return new Map([...result].map(([id, streak]) => [id, { ...streak }]));
}

/** Distinct local days count once; clock ticks reuse a frozen snapshot's effective-day index. */
export function activityStreaks(state: DomainState, nowMs: number): Map<string, ActivityStreak> {
  assertTime(nowMs);
  let index = indexes.get(state);
  if (!index || index.zone !== state.settings.zone) {
    index = buildIndex(state);
    if (immutable(state)) indexes.set(state, index);
  }
  const today = localDate(nowMs, state.settings.zone); const todayOrdinal = ordinal(today);
  const frontier = upperBound(index.frontiers, nowMs);
  if (index.result?.today === today && index.result.frontier === frontier) return copyResult(index.result.streaks);
  const streaks = new Map<string, ActivityStreak>();
  for (const [activityId, activity] of index.activities) {
    // Rare historical date-line reversals can make local-day order differ from time order.
    const days = activity.chronological ? activity.days : activity.days.filter(day => day.firstOccurredAtMs <= nowMs);
    const lastIndex = activity.chronological ? latestEligible(days, nowMs) : days.length - 1;
    const last = days[lastIndex]; let count = 0;
    if (last && todayOrdinal - last.ordinal >= 0 && todayOrdinal - last.ordinal <= 1) {
      if (activity.chronological) count = last.consecutive;
      else { count = 1; while (lastIndex - count >= 0 && days[lastIndex - count].ordinal + 1 === days[lastIndex - count + 1].ordinal) count++; }
    }
    streaks.set(activityId, { days: count, recordedToday: last?.date === today, lastDate: last?.date ?? null });
  }
  index.result = { today, frontier, streaks };
  return copyResult(streaks);
}
