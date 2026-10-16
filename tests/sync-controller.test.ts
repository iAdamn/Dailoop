import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalize, createEmptyState, execute, validateState, type Command, type DomainState } from '../src/domain';
import { SyncController, type LocalSyncPort, type SyncTransportPort } from '../src/sync/controller';
import type { SyncBinding, SyncMetadataPort } from '../src/sync/metadata';
import { SyncCloudError, type SyncHead } from '../src/sync/protocol';
import type { CloudAccount } from '../src/sync/types';

const NOW = Date.parse('2026-10-15T17:00:00Z');
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const digest = async (text: string): Promise<string> => hash(text);
const versionOf = (state: DomainState): string => hash(canonicalize(state));
const clone = (state: DomainState): DomainState => JSON.parse(canonicalize(state)) as DomainState;
const account: CloudAccount = { uid: 'account_A', email: 'a@example.test', displayName: 'A' };
const other: CloudAccount = { uid: 'account_B', email: 'b@example.test', displayName: 'B' };
function run(state: DomainState, command: Command, serial: number): DomainState {
  let next = serial + 1;
  return execute(state, command, { nowMs: NOW, operationId: id(serial), nextId: () => id(next++) }).state;
}
function base(databaseId = id(1)): DomainState {
  return run(createEmptyState({ databaseId, nowMs: NOW }), { type: 'createActivity', name: 'Leer', emoji: '📚', color: '#6F5BFF', id: id(20) }, 10);
}
function barrier() {
  let enter!: () => void; let resume!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const resumed = new Promise<void>(resolve => { resume = resolve; });
  return { entered, resume, wait: async () => { enter(); await resumed; } };
}
class Metadata implements SyncMetadataPort {
  bindings = new Map<string, SyncBinding>();
  branches = new Map<string, DomainState>();
  beforeBind?: (databaseId: string, binding: SyncBinding) => Promise<void>;
  beforeArchive?: () => Promise<void>;
  async binding(databaseId: string) { const value = this.bindings.get(databaseId); return value ? { ...value } : null; }
  async bind(databaseId: string, binding: SyncBinding) { await this.beforeBind?.(databaseId, binding); this.bindings.set(databaseId, { ...binding }); }
  async archive(uid: string, version: string, state: DomainState) {
    await this.beforeArchive?.(); validateState(state);
    assert.equal(version, versionOf(state)); this.branches.set(`${uid}:${version}`, clone(state));
  }
}
class Cloud implements SyncTransportPort {
  versions = new Map<string, DomainState>(); heads = new Map<string, SyncHead>();
  calls = { read: 0, load: 0, stage: 0, publish: 0 };
  beforeRead?: () => Promise<void>; beforeLoad?: () => Promise<void>;
  beforeStage?: () => Promise<void>; beforePublish?: () => Promise<void>;
  seed(uid: string, state: DomainState) { const version = versionOf(state); this.versions.set(`${uid}:${version}`, clone(state)); this.heads.set(uid, { version, updateTime: `${this.heads.size}:${this.versions.size}` }); }
  async readHead(uid: string) { this.calls.read++; await this.beforeRead?.(); const head = this.heads.get(uid); return head ? { ...head } : null; }
  async load(uid: string, version: string) { this.calls.load++; await this.beforeLoad?.(); const state = this.versions.get(`${uid}:${version}`); if (!state) throw new SyncCloudError('invalid-data'); return clone(state); }
  async stage(uid: string, state: DomainState) { this.calls.stage++; await this.beforeStage?.(); validateState(state); const version = versionOf(state); const key = `${uid}:${version}`; const old = this.versions.get(key); if (old) assert.equal(canonicalize(old), canonicalize(state)); this.versions.set(key, clone(state)); return version; }
  async publish(uid: string, version: string, expected: SyncHead | null) {
    this.calls.publish++; await this.beforePublish?.();
    const current = this.heads.get(uid) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new SyncCloudError('conflict');
    assert.ok(this.versions.has(`${uid}:${version}`));
    this.heads.set(uid, { version, updateTime: `publish:${this.calls.publish}` });
  }
}
function fixture(state = base(), cloud = new Cloud(), metadata = new Metadata()) {
  let current = clone(state); let demo = false; let readOnly = false; let applications = 0; let serial = 1000;
  let beforeApply: (() => Promise<void>) | undefined; let controller!: SyncController;
  const local: LocalSyncPort = {
    context: () => ({ state: current, demo, readOnly }),
    apply: async (candidate, expected, guard) => {
      await beforeApply?.(); guard?.();
      if (versionOf(current) !== expected) { const error = new Error('changed'); error.name = 'SyncLocalChangedError'; throw error; }
      validateState(candidate); current = clone(candidate); applications++; controller.changed();
    },
  };
  controller = new SyncController(local, cloud, metadata, digest, () => NOW + 1000);
  return {
    controller, cloud, metadata, state: () => current, applications: () => applications,
    edit(command: Command) { current = run(current, command, serial); serial += 10; controller.changed(); },
    beforeApply(fn: () => Promise<void>) { beforeApply = fn; },
    mode(nextDemo: boolean, nextReadOnly = false) { demo = nextDemo; readOnly = nextReadOnly; controller.changed(); },
    replace(next: DomainState) { current = clone(next); controller.changed(); },
    async ready(who = account) { await controller.setAccount(who); await metadata.bind(current.meta.databaseId, { uid: who.uid, enabled: true, lastSyncedAt: null, version: null }); await controller.refresh(); },
  };
}

