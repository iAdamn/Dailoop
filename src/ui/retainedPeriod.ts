import { localDate, makePeriod, periodFor, type Period } from '../domain';

/** Retained filters follow timezone/clock changes without making an earlier
 * valid selection crash a hidden screen when that date becomes future. */
export function retainedPeriod(period: Period, zone: string, nowMs: number): Period {
  const today = localDate(nowMs, zone);
  if (period.from > today) return periodFor(period.kind === 'range' ? 'day' : period.kind, today, zone, nowMs);
  return makePeriod({ ...period, zone, nowMs, to: period.kind === 'range' && period.to > today ? today : period.to });
}
