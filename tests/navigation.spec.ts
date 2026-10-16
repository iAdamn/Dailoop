import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { exportBackup, parseBackup } from '../src/domain';
import { createV015State, V015_NOW } from './fixtures/v015';

const publicName = 'Actividad QA 002 con nombre largo y emoji repetido';
const privateName = 'PRIVADA QA 001';
const digest = async (text: string) => createHash('sha256').update(text).digest('hex');
const errors = new WeakMap<Page, string[]>();
async function tab(page: Page, name: string) { await page.getByRole('tab', { name: name === 'Historial' ? 'Estadísticas' : name, exact: true }).click(); if (name === 'Historial') await page.getByRole('button', { name: 'Ver historial', exact: true }).click(); }
const chip = (page: Page, name: string) => page.getByRole('checkbox', { name: new RegExp(`^(?:✓ )?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
function expectPreservedById<T extends { id: string }>(before: readonly T[], after: readonly T[]) {
  const current = new Map(after.map(row => [row.id, row]));
  expect(before.map(row => current.get(row.id))).toEqual(before);
}

test.beforeEach(async ({ page }) => {
  const runtimeErrors: string[] = [];
  errors.set(page, runtimeErrors);
  page.on('pageerror', error => runtimeErrors.push(error.message));
  // Freeze only Date.now: the zone implementation needs native Date semantics.
  await page.addInitScript(now => { Date.now = () => now; }, V015_NOW);
  const state = createV015State(10, 100);
  const fixture = test.info().outputPath('navigation-synthetic-baseline.json');
  await writeFile(fixture, await exportBackup(state, {
    backupId: '16000000-0000-4000-9000-999999999999',
    exportedAtMs: V015_NOW,
    appVersion: '0.1.0',
  }, digest));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '¿Qué quieres registrar?', exact: true })).toBeVisible();
  await tab(page, 'Ajustes');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restaurar un backup', exact: true }).click();
  await (await chooser).setFiles(fixture);
  await expect(page.getByRole('heading', { name: 'Revisar restauración', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar reemplazo y restaurar', exact: true }).click();
  await expect(page.getByRole('button', { name: `Registrar ${publicName}`, exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'Navigation must not produce uncaught runtime errors').toEqual([]);
});

test('history search, activity selection and expanded filters survive leaving and returning', async ({ page }) => {
  const expectFilteredRows=async()=>{
    await expect(page.getByText('10 registros · Todo el historial · America/Bogota',{exact:true})).toBeVisible();
    // A virtualized list renders its visible window. Reveal the remaining rows
    // before counting, then restore the filter position for the return checks.
    const list=page.locator('[data-testid="entry-list"]:visible');
    await list.evaluate(element=>{element.scrollTop=element.scrollHeight;});
    await expect(page.getByRole('button',{name:new RegExp(`^${publicName}, .*registrado$`)})).toHaveCount(10);
    await list.evaluate(element=>{element.scrollTop=0;});
  };
  await tab(page, 'Historial');
  await page.getByRole('textbox', { name: 'Buscar una actividad', exact: true }).fill('QA 002');
  await page.getByRole('button', { name: 'Filtrar historial', exact: true }).click();
  await page.getByRole('switch', { name: 'Incluir actividades archivadas', exact: true }).click();
  await page.getByRole('switch', { name: 'Mostrar registros anulados', exact: true }).click();
  await chip(page, `📖 ${publicName}`).click();
  await expectFilteredRows();
  await tab(page, 'Registro');
  await tab(page, 'Estadísticas');
  await tab(page, 'Historial');
  await expect(page.getByRole('textbox', { name: 'Buscar una actividad', exact: true })).toHaveValue('QA 002');
  await expect(page.getByRole('button', { name: 'Cerrar filtros', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Incluir actividades archivadas', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Mostrar registros anulados', exact: true })).toBeChecked();
  await expect(chip(page, `📖 ${publicName}`)).toBeChecked();
  await expectFilteredRows();
});

test('statistics period and activity selection survive another tab and report back navigation', async ({ page }) => {
  await tab(page, 'Estadísticas');
  await chip(page, 'Mes').click();
  await page.getByRole('button', { name: 'Filtrar actividades', exact: true }).click();
  await chip(page, `📖 ${privateName}`).click();
  await tab(page, 'Historial');
  await tab(page, 'Estadísticas');
  await expect(chip(page, 'Mes')).toBeChecked();
  await expect(chip(page, `📖 ${privateName}`)).not.toBeChecked();
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Generar reporte', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '‹ Volver', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu ritmo', exact: true })).toBeVisible();
  await expect(chip(page, 'Mes')).toBeChecked();
  await expect(chip(page, `📖 ${privateName}`)).not.toBeChecked();
});

test('confirmed records update retained history and statistics without duplicating prior data', async ({ page }) => {
  const original = createV015State(10, 100);
  await tab(page, 'Estadísticas');
  await chip(page, 'Día').click();
  await tab(page, 'Historial');
  await page.getByRole('textbox', { name: 'Buscar una actividad', exact: true }).fill('QA 002');
  await tab(page, 'Registro');
  for (let intent = 0; intent < 2; intent++) {
    const button = page.getByRole('button', { name: `Registrar ${publicName}`, exact: true });
    await button.click();
    await expect(page.getByText(`✓ Registrado: ${publicName}`, { exact: true })).toBeVisible();
    await expect(button).toBeEnabled();
  }
  await tab(page, 'Historial');
  await expect(page.getByRole('textbox', { name: 'Buscar una actividad', exact: true })).toHaveValue('QA 002');
  await expect(page.getByText('12 registros · Todo el historial · America/Bogota',{exact:true})).toBeVisible();
  await page.locator('[data-testid="entry-list"]:visible').evaluate(element=>{element.scrollTop=element.scrollHeight;});
  await expect(page.getByRole('button', { name: new RegExp(`^${publicName}, .*registrado$`) })).toHaveCount(12);
  await tab(page, 'Estadísticas');
  await expect(chip(page, 'Día')).toBeChecked();
  // The public activity's visible count is an independent check on stale retained projections.
  await expect(page.getByText(`📖 ${publicName}`, { exact: true }).locator('..').getByText('2', { exact: true })).toBeVisible();
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Crear backup completo', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar backup completo', exact: true }).click();
  const file = await (await downloaded).path();
  const parsed = await parseBackup(await readFile(file!, 'utf8'), digest);
  expect(parsed.state.entries).toHaveLength(102);
  expect(parsed.state.entryRevisions).toHaveLength(102);
  expect(parsed.state.operations).toHaveLength(112);
  // SQLite reads rows by identity; new UUIDs may sort between older rows.
  // Preservation concerns every prior entity, not an append position in arrays.
  expectPreservedById(original.entries, parsed.state.entries);
  expectPreservedById(original.entryRevisions, parsed.state.entryRevisions);
  expectPreservedById(original.operations, parsed.state.operations);
  expect(parsed.state.activities).toEqual(original.activities);
  expect(parsed.state.activityRevisions).toEqual(original.activityRevisions);
  expect(parsed.state.settings).toEqual(original.settings);
  const originalIds = new Set(original.entries.map(entry => entry.id));
  expect(parsed.state.entries.filter(entry => !originalIds.has(entry.id)).map(entry => entry.activityId))
    .toEqual([original.activities[1].id, original.activities[1].id]);
});

test('only the active screen exposes controls and one selected tab to accessibility queries', async ({ page }) => {
  for (const name of ['Recordatorios', 'Estadísticas', 'Ajustes', 'Registro']) {
    await tab(page, name);
    await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
    await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
    if (name !== 'Registro') {
      await expect(page.getByRole('button', { name: `Registrar ${publicName}`, exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: '¿Qué quieres registrar?', exact: true })).toHaveCount(0);
    }
    if (name !== 'Historial') {
      await expect(page.getByRole('textbox', { name: 'Buscar una actividad', exact: true })).toHaveCount(0);
    }
    if (name !== 'Estadísticas') {
      await expect(page.getByRole('heading', { name: 'Tu ritmo', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Filtrar actividades/ })).toHaveCount(0);
    }
    if (name !== 'Ajustes') {
      await expect(page.getByRole('textbox', { name: 'Zona horaria para agrupar', exact: true })).toHaveCount(0);
    }
  }
});

test('a settings text draft and activity form draft survive their supported return paths', async ({ page }) => {
  await tab(page, 'Ajustes');
  await page.getByRole('textbox', { name: 'Zona horaria para agrupar', exact: true }).fill('Europe/Madrid');
  await tab(page, 'Registro');
  await page.getByRole('button', { name: `Ver detalle de ${publicName}`, exact: true }).click();
  await page.getByRole('button', { name: '‹ Volver a Registro', exact: true }).click();
  await tab(page, 'Ajustes');
  await expect(page.getByRole('textbox', { name: 'Zona horaria para agrupar', exact: true })).toHaveValue('Europe/Madrid');
  await expect(page.getByRole('button', { name: 'Guardar zona', exact: true })).toBeEnabled();
  await tab(page, 'Registro');
  await page.getByRole('button', { name: '＋ Nueva actividad', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre de la actividad', exact: true }).fill('BORRADOR_NAVEGACION');
  await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
  await expect(page.getByText('Hay cambios sin guardar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre de la actividad', exact: true })).toHaveValue('BORRADOR_NAVEGACION');
  await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Registrar BORRADOR_NAVEGACION', exact: true })).toHaveCount(0);
});

test('dragging only the bottom bar selects its destination and never creates a record', async ({ page }) => {
  const original = createV015State(10, 100);
  async function dragTab(from: string, to: string, inspectPreview = false) {
    const start = await page.getByRole('tab', { name: from, exact: true }).boundingBox();
    const end = await page.getByRole('tab', { name: to, exact: true }).boundingBox();
    expect(start).not.toBeNull(); expect(end).not.toBeNull();
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
    await page.mouse.down();
    if (inspectPreview) {
      const history = await page.getByRole('tab', { name: 'Recordatorios', exact: true }).boundingBox();
      const viewport = await page.getByTestId('tab-panel-0').boundingBox();
      expect(history).not.toBeNull(); expect(viewport).not.toBeNull();
      // Half a capsule-cell previews half of each retained screen, while the
      // committed route and accessibility destination remain unchanged.
      await page.mouse.move((start!.x + start!.width / 2 + history!.x + history!.width / 2) / 2,
        start!.y + start!.height / 2, { steps: 6 });
      await expect.poll(async () => page.getByTestId('tab-panel-0').evaluate(element => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return -matrix.m41 / element.getBoundingClientRect().width;
      })).toBeCloseTo(0.5, 1);
      const neighbour = await page.getByTestId('tab-panel-1').boundingBox();
      expect(neighbour).not.toBeNull();
      expect(neighbour!.x - viewport!.x).toBeCloseTo(viewport!.width / 2, -1);
      await expect(page.getByRole('tab', { name: 'Registro', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('textbox', { name: 'Buscar una actividad', exact: true })).toHaveCount(0);
      // A moving nonlinear displacement field refracts the actual icon/text row.
      await expect(page.getByTestId('water-lens-web')).toHaveCSS('filter', /url/);
      await expect.poll(() => page.locator('feImage').evaluate(element => parseFloat(element.getAttribute('x')!))).toBeGreaterThan(20);
      await expect(page.locator('feDisplacementMap')).toHaveAttribute('scale', '28');
    }
    await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole('tab', { name: to, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
  }
  await dragTab('Registro', 'Estadísticas', true);
  await expect(page.getByRole('heading', { name: 'Tu ritmo', exact: true })).toBeVisible();
  await dragTab('Estadísticas', 'Ajustes');
  await expect(page.getByRole('heading', { name: 'Tus ajustes', exact: true })).toBeVisible();
  await dragTab('Ajustes', 'Registro');
  await expect(page.getByRole('heading', { name: '¿Qué quieres registrar?', exact: true })).toBeVisible();
  // Suppressing the press that follows a drag must not latch keyboard or later taps.
  await page.getByRole('tab', { name: 'Recordatorios', exact: true }).focus();
  await page.getByRole('tab', { name: 'Recordatorios', exact: true }).press('Space');
  await expect(page.getByRole('tab', { name: 'Recordatorios', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Estadísticas', exact: true }).focus();
  await page.getByRole('tab', { name: 'Estadísticas', exact: true }).press('Enter');
  await expect(page.getByRole('tab', { name: 'Estadísticas', exact: true })).toHaveAttribute('aria-selected', 'true');
  await tab(page, 'Registro');
  // A horizontal drag over content is deliberately outside the navigation gesture.
  await page.mouse.move(300, 410);
  await page.mouse.down();
  await page.mouse.move(80, 410, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'Registro', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: '¿Qué quieres registrar?', exact: true })).toBeVisible();
  const home = await page.getByRole('tab', { name: 'Registro', exact: true }).boundingBox();
  expect(home).not.toBeNull();
  const x = home!.x + home!.width / 2, y = home!.y + home!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 50, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'Registro', exact: true })).toHaveAttribute('aria-selected', 'true');
  // Chromium delivers an actual trusted pointer cancellation for this input;
  // this does not substitute for cancellation on the Android recognizer.
  await page.evaluate(() => {
    window.addEventListener('pointercancel', event => {
      document.documentElement.dataset.qaPointerCancelled = String(event.isTrusted && event.pointerType === 'touch');
    }, { once: true, capture: true });
  });
  const input = await page.context().newCDPSession(page);
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 130, y }] });
  await input.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await input.detach();
  await expect(page.locator('html')).toHaveAttribute('data-qa-pointer-cancelled', 'true');
  await expect(page.getByRole('tab', { name: 'Registro', exact: true })).toHaveAttribute('aria-selected', 'true');
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Crear backup completo', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar backup completo', exact: true }).click();
  const file = await (await downloaded).path();
  const parsed = await parseBackup(await readFile(file!, 'utf8'), digest);
  expect(parsed.state).toEqual(original);
});
