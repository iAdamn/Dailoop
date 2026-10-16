import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { purgeCloudAccount } from '../src/sync/deletion';

// No production credentials/endpoints: the parent launches only demo emulators.
const enabled = process.env.DAILOOP_RULES_EMULATOR === '1';
const projectId = 'demo-dailoop-sync';
const firestore = 'http://127.0.0.1:8088';
const auth = 'http://127.0.0.1:9099';
const resource = `projects/${projectId}/databases/(default)/documents`;
const integer = (value: number) => ({ integerValue: String(value) });
const string = (value: string) => ({ stringValue: value });
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
interface Account { uid: string; token: string }
async function account(): Promise<Account> {
  const response = await fetch(`${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  assert.equal(response.status, 200);
  const body = await response.json() as { localId: string; idToken: string };
  const claims = JSON.parse(Buffer.from(body.idToken.split('.')[1], 'base64url').toString()) as { aud: string };
  assert.equal(claims.aud, projectId);
  return { uid: body.localId, token: body.idToken };
}
/** Auth emulator tokens are unsigned. Changing only this claim permits actual
 * rules-engine boundary tests; production JWT validation is never bypassed. */
function authTime(account: Account, seconds: number): string {
  const [header, payload] = account.token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.aud, projectId); claims.auth_time = seconds;
  return `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`;
}
async function request(path: string, token?: string, method = 'GET', body?: unknown): Promise<Response> {
  return fetch(`${firestore}/v1/${resource}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function commit(writes: unknown[], token?: string): Promise<Response> { return request(':commit', token, 'POST', { writes }); }
const create = (path: string, fields: unknown) => ({ update: { name: `${resource}/${path}`, fields }, currentDocument: { exists: false } });
const fenceWrite = (uid: string) => ({ ...create(`users/${uid}/security/deletion`, { schema: integer(1) }), updateTransforms: [{ fieldPath: 'startedAt', setToServerValue: 'REQUEST_TIME' }] });
const chunk = (text: string) => ({ schema: integer(1), hash: string(sha(text)), text: string(text) });
const manifest = (version: string, hash: string, bytes: number) => ({ schema: integer(1), version: string(version), chunks: { arrayValue: { values: [string(hash)] } }, bytes: integer(bytes) });
async function status(response: Response, expected: number): Promise<void> { const text = await response.text(); assert.equal(response.status, expected, text); }

test('deletion fence uses fresh owner auth and prevents resurrection in actual Firestore rules', { skip: !enabled, timeout: 120_000 }, async context => {
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8088');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  const alice = await account(); const bob = await account(); const stale = authTime(alice, Math.floor(Date.now() / 1000) - 301);
  const text = 'Deletion fixture ☕'; const hash = sha(text); const version = sha(`version:${text}`);
  const root = `users/${alice.uid}`;
  await status(await commit([create(`${root}/chunks/${hash}`, chunk(text))], alice.token), 200);
  await status(await commit([create(`${root}/versions/${version}`, manifest(version, hash, Buffer.byteLength(text)))], alice.token), 200);
  await status(await commit([create(`${root}/sync/head`, { schema: integer(1), version: string(version) })], alice.token), 200);

  await context.test('normal sync remains readable but deletion/list requires a prior fence', async () => {
    await status(await request(`/${root}/chunks/${hash}`, stale), 200,);
    await status(await request(`/${root}/chunks`, alice.token), 403);
    await status(await request(`/${root}/chunks/${hash}`, alice.token, 'DELETE'), 403);
    await status(await request(`/${root}/versions/${version}`, alice.token, 'DELETE'), 403);
    await status(await request(`/${root}/sync/head`, alice.token, 'DELETE'), 403);
  });
  await context.test('unauthenticated, cross-owner, stale and future auth cannot start deletion', async () => {
    await status(await commit([fenceWrite(alice.uid)]), 403);
    await status(await commit([fenceWrite(alice.uid)], bob.token), 403);
    await status(await commit([fenceWrite(alice.uid)], stale), 403);
    const future = authTime(alice, Math.floor(Date.now() / 1000) + 60);
    await status(await request(`/${root}/chunks/${hash}`, future), 200);
    await status(await commit([fenceWrite(alice.uid)], future), 403);
  });
  await context.test('fence requires exactly schema1 and server request time', async () => {
    for (const fields of [
      { schema: integer(1), startedAt: { timestampValue: '2020-01-01T00:00:00Z' } },
      { schema: integer(2), startedAt: { timestampValue: '2020-01-01T00:00:00Z' } },
      { schema: integer(1), startedAt: { timestampValue: '2020-01-01T00:00:00Z' }, email: string('not retained') },
    ]) await status(await commit([create(`${root}/security/deletion`, fields)], alice.token), 403);
  });
  await context.test('atomic fence-plus-upload fails and rolls back every write', async () => {
    const concurrentText = 'same-commit writer'; const concurrentHash = sha(concurrentText);
    await status(await commit([fenceWrite(alice.uid), create(`${root}/chunks/${concurrentHash}`, chunk(concurrentText))], alice.token), 403);
    await status(await request(`/${root}/security/deletion`, alice.token), 404);
    await status(await request(`/${root}/chunks/${concurrentHash}`, alice.token), 404);
  });
  await context.test('fresh owner creates the minimal immutable marker', async () => {
    await status(await commit([fenceWrite(alice.uid)], alice.token), 200);
    const response = await request(`/${root}/security/deletion`, alice.token); assert.equal(response.status, 200);
    const document = await response.json() as { fields: Record<string, unknown> };
    assert.deepEqual(Object.keys(document.fields).sort(), ['schema', 'startedAt']);
    await status(await request(`/${root}/security/deletion`, alice.token, 'PATCH', { fields: { schema: integer(1), startedAt: { timestampValue: '2020-01-01T00:00:00Z' } } }), 403);
    await status(await request(`/${root}/security/deletion`, alice.token, 'DELETE'), 403);
    await status(await request(`/${root}/security`, alice.token), 403);
  });
  await context.test('old and current clients cannot create payloads or change head after deletion starts', async () => {
    const another = 'after-fence'; const nextHash = sha(another); const nextVersion = sha(`version:${another}`);
    for (const token of [alice.token, stale]) {
      await status(await commit([create(`${root}/chunks/${nextHash}`, chunk(another))], token), 403);
      await status(await commit([create(`${root}/versions/${nextVersion}`, manifest(nextVersion, hash, 1))], token), 403);
      await status(await request(`/${root}/sync/head`, token, 'PATCH', { fields: { schema: integer(1), version: string(version) } }), 403);
    }
  });
  await context.test('only fresh owner can list/get/delete payload under an existing fence', async () => {
    await status(await request(`/${root}/security/deletion`, stale), 200);
    await status(await request(`/${root}/chunks/${hash}`, stale), 403);
    for (const token of [undefined, bob.token, stale]) {
      await status(await request(`/${root}/chunks?pageSize=100`, token), 403);
      await status(await request(`/${root}/versions?pageSize=100`, token), 403);
      await status(await request(`/${root}/chunks/${hash}`, token, 'DELETE'), 403);
      await status(await request(`/${root}/versions/${version}`, token, 'DELETE'), 403);
      await status(await request(`/${root}/sync/head`, token, 'DELETE'), 403);
    }
    await status(await request(`/${root}/chunks/${hash}`, alice.token), 200);
    await status(await request(`/${root}/versions/${version}`, alice.token), 200);
    await status(await request(`/${root}/chunks?pageSize=100`, alice.token), 200);
    await status(await request(`/${root}/versions?pageSize=100`, alice.token), 200);
  });
  await context.test('production purger uses names-only REST masks, removes payload and retains fence', async () => {
    const progress: string[] = [];
    await purgeCloudAccount({ projectId, baseUrl: firestore }, alice.uid, async () => alice.token, value => progress.push(value.phase));
    assert.equal(progress.at(-1), 'complete');
    await status(await request(`/${root}/chunks/${hash}`, alice.token), 404);
    await status(await request(`/${root}/versions/${version}`, alice.token), 404);
    await status(await request(`/${root}/sync/head`, alice.token), 404);
    await status(await request(`/${root}/security/deletion`, alice.token), 200);
    await status(await commit([create(`${root}/chunks/${hash}`, chunk(text))], alice.token), 403);
    await purgeCloudAccount({ projectId, baseUrl: firestore }, alice.uid, async () => alice.token);
  });
  await context.test('another account still uses normal synchronization after one UID is erased', async () => {
    const otherText = 'independent owner'; const otherHash = sha(otherText);
    await status(await commit([create(`users/${bob.uid}/chunks/${otherHash}`, chunk(otherText))], bob.token), 200);
    await status(await request(`/users/${bob.uid}/chunks/${otherHash}`, bob.token), 200);
    await status(await request(`/users/${bob.uid}/security/deletion`, alice.token), 403);
  });
});
