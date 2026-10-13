import React,{useState} from 'react';
import {Pressable,ScrollView,Text} from 'react-native';
import {DailoopStore} from '../src/infrastructure/store';
import {canonicalize,effectiveEntries,selectActivities} from '../src/domain';
import {uuid} from '../src/infrastructure/crypto';
import * as SQLite from 'expo-sqlite';

// Test-only route, excluded by behavior in release. Always runs on the isolated demo dataset.
export default function StorageTests(){
  const [result,setResult]=useState('Pendiente');
  const [busy,setBusy]=useState(false);
  async function run(kind:'contract'|'prepared'|'activated'|'uncertain'|'reopen'){
    setBusy(true);setResult('Ejecutando');let store:DailoopStore|undefined;let inject=false;
    try {
      store=await DailoopStore.open('demo','America/Bogota',Date.now,async point=>{
        if(kind==='uncertain'&&(point==='registry-ready'||point==='rollback-ready'))throw new Error('Injected registry write failure');
        if(inject && point==='before-commit')throw new Error('Injected storage failure');
        if((kind==='prepared'&&point==='restore-prepared')||(kind==='activated'&&point==='restore-activated')){
          setResult(JSON.stringify({paused:point}));await new Promise<void>(()=>{});
        }
      });
      if(kind==='reopen'){
        const state=await store.snapshot();setResult(JSON.stringify({reopened:true,activities:selectActivities(state,{includeArchived:true}).map(a=>a.name),entries:effectiveEntries(state).length}));return;
      }
      const id=uuid();await store.dispatch({type:'createActivity',id,name:'Storage contract',emoji:'📚',color:'#DCCFFF'});
      const operationId=uuid();const command={type:'createEntry' as const,activityId:id};
      const first=await store.dispatch(command,operationId);await store.dispatch(command,operationId);await store.dispatch(command);
      const two=(await store.snapshot()).entries.filter(e=>e.activityId===id).length===2;
      await store.dispatch({type:'correctEntry',entryId:first.result.entryId!,note:'Corrección conservada'});
      await store.dispatch({type:'voidEntry',entryId:first.result.entryId!});await store.dispatch({type:'restoreEntry',entryId:first.result.entryId!});
      const before=canonicalize(await store.snapshot());inject=true;
      let rollback=false;try{await store.dispatch(command);}catch{rollback=canonicalize(await store.snapshot())===before;}finally{inject=false;}
      const text=await store.backup();const candidate=await store.inspect(text);
      await store.dispatch({type:'createActivity',name:'Extra before restore',emoji:'🌱',color:'#8FD8FF'});
      if(kind==='uncertain'){
        let failed=false;try{await store.restore(candidate);}catch{failed=store.recoveryRequired;}
        let blocked=false;try{await store.dispatch(command);}catch{blocked=true;}
        await store.close();store=await DailoopStore.open('demo','America/Bogota');
        const recovered=canonicalize(await store.snapshot())===canonicalize(candidate.state);
        setResult(JSON.stringify({failed,blocked,recovered}));return;
      }
      await store.restore(candidate);await store.restore(candidate);
      const restored=canonicalize(await store.snapshot())===canonicalize(candidate.state);
      await store.close();
      const registry=await SQLite.openDatabaseAsync('dailoop-registry-v1.db');
      const record=await registry.getFirstAsync<{active:string}>('SELECT active FROM datasets WHERE scope=?','demo');
      await registry.closeAsync();
      const raw=await SQLite.openDatabaseAsync(record!.active);
      // Keep matching revision IDs: corruption must be detected in every derived field.
      await raw.execAsync("UPDATE entry_current SET state='void',occurred_at_ms=1,json='{}'; UPDATE activity_current SET json='{}';");
      await raw.closeAsync();
      store=await DailoopStore.open('demo','America/Bogota');
      const reopened=canonicalize(await store.snapshot())===canonicalize(candidate.state);
      await store.close();
      const repaired=await SQLite.openDatabaseAsync(record!.active);
      const remaining=await repaired.getFirstAsync<{n:number}>("SELECT COUNT(*) n FROM entry_current WHERE json='{}' OR occurred_at_ms=1 OR state='void'");
      const remainingActivities=await repaired.getFirstAsync<{n:number}>("SELECT COUNT(*) n FROM activity_current WHERE json='{}'");
      await repaired.closeAsync();
      store=await DailoopStore.open('demo','America/Bogota');
      setResult(JSON.stringify({two,idempotency:two,rollback,restore:restored,reopen:reopened,projectionRepair:remaining?.n===0&&remainingActivities?.n===0,audit:effectiveEntries(await store.snapshot()).some(e=>e.revision.revisionNo===4)}));
    }catch(e){setResult(JSON.stringify({error:e instanceof Error?e.message:String(e)}));}
    finally{await store?.close().catch(()=>{});setBusy(false);}
  }
  if(!__DEV__)return <Text>Ruta no disponible.</Text>;
  return <ScrollView contentContainerStyle={{padding:30,gap:20}}><Text>Dailoop · Contratos de almacenamiento Web</Text>{(['contract','prepared','activated','uncertain','reopen'] as const).map(kind=><Pressable key={kind} disabled={busy} accessibilityRole="button" onPress={()=>run(kind)} style={{padding:16,backgroundColor:'#DCCFFF'}}><Text>{kind}</Text></Pressable>)}<Text testID="storage-result" selectable>{result}</Text></ScrollView>;
}
