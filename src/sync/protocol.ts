import type { DomainState } from '../domain/types';

export type SyncCloudErrorCode = 'conflict' | 'permission' | 'quota' | 'network' | 'invalid-data';
/** Only fixed classifications leave the transport: never provider bodies, tokens or user data. */
export class SyncCloudError extends Error {
  constructor(public readonly code: SyncCloudErrorCode) {
    super(`sync:${code}`); this.name = 'SyncCloudError';
  }
}
export interface SyncHead { version: string; updateTime: string; recovery?: string[] }
export interface SyncTransport {
  readHead(uid: string): Promise<SyncHead | null>;
  load(uid: string, version: string): Promise<DomainState>;
  stage(uid: string, state: DomainState): Promise<string>;
  publish(uid: string, version: string, expectedHead: SyncHead | null): Promise<void>;
}
export const SYNC_MAX_BYTES = 50 * 1024 * 1024;
export const SYNC_CHUNK_BYTES = 256 * 1024;
export const SYNC_MAX_CHUNKS = 240;
