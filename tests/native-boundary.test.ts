import { APP_VERSION } from '../src/version';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import * as domain from '../src/domain';
import { migrate } from '../src/infrastructure/schema';
import type { DailoopStore } from '../src/infrastructure/store';
import { deviceTimeZone } from '../src/infrastructure/deviceTimeZone';

const now=Date.parse('2026-10-13T17:00:00Z');
const digest=async(value:string)=>createHash('sha256').update(value).digest('hex');
function loadModule(path:string,dependencies:Record<string,unknown>,globals:Record<string,unknown>={}){
  const source=ts.transpileModule(readFileSync(join(process.cwd(),path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{} as any};
  dependencies = { '../version': { APP_VERSION }, './deviceTimeZone': { deviceTimeZone }, ...dependencies };
  new Function('require','module','exports','globalThis','Intl',source)((name:string)=>{
    if(!(name in dependencies))throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  },module,module.exports,{},globals.Intl??Intl);
  return module.exports;
}

test('Android dispatch keeps foreign keys enabled on its initialized transaction connection',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'dailoop-native-sqlite-'));
  const handles=new Set<DatabaseSync>();let activeTransaction:DatabaseSync|undefined;
  const openDatabaseAsync=async(name:string):Promise<any>=>{
    // Expo native SQLite uses its compiled default (FK off) for each new connection.
    const raw=new DatabaseSync(join(directory,name),{enableForeignKeyConstraints:false});handles.add(raw);let closed=false;
    const transact=async(work:()=>Promise<void>)=>{
      raw.exec('BEGIN');activeTransaction=raw;
      try{await work();raw.exec('COMMIT');}catch(error){raw.exec('ROLLBACK');throw error;}finally{activeTransaction=undefined;}
    };
    const adapter={
      execAsync:async(sql:string)=>{raw.exec(sql);},
      runAsync:async(sql:string,...params:any[])=>raw.prepare(sql).run(...params),
      getFirstAsync:async(sql:string,...params:any[])=>raw.prepare(sql).get(...params)??null,
      getAllAsync:async(sql:string,...params:any[])=>raw.prepare(sql).all(...params),
      withTransactionAsync:transact,
      // Matches expo-sqlite57 Transaction.createAsync: fresh connection, BEGIN, callback.
      withExclusiveTransactionAsync:async(work:(db:any)=>Promise<void>)=>{
        const connection=await openDatabaseAsync(name);
        try{await connection.withTransactionAsync(()=>work(connection));}finally{await connection.closeAsync();}
      },
      closeAsync:async()=>{if(!closed){raw.close();handles.delete(raw);closed=true;}},
    };
    return adapter;
  };
  try{
    const {DailoopStore:Store}=loadModule('src/infrastructure/store.ts',{'react-native':{Platform:{OS:'android'}},'expo-sqlite':{openDatabaseAsync,deleteDatabaseAsync:async(name:string)=>rmSync(join(directory,name))},'../domain':domain,'./schema':{migrate},'./crypto':{digest,uuid:randomUUID}}) as {DailoopStore:typeof DailoopStore};
    let probes=0; let cancelAt:string|undefined; let syncAllowed=true;
    const store=await Store.open('personal','America/Bogota',()=>now,async(point)=>{
      if(point===cancelAt)syncAllowed=false;
      if(point!=='before-commit')return;
      probes++;assert.ok(activeTransaction);
      assert.equal(activeTransaction.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);
      assert.equal(activeTransaction.prepare('PRAGMA busy_timeout').get()!.timeout,4000);
      assert.throws(()=>activeTransaction!.prepare('INSERT INTO entries VALUES(?,?,?,?)').run(randomUUID(),randomUUID(),randomUUID(),'{}'),/FOREIGN KEY/);
    });
    const results=await Promise.all([
      store.dispatch({type:'createActivity',name:'Primera',emoji:'📚',color:'#DCCFFF'}),
      store.dispatch({type:'createActivity',name:'Segunda',emoji:'🌱',color:'#8FD8FF'}),
    ]);
    assert.equal(probes,2);assert.deepEqual(results.map(result=>domain.currentSequence(result.state)),[1,2]);
    const beforeSync=await store.snapshot();
    const expectedBeforeSync=await digest(domain.canonicalize(beforeSync));
    await store.dispatch({type:'createEntry',activityId:beforeSync.activities[0].id});
    await assert.rejects(store.applySync(beforeSync,expectedBeforeSync),{name:'SyncLocalChangedError'});
    const retained=await store.snapshot();
    assert.equal(retained.entries.length,1,'a local write during network must survive a stale cloud activation');
    const expected=await digest(domain.canonicalize(retained));
    const remote=domain.execute(retained,{type:'createEntry',activityId:retained.activities[0].id},{nowMs:now,operationId:randomUUID(),nextId:randomUUID}).state;
    await assert.rejects(store.applySync(remote,expected,()=>false),{name:'SyncLocalChangedError'});
    assert.equal(domain.canonicalize(await store.snapshot()),domain.canonicalize(retained));
    for(const point of ['restore-prepared','restore-activated','registry-ready']){
      cancelAt=point;syncAllowed=true;
      await assert.rejects(store.applySync(remote,expected,()=>syncAllowed),{name:'SyncLocalChangedError'});
      assert.equal(domain.canonicalize(await store.snapshot()),domain.canonicalize(retained),'cancellation at '+point+' must roll back to the exact original dataset');
    }
    cancelAt=undefined;
    await store.applySync(remote,expected,()=>true);
    const snapshot=await store.snapshot();
    assert.equal(domain.canonicalize(snapshot),domain.canonicalize(remote));
    assert.equal(snapshot.entries.length,2);await store.close();
    const reopened=await Store.open('personal','America/Bogota',()=>now);
    assert.equal(domain.canonicalize(await reopened.snapshot()),domain.canonicalize(snapshot));await reopened.close();
  }finally{for(const raw of handles)raw.close();rmSync(directory,{recursive:true,force:true});}
});

