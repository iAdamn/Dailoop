import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let server: Server; let origin: string;
test.beforeAll(async () => {
  const root = path.resolve('output/account-site');
  const files: Record<string, [string, string]> = { '/delete-account/': ['delete-account/index.html', 'text/html'], '/delete-account/app.js': ['delete-account/app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/privacy/': ['privacy/index.html', 'text/html'] };
  server = createServer((request, response) => {
    const selected = files[new URL(request.url ?? '/', 'http://127.0.0.1').pathname];
    if (!selected) { response.writeHead(404); response.end(); return; }
    void readFile(path.join(root, selected[0])).then(data => { response.writeHead(200, { 'Content-Type': `${selected[1]}; charset=utf-8`, 'Cache-Control': 'no-store' }); response.end(data); }).catch(() => { response.writeHead(500); response.end(); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected isolated loopback site');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

async function stub(context: BrowserContext, mode: 'normal' | 'unknown' | 'partial' = 'normal') {
  const calls: string[] = []; const authBodies: Record<string, unknown>[] = [];
  const resource = 'projects/dailoop/databases/(default)/documents'; const ownerRoot = `${resource}/users/site-alice`;
  const fenceName = `${ownerRoot}/security/deletion`; const docs = new Map<string, unknown>();
  docs.set(`${ownerRoot}/chunks/${'a'.repeat(64)}`, {}); docs.set(`${ownerRoot}/versions/${'b'.repeat(64)}`, {}); docs.set(`${ownerRoot}/sync/head`, {});
  const failure = (status: string) => JSON.stringify({ error: { status, message: 'private provider detail' } });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === origin) { await route.continue(); return; }
    if (url.hostname === 'accounts.google.com' && url.pathname === '/o/oauth2/v2/auth') {
      calls.push('google'); expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/delete-account/`);
      const state = url.searchParams.get('state'); expect(state).toMatch(/^[0-9a-f]{64}$/);
      await route.fulfill({ status: 302, headers: { location: `${origin}/delete-account/#access_token=isolated-google-token&state=${state}&token_type=Bearer` } }); return;
    }
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      const body = request.postDataJSON() as Record<string, unknown>; authBodies.push(body);
      if (url.pathname.endsWith('accounts:signInWithIdp')) {
        calls.push('auth-signin'); expect(body.autoCreate).toBe(false);
        await route.fulfill({ status: mode === 'unknown' ? 400 : 200, contentType: 'application/json', body: mode === 'unknown' ? failure('USER_NOT_FOUND') : JSON.stringify({ localId: 'site-alice', email: 'alice@example.test', displayName: 'Alice', idToken: 'site-id-token', refreshToken: 'site-refresh-token', expiresIn: '3600' }) }); return;
      }
      if (url.pathname.endsWith('accounts:delete')) {
        calls.push('auth-delete'); expect(body.idToken).toBe('site-id-token');
        expect([...docs.keys()]).toEqual([fenceName]);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); return;
      }
    }
    if (url.hostname === 'firestore.googleapis.com') {
      expect(request.headers().authorization).toBe('Bearer site-id-token');
      const relative = url.pathname.slice('/v1/'.length);
      if (relative.endsWith(':commit')) {
        const writes = request.postDataJSON().writes as any[]; expect(writes.length).toBeLessThanOrEqual(100);
        if (writes[0].update) {
          calls.push('fence'); expect(writes[0].update.name).toBe(fenceName);
          docs.set(fenceName, { name: fenceName, fields: { schema: { integerValue: '1' }, startedAt: { timestampValue: '2026-10-16T03:00:00Z' } } });
        } else {
          calls.push('payload-delete');
          if (mode === 'partial' && writes.some(write => write.delete.includes('/versions/'))) { await route.fulfill({ status: 503, contentType: 'application/json', body: failure('UNAVAILABLE') }); return; }
          for (const write of writes) { expect(write.delete.startsWith(`${ownerRoot}/`)).toBe(true); docs.delete(write.delete); }
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ writeResults: writes.map(() => ({})), commitTime: '2026-10-16T03:00:00Z' }) }); return;
      }
      if (relative.endsWith('/chunks') || relative.endsWith('/versions')) {
        calls.push('list'); expect(url.searchParams.get('mask.fieldPaths')).toBe('dailoopDeletionNameOnly');
        const names = [...docs.keys()].filter(name => name.startsWith(`${relative}/`));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(names.length ? { documents: names.map(name => ({ name })) } : {}) }); return;
      }
      calls.push(relative.endsWith('/sync/head') ? 'verify-head' : 'read-fence');
      const document = docs.get(relative);
      await route.fulfill({ status: document === undefined ? 404 : 200, contentType: 'application/json', body: document === undefined ? failure('NOT_FOUND') : JSON.stringify(document) }); return;
    }
    // Unexpected services are blocked before any request can leave the fixture.
    await route.abort(); throw new Error(`Unexpected site endpoint: ${url.origin}${url.pathname}`);
  });
  return { calls, authBodies, docs, fenceName };
}
async function login(page: Page) {
  await page.goto(`${origin}/delete-account/`);
  await page.locator('#sign-in').click();
  await expect(page.locator('#account')).toHaveText('alice@example.test');
}

