import { APP_VERSION } from '../src/version';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as domain from '../src/domain';
import { migrate } from '../src/infrastructure/schema';
import type { DailoopStore } from '../src/infrastructure/store';
import { deviceTimeZone } from '../src/infrastructure/deviceTimeZone';

const now=Date.parse('2026-10-12T17:00:00Z');
const digest=async(value:string)=>createHash('sha256').update(value).digest('hex');
// Execute the production modules, replacing only Expo/native IO boundaries.
function loadModule(path:string,dependencies:Record<string,unknown>){
  const source=ts.transpileModule(readFileSync(join(process.cwd(),path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{} as any};
  dependencies = { '../version': { APP_VERSION }, './deviceTimeZone': { deviceTimeZone }, ...dependencies };
  new Function('require','module','exports','globalThis',source)((name:string)=>{
    if(!(name in dependencies))throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  },module,module.exports,{});
  return module.exports;
}
function realSqlite(){
  const directory=mkdtempSync(join(tmpdir(),'dailoop-recovery-'));
  const handles=new Set<DatabaseSync>();
  const deleted:string[]=[];
  const reads:string[]=[];
  const sqlite={
    openDatabaseAsync:async(name:string)=>{
      const raw=new DatabaseSync(join(directory,name));handles.add(raw);
      let closed=false;
      const transaction=async(work:()=>Promise<void>)=>{raw.exec('BEGIN');try{await work();raw.exec('COMMIT');}catch(error){raw.exec('ROLLBACK');throw error;}};
      const adapter={
        execAsync:async(sql:string)=>{raw.exec(sql);},
        runAsync:async(sql:string,...params:any[])=>raw.prepare(sql).run(...params),
        getFirstAsync:async(sql:string,...params:any[])=>{reads.push(sql);return raw.prepare(sql).get(...params)??null;},
        getAllAsync:async(sql:string,...params:any[])=>{reads.push(sql);return raw.prepare(sql).all(...params);},
        withTransactionAsync:transaction,
        withExclusiveTransactionAsync:async(work:(db:SQLiteDatabase)=>Promise<void>)=>transaction(()=>work(adapter as unknown as SQLiteDatabase)),
        closeAsync:async()=>{if(!closed){raw.close();closed=true;handles.delete(raw);}},
      };
      return adapter;
    },
    deleteDatabaseAsync:async(name:string)=>{deleted.push(name);rmSync(join(directory,name));},
  };
  const readRegistry=()=>{
    const db=new DatabaseSync(join(directory,'dailoop-registry-v1.db'));
    try{return db.prepare("SELECT * FROM datasets WHERE scope='personal'").get() as unknown as {active:string;previous:string|null;candidate:string|null;phase:string};}finally{db.close();}
  };
  const editActive=(edit:(raw:DatabaseSync)=>void)=>{const raw=new DatabaseSync(join(directory,readRegistry().active));try{edit(raw);}finally{raw.close();}};
  return {sqlite,deleted,reads,readRegistry,editActive,exists:(name:string)=>existsSync(join(directory,name)),handleCount:()=>handles.size,cleanup:()=>{for(const raw of handles)raw.close();rmSync(directory,{recursive:true,force:true});}};
}
async function candidate(){
  const empty=domain.createEmptyState({databaseId:randomUUID(),nowMs:now,zone:'America/Bogota'});
  const state=domain.execute(empty,{type:'createActivity',name:'Restaurada',emoji:'🌱',color:'#8FD8FF'},{nowMs:now,operationId:randomUUID(),nextId:randomUUID}).state;
  return domain.parseBackup(await domain.exportBackup(state,{backupId:randomUUID(),exportedAtMs:now,appVersion:'0.1.0'},digest),digest);
}
function storeModule(database:ReturnType<typeof realSqlite>){
  return loadModule('src/infrastructure/store.ts',{'react-native':{Platform:{OS:'web'}},'expo-sqlite':database.sqlite,'../domain':domain,'./schema':{migrate},'./crypto':{digest,uuid:randomUUID}}) as {DailoopStore:typeof DailoopStore};
}

test('failed ready and rollback markers freeze queued writes, preserve both files, and recover the durable candidate on relaunch',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database);
    const checkpoints:string[]=[];
    const store=await Store.open('personal','America/Bogota',()=>now,async(point)=>{
      checkpoints.push(point);
      if(point==='registry-ready'||point==='rollback-ready')throw new Error(`injected ${point}`);
    });
    await store.dispatch({type:'createActivity',name:'Anterior',emoji:'📚',color:'#DCCFFF'});
    const previous=database.readRegistry().active;
    const backup=await candidate();
    const restoration=store.restore(backup);
    const queuedWrite=store.dispatch({type:'createActivity',name:'No debe escribirse',emoji:'📚',color:'#DCCFFF'});
    const queuedClose=store.close();
    // Attach both rejection observers immediately; the queued call settles after restore.
    await Promise.all([assert.rejects(restoration,/recarga|recargar/i),assert.rejects(queuedWrite,/recarga|recargar/i),queuedClose]);
    assert.equal(store.recoveryRequired,true);
    assert.ok(checkpoints.includes('registry-ready'));assert.ok(checkpoints.includes('rollback-ready'));
    const durable=database.readRegistry();
    assert.equal(durable.phase,'activated');assert.equal(durable.previous,previous);assert.equal(durable.candidate,durable.active);
    assert.ok(database.exists(previous));assert.ok(database.exists(durable.active));assert.deepEqual(database.deleted,[]);
    assert.equal(database.handleCount(),0);
    await assert.rejects(store.snapshot(),/recarga|recargar/i);
    await assert.rejects(store.backup(),/recarga|recargar/i);
    await assert.rejects(store.report({from:'2026-10-01',to:'2026-10-31',zone:'America/Bogota',selectedActivityIds:[],generatedAtMs:now}),/recarga|recargar/i);
    await assert.rejects(store.restore(backup),/recarga|recargar/i);
    await assert.rejects(store.dispatch({type:'updateSettings',changes:{theme:'dark'}}),/recarga|recargar/i);
    await store.close();
    const reopened=await Store.open('personal','America/Bogota',()=>now);
    assert.equal(reopened.recoveryRequired,false);
    assert.equal(domain.canonicalize(await reopened.snapshot()),domain.canonicalize(backup.state));
    assert.equal(database.readRegistry().phase,'ready');assert.ok(!database.exists(previous));
    await reopened.close();
  }finally{database.cleanup();}
});