test('native session uses the OS calendar zone even when Intl fallback reports UTC',async()=>{
  const opened:string[]=[];
  const state=domain.createEmptyState({databaseId:randomUUID(),nowMs:now,zone:'America/Los_Angeles'});
  const store={mode:'personal',label:'native',recoveryRequired:false,snapshot:async()=>state,close:async()=>{}};
  const {session}=loadModule('src/infrastructure/session.ts',{'react-native':{Platform:{OS:'android'}},'expo-localization':{getCalendars:()=>[{timeZone:'America/Los_Angeles'}]},'../domain':domain,'./store':{DailoopStore:{open:async(_mode:string,zone:string)=>{opened.push(zone);return store;}},RECOVERY_MESSAGE:'Recarga para recuperar.'},'./crypto':{digest,uuid:randomUUID},'./files':{cleanExportCache:()=>{}}},{Intl:{DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:'UTC'})})}});
  await session.openMode('personal');assert.deepEqual(opened,['America/Los_Angeles']);
});

test('native bootstrap restores the OS default zone when FormatJS replaces Intl.DateTimeFormat',()=>{
  const script=`
    const {readFileSync}=require('node:fs');const ts=require('typescript');
    delete Intl.DateTimeFormat.prototype.formatRange;
    const source=ts.transpileModule(readFileSync('src/bootstrap.native.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module={exports:{}};
    new Function('require','module','exports',source)(name=>name==='expo-localization'?{getCalendars:()=>[{timeZone:'America/Los_Angeles'}]}:name==='./infrastructure/deviceTimeZone'?require('./src/infrastructure/deviceTimeZone.ts'):require(name),module,module.exports);
    console.log(JSON.stringify({polyfilled:typeof Intl.DateTimeFormat.__setDefaultTimeZone==='function',zone:new Intl.DateTimeFormat().resolvedOptions().timeZone}));
  `;
  const child=spawnSync(process.execPath,['--import','tsx','-e',script],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.trim()),{polyfilled:true,zone:'America/Los_Angeles'});
});
