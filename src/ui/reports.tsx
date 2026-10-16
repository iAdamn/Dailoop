import { useI18n } from '../i18n/react';
import { localizeError } from '../i18n/errors';
import { languageLocales, translate, type AppLanguage } from '../i18n/core';
import { localizeReport } from '../domain/reports';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { addCalendarDays, computeStats, effectiveEntries, localDate, makePeriod, periodFor, selectActivities, startOfLocalDay } from '../domain';
import type { DomainState, Period, ReportModel, ReportOptions } from '../domain/types';
import { Button, Chip, Empty, Heading, Label, Panel, s, Toggle, useColors, GlassLayer, titleReflection } from './components';
import { alpha, palette } from './tokens';
import { typefaces } from './typography';
import { glassShadow } from './material';
import { retainedPeriod } from './retainedPeriod';
import { CalendarField } from './CalendarField';
import { ActivityCalendar } from './ActivityCalendar';
import { useActiveTab } from './navigation';

const errorText = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la acción.';
export function dateLabel(date: string, language: AppLanguage = 'es') {
  return new Intl.DateTimeFormat(languageLocales[language], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
export function periodLabel(period: Period, language: AppLanguage = 'es') { return period.from === period.to ? dateLabel(period.from, language) : `${dateLabel(period.from, language)} — ${dateLabel(period.to, language)}`; }
export function intervalLabel(ms: number | null, language: AppLanguage = 'es') {
  if (ms == null) return '—';
  if (ms < 60_000) return translate(language, 'Menos de 1 min');
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toLocaleString(languageLocales[language], { maximumFractionDigits: 1 })} h`;
  const days = Math.round(ms / 86_400_000 * 10) / 10;
  return `${days.toLocaleString(languageLocales[language], { maximumFractionDigits: 1 })} ${translate(language, days === 1 ? 'día' : 'días')}`;
}
function quantity(count: number, singular: string, plural: string, language: AppLanguage) { return `${count} ${translate(language, count === 1 ? singular : plural)}`; }
export function PeriodControls({ period, nowMs, onChange, allowRange = true }: { period: Period; nowMs: number; onChange(period: Period): void; allowRange?: boolean }) {
  const { t, language } = useI18n();
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [error, setError] = useState('');
  const today = localDate(nowMs, period.zone);
  function switchKind(kind: 'day' | 'week' | 'month') {
    onChange(periodFor(kind, today, period.zone, nowMs)); setCustom(false); setError('');
  }
  function step(direction: -1 | 1) {
    if (period.kind === 'range') return;
    const anchor = addCalendarDays(direction < 0 ? period.from : period.to, direction);
    onChange(periodFor(period.kind, anchor, period.zone, nowMs));
  }
  function apply() {
    try {
      if (to > today || from > today) throw new Error("Selecciona fechas hasta hoy. No se admiten días futuros.");
      onChange(makePeriod({ from, to, zone: period.zone, nowMs, kind: 'range' })); setError(''); setCustom(false);
    } catch (e) { setError(errorText(e)); }
  }
  return <View style={s.stack}>
    <View style={s.wrap}>{([['day', t("Día")], ['week', t("Semana")], ['month', t("Mes")]] as const).map(([kind, label]) => <Chip key={kind} selected={period.kind === kind} onPress={() => switchKind(kind)}>{label}</Chip>)}{allowRange && <Chip selected={period.kind === 'range' || custom} onPress={() => { setFrom(period.from); setTo(period.to > today ? today : period.to); setCustom(!custom); }}>{t("Elegir fechas")}</Chip>}</View>
    <View style={s.spread}>{period.kind !== 'range' && <Button compact subtle label={t("Período anterior")} onPress={() => step(-1)}>‹</Button>}<View style={s.flex}><Label strong style={s.center}>{periodLabel(period, language)}</Label><Label small style={s.center}>{period.partial ? t("Hasta ahora") : t("Período completo")} · {period.zone}</Label></View>{period.kind !== 'range' && <Button compact subtle label={t("Período siguiente")} disabled={period.to >= today} onPress={() => step(1)}>›</Button>}</View>
    {custom && <Panel><CalendarField label={t("Desde")} value={from} maxDate={to < today ? to : today} onChange={setFrom} /><CalendarField label={t("Hasta, incluido")} value={to} minDate={from} maxDate={today} onChange={setTo} />{!!error && <Label strong>! {t(localizeError(language, error))}</Label>}<Button secondary onPress={apply}>{t("Aplicar fechas")}</Button></Panel>}
  </View>;
}

export function StatsScreen({ state, nowMs, openReport, openHistory, onEntry }: { state: DomainState; nowMs: number; openReport(): void; openHistory?(): void; onEntry?(entryId: string): void }) {
  const { t, language, locale } = useI18n();
  const c = useColors();
  const active = useActiveTab();
  const [calendar, setCalendar] = useState(false);
  useEffect(() => {
    if (!active || !calendar) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setCalendar(false); return true; });
    return () => subscription.remove();
  }, [active, calendar]);
  const [period, setPeriod] = useState(() => periodFor('week', localDate(nowMs, state.settings.zone), state.settings.zone, nowMs));
  const [selected, setSelected] = useState<string[] | null>(null);
  const [filters, setFilters] = useState(false);
  const activities = useMemo(() => selectActivities(state, { includeArchived: true }), [state]);
  const today = localDate(nowMs, state.settings.zone);
  const dayNow = useMemo(() => startOfLocalDay(today, state.settings.zone), [today, state.settings.zone]);
  const normalized = useMemo(() => retainedPeriod(period, state.settings.zone, dayNow), [period, state.settings.zone, dayNow]);
  const stats = useMemo(() => computeStats(state, normalized, dayNow, selected || undefined), [state, normalized, dayNow, selected]);
  const entries = useMemo(() => effectiveEntries(state, { fromMs: normalized.startMs, toMs: normalized.endMs, activityIds: selected || undefined }), [state, normalized.startMs, normalized.endMs, selected]);
  const buckets = useMemo(() => {
    const values = new Map<string, number>();
    const hours = normalized.kind === 'day' ? new Intl.DateTimeFormat(locale, { hour: '2-digit', hourCycle: 'h23', timeZone: normalized.zone }) : null;
    for (const entry of entries) {
      const key = hours ? hours.format(entry.revision.occurredAtMs) + ':00' : localDate(entry.revision.occurredAtMs, normalized.zone);
      values.set(key, (values.get(key) || 0) + 1);
    }
    return values;
  }, [entries, normalized.kind, normalized.zone, locale]);
  const max = Math.max(...buckets.values(), 1);
  const counts = new Map(stats.perActivity.map(a => [a.activityId, a.count]));
  if (calendar && onEntry) return <View style={s.stack}><Button secondary compact feedback="selection" onPress={() => setCalendar(false)}>{t('‹ Estadísticas')}</Button><ActivityCalendar state={state} nowMs={nowMs} onEntry={onEntry} /></View>;
  return <View style={s.stack}>
    <View style={[s.spread, { flexWrap: 'wrap' }]}><View style={{ flexGrow: 1 }}><Heading subtitle={t("Una mirada a lo que has registrado.")}>{t("Tu ritmo")}</Heading></View>
      {openHistory && <Button secondary compact onPress={openHistory}>{t("Ver historial")}</Button>}
      {onEntry && <Button secondary compact onPress={() => setCalendar(true)}>{t('Ver calendario')}</Button>}
    </View>
    <PeriodControls period={normalized} nowMs={nowMs} onChange={setPeriod} />
    {entries.some(entry => entry.revision.occurredAtMs > nowMs) && <Label small strong>{t("Revisa la hora del dispositivo: se conservan los registros confirmados cuya hora efectiva es posterior al reloj actual.")}</Label>}
    <Button subtle compact onPress={() => setFilters(!filters)}>{filters ? t("Cerrar filtros") : selected ? t('Filtrar actividades ({count})', { count: selected.length }) : t("Filtrar actividades")}</Button>
    {filters && <Panel><Button secondary compact onPress={() => setSelected(null)}>{t("Todas las actividades")}</Button><View style={s.wrap}>{activities.map(a => <Chip key={a.id} selected={selected === null || selected.includes(a.id)} onPress={() => { const current = selected || activities.map(x => x.id); setSelected(current.includes(a.id) ? current.filter(id => id !== a.id) : [...current, a.id]); }}>{a.emoji} {a.name}{a.isArchived ? t(" · archivada") : ''}</Chip>)}</View></Panel>}
    <View style={s.row}><View style={[local.metric, { backgroundColor: 'transparent', boxShadow: glassShadow(c.dark) }]}><GlassLayer radius={26} dark={c.dark} tint={palette.lavender} /><Text style={[local.metricNumber, { color: c.text }, titleReflection(c.dark)]}>{stats.total}</Text><Text style={[local.metricLabel, { color: c.text }]}>{t(stats.total === 1 ? 'registro' : 'registros')}</Text></View><View style={[local.metric, { backgroundColor: 'transparent', boxShadow: glassShadow(c.dark) }]}><GlassLayer radius={26} dark={c.dark} tint={palette.sky} /><Text style={[local.metricNumber, { color: c.text }, titleReflection(c.dark)]}>{stats.perActivity.filter(a => a.count > 0).length}</Text><Text style={[local.metricLabel, { color: c.text }]}>{t(stats.perActivity.filter(a => a.count > 0).length === 1 ? 'actividad' : 'actividades')}</Text></View></View>
    {stats.total === 0 ? <Empty title={t("Un período por descubrir")} text={t("No hay registros en estas fechas. Puedes consultar cualquier período anterior o generar un reporte vacío.")} /> : <Panel><Label strong>{normalized.kind === 'day' ? t("A lo largo del día") : t("Tus registros, día a día")}</Label>{[...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => <View key={key} style={{ gap: 6 }}><View style={s.spread}><Label small>{normalized.kind === 'day' ? key : dateLabel(key, language)}</Label><Label small strong>{value} {t(value === 1 ? 'registro' : 'registros')}</Label></View><View accessible={false} style={{ height: 10, borderRadius: 5, backgroundColor: c.border, overflow: 'hidden' }}><View style={{ width: `${Math.max(3, value / max * 100)}%`, height: 10, borderRadius: 5, backgroundColor: c.dark ? palette.sky : palette.ink }} /></View></View>)}</Panel>}
    <Panel><Label strong>{t("Por actividad")}</Label>{activities.filter(a => (selected === null || selected.includes(a.id)) && (counts.get(a.id) || 0) > 0).map(a => <View key={a.id} style={s.spread}><Label style={s.flex}>{a.emoji} {a.name}</Label><Label strong>{counts.get(a.id) || 0}</Label></View>)}{stats.total === 0 && <Label small>{t("Sin registros en el filtro actual.")}</Label>}</Panel>
    <Panel><Label strong>{t("Un poco de contexto")}</Label><View style={s.spread}><Label style={s.flex}>{t("Período anterior")}</Label><Label strong>{quantity(stats.previousTotal, 'registro', 'registros', language)}</Label></View><Label small>{periodLabel(stats.previousPeriod, language)}</Label><View style={s.spread}><Label style={s.flex}>{t("Diferencia")}</Label><Label strong>{stats.change > 0 ? '+' : ''}{stats.change}{stats.changePercent != null ? ` (${stats.changePercent > 0 ? '+' : ''}${stats.changePercent.toLocaleString(languageLocales[language], { maximumFractionDigits: 1 })} %)` : ''}</Label></View>{normalized.partial && <Label small>{t("Este período aún está en curso; el anterior está completo. Los totales no abarcan la misma fracción de tiempo.")}</Label>}<View style={s.spread}><Label style={s.flex}>{t("Intervalo medio")}</Label><Label strong>{intervalLabel(stats.intervals.averageMs, language)}</Label></View><Label small>{t("Entre los registros de las actividades seleccionadas en este período. Se necesitan al menos dos.")}</Label></Panel>
    <Button feedback="selection" onPress={openReport}>{t("Generar reporte")}</Button>
  </View>;
}

export interface ReportScreenProps {
  state: DomainState; nowMs: number; onBack(): void;
  onStageLayout?(): void;
  onReport(options: ReportOptions): Promise<ReportModel>;
  onSaveReport(report: ReportModel): Promise<string>;
  onCopyReport(report: ReportModel): Promise<string>;
  onShareReport(report: ReportModel): Promise<string>;
}
export function ReportScreen({ state, nowMs, onBack, onStageLayout, onReport, onSaveReport, onCopyReport, onShareReport }: ReportScreenProps) {
  const { t, language } = useI18n();
  const c = useColors();
  const activities = selectActivities(state, { includeArchived: true });
  const [period, setPeriod] = useState(() => periodFor('month', localDate(nowMs, state.settings.zone), state.settings.zone, nowMs));
  const [selected, setSelected] = useState(() => activities.filter(a => !a.isPrivate).map(a => a.id));
  const [notes, setNotes] = useState(false);
  const [hours, setHours] = useState(true);
  const [audit, setAudit] = useState(false);
  const [ids, setIds] = useState(false);
  const [generatedReport, setReport] = useState<ReportModel | null>(null);
  const report = useMemo(() => generatedReport ? localizeReport(generatedReport, language) : null, [generatedReport, language]);
  const stage = report ? 'preview' : 'selection';
  const lastLaidOutStage = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); setError(''); setNotice('');
    try { const result = await work(); if (typeof result === 'string') setNotice(result); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const prepare = () => run(async () => {
    const model = await onReport({ from: period.from, to: period.to, zone: state.settings.zone, kind: period.kind, generatedAtMs: nowMs, selectedActivityIds: selected, explicitPrivateActivityIds: selected.filter(id => activities.find(a => a.id === id)?.isPrivate), includeNotes: notes, includeHours: hours, includeAudit: audit, includeIds: ids });
    setReport(model);
  });
  // A fresh native layout makes the parent's scroll reset follow the new content.
  return <View key={stage} style={s.stack} onLayout={() => {
    if (lastLaidOutStage.current !== stage) {
      lastLaidOutStage.current = stage;
      onStageLayout?.();
    }
  }}>
    <Button subtle compact onPress={report ? () => { setReport(null); setNotice(''); } : onBack}>{report ? t("‹ Ajustar selección") : t("‹ Volver")}</Button>
    <Heading subtitle={report ? t("Este es el contenido exacto que vas a exportar.") : t("Elige qué parte de tu historia quieres llevar contigo.")}>{report ? t("Tu reporte está listo") : t("Generar reporte")}</Heading>
    {report ? <>
      <Panel><Label strong>{periodLabel(report.period, language)}</Label><Label>{quantity(report.total, 'registro', 'registros', language)} · {quantity(report.selection.length, 'actividad', 'actividades', language)}</Label><Label small>{report.period.zone} · {report.period.partial ? t("Período en curso") : t("Período completo")}</Label>{report.clockWarning && <Label small strong>{report.clockWarning}</Label>}<Label small>{t("Refleja los registros y correcciones vigentes al generarlo. Un reporte no sirve para restaurar la app.")}</Label></Panel>
      <View style={[local.markdown, { backgroundColor: 'transparent', borderColor: 'transparent' }]}><GlassLayer radius={22} dark={c.dark} strength="strong" /><Text selectable accessibilityLabel={t("Vista previa exacta del reporte Markdown")} style={[local.markdownText, { color: c.text }]}>{report.markdown}</Text></View>
      <Button disabled={busy} onPress={() => run(() => onSaveReport(report))}>{t("Guardar Markdown")}</Button><View style={s.row}><View style={s.flex}><Button secondary disabled={busy} onPress={() => run(() => onCopyReport(report))}>{t("Copiar")}</Button></View><View style={s.flex}><Button secondary disabled={busy} onPress={() => run(() => onShareReport(report))}>{t("Compartir")}</Button></View></View>
    </> : <>
      <PeriodControls period={period} nowMs={nowMs} onChange={setPeriod} />
      <Panel><Label strong>{t("Actividades incluidas")}</Label><View style={s.wrap}><Button secondary compact onPress={() => setSelected(activities.filter(a => !a.isPrivate).map(a => a.id))}>{t("Todas no privadas")}</Button><Button subtle compact onPress={() => setSelected([])}>{t("Ninguna")}</Button></View>{!activities.length && <Label>{t("No hay actividades. Crea una para preparar un reporte.")}</Label>}<View style={s.wrap}>{activities.map(a => <Chip key={a.id} selected={selected.includes(a.id)} onPress={() => setSelected(selected.includes(a.id) ? selected.filter(id => id !== a.id) : [...selected, a.id])}>{a.emoji} {a.name}{a.isPrivate ? t(" · privada") : ''}{a.isArchived ? t(" · archivada") : ''}</Chip>)}</View><Label small>{t("Las actividades privadas sólo se incluyen si las seleccionas expresamente aquí.")}</Label></Panel>
      <Panel><Label strong>{t("Qué contiene el archivo")}</Label><Toggle label={t("Horas exactas")} value={hours} onChange={setHours} detail={t("Cronología horaria de cada ocurrencia.")} /><Toggle label={t("Notas")} value={notes} onChange={setNotes} detail={t("Pueden contener información personal.")} /><Toggle label={t("Auditoría de los registros incluidos")} value={audit} onChange={setAudit} detail={t("Añade correcciones y sus motivos; no aumenta los totales.")} /><Toggle label={t("Identificadores técnicos")} value={ids} onChange={setIds} /></Panel>
      <Panel tint={palette.lavender}><Text style={[local.privacyTitle, { color: c.text }]}>{t("Antes de exportar")}</Text><Text style={[local.privacyText, { color: c.text }]}>{t('{activities}; {private}. Notas: {notes}. Horas: {hours}. Auditoría: {audit}.', { activities: quantity(selected.length, 'actividad', 'actividades', language), private: quantity(selected.filter(id => activities.find(a => a.id === id)?.isPrivate).length, 'privada', 'privadas', language), notes: t(notes ? 'sí' : 'no'), hours: t(hours ? 'sí' : 'no'), audit: t(audit ? 'sí' : 'no') })}</Text>{!hours && <Text style={[local.privacyText, { color: c.text }]}>{t("Horas omitidas por elección de privacidad.")}</Text>}<Text style={[local.privacyText, { color: c.text }]}>{t("Podrás revisar el texto completo antes de guardar o compartir.")}</Text></Panel>
      <Button feedback="selection" disabled={!selected.length} busy={busy} onPress={prepare}>{t("Ver vista previa")}</Button>
    </>}
    {!!error && <Label strong>! {t(localizeError(language, error))}</Label>}{!!notice && <Label strong>{notice}</Label>}
  </View>;
}
const local = StyleSheet.create({
  metric: { flex: 1, minWidth: 0, borderRadius: 26, borderWidth: 1, borderColor: 'transparent', padding: 20, gap: 5, boxShadow: '0 8px 20px ' + alpha(palette.ink, 0.07) }, metricNumber: { fontFamily: typefaces.display, fontSize: 40, lineHeight: 48, color: palette.ink, letterSpacing: -1 }, metricLabel: { fontFamily: typefaces.medium, fontSize: 13, lineHeight: 22, color: palette.ink },
  markdown: { borderRadius: 22, borderWidth: 1, padding: 20 }, markdownText: { color: palette.ink, fontSize: 13, lineHeight: 23, fontFamily: typefaces.body }, privacyTitle: { fontFamily: typefaces.bold, color: palette.ink, fontSize: 15, lineHeight: 24 }, privacyText: { fontFamily: typefaces.body, color: palette.ink, fontSize: 13, lineHeight: 22 },
});