test('a failed final marker with a successful rollback keeps the previous dataset writable across relaunch',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database);
    const store=await Store.open('personal','America/Bogota',()=>now,async(point)=>{if(point==='registry-ready')throw new Error('injected ready');});
    await store.dispatch({type:'createActivity',name:'Anterior',emoji:'📚',color:'#DCCFFF'});
    const previous=database.readRegistry().active;
    await assert.rejects(store.restore(await candidate()),/injected ready/);
    assert.equal(store.recoveryRequired,false);assert.equal(database.readRegistry().active,previous);assert.equal(database.readRegistry().phase,'ready');
    await store.dispatch({type:'createActivity',name:'Después del rollback confirmado',emoji:'📚',color:'#DCCFFF'});
    const snapshot=await store.snapshot();await store.close();
    const reopened=await Store.open('personal','America/Bogota',()=>now);
    assert.equal(domain.canonicalize(await reopened.snapshot()),domain.canonicalize(snapshot));await reopened.close();
  }finally{database.cleanup();}
});

test('committed snapshots are deeply immutable, preserve prior views, and avoid repeated JSON reads',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database);const store=await Store.open('personal','America/Bogota',()=>now);
    database.reads.length=0;
    const empty=await store.snapshot();assert.equal(await store.snapshot(),empty);
    const created=await store.dispatch({type:'createActivity',name:'Lectura',emoji:'📚',color:'#DCCFFF'});
    const afterActivity=await store.snapshot();assert.equal(created.state,afterActivity);assert.equal(empty.activities.length,0);
    const activityId=created.result.activityId!;
    await store.dispatch({type:'createEntry',activityId,note:'Original'});
    const afterEntry=await store.snapshot();assert.equal(afterActivity.entries.length,0);
    assert.ok(Object.isFrozen(afterEntry));assert.ok(Object.isFrozen(afterEntry.settings));assert.ok(Object.isFrozen(afterEntry.meta));
    for(const rows of [afterEntry.activities,afterEntry.activityRevisions,afterEntry.entries,afterEntry.entryRevisions,afterEntry.operations]){
      assert.ok(Object.isFrozen(rows));for(const row of rows)assert.ok(Object.isFrozen(row));
    }
    assert.throws(()=>{afterEntry.settings.theme='dark';},TypeError);
    assert.throws(()=>{afterEntry.entryRevisions[0].note='Corrupta desde UI';},TypeError);
    assert.throws(()=>{afterEntry.operations.pop();},TypeError);
    assert.throws(()=>{created.changeSet.activities[0].id=randomUUID();},TypeError);
    assert.equal((await store.snapshot()).entryRevisions[0].note,'Original');
    assert.equal(database.reads.filter(sql=>sql.startsWith('SELECT json FROM')).length,0);
    assert.equal(database.reads.filter(sql=>sql.includes('MAX(sequence)')).length,2);
    // Export still takes an explicit fresh database snapshot.
    const exported=await store.inspect(await store.backup());
    assert.equal(domain.canonicalize(exported.state),domain.canonicalize(afterEntry));
    assert.ok(database.reads.some(sql=>sql.startsWith('SELECT json FROM')));
    await store.close();
  }finally{database.cleanup();}
});