test('disconnected, demo and readonly contexts never access cloud', async () => {
  const f = fixture(); await f.controller.synchronize();
  assert.equal(f.controller.view.status, 'disconnected');
  await f.ready(); f.mode(true); await f.controller.synchronize();
  assert.equal(f.controller.view.status, 'paused'); f.mode(false, true); await f.controller.synchronize();
  assert.equal(f.cloud.calls.read, 0); assert.equal(f.cloud.calls.stage, 0);
});

test('first upload saves an immutable version, and matching head skips downloads and archives', async () => {
  const f = fixture(); await f.ready(); await f.controller.synchronize();
  assert.equal(f.controller.view.status, 'idle'); assert.equal(f.controller.view.pending, false);
  assert.equal(f.cloud.heads.get(account.uid)!.version, versionOf(f.state()));
  assert.equal(f.metadata.branches.size, 0); const stages = f.cloud.calls.stage;
  await f.controller.synchronize(); assert.equal(f.cloud.calls.load, 0); assert.equal(f.cloud.calls.stage, stages);
  assert.equal(f.metadata.branches.size, 0);
});

test('two devices converge independent entries and preserve both original branches before activation', async () => {
  const cloud = new Cloud(); cloud.seed(account.uid, base());
  const a = fixture(base(), cloud); const b = fixture(base(), cloud); await a.ready(); await b.ready();
  a.edit({ type: 'createEntry', activityId: id(20), id: id(3100), note: 'A' });
  b.edit({ type: 'createEntry', activityId: id(20), id: id(3200), note: 'B' });
  // Separate devices must allocate separate operation/revision IDs.
  b.replace(run(base(), { type: 'createEntry', activityId: id(20), id: id(3200), note: 'B' }, 2000));
  const aVersion = versionOf(a.state()); const bVersion = versionOf(b.state());
  await a.controller.synchronize(); await b.controller.synchronize(); await a.controller.synchronize();
  assert.equal(a.state().entries.length, 2); assert.equal(b.state().entries.length, 2);
  assert.equal(canonicalize(a.state()), canonicalize(b.state()));
  assert.ok(b.metadata.branches.has(`${account.uid}:${aVersion}`)); assert.ok(b.metadata.branches.has(`${account.uid}:${bVersion}`));
  assert.ok(cloud.versions.has(`${account.uid}:${aVersion}`)); assert.ok(cloud.versions.has(`${account.uid}:${bVersion}`));
});

