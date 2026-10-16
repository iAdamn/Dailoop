import * as SQLite from 'expo-sqlite';
import { canonicalize, validateState, type DomainState } from '../domain';
import type { RecoveryCopy } from './types';
export interface SyncBinding { uid: string; enabled: boolean; lastSyncedAt: number | null; version: string | null }
export interface SyncMetadataPort {
  binding(databaseId: string): Promise<SyncBinding | null>;
  bind(databaseId: string, value: SyncBinding): Promise<void>;
  archive(uid: string, version: string, state: DomainState): Promise<void>;
}
/** No tokens here, and no schema changes to the user's audited database. */
export class SyncMetadata implements SyncMetadataPort {
  private database?: Promise<SQLite.SQLiteDatabase>;
  private db() {
    return this.database ??= (async () => {
      const db = await SQLite.openDatabaseAsync('dailoop-cloud-v1.db');
      await db.execAsync('PRAGMA busy_timeout=4000; CREATE TABLE IF NOT EXISTS bindings(database_id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS branches(uid TEXT NOT NULL,version TEXT NOT NULL,json TEXT NOT NULL,created_at_ms INTEGER NOT NULL,PRIMARY KEY(uid,version));');
      return db;
    })();
  }
  async binding(databaseId: string): Promise<SyncBinding | null> {
    const row = await (await this.db()).getFirstAsync<{ json: string }>('SELECT json FROM bindings WHERE database_id=?', databaseId);
    if (!row) return null;
    const value = JSON.parse(row.json) as SyncBinding;
    if (!value || typeof value.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.uid) || typeof value.enabled !== 'boolean'
      || (value.lastSyncedAt !== null && (!Number.isSafeInteger(value.lastSyncedAt) || value.lastSyncedAt < 0 || value.lastSyncedAt > 8.64e15)) || (value.version !== null && !/^[a-f0-9]{64}$/.test(value.version))) throw new Error('Las preferencias de sincronización no son válidas.');
    return value;
  }
  async bind(databaseId: string, value: SyncBinding): Promise<void> {
    await (await this.db()).runAsync('INSERT INTO bindings VALUES(?,?) ON CONFLICT(database_id) DO UPDATE SET json=excluded.json', databaseId, JSON.stringify(value));
  }
  async archive(uid: string, version: string, state: DomainState): Promise<void> {
    validateState(state);
    const json = canonicalize(state); const db = await this.db();
    const existing = await db.getFirstAsync<{ json: string }>('SELECT json FROM branches WHERE uid=? AND version=?', uid, version);
    if (existing && existing.json !== json) throw new Error('La copia de recuperación no coincide con su identificador.');
    if (!existing) await db.runAsync('INSERT INTO branches VALUES(?,?,?,?)', uid, version, json, Date.now());
  }
  async copies(uid: string): Promise<RecoveryCopy[]> {
    return (await this.db()).getAllAsync<RecoveryCopy>("SELECT version,created_at_ms AS createdAt,json_array_length(json,'$.activities') AS activities,json_array_length(json,'$.entries') AS entries FROM branches WHERE uid=? ORDER BY created_at_ms DESC LIMIT 20", uid);
  }
  async recovery(uid: string, version: string): Promise<DomainState> {
    if (!/^[a-f0-9]{64}$/.test(version)) throw new Error('La copia de recuperación no está disponible.');
    const row = await (await this.db()).getFirstAsync<{ json: string }>('SELECT json FROM branches WHERE uid=? AND version=?', uid, version);
    if (!row) throw new Error('La copia de recuperación no está disponible.');
    const state = JSON.parse(row.json) as DomainState; validateState(state); return state;
  }

  async clearAccount(uid:string):Promise<void>{const db=await this.db();await db.withTransactionAsync(async()=>{await db.runAsync("DELETE FROM bindings WHERE json_extract(json,'$.uid')=?",uid);await db.runAsync('DELETE FROM branches WHERE uid=?',uid);});}
  async unbind(databaseId:string):Promise<void>{await(await this.db()).runAsync('DELETE FROM bindings WHERE database_id=?',databaseId);}
}
