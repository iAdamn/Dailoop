import { chooseTime } from './browserTime';
import { chooseDate } from './browserCalendar';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { activityStreaks, createEmptyState, deriveReminders, execute, exportBackup, getPlanning, parseBackup, type DomainState } from '../src/domain';

const now = Date.parse('2026-10-14T17:00:00Z');
const digest = async (value: string) => createHash('sha256').update(value).digest('hex');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
const runtimeErrors = new WeakMap<Page, string[]>();
async function backup(page: Page) {
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Crear backup completo', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar backup completo', exact: true }).click();
  const path = await (await download).path();
  return parseBackup(await readFile(path!, 'utf8'), digest);
}
async function restore(page: Page, state: DomainState) {
  const file = test.info().outputPath('planning-synthetic.json');
  await writeFile(file, await exportBackup(state, { backupId: randomUUID(), exportedAtMs: now, appVersion: '0.5.0' }, digest));
  await tab(page, 'Ajustes');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restaurar un backup', exact: true }).click();
  await (await chooser).setFiles(file);
  await page.getByRole('button', { name: 'Confirmar reemplazo y restaurar', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Qué quieres registrar?', exact: true })).toBeVisible();
}
async function reminder(page: Page, date: string, time: string, alerts = false) {
  await page.getByRole('button', { name: '+ Nuevo recordatorio', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Elegir actividad Leer', exact: true }).click();
  await chooseDate(page, 'Fecha del recordatorio', date);
  await chooseTime(page, 'Hora del recordatorio', time);
  if (alerts) {
    await page.getByRole('switch', { name: 'Avisos de este recordatorio', exact: true }).click();
    for (const name of ['1 día antes', '3 horas antes', '1 hora antes', '30 min antes']) await page.getByRole('checkbox', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Elegir anticipación personalizada', exact: true }).click();
    await page.getByRole('button', { name: 'Añadir aviso personalizado', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Crear recordatorio', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(timestamp => { Date.now = () => timestamp; }, now);
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear mi primera actividad', exact: true }).click();
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill('Leer');
  await page.getByRole('button', { name: 'Crear actividad', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  test.info().annotations.push({ type: 'isolation', description: 'Fresh Playwright context; no personal browser database.' });
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test('reminder supports multiple/custom leads, persists and completes exactly one linked record', async ({ page }) => {
  await tab(page, 'Recordatorios');
  await reminder(page, '2026-10-16', '15:00', true);
  await expect(page.getByText(/Avisos:.*1 día antes.*3 horas antes.*1 hora antes.*30 min antes.*15 min antes.*Al momento/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Recordatorios completados', exact: true }).click();
  await expect(page.getByText('✓ Completado · registrado en la actividad', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true })).toHaveCount(0);
  const saved = await backup(page);
  expect(saved.state.entries).toHaveLength(1);
  expect(getPlanning(saved.state).reminders[0].leadMinutes).toEqual([1440, 180, 60, 30, 15, 0]);
  expect(deriveReminders(saved.state, now)[0].status).toBe('done');
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await restore(page, saved.state);
  await tab(page, 'Recordatorios');
  await page.getByRole('checkbox', { name: 'Recordatorios completados', exact: true }).click();
  await expect(page.getByText('✓ Completado · registrado en la actividad', { exact: true })).toHaveCount(1);
});

test('a normal record completes one matching reminder and history is inside statistics', async ({ page }) => {
  await tab(page, 'Recordatorios');
  await reminder(page, '2026-10-14', '14:00');
  await reminder(page, '2026-10-14', '15:00');
  await tab(page, 'Registro');
  await page.getByRole('button', { name: 'Registrar Leer', exact: true }).click();
  await tab(page, 'Recordatorios');
  await expect(page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true })).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Recordatorios completados', exact: true }).click();
  await expect(page.getByText('✓ Completado · registrado en la actividad', { exact: true })).toHaveCount(1);
  await tab(page, 'Estadísticas');
  await page.getByRole('button', { name: 'Ver historial', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Leer, .*registrado$/ })).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Estadísticas', selected: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Leer, .*registrado$/ })).toHaveCount(1);
  await page.getByRole('button', { name: '‹ Estadísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu ritmo', exact: true })).toBeVisible();
  await page.goto('/#tab=history');
  await expect(page.getByRole('button', { name: /^Leer, .*registrado$/ })).toHaveCount(1);
});

test('streak badges count distinct local days, remain small in every density, and alerts persist', async ({ page }) => {
  let state = createEmptyState({ databaseId: randomUUID(), nowMs: now - 10 * 86400000, zone: 'America/Bogota' });
  const activityId = randomUUID();
  state = execute(state, { type: 'createActivity', id: activityId, name: 'Leer', emoji: '📖', color: '#6F5BFF', isPrivate: false, category: null }, { nowMs: now - 9 * 86400000, operationId: randomUUID(), nextId: randomUUID }).state;
  for (const days of [2, 1]) state = execute(state, { type: 'createEntry', id: randomUUID(), activityId, occurredAtMs: now - days * 86400000, occurredZone: 'America/Bogota' }, { nowMs: now - days * 86400000, operationId: randomUUID(), nextId: randomUUID }).state;
  await restore(page, state);
  await expect(page.getByLabel('Racha de 2 días', { exact: true })).toBeVisible();
  for (const columns of [1, 2, 3, 4]) {
    await tab(page, 'Ajustes');
    await page.getByRole('checkbox', { name: `${columns} ${columns === 1 ? 'columna' : 'columnas'}`, exact: true }).click();
    await tab(page, 'Registro');
    await expect(page.getByLabel('Racha de 2 días', { exact: true })).toBeVisible();
    const size = await page.getByLabel('Racha de 2 días', { exact: true }).boundingBox();
    expect(size!.width).toBeLessThanOrEqual(30);
  }
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Registrar Leer', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Registrar Leer', exact: true })).toBeEnabled();
  }
  await expect(page.getByLabel('Racha de 3 días', { exact: true })).toBeVisible();
  await tab(page, 'Recordatorios');
  await page.getByRole('button', { name: 'Configurar avisos de racha', exact: true }).click();
  await page.getByRole('switch', { name: 'Recordarme mantener las rachas', exact: true }).click();
  await page.getByLabel('Hora del aviso de racha (HH:mm, 24 horas)', { exact: true }).fill('21:30');
  await page.getByRole('button', { name: 'Guardar avisos de racha', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  const saved = await backup(page);
  expect(getPlanning(saved.state).streakAlerts).toEqual({ enabled: true, hour: 21, minute: 30 });
  expect(activityStreaks(saved.state, now).get(activityId)?.days).toBe(3);
  await page.screenshot({ path: test.info().outputPath('streak-backup.png') });
});

test('administration dialogs and success notices retain their content through an animated exit', async ({ page }) => {
  async function closeFrames(testId: string, label: string) {
    return page.evaluate(async ({ testId, label }) => {
      const samples: { opacity: number; scale: number; present: boolean }[] = [];
      const button = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
      if (!button) throw new Error(`Missing close control ${label}`);
      button.click();
      const began = performance.now();
      while (performance.now() - began < 320) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
        const style = element ? getComputedStyle(element) : null;
        samples.push({ opacity: style ? Number(style.opacity) : 0,
          scale: style ? new DOMMatrixReadOnly(style.transform).m11 : 0, present: !!element });
      }
      return samples;
    }, { testId, label });
  }
  await page.getByRole('button', { name: 'Opciones de Leer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar actividad', exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  const dialog = await closeFrames('dialog-motion', 'Cerrar diálogo');
  expect(dialog.some(frame => frame.present && frame.opacity > 0 && frame.opacity < 0.99)).toBe(true);
  expect(dialog.at(-1)?.present).toBe(false);
  await page.getByRole('button', { name: 'Registrar Leer', exact: true }).click();
  await expect(page.getByText('✓ Registrado: Leer', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  const notice = await closeFrames('notice-motion', 'Cerrar aviso');
  expect(notice.some(frame => frame.present && frame.opacity > 0 && frame.opacity < 0.99)).toBe(true);
  expect(notice.some(frame => frame.present && frame.scale < 0.995)).toBe(true);
  expect(notice.at(-1)?.present).toBe(false);
  await tab(page, 'Estadísticas');
  await page.getByRole('button', { name: 'Ver historial', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Leer, .*registrado$/ })).toHaveCount(1);
});

test('Monday and Tuesday recurrence survives popup cancellation, reload, completion and v3 backup restore', async ({ page }) => {
  await tab(page, 'Recordatorios');
  await page.getByRole('button', { name: '+ Nuevo recordatorio', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Elegir actividad Leer', exact: true }).click();
  await page.getByRole('button', { name: 'Hora del recordatorio', exact: true }).click();
  await page.getByRole('button', { name: 'Hora 22', exact: true }).click();
  await page.getByRole('button', { name: 'Minuto 59', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hora del recordatorio', exact: true })).toContainText('13:00');
  await chooseTime(page, 'Hora del recordatorio', '09:07');
  await page.getByRole('checkbox', { name: 'Elegir días', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crear recordatorio', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Repetir los lunes', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Repetir los martes', exact: true }).click();
  await page.getByRole('switch', { name: 'Avisos de este recordatorio', exact: true }).click();
  await expect(page.getByLabel('Anticipación personalizada', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Elegir anticipación personalizada', exact: true }).click();
  await page.getByRole('button', { name: 'Aumentar días', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Repetir los lunes', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Hora del recordatorio', exact: true })).toContainText('09:07');
  await page.getByRole('button', { name: 'Elegir anticipación personalizada', exact: true }).click();
  await page.getByRole('button', { name: 'Aumentar minutos', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir aviso personalizado', exact: true }).click();
  await page.getByRole('button', { name: 'Crear recordatorio', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await expect(page.getByText('Lunes · Martes', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true })).toHaveCount(1);
  const saved = await backup(page);
  expect(saved.backup.formatVersion).toBe(3);
  expect(saved.state.entries).toHaveLength(1);
  expect(getPlanning(saved.state).reminders[0]).toMatchObject({ dueAtMs: Date.parse('2026-10-19T14:07:00Z'), leadMinutes: [16, 0], recurrence: { weekdays: [1, 2], hour: 9, minute: 7, zone: 'America/Bogota' } });
  const occurrences = deriveReminders(saved.state, now);
  expect(occurrences.map(item => ({ status: item.status, due: item.dueAtMs }))).toEqual([
    { status: 'done', due: Date.parse('2026-10-19T14:07:00Z') },
    { status: 'pending', due: Date.parse('2026-10-20T14:07:00Z') },
  ]);
  await restore(page, saved.state);
  await tab(page, 'Recordatorios');
  await expect(page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true })).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Recordatorios completados', exact: true }).click();
  await expect(page.getByText('✓ Completado · registrado en la actividad', { exact: true })).toHaveCount(1);
});

test('daily recurrence keeps the next day pending after a single completion', async ({ page }) => {
  await tab(page, 'Recordatorios');
  await page.getByRole('button', { name: '+ Nuevo recordatorio', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Elegir actividad Leer', exact: true }).click();
  await chooseTime(page, 'Hora del recordatorio', '16:41');
  await page.getByRole('checkbox', { name: 'Todos los días', exact: true }).click();
  await page.getByRole('button', { name: 'Crear recordatorio', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Completar recordatorio de Leer', exact: true })).toHaveCount(1);
  const saved = await backup(page);
  expect(saved.backup.formatVersion).toBe(3);
  expect(saved.state.entries).toHaveLength(1);
  expect(getPlanning(saved.state).reminders[0].recurrence?.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(deriveReminders(saved.state, now).map(item => ({ status: item.status, due: item.dueAtMs }))).toEqual([
    { status: 'done', due: Date.parse('2026-10-14T21:41:00Z') },
    { status: 'pending', due: Date.parse('2026-10-15T21:41:00Z') },
  ]);
});
