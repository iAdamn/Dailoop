import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalize, createEmptyState } from '../src/domain';
import { SyncController, type SyncTransportPort } from '../src/sync/controller';
import type { SyncBinding, SyncMetadataPort } from '../src/sync/metadata';

const now = Date.parse('2026-10-16T03:00:00Z');
const sha = async (text: string) => createHash('sha256').update(text).digest('hex');
function barrier() { let enter!: () => void; let release!: () => void; const entered = new Promise<void>(done => { enter = done; }); const resumed = new Promise<void>(done => { release = done; }); return { entered, release, wait: async () => { enter(); await resumed; } }; }

test('account deletion waits for a cancelled recovery archive before clearing its account metadata', async () => {
  const local = createEmptyState({ databaseId: '95000000-0000-4000-8000-000000000001', nowMs: now });
  const remote = createEmptyState({ databaseId: '95000000-0000-4000-8000-000000000002', nowMs: now });
  const remoteHash = await sha(canonicalize(remote)); const gate = barrier(); const branches = new Set<string>();
  let binding: SyncBinding = { uid: 'alice', enabled: true, lastSyncedAt: null, version: null };
  let staged = 0; let applied = 0; let drained = false;
  const metadata: SyncMetadataPort = {
    binding: async () => ({ ...binding }), bind: async (_id, value) => { binding = { ...value }; },
    archive: async (_uid, version) => { await gate.wait(); branches.add(version); },
  };
  const transport: SyncTransportPort = { readHead: async () => ({ version: remoteHash, updateTime: 'fixture' }), load: async () => remote, stage: async () => { staged++; return remoteHash; }, publish: async () => undefined };
  const controller = new SyncController({ context: () => ({ state: local, demo: false, readOnly: false }), apply: async () => { applied++; } }, transport, metadata, sha);
  await controller.setAccount({ uid: 'alice', email: 'alice@example.test', displayName: 'Alice' });
  const running = controller.synchronize(); await gate.entered;
  const draining = controller.quiesce().then(() => { drained = true; });
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(drained, false, 'purge/metadata clear cannot begin while an old archive is in flight');
  gate.release(); await draining; await running;
  assert.equal(branches.size, 1); branches.clear();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(branches.size, 0); assert.equal(staged, 0); assert.equal(applied, 0);
  assert.equal(controller.view.enabled, false); assert.equal(binding.enabled, false);
});

test('a pause persistence failure rejects the deletion barrier before a caller can purge anything', async () => {
  const state = createEmptyState({ databaseId: '95000000-0000-4000-8000-000000000003', nowMs: now });
  let purgeStarted = false;
  const metadata: SyncMetadataPort = { binding: async () => ({ uid: 'alice', enabled: true, lastSyncedAt: null, version: null }), bind: async () => { throw new Error('fixture persistence failed'); }, archive: async () => undefined };
  const transport: SyncTransportPort = { readHead: async () => null, load: async () => state, stage: async () => 'a'.repeat(64), publish: async () => undefined };
  const controller = new SyncController({ context: () => ({ state, demo: false, readOnly: false }), apply: async () => undefined }, transport, metadata, sha);
  await controller.setAccount({ uid: 'alice', email: 'alice@example.test', displayName: 'Alice' });
  await assert.rejects(controller.quiesce().then(() => { purgeStarted = true; }), /persistence failed/);
  assert.equal(purgeStarted, false); assert.equal(controller.view.enabled, false);
});
