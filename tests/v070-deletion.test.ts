import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountDeletionError, purgeCloudAccount, type DeletionProgress } from '../src/sync/deletion';

const config = { projectId: 'dailoop-test', apiKey: 'public-key' };
const owner = 'alice';
const resource = 'projects/dailoop-test/databases/(default)/documents';
const fenceName = `${resource}/users/${owner}/security/deletion`;
const timestamp = '2026-10-16T03:00:00.000Z';
const token = async () => 'isolated-firebase-id-token';
const hash = (index: number) => index.toString(16).padStart(64, '0');
const fence = () => ({ name: fenceName, fields: { schema: { integerValue: '1' }, startedAt: { timestampValue: timestamp } }, createTime: timestamp, updateTime: timestamp });
const failure = (status: number, code: string) => Response.json({ error: { status: code, message: 'PRIVATE_PROVIDER_MESSAGE_MUST_NOT_ESCAPE' } }, { status });
const code = (expected: string) => (error: unknown): boolean => error instanceof AccountDeletionError && error.code === expected && !error.message.includes('PRIVATE');
type Document = { name: string; fields: Record<string, unknown>; createTime?: string; updateTime?: string };
function cloud(chunks = 0, versions = 0) {
  const docs = new Map<string, Document>();
  for (const [collection, count] of [['chunks', chunks], ['versions', versions]] as const) for (let index = 0; index < count; index++) {
    const name = `${resource}/users/${owner}/${collection}/${hash(index + 1)}`;
    docs.set(name, { name, fields: { content: { stringValue: 'PRIVATE_DATA_NOT_DOWNLOADED' } } });
  }
  const head = `${resource}/users/${owner}/sync/head`; docs.set(head, { name: head, fields: {} });
  const calls: { url: URL; method: string; body?: { writes: any[] } }[] = [];
  let commits = 0; let failCommit = 0; let createRace = false; let ignoreDeletes = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const method = init?.method ?? 'GET'; const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer isolated-firebase-id-token'); assert.equal(init?.redirect, 'error');
    if (method === 'POST') {
      commits++; if (commits === failCommit) return failure(503, 'UNAVAILABLE');
      assert.equal(url.pathname, `/v1/${resource}:commit`); assert(body.writes.length <= 100);
      for (const write of body.writes) {
        const name = write.update?.name ?? write.delete;
        assert(name.startsWith(`${resource}/users/${owner}/`), 'every mutation must stay inside the selected UID');
        if (write.update) {
          assert.equal(name, fenceName); assert.deepEqual(write.currentDocument, { exists: false });
          assert.deepEqual(write.update.fields, { schema: { integerValue: '1' } });
          assert.deepEqual(write.updateTransforms, [{ fieldPath: 'startedAt', setToServerValue: 'REQUEST_TIME' }]);
          if (docs.has(name)) return failure(409, 'ALREADY_EXISTS');
          docs.set(name, fence());
          if (createRace) { createRace = false; return failure(409, 'ALREADY_EXISTS'); }
        } else if (!ignoreDeletes) docs.delete(name);
      }
      return Response.json({ writeResults: body.writes.map(() => ({})), commitTime: timestamp });
    }
    const path = url.pathname.slice('/v1/'.length);
    if (path.endsWith('/chunks') || path.endsWith('/versions')) {
      assert.equal(url.searchParams.get('pageSize'), '100'); assert.equal(url.searchParams.get('mask.fieldPaths'), 'dailoopDeletionNameOnly');
      assert.equal(url.searchParams.get('fields'), 'documents(name),nextPageToken');
      assert(docs.has(fenceName), 'never list private payload until the fence is confirmed');
      const after = url.searchParams.get('pageToken') ?? '';
      const names = [...docs.keys()].filter(name => name.startsWith(`${path}/`) && name > after).sort();
      const page = names.slice(0, 100);
      return Response.json({ ...(page.length ? { documents: page.map(name => ({ name })) } : {}), ...(names.length > 100 ? { nextPageToken: page[page.length - 1] } : {}) });
    }
    const document = docs.get(path);
    return document ? Response.json(document) : failure(404, 'NOT_FOUND');
  };
  return { docs, calls, fetcher, failAtCommit: (index: number) => { failCommit = index; }, createRace: () => { createRace = true; }, ignoreDeletes: () => { ignoreDeletes = true; } };
}

