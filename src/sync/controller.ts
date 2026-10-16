import { canonicalize, validateState, type DomainState } from '../domain';
import { mergeSyncStates } from './merge';
import type { CloudAccount, CloudSyncView } from './types';
import type { SyncMetadataPort } from './metadata';
import type { SyncHead } from './protocol';

export interface SyncTransportPort {
  readHead(uid: string): Promise<SyncHead | null>;
  load(uid: string, version: string): Promise<DomainState>;
  stage(uid: string, state: DomainState): Promise<string>;
  publish(uid: string, version: string, expected: SyncHead | null): Promise<void>;
}
export interface LocalSyncPort {
  context(): { state: DomainState | null; demo: boolean; readOnly: boolean };
  /** Persistence calls guard inside its serialized transaction, before activation. */
  apply(state: DomainState, expectedDigest: string, guard?: () => void): Promise<void>;
}
type Conflict = { uid: string; local: DomainState; localDigest: string; remote: DomainState; head: SyncHead };
class SyncCancelled extends Error { constructor() { super('La sincronización se pausó. Tus datos siguen aquí.'); } }
const empty = (state: DomainState) => !state.activities.length && !state.entries.length && !state.operations.length && !state.planning?.events.length;
const copy = (state: DomainState) => JSON.parse(canonicalize(state)) as DomainState;
const errorCode = (error: unknown): unknown => error && typeof error === 'object' && 'code' in error ? error.code : '';
const localChanged = (error: unknown): boolean => error instanceof Error && error.name === 'SyncLocalChangedError';
export const initialCloudSyncView: CloudSyncView = { configured: false, account: null, status: 'not-configured', enabled: false, lastSyncedAt: null, pending: false, error: null, conflict: null, boundToOtherAccount: false, readOnly: false, demo: false };

