import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyState, execute, selectActivities, validateState, type Command, type DomainState } from '../src/domain';
import { NativeActionUnavailableError, processWidgetAction, validateNativeAction, widgetEntryId, type NativeAction, type WidgetActionPort } from '../src/infrastructure/widgetActions';
import { widgetProjection } from '../src/infrastructure/widgetProjection';

const now=Date.parse('2026-10-16T15:00:00Z');
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function seed():DomainState {
  return execute(createEmptyState({databaseId:id(1),nowMs:now,zone:'America/Bogota'}),{type:'createActivity',id:id(10),name:'Leer',emoji:'📚',color:'#DCCFFF'}, {operationId:id(2),nowMs:now,nextId:()=>id(3)}).state;
}
const action=():NativeAction=>({id:id(20),kind:'record',databaseId:id(1),activityId:id(10),occurredAtMs:now-1000});
function harness(initial=seed()) {
  let state=initial;let mode:'personal'|'demo'='personal';let refreshes=0;let dispatched=0;let serial=100;
  const port:WidgetActionPort={context:()=>({state,mode,readOnly:false}),dispatch:async(command,operationId,databaseId)=>{
    assert.equal(databaseId,state.meta.databaseId);dispatched++;
    state=execute(state,command,{operationId,nowMs:now,nextId:()=>id(serial++)}).state;
  },refresh:async()=>{refreshes++;}};
  return {port,get state(){return state;},get refreshes(){return refreshes;},get dispatched(){return dispatched;},setMode(value:'personal'|'demo'){mode=value;},setState(value:DomainState){state=value;}};
}
test('widget records through audited domain, preserves tap time and replays safely after native ack loss',async()=>{
  const h=harness();await processWidgetAction(action(),h.port);await processWidgetAction(action(),h.port);
  assert.equal(h.state.entries.length,1);assert.equal(h.state.operations.length,2);assert.equal(h.refreshes,2);
  assert.equal(h.state.entries[0].id,widgetEntryId(action().id));assert.notEqual(h.state.entries[0].id,action().id);
  assert.equal(h.state.entryRevisions[0].occurredAtMs,now-1000);validateState(h.state);
});
test('a retry with changed intent is rejected rather than rewriting the first registration',async()=>{
  const h=harness();await processWidgetAction(action(),h.port);
  await assert.rejects(processWidgetAction({...action(),occurredAtMs:now-500},h.port));
  assert.equal(h.state.entries.length,1);validateState(h.state);
});
test('committed action can be acknowledged after activity archival without duplicating or restoring anything',async()=>{
  const h=harness();await processWidgetAction(action(),h.port);
  h.setState(execute(h.state,{type:'updateActivity',activityId:id(10),changes:{isArchived:true}},{operationId:id(31),nowMs:now,nextId:()=>id(32)}).state);
  await processWidgetAction(action(),h.port);assert.equal(h.state.entries.length,1);assert.equal(selectActivities(h.state).length,0);validateState(h.state);
});
test('demo, read-only, reload, recovery and different dataset cannot register from a stale widget',async()=>{
  for(const override of [{mode:'demo' as const},{readOnly:true},{reloading:true},{recoveryRequired:true},{state:{...seed(),meta:{...seed().meta,databaseId:id(30)}}},{state:null}]){
    let calls=0;const port:WidgetActionPort={context:()=>({state:seed(),mode:'personal',readOnly:false,...override}),dispatch:async()=>{calls++;},refresh:async()=>{calls++;}};
    await assert.rejects(processWidgetAction(action(),port));assert.equal(calls,0);
  }
});
test('archived or missing activities are rejected without creating entries',async()=>{
  const h=harness();h.setState(execute(h.state,{type:'updateActivity',activityId:id(10),changes:{isArchived:true}},{operationId:id(31),nowMs:now,nextId:()=>id(32)}).state);
  await assert.rejects(processWidgetAction(action(),h.port),NativeActionUnavailableError);assert.equal(h.state.entries.length,0);assert.equal(h.dispatched,0);
  const other={...action(),activityId:id(40)};await assert.rejects(processWidgetAction(other,h.port));
});
test('native reminder commands use the injected handler and never synthesize a core entry',async()=>{
  const h=harness();const received:NativeAction[]=[];
  for(const kind of ['reminder-done','reminder-skip','reminder-snooze'] as const){
    const value:NativeAction={id:id(51),kind,databaseId:id(1),reminderId:id(50),dueAtMs:now,occurredAtMs:now,minutes:30};
    await processWidgetAction(value,h.port,async item=>{received.push(item);});
  }
  assert.equal(received.length,3);assert.equal(h.dispatched,0);assert.equal(h.state.entries.length,0);assert.equal(h.refreshes,3);
  await assert.rejects(processWidgetAction({...action(),kind:'reminder-skip',reminderId:id(50),dueAtMs:now},h.port));
});
test('validation rejects corrupt IDs, unknown actions, unsafe timestamps and unsupported snooze/weekly data',()=>{
  const good=action();assert.equal(validateNativeAction(good),good);
  for(const value of [null,[],{...good,id:'token'},{...good,kind:'delete'}, {...good,occurredAtMs:Infinity},{...good,occurredAtMs:-1},{...good,activityId:id(2).replace('4000','0000')},{...good,kind:'reminder-snooze',reminderId:id(5),dueAtMs:now,minutes:15},{...good,weeklyOccurrence:'yes'},{...good,recurrenceHour:24},{...good,deliveredAtMs:NaN},{...good,notificationIdentifier:'foreign'}])assert.throws(()=>validateNativeAction(value));
});
test('widget projection contains only selected presentation fields, preserves private choice and drops archived/voided records',()=>{
  let state=seed();let serial=1000;
  const apply=(command:Command)=>{state=execute(state,command,{operationId:id(serial++),nowMs:now,nextId:()=>id(serial++)}).state;};
  apply({type:'updateActivity',activityId:id(10),changes:{isPrivate:true}});
  apply({type:'createEntry',activityId:id(10),id:id(90),occurredAtMs:now-3600000,note:'PRIVATE NOTE MUST NOT LEAK'});
  apply({type:'createEntry',activityId:id(10),id:id(91),occurredAtMs:now-1000});
  apply({type:'voidEntry',entryId:id(91)});
  const projection=widgetProjection(state,'en');
  assert.equal(projection.activities.length,1);assert.equal(projection.activities[0].isPrivate,true);
  assert.match(projection.activities[0].last,/9:00/);assert.equal(projection.copy.record,'Record');
  assert.doesNotMatch(JSON.stringify(projection),/PRIVATE NOTE|operations|entryRevisions|token|password|refreshToken/);
  assert.deepEqual(Object.keys(projection.activities[0]).sort(),['emoji','id','isPrivate','last','name']);
  apply({type:'updateActivity',activityId:id(10),changes:{isArchived:true}});assert.deepEqual(widgetProjection(state,'es').activities,[]);
});
test('empty projection and localized labels remain valid in all three offline languages',()=>{
  const empty=createEmptyState({databaseId:id(1),nowMs:now});
  for(const language of ['es','en','pt'] as const){const projection=widgetProjection(empty,language);assert.equal(projection.language,language);assert.deepEqual(projection.activities,[]);assert.ok(projection.copy.visible.length>20);}
  assert.equal(selectActivities(empty).length,0);
});
