import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { parseBackup } from '../src/domain';

const now = Date.parse('2026-10-14T17:00:00Z');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(timestamp => { Date.now = () => timestamp; }, now);
});

async function backup(page: Page, open: string, save: string) {
  await page.getByRole('button', { name: open, exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: save, exact: true }).click();
  const file = await (await download).path();
  return parseBackup(await readFile(file!, 'utf8'), async text => createHash('sha256').update(text).digest('hex'));
}

for (const copy of [
  { language: 'English', locale: 'en-US', settings: 'Settings', heading: 'Your settings', log: 'Log',
    create: '＋ New activity', form: 'A new activity', name: 'Activity name', category: 'Category (optional)',
    emoji: /^Change emoji, currently/, search: 'Search emoji', query: 'coffee', result: /^Choose ☕, hot beverage$/,
    close: 'Close dialog', discard: 'Discard changes', reminders: 'Reminders', newReminder: '+ New reminder', date: 'Reminder date',
    chooseDate: 'Choose this date', time: 'Reminder time', hour: 'Hour 09', minute: 'Minute 15', chooseTime: 'Choose this time',
    everyDay: 'Every day', stats: 'Statistics', history: 'View history', report: 'Generate report',
    preview: 'View preview', reportReady: 'Your report is ready', saveReport: 'Save Markdown', reportTitle: '# Dailoop — historical report',
    openBackup: 'Create full backup', saveBackup: 'Save full backup' },
  { language: 'Português', locale: 'pt-BR', settings: 'Configurações', heading: 'Suas configurações', log: 'Registro',
    create: '＋ Nova atividade', form: 'Uma nova atividade', name: 'Nome da atividade', category: 'Categoria (opcional)',
    emoji: /^Alterar emoji, atual/, search: 'Buscar emoji', query: 'café', result: /^Escolher ☕, café$/,
    close: 'Fechar janela', discard: 'Descartar alterações', reminders: 'Lembretes', newReminder: '+ Novo lembrete', date: 'Data do lembrete',
    chooseDate: 'Escolher esta data', time: 'Hora do lembrete', hour: 'Hora 09', minute: 'Minuto 15', chooseTime: 'Escolher esta hora',
    everyDay: 'Todos os dias', stats: 'Estatísticas', history: 'Ver histórico', report: 'Gerar relatório',
    preview: 'Ver prévia', reportReady: 'Seu relatório está pronto', saveReport: 'Salvar Markdown', reportTitle: '# Dailoop — relatório histórico',
    openBackup: 'Criar backup completo', saveBackup: 'Salvar backup completo' },
]) test(`${copy.locale}: full offline language, pickers, reports and unchanged backup data`, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#tab=home');
  await page.getByRole('button', { name: '＋ Nueva actividad', exact: true }).click();
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill('Cancelar');
  await page.getByLabel('Categoría (opcional)', { exact: true }).fill('Todas');
  await page.getByRole('button', { name: 'Crear actividad', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar Cancelar', exact: true }).click();
  await page.getByRole('tab', { name: 'Ajustes', exact: true }).click();
  const before = await backup(page, 'Crear backup completo', 'Guardar backup completo');
  await page.getByRole('checkbox', { name: copy.language, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.heading, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: copy.heading, exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', copy.locale);
  await context.setOffline(true);
  const after = await backup(page, copy.openBackup, copy.saveBackup);
  expect(after.state).toEqual(before.state);
  await page.getByRole('tab', { name: copy.log, exact: true }).click();
  await expect(page.getByTestId('activity-grid').getByText('Cancelar', { exact: true })).toBeVisible();
  await expect(page.getByTestId('activity-grid').getByText('Todas', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: copy.create, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.form, exact: true })).toBeVisible();
  await page.getByLabel(copy.name, { exact: true }).fill('Ajustes');
  await page.getByLabel(copy.category, { exact: true }).fill('Estadísticas');
  await page.getByRole('button', { name: copy.emoji }).click();
  await page.getByLabel(copy.search, { exact: true }).fill(copy.query);
  await page.getByRole('button', { name: copy.result }).click();
  await expect(page.getByRole('button', { name: copy.close, exact: true })).toHaveCount(1);
  await expect(page.getByLabel(copy.name, { exact: true })).toHaveValue('Ajustes');
  await expect(page.getByLabel(copy.category, { exact: true })).toHaveValue('Estadísticas');
  await page.getByRole('button', { name: copy.close, exact: true }).click();
  await page.getByRole('button', { name: copy.discard, exact: true }).click();
  await page.getByRole('tab', { name: copy.reminders, exact: true }).click();
  await page.getByRole('button', { name: copy.newReminder, exact: true }).click();
  await page.getByRole('button', { name: copy.date, exact: true }).click();
  await page.getByTestId('calendar-day-2026-10-16').click();
  await page.getByRole('button', { name: copy.chooseDate, exact: true }).click();
  await page.getByRole('button', { name: copy.time, exact: true }).click();
  await page.getByRole('button', { name: copy.hour, exact: true }).click();
  await page.getByRole('button', { name: copy.minute, exact: true }).click();
  await page.getByRole('button', { name: copy.chooseTime, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.time, exact: true })).toContainText('09:15');
  await page.getByRole('checkbox', { name: copy.everyDay, exact: true }).click();
  await expect(page.getByRole('checkbox', { name: `✓ ${copy.everyDay}`, exact: true })).toBeChecked();
  await page.screenshot({ path: test.info().outputPath(`${copy.locale}-reminder.png`) });
  await page.getByRole('button', { name: copy.close, exact: true }).click();
  await page.getByRole('button', { name: copy.discard, exact: true }).click();
  await page.getByRole('tab', { name: copy.stats, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.history, exact: true })).toBeVisible();
  await page.getByRole('button', { name: copy.report, exact: true }).click();
  await page.getByRole('button', { name: copy.preview, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.reportReady, exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: copy.saveReport, exact: true }).click();
  const markdown = await readFile((await (await download).path())!, 'utf8');
  expect(markdown).toContain(copy.reportTitle);
  expect(markdown).toContain('Cancelar');
  expect(markdown).not.toContain('reporte histórico');
  await page.getByRole('tab', { name: copy.settings, exact: true }).click();
  await page.getByRole('checkbox', { name: 'Español', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Ajustes', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