test('another account cannot enable or upload already bound personal data', async () => {
  const f = fixture(); await f.ready(); await f.controller.setAccount(other);
  assert.equal(f.controller.view.boundToOtherAccount, true);
  await assert.rejects(f.controller.enable(), /otra cuenta/); await f.controller.synchronize();
  assert.equal(f.cloud.calls.read, 0); assert.equal(f.cloud.calls.stage, 0);
  assert.equal((await f.metadata.binding(f.state().meta.databaseId))!.uid, account.uid);
});

test('restart retains enabled binding, pause persists without deleting local data', async () => {
  const f = fixture(); await f.ready(); await f.controller.synchronize(); const canonical = canonicalize(f.state());
  const restarted = fixture(f.state(), f.cloud, f.metadata); await restarted.controller.setAccount(account);
  assert.equal(restarted.controller.view.enabled, true); assert.equal(restarted.controller.view.lastSyncedAt, NOW + 1000);
  await restarted.controller.pause(); const again = fixture(f.state(), f.cloud, f.metadata); await again.controller.setAccount(account);
  assert.equal(again.controller.view.enabled, false); assert.equal(again.controller.view.status, 'paused'); assert.equal(canonicalize(again.state()), canonical);
});

test('network failures keep data pending and retry later successfully', async () => {
  const f = fixture(); await f.ready(); const before = canonicalize(f.state());
  f.cloud.beforeRead = async () => { throw new SyncCloudError('network'); };
  await f.controller.synchronize(); assert.equal(f.controller.view.status, 'offline'); assert.equal(f.controller.view.pending, true); assert.equal(canonicalize(f.state()), before);
  f.cloud.beforeRead = undefined; await f.controller.synchronize(); assert.equal(f.controller.view.status, 'idle');
});

test('signout during network read cannot publish or overwrite disconnected view', async () => {
  const f = fixture(); await f.ready(); const gate = barrier(); f.cloud.beforeRead = gate.wait;
  const task = f.controller.synchronize(); await gate.entered; await f.controller.setAccount(null); gate.resume(); await task;
  assert.equal(f.controller.view.status, 'disconnected'); assert.equal(f.controller.view.error, null); assert.equal(f.cloud.calls.publish, 0); assert.equal(f.applications(), 0);
});

test('pause during remote load stops activation and keeps binding paused', async () => {
  const f = fixture(); f.cloud.seed(account.uid, run(base(), { type: 'createEntry', activityId: id(20) }, 100)); await f.ready();
  const gate = barrier(); f.cloud.beforeLoad = gate.wait; const task = f.controller.synchronize(); await gate.entered;
  await f.controller.pause(); gate.resume(); await task;
  assert.equal(f.controller.view.status, 'paused'); assert.equal(f.controller.view.enabled, false); assert.equal(f.controller.view.error, null); assert.equal(f.applications(), 0); assert.equal(f.cloud.calls.publish, 0);
  assert.equal((await f.metadata.binding(f.state().meta.databaseId))!.enabled, false);
});

test('account change during pre-activation binding never activates another account state', async () => {
  const f = fixture(); f.cloud.seed(account.uid, run(base(), { type: 'createEntry', activityId: id(20) }, 100)); await f.ready();
  let first = true;
  f.metadata.beforeBind = async () => { if (first) { first = false; await f.controller.setAccount(other); } };
  await f.controller.synchronize(); assert.equal(f.applications(), 0); assert.equal(f.state().entries.length, 0);
  assert.equal(f.controller.view.account!.uid, other.uid); assert.equal(f.controller.view.status, 'paused'); assert.equal(f.controller.view.error, null);
});

test('serialized local activation guard rejects signout arriving after last network await', async () => {
  const f = fixture(); f.cloud.seed(account.uid, run(base(), { type: 'createEntry', activityId: id(20) }, 100)); await f.ready();
  f.beforeApply(async () => { await f.controller.setAccount(null); });
  await f.controller.synchronize(); assert.equal(f.applications(), 0); assert.equal(f.state().entries.length, 0); assert.equal(f.controller.view.status, 'disconnected');
});

