import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { effectiveEntries, localDate, parseDate, selectActivities } from '../domain';
import type { DomainState, EffectiveEntry } from '../domain/types';
import { useI18n } from '../i18n/react';
import { Button, Chip, GlassLayer, Label, Panel, s, useColors, webFocusRing } from './components';
import { CalendarField } from './CalendarField';
import { MotionPressable } from './motion';
import { alpha, palette } from './tokens';
import { typefaces } from './typography';

/** Bucket current effective revisions, not creation times or superseded audit rows. */
export function activityCalendarIndex(state: DomainState, activityId: string | null = null): Map<string, EffectiveEntry[]> {
  const days = new Map<string, EffectiveEntry[]>();
  for (const entry of effectiveEntries(state, activityId ? { activityIds: [activityId] } : {})) {
    const day = localDate(entry.revision.occurredAtMs, state.settings.zone), bucket = days.get(day);
    if (bucket) bucket.push(entry); else days.set(day, [entry]);
  }
  for (const entries of days.values()) entries.sort((a, b) => b.revision.occurredAtMs - a.revision.occurredAtMs || b.sequence - a.sequence);
  return days;
}
function utcDate(year: number, month: number, day: number) { const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(12, 0, 0, 0); return date; }
const pad = (value: number, length = 2) => String(value).padStart(length, '0');
const iso = (year: number, month: number, day: number) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
export function calendarMonthDays(month: string): (string | null)[] {
  const { year, month: number } = parseDate(`${month}-01`);
  const first = (utcDate(year, number, 1).getUTCDay() + 6) % 7, length = utcDate(year, number + 1, 0).getUTCDate();
  return Array.from({ length: Math.ceil((first + length) / 7) * 7 }, (_, index) => index < first || index >= first + length ? null : iso(year, number, index - first + 1));
}
function stepMonth(month: string, delta: number): string {
  const { year, month: number } = parseDate(`${month}-01`), date = utcDate(year, number + delta, 1);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, 1).slice(0, 7);
}

