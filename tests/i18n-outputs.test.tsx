import { applyPlanning, createEmptyState, execute, type DomainState, type ReportOptions } from '../src/domain';
import { buildReport, localizeReport } from '../src/domain/reports';
import { notificationPlan } from '../src/infrastructure/notificationPlan';
import { errorMessages, localizeError } from '../src/i18n/errors';
import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useLocalNotifications } from '../src/infrastructure/notifications.native';
import type { AppLanguage } from '../src/i18n/core';

const mockScheduled = new Map<string, Notifications.NotificationRequest>();
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 }, AndroidNotificationVisibility: { PRIVATE: 0 }, SchedulableTriggerInputTypes: { DATE: 'date', WEEKLY: 'weekly' },
  setNotificationCategoryAsync: jest.fn(async () => undefined), setNotificationHandler: jest.fn(), setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockScheduled.values()]),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => { mockScheduled.delete(id); }),
  scheduleNotificationAsync: jest.fn(async (request: Notifications.NotificationRequestInput) => {
    mockScheduled.set(request.identifier!, request as Notifications.NotificationRequest); return request.identifier!;
  }),
  getLastNotificationResponseAsync: jest.fn(async () => null), clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const NOW = Date.parse('2026-10-14T17:00:00Z');
let serial = 0;
const nextId = () => `67000000-0000-4000-9000-${String(++serial).padStart(12, '0')}`;
const context = (nowMs = NOW) => ({ nowMs, operationId: nextId(), nextId });
function fixture() {
  let state = createEmptyState({ databaseId: nextId(), nowMs: NOW - 4 * 86_400_000 });
  state = execute(state, { type: 'createActivity', name: 'Leer <read> {hours}', emoji: '📖', color: '#DCCFFF' }, context()).state;
  state = execute(state, { type: 'createEntry', activityId: state.activities[0].id, note: 'Notas: <script> & {activity}' }, context()).state;
  return state;
}
const options = (state: DomainState): ReportOptions => ({ selectedActivityIds: [state.activities[0].id], from: '2026-10-14', to: '2026-10-14', zone: 'America/Bogota', generatedAtMs: NOW, includeNotes: true, includeAudit: true, includeHours: true });

