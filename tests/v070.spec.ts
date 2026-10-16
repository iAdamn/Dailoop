import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createEmptyState, execute, exportBackup, parseBackup, type Command, type DomainState } from '../src/domain';
import { chooseDate } from './browserCalendar';

const now = Date.parse('2026-10-16T18:00:00Z');
const hash = async (value: string) => createHash('sha256').update(value).digest('hex');
const failures = new WeakMap<BrowserContext, { errors: string[]; external: string[] }>();

test.beforeEach(async ({ page, context, baseURL }) => {
  const errors: string[] = [], external: string[] = [];
  failures.set(context, { errors, external });
  page.on('pageerror', error => errors.push(error.message));
  await context.route(/^https?:\/\//, route => {
    if (new URL(route.request().url()).origin === new URL(baseURL!).origin) return route.continue();
    external.push(route.request().url()); return route.abort('blockedbyclient');
  });
  await page.addInitScript(timestamp => { Date.now = () => timestamp; }, now);
  await page.goto('/#tab=home');
  await expect(page.getByRole('button', { name: '＋ Nueva actividad', exact: true })).toBeVisible();
});
test.afterEach(async ({ context }) => { const result = failures.get(context); expect(result?.errors, 'No uncaught browser errors').toEqual([]); expect(result?.external, 'No unexpected external services').toEqual([]); });

