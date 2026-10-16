import { currentSequence, effectiveEntries, selectActivities } from './core';
import { addCalendarDays, calendarDayCount, formatDateTime, formatTime, localDate, makePeriod } from './time';
import { type DomainState, type EntryRevision, type ReportAudit, type ReportItem, type ReportModel, type ReportOptions } from './types';
import { assertTime, invariant } from './validation';
import { translate, type AppLanguage } from '../i18n/core';

const clockWarning = 'Revisa la hora del dispositivo: hay registros seleccionados ya confirmados cuya hora efectiva es posterior al reloj actual. El corte conserva los datos conocidos al generar este reporte.';

/** Text is inert even if rendered by a Markdown implementation with HTML support. */
export function escapeMarkdown(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}\[\]()#+.!|~\-])/g, '\\$1').replace(/\r\n?|\n/g, ' ⏎ ');
}
export function buildReport(state: DomainState, options: ReportOptions, language: AppLanguage = 'es'): ReportModel {
  assertTime(options.generatedAtMs);
  invariant(Array.isArray(options.selectedActivityIds) && options.selectedActivityIds.length > 0, 'empty_selection', 'Selecciona al menos una actividad.');
  const sequence = currentSequence(state); const selectedIds = new Set(options.selectedActivityIds); const explicitPrivateIds = new Set(options.explicitPrivateActivityIds ?? []);
  const available = selectActivities(state, { includeArchived: true, atSequence: sequence });
  invariant([...selectedIds].every(id => available.some(activity => activity.id === id)), 'missing_activity', 'Una actividad seleccionada ya no está disponible.');
  const selected = available.filter(activity => selectedIds.has(activity.id) && (!activity.isPrivate || explicitPrivateIds.has(activity.id)));
  invariant(selected.length > 0, 'empty_selection', 'Selecciona al menos una actividad; las privadas requieren selección explícita.');
  const period = makePeriod({ from: options.from, to: options.to, zone: options.zone, kind: options.kind, nowMs: options.generatedAtMs });
  const includeHours = options.includeHours ?? true; const includeNotes = options.includeNotes ?? false; const includeAudit = options.includeAudit ?? false; const includeIds = options.includeIds ?? false;
  const selectedAllowedIds = selected.map(activity => activity.id);
  const entries = effectiveEntries(state, { activityIds: selectedAllowedIds, fromMs: period.startMs, toMs: period.endMs, atSequence: sequence });
  const items: ReportItem[] = entries.map(entry => ({ date: localDate(entry.revision.occurredAtMs, period.zone), activity: entry.activity.name, emoji: entry.activity.emoji, ...(includeHours ? { time: formatTime(entry.revision.occurredAtMs, period.zone) } : {}), ...(includeNotes && entry.revision.note ? { note: entry.revision.note } : {}), corrected: entry.revision.revisionNo > 1, ...(includeIds ? { id: entry.id } : {}) }));
  const totals = selected.map(activity => ({ activity: activity.name, emoji: activity.emoji, count: entries.filter(entry => entry.activityId === activity.id).length }));
  const audit: ReportAudit[] = [];
  if (includeAudit) {
    const auditEntries = options.includeVoidedAudit ? effectiveEntries(state, { activityIds: selectedAllowedIds, fromMs: period.startMs, toMs: period.endMs, includeVoided: true, atSequence: sequence }) : entries;
    const operationSequence = new Map(state.operations.map(operation => [operation.id, operation.sequence]));
    const selectedEntryIds = new Set(auditEntries.map(entry => entry.id));
    const revisionsByEntry = new Map<string, EntryRevision[]>();
    for (const revision of state.entryRevisions) {
      if (!selectedEntryIds.has(revision.entryId) || (operationSequence.get(revision.operationId) ?? Infinity) > sequence) continue;
      const chain = revisionsByEntry.get(revision.entryId) ?? []; chain.push(revision); revisionsByEntry.set(revision.entryId, chain);
    }
    for (const entry of auditEntries) {
      audit.push({ activity: entry.activity.name, ...(includeIds ? { entryId: entry.id } : {}), revisions: (revisionsByEntry.get(entry.id) ?? []).sort((a, b) => a.revisionNo - b.revisionNo).map(revision => ({ kind: revision.kind, date: localDate(revision.occurredAtMs, period.zone), ...(includeHours ? { time: formatTime(revision.occurredAtMs, period.zone), recordedAt: formatDateTime(revision.recordedAtMs, period.zone) } : { recordedAt: localDate(revision.recordedAtMs, period.zone) }), ...(includeNotes && revision.note ? { note: revision.note } : {}), ...(includeNotes && revision.reason ? { reason: revision.reason } : {}), state: revision.state })) });
    }
  }
  const model: ReportModel = { format: 'dailoop-report/1', period, generatedAtMs: options.generatedAtMs, generatedAt: formatDateTime(options.generatedAtMs, period.zone), sequence, selection: selected.map(activity => activity.name), includeHours, includeNotes, includeAudit, includeIds, total: items.length, daysWithEntries: new Set(items.map(item => item.date)).size, totalDays: calendarDayCount(period.from, period.to), totals, items, audit, markdown: '', filename: `dailoop-reporte-${period.from}_a_${period.to}.md` };
  if (entries.some(entry => entry.revision.occurredAtMs > options.generatedAtMs)) model.clockWarning = clockWarning;
  return localizeReport(model, language);
}
/** A report's immutable data selection stays intact when its presentation changes. */
export function localizeReport(model: ReportModel, language: AppLanguage = 'es'): ReportModel {
  const localized = { ...model, filename: translate(language, 'dailoop-reporte-{from}_a_{to}.md', { from: model.period.from, to: model.period.to }), ...(model.clockWarning ? { clockWarning: translate(language, clockWarning) } : {}) };
  localized.markdown = renderMarkdown(localized, language); return localized;
}
function renderMarkdown(model: ReportModel, language: AppLanguage): string {
  const t = (source: string, params: Record<string, string | number> = {}) => translate(language, source, params);
  const yesNo = (value: boolean) => t(value ? 'sí' : 'no');
  const e = escapeMarkdown; const lines = [t('# Dailoop — reporte histórico'), '', t('Período: {from} a {to} ({completeness}).', { from: model.period.from, to: model.period.to, completeness: t(model.period.partial ? 'parcial' : 'completo') }), t('Zona: {zone}. Generado: {generatedAt}. Formato: {format}.', { zone: e(model.period.zone), generatedAt: model.generatedAt, format: model.format }), t('Datos hasta {generatedAt}. Refleja las correcciones vigentes al generarlo.', { generatedAt: model.generatedAt }), t('Actividades seleccionadas: {selection}. Notas: {notes}. Auditoría: {audit}. Horas: {hours}.', { selection: model.selection.map(e).join(', '), notes: yesNo(model.includeNotes), audit: yesNo(model.includeAudit), hours: yesNo(model.includeHours) }), '', t('## Resumen'), '', t('{total} registros en {activities} actividades. Hubo registros en {daysWithEntries} de los {totalDays} días del período. «Sin registros» no permite inferir que no ocurrió una actividad.', { total: model.total, activities: model.totals.length, daysWithEntries: model.daysWithEntries, totalDays: model.totalDays }), '', t('## Totales por actividad'), '', t('| Actividad | Registros |'), '|---|---:|', ...model.totals.map(total => `| ${e(total.emoji)} ${e(total.activity)} | ${total.count} |`), `| **${t('Total')}** | **${model.total}** |`, '', t('## Cronología'), ''];
  if (model.clockWarning) lines.push(model.clockWarning, '');
  if (!model.includeHours) lines.push(t('Horas de actividad omitidas por privacidad.'), '');
  const byDay = new Map<string, ReportItem[]>(); for (const item of model.items) { const list = byDay.get(item.date) ?? []; list.push(item); byDay.set(item.date, list); }
  const occupiedDates = [...byDay.keys()].sort(); let cursor = model.period.from;
  const emptyRange = (from: string, to: string): void => {
    if (from > to) return;
    const length = calendarDayCount(from, to);
    if (length > 7) lines.push(t('### {from} a {to}', { from, to }), '', t('Sin registros durante {days} días. Total: 0.', { days: length }), '');
    else for (let date = from; date <= to; date = addCalendarDays(date, 1)) lines.push(`### ${date}`, '', t('Sin registros. Total del día: 0.'), '');
  };
  for (const date of occupiedDates) {
    if (cursor < date) emptyRange(cursor, addCalendarDays(date, -1));
    const rows = byDay.get(date)!; lines.push(`### ${date}`, '');
    for (const item of rows) lines.push(`- ${item.time ? `${item.time} — ` : ''}${e(item.emoji)} ${e(item.activity)}.${item.note ? ` ${e(item.note)}` : ''}${item.corrected ? ` ${t('Registro corregido/restaurado.')}` : ''}${item.id ? ` ID: ${item.id}.` : ''}`);
    lines.push('', t('Total del día: {total}.', { total: rows.length }), ''); cursor = addCalendarDays(date, 1);
  }
  emptyRange(cursor, model.period.to);
  if (model.includeAudit) {
    lines.push(t('## Auditoría'), '', t('Revisiones relacionadas con los registros seleccionados por su hora efectiva actual. Las modificaciones pueden quedar fuera del período. Los anulados incluidos no aumentan los totales.'), '');
    const labels = { create: 'Creado', correct: 'Corregido', void: 'Anulado', restore: 'Restaurado' };
    for (const entry of model.audit) { lines.push(`### ${e(entry.activity)}${entry.entryId ? ` — ${entry.entryId}` : ''}`, ''); for (const revision of entry.revisions) lines.push(t('- {kind}: ocurrió {occurred}; operación {recordedAt}; {state}.', { kind: t(labels[revision.kind]), occurred: `${revision.date}${revision.time ? ` ${revision.time}` : ''}`, recordedAt: String(revision.recordedAt), state: t(revision.state === 'void' ? 'anulado' : 'vigente') }) + (revision.note ? ` ${t('Nota: {note}.', { note: e(revision.note) })}` : '') + (revision.reason ? ` ${t('Motivo: {reason}.', { reason: e(revision.reason) })}` : '')); lines.push(''); }
  }
  lines.push(t('## Notas del reporte'), '', t('Este archivo es una selección para lectura; no sirve como backup. Las actividades excluidas y los registros anulados no se contabilizan. Los totales y cronología usan el mismo conjunto filtrado.'), t(model.includeNotes ? 'Las notas se incluyeron por selección explícita.' : 'Las notas no se exportaron.'), '');
  return lines.join('\n');
}