test('local writes during every publish stay pending with no false success timestamp', async () => {
  const f = fixture(); await f.ready();
  f.cloud.beforePublish = async () => { f.edit({ type: 'createEntry', activityId: id(20), note: 'while publishing' }); };
  await f.controller.synchronize(); assert.equal(f.cloud.calls.publish, 3); assert.equal(f.state().entries.length, 3);
  assert.equal(f.controller.view.pending, true); assert.equal(f.controller.view.lastSyncedAt, null);
  assert.equal((await f.metadata.binding(f.state().meta.databaseId))!.lastSyncedAt, null);
  assert.equal(f.applications(), 0);
});

test('local commit immediately before activation is retried without losing either device entry', async () => {
  const f = fixture(); f.cloud.seed(account.uid, run(base(), { type: 'createEntry', activityId: id(20), id: id(300) }, 100)); await f.ready();
  let first = true; f.beforeApply(async () => { if (first) { first = false; f.edit({ type: 'createEntry', activityId: id(20), note: 'new local' }); } });
  await f.controller.synchronize(); assert.equal(f.state().entries.length, 2); assert.equal(f.controller.view.pending, false); assert.equal(f.controller.view.status, 'idle'); validateState(f.state());
});

test('three CAS conflicts cap retry count and preserve local changes', async () => {
  const f = fixture(); await f.ready(); f.cloud.beforePublish = async () => { throw new SyncCloudError('conflict'); };
  const before = canonicalize(f.state()); await f.controller.synchronize();
  assert.equal(f.cloud.calls.publish, 3); assert.equal(f.controller.view.status, 'error'); assert.equal(f.controller.view.pending, true); assert.equal(canonicalize(f.state()), before);
});

async function conflicting() {
  const original = base(); const local = run(original, { type: 'updateActivity', activityId: id(20), changes: { name: 'local' } }, 100);
  const remote = run(original, { type: 'updateActivity', activityId: id(20), changes: { name: 'remote' } }, 200);
  const f = fixture(local); f.cloud.seed(account.uid, remote); await f.ready(); await f.controller.synchronize();
  assert.equal(f.controller.view.status, 'conflict'); return { ...f, local, remote };
}

test('conflicts preserve both immutable recoverable copies and require explicit choice', async () => {
  const f = await conflicting(); assert.equal(f.applications(), 0); assert.equal(f.cloud.calls.publish, 0); assert.equal(f.metadata.branches.size, 2);
  const exported = f.controller.conflictState('local'); exported.activityRevisions[1].name = 'mutated export';
  assert.equal(f.controller.conflictState('local').activityRevisions[1].name, 'local');
  await f.controller.resolve('remote'); assert.equal(canonicalize(f.state()), canonicalize(f.remote)); assert.equal(f.controller.view.status, 'idle');
  assert.ok(f.metadata.branches.has(`${account.uid}:${versionOf(f.local)}`)); assert.ok(f.metadata.branches.has(`${account.uid}:${versionOf(f.remote)}`));
});

test('double resolution dispatch shares one lock and cannot publish two conflicting choices', async () => {
  const f = await conflicting(); const gate = barrier(); let first = true;
  f.cloud.beforeStage = async () => { if (first) { first = false; await gate.wait(); } };
  const a = f.controller.resolve('local'); const b = f.controller.resolve('remote'); assert.equal(a, b);
  await gate.entered; gate.resume(); await Promise.all([a, b]);
  assert.equal(f.cloud.calls.publish, 1); assert.equal(canonicalize(f.state()), canonicalize(f.local)); assert.equal(f.applications(), 0);
});

test('a changed local conflict invalidates the previous choice and recalculates before applying', async () => {
  const f = await conflicting(); f.edit({ type: 'createEntry', activityId: id(20), note: 'unreviewed change' });
  await f.controller.resolve('remote'); assert.equal(f.state().entries.length, 1); assert.equal(f.applications(), 0); assert.equal(f.controller.view.status, 'conflict');
  assert.equal(f.controller.conflictState('local').entries.length, 1);
});

