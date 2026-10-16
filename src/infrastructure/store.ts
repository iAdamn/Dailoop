import { APP_VERSION } from '../version';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { applyPlanning, deriveReminders, getPlanning, createEmptyState, execute, selectActivities, effectiveEntries, buildReport, exportBackup, parseBackup, validateState, canonicalize, currentSequence } from '../domain';
import type { PlanningCommand, PlanningEvent, DomainState, Command, CommandResult, ChangeSet, ReportOptions, ParsedBackup, Meta, Settings, Activity, ActivityRevision, Entry, EntryRevision, Operation } from '../domain';
import { migrate } from './schema';
import { digest, uuid } from './crypto';

export type Mode = 'personal' | 'demo';
export const RECOVERY_MESSAGE = 'No se pudo confirmar qué base quedó activa. Dailoop está detenido para proteger tus datos. Recarga la aplicación para recuperar la base antes de continuar.';
export class RecoveryRequiredError extends Error {
  constructor(){super(RECOVERY_MESSAGE);this.name='RecoveryRequiredError';}
}
export class SyncLocalChangedError extends Error { constructor(){super('Los datos cambiaron durante la sincronización. Se volverá a intentar.');this.name='SyncLocalChangedError';} }

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
  if(state.planning) {
    const freezeJSON=(value:unknown):void=>{
      if(value && typeof value==='object' && !Object.isFrozen(value)){Object.values(value).forEach(freezeJSON);Object.freeze(value);}
    };
    freezeJSON(state.planning);
  }
  Object.freeze(state.meta);Object.freeze(state.settings);Object.freeze(state);
  return state;
}

export async function readSnapshot(db:SQLiteDatabase):Promise<DomainState> {
  const meta = await readRows<Meta>(db,'database_meta');
  const settings = await readRows<Settings>(db,'settings');
  if(meta.length!==1 || settings.length!==1) throw new Error('La base no contiene sus metadatos completos. No se reiniciará automáticamente.');
  const events=await readRows<PlanningEvent>(db,'planning_events');
  const present=await db.getFirstAsync('SELECT present FROM planning_meta WHERE id=1');
  return {meta:meta[0],settings:settings[0],activities:await readRows<Activity>(db,'activities'),activityRevisions:await readRows<ActivityRevision>(db,'activity_revisions'),entries:await readRows<Entry>(db,'entries'),entryRevisions:await readRows<EntryRevision>(db,'entry_revisions'),operations:await readRows<Operation>(db,'operations'),...(events.length||present?{planning:{events}}:{})};
}

async function writeDelta(db:SQLiteDatabase, delta:ChangeSet, state:DomainState, rebuild=false) {
  for(const o of delta.operations) await db.runAsync('INSERT INTO operations VALUES(?,?,?)',o.id,o.sequence,JSON.stringify(o));
  for(const a of delta.activities) await db.runAsync('INSERT INTO activities VALUES(?,?)',a.id,JSON.stringify(a));
  for(const r of delta.activityRevisions) await db.runAsync('INSERT INTO activity_revisions VALUES(?,?,?,?,?,?)',r.id,r.activityId,r.revisionNo,r.previousRevisionId,r.operationId,JSON.stringify(r));
  for(const e of delta.entries) await db.runAsync('INSERT INTO entries VALUES(?,?,?,?)',e.id,e.activityId,e.creationOperationId,JSON.stringify(e));
  for(const r of delta.entryRevisions) await db.runAsync('INSERT INTO entry_revisions VALUES(?,?,?,?,?,?,?)',r.id,r.entryId,r.revisionNo,r.previousRevisionId,r.operationId,r.activityRevisionId,JSON.stringify(r));
  if(delta.settings) await db.runAsync('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',JSON.stringify(delta.settings));
  // Normal commits project only appended revisions; repair is the explicit
  // full-history path, rather than the cost of every registration.
  const revisedActivities = new Set(delta.activityRevisions.map(r=>r.activityId));
  const activityState = rebuild ? state : {...state,
    activities:state.activities.filter(a=>revisedActivities.has(a.id)),
    activityRevisions:delta.activityRevisions, operations:delta.operations};
  for(const a of selectActivities(activityState,{includeArchived:true})) {
    await db.runAsync('INSERT INTO activity_current VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision_id=excluded.revision_id,json=excluded.json',a.id,a.revisionId,JSON.stringify(a));
  }
  const entryRevisions = new Map<string,EntryRevision>();
  if(rebuild) for(const e of effectiveEntries(state,{includeVoided:true})) entryRevisions.set(e.id,e.revision);
  else for(const revision of delta.entryRevisions) {
    const previous=entryRevisions.get(revision.entryId);
    if(!previous || previous.revisionNo<revision.revisionNo) entryRevisions.set(revision.entryId,revision);
  }
  const identities = new Map(delta.entries.map(entry=>[entry.id,entry]));
  if([...entryRevisions.keys()].some(id=>!identities.has(id))) {
    for(const entry of state.entries) if(entryRevisions.has(entry.id)) identities.set(entry.id,entry);
  }
  for(const [id,revision] of entryRevisions) {
    const entry=identities.get(id);
    if(!entry) throw new Error('La proyección no tiene su registro original.');
    await db.runAsync('INSERT INTO entry_current VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision_id=excluded.revision_id,activity_id=excluded.activity_id,state=excluded.state,occurred_at_ms=excluded.occurred_at_ms,json=excluded.json',id,revision.id,entry.activityId,revision.state,revision.occurredAtMs,JSON.stringify(revision));
  }
}