test('public deletion site requires Google, a checkbox and an explicit final click', async ({ page, context }) => {
  const fixture = await stub(context); await page.goto(`${origin}/delete-account/`);
  await expect(page.locator('#erase')).toBeDisabled(); expect(fixture.calls).toEqual([]);
  await page.locator('#sign-in').click(); await expect(page.locator('#account')).toHaveText('alice@example.test');
  expect(fixture.calls).toEqual(['google', 'auth-signin']); await expect(page.locator('#erase')).toBeDisabled();
  await page.locator('#confirm').check(); await expect(page.locator('#erase')).toBeEnabled();
  expect(fixture.calls).toEqual(['google', 'auth-signin']);
  expect(await page.evaluate(() => location.hash)).not.toContain('access_token');
});

test('public site verifies payload erasure before Auth deletion and preserves independent local copies', async ({ page, context }) => {
  const fixture = await stub(context);
  await page.goto(`${origin}/delete-account/`);
  await page.evaluate(async () => {
    localStorage.setItem('dailoop-independent-copy', 'KEEP_PRIVATE_FIXTURE');
    const root = await navigator.storage.getDirectory(); const file = await root.getFileHandle('private-fixture.txt', { create: true });
    const writable = await file.createWritable(); await writable.write('KEEP_PRIVATE_FIXTURE'); await writable.close();
  });
  await page.locator('#sign-in').click(); await expect(page.locator('#account')).toHaveText('alice@example.test');
  await page.locator('#confirm').check(); await page.locator('#erase').click();
  await expect(page.locator('#status')).toContainText('Cuenta y datos online borrados.');
  expect(fixture.calls.at(-1)).toBe('auth-delete'); expect(fixture.calls.filter(item => item === 'auth-delete')).toHaveLength(1);
  expect(fixture.calls.indexOf('verify-head')).toBeLessThan(fixture.calls.indexOf('auth-delete'));
  expect([...fixture.docs.keys()]).toEqual([fixture.fenceName]); await expect(page.locator('#erase')).toBeDisabled();
  expect(await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(); const file = await (await root.getFileHandle('private-fixture.txt')).getFile();
    return [localStorage.getItem('dailoop-independent-copy'), await file.text(), (await indexedDB.databases()).map(database => database.name)];
  })).toEqual(['KEEP_PRIVATE_FIXTURE', 'KEEP_PRIVATE_FIXTURE', []]);
});

test('interrupted public purge keeps the Auth account and never announces partial success', async ({ page, context }) => {
  const fixture = await stub(context, 'partial'); await login(page);
  await page.locator('#confirm').check(); await page.locator('#erase').click();
  await expect(page.locator('#status')).toContainText('No se completó el borrado.');
  expect(fixture.calls).not.toContain('auth-delete'); expect(fixture.docs.has(fixture.fenceName)).toBe(true);
  expect([...fixture.docs.keys()].some(name => name.includes('/versions/'))).toBe(true); await expect(page.locator('#sign-in')).toBeEnabled();
});

test('Google account without a Dailoop account is not created by the deletion website', async ({ page, context }) => {
  const fixture = await stub(context, 'unknown'); await page.goto(`${origin}/delete-account/`); await page.locator('#sign-in').click();
  await expect(page.locator('#status')).toContainText('No se creó ninguna cuenta.');
  expect(fixture.authBodies).toHaveLength(1); expect(fixture.authBodies[0].autoCreate).toBe(false); expect(fixture.calls).toEqual(['google', 'auth-signin']); await expect(page.locator('#erase')).toBeDisabled();
});