/** Pure coordinator. The host drives changed()/synchronize(); no polling or SDK state. */
export class SyncController {
  view: CloudSyncView = { ...initialCloudSyncView, configured: true };
  private account: CloudAccount | null = null;
  private listeners = new Set<(view: CloudSyncView) => void>();
  private running: Promise<void> | null = null;
  private runningGeneration = -1;
  private generation = 0;
  private revision = 0;
  private conflict: Conflict | null = null;
  private observedContext: string;
  private activating: string | null = null;
  private metadataQueue: Promise<unknown> = Promise.resolve();
  private pausedBindings = new Set<string>();
  constructor(private local: LocalSyncPort, private transport: SyncTransportPort, private metadata: SyncMetadataPort,
    private digest: (text: string) => Promise<string>, private clock = Date.now) { this.observedContext = this.contextKey(); }
  subscribe(listener: (view: CloudSyncView) => void) { this.listeners.add(listener); listener(this.view); return () => { this.listeners.delete(listener); }; }
  private emit(changes: Partial<CloudSyncView>) { this.view = { ...this.view, ...changes }; for (const listener of this.listeners) listener(this.view); }
  private contextKey(): string { const c = this.local.context(); return `${c.state?.meta.databaseId ?? ''}:${c.demo}:${c.readOnly}`; }
  private metadataWork<T>(work: () => Promise<T>): Promise<T> {
    const task = this.metadataQueue.then(work); this.metadataQueue = task.catch(() => {}); return task;
  }
  private usable() {
    const context = this.local.context();
    if (!this.account || !context.state || context.readOnly || context.demo) throw new SyncCancelled();
    return { ...context, state: context.state, account: this.account };
  }
  /** Call after a local commit or switching dataset/mode. No cloud work starts here. */
  changed(): void {
    ++this.revision;
    const context = this.local.context(); const key = this.contextKey();
    if (key !== this.observedContext) {
      const ownActivation = context.state?.meta.databaseId === this.activating && !context.demo && !context.readOnly;
      if (!ownActivation) ++this.generation;
      this.observedContext = key;
      this.conflict = null;
      this.emit({ demo: context.demo, readOnly: context.readOnly, conflict: null, enabled: ownActivation ? this.view.enabled : false,
        status: ownActivation ? this.view.status : this.account ? 'paused' : 'disconnected' });
      void this.refresh().catch(() => {});
    } else if (this.conflict) { this.conflict = null; this.emit({ conflict: null, status: this.view.enabled ? 'idle' : this.view.status }); }
    this.emit({ pending: !!this.account && !context.demo && !context.readOnly, error: null });
  }
  async setAccount(account: CloudAccount | null): Promise<void> {
    ++this.generation; this.account = account; this.conflict = null;
    this.emit({ account, conflict: null, error: null, enabled: false, pending: false, boundToOtherAccount: false,
      lastSyncedAt: null, status: account ? 'paused' : 'disconnected' });
    await this.refresh();
  }
  /** Cancel work owned by a detached host without changing account or durable opt-in. */
  suspend(): void {
    ++this.generation;
    this.emit({ enabled: false, status: this.account ? 'paused' : 'disconnected', error: null });
  }
  async refresh(): Promise<void> {
    const generation = this.generation; const key = this.contextKey(); const { state, demo, readOnly } = this.local.context();
    const binding = state ? await this.metadata.binding(state.meta.databaseId) : null;
    if (generation !== this.generation || key !== this.contextKey()) return;
    const boundToOtherAccount = !!binding && !!this.account && binding.uid !== this.account.uid;
    const enabled = !!this.account && !!binding?.enabled && !this.pausedBindings.has(`${this.account.uid}:${state?.meta.databaseId}`) && !boundToOtherAccount && !demo && !readOnly;
    const busy = enabled && !!this.running && this.runningGeneration === generation;
    this.emit({ demo, readOnly, boundToOtherAccount, enabled, lastSyncedAt: boundToOtherAccount ? null : binding?.lastSyncedAt ?? null,
      status: !this.account ? 'disconnected' : this.conflict ? 'conflict' : busy ? 'syncing' : enabled ? 'idle' : 'paused' });
  }
  private check(generation: number, uid: string, databaseId: string): void {
    const context = this.local.context();
    if (generation !== this.generation || this.account?.uid !== uid || context.state?.meta.databaseId !== databaseId || context.demo || context.readOnly) throw new SyncCancelled();
  }
  async enable(): Promise<void> {
    const generation = this.generation; const { state, account } = this.usable();
    const guard = () => this.check(generation, account.uid, state.meta.databaseId);
    this.pausedBindings.delete(`${account.uid}:${state.meta.databaseId}`);
    const binding = await this.metadata.binding(state.meta.databaseId); guard();
    if (binding && binding.uid !== account.uid) throw new Error('Estos datos están vinculados a otra cuenta.');
    await this.metadataWork(async () => {
      guard(); await this.metadata.bind(state.meta.databaseId, { uid: account.uid, enabled: true, lastSyncedAt: binding?.lastSyncedAt ?? null, version: binding?.version ?? null }); guard();
    });
    guard(); await this.refresh(); guard(); await this.synchronize();
  }
  async pause(): Promise<void> {
    const generation = ++this.generation; const context = this.local.context(); const account = this.account;
    if (context.state && account) this.pausedBindings.add(`${account.uid}:${context.state.meta.databaseId}`);
    this.conflict = null;
    this.emit({ enabled: false, conflict: null, error: null, status: account ? 'paused' : 'disconnected' });
    if (!context.state || !account) return;
    const databaseId = context.state.meta.databaseId;
    await this.metadataWork(async () => {
      // A later account/mode change must not prevent persisting an already requested pause.
      // Only a newer explicit enable for this binding supersedes that request.
      if (!this.pausedBindings.has(`${account.uid}:${databaseId}`)) return;
      const binding = await this.metadata.binding(databaseId);
      if (binding?.uid === account.uid) await this.metadata.bind(databaseId, { ...binding, enabled: false });
    });
    if (generation === this.generation) this.emit({ enabled: false, status: this.account ? 'paused' : 'disconnected' });
  }
  /** Account erasure waits for cancelled recovery writes to settle before clearing metadata. */
  async quiesce(): Promise<void> {
    await this.pause();
    if(this.running)await this.running.catch(()=>undefined);
    await this.metadataQueue;
  }
  private dispatch(work: () => Promise<void>): Promise<void> {
    const generation = this.generation;
    if (this.running) {
      if (this.runningGeneration === generation) return this.running;
      return this.running.then(() => generation === this.generation ? this.dispatch(work) : undefined);
    }
    this.runningGeneration = generation;
    // Assign the lock before synchronous subscribers can dispatch another job.
    const job = Promise.resolve().then(() => generation === this.generation ? work() : undefined).catch(async error => {
      if (generation !== this.generation) return;
      if (error instanceof SyncCancelled) { await this.refresh(); return; }
      this.emit({ status: errorCode(error) === 'network' ? 'offline' : 'error', pending: true,
        error: error instanceof Error ? error.message : 'No se pudo sincronizar. Tus datos siguen aquí.' });
    }).finally(() => { if (this.running === job) this.running = null; });
    this.running = job;
    return job;
  }
  synchronize(): Promise<void> { return this.dispatch(() => this.run()); }
  private async preserve(uid: string, state: DomainState, guard: () => void): Promise<void> {
    guard(); const version = await this.digest(canonicalize(state)); guard();
    await this.metadata.archive(uid, version, state); guard();
    await this.transport.stage(uid, state); guard();
  }
  private async currentDigest(guard: () => void): Promise<string> {
    guard(); const value = await this.digest(canonicalize(this.usable().state)); guard(); return value;
  }
  private async apply(candidate: DomainState, expectedDigest: string, guard: () => void): Promise<void> {
    guard(); const binding = await this.metadata.binding(candidate.meta.databaseId); guard();
    if (binding && binding.uid !== this.account!.uid) throw new Error('Estos datos están vinculados a otra cuenta.');
    await this.metadataWork(async () => {
      guard(); await this.metadata.bind(candidate.meta.databaseId, { uid: this.account!.uid, enabled: true, lastSyncedAt: binding?.lastSyncedAt ?? null, version: binding?.version ?? null }); guard();
    });
    guard(); this.activating = candidate.meta.databaseId;
    try { await this.local.apply(candidate, expectedDigest, guard); }
    finally { this.activating = null; this.observedContext = this.contextKey(); }
  }
  private async run(): Promise<void> {
    const generation = this.generation; const { state: original, account } = this.usable();
    let databaseId = original.meta.databaseId;
    const guard = () => this.check(generation, account.uid, databaseId);
    const binding = await this.metadata.binding(databaseId); guard();
    if (!binding?.enabled || binding.uid !== account.uid || this.pausedBindings.has(`${account.uid}:${databaseId}`) || this.conflict) return;
    this.emit({ status: 'syncing', pending: true, error: null });
    for (let attempt = 0; attempt < 3; attempt++) {
      guard(); const local = copy(this.usable().state); const localDigest = await this.digest(canonicalize(local)); guard();
      const head = await this.transport.readHead(account.uid); guard();
      if (head?.version === localDigest) {
        if (await this.currentDigest(guard) !== localDigest) continue;
        if (await this.finish(databaseId, account.uid, head.version, localDigest, guard)) return;
        continue;
      }
      const remote = head ? copy(validateState(await this.transport.load(account.uid, head.version))) : null; guard();
      const result = remote ? empty(local) && local.meta.databaseId !== remote.meta.databaseId ? { kind: 'remote' as const, state: remote } : mergeSyncStates(local, remote) : { kind: 'local' as const, state: local };
      if (result.kind === 'conflict') {
        await this.preserve(account.uid, local, guard); await this.preserve(account.uid, remote!, guard);
        if (await this.currentDigest(guard) !== localDigest) continue;
        this.conflict = { uid: account.uid, local: copy(local), localDigest, remote: copy(remote!), head: { ...head! } };
        this.emit({ status: 'conflict', pending: true, conflict: { reason: result.reason, localActivities: local.activities.length, localEntries: local.entries.length, remoteActivities: remote!.activities.length, remoteEntries: remote!.entries.length } });
        return;
      }
      if (result.kind === 'same') {
        if (await this.currentDigest(guard) !== localDigest) continue;
        if (await this.finish(databaseId, account.uid, head!.version, localDigest, guard)) return;
        continue;
      }
      const candidate = result.state;
      if (result.kind === 'remote' || result.kind === 'merged') {
        await this.preserve(account.uid, local, guard);
        if (remote) await this.preserve(account.uid, remote, guard);
      }
      const version = await this.transport.stage(account.uid, candidate); guard();
      if (await this.currentDigest(guard) !== localDigest) continue;
      try { guard(); await this.transport.publish(account.uid, version, head); }
      catch (error) { guard(); if (errorCode(error) === 'conflict') continue; throw error; }
      guard();
      if (result.kind === 'remote' || result.kind === 'merged') {
        try { await this.apply(candidate, localDigest, guard); }
        catch (error) { guard(); if (localChanged(error)) continue; throw error; }
        databaseId = candidate.meta.databaseId; guard();
      } else if (await this.currentDigest(guard) !== localDigest) continue;
      if (await this.finish(databaseId, account.uid, version, await this.digest(canonicalize(candidate)), guard)) return;
    }
    throw new Error('Hay cambios nuevos. Vuelve a sincronizar. Tus datos siguen aquí.');
  }
  private async finish(databaseId: string, uid: string, version: string, expectedDigest: string, guard: () => void): Promise<boolean> {
    guard(); const binding = await this.metadata.binding(databaseId); guard();
    if (!binding || binding.uid !== uid || !binding.enabled) throw new SyncCancelled();
    if (await this.currentDigest(guard) !== expectedDigest) return false;
    const revision = this.revision; const lastSyncedAt = this.clock();
    await this.metadataWork(async () => { guard(); await this.metadata.bind(databaseId, { ...binding, uid, version, lastSyncedAt }); guard(); }); guard();
    if (revision !== this.revision || await this.currentDigest(guard) !== expectedDigest) {
      const latest = await this.metadata.binding(databaseId); guard();
      if (latest?.uid === uid && latest.version === version && latest.lastSyncedAt === lastSyncedAt) {
        await this.metadataWork(async () => { guard(); await this.metadata.bind(databaseId, { ...latest, version: binding.version, lastSyncedAt: binding.lastSyncedAt }); guard(); }); guard();
      }
      this.emit({ pending: true }); return false;
    }
    this.conflict = null; this.emit({ status: 'idle', pending: false, conflict: null, lastSyncedAt, error: null }); return true;
  }
  conflictState(side: 'local' | 'remote'): DomainState {
    if (!this.conflict || this.account?.uid !== this.conflict.uid) throw new Error('El conflicto ya cambió. Vuelve a sincronizar.');
    return copy(this.conflict[side]);
  }
  resolve(side: 'local' | 'remote'): Promise<void> { return this.dispatch(() => this.runResolve(side)); }
  private async runResolve(side: 'local' | 'remote'): Promise<void> {
    const generation = this.generation; const conflict = this.conflict; const { state, account } = this.usable();
    let databaseId = state.meta.databaseId;
    const guard = () => this.check(generation, account.uid, databaseId);
    if (!conflict || account.uid !== conflict.uid || await this.currentDigest(guard) !== conflict.localDigest) {
      this.conflict = null; this.emit({ conflict: null }); await this.run(); return;
    }
    const candidate = copy(conflict[side]);
    this.emit({ status: 'syncing', pending: true, error: null });
    try {
      await this.preserve(account.uid, conflict.local, guard); await this.preserve(account.uid, conflict.remote, guard);
      const version = await this.transport.stage(account.uid, candidate); guard();
      if (await this.currentDigest(guard) !== conflict.localDigest) {
        this.conflict = null; this.emit({ conflict: null }); await this.run(); return;
      }
      await this.transport.publish(account.uid, version, conflict.head); guard();
      if (side === 'remote') {
        await this.apply(candidate, conflict.localDigest, guard); databaseId = candidate.meta.databaseId; guard();
      } else if (await this.currentDigest(guard) !== conflict.localDigest) {
        this.conflict = null; this.emit({ conflict: null }); await this.run(); return;
      }
      if (!await this.finish(databaseId, account.uid, version, await this.digest(canonicalize(candidate)), guard)) {
        this.conflict = null; this.emit({ conflict: null }); await this.run();
      }
    } catch (error) {
      guard();
      if (localChanged(error) || errorCode(error) === 'conflict') {
        this.conflict = null; this.emit({ conflict: null }); await this.run(); return;
      }
      throw error;
    }
  }
}