test('archive failure prevents replacement and leaves both active datasets unchanged', async () => {
  const f = fixture(); const remote = run(base(), { type: 'createEntry', activityId: id(20) }, 100); f.cloud.seed(account.uid, remote); await f.ready();
  f.metadata.beforeArchive = async () => { throw new Error('archive failed'); }; await f.controller.synchronize();
  assert.equal(f.applications(), 0); assert.equal(f.state().entries.length, 0); assert.equal(f.cloud.calls.publish, 0); assert.equal(f.controller.view.pending, true);
});

test('empty second device adopts remote database with its binding and archives empty local branch', async () => {
  const f = fixture(createEmptyState({ databaseId: id(999), nowMs: NOW })); const old = versionOf(f.state());
  const remote = run(base(), { type: 'createEntry', activityId: id(20) }, 100); f.cloud.seed(account.uid, remote); await f.ready(); await f.controller.synchronize();
  assert.equal(f.state().meta.databaseId, remote.meta.databaseId); assert.equal(f.state().entries.length, 1);
  assert.equal((await f.metadata.binding(remote.meta.databaseId))!.uid, account.uid); assert.ok(f.metadata.branches.has(`${account.uid}:${old}`)); assert.equal(f.controller.view.status, 'idle');
});

test('changing to demo while a request runs cancels all subsequent cloud and local writes', async () => {
  const f = fixture(); await f.ready(); const gate = barrier(); f.cloud.beforeRead = gate.wait;
  const task = f.controller.synchronize(); await gate.entered; f.mode(true); gate.resume(); await task;
  assert.equal(f.cloud.calls.stage, 0); assert.equal(f.applications(), 0); assert.equal(f.controller.view.status, 'paused'); assert.equal(f.controller.view.error, null);
});

test('asynchronous finisher cannot overwrite a subsequent signout view', async () => {
  const f = fixture(); f.cloud.seed(account.uid, f.state()); await f.ready(); const gate = barrier();
  f.metadata.beforeBind = async (_database, binding) => { if (binding.lastSyncedAt !== null) await gate.wait(); };
  const task = f.controller.synchronize(); await gate.entered; await f.controller.setAccount(null); gate.resume(); await task;
  assert.equal(f.controller.view.status, 'disconnected'); assert.equal(f.controller.view.account, null); assert.equal(f.controller.view.lastSyncedAt, null); assert.equal(f.controller.view.pending, false);
});

test('local writes during metadata finish restore previous success marker and remain pending', async () => {
  const f = fixture(); f.cloud.seed(account.uid, f.state()); await f.ready();
  f.metadata.beforeBind = async (_database, binding) => { if (binding.lastSyncedAt !== null) f.edit({ type: 'createEntry', activityId: id(20), note: 'during finish' }); };
  await f.controller.synchronize(); assert.equal(f.controller.view.pending, true); assert.equal(f.controller.view.lastSyncedAt, null);
  assert.equal((await f.metadata.binding(f.state().meta.databaseId))!.lastSyncedAt, null); assert.equal(f.state().entries.length, 3);
});

test('a real intervening cloud publication retries CAS and merges both devices without last-write-wins', async () => {
  const f = fixture(run(base(), { type: 'createEntry', activityId: id(20), note: 'local' }, 100));
  f.cloud.seed(account.uid, base()); await f.ready();
  let first = true;
  f.cloud.beforePublish = async () => {
    if (first) { first = false; f.cloud.seed(account.uid, run(base(), { type: 'createEntry', activityId: id(20), note: 'other device' }, 200)); }
  };
  await f.controller.synchronize(); assert.equal(f.cloud.calls.publish, 2); assert.equal(f.state().entries.length, 2);
  assert.equal(f.cloud.heads.get(account.uid)!.version, versionOf(f.state())); assert.equal(f.controller.view.pending, false);
});

