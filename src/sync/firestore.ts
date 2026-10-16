import { validateState } from '../domain/backup';
import type { DomainState } from '../domain/types';
import { canonicalize, isRecord, utf8Length } from '../domain/validation';
import { SYNC_CHUNK_BYTES, SYNC_MAX_BYTES, SYNC_MAX_CHUNKS, SyncCloudError, type SyncHead, type SyncTransport } from './protocol';

export { SyncCloudError } from './protocol';
export type { SyncHead } from './protocol';

type Fields = Record<string, unknown>;
interface Document { fields: Fields; updateTime: string }
interface Manifest { schema: 1; version: string; chunks: string[]; bytes: number }
const HASH = /^[0-9a-f]{64}$/;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
// JSON escaping may expand a 256 KiB string sixfold. Firestore's stored string
// remains 256 KiB; the bounded REST envelope accommodates its escaped form.
const MAX_RESPONSE_BYTES = SYNC_CHUNK_BYTES * 6 + 32 * 1024;

function check(condition: unknown): asserts condition { if (!condition) throw new SyncCloudError('invalid-data'); }
function exact(value: unknown, keys: string[]): asserts value is Fields {
  check(isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function hash(value: unknown): asserts value is string { check(typeof value === 'string' && HASH.test(value)); }
function uid(value: unknown): asserts value is string { check(typeof value === 'string' && UID.test(value)); }
function timestamp(value: unknown): asserts value is string { check(typeof value === 'string' && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value))); }
function stringField(value: unknown): string { exact(value, ['stringValue']); check(typeof value.stringValue === 'string'); return value.stringValue; }
function integerField(value: unknown): number {
  exact(value, ['integerValue']); check(typeof value.integerValue === 'string' && /^(0|[1-9]\d*)$/.test(value.integerValue));
  const result = Number(value.integerValue); check(Number.isSafeInteger(result)); return result;
}
function recoveryField(value: unknown): string[] {
  exact(value, ['arrayValue']); check(isRecord(value.arrayValue));
  check(Object.keys(value.arrayValue).every(key => key === 'values'));
  const values = value.arrayValue.values ?? []; check(Array.isArray(values) && values.length <= 20);
  const result = values.map(item => { const id = stringField(item); hash(id); return id; });
  check(new Set(result).size === result.length); return result;
}
function stringValue(value: string): Fields { return { stringValue: value }; }
function integerValue(value: number): Fields { return { integerValue: String(value) }; }
function manifestFields(value: Manifest): Fields {
  return { schema: integerValue(1), version: stringValue(value.version), bytes: integerValue(value.bytes), chunks: { arrayValue: { values: value.chunks.map(stringValue) } } };
}
function readManifest(fields: Fields, version: string): Manifest {
  exact(fields, ['schema', 'version', 'bytes', 'chunks']); check(integerField(fields.schema) === 1);
  check(stringField(fields.version) === version); const bytes = integerField(fields.bytes);
  check(bytes > 0 && bytes <= SYNC_MAX_BYTES);
  exact(fields.chunks, ['arrayValue']); exact(fields.chunks.arrayValue, ['values']);
  const values = fields.chunks.arrayValue.values;
  check(Array.isArray(values) && values.length > 0 && values.length <= SYNC_MAX_CHUNKS && bytes <= values.length * SYNC_CHUNK_BYTES);
  const chunks = values.map(value => { const result = stringField(value); hash(result); return result; });
  return { schema: 1, version, bytes, chunks };
}

/** Unicode-safe chunks avoid splitting a surrogate pair and creating new bytes. */
export function splitSyncText(text: string): string[] {
  const result: string[] = []; let start = 0; let position = 0; let bytes = 0;
  for (const point of text) {
    const code = point.codePointAt(0)!; const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes + size > SYNC_CHUNK_BYTES) { result.push(text.slice(start, position)); start = position; bytes = 0; }
    position += point.length; bytes += size;
  }
  if (position > start) result.push(text.slice(start));
  return result;
}