test('transaction rollback does not publish cache changes and retry advances the persisted sequence once',async()=>{
  const database=realSqlite();
  try{
    let fail=false;const {DailoopStore:Store}=storeModule(database);
    const store=await Store.open('personal','America/Bogota',()=>now,async(point)=>{if(fail&&point==='before-commit')throw new Error('rollback injected');});
    const created=await store.dispatch({type:'createActivity',name:'Lectura',emoji:'📚',color:'#DCCFFF'});
    const before=await store.snapshot();const operationId=randomUUID();const command:domain.Command={type:'createEntry',activityId:created.result.activityId!};
    fail=true;await assert.rejects(store.dispatch(command,operationId),/rollback injected/);
    assert.equal(await store.snapshot(),before);assert.equal(before.entries.length,0);
    const persisted=await store.inspect(await store.backup());assert.equal(domain.canonicalize(persisted.state),domain.canonicalize(before));
    fail=false;const committed=await store.dispatch(command,operationId);
    assert.equal(committed.state.operations.length,2);assert.equal(domain.currentSequence(committed.state),2);
    const replay=await store.dispatch(command,operationId);assert.equal(replay.result.replayed,true);assert.equal(replay.state,committed.state);
    assert.equal(before.entries.length,0);await store.close();
    const reopened=await Store.open('personal','America/Bogota',()=>now);assert.equal(domain.canonicalize(await reopened.snapshot()),domain.canonicalize(committed.state));await reopened.close();
  }finally{database.cleanup();}
});

test('queued concurrent commands derive from each preceding commit without dropping cache history',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database);const store=await Store.open('personal','America/Bogota',()=>now);
    const before=await store.snapshot();
    const results=await Promise.all([
      store.dispatch({type:'createActivity',name:'Primera',emoji:'📚',color:'#DCCFFF'}),
      store.dispatch({type:'createActivity',name:'Segunda',emoji:'🌱',color:'#8FD8FF'}),
      store.dispatch({type:'updateSettings',changes:{hourFormat:'12h'}}),
    ]);
    assert.deepEqual(results.map(result=>domain.currentSequence(result.state)),[1,2,3]);
    assert.deepEqual(results.map(result=>result.state.activities.length),[1,2,2]);assert.equal(before.activities.length,0);
    const final=await store.snapshot();assert.equal(final,results[2].state);assert.equal(final.settings.hourFormat,'12h');
    assert.equal(results[0].state.settings.hourFormat,'24h');
    const persisted=await store.inspect(await store.backup());assert.equal(domain.canonicalize(final),domain.canonicalize(persisted.state));await store.close();
  }finally{database.cleanup();}
});

