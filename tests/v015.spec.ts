import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { APP_VERSION } from '../src/version';
import { exportBackup, parseBackup } from '../src/domain';
import { createV015State, V015_NOW } from './fixtures/v015';

const digest = async (text: string) => createHash('sha256').update(text).digest('hex');
async function tab(page: Page, name: string) { await page.getByRole('tab', { name: name === 'Historial' ? 'Estadísticas' : name, exact: true }).click(); if (name === 'Historial') await page.getByRole('button', { name: 'Ver historial', exact: true }).click(); }
const publicName = 'Actividad QA 002 con nombre largo y emoji repetido';
const prefKey = 'dailoop.presentation.v1';
const runtimeErrors = new WeakMap<Page, string[]>();
function expectPreservedById<T extends { id: string }>(before: readonly T[], after: readonly T[]) {
  const current = new Map(after.map(row => [row.id, row]));
  expect(before.map(row => current.get(row.id))).toEqual(before);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), 'These workflows must not produce unhandled runtime errors').toEqual([]);
});

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '¿Qué quieres registrar?', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function density(page: Page, columns: number) {
  await tab(page, 'Ajustes');
  const choice = page.getByRole('checkbox', { name: `${columns} ${columns === 1 ? 'columna' : 'columnas'}`, exact: true });
  await choice.click();
  await expect(choice).toBeChecked();
  await tab(page, 'Registro');
}
async function restore(page: Page, file: string) {
  await tab(page, 'Ajustes');
  const picked = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restaurar un backup', exact: true }).click();
  await (await picked).setFiles(file);
  await expect(page.getByRole('heading', { name: 'Revisar restauración', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar reemplazo y restaurar', exact: true }).click();
  await expect(page.getByRole('button', { name: `Registrar ${publicName}`, exact: true })).toBeVisible();
}
async function backup(page: Page) {
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Crear backup completo', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar backup completo', exact: true }).click();
  const file = await (await downloaded).path();
  expect(file).not.toBeNull();
  const text = await readFile(file!, 'utf8');
  return { envelope: JSON.parse(text), parsed: await parseBackup(text, digest) };
}

test('1–4 columns preserve identities, commit one intent and stay outside historical backup v1', async ({ page }) => {
  const original = createV015State(10, 100);
  const fixtureFile = test.info().outputPath('historical-0.1.0.json');
  await writeFile(fixtureFile, await exportBackup(original, { backupId: '15000000-0000-4000-9000-999999999999', exportedAtMs: V015_NOW, appVersion: '0.1.0' }, digest));
  await open(page);
  await restore(page, fixtureFile);
  for (const columns of [1, 2, 3, 4]) {
    await density(page, columns);
    const first = page.getByRole('button', { name: 'Registrar PRIVADA QA 001', exact: true });
    const second = page.getByRole('button', { name: `Registrar ${publicName}`, exact: true });
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    expect(firstBox).not.toBeNull(); expect(secondBox).not.toBeNull();
    // CSS matrix coordinates can differ by a few ten-thousandths of a pixel.
    expect(Number(firstBox!.height.toFixed(3))).toBeGreaterThanOrEqual(48);
    expect(Number(firstBox!.width.toFixed(3))).toBeGreaterThanOrEqual(48);
    if (columns === 1) expect(secondBox!.y).toBeGreaterThan(firstBox!.y);
    else { expect(Math.abs(secondBox!.y - firstBox!.y)).toBeLessThan(2); expect(secondBox!.x).toBeGreaterThan(firstBox!.x); }
    await page.screenshot({ path: test.info().outputPath(`density-${columns}.png`) });
  }
  await page.getByRole('button', { name: `Registrar ${publicName}`, exact: true }).click();
  await expect(page.getByText(`✓ Registrado: ${publicName}`, { exact: true })).toBeVisible();
  const recorded = await backup(page);
  expect(recorded.parsed.state.entries).toHaveLength(101);
  expect(recorded.parsed.state.entryRevisions).toHaveLength(101);
  expect(recorded.parsed.state.operations).toHaveLength(111);
  const existingIds = new Set(original.entries.map(entry => entry.id));
  const additions = recorded.parsed.state.entries.filter(entry => !existingIds.has(entry.id));
  expect(additions).toHaveLength(1);
  expect(additions[0].activityId).toBe(original.activities[1].id);
  expectPreservedById(original.entries, recorded.parsed.state.entries);
  expectPreservedById(original.entryRevisions, recorded.parsed.state.entryRevisions);
  expectPreservedById(original.operations, recorded.parsed.state.operations);
  expect(recorded.parsed.state.activities).toEqual(original.activities);
  expect(recorded.parsed.state.activityRevisions).toEqual(original.activityRevisions);
  expect(recorded.parsed.state.settings).toEqual(original.settings);
  expect(recorded.envelope.appVersion).toBe(APP_VERSION);
  expect(recorded.parsed.state.settings).not.toHaveProperty('activityColumns');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '4 columnas', exact: true })).toBeChecked();
  await restore(page, fixtureFile);
  await expect(page.getByTestId('activity-card-4').first()).toBeVisible();
  const restored = await backup(page);
  expect(restored.parsed.state).toEqual(original);
  await page.setViewportSize({ width: 280, height: 844 });
  await tab(page, 'Registro');
  await expect(page.getByText(/Tu elección de 4 columnas se adapta a/)).toBeVisible();
  await tab(page, 'Ajustes');
  await expect(page.getByRole('checkbox', { name: '4 columnas', exact: true })).toBeChecked();
});

