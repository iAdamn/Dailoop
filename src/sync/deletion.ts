import { isRecord, utf8Length } from '../domain/validation';

export type AccountDeletionErrorCode = 'permission' | 'network' | 'quota' | 'invalid-data' | 'limit' | 'incomplete';
/** Only fixed classifications may leave this boundary; never provider messages. */
export class AccountDeletionError extends Error {
  constructor(public readonly code: AccountDeletionErrorCode) { super({permission:'Confirma de nuevo tu cuenta con Google.',network:'Se interrumpió el borrado. Revisa la conexión y reintenta.',quota:'Se alcanzó un límite del servicio. El borrado está pendiente; reintenta más tarde.','invalid-data':'No se pudo verificar el borrado. No se anunció como completado.',limit:'El borrado necesita otra sesión. Confirma tu cuenta y reintenta.',incomplete:'Quedan datos online por borrar. Confirma tu cuenta y reintenta.'}[code]); this.name = 'AccountDeletionError'; }
}
export interface DeletionProgress { phase: 'blocking' | 'deleting' | 'verifying' | 'complete'; deleted: number }
export interface CloudDeletionConfig { projectId: string; apiKey?: string; baseUrl?: string; requestTimeoutMs?: number }
const MAX_PAGES = 1_000;
const MAX_DOCUMENTS = 100_000;
const PAGE_SIZE = 100;
const MAX_RESPONSE_BYTES = 256 * 1024;
const HASH = /^[0-9a-f]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
function check(condition: unknown): asserts condition { if (!condition) throw new AccountDeletionError('invalid-data'); }
function timestamp(value: unknown): void { check(typeof value === 'string' && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value))); }
function only(value: Record<string, unknown>, keys: string[]): void { check(Object.keys(value).every(key => keys.includes(key))); }

/** Erase only this UID's immutable sync payload, retaining its anti-resurrection
 * fence. Failure is resumable: callers must NOT delete Firebase Auth until this
 * promise resolves. The server requires reauthentication within five minutes. */