test('pause while initial enable binding is in flight is persisted after that write', async () => {
  const f = fixture(); await f.controller.setAccount(account); const gate = barrier(); let first = true;
  f.metadata.beforeBind = async () => { if (first) { first = false; await gate.wait(); } };
  const enabling = f.controller.enable(); const rejected = assert.rejects(enabling, /pausó/); await gate.entered;
  const pausing = f.controller.pause(); gate.resume(); await Promise.all([rejected, pausing]);
  assert.equal((await f.metadata.binding(f.state().meta.databaseId))!.enabled, false); assert.equal(f.controller.view.enabled, false); assert.equal(f.controller.view.status, 'paused'); assert.equal(f.cloud.calls.read, 0);
  const restarted = fixture(f.state(), f.cloud, f.metadata); await restarted.controller.setAccount(account); assert.equal(restarted.controller.view.enabled, false);
});

test('a new local edit during conflict resolution network work invalidates the old choice', async () => {
  const f = await conflicting(); let first = true;
  f.cloud.beforeStage = async () => { if (first) { first = false; f.edit({ type: 'createEntry', activityId: id(20), note: 'during choice' }); } };
  await f.controller.resolve('remote'); assert.equal(f.state().entries.length, 1); assert.equal(f.applications(), 0); assert.equal(f.cloud.calls.publish, 0); assert.equal(f.controller.view.status, 'conflict');
  assert.equal(f.controller.conflictState('local').entries.length, 1);
});

test('a stale conflict head is reread after CAS failure instead of applying an unreviewed remote branch', async () => {
  const f = await conflicting(); const latestRemote = run(f.remote, { type: 'updateActivity', activityId: id(20), changes: { name: 'latest remote' } }, 500);
  let first = true; f.cloud.beforePublish = async () => { if (first) { first = false; f.cloud.seed(account.uid, latestRemote); } };
  await f.controller.resolve('remote'); assert.equal(f.applications(), 0); assert.equal(f.controller.view.status, 'conflict');
  assert.equal(f.controller.conflictState('remote').activityRevisions.at(-1)!.name, 'latest remote'); assert.equal(canonicalize(f.state()), canonicalize(f.local));
});

test('suspend cancels network-bound synchronization without changing durable opt-in or account', async () => {
  const f = fixture(); await f.ready(); const gate = barrier(); f.cloud.beforeRead = gate.wait;
  const task = f.controller.synchronize(); await gate.entered; f.controller.suspend();
  assert.equal(f.controller.view.account!.uid, account.uid); assert.equal(f.controller.view.enabled, false);
  assert.equal((await f.metadata.binding(f.state().meta.databaseId))!.enabled, true);
  gate.resume(); await task;
  assert.equal(f.cloud.calls.publish, 0); assert.equal(f.cloud.calls.stage, 0); assert.equal(f.applications(), 0);
  f.cloud.beforeRead = undefined; await f.controller.refresh(); assert.equal(f.controller.view.enabled, true);
  await f.controller.synchronize(); assert.equal(f.controller.view.status, 'idle'); assert.equal(f.controller.view.pending, false);
});

test('suspend cancels an in-flight conflict choice before publish and preserves exportable branches', async () => {
  const f = await conflicting(); const gate = barrier(); let first = true;
  f.cloud.beforeStage = async () => { if (first) { first = false; await gate.wait(); } };
  const task = f.controller.resolve('remote'); await gate.entered; f.controller.suspend(); gate.resume(); await task;
  assert.equal(f.cloud.calls.publish, 0); assert.equal(f.applications(), 0); assert.equal(canonicalize(f.state()), canonicalize(f.local));
  assert.equal((await f.metadata.binding(f.state().meta.databaseId))!.enabled, true);
  assert.equal(canonicalize(f.controller.conflictState('remote')), canonicalize(f.remote));
  f.cloud.beforeStage = undefined; await f.controller.refresh(); assert.equal(f.controller.view.status, 'conflict');
  await f.controller.resolve('remote'); assert.equal(f.applications(), 1); assert.equal(f.controller.view.status, 'idle');
});

test('suspend before a dispatched microtask starts prevents all network work', async () => {
  const f = fixture(); await f.ready(); const task = f.controller.synchronize(); f.controller.suspend(); await task;
  assert.equal(f.cloud.calls.read, 0); assert.equal(f.cloud.calls.stage, 0); assert.equal(f.applications(), 0);
  await f.controller.refresh(); assert.equal(f.controller.view.enabled, true);
});
