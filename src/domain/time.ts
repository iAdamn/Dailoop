import { TZDate } from '@date-fns/tz';
import { addDays, endOfMonth, startOfMonth, startOfWeek } from 'date-fns';
import { type Period, type PeriodKind } from './types';
import { assertTime, assertZone, DomainError, invariant } from './validation';

const formatters = new Map<string, Intl.DateTimeFormat>();
const dayBoundaries = new Map<string, number>();
const canonicalZones = new Map<string, string>();
/** Index equivalent IANA spellings together without rewriting stored user zones. */
export function canonicalTimeZone(zone: string): string {
  invariant(typeof zone==='string' && zone.length<=100,'invalid_zone','Zona horaria no válida.');
  const key=zone.toLowerCase();
  let canonical=canonicalZones.get(key);
  if(!canonical){
    assertZone(zone);
    canonical=new Intl.DateTimeFormat('en', {timeZone:zone}).resolvedOptions().timeZone;
    if(canonicalZones.size>=1024)canonicalZones.delete(canonicalZones.keys().next().value!);
    canonicalZones.set(key,canonical);
  }
  return canonical;
}
function formatter(zone: string): Intl.DateTimeFormat {
  zone=canonicalTimeZone(zone);
  let value = formatters.get(zone);
  if (!value) { assertZone(zone); value = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); formatters.set(zone, value); }
  return value;
}
function parts(ms: number, zone: string): Record<string, number> {
  assertTime(ms); const result: Record<string, number> = {};
  for (const part of formatter(zone).formatToParts(ms)) if (part.type !== 'literal') result[part.type] = Number(part.value);
  return result;
}
const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
function utc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  const d = new Date(0); d.setUTCFullYear(year, month - 1, day); d.setUTCHours(hour, minute, second, 0); return d.getTime();
}
export function parseDate(date: string): { year: number; month: number; day: number } {
  invariant(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'invalid_date', 'Usa una fecha válida AAAA-MM-DD.');
  const [year, month, day] = date.split('-').map(Number); const d = new Date(utc(year, month, day));
  invariant(year >= 1 && year <= 9999 && d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day, 'invalid_date', 'La fecha no existe.');
  return { year, month, day };
}
export function localDate(ms: number, zone: string): string { const p = parts(ms, zone); return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`; }
export function localDateTime(ms: number, zone: string): string { const p = parts(ms, zone); return `${localDate(ms, zone)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`; }
export function offsetMinutesAt(ms: number, zone: string): number {
  return Math.round(offsetSecondsAt(ms, zone) / 60);
}
export function offsetSecondsAt(ms: number, zone: string): number { const p = parts(ms, zone); return (utc(p.year, p.month, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 1000; }
export function formatOffset(minutes: number): string { return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`; }
export function formatOffsetSeconds(seconds: number): string { const absolute = Math.abs(seconds); return `${seconds < 0 ? '-' : '+'}${pad(Math.floor(absolute / 3600))}:${pad(Math.floor(absolute / 60) % 60)}${absolute % 60 ? `:${pad(absolute % 60)}` : ''}`; }
export function formatTime(ms: number, zone: string, withOffset = true): string {
  const p = parts(ms, zone); return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${withOffset ? ` ${formatOffsetSeconds(offsetSecondsAt(ms, zone))}` : ''}`;
}
export function formatDateTime(ms: number, zone: string): string { return `${localDate(ms, zone)} ${formatTime(ms, zone)}`; }
export function addCalendarDays(date: string, days: number): string {
  const p = parseDate(date); invariant(Number.isSafeInteger(days), 'invalid_days', 'Cantidad de días no válida.');
  const d = addDays(new TZDate(utc(p.year, p.month, p.day), 'UTC'), days);
  const result = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; parseDate(result); return result;
}
export function calendarDayCount(from: string, to: string): number { const a = parseDate(from); const b = parseDate(to); return (utc(b.year, b.month, b.day) - utc(a.year, a.month, a.day)) / 86_400_000 + 1; }
export function localDateTimeCandidates(local: string, zone: string): number[] {
  assertZone(zone); invariant(typeof local === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local), 'invalid_local_time', 'Usa una fecha y hora local válida.');
  const date = parseDate(local.slice(0, 10)); const [hour, minute, second = 0] = local.slice(11).split(':').map(Number);
  invariant(hour <= 23 && minute <= 59 && second <= 59, 'invalid_local_time', 'La hora no es válida.');
  const guess = utc(date.year, date.month, date.day, hour, minute, second); const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 3) offsets.add(offsetSecondsAt(Math.max(-62_135_596_800_000, Math.min(253_402_300_799_999, guess + hours * 3_600_000)), zone));
  const normalized = `${local.slice(0, 10)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  return [...offsets].map(offset => guess - offset * 1000).filter(ms => localDateTime(ms, zone) === normalized).sort((a, b) => a - b);
}
export function resolveLocalDateTime(local: string, zone: string, disambiguation?: 'earlier' | 'later'): number {
  const candidates = localDateTimeCandidates(local, zone);
  invariant(candidates.length > 0, 'nonexistent_time', 'Esta hora no existe por el cambio horario. Elige otra hora.');
  invariant(candidates.length === 1 || disambiguation, 'ambiguous_time', 'Esta hora ocurre dos veces. Elige la primera o la segunda.');
  return disambiguation === 'later' ? candidates[candidates.length - 1] : candidates[0];
}
export function startOfLocalDay(date: string, zone: string): number {
  parseDate(date); assertZone(zone);
  const key = `${canonicalTimeZone(zone)}\0${date}`;
  const cached = dayBoundaries.get(key);
  if (cached !== undefined) return cached;
  const remember = (value: number) => {
    if (dayBoundaries.size >= 512) dayBoundaries.delete(dayBoundaries.keys().next().value!);
    dayBoundaries.set(key, value); return value;
  };
  const midnight = localDateTimeCandidates(`${date}T00:00`, zone);
  if (midnight.length) return remember(midnight[0]);
  // Some IANA zones advance at midnight. The first valid minute is the day's boundary.
  for (let minute = 1; minute < 1440; minute++) { const matches = localDateTimeCandidates(`${date}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`, zone); if (matches.length) return remember(matches[0]); }
  throw new DomainError('nonexistent_date', 'Este día no existe en la zona horaria elegida.');
}
export function makePeriod(input: { from: string; to: string; zone: string; kind?: PeriodKind; nowMs: number }): Period {
  const { from, to, zone, nowMs } = input; const kind = input.kind ?? 'range'; parseDate(from); parseDate(to); assertZone(zone); assertTime(nowMs);
  const today = localDate(nowMs, zone);
  invariant(from <= to && from <= today, 'invalid_period', 'El inicio debe preceder al fin y no puede ser futuro.');
  invariant(kind !== 'range' || to <= today, 'future_period', 'El rango personalizado no puede incluir días futuros.');
  invariant(to <= today || ((kind === 'week' || kind === 'month') && from <= today && to >= today), 'future_period', 'El período no puede ser futuro.');
  if (kind === 'day') invariant(from === to, 'invalid_period', 'Un día debe contener una sola fecha.');
  if (kind === 'week' || kind === 'month') {
    const expected = nominalPeriod(kind, from);
    invariant(expected.from === from && expected.to === to, 'invalid_period', 'El período debe coincidir con una semana o mes calendario.');
  }
  const startMs = startOfLocalDay(from, zone);
  let endDate = addCalendarDays(to, 1);
  // IANA can omit a whole civil day (Apia, 2011-12-30). An exclusive
  // boundary is the next existing day, not a reason to reject the prior day.
  while (true) {
    try { return { kind, from, to, zone, startMs, endMs: startOfLocalDay(endDate, zone), partial: to >= today }; }
    catch (error) { if (!(error instanceof DomainError) || error.code !== 'nonexistent_date') throw error; endDate = addCalendarDays(endDate, 1); }
  }
}
function nominalPeriod(kind: 'day' | 'week' | 'month', date: string): { from: string; to: string } {
  const p = parseDate(date);
  if (kind === 'day') return { from: date, to: date };
  const calendarDate = new TZDate(utc(p.year, p.month, p.day), 'UTC');
  if (kind === 'week') { const from = localDate(startOfWeek(calendarDate, { weekStartsOn: 1 }).getTime(), 'UTC'); return { from, to: addCalendarDays(from, 6) }; }
  return { from: localDate(startOfMonth(calendarDate).getTime(), 'UTC'), to: localDate(endOfMonth(calendarDate).getTime(), 'UTC') };
}
export function periodFor(kind: 'day' | 'week' | 'month', date: string, zone: string, nowMs: number): Period { return makePeriod({ ...nominalPeriod(kind, date), kind, zone, nowMs }); }
export function previousPeriod(period: Period, nowMs: number): Period {
  let lastDate = addCalendarDays(period.from, -1);
  if (period.kind !== 'range') {
    while(true){
      try{return periodFor(period.kind,lastDate,period.zone,nowMs);}
      catch(error){if(!(error instanceof DomainError)||error.code!=='nonexistent_date')throw error;lastDate=addCalendarDays(lastDate,-1);}
    }
  }
  let from=addCalendarDays(period.from, -calendarDayCount(period.from, period.to));
  while(true){
    try{return makePeriod({from,to:lastDate,zone:period.zone,nowMs});}
    catch(error){if(!(error instanceof DomainError)||error.code!=='nonexistent_date')throw error;from=addCalendarDays(from,-1);}
  }
}
export function elapsedSince(lastMs: number | null, nowMs: number): { status: 'never' | 'clockChanged' | 'elapsed'; milliseconds: number | null; text: string } {
  assertTime(nowMs);
  if (lastMs === null) return { status: 'never', milliseconds: null, text: 'Nunca' };
  assertTime(lastMs); const delta = nowMs - lastMs;
  if (delta < 0) return { status: 'clockChanged', milliseconds: null, text: 'Revisa la hora del dispositivo' };
  const minutes = Math.floor(delta / 60_000); const hours = Math.floor(delta / 3_600_000); const days = Math.floor(delta / 86_400_000);
  return { status: 'elapsed', milliseconds: delta, text: minutes === 0 ? 'Ahora' : hours === 0 ? `Hace ${minutes} min` : days === 0 ? `Hace ${hours} h` : `Hace ${days} ${days === 1 ? 'día' : 'días'}` };
}