test('successful restore replaces the cache only with the confirmed dataset and continues its sequence',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database);const store=await Store.open('personal','America/Bogota',()=>now);
    await store.dispatch({type:'createActivity',name:'Anterior A',emoji:'📚',color:'#DCCFFF'});
    await store.dispatch({type:'createActivity',name:'Anterior B',emoji:'📚',color:'#DCCFFF'});
    const before=await store.snapshot();const backup=await candidate();await store.restore(backup);
    const restored=await store.snapshot();assert.equal(domain.canonicalize(restored),domain.canonicalize(backup.state));assert.notEqual(restored,before);
    assert.equal(before.activities.length,2);assert.equal(restored.activities.length,1);assert.equal(domain.currentSequence(restored),1);
    // The caller retains a mutable candidate, but it is never the cached object.
    backup.state.activityRevisions[0].name='Cambio fuera del store';assert.equal(restored.activityRevisions[0].name,'Restaurada');
    await store.dispatch({type:'createEntry',activityId:restored.activities[0].id});const final=await store.snapshot();
    assert.equal(domain.currentSequence(final),2);assert.equal(restored.entries.length,0);assert.equal(before.entries.length,0);
    await store.close();const reopened=await Store.open('personal','America/Bogota',()=>now);assert.equal(domain.canonicalize(await reopened.snapshot()),domain.canonicalize(final));await reopened.close();
  }finally{database.cleanup();}
});

test('sequence fence reloads and validates another committed writer before deriving a new operation',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database);const first=await Store.open('personal','America/Bogota',()=>now);const before=await first.snapshot();
    // This second owner is a deliberate test of the fence, not the app's Web Lock policy.
    const other=await Store.open('personal','America/Bogota',()=>now);await other.dispatch({type:'createActivity',name:'Otro commit',emoji:'📚',color:'#DCCFFF'});await other.close();
    database.reads.length=0;
    const result=await first.dispatch({type:'updateSettings',changes:{theme:'dark'}});
    assert.equal(result.state.activities.length,1);assert.equal(domain.currentSequence(result.state),2);assert.equal(result.state.settings.theme,'dark');assert.equal(before.activities.length,0);
    assert.ok(database.reads.some(sql=>sql.includes('MAX(sequence)')));assert.ok(database.reads.some(sql=>sql.startsWith('SELECT json FROM')));
    assert.ok(Object.isFrozen(result.state.activityRevisions[0]));await first.close();
  }finally{database.cleanup();}
});

test('a sequence mismatch containing invalid persisted history is rejected without replacing the cached state',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database);const store=await Store.open('personal','America/Bogota',()=>now);const before=await store.snapshot();
    database.editActive(raw=>{raw.prepare('INSERT INTO operations VALUES(?,?,?)').run(randomUUID(),1,'{}');});
    await assert.rejects(store.dispatch({type:'updateSettings',changes:{theme:'dark'}}));
    assert.equal(await store.snapshot(),before);assert.equal(before.settings.theme,'system');await store.close();
  }finally{database.cleanup();}
});

function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function sessionModule(open:()=>Promise<unknown>){
  return loadModule('src/infrastructure/session.ts',{'react-native':{Platform:{OS:'native'}},'expo-localization':{getCalendars:()=>[{timeZone:'America/Bogota'}]},'../domain':domain,'./store':{DailoopStore:{open},RECOVERY_MESSAGE:'Recarga para recuperar la base.'},'./crypto':{digest,uuid:randomUUID},'./files':{cleanExportCache:()=>{}}}).session as typeof import('../src/infrastructure/session').session;
}
for(const failure of [false,true])test(`a ${failure?'failed':'successful'} stale refresh cannot change or crash the new session`,async()=>{
  const read=deferred<domain.DomainState>();const closing=deferred<void>();
  const oldState=domain.createEmptyState({databaseId:randomUUID(),nowMs:now,zone:'America/Bogota'});
  const newState=domain.createEmptyState({databaseId:randomUUID(),nowMs:now,zone:'America/Bogota'});
  const old={label:'old',snapshot:()=>read.promise,close:()=>closing.promise,mode:'personal',recoveryRequired:false};
  const current={label:'new',snapshot:async()=>newState,close:async()=>{},mode:'personal',recoveryRequired:false};
  const session=sessionModule(async()=>current);
  session.store=old as unknown as DailoopStore;
  session.snapshot={state:oldState,mode:'personal',readOnly:false,storageLabel:'old',error:null};
  const refresh=session.refresh();
  const changing=session.openMode('personal');await Promise.resolve();
  if(failure)read.reject(new Error('old read failed'));else read.resolve(oldState);
  await refresh;
  closing.resolve();await changing;
  assert.equal(session.snapshot.state?.meta.databaseId,newState.meta.databaseId);assert.equal(session.snapshot.storageLabel,'new');assert.equal(session.snapshot.error,null);
});

