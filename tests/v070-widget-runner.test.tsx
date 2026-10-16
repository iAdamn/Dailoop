import { createEmptyState,execute,validateState,type Command,type DomainState } from '../src/domain';
import type { NativeAction } from '../src/infrastructure/widgetActions';
const now=Date.parse('2026-10-16T15:00:00Z');
const id=(n:number)=>`71000000-0000-4000-9000-${String(n).padStart(12,'0')}`;
let mockState:DomainState;
let mockPending:NativeAction[]=[];
let mockSerial=100;
const mockRegister=jest.fn();const mockPublish=jest.fn<Promise<void>,[DomainState,string]>(async()=>undefined);
const mockFinish=jest.fn(async(id:string,ok:boolean)=>{if(ok)mockPending=mockPending.filter(action=>action.id!==id);});
const mockDiscard=jest.fn(async(id:string)=>{mockPending=mockPending.filter(action=>action.id!==id);});
const mockSubscribe=jest.fn<()=>void,[()=>void]>(()=>()=>{});
const mockDispatch=jest.fn(async(command:Command,operationId:string,guard?:(state:DomainState)=>void)=>{
  guard?.(mockState);mockState=execute(mockState,command,{operationId,nowMs:now,nextId:()=>id(mockSerial++)}).state;
});
const mockSession={
  init:jest.fn(async()=>undefined),
  snapshot:{state:null as DomainState|null,mode:'personal' as 'personal'|'demo',readOnly:false,reloading:false,recoveryRequired:false},
  store:{mode:'personal' as 'personal'|'demo',dispatch:mockDispatch},
  refresh:jest.fn(async()=>{mockSession.snapshot.state=mockState;}),
};
jest.mock('react-native',()=>({Platform:{OS:'android'},AppRegistry:{registerHeadlessTask:(...args:unknown[])=>mockRegister(...args)}}));
jest.mock('../src/infrastructure/session',()=>({session:mockSession}));
jest.mock('../src/infrastructure/preferences',()=>({presentationPreferences:{load:async()=>({language:'pt'})}}));
jest.mock('../src/infrastructure/widgets',()=>({
  pendingWidgetActions:async()=>[...mockPending],finishWidgetAction:(...args:[string,boolean])=>mockFinish(...args),
  discardWidgetAction:(id:string)=>mockDiscard(id),
  publishWidgetSnapshot:(...args:[DomainState,string])=>mockPublish(...args),subscribeWidgetActions:(...args:[()=>void])=>mockSubscribe(...args),
}));
beforeEach(()=>{
  jest.resetModules();delete(globalThis as typeof globalThis&{__dailoopWidgetRunner?:unknown}).__dailoopWidgetRunner;
  mockState=execute(createEmptyState({databaseId:id(1),nowMs:now-1000}),{type:'createActivity',name:'Leer',emoji:'📚',color:'#DCCFFF',id:id(2)},{operationId:id(3),nowMs:now-1000,nextId:()=>id(4)}).state;
  mockPending=[{id:id(20),kind:'record',activityId:id(2),databaseId:id(1),occurredAtMs:now-500}];mockSerial=100;
  mockSession.snapshot={state:mockState,mode:'personal',readOnly:false,reloading:false,recoveryRequired:false};
  jest.clearAllMocks();
});
function tasks(){return jest.requireActual('../src/infrastructure/widgetTasks') as typeof import('../src/infrastructure/widgetTasks');}
test('cold runner commits, refreshes, reconciles notifications and publishes localized widget before acknowledgement',async()=>{
  const reconcile=jest.fn(async()=>{expect(mockState.entries).toHaveLength(1);expect(mockFinish).not.toHaveBeenCalled();});
  const runner=tasks();runner.registerWidgetTasks(undefined,reconcile);await runner.runWidgetActions();
  expect(mockRegister).toHaveBeenCalledWith('DailoopNativeActions',expect.any(Function));expect(mockSession.init).toHaveBeenCalled();expect(reconcile).toHaveBeenCalledTimes(1);
  expect(mockPublish).toHaveBeenCalledWith(mockState,'pt');expect(mockFinish).toHaveBeenCalledWith(id(20),true);expect(mockPending).toHaveLength(0);validateState(mockState);
});
test('post-commit notification failure retains the same operation and retries without a phantom second entry',async()=>{
  const reconcile=jest.fn<Promise<void>,[]>(async()=>undefined).mockRejectedValueOnce(new Error('Notification scheduling unavailable'));
  const runner=tasks();runner.registerWidgetTasks(undefined,reconcile);await runner.runWidgetActions();
  expect(mockState.entries).toHaveLength(1);expect(mockPending).toHaveLength(1);expect(mockFinish).toHaveBeenLastCalledWith(id(20),false);expect(mockPublish).not.toHaveBeenCalled();
  await runner.runWidgetActions();expect(mockState.entries).toHaveLength(1);expect(mockState.operations).toHaveLength(2);expect(mockPending).toHaveLength(0);expect(mockFinish).toHaveBeenLastCalledWith(id(20),true);validateState(mockState);
});
test('lost native acknowledgement after commit also retries the same audited registration',async()=>{
  mockFinish.mockRejectedValueOnce(new Error('Native bridge interrupted'));
  const runner=tasks();runner.registerWidgetTasks();await runner.runWidgetActions();
  expect(mockState.entries).toHaveLength(1);expect(mockPending).toHaveLength(1);
  await runner.runWidgetActions();expect(mockState.entries).toHaveLength(1);expect(mockPending).toHaveLength(0);validateState(mockState);
});
test('concurrent foreground and Headless signals share one runner and do not duplicate a tap',async()=>{
  const runner=tasks();runner.registerWidgetTasks();runner.registerWidgetTasks();
  await Promise.all([runner.runWidgetActions(),runner.runWidgetActions()]);
  expect(mockRegister).toHaveBeenCalledTimes(1);expect(mockSubscribe).toHaveBeenCalledTimes(1);expect(mockState.entries).toHaveLength(1);expect(mockDispatch).toHaveBeenCalledTimes(1);
});
test('demo and stale datasets remain untouched and no widget success is reported',async()=>{
  const original=mockState;mockSession.snapshot.mode='demo';const runner=tasks();runner.registerWidgetTasks();await runner.runWidgetActions();
  expect(mockDispatch).not.toHaveBeenCalled();expect(mockState).toBe(original);expect(mockFinish).toHaveBeenCalledWith(id(20),false);expect(mockPending).toHaveLength(1);
});
test('permanently missing activity is discarded without a phantom entry or success acknowledgement',async()=>{
  mockPending[0].activityId=id(999);const runner=tasks();runner.registerWidgetTasks();await runner.runWidgetActions();
  expect(mockState.entries).toHaveLength(0);expect(mockDispatch).not.toHaveBeenCalled();expect(mockDiscard).toHaveBeenCalledWith(id(20));expect(mockFinish).not.toHaveBeenCalled();expect(mockPending).toHaveLength(0);
  await runner.runWidgetActions();expect(mockDiscard).toHaveBeenCalledTimes(1);
});
test('old dataset actions are dropped and temporary lifecycle guards stay queued for later retry',async()=>{
  mockPending[0].databaseId=id(999);const runner=tasks();runner.registerWidgetTasks();await runner.runWidgetActions();
  expect(mockDiscard).toHaveBeenCalledWith(id(20));expect(mockPending).toHaveLength(0);expect(mockState.entries).toHaveLength(0);
  mockPending=[{id:id(21),kind:'record',activityId:id(2),databaseId:id(1),occurredAtMs:now-500}];mockSession.snapshot.reloading=true;
  await runner.runWidgetActions();expect(mockPending).toHaveLength(1);expect(mockFinish).toHaveBeenLastCalledWith(id(21),false);expect(mockDiscard).toHaveBeenCalledTimes(1);
  mockSession.snapshot.reloading=false;await runner.runWidgetActions();expect(mockState.entries).toHaveLength(1);expect(mockPending).toHaveLength(0);expect(mockFinish).toHaveBeenLastCalledWith(id(21),true);
});
test('a terminal reminder error is discarded while its transient storage error stays durable',async()=>{
  const runner=tasks();const {NativeActionUnavailableError}=jest.requireActual('../src/infrastructure/widgetActions') as typeof import('../src/infrastructure/widgetActions');
  const reminder:NativeAction={id:id(22),kind:'reminder-skip',databaseId:id(1),activityId:id(2),reminderId:id(5),dueAtMs:now,occurredAtMs:now};mockPending=[reminder];
  const handler=jest.fn<Promise<void>,[NativeAction]>(async()=>undefined).mockRejectedValueOnce(new Error('Disk busy')).mockRejectedValueOnce(new NativeActionUnavailableError());
  runner.registerWidgetTasks(handler);await runner.runWidgetActions();expect(mockPending).toHaveLength(1);expect(mockFinish).toHaveBeenCalledWith(id(22),false);expect(mockDiscard).not.toHaveBeenCalled();
  await runner.runWidgetActions();expect(mockDiscard).toHaveBeenCalledWith(id(22));expect(mockPending).toHaveLength(0);expect(mockState.entries).toHaveLength(0);
});