test('invalid local preferences recover and quota errors retain the prior selected distribution', async ({ page }) => {
  await page.addInitScript(key => { localStorage.setItem(key, '{"activityColumns":99}'); }, prefKey);
  await open(page);
  await tab(page, 'Ajustes');
  await expect(page.getByRole('checkbox', { name: '1 columna', exact: true })).toBeChecked();
  await page.evaluate(key => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('QA simulated quota', 'QuotaExceededError');
      originalSet.call(this, name, value);
    };
  }, prefKey);
  await page.getByRole('checkbox', { name: '4 columnas', exact: true }).click();
  const visibleError = page.getByText(/No se guardó la distribución/).filter({ visible: true });
  await expect(visibleError).toHaveCount(1);
  await expect(visibleError).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '1 columna', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '4 columnas', exact: true })).not.toBeChecked();
});

test('dirty modal remains visible and closable with active and dynamically reduced motion', async ({ page }) => {
  await open(page);
  for (const reducedMotion of ['no-preference', 'reduce', 'no-preference'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.getByRole('button', { name: '＋ Nueva actividad', exact: true }).click();
    await page.getByLabel('Nombre de la actividad', { exact: true }).fill(`Borrador ${reducedMotion}`);
    await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
    await expect(page.getByText('Hay cambios sin guardar', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(page.getByLabel('Nombre de la actividad', { exact: true })).toHaveValue(`Borrador ${reducedMotion}`);
    await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Una nueva actividad', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '¿Qué quieres registrar?', exact: true })).toBeVisible();
  }
});

test('refused busy modal close does not hide an export error or latch its next close', async ({ page }) => {
  await open(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await tab(page, 'Ajustes');
  await page.getByRole('button', { name: 'Crear backup completo', exact: true }).click();
  const title = page.getByRole('heading', { name: 'Tu historia, en un archivo', exact: true });
  await page.evaluate(() => {
    const qaWindow = window as typeof window & { qaRejectBackupDigest?: () => void };
    crypto.subtle.digest = () => new Promise((_resolve, reject) => {
      qaWindow.qaRejectBackupDigest = () => reject(new Error('QA controlled export failure'));
    });
  });
  await page.getByRole('button', { name: 'Guardar backup completo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preparando archivo…', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
  await page.evaluate(() => (window as typeof window & { qaRejectBackupDigest?: () => void }).qaRejectBackupDigest?.());
  await expect(page.getByText('! QA controlled export failure', { exact: true }).last()).toBeVisible();
  await expect.poll(() => title.evaluate(element => {
    for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity) < 0.9) return false;
    }
    return true;
  })).toBe(true);
  await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
  await expect(title).toHaveCount(0);
});