test('an uncertain store becomes a session recovery barrier and blocks mode changes',async()=>{
  const state=domain.createEmptyState({databaseId:randomUUID(),nowMs:now,zone:'America/Bogota'});
  let opens=0;
  const session=sessionModule(async()=>{opens++;throw new Error('must not open');});
  session.store={label:'old',mode:'personal',recoveryRequired:true,snapshot:async()=>{throw new Error('Recarga para recuperar');},close:async()=>{}} as unknown as DailoopStore;
  session.snapshot={state,mode:'personal',readOnly:false,storageLabel:'old',error:null};
  await assert.rejects(session.refresh(),/Recarga/);
  assert.equal(session.snapshot.recoveryRequired,true);
  await assert.rejects(session.openMode('demo'),/recarga|recargar/i);assert.equal(opens,0);
});

test('a restore that freezes while mode change awaits close cannot be bypassed by opening another dataset',async()=>{
  const closing=deferred<void>();let opens=0;
  const state=domain.createEmptyState({databaseId:randomUUID(),nowMs:now,zone:'America/Bogota'});
  const old={label:'old',mode:'personal',recoveryRequired:false,close:()=>closing.promise};
  const session=sessionModule(async()=>{opens++;throw new Error('must not open');});
  session.store=old as unknown as DailoopStore;
  session.snapshot={state,mode:'personal',readOnly:false,storageLabel:'old',error:null};
  const change=session.openMode('demo');await Promise.resolve();
  assert.equal(session.snapshot.reloading,true);assert.equal(session.store,null);
  old.recoveryRequired=true;closing.resolve();
  await assert.rejects(change,/recarga|recargar/i);
  assert.equal(opens,0);assert.equal(session.store,old);assert.equal(session.snapshot.reloading,false);assert.equal(session.snapshot.recoveryRequired,true);assert.equal(session.snapshot.mode,'personal');
});

test('a normal close failure that freezes the store leaves its session available only for recovery',async()=>{
  let opens=0;
  const old={label:'old',mode:'personal',recoveryRequired:false,close:async()=>{old.recoveryRequired=true;throw new Error('Recarga tras fallo de cierre');}};
  const session=sessionModule(async()=>{opens++;throw new Error('must not open');});session.store=old as unknown as DailoopStore;
  await assert.rejects(session.openMode('demo'),/Recarga/);
  assert.equal(opens,0);assert.equal(session.store,old);assert.equal(session.snapshot.recoveryRequired,true);assert.equal(session.snapshot.reloading,false);
});

function reminderCommand(activityId:string,dueAtMs=now+86_400_000):Extract<domain.PlanningCommand,{type:'createReminder'}> {
  return {type:'createReminder',id:randomUUID(),completionEntryId:randomUUID(),activityId,dueAtMs,leadMinutes:[1440,180,60,30,0],notifications:true};
}

