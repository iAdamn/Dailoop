import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { DomainState } from '../src/domain/types';

const now = new Date('2026-10-12T17:00:00.000Z');
const externalRequests = new WeakMap<BrowserContext, string[]>();
const runtimeErrors = new WeakMap<BrowserContext, string[]>();

async function freezeNow(page: Page) {
  // Keep native Date subclass semantics used by TZDate; Playwright's fake Date breaks those semantics.
  await page.addInitScript(timestamp => { Date.now = () => timestamp; }, now.getTime());
}

async function expectBundledTypography(page: Page) {
  const heading = page.getByRole('heading', { name: '¿Qué quieres registrar?', exact: true });
  await expect(heading).toBeVisible();
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded: { family: string; status: string }[] = [];
    document.fonts.forEach(face => loaded.push({ family: face.family.replace(/["']/g, ''), status: face.status }));
    return loaded;
  });
  // FontFaceSet.check alone also succeeds for some unavailable families through fallback.
  for (const family of ['Outfit-SemiBold', 'Outfit-Bold', 'Manrope-Regular', 'Manrope-Medium', 'Manrope-SemiBold', 'Manrope-Bold']) {
    expect(faces, `La fuente local ${family} debe estar cargada antes de medir la interfaz`).toContainEqual({ family, status: 'loaded' });
  }
  await expect(heading).toHaveCSS('font-family', /^['"]?Outfit-Bold['"]?(?:,|$)/);
  await expect(page.getByText('Las pequeñas cosas también tienen su historia.', { exact: true }))
    .toHaveCSS('font-family', /^['"]?Manrope-Regular['"]?(?:,|$)/);
  await expect(page.getByRole('button', { name: '＋ Nueva actividad', exact: true }).getByText('＋ Nueva actividad', { exact: true }))
    .toHaveCSS('font-family', /^['"]?Manrope-Bold['"]?(?:,|$)/);
}

async function awaitImages(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image => image.decode()));
    // RN Web reflects decoded image state in a subsequent frame.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function tab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}

async function createActivity(page: Page, name: string, isPrivate = false) {
  await tab(page, 'Inicio');
  await page.getByRole('button', { name: '＋ Nueva actividad', exact: true }).click();
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill(name);
  await page.getByRole('button', { name: /^Cambiar emoji, actual / }).click();
  await page.getByRole('button', { name: 'Usar mi teclado', exact: true }).click();
  await page.getByLabel('Escribe o pega un emoji', { exact: true }).fill('📖');
  await page.getByRole('button', { name: 'Usar este emoji', exact: true }).click();
  if (isPrivate) await page.getByRole('switch', { name: 'Actividad privada', exact: true }).click();
  await page.getByRole('button', { name: 'Crear actividad', exact: true }).click();
  await expect(page.getByRole('button', { name: `Registrar ${name}`, exact: true })).toBeVisible();
}

async function record(page: Page, name: string) {
  const button = page.getByRole('button', { name: `Registrar ${name}`, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText(`✓ Registrado: ${name}`, { exact: true })).toBeVisible();
  await expect(button).toBeEnabled();
}

async function retroactive(page: Page, name: string, time: string, note: string) {
  await page.getByRole('button', { name: `Ver detalle de ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Registrar otra fecha', exact: true }).click();
  await page.getByLabel('Fecha (AAAA-MM-DD)', { exact: true }).fill('2026-09-07');
  await page.getByLabel('Hora (HH:mm, 24 horas)', { exact: true }).fill(time);
  await page.getByLabel('Nota (opcional)', { exact: true }).fill(note);
  await page.getByRole('button', { name: 'Revisar antes de guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByText(/^1 registros? vigentes?$/)).toBeVisible();
  await tab(page, 'Inicio');
}

async function exportBackup(page: Page) {
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Crear backup completo', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar backup completo', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^dailoop-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const text = await readFile(path!, 'utf8');
  return { path: path!, text, content: JSON.parse(text) };
}

async function chooseBackup(page: Page, path: string) {
  await tab(page, 'Ajustes');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restaurar un backup', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(path);
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const unexpected: string[] = [];
  externalRequests.set(context, unexpected);
  const errors: string[] = [];
  runtimeErrors.set(context, errors);
  const watchErrors = (document: Page) => {
    document.on('pageerror', error => errors.push(error.message));
    document.on('console', message => {
      if (message.text().includes('Unexpected text node:')) errors.push(message.text());
    });
  };
  watchErrors(page);
  context.on('page', watchErrors);
  await context.route(/^https?:\/\//, async route => {
    if (new URL(route.request().url()).origin !== new URL(baseURL!).origin) {
      unexpected.push(route.request().url());
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await freezeNow(page);
  const response = await page.goto('/');
  expect(response?.headers()['cross-origin-opener-policy'], 'La ruta principal debe recibir COOP').toBe('same-origin');
  expect(response?.headers()['cross-origin-embedder-policy'], 'La ruta principal debe recibir COEP').toBe('require-corp');
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);
  await expect(page.getByRole('tab', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(page.getByText('Cada cosa tiene su momento', { exact: true })).toBeVisible();
  await expectBundledTypography(page);
});

test.afterEach(async ({ context }) => {
  expect(externalRequests.get(context) ?? [], 'Los recorridos deben usar solo código, archivos y almacenamiento locales').toEqual([]);
  expect(runtimeErrors.get(context) ?? [], 'La app no debe producir errores sin capturar ni nodos de texto inválidos').toEqual([]);
});

test('registra dos intenciones, persiste y conserva cuatro revisiones al corregir/anular/restaurar', async ({ page }) => {
  await createActivity(page, 'Lectura QA');
  await record(page, 'Lectura QA');
  await expect(page.getByText(/1 registro hoy · 1 actividad(?:es)? activas?/)).toBeVisible();
  await record(page, 'Lectura QA');
  await expect(page.getByText(/2 registros hoy · 1 actividad(?:es)? activas?/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/2 registros hoy · 1 actividad(?:es)? activas?/)).toBeVisible();
  await tab(page, 'Historial');
  await expect(page.getByRole('button', { name: /^Lectura QA, .*registrado$/ })).toHaveCount(2);
  await page.getByRole('button', { name: /^Lectura QA, .*registrado$/ }).first().click();
  await page.getByRole('button', { name: 'Corregir registro', exact: true }).click();
  await page.getByLabel('Fecha (AAAA-MM-DD)', { exact: true }).fill('2026-10-11');
  await page.getByLabel('Hora (HH:mm, 24 horas)', { exact: true }).fill('09:30');
  await page.getByLabel('Nota (opcional)', { exact: true }).fill('CORRECCIONQA');
  await page.getByRole('button', { name: 'Revisar antes de guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar corrección', exact: true }).click();
  const corrected = page.getByRole('button', { name: /^Lectura QA, .*con cambios$/ });
  await expect(corrected).toHaveCount(1);
  await corrected.click();
  await page.getByRole('button', { name: 'Ver cambios (2)', exact: true }).click();
  await expect(page.getByText('1. Registrado', { exact: true })).toBeVisible();
  await expect(page.getByText('2. Corregido', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Anular registro', exact: true }).click();
  await page.getByRole('button', { name: 'Anular registro', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Lectura QA, .*registrado$/ })).toHaveCount(1);
  await expect(corrected).toHaveCount(0);
  await page.getByRole('button', { name: 'Filtrar historial', exact: true }).click();
  await page.getByRole('switch', { name: 'Mostrar registros anulados', exact: true }).click();
  await page.getByRole('button', { name: /^Lectura QA, .*anulado$/ }).click();
  await page.getByRole('button', { name: 'Restaurar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar registro', exact: true }).click();
  await corrected.click();
  await page.getByRole('button', { name: 'Ver cambios (4)', exact: true }).click();
  for (const label of ['1. Registrado', '2. Corregido', '3. Anulado', '4. Restaurado']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
  await tab(page, 'Inicio');
  await expect(page.getByText(/1 registro hoy · 1 actividad(?:es)? activas?/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver detalle de Lectura QA', exact: true }).click();
  await expect(page.getByText('2 registros vigentes', { exact: true })).toBeVisible();
});

test('editar, archivar y restaurar una actividad conserva identidades y registros originales en backups reales', async ({ page }) => {
  const originalName = 'Lectura original QA';
  const updatedName = 'Lectura renovada QA';
  await createActivity(page, originalName);
  await record(page, originalName);
  await record(page, originalName);
  const original = (await exportBackup(page)).content.payload as DomainState;
  expect(original.activities).toHaveLength(1);
  expect(original.entries).toHaveLength(2);
  expect(original.entryRevisions).toHaveLength(2);
  const activityId = original.activities[0].id;
  const originalRevision = original.activityRevisions[0];
  const assertOriginalRecords = (state: DomainState) => {
    expect(state.meta).toEqual(original.meta);
    expect(state.activities).toEqual(original.activities);
    expect(state.entries).toEqual(original.entries);
    expect(state.entryRevisions).toEqual(original.entryRevisions);
    for (const operation of original.operations) {
      expect(state.operations.find(candidate => candidate.id === operation.id)).toEqual(operation);
    }
  };

  await tab(page, 'Inicio');
  await page.getByRole('button', { name: `Opciones de ${originalName}`, exact: true }).click();
  await page.getByRole('button', { name: 'Editar actividad', exact: true }).click();
  await page.getByLabel('Nombre de la actividad', { exact: true }).fill(updatedName);
  await page.getByRole('button', { name: /^Cambiar emoji, actual / }).click();
  await page.getByRole('button', { name: 'Usar mi teclado', exact: true }).click();
  await page.getByLabel('Escribe o pega un emoji', { exact: true }).fill('🌿');
  await page.getByRole('button', { name: 'Usar este emoji', exact: true }).click();
  await page.getByRole('radio', { name: 'Celeste', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Celeste', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('button', { name: `Registrar ${updatedName}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Registrar ${originalName}`, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: `Opciones de ${updatedName}`, exact: true }).click();
  await page.getByRole('button', { name: 'Archivar actividad', exact: true }).click();
  await page.getByRole('button', { name: 'Archivar actividad', exact: true }).click();
  await expect(page.getByText('✓ Actividad archivada', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Ver detalle de ${updatedName}`, exact: true })).toHaveCount(0);

  await tab(page, 'Historial');
  const historyRows = page.getByRole('button', { name: /^Lectura renovada QA, .*registrado$/ });
  await expect(historyRows).toHaveCount(0);
  await page.getByRole('button', { name: 'Filtrar historial', exact: true }).click();
  await page.getByRole('switch', { name: 'Incluir actividades archivadas', exact: true }).click();
  await expect(historyRows).toHaveCount(2);
  await historyRows.first().click();
  await page.getByRole('button', { name: 'Ver cambios (1)', exact: true }).click();
  await expect(page.getByText(`Actividad en ese momento: ${originalName}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
  const archived = (await exportBackup(page)).content.payload as DomainState;
  assertOriginalRecords(archived);
  const archivedRevisions = archived.activityRevisions.filter(revision => revision.activityId === activityId)
    .sort((left, right) => left.revisionNo - right.revisionNo);
  expect(archivedRevisions).toHaveLength(3);
  expect(archivedRevisions[0]).toEqual(originalRevision);
  expect(archivedRevisions[1]).toMatchObject({ name: updatedName, emoji: '🌿', color: '#8FD8FF', isArchived: false, previousRevisionId: originalRevision.id });
  expect(archivedRevisions[2]).toMatchObject({ name: updatedName, emoji: '🌿', color: '#8FD8FF', isArchived: true, previousRevisionId: archivedRevisions[1].id });
  expect(archived.operations).toHaveLength(original.operations.length + 2);

  await tab(page, 'Inicio');
  await page.getByRole('checkbox', { name: /^(?:✓ )?Archivadas$/ }).click();
  await expect(page.getByRole('button', { name: `Ver detalle de ${updatedName}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Registrar ${updatedName}`, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: `Opciones de ${updatedName}`, exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar actividad', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar actividad', exact: true }).click();
  await expect(page.getByText('✓ Actividad restaurada', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /^(?:✓ )?Activas$/ }).click();
  await expect(page.getByRole('button', { name: `Registrar ${updatedName}`, exact: true })).toBeEnabled();
  await expect(page.getByText(/2 registros hoy · 1 actividad activa/)).toBeVisible();
  const restored = (await exportBackup(page)).content.payload as DomainState;
  assertOriginalRecords(restored);
  const finalRevisions = restored.activityRevisions.filter(revision => revision.activityId === activityId)
    .sort((left, right) => left.revisionNo - right.revisionNo);
  expect(finalRevisions).toHaveLength(4);
  expect(finalRevisions.slice(0, 3)).toEqual(archivedRevisions);
  expect(finalRevisions[3]).toMatchObject({ name: updatedName, emoji: '🌿', color: '#8FD8FF', isArchived: false, previousRevisionId: archivedRevisions[2].id });
  expect(restored.operations).toHaveLength(original.operations.length + 3);
  await page.reload();
  await tab(page, 'Historial');
  await expect(historyRows).toHaveCount(2);
});

test('descarga el Markdown histórico exacto y excluye actividad privada y notas de la auditoría', async ({ page }, testInfo) => {
  await createActivity(page, 'Lectura pública QA');
  await retroactive(page, 'Lectura pública QA', '09:15', 'NOTAPUBLICASECRETA');
  await createActivity(page, 'ACTIVIDADPRIVADASECRETA', true);
  await retroactive(page, 'ACTIVIDADPRIVADASECRETA', '10:30', 'NOTAPRIVADASECRETA');
  await tab(page, 'Estadísticas');
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await page.getByRole('button', { name: 'Período anterior', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /ACTIVIDADPRIVADASECRETA/ })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Notas', exact: true })).not.toBeChecked();
  const auditToggle = page.getByRole('switch', { name: 'Auditoría de los registros incluidos', exact: true });
  await auditToggle.focus();
  await auditToggle.press('Space');
  await expect(auditToggle).toBeChecked();
  await awaitImages(page);
  await page.screenshot({ path: testInfo.outputPath('reporte-seleccion-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Ver vista previa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu reporte está listo', exact: true })).toBeInViewport({ ratio: 1 });
  const preview = page.getByLabel('Vista previa exacta del reporte Markdown', { exact: true });
  await expect(preview).toContainText('Período: 2026-09-01 a 2026-09-30 (completo)');
  const expected = await preview.textContent();
  expect(expected).toContain('1 registros en 1 actividades');
  expect(expected).toContain('09:15:00 -05:00');
  expect(expected).toContain('## Auditoría');
  for (const secret of ['ACTIVIDADPRIVADASECRETA', 'NOTAPUBLICASECRETA', 'NOTAPRIVADASECRETA']) expect(expected).not.toContain(secret);
  await awaitImages(page);
  await page.screenshot({ path: testInfo.outputPath('reporte-markdown-390.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar Markdown', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('dailoop-reporte-2026-09-01_a_2026-09-30.md');
  const path = await download.path();
  expect(await readFile(path!, 'utf8')).toBe(expected);
  await page.getByRole('button', { name: '‹ Ajustar selección', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Generar reporte', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(auditToggle).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /ACTIVIDADPRIVADASECRETA/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Ninguna', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver vista previa', exact: true })).toBeDisabled();
});

test('backup real: cancelar conserva cambios; restaurar reemplaza; repetir no duplica; corrupción no muta', async ({ page }, testInfo) => {
  await createActivity(page, 'Backup QA');
  await record(page, 'Backup QA');
  const initial = await exportBackup(page);
  expect(initial.content.payload.entries).toHaveLength(1);
  expect(initial.content.payload.entryRevisions).toHaveLength(1);
  await tab(page, 'Inicio');
  await record(page, 'Backup QA');
  await expect(page.getByText(/2 registros hoy/)).toBeVisible();
  await chooseBackup(page, initial.path);
  await page.getByRole('button', { name: 'Cancelar sin cambiar datos', exact: true }).click();
  await tab(page, 'Inicio');
  await expect(page.getByText(/2 registros hoy/)).toBeVisible();

  for (let round = 0; round < 2; round++) {
    await chooseBackup(page, initial.path);
    await page.getByRole('button', { name: 'Confirmar reemplazo y restaurar', exact: true }).click();
    await expect(page.getByText(/Backup restaurado y verificado/)).toBeVisible();
    const restored = await exportBackup(page);
    expect(restored.content.payload).toEqual(initial.content.payload);
  }
  const bad = JSON.parse(initial.text);
  bad.payload.entryRevisions[0].note = 'ALTERADO SIN ACTUALIZAR CHECKSUM';
  const corruptPath = testInfo.outputPath('backup-corrupto.json');
  await writeFile(corruptPath, JSON.stringify(bad), 'utf8');
  await chooseBackup(page, corruptPath);
  const visibleError = page.getByText(/No se importó ningún dato.*checksum incorrecto/).filter({ visible: true });
  await expect(visibleError).toHaveCount(1);
  await expect(visibleError).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar reemplazo y restaurar', exact: true })).toHaveCount(0);
  const unaffected = await exportBackup(page);
  expect(unaffected.content.payload).toEqual(initial.content.payload);
  await page.reload();
  await tab(page, 'Inicio');
  await expect(page.getByText(/1 registro hoy/)).toBeVisible();
});

test('segunda pestaña muestra snapshot de solo lectura y adquiere escritura al cerrar la primera', async ({ page, context }) => {
  await createActivity(page, 'Pestañas QA');
  const second = await context.newPage();
  await freezeNow(second);
  await second.goto('/');
  await expect(second.getByRole('alert')).toContainText('Solo lectura');
  await expect(second.getByRole('button', { name: 'Ver detalle de Pestañas QA', exact: true })).toBeVisible();
  await record(page, 'Pestañas QA');
  await expect(second.getByText(/1 registro hoy/)).toBeVisible();
  await expect(second.getByRole('button', { name: 'Registrar Pestañas QA', exact: true })).toBeDisabled();
  await page.close();
  await second.reload();
  await expect(second.getByRole('alert')).toHaveCount(0);
  await expect(second.getByText(/1 registro hoy/)).toBeVisible();
  await record(second, 'Pestañas QA');
  await expect(second.getByText(/2 registros hoy/)).toBeVisible();
});

test('la demostración y sus cambios permanecen separados de la base personal', async ({ page }) => {
  await createActivity(page, 'Solo personal QA');
  await record(page, 'Solo personal QA');
  const personal = await exportBackup(page);
  await page.getByRole('button', { name: 'Explorar con datos de demostración', exact: true }).click();
  await expect(page.getByText(/Demostración: datos ficticios en una base separada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar Leer un rato', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar Solo personal QA', exact: true })).toHaveCount(0);
  await createActivity(page, 'Solo demostración QA');
  await record(page, 'Solo demostración QA');
  const demo = await exportBackup(page);
  expect(demo.content.payload.meta.databaseId).not.toBe(personal.content.payload.meta.databaseId);
  expect(demo.text).not.toContain('Solo personal QA');
  await page.getByRole('button', { name: 'Volver a mis datos', exact: true }).click();
  await expect(page.getByText(/Tus datos personales están abiertos/)).toBeVisible();
  await expect(page.getByText(/1 registro hoy · 1 actividad(?:es)? activas?/)).toBeVisible();
  const preserved = await exportBackup(page);
  expect(preserved.content.payload).toEqual(personal.content.payload);
  await page.getByRole('button', { name: 'Explorar con datos de demostración', exact: true }).click();
  await expect(page.getByText(/Demostración: datos ficticios en una base separada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar Solo demostración QA', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver detalle de Solo demostración QA', exact: true }).click();
  await expect(page.getByText(/^1 registros? vigentes?$/)).toBeVisible();
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reiniciar demostración', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await tab(page, 'Inicio');
  await expect(page.getByRole('button', { name: 'Registrar Solo demostración QA', exact: true })).toBeVisible();
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reiniciar demostración', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar reinicio de demostración', exact: true }).click();
  await expect(page.getByText(/Demostración reiniciada. Tus datos personales se conservan./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar Leer un rato', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar Solo demostración QA', exact: true })).toHaveCount(0);
  const resetDemo = await exportBackup(page);
  expect(resetDemo.content.payload.meta.databaseId).not.toBe(demo.content.payload.meta.databaseId);
  await page.getByRole('button', { name: 'Volver a mis datos', exact: true }).click();
  await expect(page.getByText(/Tus datos personales están abiertos/)).toBeVisible();
  const afterDemoReset = await exportBackup(page);
  expect(afterDemoReset.content.payload).toEqual(personal.content.payload);
});

test('pantallas claro/oscuro encajan en 360, 390, 430 y escritorio sin depender de recursos externos', async ({ page }, testInfo) => {
  await page.reload();
  await expectBundledTypography(page);
  await createActivity(page, 'Leer un rato y tomar café ☕');
  await record(page, 'Leer un rato y tomar café ☕');
  for (const theme of ['Claro', 'Oscuro']) {
    await tab(page, 'Ajustes');
    const themeControl = page.getByRole('checkbox', { name: new RegExp(`^(?:✓ )?${theme}$`) });
    await themeControl.focus();
    await themeControl.press('Space');
    await expect(themeControl).toBeChecked();
    await expect(themeControl).toBeFocused();
    const focusRing = await themeControl.evaluate(element => {
      const style = getComputedStyle(element);
      return { color: style.outlineColor, style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    // Approved focus tokens: violet #6F5BFF in light, lavender #DCCFFF in dark.
    expect(focusRing.color).toBe(theme === 'Oscuro' ? 'rgb(220, 207, 255)' : 'rgb(111, 91, 255)');
    expect(focusRing.style).toBe('solid');
    expect(focusRing.width).toBeGreaterThanOrEqual(2);
    await tab(page, 'Inicio');
    for (const width of [360, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 920 });
      await expect(page.getByRole('button', { name: 'Registrar Leer un rato y tomar café ☕', exact: true })).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `Ancho desbordado: ${theme} ${width}px`).toBeLessThanOrEqual(width + 1);
      await awaitImages(page);
      await page.screenshot({ path: testInfo.outputPath(`inicio-${theme.toLowerCase()}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 920 });
    for (const screen of ['Historial', 'Estadísticas', 'Ajustes']) {
      await tab(page, screen);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
      await awaitImages(page);
      await page.screenshot({ path: testInfo.outputPath(`${screen.toLowerCase()}-${theme.toLowerCase()}-390.png`), fullPage: true });
    }
  }
});

test('inicio conserva registro accesible con simulación Web de texto al 200 por ciento', async ({ page }, testInfo) => {
  await createActivity(page, 'Leer un rato y tomar café ☕');
  await page.setViewportSize({ width: 390, height: 920 });
  await expectBundledTypography(page);
  // This browser-only stress test doubles text metrics; it does not certify Android font scaling.
  await page.evaluate(() => {
    const textElements = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter(element => Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()));
    const metrics = textElements.map(element => {
      const computed = getComputedStyle(element);
      return { element, fontSize: parseFloat(computed.fontSize), lineHeight: parseFloat(computed.lineHeight) };
    });
    for (const { element, fontSize, lineHeight } of metrics) {
      element.style.fontSize = `${fontSize * 2}px`;
      if (Number.isFinite(lineHeight)) element.style.lineHeight = `${lineHeight * 2}px`;
    }
  });
  const recordButton = page.getByRole('button', { name: 'Registrar Leer un rato y tomar café ☕', exact: true });
  await recordButton.scrollIntoViewIfNeeded();
  await expect(recordButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  const tabLabels = await page.getByRole('tab').evaluateAll(tabs => tabs.map(tab => {
    const label = Array.from(tab.querySelectorAll<HTMLElement>('*')).find(element =>
      element.textContent?.trim() === tab.getAttribute('aria-label'));
    if (!label) throw new Error('La etiqueta visible de la pestaña no coincide con su nombre accesible.');
    const bounds = label.getBoundingClientRect();
    return { name: label.textContent, left: bounds.left, right: bounds.right };
  }));
  for (let index = 1; index < tabLabels.length; index++) {
    expect(tabLabels[index].left, `Etiquetas de pestañas superpuestas: ${tabLabels[index - 1].name}/${tabLabels[index].name}`)
      .toBeGreaterThanOrEqual(tabLabels[index - 1].right);
  }
  await awaitImages(page);
  await page.screenshot({ path: testInfo.outputPath('inicio-texto-200-390.png'), fullPage: true });
  await record(page, 'Leer un rato y tomar café ☕');
  await expect(page.getByText(/1 registro hoy/)).toBeVisible();
});
