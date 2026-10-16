import { canonicalize, validateState, type DomainState } from '../domain';
import type { SyncBinding, SyncMetadataPort } from './metadata';
import type { RecoveryCopy } from './types';

const databaseName = 'dailoop-cloud-metadata-v1';
/** IndexedDB keeps secondary/read-only Web tabs away from SQLite's OPFS ownership. */
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('bindings'); db.createObjectStore('branches');
      const copies = db.createObjectStore('copies', { keyPath: ['uid', 'version'] });
      copies.createIndex('ownerCreated', ['uid', 'createdAt', 'version']);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('Las preferencias de sincronización no son válidas.'));
  });
}
async function transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, set: (value: T) => void) => void): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode); let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new Error('No se pudieron guardar las preferencias de sincronización.'));
      try { work(tx, value => { result = value; }); } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
export class SyncMetadata implements SyncMetadataPort {
  async binding(databaseId: string): Promise<SyncBinding | null> {
    const value = await transaction<SyncBinding | undefined>(['bindings'], 'readonly', (tx, done) => {
      const request = tx.objectStore('bindings').get(databaseId); request.onsuccess = () => done(request.result);
    });
    if (!value) return null;
    if (typeof value.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.uid) || typeof value.enabled !== 'boolean'
      || (value.lastSyncedAt !== null && (!Number.isSafeInteger(value.lastSyncedAt) || value.lastSyncedAt < 0 || value.lastSyncedAt > 8.64e15))
      || (value.version !== null && !/^[a-f0-9]{64}$/.test(value.version))) throw new Error('Las preferencias de sincronización no son válidas.');
    return value;
  }
  async bind(databaseId: string, value: SyncBinding): Promise<void> {
    await transaction<void>(['bindings'], 'readwrite', tx => { tx.objectStore('bindings').put(value, databaseId); });
  }
  async archive(uid: string, version: string, state: DomainState): Promise<void> {
    validateState(state); const json = canonicalize(state);
    await transaction<void>(['branches', 'copies'], 'readwrite', tx => {
      const branches = tx.objectStore('branches'); const key = `${uid}:${version}`; const request = branches.get(key);
      request.onsuccess = () => {
        if (request.result && request.result !== json) { tx.abort(); return; }
        if (!request.result) {
          branches.add(json, key);
          tx.objectStore('copies').add({ uid, version, createdAt: Date.now(), activities: state.activities.length, entries: state.entries.length });
        }
      };
    });
  }
  async copies(uid: string): Promise<RecoveryCopy[]> {
    return transaction<RecoveryCopy[]>(['copies'], 'readonly', (tx, done) => {
      const rows: RecoveryCopy[] = [];
      const request = tx.objectStore('copies').index('ownerCreated').openCursor(IDBKeyRange.bound([uid, 0, ''], [uid, 8.64e15, '~']), 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && rows.length < 20) { const { version, createdAt, activities, entries } = cursor.value; rows.push({ version, createdAt, activities, entries }); cursor.continue(); }
        else done(rows);
      };
    });
  }
  async recovery(uid: string, version: string): Promise<DomainState> {
    if (!/^[a-f0-9]{64}$/.test(version)) throw new Error('La copia de recuperación no está disponible.');
    const json = await transaction<string | undefined>(['branches'], 'readonly', (tx, done) => {
      const request = tx.objectStore('branches').get(`${uid}:${version}`); request.onsuccess = () => done(request.result);
    });
    if (!json) throw new Error('La copia de recuperación no está disponible.');
    const state = JSON.parse(json) as DomainState; validateState(state); return state;
  }

  async clearAccount(uid:string):Promise<void> {
    await transaction<void>(['bindings','branches','copies'],'readwrite',tx=>{
      for(const name of ['bindings','branches','copies']){
        const request=tx.objectStore(name).openCursor();request.onsuccess=()=>{const c=request.result;if(!c)return;
          if(name==='bindings'?c.value?.uid===uid:name==='branches'?String(c.key).startsWith(uid+':'):c.value?.uid===uid)c.delete();c.continue();};
      }
    });
  }
  async unbind(databaseId:string):Promise<void>{await transaction<void>(['bindings'],'readwrite',tx=>{tx.objectStore('bindings').delete(databaseId);});}
}