test('planning dispatch rolls back both its marker and log, then retries and replays one immutable persisted event',async()=>{
  const database=realSqlite();
  try{
    let fail=false;const {DailoopStore:Store}=storeModule(database);
    const store=await Store.open('personal','America/Bogota',()=>now,async(point)=>{if(fail&&point==='planning-before-commit')throw new Error('planning rollback injected');});
    const activity=await store.dispatch({type:'createActivity',name:'Leer',emoji:'📖',color:'#DCCFFF'});
    const before=await store.snapshot(),command=reminderCommand(activity.result.activityId!),operationId=randomUUID();
    fail=true;await assert.rejects(store.dispatchPlanning(command,operationId),/planning rollback injected/);
    assert.equal(await store.snapshot(),before);assert.equal(Object.hasOwn(before,'planning'),false);
    database.editActive(raw=>{
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_events').get()!.n,0);
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_meta').get()!.n,0);
    });
    assert.equal(domain.canonicalize((await store.inspect(await store.backup())).state),domain.canonicalize(before));
    fail=false;const committed=await store.dispatchPlanning(command,operationId);
    assert.equal(domain.getPlanning(committed).reminders.length,1);assert.equal(committed.operations.length,1);
    assert.ok(Object.isFrozen(committed.planning));assert.ok(Object.isFrozen(committed.planning!.events));
    assert.ok(Object.isFrozen(committed.planning!.events[0].command));
    assert.throws(()=>{(committed.planning!.events[0].command as typeof command).leadMinutes.push(15);},TypeError);
    const replay=await store.dispatchPlanning(command,operationId);
    assert.equal(domain.canonicalize(replay),domain.canonicalize(committed));
    await assert.rejects(store.dispatchPlanning({...command,notifications:false},operationId),/operación.*otra acción/);
    database.editActive(raw=>assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_events').get()!.n,1));
    await store.close();
    const reopened=await Store.open('personal','America/Bogota',()=>now);
    assert.equal(domain.canonicalize(await reopened.snapshot()),domain.canonicalize(committed));await reopened.close();
  }finally{database.cleanup();}
});

test('completing a reminder is atomic, retryable and idempotent across concurrent taps and relaunch',async()=>{
  const database=realSqlite();
  try{
    let fail=false;const {DailoopStore:Store}=storeModule(database);
    const store=await Store.open('personal','America/Bogota',()=>now,async(point)=>{if(fail&&point==='before-commit')throw new Error('completion rollback injected');});
    const activity=await store.dispatch({type:'createActivity',name:'Leer',emoji:'📖',color:'#DCCFFF'});
    const command=reminderCommand(activity.result.activityId!);await store.dispatchPlanning(command);
    const before=await store.snapshot(),operationId=randomUUID();
    fail=true;await assert.rejects(store.completeReminder(command.id,operationId),/completion rollback injected/);
    assert.equal(await store.snapshot(),before);assert.equal(before.entries.length,0);
    database.editActive(raw=>{
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM entries').get()!.n,0);
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM entry_revisions').get()!.n,0);
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM operations').get()!.n,1);
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_events').get()!.n,1);
    });
    fail=false;const results=await Promise.all([store.completeReminder(command.id,operationId),store.completeReminder(command.id,operationId),store.completeReminder(command.id)]);
    assert.deepEqual(results.map(result=>result.result.replayed),[false,true,true]);
    const committed=await store.snapshot();assert.equal(committed.entries.length,1);assert.equal(committed.entryRevisions.length,1);assert.equal(committed.operations.length,2);
    assert.equal(committed.entries[0].id,command.completionEntryId);assert.equal(domain.deriveReminders(committed,now)[0].status,'done');
    await store.close();const reopened=await Store.open('personal','America/Bogota',()=>now);
    const replay=await reopened.completeReminder(command.id);assert.equal(replay.result.replayed,true);assert.equal(replay.state.entries.length,1);
    await reopened.dispatch({type:'voidEntry',entryId:command.completionEntryId});
    assert.equal(domain.deriveReminders(await reopened.snapshot(),now)[0].status,'pending');
    const restoreOperation=randomUUID(),restored=await reopened.completeReminder(command.id,restoreOperation);
    assert.equal(restored.result.entryId,command.completionEntryId);assert.equal(restored.state.entries.length,1);
    assert.deepEqual(restored.state.entryRevisions.map(revision=>revision.kind),['create','void','restore']);
    assert.equal((await reopened.completeReminder(command.id,restoreOperation)).result.replayed,true);
    assert.equal(domain.canonicalize((await reopened.inspect(await reopened.backup())).state),domain.canonicalize(restored.state));await reopened.close();
  }finally{database.cleanup();}
});

test('a normal same-day registration completes one reminder; voiding reopens it and explicit completion preserves the voided audit',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database),store=await Store.open('personal','America/Bogota',()=>now);
    const activity=await store.dispatch({type:'createActivity',name:'Leer',emoji:'📖',color:'#DCCFFF'});
    const command=reminderCommand(activity.result.activityId!,now+3_600_000);await store.dispatchPlanning(command);
    const registered=await store.dispatch({type:'createEntry',activityId:command.activityId});
    assert.equal(domain.deriveReminders(registered.state,now)[0].status,'done');
    const noDuplicate=await store.completeReminder(command.id);assert.equal(noDuplicate.result.replayed,true);assert.equal(noDuplicate.result.entryId,registered.result.entryId);
    await store.dispatch({type:'voidEntry',entryId:registered.result.entryId!});
    assert.equal(domain.deriveReminders(await store.snapshot(),now)[0].status,'pending');
    const completed=await store.completeReminder(command.id);
    assert.equal(completed.result.entryId,command.completionEntryId);assert.equal(completed.state.entries.length,2);
    assert.equal(domain.effectiveEntries(completed.state).length,1);
    assert.equal(domain.effectiveEntries(completed.state,{includeVoided:true}).find(entry=>entry.id===registered.result.entryId)!.revision.state,'void');
    assert.equal(domain.deriveReminders(completed.state,now)[0].status,'done');await store.close();
  }finally{database.cleanup();}
});

