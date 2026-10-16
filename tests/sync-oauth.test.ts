import test from 'node:test';
import assert from 'node:assert/strict';
import { captureGoogleCallback } from '../src/sync/oauthCallback';

function browser(hash: string, pending: string | null) {
  let removed = false; let clean = '';
  return { value: {
    location: { hash, pathname: '/', search: '' },
    history: { replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => { clean = String(url); } },
    sessionStorage: { getItem: () => removed ? null : pending, removeItem: () => { removed = true; } },
  } as unknown as Pick<Window, 'location' | 'history' | 'sessionStorage'>,
  removed: () => removed, clean: () => clean };
}
test('Google callback captures a valid one-use state and scrubs the URL synchronously before routing', () => {
  const fixture = browser('#access_token=example-token&state=random-state', JSON.stringify({ state: 'random-state', createdAt: 1_000 }));
  assert.deepEqual(captureGoogleCallback(fixture.value, 2_000), { kind: 'access_token', token: 'example-token' });
  assert.equal(fixture.clean(), '/#tab=settings'); assert.equal(fixture.removed(), true);
  assert.throws(() => captureGoogleCallback(fixture.value, 2_000), /caducó/);
});
test('Google callback rejects missing, mismatched, malformed, old and future states without leaving credentials in URL', () => {
  for (const raw of [null, 'bad-json', '{}', JSON.stringify({ state: 'other', createdAt: 1_000 }),
    JSON.stringify({ state: 'state', createdAt: 1_000 }), JSON.stringify({ state: 'state', createdAt: 1_000_001 })]) {
    const fixture = browser('#access_token=example-token&state=state', raw);
    assert.throws(() => captureGoogleCallback(fixture.value, 1_000_000), /caducó/);
    assert.equal(fixture.clean(), '/#tab=settings'); assert.equal(fixture.removed(), true);
  }
});
test('Google cancellation returns no credential; other provider errors and oversized tokens are redacted', () => {
  const pending = JSON.stringify({ state: 'state', createdAt: 1_000 });
  assert.equal(captureGoogleCallback(browser('#error=access_denied&state=state', pending).value, 2_000), null);
  for (const hash of ['#error=provider-secret&state=state', '#access_token=' + 'x'.repeat(8193) + '&state=state']) {
    assert.throws(() => captureGoogleCallback(browser(hash, pending).value, 2_000), { message: 'No se pudo conectar con Google.' });
  }
});
test('Normal app navigation neither consumes Google state nor changes the route', () => {
  const fixture = browser('#tab=stats', 'pending-state');
  assert.equal(captureGoogleCallback(fixture.value, 2_000), null);
  assert.equal(fixture.removed(), false); assert.equal(fixture.clean(), '');
});