test('purge creates one server-timestamp fence, pages names only and verifies every payload collection', async () => {
  const c = cloud(205, 135); const progress: DeletionProgress[] = [];
  await purgeCloudAccount(config, owner, token, value => progress.push(value), c.fetcher);
  assert.deepEqual([...c.docs.keys()], [fenceName]);
  const deleting = c.calls.filter(call => call.body?.writes[0]?.delete);
  assert(deleting.every(call => call.body!.writes.length <= 100));
  assert.equal(deleting.reduce((sum, call) => sum + call.body!.writes.filter(write => write.delete !== `${resource}/users/alice/sync/head`).length, 0), 340);
  assert(c.calls.some(call => call.url.searchParams.has('pageToken')));
  assert.equal(progress.at(-1)?.phase, 'complete'); assert.equal(progress.at(-1)?.deleted, 340);
  assert.equal(c.calls.filter(call => call.body?.writes[0]?.update).length, 1);
  const last = c.calls.at(-1)!; assert.equal(last.url.pathname, `/v1/${fenceName}`);
});

test('partial failure never reports success and a new attempt resumes without recreating the fence', async () => {
  const c = cloud(205, 1); const progress: DeletionProgress[] = []; c.failAtCommit(3);
  await assert.rejects(purgeCloudAccount(config, owner, token, value => progress.push(value), c.fetcher), code('network'));
  assert(c.docs.has(fenceName)); assert.equal([...c.docs.keys()].filter(name => name.includes('/chunks/')).length, 105);
  assert(!progress.some(value => value.phase === 'complete'));
  c.failAtCommit(0); await purgeCloudAccount(config, owner, token, undefined, c.fetcher);
  assert.deepEqual([...c.docs.keys()], [fenceName]);
  assert.equal(c.calls.filter(call => call.body?.writes[0]?.update).length, 1);
});

test('racing fence creation is idempotent only after reading and validating the winner', async () => {
  const c = cloud(1, 1); c.createRace();
  await purgeCloudAccount(config, owner, token, undefined, c.fetcher);
  assert.deepEqual([...c.docs.keys()], [fenceName]);
  const invalid = cloud(); invalid.docs.set(fenceName, { name: fenceName, fields: { schema: { integerValue: '9' }, startedAt: { timestampValue: timestamp } } });
  await assert.rejects(purgeCloudAccount(config, owner, token, undefined, invalid.fetcher), code('invalid-data'));
  assert(!invalid.calls.some(call => call.method === 'POST'));
});

test('malformed or cross-owner list documents never become deletion targets', async () => {
  for (const document of [
    { name: `${resource}/users/bob/chunks/${hash(1)}` },
    { name: `${resource}/users/alice/chunks/../versions/${hash(1)}` },
    { name: `${resource}/users/alice/chunks/${hash(1)}`, fields: { text: { stringValue: 'PRIVATE' } } },
    { name: `${resource}/users/alice/chunks/not-a-hash` },
  ]) {
    const c = cloud(); c.docs.set(fenceName, fence());
    const fetcher: typeof fetch = (input, init) => String(input).includes('/chunks?') ? Promise.resolve(Response.json({ documents: [document] })) : c.fetcher(input, init);
    await assert.rejects(purgeCloudAccount(config, owner, token, undefined, fetcher), code('invalid-data'));
    assert(!c.calls.some(call => call.body?.writes[0]?.delete));
  }
});