test('backup restoration preserves planning events, an explicitly empty planning object, and legacy v1 absence across relaunch',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database);let store=await Store.open('personal','America/Bogota',()=>now);
    const base=(await candidate()).state;
    const command=reminderCommand(base.activities[0].id);
    const withPlanning={...base,planning:domain.applyPlanning(base,command,{nowMs:now,operationId:randomUUID(),nextId:randomUUID})};
    const emptyPlanning={...base,planning:{events:[]}};
    for(const expected of [withPlanning,emptyPlanning,base]){
      const text=await domain.exportBackup(expected,{backupId:randomUUID(),exportedAtMs:now,appVersion:APP_VERSION},digest);
      const backup=await domain.parseBackup(text,digest);assert.equal(backup.backup.formatVersion,Object.hasOwn(expected,'planning')?2:1);
      await store.restore(backup);
      assert.equal(domain.canonicalize(await store.snapshot()),domain.canonicalize(expected));
      const exported=await store.inspect(await store.backup());
      assert.equal(exported.backup.formatVersion,backup.backup.formatVersion);assert.equal(domain.canonicalize(exported.state),domain.canonicalize(expected));
      await store.close();store=await Store.open('personal','America/Bogota',()=>now);
      assert.equal(domain.canonicalize(await store.snapshot()),domain.canonicalize(expected));
      database.editActive(raw=>{
        assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,2);
        assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_meta').get()!.n,Object.hasOwn(expected,'planning')?1:0);
      });
    }
    await store.close();
  }finally{database.cleanup();}
});

test('a planning-only commit by another initialized owner is preserved before the next core dispatch',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database),first=await Store.open('personal','America/Bogota',()=>now);
    const created=await first.dispatch({type:'createActivity',name:'Leer',emoji:'📖',color:'#DCCFFF'});
    const other=await Store.open('personal','America/Bogota',()=>now),command=reminderCommand(created.result.activityId!);
    await other.dispatchPlanning(command);await other.close();
    const result=await first.dispatch({type:'updateSettings',changes:{theme:'dark'}});
    assert.equal(domain.getPlanning(result.state).reminders.length,1);
    assert.equal(domain.getPlanning(result.state).reminders[0].id,command.id);
    assert.equal(domain.canonicalize(result.state),domain.canonicalize((await first.inspect(await first.backup())).state));await first.close();
  }finally{database.cleanup();}
});

test('opening a complete physical v1 dataset migrates it to v2 while preserving all audit rows and legacy backup shape',async()=>{
  const database=realSqlite();
  try{
    const {DailoopStore:Store}=storeModule(database),store=await Store.open('personal','America/Bogota',()=>now);
    const activity=await store.dispatch({type:'createActivity',name:'Anterior a recordatorios',emoji:'📖',color:'#DCCFFF'});
    await store.dispatch({type:'createEntry',activityId:activity.result.activityId!,note:'Conservar este registro'});
    const before=await store.snapshot();await store.close();
    database.editActive(raw=>{
      raw.exec('DROP TABLE planning_events;DROP TABLE planning_meta;DELETE FROM schema_migrations WHERE version=2;PRAGMA user_version=1;');
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM operations').get()!.n,2);
      assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,1);
    });
    const upgraded=await Store.open('personal','America/Bogota',()=>now);
    assert.equal(domain.canonicalize(await upgraded.snapshot()),domain.canonicalize(before));
    database.editActive(raw=>{
      assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,2);
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()!.n,2);
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM entries').get()!.n,1);
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM entry_revisions').get()!.n,1);
    });
    const backup=await upgraded.inspect(await upgraded.backup());
    assert.equal(backup.backup.formatVersion,1);assert.equal(Object.hasOwn(backup.state,'planning'),false);await upgraded.close();
  }finally{database.cleanup();}
});