async function seedDataset(db:SQLiteDatabase,state:DomainState) {
  await db.withTransactionAsync(async()=>{
    await db.runAsync('INSERT INTO database_meta VALUES(1,?)',JSON.stringify(state.meta));
    await writeDelta(db,{activities:state.activities,activityRevisions:[...state.activityRevisions].sort((a,b)=>a.revisionNo-b.revisionNo),entries:state.entries,entryRevisions:[...state.entryRevisions].sort((a,b)=>a.revisionNo-b.revisionNo),operations:state.operations,settings:state.settings,activityIds:state.activities.map(a=>a.id),entryIds:state.entries.map(e=>e.id)},state);
    if(state.planning) {
      await db.runAsync('INSERT INTO planning_meta VALUES(1,1)');
      for(const event of state.planning.events) await db.runAsync('INSERT INTO planning_events VALUES(?,?,?)',event.id,event.sequence,JSON.stringify(event));
    }
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
      await writeDelta(db,{activities:[],entries:[],operations:[],activityRevisions:[],entryRevisions:[],settings:null,activityIds:activities.map(a=>a.id),entryIds:entries.map(e=>e.id)},state,true);
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
  private cachedPlanningSequence=0;
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
    this.cachedPlanningSequence=state.planning?.events.length??0;
  }
  private async committedState(db:SQLiteDatabase):Promise<DomainState>{
    // Check both append-only logs inside the transaction. Unchanged snapshots
    // retain their immutable indexes instead of decoding the entire history.
    const persisted=await db.getFirstAsync<{sequence:number|null;planning_sequence:number|null}>(
      'SELECT (SELECT MAX(sequence) FROM operations) AS sequence, (SELECT MAX(sequence) FROM planning_events) AS planning_sequence');
    if((persisted?.sequence??0)===this.cachedSequence && (persisted?.planning_sequence??0)===this.cachedPlanningSequence)return this.cachedState;
    const state=await readSnapshot(db);validateState(state);return freezeState(state);
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
  dispatchPlanning(command:PlanningCommand,operationId=uuid(),guard?:(state:DomainState)=>void):Promise<DomainState> {
    return this.serial(async()=>{
      let next!:DomainState;
      await this.db.withTransactionAsync(async()=>{
        const current=await this.committedState(this.db);
        guard?.(current);
        const planning=applyPlanning(current,command,{nowMs:this.clock(),operationId,nextId:uuid});
        next={...current,planning};
        await this.db.runAsync('INSERT OR IGNORE INTO planning_meta VALUES(1,1)');
        for(const event of planning.events.slice(current.planning?.events.length??0)) await this.db.runAsync('INSERT INTO planning_events VALUES(?,?,?)',event.id,event.sequence,JSON.stringify(event));
        await this.checkpoint?.('planning-before-commit');
      });
      this.publishState(next);
      return this.cachedState;
    });
  }
  completeReminder(reminderId:string,operationId=uuid(),dueAtMs?:number,guard?:(state:DomainState)=>void):Promise<CommandResult> {
    return this.serial(async()=>{
      let result!:CommandResult;
      await this.db.withTransactionAsync(async()=>{
        const current=await this.committedState(this.db);
        guard?.(current);
        const now=this.clock();
        const plan=getPlanning(current);
        const series=plan.reminders.find(item=>item.id===reminderId);
        if(series?.recurrence && dueAtMs===undefined)throw new Error('Elige la ocasión del recordatorio que quieres completar.');
        const reminder=deriveReminders(current,now).find(item=>item.id===reminderId && (dueAtMs===undefined || item.dueAtMs===dueAtMs));
        if(!reminder || reminder.status==='archived' || reminder.status==='skipped')throw new Error('Este recordatorio ya no está disponible.');
        const activity=selectActivities(current).find(item=>item.id===reminder.activityId);
        if(!activity)throw new Error('Restaura la actividad antes de completar su recordatorio.');
        if(reminder.status==='done') {
          result={state:current,changeSet:{activities:[],activityRevisions:[],entries:[],entryRevisions:[],operations:[],settings:null,activityIds:[],entryIds:[]},result:{entryId:reminder.completedEntryId??undefined,replayed:true}};
          return;
        }
        const linked=reminder.recurrence ? plan.occurrenceEntries?.find(item=>item.reminderId===reminderId && item.dueAtMs===reminder.dueAtMs) : undefined;
        const completionId=linked?.entryId ?? (reminder.recurrence ? uuid() : reminder.completionEntryId);
        const existing=effectiveEntries(current,{includeVoided:true}).find(entry=>entry.id===completionId);
        const original=existing ? current.entryRevisions.find(revision=>revision.entryId===existing.id && revision.revisionNo===1) : undefined;
        const command:Command=existing
          ? existing.revision.state==='void' ? {type:'restoreEntry',entryId:existing.id}
            : {type:'correctEntry',entryId:existing.id,occurredAtMs:original!.occurredAtMs,occurredZone:original!.occurredZone,reason:'Restablecer la ocasión del recordatorio'}
          : {type:'createEntry',activityId:reminder.activityId,id:completionId,occurredAtMs:now,occurredZone:current.settings.zone};
        result=execute(current,command,{nowMs:now,operationId,nextId:uuid});
        // Restoring a voided, corrected entry must also restore its occurrence's original day.
        if(reminder.recurrence && existing?.revision.state==='void' && original && existing.revision.occurredAtMs!==original.occurredAtMs) {
          const repaired=execute(result.state,{type:'correctEntry',entryId:existing.id,occurredAtMs:original.occurredAtMs,occurredZone:original.occurredZone,reason:'Restablecer la ocasión del recordatorio'},{nowMs:now,operationId:uuid(),nextId:uuid});
          const first=result.changeSet,second=repaired.changeSet;
          result={...repaired,changeSet:{activities:[...first.activities,...second.activities],activityRevisions:[...first.activityRevisions,...second.activityRevisions],entries:[...first.entries,...second.entries],entryRevisions:[...first.entryRevisions,...second.entryRevisions],operations:[...first.operations,...second.operations],settings:second.settings??first.settings,activityIds:[...new Set([...first.activityIds,...second.activityIds])],entryIds:[...new Set([...first.entryIds,...second.entryIds])]}};
        }
        if(reminder.recurrence && !linked) {
          const planning=applyPlanning(result.state,{type:'linkReminderOccurrence',reminderId,dueAtMs:reminder.dueAtMs,entryId:completionId},{nowMs:now,operationId:uuid(),nextId:uuid});
          result={...result,state:{...result.state,planning}};
          for(const event of planning.events.slice(current.planning?.events.length??0))await this.db.runAsync('INSERT INTO planning_events VALUES(?,?,?)',event.id,event.sequence,JSON.stringify(event));
        }
        await writeDelta(this.db,result.changeSet,result.state);
        await this.checkpoint?.('before-commit');
      });
      this.publishState(result.state,result.changeSet);
      return result;
    });
  }
  dispatch(command:Command,operationId=uuid(),guard?:(state:DomainState)=>void):Promise<CommandResult> {
    return this.serial(async()=>{
      let result!:CommandResult;
      const work=async(db:SQLiteDatabase)=>{
        // The origin has one owner, but verify the committed sequence inside the
        // transaction before deriving changes. SQLite remains authoritative.
        const current=await this.committedState(db);
        guard?.(current);
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
    return this.serial(()=>this.activateSnapshot(candidate.state));
  }
  /** Compare inside the same serialized write boundary; network never owns local writes. */
  applySync(state:DomainState,expectedDigest:string,stillAllowed:()=>boolean=()=>true) {
    return this.serial(async()=>{
      const current=await this.committedState(this.db);
      if(await digest(canonicalize(current))!==expectedDigest || !stillAllowed()) throw new SyncLocalChangedError();
      await this.activateSnapshot(state,stillAllowed);
    });
  }
  private async activateSnapshot(state:DomainState,stillAllowed:()=>boolean=()=>true) {
      const guard=()=>{if(!stillAllowed())throw new SyncLocalChangedError();};
      validateState(state);
      const old=this.record.active;
      const name=datasetName(this.mode);
      let candidateDb:SQLiteDatabase|undefined;
      try {
        candidateDb=await SQLite.openDatabaseAsync(name); await migrate(candidateDb,digest);
        await seedDataset(candidateDb,state);
        const loaded=await checkIntegrity(candidateDb);
        if(canonicalize(loaded)!==canonicalize(state)) throw new Error('La copia restaurada no coincide con el archivo validado.');
        await candidateDb.closeAsync(); candidateDb=undefined;
        this.record={scope:this.mode,active:old,previous:old,candidate:name,phase:'prepared'}; await this.saveRecord();
        await this.checkpoint?.('restore-prepared');
        guard();
        await this.db.closeAsync();
        guard();
        this.record={scope:this.mode,active:name,previous:old,candidate:name,phase:'activated'}; await this.saveRecord();
        await this.checkpoint?.('restore-activated');
        guard();
        this.db=await SQLite.openDatabaseAsync(name); await migrate(this.db,digest); const restored=await checkIntegrity(this.db);
        guard();
        this.record={scope:this.mode,active:name,previous:null,candidate:null,phase:'ready'};
        await this.checkpoint?.('registry-ready');guard();await this.saveRecord();guard();
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
