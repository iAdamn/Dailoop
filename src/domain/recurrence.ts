import { addCalendarDays, localDate, localDateTime, localDateTimeCandidates, parseDate } from './time';
import { type Reminder, type ReminderRecurrence } from './types';
import { assertTime, assertZone, DomainError, exactKeys, invariant, isRecord } from './validation';

/** ISO weekdays: Monday 1 through Sunday 7; the zone belongs to the series. */
export function validateReminderRecurrence(value: unknown): asserts value is ReminderRecurrence {
  invariant(isRecord(value), 'invalid_recurrence', 'Elige los días y la hora de repetición.');
  exactKeys(value, ['weekdays', 'hour', 'minute', 'zone'], 'repetición');
  invariant(Array.isArray(value.weekdays) && value.weekdays.length >= 1 && value.weekdays.length <= 7 && value.weekdays.every((day, index, days) => Number.isInteger(day) && day >= 1 && day <= 7 && (index === 0 || days[index - 1] < day)), 'invalid_recurrence', 'Elige días diferentes, de lunes a domingo.');
  invariant(Number.isInteger(value.hour) && (value.hour as number) >= 0 && (value.hour as number) <= 23 && Number.isInteger(value.minute) && (value.minute as number) >= 0 && (value.minute as number) <= 59, 'invalid_recurrence', 'Elige una hora válida para la repetición.');
  assertZone(value.zone);
}

const cached = new Map<string, number | null>();
const pad = (value: number): string => String(value).padStart(2, '0');
/** A selected calendar occurrence, at/after the original anchor, or null. */
export function recurrenceDueAt(reminder: Pick<Reminder, 'dueAtMs' | 'recurrence'>, date: string): number | null {
  const parsed = parseDate(date); const recurrence = reminder.recurrence;
  if (!recurrence) return null;
  const day = new Date(0); day.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day); day.setUTCHours(0, 0, 0, 0);
  if (!recurrence.weekdays.includes(day.getUTCDay() || 7)) return null;
  const key = `${recurrence.zone}|${date}|${recurrence.hour}:${recurrence.minute}|${reminder.dueAtMs}`;
  if (cached.has(key)) return cached.get(key)!;
  const remember = (value: number | null): number | null => { if (cached.size >= 512) cached.delete(cached.keys().next().value!); cached.set(key, value); return value; };
  const desired = `${date}T${pad(recurrence.hour)}:${pad(recurrence.minute)}`;
  // Preserve a user-selected second instant of a folded hour at the anchor.
  if (localDateTime(reminder.dueAtMs, recurrence.zone).slice(0, 16) === desired) return remember(reminder.dueAtMs);
  for (let advance = 0; advance <= 180; advance++) {
    const minute = recurrence.hour * 60 + recurrence.minute + advance;
    if (minute >= 1440) break;
    let candidates: number[];
    try { candidates = localDateTimeCandidates(`${date}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`, recurrence.zone); }
    catch (error) { if (error instanceof DomainError && error.code === 'invalid_time') return remember(null); throw error; }
    if (candidates.length) return remember(candidates[0] >= reminder.dueAtMs ? candidates[0] : null);
  }
  return remember(null);
}

/** First occurrence strictly after afterMs. Never scans the series' past. */
export function nextReminderDueAt(reminder: Pick<Reminder, 'dueAtMs' | 'recurrence'>, afterMs: number): number | null {
  assertTime(afterMs);
  if (!reminder.recurrence) return reminder.dueAtMs > afterMs ? reminder.dueAtMs : null;
  let date = localDate(Math.max(afterMs, reminder.dueAtMs), reminder.recurrence.zone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // A selected weekday itself can be omitted by a zone's date-line change.
  // Include the following week instead of treating that as the series' end.
  for (let index = 0; index <= 14; index++) {
    const candidate = recurrenceDueAt(reminder, date);
    if (candidate !== null && candidate > afterMs) return candidate;
    if (date === '9999-12-31') return null;
    date = addCalendarDays(date, 1);
  }
  return null;
}
