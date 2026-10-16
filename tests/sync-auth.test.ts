import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudAuth, CloudAuthError, type AuthSession, type CredentialVault, type GoogleCredential } from '../src/sync/auth';
import type { CloudConfig } from '../src/sync/config';

const NOW = Date.parse('2026-10-15T17:00:00Z');
const CONFIG: CloudConfig = { projectId: 'dailoop-unit-tests', apiKey: 'public-client-key', googleWebClientId: 'test.apps.googleusercontent.com' };
const credential: GoogleCredential = { kind: 'id_token', token: 'google+token/=&value' };
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
class Vault implements CredentialVault {
  raw: string | null = null;
  writes: string[] = [];
  clears = 0;
  async read() { return this.raw; }
  async write(value: string) { this.writes.push(value); this.raw = value; }
  async clear() { this.clears++; this.raw = null; }
}
function saved(overrides: Partial<AuthSession> = {}): AuthSession {
  return { uid: 'user-1', email: 'Ajustes@example.test', displayName: 'Cancelar', idToken: 'cached-id-token', refreshToken: 'cached-refresh-token', expiresAt: NOW + 59_000, ...overrides };
}
function wrap(value: AuthSession = saved(), projectId = CONFIG.projectId) { return JSON.stringify({ projectId, session: value }); }
function identity(uid = 'user-1', overrides: Record<string, unknown> = {}) {
  return { localId: uid, email: 'Ajustes@example.test', displayName: 'Cancelar', idToken: `firebase-id-${uid}`, refreshToken: `firebase-refresh-${uid}`, expiresIn: '3600', ...overrides };
}
function renewed(uid = 'user-1', overrides: Record<string, unknown> = {}) {
  return { user_id: uid, id_token: `renewed-id-${uid}`, refresh_token: `renewed-refresh-${uid}`, expires_in: '3600', ...overrides };
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const offline: typeof fetch = async () => { throw new Error('RAW_NETWORK_TOKEN_MUST_NOT_ESCAPE'); };
const code = (value: string) => (error: unknown): boolean => error instanceof CloudAuthError && error.code === value;
async function loaded(vault = new Vault(), fetcher: typeof fetch = offline) {
  vault.raw ??= wrap();
  const auth = new CloudAuth(CONFIG, vault, fetcher, () => NOW);
  await auth.load();
  return { auth, vault };
}

for (const kind of ['id_token', 'access_token'] as const) test(`Google ${kind} is encoded for Firebase with the dedicated request URI and public key`, async () => {
  const vault = new Vault(); let requests = 0;
  const fetcher: typeof fetch = async (input, init) => {
    requests++;
    assert.equal(String(input), 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=public-client-key');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    const body = JSON.parse(String(init?.body));
    assert.equal(body.requestUri, 'https://dailoop-unit-tests.firebaseapp.com');
    assert.equal(body.returnSecureToken, true);
    assert.equal(body.postBody, `providerId=google.com&${kind}=google%2Btoken%2F%3D%26value`);
    assert.ok(init?.signal instanceof AbortSignal);
    return response(identity());
  };
  const auth = new CloudAuth(CONFIG, vault, fetcher, () => NOW);
  await auth.signIn({ ...credential, kind });
  assert.equal(requests, 1);
  assert.deepEqual(auth.account, { uid: 'user-1', email: 'Ajustes@example.test', displayName: 'Cancelar' });
  assert.equal(await auth.token(), 'firebase-id-user-1');
  assert.deepEqual(JSON.parse(vault.raw!), { projectId: CONFIG.projectId, session: saved({ idToken: 'firebase-id-user-1', refreshToken: 'firebase-refresh-user-1', expiresAt: NOW + 3_600_000 }) });
});

test('cached same-project account loads offline without refresh or network', async () => {
  let network = 0;
  const vault = new Vault(); vault.raw = wrap(saved({ expiresAt: NOW - 1_000 }));
  const auth = new CloudAuth(CONFIG, vault, async () => { network++; throw new Error('OFFLINE'); }, () => NOW);
  await auth.load();
  assert.equal(auth.account?.uid, 'user-1');
  assert.equal(network, 0);
  assert.equal(vault.writes.length, 0);
  await assert.rejects(auth.token(), code('network'));
  assert.equal(auth.account?.uid, 'user-1');
  assert.equal(vault.raw, wrap(saved({ expiresAt: NOW - 1_000 })));
});

test('wrong project, legacy unscoped cache, unknown fields and invalid sessions are cleared without networking', async () => {
  const candidates = [
    wrap(saved(), 'another-project'), JSON.stringify(saved()), '{broken', 'null', '[]',
    JSON.stringify({ projectId: CONFIG.projectId, session: saved(), additional: true }),
    JSON.stringify({ projectId: CONFIG.projectId, session: { ...saved(), additional: true } }),
    wrap(saved({ expiresAt: 1.5 })), wrap(saved({ expiresAt: NOW + 86_400_001 })),
    wrap(saved({ expiresAt: Number.MAX_SAFE_INTEGER })), wrap(saved({ expiresAt: -1 })),
    wrap(saved({ uid: '../user' })), wrap(saved({ idToken: '' })), wrap(saved({ refreshToken: '' })),
  ];
  for (const raw of candidates) {
    const vault = new Vault(); vault.raw = raw;
    let network = 0;
    const auth = new CloudAuth(CONFIG, vault, async () => { network++; return response(identity()); }, () => NOW);
    await auth.load();
    assert.equal(auth.account, null); assert.equal(vault.raw, null); assert.equal(vault.clears, 1); assert.equal(network, 0);
  }
});

test('concurrent expired-token requests share one refresh and publish only after persistence', async () => {
  const reply = deferred<Response>(); let requests = 0;
  const vault = new Vault();
  const { auth } = await loaded(vault, async (input, init) => {
    requests++; assert.equal(String(input), 'https://securetoken.googleapis.com/v1/token?key=public-client-key');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(String(init?.body), 'grant_type=refresh_token&refresh_token=cached-refresh-token');
    return reply.promise;
  });
  const first = auth.token(); const second = auth.token(); const third = auth.token();
  assert.equal(requests, 1);
  reply.resolve(response(renewed()));
  assert.deepEqual(await Promise.all([first, second, third]), ['renewed-id-user-1', 'renewed-id-user-1', 'renewed-id-user-1']);
  assert.equal(vault.writes.length, 1);
  assert.equal(JSON.parse(vault.raw!).session.idToken, 'renewed-id-user-1');
});

test('refresh cannot change account UID or cached data', async () => {
  const { auth, vault } = await loaded(undefined, async () => response(renewed('other-user')));
  const before = vault.raw;
  await assert.rejects(auth.token(), code('expired'));
  assert.equal(auth.account?.uid, 'user-1'); assert.equal(vault.raw, before); assert.equal(vault.writes.length, 0);
});

test('failed sign-in persistence never publishes a new account and hides storage details', async () => {
  const vault = new Vault(); vault.write = async () => { throw new Error('SECRET_STORAGE_PATH_AND_TOKEN'); };
  const auth = new CloudAuth(CONFIG, vault, async () => response(identity()), () => NOW);
  await assert.rejects(auth.signIn(credential), error => {
    assert.ok(error instanceof CloudAuthError); assert.equal(error.code, 'storage');
    assert.equal(error.message, 'No se pudo guardar la sesión de Google.'); return true;
  });
  assert.equal(auth.account, null); assert.equal(vault.raw, null);
});

test('failed refresh storage retains the previous session and permits retry', async () => {
  const { auth, vault } = await loaded(undefined, async () => response(renewed()));
  const original = vault.raw;
  const write = vault.write.bind(vault);
  vault.write = async () => { throw new Error('PRIVATE_PATH'); };
  await assert.rejects(auth.token(), code('storage'));
  assert.equal(vault.raw, original); assert.equal(auth.account?.uid, 'user-1');
  vault.write = write;
  assert.equal(await auth.token(), 'renewed-id-user-1');
});

test('a failed new-account write preserves the previously committed account', async () => {
  const { auth, vault } = await loaded(undefined, async () => response(identity('new-user')));
  const original = vault.raw;
  vault.write = async () => { throw new Error('SECRET_PATH'); };
  await assert.rejects(auth.signIn(credential), code('storage'));
  assert.equal(auth.account?.uid, 'user-1'); assert.equal(vault.raw, original);
});

test('an old refresh completion cannot clear the newer account’s single-flight refresh', async () => {
  const oldReply = deferred<Response>(); const newReply = deferred<Response>();
  let renewals = 0;
  const { auth } = await loaded(undefined, async input => {
    if (String(input).includes('signInWithIdp')) return response(identity('new-user', { expiresIn: '30' }));
    return ++renewals === 1 ? oldReply.promise : newReply.promise;
  });
  const oldRefresh = assert.rejects(auth.token(), code('expired'));
  await auth.signIn(credential);
  const newRefresh = auth.token();
  oldReply.resolve(response(renewed())); await oldRefresh;
  const concurrent = auth.token();
  assert.equal(renewals, 2);
  newReply.resolve(response(renewed('new-user')));
  assert.deepEqual(await Promise.all([newRefresh, concurrent]), ['renewed-id-new-user', 'renewed-id-new-user']);
  assert.equal(auth.account?.uid, 'new-user');
});

test('a refreshed credential remains unpublished until its vault write completes', async () => {
  const started = deferred<void>(); const finish = deferred<void>();
  const vault = new Vault(); const write = vault.write.bind(vault);
  vault.write = async value => { started.resolve(); await finish.promise; await write(value); };
  const { auth } = await loaded(vault, async () => response(renewed()));
  const before = vault.raw;
  let returned = false;
  const token = auth.token().then(value => { returned = true; return value; });
  await started.promise;
  assert.equal(returned, false); assert.equal(vault.raw, before);
  finish.resolve(); assert.equal(await token, 'renewed-id-user-1');
  assert.equal(JSON.parse(vault.raw!).session.idToken, 'renewed-id-user-1');
});

test('logout during a pending refresh response cannot resurrect the account or vault', async () => {
  const reply = deferred<Response>();
  const { auth, vault } = await loaded(undefined, async () => reply.promise);
  const refreshed = assert.rejects(auth.token(), code('expired'));
  await auth.signOut(); reply.resolve(response(renewed())); await refreshed;
  assert.equal(auth.account, null); assert.equal(vault.raw, null); assert.equal(vault.writes.length, 0);
});

test('logout waits for an already-started refresh write, then clears it without resurrection', async () => {
  const started = deferred<void>(); const finish = deferred<void>();
  const vault = new Vault(); const write = vault.write.bind(vault);
  vault.write = async value => { started.resolve(); await finish.promise; await write(value); };
  const { auth } = await loaded(vault, async () => response(renewed()));
  const refreshed = assert.rejects(auth.token(), code('expired'));
  await started.promise;
  const logout = auth.signOut();
  assert.equal(auth.account, null); assert.equal(vault.clears, 0);
  finish.resolve(); await Promise.all([refreshed, logout]);
  assert.equal(auth.account, null); assert.equal(vault.raw, null); assert.equal(vault.clears, 1);
});

test('a superseded sign-in response cannot overwrite or clear the newer account', async () => {
  const oldReply = deferred<Response>(); let requests = 0;
  const vault = new Vault();
  const auth = new CloudAuth(CONFIG, vault, async () => ++requests === 1 ? oldReply.promise : response(identity('new-user')), () => NOW);
  const older = assert.rejects(auth.signIn(credential), code('expired'));
  await auth.signIn(credential);
  const current = vault.raw;
  oldReply.resolve(response(identity('old-user'))); await older;
  assert.equal(auth.account?.uid, 'new-user'); assert.equal(vault.raw, current); assert.equal(vault.clears, 0);
});

test('a newer sign-in queues after a superseded in-flight write without stale clear', async () => {
  const started = deferred<void>(); const finish = deferred<void>();
  const vault = new Vault(); const write = vault.write.bind(vault);
  let writes = 0; let requests = 0;
  vault.write = async value => { if (++writes === 1) { started.resolve(); await finish.promise; } await write(value); };
  const auth = new CloudAuth(CONFIG, vault, async () => response(identity(++requests === 1 ? 'old-user' : 'new-user')), () => NOW);
  const older = assert.rejects(auth.signIn(credential), code('expired'));
  await started.promise;
  const newer = auth.signIn(credential);
  finish.resolve(); await Promise.all([older, newer]);
  assert.equal(auth.account?.uid, 'new-user'); assert.equal(JSON.parse(vault.raw!).session.uid, 'new-user'); assert.equal(vault.clears, 0);
});

test('logout clear is never skipped when a later sign-in fails while an old write finishes', async () => {
  const started = deferred<void>(); const finish = deferred<void>();
  const vault = new Vault(); const write = vault.write.bind(vault);
  vault.write = async value => { started.resolve(); await finish.promise; await write(value); };
  let requests = 0;
  const auth = new CloudAuth(CONFIG, vault, async () => ++requests === 1 ? response(identity('old-user')) : response({}, 400), () => NOW);
  const older = assert.rejects(auth.signIn(credential), code('expired'));
  await started.promise;
  const logout = auth.signOut();
  await assert.rejects(auth.signIn(credential), code('expired'));
  finish.resolve(); await Promise.all([older, logout]);
  assert.equal(auth.account, null); assert.equal(vault.raw, null); assert.equal(vault.clears, 1);
});

test('a delayed cache read cannot replace a newer signed-in account or clear its vault', async () => {
  const started = deferred<void>(); const read = deferred<string | null>();
  const vault = new Vault(); vault.raw = wrap(saved({ uid: 'old-user' }));
  vault.read = async () => { started.resolve(); return read.promise; };
  const auth = new CloudAuth(CONFIG, vault, async () => response(identity('new-user')), () => NOW);
  const loading = auth.load(); await started.promise;
  const login = auth.signIn(credential);
  read.resolve('{old-invalid-cache');
  await Promise.all([loading, login]);
  assert.equal(auth.account?.uid, 'new-user'); assert.equal(JSON.parse(vault.raw!).session.uid, 'new-user'); assert.equal(vault.clears, 0);
});

test('malformed expiry, incomplete response, invalid credentials and huge session input are rejected', async () => {
  for (const expiresIn of [null, undefined, 0, -1, 1.5, '1.5', 'Infinity', '1e309', ' 3600', '0', '86401', Number.MAX_SAFE_INTEGER]) {
    const vault = new Vault();
    const auth = new CloudAuth(CONFIG, vault, async () => response(identity('user-1', { expiresIn })), () => NOW);
    await assert.rejects(auth.signIn(credential), code('invalid'));
    assert.equal(auth.account, null); assert.equal(vault.writes.length, 0);
  }
  for (const value of [null, [], {}, { localId: 'user-1', expiresIn: '3600' }, { ...identity(), localId: '../other' }, { ...identity(), idToken: 'x'.repeat(8193) }]) {
    const auth = new CloudAuth(CONFIG, new Vault(), async () => response(value), () => NOW);
    await assert.rejects(auth.signIn(credential), code('invalid'));
  }
  let requests = 0;
  const auth = new CloudAuth(CONFIG, new Vault(), async () => { requests++; return response(identity()); }, () => NOW);
  for (const invalid of [null, {}, { kind: 'password', token: 'x' }, { ...credential, admin: true }, { ...credential, token: '' }]) {
    await assert.rejects(auth.signIn(invalid as GoogleCredential), code('invalid'));
  }
  assert.equal(requests, 0);
});

test('network and Firebase errors expose only canonical safe messages; 429 is retriable network', async () => {
  for (const status of [429, 500, 503]) {
    const auth = new CloudAuth(CONFIG, new Vault(), async () => response({ error: { message: 'PRIVATE_PROVIDER_DIAGNOSTIC_WITH_TOKEN' } }, status), () => NOW);
    await assert.rejects(auth.signIn(credential), error => {
      assert.ok(error instanceof CloudAuthError); assert.equal(error.code, 'network');
      assert.equal(error.message, 'No hay conexión. Tus datos siguen guardados aquí.'); return true;
    });
  }
  const rejected = new CloudAuth(CONFIG, new Vault(), async () => response({ error: 'PRIVATE_PROVIDER_DIAGNOSTIC_WITH_TOKEN' }, 400), () => NOW);
  await assert.rejects(rejected.signIn(credential), code('expired'));
  await assert.rejects(new CloudAuth(CONFIG, new Vault(), offline, () => NOW).signIn(credential), code('network'));
  await assert.rejects(new CloudAuth(CONFIG, new Vault(), async () => new Response('not json'), () => NOW).signIn(credential), code('invalid'));
});

test('default browser fetch keeps the global receiver when Firebase exchanges a credential', async context => {
  context.mock.method(globalThis, 'fetch', async function (this: unknown) {
    assert.equal(this, globalThis);
    return response(identity());
  });
  const auth = new CloudAuth(CONFIG, new Vault(), undefined, () => NOW);
  await auth.signIn(credential);
  assert.equal(auth.account?.uid, identity().localId);
});

test('the 20-second timeout aborts and rejects even a fetcher that ignores abort', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null = null;
  const fetcher: typeof fetch = async (_input, init) => { signal = init?.signal ?? null; return new Promise<Response>(() => undefined); };
  const auth = new CloudAuth(CONFIG, new Vault(), fetcher, () => NOW);
  const failed = assert.rejects(auth.signIn(credential), code('network'));
  context.mock.timers.tick(19_999); assert.equal((signal as AbortSignal | null)?.aborted, false);
  context.mock.timers.tick(1); await failed;
  assert.equal((signal as AbortSignal | null)?.aborted, true); assert.equal(auth.account, null);
});
