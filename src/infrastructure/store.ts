import { APP_VERSION } from '../version';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createEmptyState, execute, selectActivities, effectiveEntries, buildReport, exportBackup, parseBackup, validateState, canonicalize, currentSequence } from '../domain';
import type { DomainState, Command, CommandResult, ChangeSet, ReportOptions, ParsedBackup, Meta, Settings, Activity, ActivityRevision, Entry, EntryRevision, Operation } from '../domain';
import { migrate } from './schema';
import { digest, uuid } from './crypto';

export type Mode = 'personal' | 'demo';
export const RECOVERY_MESSAGE = 'No se pudo confirmar qué base quedó activa. Dailoop está detenido para proteger tus datos. Recarga la aplicación para recuperar la base antes de continuar.';
export class RecoveryRequiredError extends Error {
  constructor(){super(RECOVERY_MESSAGE);this.name='RecoveryRequiredError';}
}
type Registry = { scope: Mode; active: string; previous: string | null; candidate: string | null; phase: 'ready' | 'prepared' | 'activated' };
const registryName = 'dailoop-registry-v1.db';
// wa-sqlite's VFS limits paths to 64 bytes, including ./ and the -journal suffix.
const datasetName = (mode:Mode) => `dl-${mode==='personal'?'p':'d'}-${uuid()}.db`;
const readRows = async <T,>(db:SQLiteDatabase, table:string):Promise<T[]> => (await db.getAllAsync<{json:string}>(`SELECT json FROM ${table}`)).map(row=>JSON.parse(row.json) as T);

function freezeState(state:DomainState,delta?:ChangeSet):DomainState {
  // Validated domain rows contain primitives only. Existing rows are already frozen;
  // freeze just appended rows on commit, plus the new arrays/root and settings.
  for(const table of ['activities','activityRevisions','entries','entryRevisions','operations'] as const){
    for(const row of (delta?delta[table]:state[table]))Object.freeze(row);
    Object.freeze(state[table]);
  }
  Object.freeze(state.meta);Object.freeze(state.settings);Object.freeze(state);
  return state;
}

export async function readSnapshot(db:SQLiteDatabase):Promise<DomainState> {
  const meta = await readRows<Meta>(db,'database_meta');
  const settings = await readRows<Settings>(db,'settings');
  if(meta.length!==1 || settings.length!==1) throw new Error('La base no contiene sus metadatos completos. No se reiniciará automáticamente.');
  return {meta:meta[0],settings:settings[0],activities:await readRows<Activity>(db,'activities'),activityRevisions:await readRows<ActivityRevision>(db,'activity_revisions'),entries:await readRows<Entry>(db,'entries'),entryRevisions:await readRows<EntryRevision>(db,'entry_revisions'),operations:await readRows<Operation>(db,'operations')};
}

async function writeDelta(db:SQLiteDatabase, delta:ChangeSet, state:DomainState) {
  for(const o of delta.operations) await db.runAsync('INSERT INTO operations VALUES(?,?,?)',o.id,o.sequence,JSON.stringify(o));
  for(const a of delta.activities) await db.runAsync('INSERT INTO activities VALUES(?,?)',a.id,JSON.stringify(a));
  for(const r of delta.activityRevisions) await db.runAsync('INSERT INTO activity_revisions VALUES(?,?,?,?,?,?)',r.id,r.activityId,r.revisionNo,r.previousRevisionId,r.operationId,JSON.stringify(r));
  for(const e of delta.entries) await db.runAsync('INSERT INTO entries VALUES(?,?,?,?)',e.id,e.activityId,e.creationOperationId,JSON.stringify(e));
  for(const r of delta.entryRevisions) await db.runAsync('INSERT INTO entry_revisions VALUES(?,?,?,?,?,?,?)',r.id,r.entryId,r.revisionNo,r.previousRevisionId,r.operationId,r.activityRevisionId,JSON.stringify(r));
  if(delta.settings) await db.runAsync('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',JSON.stringify(delta.settings));
  const changedActivities = new Set(delta.activityIds);
  for(const a of selectActivities(state,{includeArchived:true}).filter(a=>changedActivities.has(a.id))) {
    await db.runAsync('INSERT INTO activity_current VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision_id=excluded.revision_id,json=excluded.json',a.id,a.revisionId,JSON.stringify(a));
  }
  const changedEntries = new Set(delta.entryIds);
  for(const e of effectiveEntries(state,{includeVoided:true}).filter(e=>changedEntries.has(e.id))) {
    await db.runAsync('INSERT INTO entry_current VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision_id=excluded.revision_id,activity_id=excluded.activity_id,state=excluded.state,occurred_at_ms=excluded.occurred_at_ms,json=excluded.json',e.id,e.revision.id,e.activityId,e.revision.state,e.revision.occurredAtMs,JSON.stringify(e.revision));
  }
}