test('reports translate every presentation section, keep content inert and retain the exact selection snapshot', () => {
  const state = fixture(); const before = JSON.stringify(state); const es = buildReport(state, options(state));
  expect(buildReport(state, options(state), 'es')).toEqual(es);
  for (const language of ['en', 'pt'] as const) {
    const report = buildReport(state, options(state), language);
    const { markdown: _markdown, filename: _filename, ...data } = report;
    const { markdown: _esMarkdown, filename: _esFilename, ...esData } = es;
    expect(data).toEqual(esData);
    expect(report.markdown).toContain('Leer &lt;read&gt; \\{hours\\}');
    expect(report.markdown).toContain('Notas: &lt;script&gt; &amp; \\{activity\\}');
    expect(report.markdown).not.toMatch(/reporte histórico|Actividades seleccionadas|## Resumen|## Totales por actividad|## Auditoría|ocurrió|operación|Notas del reporte/);
    expect(report.markdown).toContain(language === 'en' ? '## Audit' : '## Auditoria');
    expect(report.filename).toBe(language === 'en' ? 'dailoop-report-2026-10-14_to_2026-10-14.md' : 'dailoop-relatorio-2026-10-14_a_2026-10-14.md');
    expect(localizeReport(report, 'es')).toEqual(es);
  }
  expect(JSON.stringify(state)).toBe(before);
});

test('report clock warnings, omitted hours, void audit and empty dates translate without changing totals', () => {
  let state = fixture();
  state = execute(state, { type: 'correctEntry', entryId: state.entries[0].id, note: 'new note', reason: 'Mi motivo' }, context(NOW + 1)).state;
  const withFutureClock = buildReport(state, { ...options(state), generatedAtMs: NOW - 1 }, 'en');
  expect(withFutureClock.clockWarning).toMatch(/^Check the device time:/);
  expect(localizeReport(withFutureClock, 'pt').clockWarning).toMatch(/^Confira a hora do dispositivo:/);
  state = execute(state, { type: 'voidEntry', entryId: state.entries[0].id, reason: 'Mi motivo' }, context(NOW + 2)).state;
  const report = buildReport(state, { ...options(state), from: '2026-10-01', includeHours: false, includeVoidedAudit: true }, 'pt');
  expect(report.total).toBe(0);
  expect(report.markdown).toContain('Sem registros durante 14 dias. Total: 0.');
  expect(report.markdown).toContain('Horários das atividades omitidos por privacidade.');
  expect(report.markdown).toContain('Anulado: ocorreu');
  expect(report.markdown).toContain('Motivo: Mi motivo.');
});

test('reminder translation changes only visible copy, preserving IDs, schedules, recurrence and user activity text', () => {
  let state = fixture(); const id = nextId();
  state = { ...state, planning: applyPlanning(state, { type: 'createReminder', id, activityId: state.activities[0].id, completionEntryId: nextId(), dueAtMs: NOW + 86_400_000, leadMinutes: [0, 1, 60, 180], notifications: true, recurrence: { weekdays: [1, 2, 3, 4, 5, 6, 7], hour: 12, minute: 0, zone: 'America/Bogota' } }, context()) };
  const before = JSON.stringify(state); const es = notificationPlan(state, NOW);
  for (const language of ['en', 'pt'] as const) {
    const plan = notificationPlan(state, NOW, language);
    expect(plan.map(({ title: _title, body: _body, ...rest }) => rest)).toEqual(es.map(({ title: _title, body: _body, ...rest }) => rest));
    expect(plan.every(item => item.title === '📖 Leer <read> {hours}')).toBe(true);
    expect(plan.every(item => !/Es el momento|Tu actividad/.test(item.body))).toBe(true);
    expect(plan.some(item => item.body.includes(language === 'en' ? 'in 1 hour.' : 'daqui a 1 hora.'))).toBe(true);
  }
  expect(JSON.stringify(state)).toBe(before);
});

test('streak copy is localized while retaining user names verbatim outside the legacy Spanish presentation', () => {
  let state = fixture();
  for (const occurredAtMs of ['2026-10-12T17:00:00Z', '2026-10-13T17:00:00Z'].map(Date.parse)) state = execute(state, { type: 'createEntry', activityId: state.activities[0].id, occurredAtMs }, context()).state;
  state = { ...state, planning: applyPlanning(state, { type: 'setStreakAlerts', enabled: true, hour: 22, minute: 0 }, context()) };
  expect(notificationPlan(state, NOW, 'en')[0].title).toBe('📖 Keep your 3-day streak going');
  expect(notificationPlan(state, NOW, 'en')[0].body).toBe('Remember Leer <read> {hours} before the day ends.');
  expect(notificationPlan(state, NOW, 'pt')[0].body).toBe('Lembre-se de Leer <read> {hours} antes do fim do dia.');
});

test('known errors and fixed validator templates translate, while unknown provider diagnostics and user text remain exact', () => {
  for (const [source, translations] of Object.entries(errorMessages)) for (const language of ['en', 'pt'] as const) {
    expect(localizeError(language, new Error(source))).toBe(translations[language]);
    expect(localizeError('es', source)).toBe(source);
    expect(translations[language].length).toBeGreaterThan(0);
  }
  expect(localizeError('en', 'El nombre no puede estar vacío.')).toBe('The name cannot be empty.');
  expect(localizeError('pt', 'La categoría supera el límite permitido.')).toBe('A categoria excede o limite permitido.');
  expect(localizeError('en', 'Campos no válidos en repetición.')).toBe('Invalid fields in recurrence.');
  expect(localizeError('pt', 'revisión de actividad no es un objeto válido.')).toBe('Objeto inválido: revisão de atividade.');
  expect(localizeError('en', 'Campos no válidos en my user content.')).toBe('Campos no válidos en my user content.');
  expect(localizeError('pt', new Error('SQLITE_BUSY: provider timeout {activity}'))).toBe('SQLITE_BUSY: provider timeout {activity}');
  expect(localizeError('en', 'java.io.IOException: La copia supera el límite de 50 MiB.')).toBe('java.io.IOException: The backup exceeds the 50 MiB limit.');
});

test('changing language refreshes pending native copy and the channel without changing notification identity or asking permission', async () => {
  jest.clearAllMocks(); mockScheduled.clear(); jest.replaceProperty(Platform, 'OS', 'android');
  let state = fixture();
  state = { ...state, planning: applyPlanning(state, { type: 'createReminder', id: nextId(), completionEntryId: nextId(), activityId: state.activities[0].id, dueAtMs: NOW + 86_400_000, leadMinutes: [0], notifications: true }, context()) };
  const { result, rerender, unmount } = await renderHook(({ language }: { language: AppLanguage }) => useLocalNotifications(jest.fn(), language), { initialProps: { language: 'es' as AppLanguage } });
  await act(async () => { await result.current.synchronize(notificationPlan(state, NOW, 'es')); });
  const first = [...mockScheduled.values()][0];
  await rerender({ language: 'en' });
  await act(async () => { await result.current.synchronize(notificationPlan(state, NOW, 'en')); });
  const second = [...mockScheduled.values()][0];
  expect(second.identifier).toBe(first.identifier);
  expect(second.content.body).toBe('It is the time you chose for this activity.');
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(first.identifier);
  expect(Notifications.setNotificationChannelAsync).toHaveBeenLastCalledWith('dailoop-reminders-sound-v070', expect.objectContaining({ name: 'Reminders and streaks' }));
  await rerender({ language: 'pt' });
  await act(async () => { await result.current.synchronize([]); });
  expect(Notifications.setNotificationChannelAsync).toHaveBeenLastCalledWith('dailoop-reminders-sound-v070', expect.objectContaining({ name: 'Lembretes e sequências' }));
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  await unmount(); jest.restoreAllMocks();
});
