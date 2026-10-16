import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { canonicalize, parseBackup, type DomainState } from '../src/domain';

const origin = 'http://localhost:8795';
const digest = async (text: string) => createHash('sha256').update(text).digest('hex');
const fixtureToken = 'isolated-playwright-fixture-token';
const fixtureUid = 'isolated-playwright-user';
type Document = { name: string; fields: Record<string, any>; updateTime: string };
function fakeCloud() {
  const documents = new Map<string, Document>(); let sequence = 0; let identityCalls = 0; let firestoreCalls = 0; let oauthCalls = 0;
  const blocked: string[] = [];
  async function attach(context: BrowserContext) {
    await context.route(/^https?:\/\//, async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
      if (request.method() === 'OPTIONS' && ['identitytoolkit.googleapis.com', 'firestore.googleapis.com'].includes(url.hostname)) return route.fulfill({ status: 204, headers: cors });
      if (url.hostname === 'accounts.google.com' && url.pathname === '/o/oauth2/v2/auth') {
        oauthCalls++; const callback = new URL(url.searchParams.get('redirect_uri')!);
        expect(callback.origin).toBe(origin); expect(url.searchParams.get('state')).toMatch(/^[a-f0-9]{64}$/);
        callback.hash = new URLSearchParams({ access_token: 'isolated-google-fixture', state: url.searchParams.get('state')!, token_type: 'Bearer' }).toString();
        // Google actually displays a different document before returning. A
        // direct 302 back to the already open URL can become a same-document
        // fragment navigation and would not exercise the startup callback.
        return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><script>location.replace(${JSON.stringify(callback.toString()).replace(/</g, '\\u003c')})</script>` });
      }
      if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname === '/v1/accounts:signInWithIdp') {
        identityCalls++; const body = request.postDataJSON();
        expect(new URLSearchParams(body.postBody).get('access_token')).toBe('isolated-google-fixture');
        return route.fulfill({ status: 200, headers: cors, json: { localId: fixtureUid, email: 'fixture@example.invalid', displayName: 'Prueba aislada', idToken: fixtureToken, refreshToken: 'isolated-refresh-fixture', expiresIn: '3600' } });
      }
      if (url.hostname === 'firestore.googleapis.com' && url.pathname.startsWith('/v1/projects/')) {
        firestoreCalls++; expect(request.headers().authorization).toBe(`Bearer ${fixtureToken}`);
        const name = decodeURIComponent(url.pathname.slice(4));
        if (request.method() === 'GET') {
          expect(name).toContain(`/users/${fixtureUid}/`);
          return documents.has(name) ? route.fulfill({ status: 200, headers: cors, json: documents.get(name) }) : route.fulfill({ status: 404, headers: cors, json: { error: { status: 'NOT_FOUND' } } });
        }
        expect(name.endsWith('/documents:commit')).toBe(true);
        const body = request.postDataJSON(); expect(body.writes).toHaveLength(1);
        const write = body.writes[0]; const existing = documents.get(write.update.name);
        expect(write.update.name).toContain(`/users/${fixtureUid}/`);
        if ((write.currentDocument.exists === false && existing) || (write.currentDocument.updateTime && existing?.updateTime !== write.currentDocument.updateTime)) return route.fulfill({ status: 400, headers: cors, json: { error: { status: 'FAILED_PRECONDITION' } } });
        if (write.update.name.includes('/chunks/')) expect(await digest(write.update.fields.text.stringValue)).toBe(write.update.fields.hash.stringValue);
        const updateTime = new Date(Date.parse('2026-10-16T00:00:00Z') + ++sequence).toISOString();
        documents.set(write.update.name, { ...write.update, updateTime });
        return route.fulfill({ status: 200, headers: cors, json: { writeResults: [{ updateTime }], commitTime: updateTime } });
      }
      blocked.push(url.hostname + url.pathname); return route.abort('blockedbyclient');
    });
  }
  function state(): DomainState {
    const head = [...documents.values()].find(doc => doc.name.endsWith('/sync/head'))!;
    const manifest = documents.get(head.name.replace('/sync/head', `/versions/${head.fields.version.stringValue}`))!;
    const text = manifest.fields.chunks.arrayValue.values.map((id: { stringValue: string }) => documents.get(head.name.replace('/sync/head', `/chunks/${id.stringValue}`))!.fields.text.stringValue).join('');
    return JSON.parse(text) as DomainState;
  }
  return { attach, state, blocked, counts: () => ({ identityCalls, firestoreCalls, oauthCalls }) };
}
async function settings(page: Page) { await page.getByRole('tab', { name: 'Ajustes', exact: true }).click(); }
async function connect(page: Page) {
  await settings(page); await page.getByRole('button', { name: 'Conectar con Google', exact: true }).click();
  await expect(page.getByText('Prueba aislada', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#tab=settings$/); expect(page.url()).not.toContain('access_token');
}
async function enable(page: Page) {
  await page.getByRole('button', { name: /^(Activar|Reanudar) sincronización$/ }).click();
  await expect(page.getByText(/incluidos los datos marcados como privados/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar y activar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sincronizar ahora', exact: true })).toBeEnabled();
  await expect(page.getByText('Sincronización activa', { exact: true })).toBeVisible();
}
async function sync(page: Page) {
  await settings(page); await page.getByRole('button', { name: 'Sincronizar ahora', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sincronizar ahora', exact: true })).toBeEnabled();
  await expect(page.getByText('Sincronización activa', { exact: true })).toBeVisible();
}
async function backup(page: Page): Promise<DomainState> {
  await settings(page); await page.getByRole('button', { name: 'Crear backup completo', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Guardar backup completo', exact: true }).click();
  return (await parseBackup(await readFile((await (await download).path())!, 'utf8'), digest)).state;
}

test('isolated devices: Google consent, offline-first sync, identical IDs, pending changes and durable logout', async ({ browser }) => {
  test.setTimeout(120_000);
  const cloud = fakeCloud(); const first = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota', serviceWorkers: 'block', acceptDownloads: true });
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota', serviceWorkers: 'block', acceptDownloads: true });
  await cloud.attach(first); await cloud.attach(second);
  const consoleErrors: string[] = [];
  try {
    const a = await first.newPage(); const b = await second.newPage(); const errors: string[] = [];
    a.on('console', entry => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
    b.on('console', entry => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
    a.on('pageerror', error => errors.push(error.message)); b.on('pageerror', error => errors.push(error.message));
    await a.goto(origin); await expect(a.getByRole('button', { name: 'Crear mi primera actividad', exact: true })).toBeVisible();
    await settings(a); await expect(a.getByRole('button', { name: 'Conectar con Google', exact: true })).toBeEnabled();
    expect(cloud.counts()).toEqual({ identityCalls: 0, firestoreCalls: 0, oauthCalls: 0 });
    await first.setOffline(true); await a.getByRole('tab', { name: 'Registro', exact: true }).click();
    await a.getByRole('button', { name: 'Crear mi primera actividad', exact: true }).click();
    await a.getByLabel('Nombre de la actividad', { exact: true }).fill('Actividad sincronizada');
    await a.getByRole('button', { name: 'Crear actividad', exact: true }).click();
    await a.getByRole('button', { name: 'Registrar Actividad sincronizada', exact: true }).click();
    await expect(a.getByText('✓ Registrado: Actividad sincronizada', { exact: true })).toBeVisible();
    expect(cloud.counts().firestoreCalls).toBe(0); await first.setOffline(false);
    await connect(a); expect(cloud.counts()).toEqual({ identityCalls: 1, firestoreCalls: 0, oauthCalls: 1 });
    await enable(a); expect(cloud.state().entries).toHaveLength(1);
    const initial = await backup(a); expect(canonicalize(initial)).toBe(canonicalize(cloud.state()));
    await b.goto(origin); await connect(b); const beforeSecond = cloud.counts().firestoreCalls;
    await expect(b.getByRole('button', { name: 'Activar sincronización', exact: true })).toBeEnabled();
    expect(cloud.counts().firestoreCalls).toBe(beforeSecond);
    await enable(b); expect(canonicalize(await backup(b))).toBe(canonicalize(initial));
    const beforeOffline = cloud.counts().firestoreCalls; await first.setOffline(true);
    await a.getByRole('tab', { name: 'Registro', exact: true }).click(); await a.getByRole('button', { name: 'Registrar Actividad sincronizada', exact: true }).click();
    await settings(a); await expect(a.getByText('Hay cambios locales pendientes. Se conservan aunque no tengas conexión.', { exact: true })).toBeVisible();
    expect(cloud.counts().firestoreCalls).toBe(beforeOffline); expect(cloud.state().entries).toHaveLength(1);
    await first.setOffline(false); await sync(a); expect(cloud.state().entries).toHaveLength(2);
    await sync(b); const final = await backup(b); expect(final.entries).toHaveLength(2); expect(canonicalize(final)).toBe(canonicalize(cloud.state()));
    await sync(b); expect(cloud.state().entries).toHaveLength(2);
    await a.getByRole('button', { name: 'Pausar sincronización', exact: true }).click();
    await expect(a.getByText('Sincronización pausada', { exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await a.getByRole('button', { name: 'Confirmar cierre de sesión', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Conectar con Google', exact: true })).toBeVisible();
    const loggedOut = cloud.counts(); await a.reload(); await expect(a.getByRole('button', { name: 'Conectar con Google', exact: true })).toBeVisible();
    expect(cloud.counts()).toEqual(loggedOut); expect((await backup(a)).entries).toHaveLength(2);
    expect(cloud.blocked).toEqual([]); expect(errors).toEqual([]);
    await a.screenshot({ path: test.info().outputPath('logged-out-local-data.png') });
  } finally {
    await test.info().attach('isolated-network-boundary', { body: JSON.stringify({ counts: cloud.counts(), blocked: cloud.blocked, consoleErrors }), contentType: 'application/json' });
    await first.close(); await second.close();
  }
});