async function seedDataset(db:SQLiteDatabase,state:DomainState) {
  await db.withTransactionAsync(async()=>{
    await db.runAsync('INSERT INTO database_meta VALUES(1,?)',JSON.stringify(state.meta));
    await writeDelta(db,{activities:state.activities,activityRevisions:[...state.activityRevisions].sort((a,b)=>a.revisionNo-b.revisionNo),entries:state.entries,entryRevisions:[...state.entryRevisions].sort((a,b)=>a.revisionNo-b.revisionNo),operations:state.operations,settings:state.settings,activityIds:state.activities.map(a=>a.id),entryIds:state.entries.map(e=>e.id)},state);
  });
}

async function checkIntegrity(db:SQLiteDatabase) {
  const integrity = await db.getFirstAsync<{integrity_check:string}>('PRAGMA integrity_check');
  const foreign = await db.getAllAsync('PRAGMA foreign_key_check');
  if(integrity?.integrity_check!=='ok' || foreign.length) throw new Error('La verificación de integridad de la base falló. Se conserva la copia anterior.');
  const state=await readSnapshot(db); validateState(state);
  const activities=selectActivities(state,{includeArchived:true});
  const entries=effectiveEntries(state,{includeVoided:true});
  // Projections are disposable; rebuild from validated revisions if a projection was interrupted/corrupted.
  const ac=await db.getAllAsync<{id:string;revision_id:string;json:string}>('SELECT * FROM activity_current');
  const ec=await db.getAllAsync<{id:string;revision_id:string;activity_id:string;state:string;occurred_at_ms:number;json:string}>('SELECT * FROM entry_current');
  const aIndex=new Map(ac.map(r=>[r.id,r]));
  const eIndex=new Map(ec.map(r=>[r.id,r]));
  const equivalent=(json:string|undefined,value:unknown)=>{try{return !!json&&canonicalize(JSON.parse(json))===canonicalize(value);}catch{return false;}};
  if(ac.length!==activities.length || ec.length!==entries.length || activities.some(a=>aIndex.get(a.id)?.revision_id!==a.revisionId || !equivalent(aIndex.get(a.id)?.json,a)) || entries.some(e=>{const row=eIndex.get(e.id);return row?.revision_id!==e.revision.id || row.activity_id!==e.activityId || row.state!==e.revision.state || row.occurred_at_ms!==e.revision.occurredAtMs || !equivalent(row.json,e.revision);})) {
    await db.withTransactionAsync(async()=>{
      await db.execAsync('DELETE FROM entry_current; DELETE FROM activity_current;');
      await writeDelta(db,{activities:[],entries:[],operations:[],activityRevisions:[],entryRevisions:[],settings:null,activityIds:activities.map(a=>a.id),entryIds:entries.map(e=>e.id)},state);
    });
  }
  return state;
}

