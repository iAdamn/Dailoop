import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalize, createEmptyState, execute, type DomainState } from '../src/domain';
import { FirestoreSyncTransport, splitSyncText, SyncCloudError } from '../src/sync/firestore';
import { SYNC_CHUNK_BYTES } from '../src/sync/protocol';

const sha = async (text: string): Promise<string> => createHash('sha256').update(text).digest('hex');
const NOW = Date.parse('2026-10-16T00:00:00.000Z');
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function dataset(entries = 1): DomainState {
  let serial = 1; const nextId = () => id(serial++);
  let state = createEmptyState({ databaseId: nextId(), nowMs: NOW });
  let result = execute(state, { type: 'createActivity', name: 'Cancelar 🔔', emoji: '☕', color: '#6F5BFF', category: 'Todas' }, { nowMs: NOW, operationId: nextId(), nextId });
  state = result.state; const activityId = result.result.activityId!;
  for (let index = 0; index < entries; index++) {
    result = execute(state, { type: 'createEntry', activityId, note: entries > 1 ? '😀é'.repeat(500) : 'Original' }, { nowMs: NOW, operationId: nextId(), nextId }); state = result.state;
  }
  return state;
}
type MockDoc = { name: string; fields: Record<string, unknown>; updateTime: string };
function mockCloud() {
  const docs = new Map<string, MockDoc>(); const calls: { url: string; method: string; body?: Record<string, any> }[] = []; let sequence = 0; let race = false; let owner = 'alice';
  const failure = (status: number, code: string) => new Response(JSON.stringify({ error: { status: code, message: 'This private provider message must never escape' } }), { status });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const method = init?.method ?? 'GET'; const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(input), method, body });
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${owner}-token`); assert.equal(init?.redirect, 'error');
    if (!url.pathname.includes(`/users/${owner}/`) && method === 'GET') return failure(403, 'PERMISSION_DENIED');
    if (method === 'GET') { const name = decodeURIComponent(url.pathname.slice('/v1/'.length)); const doc = docs.get(name); return doc ? Response.json(doc) : failure(404, 'NOT_FOUND'); }
    assert.equal(url.pathname, '/v1/projects/dailoop-test/databases/(default)/documents:commit'); assert.equal(body.writes.length, 1);
    const write = body.writes[0]; const name = write.update.name as string;
    if (!name.includes(`/users/${owner}/`)) return failure(403, 'PERMISSION_DENIED');
    const existing = docs.get(name); const precondition = write.currentDocument;
    if (precondition.exists === false && existing) return failure(409, 'ALREADY_EXISTS');
    if (precondition.updateTime && existing?.updateTime !== precondition.updateTime) return failure(400, 'FAILED_PRECONDITION');
    const committedAt = new Date(NOW + ++sequence).toISOString();
    // Firestore may retain updateTime for a write that changes no fields.
    const stamp = existing && canonicalize(existing.fields) === canonicalize(write.update.fields) ? existing.updateTime : committedAt;
    docs.set(name, { name, fields: write.update.fields, updateTime: stamp });
    if (race && !name.endsWith('/head')) { race = false; return failure(409, 'ALREADY_EXISTS'); }
    return Response.json({ writeResults: [{ updateTime: stamp }], commitTime: committedAt });
  };
  const transport = new FirestoreSyncTransport({ projectId: 'dailoop-test', apiKey: 'public-key' }, async () => `${owner}-token`, sha, fetcher);
  return { docs, calls, transport, fetcher, account: (next: string) => { owner = next; }, race: () => { race = true; } };
}
const cloudCode = (code: string) => (error: unknown): boolean => error instanceof SyncCloudError && error.code === code && !error.message.includes('private');
const findDoc = (cloud: ReturnType<typeof mockCloud>, kind: 'chunks' | 'versions') => [...cloud.docs.values()].find(doc => doc.name.includes(`/users/alice/${kind}/`))!;

test('immutable version round-trips canonical domain data, publishes by CAS and skips unchanged writes', async () => {
  const cloud = mockCloud(); const state = dataset(); const original = JSON.stringify(state);
  assert.equal(await cloud.transport.readHead('alice'), null);
  const version = await cloud.transport.stage('alice', state);
  assert.equal(version, await sha(canonicalize(state))); assert.equal(JSON.stringify(state), original);
  assert.equal(await cloud.transport.readHead('alice'), null, 'staging never changes the visible account head');
  await cloud.transport.publish('alice', version, null); const head = await cloud.transport.readHead('alice'); assert.equal(head?.version, version);
  assert.equal(canonicalize(await cloud.transport.load('alice', version)), canonicalize(state));
  const writes = cloud.calls.filter(call => call.method === 'POST').length; await cloud.transport.stage('alice', state);
  assert.equal(cloud.calls.filter(call => call.method === 'POST').length, writes);
  await assert.rejects(cloud.transport.publish('alice', version, null), cloudCode('conflict'));
  const nextVersion = await cloud.transport.stage('alice', dataset(2));
  await cloud.transport.publish('alice', nextVersion, head);
  await assert.rejects(cloud.transport.publish('alice', version, head), cloudCode('conflict'));
  cloud.docs.delete([...cloud.docs.keys()].find(name => name.endsWith('/sync/head'))!);
  await assert.rejects(cloud.transport.publish('alice', version, head), cloudCode('conflict'));
});

test('large UTF-8 history spans bounded chunks without splitting emoji, and retains every audit row', async () => {
  const cloud = mockCloud(); const state = dataset(100); const version = await cloud.transport.stage('alice', state);
  const chunks = [...cloud.docs.values()].filter(doc => doc.name.includes('/chunks/'));
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) { const text = (chunk.fields.text as { stringValue: string }).stringValue; assert.ok(Buffer.byteLength(text) <= SYNC_CHUNK_BYTES); assert.equal(await sha(text), (chunk.fields.hash as { stringValue: string }).stringValue); }
  assert.equal(canonicalize(await cloud.transport.load('alice', version)), canonicalize(state));
  const split = splitSyncText('a'.repeat(SYNC_CHUNK_BYTES - 1) + '😀' + 'é'.repeat(SYNC_CHUNK_BYTES));
  assert.equal(split.join(''), 'a'.repeat(SYNC_CHUNK_BYTES - 1) + '😀' + 'é'.repeat(SYNC_CHUNK_BYTES));
  assert.ok(split.every(part => Buffer.byteLength(part) <= SYNC_CHUNK_BYTES)); assert.ok(split.every(part => !/[\uD800-\uDBFF]$/.test(part)));
});

test('immutable racing creates are idempotent only when the winning fields are exactly equal', async () => {
  const cloud = mockCloud(); cloud.race(); const version = await cloud.transport.stage('alice', dataset());
  assert.equal(canonicalize(await cloud.transport.load('alice', version)), canonicalize(dataset()));
  findDoc(cloud, 'versions').fields.bytes = { integerValue: '1' };
  await assert.rejects(cloud.transport.stage('alice', dataset()), cloudCode('invalid-data'));
});

test('cross-owner paths, injected project/endpoints and unsafe preconditions are refused', async () => {
  const cloud = mockCloud(); const version = await sha('x');
  for (const owner of ['alice/../../bob', 'alice%2Fbob', '', 'a'.repeat(129)]) await assert.rejects(cloud.transport.readHead(owner), cloudCode('invalid-data'));
  assert.equal(cloud.calls.length, 0);
  await assert.rejects(cloud.transport.readHead('bob'), cloudCode('permission'));
  for (const baseUrl of ['https://evil.test', 'https://firestore.googleapis.com.evil.test', 'http://firestore.googleapis.com', 'https://user@firestore.googleapis.com', 'http://localhost:8080/other']) assert.throws(() => new FirestoreSyncTransport({ projectId: 'dailoop-test', baseUrl }, async () => 'x', sha), cloudCode('invalid-data'));
  assert.throws(() => new FirestoreSyncTransport({ projectId: '../users/bob' }, async () => 'x', sha), cloudCode('invalid-data'));
  assert.doesNotThrow(() => new FirestoreSyncTransport({ projectId: 'dailoop-test', baseUrl: 'http://127.0.0.1:8089' }, async () => 'x', sha));
  await assert.rejects(cloud.transport.publish('alice', version, { version, updateTime: 'x' }), cloudCode('invalid-data'));
  await assert.rejects(cloud.transport.load('alice', '../head'), cloudCode('invalid-data'));
});

test('chunk corruption, byte-count mismatch, missing chunks and malformed manifests never return data', async () => {
  for (const corrupt of ['hash', 'text', 'bytes', 'missing', 'schema', 'chunk-id', 'extra']) {
    const cloud = mockCloud(); const version = await cloud.transport.stage('alice', dataset()); const chunk = findDoc(cloud, 'chunks'); const manifest = findDoc(cloud, 'versions');
    if (corrupt === 'hash') chunk.fields.hash = { stringValue: 'f'.repeat(64) };
    if (corrupt === 'text') chunk.fields.text = { stringValue: '{}' };
    if (corrupt === 'bytes') manifest.fields.bytes = { integerValue: '52428801' };
    if (corrupt === 'missing') cloud.docs.delete(chunk.name);
    if (corrupt === 'schema') manifest.fields.schema = { integerValue: '2' };
    if (corrupt === 'chunk-id') manifest.fields.chunks = { arrayValue: { values: [{ stringValue: '../../bob' }] } };
    if (corrupt === 'extra') manifest.fields.debug = { stringValue: 'forbidden' };
    await assert.rejects(cloud.transport.load('alice', version), cloudCode('invalid-data'), corrupt);
  }
});

test('valid hashes cannot disguise a structurally invalid or noncanonical domain state', async () => {
  for (const text of ['{"settings":{}}', JSON.stringify(dataset())]) {
    const cloud = mockCloud(); const version = await sha(text); const root = 'projects/dailoop-test/databases/(default)/documents/users/alice';
    const chunkName = `${root}/chunks/${version}`; const versionName = `${root}/versions/${version}`;
    cloud.docs.set(chunkName, { name: chunkName, fields: { schema: { integerValue: '1' }, hash: { stringValue: version }, text: { stringValue: text } }, updateTime: new Date(NOW).toISOString() });
    cloud.docs.set(versionName, { name: versionName, fields: { schema: { integerValue: '1' }, version: { stringValue: version }, bytes: { integerValue: String(Buffer.byteLength(text)) }, chunks: { arrayValue: { values: [{ stringValue: version }] } } }, updateTime: new Date(NOW).toISOString() });
    await assert.rejects(cloud.transport.load('alice', version), cloudCode('invalid-data'));
  }
});

test('quota, authentication, transient network and failed preconditions expose only fixed classifications', async () => {
  for (const [status, rpcStatus, code] of [[403, 'PERMISSION_DENIED', 'permission'], [429, 'RESOURCE_EXHAUSTED', 'quota'], [503, 'UNAVAILABLE', 'network'], [400, 'FAILED_PRECONDITION', 'conflict']] as const) {
    const fetcher: typeof fetch = async () => Response.json({ error: { status: rpcStatus, message: 'private body' } }, { status });
    const transport = new FirestoreSyncTransport({ projectId: 'dailoop-test' }, async () => 'token', sha, fetcher);
    await assert.rejects(transport.readHead('alice'), cloudCode(code));
  }
  const offline = new FirestoreSyncTransport({ projectId: 'dailoop-test' }, async () => 'token', sha, async () => { throw new TypeError('private body'); });
  await assert.rejects(offline.readHead('alice'), cloudCode('network'));
  const invalidToken = new FirestoreSyncTransport({ projectId: 'dailoop-test' }, async () => 'token\r\nInjected: yes', sha, async () => { throw new Error('must not fetch'); });
  await assert.rejects(invalidToken.readHead('alice'), cloudCode('permission'));
});

test('response names, malformed JSON, envelope size and dishonest digest functions fail closed', async () => {
  const head = { name: 'projects/dailoop-test/databases/(default)/documents/users/bob/sync/head', fields: { schema: { integerValue: '1' }, version: { stringValue: 'f'.repeat(64) } }, updateTime: new Date(NOW).toISOString() };
  for (const fetcher of [async () => Response.json(head), async () => new Response('{'), async () => new Response('{}', { headers: { 'Content-Length': '90000000' } }), async () => new Response(' '.repeat(2_000_000))] as typeof fetch[]) {
    const transport = new FirestoreSyncTransport({ projectId: 'dailoop-test' }, async () => 'token', sha, fetcher);
    await assert.rejects(transport.readHead('alice'), cloudCode('invalid-data'));
  }
  const broken = new FirestoreSyncTransport({ projectId: 'dailoop-test' }, async () => 'token', async () => 'short', async () => { throw new Error('must not fetch'); });
  await assert.rejects(broken.stage('alice', dataset()), cloudCode('invalid-data'));
  const cloud = mockCloud(); await assert.rejects(cloud.transport.stage('alice', {} as DomainState), cloudCode('invalid-data')); assert.equal(cloud.calls.length, 0);
});

test('token refresh failures preserve offline/quota classification without forwarding sensitive diagnostics', async () => {
  for (const code of ['network', 'quota', 'revoked', undefined]) {
    let fetched = false;
    const transport = new FirestoreSyncTransport({ projectId: 'dailoop-test' }, async () => { throw Object.assign(new Error('private token diagnostics'), { code }); }, sha, async () => { fetched = true; throw new Error('must not fetch'); });
    await assert.rejects(transport.readHead('alice'), cloudCode(code === 'network' || code === 'quota' ? code : 'permission'));
    assert.equal(fetched, false);
  }
});

test('a committed chunk whose response was lost can be resumed without duplicate or mutable writes', async () => {
  const cloud = mockCloud(); let lost = true;
  const flaky: typeof fetch = async (input, init) => {
    const response = await cloud.fetcher(input, init);
    if (lost && init?.method === 'POST') { lost = false; throw new TypeError('Connection lost after server commit'); }
    return response;
  };
  const transport = new FirestoreSyncTransport({ projectId: 'dailoop-test' }, async () => 'alice-token', sha, flaky);
  await assert.rejects(transport.stage('alice', dataset()), cloudCode('network'));
  assert.equal(cloud.docs.size, 1, 'server committed the chunk despite the missing acknowledgement');
  const first = await transport.stage('alice', dataset());
  assert.equal(cloud.docs.size, 2, 'retry reused the durable chunk and added only its manifest');
  assert.equal(canonicalize(await transport.load('alice', first)), canonicalize(dataset()));
  const writes = cloud.calls.filter(call => call.method === 'POST').length;
  assert.equal(await transport.stage('alice', dataset()), first);
  assert.equal(cloud.calls.filter(call => call.method === 'POST').length, writes);
});

test('published recovery retains both staged branches and older bookmarks, capped to the latest twenty', async () => {
  const cloud = mockCloud(); const original = await cloud.transport.stage('alice', dataset());
  await cloud.transport.publish('alice', original, null);
  const headName = [...cloud.docs.keys()].find(name => name.endsWith('/sync/head'))!;
  const older: string[] = []; for (let index = 0; index < 20; index++) older.push(await sha(`old-${index}`));
  cloud.docs.get(headName)!.fields.recovery = { arrayValue: { values: older.map(value => ({ stringValue: value })) } };
  const before = await cloud.transport.readHead('alice'); assert.ok(before);
  const localBranch = await cloud.transport.stage('alice', dataset(2));
  const remoteBranch = await cloud.transport.stage('alice', dataset(3));
  await cloud.transport.publish('alice', localBranch, before);
  const after = await cloud.transport.readHead('alice'); assert.ok(after);
  assert.equal(after.recovery?.length, 20); assert.equal(after.recovery?.at(-1), localBranch);
  assert.ok(after.recovery?.includes(original)); assert.ok(after.recovery?.includes(remoteBranch)); assert.ok(after.recovery?.includes(older.at(-1)!));
  assert.ok(!after.recovery?.includes(older[0])); assert.equal(new Set(after.recovery).size, 20);
  assert.equal(canonicalize(await cloud.transport.load('alice', remoteBranch)), canonicalize(dataset(3)));
});

test('staged recovery is isolated per account even when one transport switches authenticated owners', async () => {
  const cloud = mockCloud(); const aliceVersion = await cloud.transport.stage('alice', dataset());
  cloud.account('bob'); const bobVersion = await cloud.transport.stage('bob', dataset(2));
  await cloud.transport.publish('bob', bobVersion, null);
  assert.deepEqual((await cloud.transport.readHead('bob'))?.recovery, [bobVersion]);
  cloud.account('alice'); await cloud.transport.publish('alice', aliceVersion, null);
  assert.deepEqual((await cloud.transport.readHead('alice'))?.recovery, [aliceVersion]);
});

test('legacy heads remain readable while corrupt, oversized or duplicate recovery arrays fail closed', async () => {
  const cloud = mockCloud(); const version = await cloud.transport.stage('alice', dataset()); await cloud.transport.publish('alice', version, null);
  const doc = [...cloud.docs.values()].find(item => item.name.endsWith('/sync/head'))!; delete doc.fields.recovery;
  const legacy = await cloud.transport.readHead('alice'); assert.ok(legacy); assert.equal(legacy.recovery, undefined);
  await cloud.transport.publish('alice', version, legacy);
  for (const recovery of [
    { stringValue: version },
    { arrayValue: { values: [{ integerValue: '42' }] } },
    { arrayValue: { values: [{ stringValue: '../bob' }] } },
    { arrayValue: { values: Array.from({ length: 21 }, () => ({ stringValue: version })) } },
    { arrayValue: { values: [{ stringValue: version }, { stringValue: version }] } },
  ]) { cloud.docs.get(doc.name)!.fields.recovery = recovery; await assert.rejects(cloud.transport.readHead('alice'), cloudCode('invalid-data')); }
});

test('default browser fetch retains the global receiver rather than the transport instance', async context => {
  const original = globalThis.fetch; context.after(() => { globalThis.fetch = original; });
  const version = await sha('fixture');
  globalThis.fetch = async function (this: unknown) {
    assert.equal(this, globalThis, 'Web fetch rejects a class instance receiver');
    return Response.json({ name: 'projects/dailoop-test/databases/(default)/documents/users/alice/sync/head', fields: { schema: { integerValue: '1' }, version: { stringValue: version } }, updateTime: new Date(NOW).toISOString() });
  };
  const transport = new FirestoreSyncTransport({ projectId: 'dailoop-test' }, async () => 'fixture', sha);
  assert.equal((await transport.readHead('alice'))?.version, version);
});