export async function purgeCloudAccount(config: CloudDeletionConfig, uid: string, tokenFetcher: () => Promise<string>, onProgress?: (value: DeletionProgress) => void, fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)): Promise<void> {
  check(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(config.projectId));
  check(typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid));
  check(config.apiKey === undefined || (typeof config.apiKey === 'string' && config.apiKey.length > 0 && config.apiKey.length <= 256));
  const timeoutMs = config.requestTimeoutMs ?? 20_000;
  check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 20_000);
  let base: URL;
  try { base = new URL(config.baseUrl ?? 'https://firestore.googleapis.com'); } catch { throw new AccountDeletionError('invalid-data'); }
  const production = base.origin === 'https://firestore.googleapis.com';
  const emulator = ['http:', 'https:'].includes(base.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  check((production || emulator) && !base.username && !base.password && !base.search && !base.hash && base.pathname === '/');
  const resource = `projects/${config.projectId}/databases/(default)/documents`;
  const ownerRoot = `${resource}/users/${uid}`;
  const root = `${base.origin}/v1/${resource}`;
  const fenceName = `${ownerRoot}/security/deletion`;
  let deleted = 0; let pages = 0;
  const report = (phase: DeletionProgress['phase']) => { try { onProgress?.({ phase, deleted }); } catch { /* Presentation observers do not decide whether deletion succeeded. */ } };

  async function request(path: string, body?: unknown, allowMissing = false, query: Record<string, string> = {}, allowFenceRace = false): Promise<unknown | null> {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new AccountDeletionError('network')); }, timeoutMs); });
    const work = async (): Promise<unknown | null> => {
      let token: string;
      try { token = await tokenFetcher(); }
      catch (error) { throw new AccountDeletionError(isRecord(error) && (error.code === 'network' || error.code === 'quota') ? error.code : 'permission'); }
      if (abort.signal.aborted) throw new AccountDeletionError('network');
      if (typeof token !== 'string' || !token || token.length > 16_384 || /[\r\n]/.test(token)) throw new AccountDeletionError('permission');
      const params = new URLSearchParams({ ...(config.apiKey ? { key: config.apiKey } : {}), ...query });
      const response = await fetcher(`${root}${path}${params.size ? `?${params}` : ''}`, {
        method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: abort.signal, redirect: 'error',
      });
      if (allowMissing && response.status === 404) return null;
      const advertised = response.headers.get('content-length');
      if (advertised !== null) check(/^\d+$/.test(advertised) && Number(advertised) <= MAX_RESPONSE_BYTES);
      let text: string;
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); const parts: string[] = []; let bytes = 0;
        try {
          for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; check(bytes <= MAX_RESPONSE_BYTES); parts.push(decoder.decode(next.value, { stream: true })); }
          parts.push(decoder.decode()); text = parts.join('');
        } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
        finally { reader.releaseLock(); }
      } else { text = await response.text(); check(utf8Length(text) <= MAX_RESPONSE_BYTES); }
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { if (response.ok) throw new AccountDeletionError('invalid-data'); }
      if (!response.ok) {
        const status = isRecord(payload) && isRecord(payload.error) ? payload.error.status : null;
        if ([401, 403].includes(response.status) || status === 'PERMISSION_DENIED' || status === 'UNAUTHENTICATED') throw new AccountDeletionError('permission');
        if (response.status === 429 || status === 'RESOURCE_EXHAUSTED') throw new AccountDeletionError('quota');
        if (response.status >= 500) throw new AccountDeletionError('network');
        // Fence create races are handled by a read-and-validate, never by update.
        if (status === 'ALREADY_EXISTS' && allowFenceRace) throw new FenceExists();
        if (response.status === 409 || status === 'ABORTED') throw new AccountDeletionError('network');
        throw new AccountDeletionError('invalid-data');
      }
      return payload;
    };
    try { return await Promise.race([work(), timeout]); }
    catch (error) { if (error instanceof AccountDeletionError || error instanceof FenceExists) throw error; throw new AccountDeletionError('network'); }
    finally { clearTimeout(timer); }
  }
  function validFence(value: unknown): void {
    check(isRecord(value) && value.name === fenceName && isRecord(value.fields));
    only(value, ['name', 'fields', 'createTime', 'updateTime']);
    check(Object.keys(value.fields).length === 2 && isRecord(value.fields.schema) && Object.keys(value.fields.schema).length === 1 && value.fields.schema.integerValue === '1');
    check(isRecord(value.fields.startedAt) && Object.keys(value.fields.startedAt).length === 1);
    timestamp(value.fields.startedAt.timestampValue);
  }
  async function commit(writes: unknown[], allowFenceRace = false): Promise<void> {
    check(writes.length > 0 && writes.length <= PAGE_SIZE);
    const result = await request(':commit', { writes }, false, {}, allowFenceRace);
    check(isRecord(result) && Array.isArray(result.writeResults) && result.writeResults.length === writes.length && result.writeResults.every(isRecord));
    timestamp(result.commitTime);
  }
  async function list(collection: 'chunks' | 'versions', pageToken?: string): Promise<{ names: string[]; next?: string }> {
    if (++pages > MAX_PAGES) throw new AccountDeletionError('limit');
    const response = await request(`/users/${uid}/${collection}`, undefined, false, {
      pageSize: String(PAGE_SIZE), 'mask.fieldPaths': 'dailoopDeletionNameOnly', fields: 'documents(name),nextPageToken', ...(pageToken ? { pageToken } : {}),
    });
    check(isRecord(response)); only(response, ['documents', 'nextPageToken']);
    const documents = response.documents ?? []; check(Array.isArray(documents) && documents.length <= PAGE_SIZE);
    const prefix = `${ownerRoot}/${collection}/`;
    const names = documents.map(document => {
      check(isRecord(document) && typeof document.name === 'string' && document.name.startsWith(prefix));
      only(document, ['name', 'fields', 'createTime', 'updateTime']);
      check(document.fields === undefined || (isRecord(document.fields) && Object.keys(document.fields).length === 0));
      check(HASH.test(document.name.slice(prefix.length)));
      return document.name;
    });
    check(new Set(names).size === names.length);
    const next = response.nextPageToken;
    check(next === undefined || (typeof next === 'string' && next.length <= 8_192));
    return { names, ...(next ? { next: next as string } : {}) };
  }

  report('blocking');
  let fence = await request(`/users/${uid}/security/deletion`, undefined, true);
  if (fence === null) {
    try {
      await commit([{ update: { name: fenceName, fields: { schema: { integerValue: '1' } } },
        updateTransforms: [{ fieldPath: 'startedAt', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }], true);
    } catch (error) { if (!(error instanceof FenceExists)) throw error; }
    fence = await request(`/users/${uid}/security/deletion`, undefined, true);
  }
  validFence(fence);
  report('deleting');
  const seen = new Set<string>();
  for (const collection of ['chunks', 'versions'] as const) {
    let pageToken: string | undefined; const tokens = new Set<string>();
    do {
      const page = await list(collection, pageToken);
      for (const name of page.names) { check(!seen.has(name)); seen.add(name); }
      if (seen.size > MAX_DOCUMENTS) throw new AccountDeletionError('limit');
      if (page.names.length) { await commit(page.names.map(name => ({ delete: name }))); deleted += page.names.length; report('deleting'); }
      pageToken = page.next;
      if (pageToken) { check(!tokens.has(pageToken)); tokens.add(pageToken); }
    } while (pageToken);
  }
  await commit([{ delete: `${ownerRoot}/sync/head` }]);
  report('verifying');
  for (const collection of ['chunks', 'versions'] as const) { const remaining = await list(collection); if (remaining.names.length || remaining.next) throw new AccountDeletionError('incomplete'); }
  const head = await request(`/users/${uid}/sync/head`, undefined, true, { 'mask.fieldPaths': 'dailoopDeletionNameOnly', fields: 'name' });
  if (head !== null) throw new AccountDeletionError('incomplete');
  validFence(await request(`/users/${uid}/security/deletion`, undefined, true));
  report('complete');
}
class FenceExists extends Error {}
