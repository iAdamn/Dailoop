import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalize, createEmptyState, execute } from '../src/domain';
import { FirestoreSyncTransport, SyncCloudError } from '../src/sync/firestore';

// This suite is opt-in and refuses any production endpoint. The launcher owns
// the short-lived demo emulators and does not import a Firebase client/admin SDK.
const enabled = process.env.DAILOOP_RULES_EMULATOR === '1';
const projectId = 'demo-dailoop-sync';
const firestore = 'http://127.0.0.1:8088';
const auth = 'http://127.0.0.1:9099';
const resource = `projects/${projectId}/databases/(default)/documents`;
const sha = async (text: string) => createHash('sha256').update(text).digest('hex');
const integer = (number: number) => ({ integerValue: String(number) });
const string = (text: string) => ({ stringValue: text });
interface Account { uid: string; token: string }
async function account(): Promise<Account> {
  const response = await fetch(`${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  assert.equal(response.status, 200, 'Auth emulator must issue a real isolated test token');
  const body = await response.json() as { localId: string; idToken: string };
  assert.equal(typeof body.localId, 'string'); assert.equal(typeof body.idToken, 'string');
  const claims = JSON.parse(Buffer.from(body.idToken.split('.')[1], 'base64url').toString()) as { aud: string };
  assert.equal(claims.aud, projectId, 'Never accept a token for a live project');
  return { uid: body.localId, token: body.idToken };
}
async function request(path: string, token?: string, method = 'GET', body?: unknown): Promise<Response> {
  return fetch(`${firestore}/v1/${resource}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function create(path: string, fields: unknown, token?: string): Promise<Response> {
  return request(':commit', token, 'POST', { writes: [{ update: { name: `${resource}/${path}`, fields }, currentDocument: { exists: false } }] });
}
async function status(response: Response, expected: number): Promise<void> {
  // A failed assertion includes only the emulator's response, never request auth.
  const body = await response.text(); assert.equal(response.status, expected, body);
}
function chunkFields(hash: string, text: string) { return { schema: integer(1), hash: string(hash), text: string(text) }; }
function manifestFields(version: string, hashes: unknown[], bytes: number) { return { schema: integer(1), version: string(version), chunks: { arrayValue: { values: hashes } }, bytes: integer(bytes) }; }
const denied = (error: unknown): boolean => error instanceof SyncCloudError && error.code === 'permission';
const conflict = (error: unknown): boolean => error instanceof SyncCloudError && error.code === 'conflict';

test('real Firebase Emulator rules and production REST transport', { skip: !enabled, timeout: 120_000 }, async context => {
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8088');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  const alice = await account(); const bob = await account();
  const transport = new FirestoreSyncTransport({ projectId, baseUrl: firestore }, async () => alice.token, sha);
  const text = 'Dailoop ☕ — datos propios'; const hash = await sha(text); const chunkPath = `users/${alice.uid}/chunks/${hash}`;

  await context.test('unauthenticated reads and writes are denied', async () => {
    await status(await request(`/${chunkPath}`), 403);
    await status(await create(chunkPath, chunkFields(hash, text)), 403);
  });
  await context.test('owner may create/get a bounded, correctly hashed immutable chunk', async () => {
    await status(await create(chunkPath, chunkFields(hash, text), alice.token), 200);
    const response = await request(`/${chunkPath}`, alice.token); assert.equal(response.status, 200);
    const body = await response.json() as { fields: { text: { stringValue: string } } }; assert.equal(body.fields.text.stringValue, text);
  });
  await context.test('another authenticated user cannot read, create, overwrite or list the owner data', async () => {
    await status(await request(`/${chunkPath}`, bob.token), 403);
    await status(await create(`users/${alice.uid}/chunks/${await sha('another')}`, chunkFields(await sha('another'), 'another'), bob.token), 403);
    await status(await request(`/${chunkPath}`, bob.token, 'PATCH', { fields: chunkFields(hash, text) }), 403);
    await status(await request(`/users/${alice.uid}/chunks`, bob.token), 403);
  });
  await context.test('owner cannot modify, delete, list or add unexpected chunk fields', async () => {
    await status(await request(`/${chunkPath}`, alice.token, 'PATCH', { fields: chunkFields(hash, text) }), 403);
    await status(await request(`/${chunkPath}`, alice.token, 'DELETE'), 403);
    await status(await request(`/users/${alice.uid}/chunks`, alice.token), 403);
    const extraText = 'extra'; const extraHash = await sha(extraText);
    await status(await create(`users/${alice.uid}/chunks/${extraHash}`, { ...chunkFields(extraHash, extraText), debug: string('unexpected') }, alice.token), 403);
  });
  await context.test('actual SHA mismatch, wrong types and oversized UTF-8 chunks are denied', async () => {
    await status(await create(`users/${alice.uid}/chunks/${'0'.repeat(64)}`, chunkFields('0'.repeat(64), 'not that hash'), alice.token), 403);
    const oversized = '😀'.repeat(65_537); const oversizedHash = await sha(oversized);
    await status(await create(`users/${alice.uid}/chunks/${oversizedHash}`, chunkFields(oversizedHash, oversized), alice.token), 403);
    const typed = 'wrong schema type'; const typedHash = await sha(typed);
    await status(await create(`users/${alice.uid}/chunks/${typedHash}`, { ...chunkFields(typedHash, typed), schema: { doubleValue: 1 } }, alice.token), 403);
  });
  await context.test('the full 256 KiB Unicode boundary is accepted and verified by the actual rules engine', async () => {
    const boundary = '😀'.repeat(65_536); const boundaryHash = await sha(boundary);
    assert.equal(Buffer.byteLength(boundary), 262_144);
    const path = `users/${alice.uid}/chunks/${boundaryHash}`;
    await status(await create(path, chunkFields(boundaryHash, boundary), alice.token), 200);
    const response = await request(`/${path}`, alice.token); assert.equal(response.status, 200);
    const document = await response.json() as { fields: { text: { stringValue: string } } };
    assert.equal(document.fields.text.stringValue, boundary);
  });
  await context.test('malformed manifests are denied, including non-string hashes and total byte overflow', async () => {
    for (const [index, fields] of [
      manifestFields('1'.repeat(64), [integer(42)], 20),
      manifestFields('2'.repeat(64), [string('../another-owner')], 20),
      manifestFields('3'.repeat(64), [string(hash)], 52_428_801),
      manifestFields('4'.repeat(64), [], 20),
      { ...manifestFields('5'.repeat(64), [string(hash)], 20), injected: string('x') },
    ].entries()) await status(await create(`users/${alice.uid}/versions/${String(index + 1).repeat(64)}`, fields, alice.token), 403);
  });
  await context.test('head must reference an existing, valid manifest and contain only its schema fields', async () => {
    const path = `users/${alice.uid}/sync/head`;
    await status(await create(path, { schema: integer(1), version: string('9'.repeat(64)) }, alice.token), 403);
    await status(await create(path, { schema: integer(1), version: string('9'.repeat(64)), secret: string('x') }, alice.token), 403);
  });
  await context.test('production transport stages, validates, publishes and reloads real immutable documents', async () => {
    const state = createEmptyState({ databaseId: '00000000-0000-4000-8000-000000000001', nowMs: Date.parse('2026-10-16T00:00Z') });
    assert.equal(await transport.readHead(alice.uid), null);
    const version = await transport.stage(alice.uid, state);
    await transport.publish(alice.uid, version, null);
    assert.equal((await transport.readHead(alice.uid))?.version, version);
    assert.equal(canonicalize(await transport.load(alice.uid, version)), canonicalize(state));
    assert.equal(await transport.stage(alice.uid, state), version, 'retry may not rewrite immutable records');
    const other = new FirestoreSyncTransport({ projectId, baseUrl: firestore }, async () => bob.token, sha);
    await assert.rejects(other.readHead(alice.uid), denied);
    await assert.rejects(other.load(alice.uid, version), denied);
  });
  await context.test('two device heads race through updateTime CAS and the stale writer loses', async () => {
    const before = await transport.readHead(alice.uid); assert.ok(before);
    const state = await transport.load(alice.uid, before.version);
    const updated = execute(state, { type: 'updateSettings', changes: { theme: 'dark' } }, { nowMs: Date.parse('2026-10-16T00:01Z'), operationId: '00000000-0000-4000-8000-000000000002', nextId: () => { throw new Error('updateSettings must not allocate entities'); } }).state;
    const version = await transport.stage(alice.uid, updated);
    await transport.publish(alice.uid, version, before);
    await assert.rejects(transport.publish(alice.uid, before.version, before), conflict);
    await assert.rejects(transport.publish(alice.uid, before.version, null), conflict);
    assert.equal((await transport.readHead(alice.uid))?.version, version);
  });
  await context.test('head deletion and paths outside the synchronization schema remain denied', async () => {
    await status(await request(`/users/${alice.uid}/sync/head`, alice.token, 'DELETE'), 403);
    await status(await create(`users/${alice.uid}/profile/current`, { anything: string('x') }, alice.token), 403);
  });
  await context.test('recovery bookmarks preserve staged branches and reject malformed or oversized lists', async () => {
    const before = await transport.readHead(alice.uid); assert.ok(before);
    const state = await transport.load(alice.uid, before.version);
    const branch = execute(state, { type: 'updateSettings', changes: { theme: 'light' } }, { nowMs: Date.parse('2026-10-16T00:02Z'), operationId: '00000000-0000-4000-8000-000000000003', nextId: () => { throw new Error('unexpected ID'); } }).state;
    const branchVersion = await transport.stage(alice.uid, branch);
    await transport.publish(alice.uid, before.version, before);
    const after = await transport.readHead(alice.uid); assert.ok(after && after.recovery); assert.ok(after.recovery.includes(branchVersion));
    assert.ok(after.recovery.includes(before.version));
    const path = `/users/${alice.uid}/sync/head`;
    for (const recovery of [
      { arrayValue: { values: Array.from({ length: 21 }, (_, index) => string(index.toString(16).padStart(64, '0'))) } },
      { arrayValue: { values: [string('../another-owner')] } },
      { arrayValue: { values: [integer(42)] } },
      { arrayValue: { values: [string(before.version), string(before.version)] } },
    ]) await status(await request(path, alice.token, 'PATCH', { fields: { schema: integer(1), version: string(before.version), recovery } }), 403);
    await status(await request(path, bob.token, 'PATCH', { fields: { schema: integer(1), version: string(before.version), recovery: { arrayValue: { values: [string(branchVersion)] } } } }), 403);
    assert.ok((await transport.readHead(alice.uid))?.recovery?.includes(branchVersion));
  });
});
