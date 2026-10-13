import { expect, test, type Page } from '@playwright/test';

interface SpikeResult {
  platform?: string;
  isolated?: boolean;
  previous?: number;
  value?: number;
  commit?: boolean;
  rollback?: boolean;
  reopen?: boolean;
  migration?: boolean;
  integrity?: string;
  error?: string;
}

async function runSpike(page: Page): Promise<SpikeResult> {
  await page.getByRole('button', { name: 'Ejecutar prueba SQLite', exact: true }).click();
  const result = page.getByTestId('spike-result');
  await expect(result).toHaveText(/^\{.*\}$/, { timeout: 45_000 });
  const parsed = JSON.parse((await result.textContent()) ?? '{}') as SpikeResult;
  expect(parsed.error, 'El spike debe abrir SQLite/WASM real sin errores').toBeUndefined();
  return parsed;
}

test('SQLite Web confirma commit, rollback, reapertura y persistencia tras recarga', async ({ page, context, baseURL }, testInfo) => {
  const externalRequests: string[] = [];
  const ownOrigin = new URL(baseURL!).origin;
  await context.route(/^https?:\/\//, async route => {
    const url = route.request().url();
    if (new URL(url).origin !== ownOrigin) {
      externalRequests.push(url);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await page.clock.setFixedTime(new Date('2026-10-12T17:00:00.000Z'));
  const response = await page.goto('/__spike');
  expect(response?.ok()).toBe(true);
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);

  const first = await runSpike(page);
  expect(first).toMatchObject({
    platform: 'web', isolated: true, previous: 0, value: 1,
    commit: true, rollback: true, reopen: true, migration: true, integrity: 'ok',
  });
  await page.reload();
  await expect(page.getByTestId('spike-result')).toHaveText('Pendiente');
  const afterReload = await runSpike(page);
  expect(afterReload).toMatchObject({
    previous: 1, value: 2, commit: true, rollback: true,
    reopen: true, migration: true, integrity: 'ok',
  });

  // Terminate the first document/worker before reopening the same origin's disk data.
  // Concurrent tabs require a separate application-level lock: see qa-plan.md.
  await page.close();
  const secondTab = await context.newPage();
  await secondTab.goto('/__spike');
  const afterReopen = await runSpike(secondTab);
  expect(afterReopen).toMatchObject({
    previous: 2, value: 3, commit: true, rollback: true,
    reopen: true, migration: true, integrity: 'ok',
  });
  expect(externalRequests, 'Todos los recursos del spike deben ser locales').toEqual([]);
  await testInfo.attach('sqlite-observed-results', {
    body: JSON.stringify({ first, afterReload, afterReopen }, null, 2),
    contentType: 'application/json',
  });
  await secondTab.screenshot({ path: testInfo.outputPath('sqlite-persistence.png'), fullPage: true });
});