async function tab(page: Page, name: string) {
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await page.getByRole('tab', { name, exact: true }).click();
}
async function createActivity(page: Page, name: string, category: string) {
  await page.getByRole('button', { name: '＋ Nueva actividad', exact: true }).click();
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill(name);
  await page.getByLabel('Categoría (opcional)', { exact: true }).fill(category);
  await page.getByRole('button', { name: 'Crear actividad', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Registrar ${name}`, exact: true })).toBeVisible();
}
async function backup(page: Page): Promise<DomainState> {
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Crear backup completo', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar backup completo', exact: true }).click();
  const file = await (await downloading).path();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  return (await parseBackup(await readFile(file!, 'utf8'), hash)).state;
}
async function gridOrder(page: Page) {
  return page.getByTestId('activity-grid').locator('[aria-label^="Ver detalle de "]').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')!.replace('Ver detalle de ', '')));
}
async function organizerOrder(page: Page) {
  return page.locator('[data-testid^="organizer-row-"]').locator('[aria-label^="Ordenar "]').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')!.replace('Ordenar ', '')));
}

test('0.7 real pointer drag, pins, reload and category/search filters preserve the canonical dataset', async ({ page }) => {
  for (const [name, category] of [['Alpha', 'Focus'], ['Beta', 'Health'], ['Gamma', 'Focus']]) await createActivity(page, name, category);
  const before = await backup(page);
  await tab(page, 'Registro');
  await expect.poll(() => gridOrder(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
  await page.getByRole('button', { name: 'Organizar actividades', exact: true }).click();
  const source = await page.getByLabel('Ordenar Alpha', { exact: true }).boundingBox();
  const target = await page.getByLabel('Ordenar Gamma', { exact: true }).boundingBox();
  expect(source).not.toBeNull(); expect(target).not.toBeNull();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2 + 8, { steps: 16 });
  await page.mouse.up();
  await expect.poll(() => organizerOrder(page)).toEqual(['Beta', 'Gamma', 'Alpha']);
  await page.getByRole('button', { name: 'Guardar organización', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await expect.poll(() => gridOrder(page)).toEqual(['Beta', 'Gamma', 'Alpha']);
  await page.getByRole('button', { name: 'Organizar actividades', exact: true }).click();
  await page.getByRole('button', { name: 'Fijar Alpha', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar organización', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await expect.poll(() => gridOrder(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
  await expect(page.getByLabel('Actividad fijada', { exact: true })).toHaveCount(1);
  await page.reload();
  await expect.poll(() => gridOrder(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
  await expect(page.getByLabel('Actividad fijada', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver categorías', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir categoría Focus', exact: true }).click();
  await expect.poll(() => gridOrder(page)).toEqual(['Alpha', 'Gamma']);
  await page.getByRole('button', { name: 'Ver actividades', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar actividades', exact: true }).click();
  await page.getByLabel('Buscar en Registro', { exact: true }).fill('Gamma');
  await expect.poll(() => gridOrder(page)).toEqual(['Gamma']);
  const after = await backup(page);
  expect(after).toEqual(before);
});

function calendarFixture() {
  let sequence = 1;
  const nextId = () => `71000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
  let state = createEmptyState({ databaseId: nextId(), nowMs: Date.parse('2026-01-01T00:00:00Z'), zone: 'America/Bogota' });
  const run = (command: Command) => { const result = execute(state, command, { nowMs: now, operationId: nextId(), nextId }); state = result.state; return result.result; };
  const read = run({ type: 'createActivity', name: 'Lectura calendario', emoji: '📖', color: '#6F5BFF', category: 'Focus' }).activityId!;
  const walk = run({ type: 'createActivity', name: 'Paseo calendario', emoji: '🌱', color: '#8FD8FF', category: 'Health' }).activityId!;
  run({ type: 'createEntry', activityId: read, occurredAtMs: Date.parse('2026-10-15T02:00:00Z') });
  const corrected = run({ type: 'createEntry', activityId: read, occurredAtMs: Date.parse('2026-10-15T13:00:00Z') }).entryId!;
  run({ type: 'correctEntry', entryId: corrected, occurredAtMs: Date.parse('2026-10-14T13:00:00Z') });
  run({ type: 'createEntry', activityId: walk, occurredAtMs: Date.parse('2026-10-15T14:00:00Z') });
  const voided = run({ type: 'createEntry', activityId: walk, occurredAtMs: Date.parse('2026-10-15T15:00:00Z') }).entryId!;
  run({ type: 'voidEntry', entryId: voided });
  return { state, backupId: nextId() };
}
test('0.7 calendar uses corrected/voided local days, filter, graphical date jump and existing entry detail', async ({ page }) => {
  const fixture = calendarFixture(), fixtureFile = test.info().outputPath('calendar-fixture.json');
  await writeFile(fixtureFile, await exportBackup(fixture.state, { backupId: fixture.backupId, exportedAtMs: now, appVersion: '0.7.0' }, hash));
  await tab(page, 'Ajustes');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restaurar un backup', exact: true }).click();
  await (await choosing).setFiles(fixtureFile);
  await page.getByRole('button', { name: 'Confirmar reemplazo y restaurar', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await tab(page, 'Estadísticas');
  await expect(page.getByTestId('activity-calendar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver calendario', exact: true }).click();
  await page.getByTestId('activity-calendar-day-2026-10-14').click();
  await expect(page.getByText('2 registros en este día', { exact: true })).toBeVisible();
  await expect(page.getByText('3 registros en este mes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '📖 Lectura calendario · 21:00', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Corregir registro', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filtrar actividades', exact: true }).click();
  await page.getByRole('checkbox', { name: '🌱 Paseo calendario', exact: true }).click();
  await expect(page.getByText('0 registros en este día', { exact: true })).toBeVisible();
  await page.getByTestId('activity-calendar-day-2026-10-15').click();
  await expect(page.getByText('1 registros en este día', { exact: true })).toBeVisible();
  await expect(page.getByTestId('activity-calendar-day-2026-10-17')).toBeDisabled();
  await chooseDate(page, 'Ir a una fecha', '2026-09-07');
  // RN Web omits aria-selected on a button role. Verify the actual selected
  // date through the visible day detail rather than a platform-specific attribute.
  await expect(page.getByText('lunes, 7 de septiembre de 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('0 registros en este día', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '‹ Estadísticas', exact: true }).click();
  await expect(page.getByTestId('activity-calendar')).toHaveCount(0);
  expect(await backup(page)).toEqual(fixture.state);
});

test('0.7 independent sensory preferences persist through ES/EN/PT and reload without changing data', async ({ page }) => {
  await createActivity(page, 'Ajustes', 'Estadísticas');
  const before = await backup(page);
  await page.getByRole('switch', { name: 'Vibración háptica', exact: true }).click();
  await page.getByRole('switch', { name: 'Sonidos al navegar', exact: true }).click();
  await page.getByRole('switch', { name: 'Sonidos de confirmación', exact: true }).click();
  await page.getByRole('switch', { name: 'Sonidos de la interfaz', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Sonido de los avisos', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Sonido de los avisos', exact: true })).toBeEnabled();
  await page.reload();
  for (const name of ['Vibración háptica', 'Sonidos de la interfaz', 'Sonidos al navegar', 'Sonidos de confirmación']) await expect(page.getByRole('switch', { name, exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'English', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Haptic vibration', exact: true })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Notification sounds', exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Navigation sounds', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Português', exact: true }).click();
  await page.getByRole('switch', { name: 'Som dos avisos', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Som dos avisos', exact: true })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Vibração háptica', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Español', exact: true }).click();
  expect(await backup(page)).toEqual(before);
});