/** One queue covers reads, writes, snapshots and restore. No DB handle escapes this boundary. */
export class DailoopStore {
  readonly label = Platform.OS==='web' ? 'SQLite Web · almacenamiento local persistente' : 'SQLite · en este dispositivo';
  private db!:SQLiteDatabase;
  private registry!:SQLiteDatabase;
  private record!:Registry;
  private queue:Promise<unknown>=Promise.resolve();
  private closed=false;
  private recoveryPending=false;
  private cachedState!:DomainState;
  private cachedSequence=0;
  get recoveryRequired(){return this.recoveryPending;}
  private constructor(readonly mode:Mode, private readonly clock:()=>number, private readonly checkpoint?:(point:string)=>Promise<void>) {}
  static async open(mode:Mode,zone:string,clock:()=>number=Date.now,checkpoint?:(point:string)=>Promise<void>) {
    const store=new DailoopStore(mode,clock,checkpoint);
    store.registry=await SQLite.openDatabaseAsync(registryName);
    try {
    await store.registry.execAsync('CREATE TABLE IF NOT EXISTS datasets(scope TEXT PRIMARY KEY, active TEXT NOT NULL, previous TEXT, candidate TEXT, phase TEXT NOT NULL);');
    const record=await store.registry.getFirstAsync<Registry>('SELECT * FROM datasets WHERE scope=?',mode);
    if(!record) {
      const active=datasetName(mode);
      const db=await SQLite.openDatabaseAsync(active);
      try { await migrate(db,digest); await seedDataset(db,createEmptyState({databaseId:uuid(),nowMs:clock(),zone})); await checkIntegrity(db); }
      finally { await db.closeAsync(); }
      store.record={scope:mode,active,previous:null,candidate:null,phase:'ready'};
      await store.saveRecord();
    } else store.record=record;
    await store.recover();
    return store;
    } catch(error) {
      await store.db?.closeAsync().catch(()=>{});
      await store.registry.closeAsync().catch(()=>{});
      throw error;
    }
  }
  private async saveRecord() {
    const r=this.record;
    await this.registry.runAsync('INSERT INTO datasets VALUES(?,?,?,?,?) ON CONFLICT(scope) DO UPDATE SET active=excluded.active,previous=excluded.previous,candidate=excluded.candidate,phase=excluded.phase',r.scope,r.active,r.previous,r.candidate,r.phase);
  }
  private async recover() {
    let loaded:DomainState;
    if(this.record.phase==='prepared') {
      // Candidate was not activated. The old active database remains the authoritative dataset.
      const candidate=this.record.candidate;
      this.record={...this.record,previous:null,candidate:null,phase:'ready'}; await this.saveRecord();
      if(candidate && candidate!==this.record.active) await SQLite.deleteDatabaseAsync(candidate).catch(()=>{});
    }
    try {
      this.db=await SQLite.openDatabaseAsync(this.record.active); await migrate(this.db,digest); loaded=await checkIntegrity(this.db);
    } catch(error) {
      await this.db?.closeAsync().catch(()=>{});
      if(!this.record.previous) throw error;
      this.record={...this.record,active:this.record.previous,previous:null,candidate:null,phase:'ready'}; await this.saveRecord();
      this.db=await SQLite.openDatabaseAsync(this.record.active); await migrate(this.db,digest); loaded=await checkIntegrity(this.db);
    }
    if(this.record.phase==='activated') {
      const previous=this.record.previous;
      this.record={...this.record,previous:null,candidate:null,phase:'ready'}; await this.saveRecord();
      if(previous && previous!==this.record.active) await SQLite.deleteDatabaseAsync(previous).catch(()=>{});
    }
    this.publishState(loaded);
  }
  private publishState(state:DomainState,delta?:ChangeSet){
    this.cachedState=freezeState(state,delta);this.cachedSequence=currentSequence(state);
  }
  private serial<T>(fn:()=>Promise<T>):Promise<T> {
    const guarded=()=>{if(this.recoveryPending)throw new RecoveryRequiredError();if(this.closed)throw new Error('La base cambió de sesión. Reintenta en la vista actual.');return fn();};
    const next=this.queue.then(guarded,guarded); this.queue=next.catch(()=>{}); return next;
  }
  private async requireRecovery():Promise<never>{
    // Set the barrier before awaiting cleanup, so every queued operation is rejected.
    this.recoveryPending=true;this.closed=true;
    await this.db?.closeAsync().catch(()=>{});
    await this.registry?.closeAsync().catch(()=>{});
    throw new RecoveryRequiredError();
  }
  snapshot(){ return this.serial(async()=>this.cachedState); }
  dispatch(command:Command,operationId=uuid()):Promise<CommandResult> {
    return this.serial(async()=>{
      let result!:CommandResult;
      const work=async(db:SQLiteDatabase)=>{
        // The origin has one owner, but verify the committed sequence inside the
        // transaction before deriving changes. SQLite remains authoritative.
        const persisted=await db.getFirstAsync<{sequence:number|null}>('SELECT MAX(sequence) AS sequence FROM operations');
        let current=this.cachedState;
        if((persisted?.sequence??0)!==this.cachedSequence){
          current=await readSnapshot(db);validateState(current);freezeState(current);
        }
        result=execute(current,command,{nowMs:this.clock(),operationId,nextId:uuid});
        await writeDelta(db,result.changeSet,result.state);
        await this.checkpoint?.('before-commit');
      };
      // Every operation on this private handle is serialized above. Keep its
      // initialized connection: Expo's exclusive helper opens a fresh native
      // connection without our foreign_keys/busy_timeout PRAGMAs.
      await this.db.withTransactionAsync(()=>work(this.db));
      // A rejected transaction never publishes its speculative result.
      this.publishState(result.state,result.changeSet);
      return result;
    });
  }
  report(options:ReportOptions){ return this.serial(async()=>buildReport(await readSnapshot(this.db),options)); }
  backup(){ return this.serial(async()=>exportBackup(await readSnapshot(this.db),{backupId:uuid(),exportedAtMs:this.clock(),appVersion:APP_VERSION},digest)); }
  inspect(text:string){ return parseBackup(text,digest); }
  restore(candidate:ParsedBackup) {
    return this.serial(async()=>{
      validateState(candidate.state);
      const old=this.record.active;
      const name=datasetName(this.mode);
      let candidateDb:SQLiteDatabase|undefined;
      try {
        candidateDb=await SQLite.openDatabaseAsync(name); await migrate(candidateDb,digest);
        await seedDataset(candidateDb,candidate.state);
        const loaded=await checkIntegrity(candidateDb);
        if(canonicalize(loaded)!==canonicalize(candidate.state)) throw new Error('La copia restaurada no coincide con el archivo validado.');
        await candidateDb.closeAsync(); candidateDb=undefined;
        this.record={scope:this.mode,active:old,previous:old,candidate:name,phase:'prepared'}; await this.saveRecord();
        await this.checkpoint?.('restore-prepared');
        await this.db.closeAsync();
        this.record={scope:this.mode,active:name,previous:old,candidate:name,phase:'activated'}; await this.saveRecord();
        await this.checkpoint?.('restore-activated');
        this.db=await SQLite.openDatabaseAsync(name); await migrate(this.db,digest); const restored=await checkIntegrity(this.db);
        this.record={scope:this.mode,active:name,previous:null,candidate:null,phase:'ready'};
        await this.checkpoint?.('registry-ready');await this.saveRecord();
        this.publishState(restored);
        await SQLite.deleteDatabaseAsync(old).catch(()=>{});
      } catch(error) {
        await candidateDb?.closeAsync().catch(()=>{});
        await this.db?.closeAsync().catch(()=>{});
        this.record={scope:this.mode,active:old,previous:null,candidate:null,phase:'ready'};
        // An unconfirmed registry write can leave the candidate authoritative on disk.
        // Never accept writes to the old dataset or delete either file until relaunch.
        try {await this.checkpoint?.('rollback-ready');await this.saveRecord();}
        catch {return this.requireRecovery();}
        try {this.db=await SQLite.openDatabaseAsync(old); await migrate(this.db,digest); this.publishState(await checkIntegrity(this.db));}
        catch {return this.requireRecovery();}
        await SQLite.deleteDatabaseAsync(name).catch(()=>{});
        throw error;
      }
    });
  }
  close(){
    // Cleanup must also be safe after the recovery barrier has closed the handles.
    const work=async()=>{
      if(this.closed)return;
      this.closed=true;
      const results=await Promise.allSettled([this.db.closeAsync(),this.registry.closeAsync()]);
      if(results.some(result=>result.status==='rejected'))return this.requireRecovery();
    };
    const next=this.queue.then(work,work);this.queue=next.catch(()=>{});return next;
  }
}