test('verification rejects acknowledged but incomplete deletes and preserves the fence', async () => {
  const c = cloud(1, 1); c.ignoreDeletes(); const progress: DeletionProgress[] = [];
  await assert.rejects(purgeCloudAccount(config, owner, token, value => progress.push(value), c.fetcher), code('incomplete'));
  assert(c.docs.has(fenceName)); assert(!progress.some(value => value.phase === 'complete'));
});

test('bad projects/endpoints/UIDs cannot receive a token or make a request', async () => {
  let accesses = 0; const unexpected = async () => { accesses++; return 'secret'; };
  for (const [value, uid] of [
    [{ ...config, projectId: '../another-project' }, owner],
    [{ ...config, baseUrl: 'https://evil.example' }, owner],
    [{ ...config, baseUrl: 'http://firestore.googleapis.com' }, owner],
    [{ ...config, baseUrl: 'https://u:p@firestore.googleapis.com' }, owner],
    [{ ...config, baseUrl: 'http://localhost:8088/path' }, owner],
    [config, '../bob'], [config, 'alice%2Fbob'], [config, ''],
  ] as const) await assert.rejects(purgeCloudAccount(value, uid, unexpected), code('invalid-data'));
  assert.equal(accesses, 0);
});

test('permission, quota, provider failures and unsafe tokens expose fixed errors only', async () => {
  for (const [status, provider, expected] of [[403, 'PERMISSION_DENIED', 'permission'], [429, 'RESOURCE_EXHAUSTED', 'quota'], [500, 'INTERNAL', 'network'], [400, 'INVALID_ARGUMENT', 'invalid-data']] as const) {
    const fetcher: typeof fetch = async () => failure(status, provider);
    await assert.rejects(purgeCloudAccount(config, owner, token, undefined, fetcher), code(expected));
  }
  await assert.rejects(purgeCloudAccount(config, owner, async () => 'token\r\nInjected: true'), code('permission'));
  await assert.rejects(purgeCloudAccount(config, owner, async () => { throw Object.assign(new Error('PRIVATE'), { code: 'quota' }); }), code('quota'));
});

test('timeout includes token acquisition, fetch and response body even if a collaborator ignores abort', async () => {
  const bounded = { ...config, requestTimeoutMs: 5 };
  await assert.rejects(purgeCloudAccount(bounded, owner, () => new Promise(() => undefined)), code('network'));
  await assert.rejects(purgeCloudAccount(bounded, owner, token, undefined, () => new Promise(() => undefined)), code('network'));
  const fetcher: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({ start() {} }));
  await assert.rejects(purgeCloudAccount(bounded, owner, token, undefined, fetcher), code('network'));
});

test('oversized and malformed response envelopes fail without exposing their contents', async () => {
  for (const response of [
    new Response('not-json'),
    new Response('{}', { headers: { 'Content-Length': String(256 * 1024 + 1) } }),
    new Response('x'.repeat(256 * 1024 + 1)),
  ]) await assert.rejects(purgeCloudAccount(config, owner, token, undefined, async () => response), code('invalid-data'));
});

test('repeated pagination cursors and explicit page budgets stop safely and remain resumable', async () => {
  const c = cloud(); c.docs.set(fenceName, fence());
  const looping: typeof fetch = (input, init) => String(input).includes('/chunks?') ? Promise.resolve(Response.json({ nextPageToken: 'same' })) : c.fetcher(input, init);
  await assert.rejects(purgeCloudAccount(config, owner, token, undefined, looping), code('invalid-data'));
  let page = 0;
  const endless: typeof fetch = (input, init) => String(input).includes('/chunks?') ? Promise.resolve(Response.json({ nextPageToken: String(++page) })) : c.fetcher(input, init);
  await assert.rejects(purgeCloudAccount(config, owner, token, undefined, endless), code('limit'));
  assert(c.docs.has(fenceName)); assert(!c.calls.some(call => call.body?.writes[0]?.delete));
});