export function ActivityCalendar({ state, nowMs, onEntry }: { state: DomainState; nowMs: number; onEntry(entryId: string): void }) {
  const { t, locale } = useI18n(), colors = useColors(), today = localDate(nowMs, state.settings.zone);
  const [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState(today), [activity, setActivity] = useState<string | null>(null);
  const [filters, setFilters] = useState(false), [limit, setLimit] = useState(100);
  const activities = useMemo(() => selectActivities(state, { includeArchived: true }), [state]);
  const index = useMemo(() => activityCalendarIndex(state, activity), [state, activity]);
  const days = useMemo(() => calendarMonthDays(month), [month]);
  let lastDate = today; for (const date of index.keys()) if (date > lastDate) lastDate = date;
  const lastMonth = lastDate.slice(0, 7), selectedEntries = index.get(selected) ?? [];
  const max = Math.max(1, ...days.map(date => date ? index.get(date)?.length ?? 0 : 0));
  const total = days.reduce((count, day) => count + (day ? index.get(day)?.length ?? 0 : 0), 0);
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
  const dayLabel = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const timeFormat = useMemo(() => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: state.settings.zone, hour12: state.settings.hourFormat === '12h' }), [locale, state.settings.zone, state.settings.hourFormat]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utcDate(2026, 10, 12 + day))), [locale]);
  const select = (date: string) => { setSelected(date); setMonth(date.slice(0, 7)); setLimit(100); };
  return <View style={s.stack} testID="activity-calendar">
    <Panel><Label strong>{t('Calendario de actividad')}</Label><Label small>{t('Cada día muestra tus registros vigentes en {zone}.', { zone: state.settings.zone })}</Label>
      <View style={s.spread}><Button secondary compact label={t('Mes anterior')} disabled={month === '0001-01'} onPress={() => setMonth(stepMonth(month, -1))}>‹</Button><View style={s.flex}><Label strong style={s.center}>{monthTitle}</Label><Label small style={s.center}>{t('{count} registros en este mes', { count: total })}</Label></View><Button secondary compact label={t('Mes siguiente')} disabled={month >= lastMonth || month === '9999-12'} onPress={() => setMonth(stepMonth(month, 1))}>›</Button></View>
      <View style={s.wrap}><Button secondary compact onPress={() => select(today)}>{t('Hoy')}</Button><Button secondary compact onPress={() => setFilters(!filters)}>{activity ? t('Cambiar actividad') : t('Filtrar actividades')}</Button></View>
      {filters && <View style={s.wrap}><Chip selected={activity === null} onPress={() => { setActivity(null); setLimit(100); }}>{t('Todas las actividades')}</Chip>{activities.map(item => <Chip key={item.id} selected={activity === item.id} onPress={() => { setActivity(item.id); setLimit(100); }}>{item.emoji} {item.name}{item.isArchived ? t(' · archivada') : ''}</Chip>)}</View>}
      <View style={styles.grid} accessible={false}>{weekdays.map((day, ordinal) => <View key={ordinal} style={styles.cell}><Label small strong>{day}</Label></View>)}</View>
      <View style={styles.grid} accessibilityLabel={monthTitle}>
        {days.map((date, position) => {
          if (!date) return <View key={`blank-${position}`} style={styles.cell} />;
          const count = index.get(date)?.length ?? 0, chosen = date === selected, future = date > today, disabled = future && count === 0;
          return <MotionPressable key={date} testID={`activity-calendar-day-${date}`} wrapperStyle={styles.cell} accessibilityRole="button" accessibilityState={{ selected: chosen, disabled }} disabled={disabled}
            accessibilityLabel={t('{date}: {count} registros', { date: dayLabel(date), count })} onPress={() => select(date)}
            style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.day, { opacity: disabled ? 0.28 : 1, borderColor: chosen ? palette.violet : date === today ? colors.surfaceEdge : 'transparent', borderWidth: chosen || date === today ? 2 : 0, backgroundColor: count ? alpha(colors.dark ? palette.lilac : palette.lavender, 0.15 + 0.65 * count / max) : 'transparent' }, webFocusRing(focused, colors.dark ? palette.lavender : palette.violet)]}>
            {chosen && <GlassLayer radius={12} dark={colors.dark} tint={palette.lavender} strength="control" />}
            <Text style={[styles.number, { color: colors.text }]}>{Number(date.slice(-2))}</Text><Text accessible={false} style={[styles.count, { color: colors.text }]}>{count || '·'}</Text>
          </MotionPressable>;
        })}
      </View>
      <Label small>{t('Más intensidad significa más registros, no una meta pendiente.')}</Label>
      <CalendarField label={t('Ir a una fecha')} value={selected} maxDate={lastDate} onChange={select} />
    </Panel>
    <Panel><Label strong>{dayLabel(selected)}</Label><Label small>{t('{count} registros en este día', { count: selectedEntries.length })}</Label>
      {selected > today && <Label small strong>{t('Estos registros están después del reloj actual. Revisa la hora del dispositivo.')}</Label>}
      {selectedEntries.length === 0 ? <Label>{t('Sin registros este día. Esto no significa que no hicieras la actividad.')}</Label> : selectedEntries.slice(0, limit).map(entry => <Button key={entry.id} secondary label={`${entry.activity.emoji} ${entry.activity.name} · ${timeFormat.format(entry.revision.occurredAtMs)}`} onPress={() => onEntry(entry.id)}>{entry.activity.emoji} {entry.activity.name} · {timeFormat.format(entry.revision.occurredAtMs)}</Button>)}
      {selectedEntries.length > limit && <Button secondary onPress={() => setLimit(current => current + 100)}>{t('Ver más registros')}</Button>}
    </Panel>
  </View>;
}
const styles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.285714%', minHeight: 44, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }, day: { width: '92%', height: '92%', minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, number: { fontFamily: typefaces.bold, fontSize: 15 }, count: { fontFamily: typefaces.body, fontSize: 11, lineHeight: 15 } });
