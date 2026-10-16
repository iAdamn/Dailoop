import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudAuth, CloudAuthError, type CredentialVault } from '../src/sync/auth';
import { rememberDeletionReauth, takeDeletionReauth, clearDeletionReauth } from '../src/sync/reauth';

const NOW = Date.parse('2026-10-16T03:00:00Z');
const config = { projectId: 'dailoop-account-tests', apiKey: 'public-key', googleWebClientId: 'fixture.apps.googleusercontent.com' };
const credential = { kind: 'id_token' as const, token: 'isolated-google-credential' };
function identity(uid: string) { return { localId: uid, email: `${uid}@example.test`, displayName: uid, idToken: `id-${uid}`, refreshToken: `refresh-${uid}`, expiresIn: '3600' }; }
class Vault implements CredentialVault {
  raw: string | null = null; writes: string[] = []; clears = 0;
  async read() { return this.raw; }
  async write(value: string) { this.raw = value; this.writes.push(value); }
  async clear() { this.raw = null; this.clears++; }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const errorCode = (code: string) => (error: unknown) => error instanceof CloudAuthError && error.code === code;

test('reauthentication is existing-only, same UID and never automatically deletes an account', async () => {
  const vault = new Vault(); const calls: { url: string; body: any }[] = [];
  const auth = new CloudAuth(config, vault, async (input, init) => { calls.push({ url: String(input), body: JSON.parse(String(init?.body)) }); return Response.json(identity('alice')); }, () => NOW);
  await auth.signIn(credential); await auth.signIn(credential, 'alice', true);
  assert.equal(calls.length, 2); assert.equal(calls[1].body.autoCreate, false);
  assert(calls.every(call => call.url.includes('accounts:signInWithIdp'))); assert.equal(vault.clears, 0);
  assert.equal(auth.account?.uid, 'alice');
});

test('choosing a different Google account cannot replace the session during deletion confirmation', async () => {
  const vault = new Vault(); let selected = 'alice';
  const auth = new CloudAuth(config, vault, async () => Response.json(identity(selected)), () => NOW);
  await auth.signIn(credential); const before = vault.raw; selected = 'bob';
  await assert.rejects(auth.signIn(credential, 'alice', true), errorCode('invalid'));
  assert.equal(auth.account?.uid, 'alice'); assert.equal(vault.raw, before); assert.equal(vault.writes.length, 1);
});

test('existing-only reauthentication does not create an absent Firebase account or clear local credentials', async () => {
  const vault = new Vault(); let missing = false;
  const auth = new CloudAuth(config, vault, async (_input, init) => {
    if (!missing) return Response.json(identity('alice'));
    assert.equal(JSON.parse(String(init?.body)).autoCreate, false);
    return Response.json({ error: { message: 'PRIVATE_PROVIDER_ACCOUNT_NOT_FOUND' } }, { status: 400 });
  }, () => NOW);
  await auth.signIn(credential); const before = vault.raw; missing = true;
  await assert.rejects(auth.signIn(credential, 'alice', true), errorCode('expired'));
  assert.equal(vault.raw, before); assert.equal(auth.account?.uid, 'alice'); assert.equal(vault.clears, 0);
});

test('deleteAuth rejects another UID before network and retains the current credentials on provider failure', async () => {
  const vault = new Vault(); let deleting = false; let calls = 0;
  const auth = new CloudAuth(config, vault, async input => {
    calls++; if (deleting) { assert(String(input).includes('accounts:delete')); return Response.json({ error: { message: 'PRIVATE' } }, { status: 503 }); }
    return Response.json(identity('alice'));
  }, () => NOW);
  await auth.signIn(credential); const before = vault.raw;
  await assert.rejects(auth.deleteAccount('bob'), errorCode('invalid')); assert.equal(calls, 1);
  deleting = true; await assert.rejects(auth.deleteAccount('alice'), errorCode('network'));
  assert.equal(auth.account?.uid, 'alice'); assert.equal(vault.raw, before); assert.equal(vault.clears, 0);
});

test('successful deleteAuth clears only the deleted session and waits for queued vault writes', async () => {
  const vault = new Vault(); const gate = deferred<void>(); const writing = deferred<void>(); const originalWrite = vault.write.bind(vault);
  vault.write = async value => { writing.resolve(); await gate.promise; await originalWrite(value); };
  const auth = new CloudAuth(config, vault, async input => Response.json(String(input).includes('accounts:delete') ? {} : identity('alice')), () => NOW);
  const signingIn = auth.signIn(credential); await writing.promise; gate.resolve(); await signingIn;
  await auth.deleteAccount('alice'); assert.equal(auth.account, null); assert.equal(vault.raw, null); assert.equal(vault.clears, 1);
});

test('finishing deletion of A never clears an account B connected during the request', async () => {
  const vault = new Vault(); const deleted = deferred<Response>(); let selected = 'alice';
  const auth = new CloudAuth(config, vault, async input => String(input).includes('accounts:delete') ? deleted.promise : Response.json(identity(selected)), () => NOW);
  await auth.signIn(credential); const deleting = auth.deleteAccount('alice'); await Promise.resolve();
  selected = 'bob'; await auth.signIn(credential); deleted.resolve(Response.json({})); await deleting;
  assert.equal(auth.account?.uid, 'bob'); assert.equal(JSON.parse(vault.raw!).session.uid, 'bob');
});

test('redirect deletion intent is single-use, five-minute bounded and never invokes network or deletion', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'); const originalNow = Date.now; const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  let now = NOW; Date.now = () => now;
  try {
    rememberDeletionReauth('alice'); now += 299_999;
    assert.deepEqual(takeDeletionReauth(), { uid: 'alice', createdAt: NOW }); assert.equal(takeDeletionReauth(), null);
    now = NOW; rememberDeletionReauth('alice'); now += 300_000; assert.throws(takeDeletionReauth, /Confirma de nuevo/); assert.equal(takeDeletionReauth(), null);
    now = NOW; rememberDeletionReauth('alice'); now--; assert.throws(takeDeletionReauth, /Confirma de nuevo/);
    now = NOW; rememberDeletionReauth('alice'); clearDeletionReauth(); assert.equal(takeDeletionReauth(), null);
    values.set('dailoop.account-deletion.reauth.v1', JSON.stringify({ uid: 123, createdAt: NOW })); assert.throws(takeDeletionReauth, /Confirma de nuevo/);
  } finally { Date.now = originalNow; if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else Reflect.deleteProperty(globalThis, 'sessionStorage'); }
});