/** Firebase ID tokens authenticate each request. No admin credentials or SDK are bundled. */
export class FirestoreSyncTransport implements SyncTransport {
  private readonly root: string;
  private readonly resourceRoot: string;
  private readonly key: string;
  private readonly stagedVersions = new Map<string, string[]>();
  constructor(config: { projectId: string; apiKey?: string; baseUrl?: string }, private readonly getToken: () => Promise<string>, private readonly digest: (text: string) => Promise<string>, private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {
    check(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(config.projectId));
    const base = config.baseUrl ?? 'https://firestore.googleapis.com'; let parsed: URL;
    try { parsed = new URL(base); } catch { throw new SyncCloudError('invalid-data'); }
    const production = parsed.origin === 'https://firestore.googleapis.com';
    const emulator = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    check((production || emulator) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && (parsed.pathname === '/' || parsed.pathname === ''));
    check(config.apiKey === undefined || (typeof config.apiKey === 'string' && config.apiKey.length > 0 && config.apiKey.length <= 256));
    this.resourceRoot = `projects/${config.projectId}/databases/(default)/documents`;
    this.root = `${parsed.origin}/v1/${this.resourceRoot}`;
    this.key = config.apiKey ? `?key=${encodeURIComponent(config.apiKey)}` : '';
  }
  private async sha(text: string): Promise<string> { const result = await this.digest(text); hash(result); return result; }
  private staged(owner: string, version: string): string {
    const previous = this.stagedVersions.get(owner) ?? [];
    this.stagedVersions.set(owner, [...previous.filter(id => id !== version), version].slice(-20));
    return version;
  }
  private path(owner: string, collection: string, id: string): string { uid(owner); return `users/${owner}/${collection}/${id}`; }
  private async request(path: string, body?: unknown, allowMissing = false): Promise<unknown | null> {
    let token: string;
    try { token = await this.getToken(); }
    catch (error) {
      const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : null;
      throw new SyncCloudError(code === 'network' || code === 'quota' ? code : 'permission');
    }
    if (typeof token !== 'string' || token.length === 0 || token.length > 16_384 || /[\r\n]/.test(token)) throw new SyncCloudError('permission');
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 20_000);
    try {
      const response = await this.fetcher(`${this.root}${path}${this.key}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: abort.signal, redirect: 'error' });
      if (allowMissing && response.status === 404) return null;
      const advertised = response.headers.get('content-length');
      if (advertised !== null) check(/^\d+$/.test(advertised) && Number(advertised) <= MAX_RESPONSE_BYTES);
      let text: string;
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); const parts: string[] = []; let received = 0;
        try {
          for (;;) { const next = await reader.read(); if (next.done) break; received += next.value.byteLength; check(received <= MAX_RESPONSE_BYTES); parts.push(decoder.decode(next.value, { stream: true })); }
          parts.push(decoder.decode()); text = parts.join('');
        } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
        finally { reader.releaseLock(); }
      } else { text = await response.text(); check(utf8Length(text) <= MAX_RESPONSE_BYTES); }
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { if (response.ok) throw new SyncCloudError('invalid-data'); }
      if (!response.ok) {
        const status = isRecord(payload) && isRecord(payload.error) ? payload.error.status : null;
        if ([409, 412].includes(response.status) || status === 'ABORTED' || status === 'ALREADY_EXISTS' || status === 'FAILED_PRECONDITION') throw new SyncCloudError('conflict');
        if ([401, 403].includes(response.status) || status === 'UNAUTHENTICATED' || status === 'PERMISSION_DENIED') throw new SyncCloudError('permission');
        if (response.status === 429 || status === 'RESOURCE_EXHAUSTED') throw new SyncCloudError('quota');
        // A conditional update of a disappeared head is another CAS conflict.
        if (response.status === 404 && body !== undefined) throw new SyncCloudError('conflict');
        if (response.status === 400 || response.status === 404) throw new SyncCloudError('invalid-data');
        throw new SyncCloudError('network');
      }
      return payload;
    } catch (error) {
      if (error instanceof SyncCloudError) throw error;
      throw new SyncCloudError('network');
    } finally { clearTimeout(timer); }
  }
  private async get(path: string): Promise<Document | null> {
    const raw = await this.request(`/${path}`, undefined, true); if (raw === null) return null;
    check(isRecord(raw) && raw.name === `${this.resourceRoot}/${path}` && isRecord(raw.fields)); timestamp(raw.updateTime);
    // createTime is allowed by the REST document envelope; unexpected data fields
    // themselves are rejected by each schema reader below.
    check(Object.keys(raw).every(key => ['name', 'fields', 'createTime', 'updateTime'].includes(key)));
    return { fields: raw.fields, updateTime: raw.updateTime };
  }
  private async create(path: string, fields: Fields): Promise<void> {
    await this.commit({ update: { name: `${this.resourceRoot}/${path}`, fields }, currentDocument: { exists: false } });
  }
  private async commit(write: unknown): Promise<void> {
    const response = await this.request(':commit', { writes: [write] });
    check(isRecord(response) && Array.isArray(response.writeResults) && response.writeResults.length === 1 && isRecord(response.writeResults[0]));
    timestamp(response.commitTime); timestamp(response.writeResults[0].updateTime);
  }
  async readHead(owner: string): Promise<SyncHead | null> {
    const doc = await this.get(this.path(owner, 'sync', 'head')); if (!doc) return null;
    const withRecovery = Object.hasOwn(doc.fields, 'recovery');
    exact(doc.fields, ['schema', 'version', ...(withRecovery ? ['recovery'] : [])]); check(integerField(doc.fields.schema) === 1);
    const version = stringField(doc.fields.version); hash(version);
    return { version, updateTime: doc.updateTime, ...(withRecovery ? { recovery: recoveryField(doc.fields.recovery) } : {}) };
  }
  async load(owner: string, version: string): Promise<DomainState> {
    hash(version); const doc = await this.get(this.path(owner, 'versions', version)); check(doc);
    const manifest = readManifest(doc.fields, version); const parts: string[] = []; let bytes = 0; const cache = new Map<string, string>();
    for (const id of manifest.chunks) {
      let text = cache.get(id);
      if (text === undefined) {
        const chunk = await this.get(this.path(owner, 'chunks', id)); check(chunk);
        exact(chunk.fields, ['schema', 'hash', 'text']); check(integerField(chunk.fields.schema) === 1 && stringField(chunk.fields.hash) === id);
        text = stringField(chunk.fields.text); const length = utf8Length(text); check(length > 0 && length <= SYNC_CHUNK_BYTES);
        check(await this.sha(text) === id); cache.set(id, text);
      }
      bytes += utf8Length(text); check(bytes <= manifest.bytes && bytes <= SYNC_MAX_BYTES); parts.push(text);
    }
    check(bytes === manifest.bytes); const text = parts.join(''); check(await this.sha(text) === version);
    try { const state = validateState(JSON.parse(text)); check(canonicalize(state) === text); return state; }
    catch { throw new SyncCloudError('invalid-data'); }
  }
  async stage(owner: string, state: DomainState): Promise<string> {
    uid(owner); let text: string;
    try { text = canonicalize(validateState(state)); } catch { throw new SyncCloudError('invalid-data'); }
    const bytes = utf8Length(text); check(bytes > 0 && bytes <= SYNC_MAX_BYTES);
    const version = await this.sha(text); const chunks = splitSyncText(text); check(chunks.length <= SYNC_MAX_CHUNKS);
    const ids: string[] = []; for (const chunk of chunks) ids.push(await this.sha(chunk));
    const manifest: Manifest = { schema: 1, version, chunks: ids, bytes }; const path = this.path(owner, 'versions', version);
    const existing = await this.get(path);
    if (existing) { check(canonicalize(readManifest(existing.fields, version)) === canonicalize(manifest)); return this.staged(owner, version); }
    for (let index = 0; index < chunks.length; index++) {
      const chunkPath = this.path(owner, 'chunks', ids[index]); const fields = { schema: integerValue(1), hash: stringValue(ids[index]), text: stringValue(chunks[index]) };
      const before = await this.get(chunkPath);
      if (before) { check(canonicalize(before.fields) === canonicalize(fields)); continue; }
      try { await this.create(chunkPath, fields); }
      catch (error) { if (!(error instanceof SyncCloudError) || error.code !== 'conflict') throw error; const raced = await this.get(chunkPath); check(raced && canonicalize(raced.fields) === canonicalize(fields)); }
    }
    try { await this.create(path, manifestFields(manifest)); }
    catch (error) { if (!(error instanceof SyncCloudError) || error.code !== 'conflict') throw error; const raced = await this.get(path); check(raced && canonicalize(readManifest(raced.fields, version)) === canonicalize(manifest)); }
    return this.staged(owner, version);
  }
  async publish(owner: string, version: string, expectedHead: SyncHead | null): Promise<void> {
    hash(version); const path = this.path(owner, 'sync', 'head');
    if (expectedHead !== null) {
      exact(expectedHead, ['version', 'updateTime', ...(Object.hasOwn(expectedHead, 'recovery') ? ['recovery'] : [])]); hash(expectedHead.version); timestamp(expectedHead.updateTime);
      if (Object.hasOwn(expectedHead, 'recovery')) { check(Array.isArray(expectedHead.recovery) && expectedHead.recovery.length <= 20); for (const id of expectedHead.recovery) hash(id); check(new Set(expectedHead.recovery).size === expectedHead.recovery.length); }
    }
    const candidates = [...(expectedHead?.recovery ?? []), ...(expectedHead ? [expectedHead.version] : []), ...(this.stagedVersions.get(owner) ?? []), version];
    const unique = new Set<string>(); for (const id of candidates) { unique.delete(id); unique.add(id); }
    const recovery = [...unique].slice(-20);
    await this.commit({ update: { name: `${this.resourceRoot}/${path}`, fields: { schema: integerValue(1), version: stringValue(version), recovery: { arrayValue: { values: recovery.map(stringValue) } } } }, currentDocument: expectedHead === null ? { exists: false } : { updateTime: expectedHead.updateTime } });
  }
}
