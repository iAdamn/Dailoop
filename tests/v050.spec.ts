import { chooseDate } from './browserCalendar';
import { expect, test, type Page } from '@playwright/test';

async function tab(page: Page, name: string) { await page.getByRole('tab', { name: name === 'Historial' ? 'Estadísticas' : name, exact: true }).click(); if (name === 'Historial') await page.getByRole('button', { name: 'Ver historial', exact: true }).click(); }
async function create(page: Page, name: string, category?: string, reuse = false) {
  await page.getByRole('button', { name: '＋ Nueva actividad', exact: true }).click();
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill(name);
  if (category) {
    await page.getByLabel('Categoría (opcional)', { exact: true }).fill(category);
    if (reuse) await page.getByRole('button', { name: 'Usar categoría Lectura', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Crear actividad', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Registrar ${name}`, exact: true })).toBeVisible();
}

test('compact home reuses categories, opens folders, searches and retains both list mode and density', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await create(page, 'Leer novela', 'Lectura');
  await create(page, 'Leer ensayo', 'lect', true);
  await create(page, 'Caminar');
  // Categories no longer form an unbounded row before the activity cards.
  await expect(page.getByRole('checkbox', { name: /Lectura/ })).toHaveCount(0);
  await expect(page.getByLabel('Buscar en Registro', { exact: true })).toHaveCount(0);
  await tab(page, 'Ajustes');
  await page.getByRole('checkbox', { name: '4 columnas', exact: true }).click();
  await tab(page, 'Registro');
  await page.getByRole('button', { name: 'Ver categorías', exact: true }).click();
  const folder = page.getByRole('button', { name: 'Abrir categoría Lectura', exact: true });
  await expect(folder).toContainText('2 actividades');
  await expect(page.getByRole('button', { name: 'Ver actividades sin categoría', exact: true })).toContainText('1 actividad');
  await expect(page.getByRole('button', { name: 'Registrar Leer novela', exact: true })).toHaveCount(0);
  await folder.click();
  await expect(page.getByRole('button', { name: 'Registrar Leer novela', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar Caminar', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('activity-card-4')).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('category-folder-light.png') });
  await page.getByRole('button', { name: '‹ Todas las categorías', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Abrir categoría Lectura', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver actividades', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar actividades', exact: true }).click();
  await page.getByLabel('Buscar en Registro', { exact: true }).fill('ensayo');
  await expect(page.getByRole('button', { name: 'Registrar Leer ensayo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar Leer novela', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar búsqueda y filtro', exact: true }).click();
  await page.getByRole('button', { name: 'Filtrar categoría: Todas', exact: true }).click();
  await page.getByRole('button', { name: 'Lectura', exact: true }).click();
  await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
  await expect(page.getByTestId('activity-card-4')).toHaveCount(2);
  await page.getByRole('button', { name: 'Cerrar búsqueda', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Búsqueda activa · Lectura', exact: true })).toBeVisible();
  await tab(page, 'Historial');
  await expect(page.getByText('0 registros · Todo el historial', { exact: false })).toBeVisible();
  await tab(page, 'Registro');
  await expect(page.getByTestId('activity-card-4')).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 740 });
  // Resizing can adapt the density and remount FlatList's header. Await the
  // resulting visible controls before measuring the new layout.
  for (const name of ['＋ Nueva actividad', 'Buscar actividades', 'Ver categorías']) {
    const control = page.getByRole('button', { name, exact: true });
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: test.info().outputPath('compact-home-320.png') });
  expect(errors).toEqual([]);
});

test('notice offers X alongside Undo and automatically leaves after five seconds', async ({ page }) => {
  await page.goto('/');
  await create(page, 'Agua');
  await page.getByRole('button', { name: 'Cerrar aviso', exact: true }).click();
  const record = page.getByRole('button', { name: 'Registrar Agua', exact: true });
  await record.click();
  await expect(page.getByRole('button', { name: 'Deshacer registro de Agua', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar aviso', exact: true }).click();
  await expect(page.getByText('✓ Registrado: Agua', { exact: true })).toHaveCount(0);
  await record.click();
  await expect(page.getByText('✓ Registrado: Agua', { exact: true })).toBeVisible();
  await expect(page.getByText('✓ Registrado: Agua', { exact: true })).toHaveCount(0, { timeout: 7_000 });
  await expect(page.getByRole('button', { name: 'Deshacer registro de Agua', exact: true })).toHaveCount(0);
  await tab(page, 'Historial');
  await expect(page.getByText('2 registros · Todo el historial', { exact: false })).toBeVisible();
});

test('subtle glass header stays fixed while the body scrolls in both themes', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Ajustes');
  for (const theme of ['Claro', 'Oscuro']) {
    await page.getByRole('checkbox', { name: theme, exact: true }).click();
    const header = page.getByTestId('brand-header');
    const before = await header.boundingBox();
    await expect(header).toHaveCSS('border-radius', '24px');
    await expect(header).toContainText('Dailoop');
    await expect(header).toContainText('En tu dispositivo');
    await page.getByText('Acerca de esta preview', { exact: true }).scrollIntoViewIfNeeded();
    expect((await header.boundingBox())!.y).toBe(before!.y);
    await page.screenshot({ path: test.info().outputPath(`fixed-header-${theme}.png`) });
    await page.getByRole('checkbox', { name: /^(?:✓ )?Claro$/, exact: true }).scrollIntoViewIfNeeded();
  }
});

test('register ellipsis supports past-time recording in all densities without accidental quick records', async ({ page }) => {
  await page.addInitScript(() => { Date.now = () => Date.parse('2026-10-14T17:00:00Z'); });
  await page.goto('/');
  await create(page, 'Algo que hice antes');
  for (const columns of [1, 2, 3, 4]) {
    await tab(page, 'Ajustes');
    await page.getByRole('checkbox', { name: `${columns} ${columns === 1 ? 'columna' : 'columnas'}`, exact: true }).click();
    await tab(page, 'Registro');
    const later = page.getByRole('button', { name: 'Registrar Algo que hice antes en otra fecha', exact: true });
    await expect(later).toBeVisible();
    const box = (await later.boundingBox())!;
    expect(Number(box.width.toFixed(3))).toBeGreaterThanOrEqual(48);
    expect(Number(box.height.toFixed(3))).toBeGreaterThanOrEqual(48);
    await later.click();
    await chooseDate(page, 'Fecha', '2026-10-13');
    await page.getByLabel('Hora (HH:mm, 24 horas)', { exact: true }).fill(`0${columns}:30`);
    await page.getByRole('button', { name: 'Revisar antes de guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
    await expect(page.getByTestId('dialog-motion')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`past-record-${columns}-columns.png`) });
  }
  await tab(page, 'Historial');
  await expect(page.getByText('4 registros · Todo el historial', { exact: false })).toBeVisible();
  for (const hour of ['01:30', '02:30', '03:30', '04:30']) {
    await expect(page.getByRole('button', { name: `Algo que hice antes, ${hour}, registrado`, exact: true })).toBeVisible();
  }
});
