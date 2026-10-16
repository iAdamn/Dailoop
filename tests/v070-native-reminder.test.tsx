import { createEmptyState,execute,applyPlanning,getPlanning,validateState,type DomainState,type PlanningCommand } from '../src/domain';
import { notificationPlan } from '../src/infrastructure/notificationPlan';
import type { NativeAction } from '../src/infrastructure/widgetActions';
import { NativeActionUnavailableError } from '../src/infrastructure/widgetActions';
import { processReminderAction,reconcileNativeNotifications } from '../src/infrastructure/reminderActions';
import * as Notifications from 'expo-notifications';
import type { PlannedNotification } from '../src/infrastructure/notificationPlan';
import { Platform } from 'react-native';
function synchronizeNative(...args:Parameters<typeof import('../src/infrastructure/notifications.native')['synchronizeNotificationPlan']>):Promise<void>{
  const actual=jest.requireActual('../src/infrastructure/notifications.native') as typeof import('../src/infrastructure/notifications.native');
  return actual.synchronizeNotificationPlan(...args);
}

const NOW=Date.parse('2026-10-16T15:00:00Z');
const id=(n:number)=>`72000000-0000-4000-9000-${String(n).padStart(12,'0')}`;
let mockState:DomainState;
let mockSerial=100;
let mockWriteError:Error|null=null;
let mockBeforeSnapshot:(()=>void)|undefined;
const mockSync=jest.fn<Promise<void>,unknown[]>(async()=>undefined);
const mockDismiss=jest.fn(async(_id:string)=>undefined);
let mockPreferences={language:'en',sensory:{sounds:false,notificationSounds:true}};
const mockPlanning=jest.fn(async(command:PlanningCommand,operationId:string,guard?:(current:DomainState)=>void)=>{
  guard?.(mockState);if(mockWriteError)throw mockWriteError;
  mockState={...mockState,planning:applyPlanning(mockState,command,{operationId,nowMs:Date.now(),nextId:()=>id(mockSerial++)})};
});
const mockComplete=jest.fn(async(reminderId:string,operationId:string,dueAtMs:number,guard?:(current:DomainState)=>void)=>{
  guard?.(mockState);if(mockWriteError)throw mockWriteError;
  const reminder=getPlanning(mockState).reminders.find(value=>value.id===reminderId)!;
  const entryId=reminder.recurrence?id(mockSerial++):reminder.completionEntryId;
  mockState=execute(mockState,{type:'createEntry',activityId:reminder.activityId,id:entryId},{operationId,nowMs:Date.now(),nextId:()=>id(mockSerial++)}).state;
  if(reminder.recurrence)mockState={...mockState,planning:applyPlanning(mockState,{type:'linkReminderOccurrence',reminderId,dueAtMs,entryId},{operationId:id(mockSerial++),nowMs:Date.now(),nextId:()=>id(mockSerial++)})};
});
const mockStore={snapshot:jest.fn(async()=>{mockBeforeSnapshot?.();return mockState;}),dispatchPlanning:mockPlanning,completeReminder:mockComplete};
const mockSession={
  store:mockStore as typeof mockStore|null,
  snapshot:{state:null as DomainState|null,mode:'personal' as 'personal'|'demo',readOnly:false,reloading:false,recoveryRequired:false},
  refresh:jest.fn(async()=>{mockSession.snapshot.state=mockState;}),
};
jest.mock('../src/infrastructure/session',()=>({get session(){return mockSession;}}));
jest.mock('../src/infrastructure/notifications',()=>({synchronizeNotificationPlan:(...args:unknown[])=>mockSync(...args),dismissNativeNotification:(id:string)=>mockDismiss(id)}));
jest.mock('../src/infrastructure/preferences',()=>({presentationPreferences:{load:async()=>mockPreferences},sensoryPreferences:(value:{sensory:unknown})=>value.sensory}));
jest.mock('expo-notifications',()=>({
  AndroidImportance:{DEFAULT:3},AndroidNotificationVisibility:{PRIVATE:0},SchedulableTriggerInputTypes:{DATE:'date',WEEKLY:'weekly'},
  setNotificationHandler:jest.fn(),setNotificationCategoryAsync:jest.fn(async()=>undefined),setNotificationChannelAsync:jest.fn(async()=>undefined),
  getPermissionsAsync:jest.fn(async()=>({granted:true,status:'granted'})),getAllScheduledNotificationsAsync:jest.fn(async()=>[]),
  cancelScheduledNotificationAsync:jest.fn(async()=>undefined),scheduleNotificationAsync:jest.fn(async()=>''),requestPermissionsAsync:jest.fn(),
}));
function fixture(weekly=false){
  let state=execute(createEmptyState({databaseId:id(1),nowMs:NOW-1000,zone:'America/Bogota'}),{type:'createActivity',id:id(2),name:'Leer',emoji:'📚',color:'#DCCFFF'},{operationId:id(3),nowMs:NOW-1000,nextId:()=>id(4)}).state;
  state={...state,planning:applyPlanning(state,{type:'createReminder',id:id(5),activityId:id(2),completionEntryId:id(6),dueAtMs:NOW+3_600_000,leadMinutes:[30,0],notifications:true,...(weekly?{recurrence:{weekdays:[5],hour:11,minute:0,zone:'America/Bogota'}}:{})},{operationId:id(7),nowMs:NOW-1000,nextId:()=>id(8)})};
  return state;
}
function response(kind:NativeAction['kind']='reminder-done'):NativeAction {
  const planned=notificationPlan(mockState,NOW)[0];
  return{...planned.data,id:id(20),kind,databaseId:id(1),activityId:id(2),reminderId:id(5),dueAtMs:planned.data.dueAtMs!,occurredAtMs:Date.now(),deliveredAtMs:planned.fireAtMs,notificationIdentifier:planned.identifier,...(kind==='reminder-snooze'?{minutes:30 as const}:{})};
}
beforeEach(()=>{
  jest.spyOn(Date,'now').mockReturnValue(NOW+1_800_000);mockState=fixture();mockSerial=100;mockWriteError=null;mockBeforeSnapshot=undefined;
  mockSession.store=mockStore;mockSession.snapshot={state:mockState,mode:'personal',readOnly:false,reloading:false,recoveryRequired:false};
  mockPreferences={language:'en',sensory:{sounds:false,notificationSounds:true}};jest.clearAllMocks();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({granted:true,status:'granted'} as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([]);
});
afterEach(()=>jest.restoreAllMocks());

test('native done binds the exact notification occurrence, writes one audited entry and retries after ack loss',async()=>{
  const action=response();await processReminderAction(action);await processReminderAction(action);
  expect(mockComplete).toHaveBeenCalledTimes(1);expect(mockComplete).toHaveBeenCalledWith(id(5),id(20),NOW+3_600_000,expect.any(Function));
  expect(mockState.entries).toHaveLength(1);expect(mockPlanning).not.toHaveBeenCalled();validateState(mockState);
  expect(mockDismiss).toHaveBeenCalledWith(action.notificationIdentifier);
});
test.each(['reminder-snooze','reminder-skip'] as const)('%s appends planning only and exact replay does not create a second event',async kind=>{
  const action=response(kind);await processReminderAction(action);await processReminderAction(action);
  expect(mockPlanning).toHaveBeenCalledTimes(1);expect(mockState.entries).toHaveLength(0);expect(mockComplete).not.toHaveBeenCalled();
  expect(mockPlanning).toHaveBeenCalledWith(kind==='reminder-snooze'?{type:'snoozeReminderOccurrence',reminderId:id(5),dueAtMs:NOW+3_600_000,snoozedUntilMs:action.occurredAtMs+30*60_000}:{type:'skipReminderOccurrence',reminderId:id(5),dueAtMs:NOW+3_600_000},id(20),expect.any(Function));validateState(mockState);
});
test('write rejection leaves all canonical rows unchanged and succeeds with the same operation on retry',async()=>{
  const before=mockState;const action=response('reminder-skip');mockWriteError=new Error('Disk unavailable');
  await expect(processReminderAction(action)).rejects.toThrow('Disk unavailable');expect(mockState).toBe(before);expect(mockSession.refresh).not.toHaveBeenCalled();
  expect(mockDismiss).not.toHaveBeenCalled();
  mockWriteError=null;await processReminderAction(action);expect(mockState.entries).toHaveLength(0);expect(mockState.planning!.events).toHaveLength(2);validateState(mockState);
});
test.each([{mode:'demo' as const},{readOnly:true},{reloading:true},{recoveryRequired:true}])('unsafe context refuses notification actions without writes: %p',async flags=>{
  mockSession.snapshot={...mockSession.snapshot,...flags};await expect(processReminderAction(response())).rejects.toThrow();expect(mockComplete).not.toHaveBeenCalled();expect(mockPlanning).not.toHaveBeenCalled();
});
test('dataset/session switching while snapshot is awaited fails the guard before a write',async()=>{
  const action=response('reminder-skip');mockBeforeSnapshot=()=>{mockSession.snapshot.mode='demo';};await expect(processReminderAction(action)).rejects.toThrow('Native dataset changed');
  expect(mockPlanning).not.toHaveBeenCalled();expect(mockState.entries).toHaveLength(0);
});
test('missing activity metadata, stale schedule and wrong database reject rather than completing another activity',async()=>{
  const action=response();
  for(const invalid of [{...action,activityId:undefined},{...action,databaseId:id(50)},{...action,dueAtMs:action.dueAtMs!+60_000},{...action,reminderId:id(51)}])await expect(processReminderAction(invalid)).rejects.toThrow();
  expect(mockComplete).not.toHaveBeenCalled();expect(mockPlanning).not.toHaveBeenCalled();
});
test('a repeating notification uses the actual later delivery week, even when tapped after that due time',async()=>{
  mockState=fixture(true);mockSession.snapshot.state=mockState;const action=response();
  const delivered=NOW+7*86_400_000+1_800_000;action.deliveredAtMs=delivered;action.occurredAtMs=delivered+3_600_000;
  jest.spyOn(Date,'now').mockReturnValue(action.occurredAtMs);
  await processReminderAction(action);await processReminderAction(action);
  expect(mockComplete).toHaveBeenCalledTimes(1);expect(mockComplete).toHaveBeenCalledWith(id(5),id(20),NOW+7*86_400_000+3_600_000,expect.any(Function));expect(mockState.entries).toHaveLength(1);validateState(mockState);
});
test('edited recurrence metadata and excessively delayed weekly deliveries fail closed',async()=>{
  mockState=fixture(true);mockSession.snapshot.state=mockState;const action=response();
  for(const invalid of [{...action,recurrenceHour:12},{...action,recurrenceZone:'UTC'},{...action,deliveredAtMs:action.deliveredAtMs!+3*3_600_000}])await expect(processReminderAction(invalid)).rejects.toBeInstanceOf(NativeActionUnavailableError);
  expect(mockComplete).not.toHaveBeenCalled();
});
test('an expired queued snooze is terminal rather than retained forever as a storage retry',async()=>{
  const action=response('reminder-snooze');action.occurredAtMs=NOW-60*60_000;
  await expect(processReminderAction(action)).rejects.toBeInstanceOf(NativeActionUnavailableError);
  expect(mockState.entries).toHaveLength(0);expect(mockState.planning!.events).toHaveLength(1);
});
test('post-commit reconcile derives a new local schedule without asking permission or touching account data',async()=>{
  await processReminderAction(response('reminder-skip'));await reconcileNativeNotifications();
  expect(mockSync).toHaveBeenCalledTimes(1);expect(mockSync.mock.calls[0][0]).toEqual([]);expect(mockSync.mock.calls[0][1]).toBe('en');
  mockSync.mockClear();mockSession.snapshot.mode='demo';await reconcileNativeNotifications();expect(mockSync).not.toHaveBeenCalled();
});
test('notification categories expose three background-only actions and attach only to reminder notifications',async()=>{
  const plan=notificationPlan(mockState,NOW);const streak:PlannedNotification={identifier:'dailoop:streak:test',fireAtMs:NOW+60000,title:'Racha',body:'Prueba',data:{databaseId:id(1),activityId:id(2),kind:'streak'}};
  await synchronizeNative([...plan,streak],'en',false);
  const category=jest.mocked(Notifications.setNotificationCategoryAsync).mock.calls[0];
  expect(category[0]).toBe('dailoop.v070.actions');expect(category[1].map(item=>item.identifier)).toEqual(['dailoop.v070.done','dailoop.v070.snooze30','dailoop.v070.skip']);
  expect(category[1].every(item=>item.options?.opensAppToForeground===false)).toBe(true);
  const requests=jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.map(call=>call[0]);
  expect(requests.find(value=>value.identifier===plan[0].identifier)?.content.categoryIdentifier).toBe('dailoop.v070.actions');
  expect(requests.find(value=>value.identifier===streak.identifier)?.content.categoryIdentifier).toBeUndefined();
  expect(requests.every(value=>value.content.sound===false)).toBe(true);expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('silent and audible channels are distinct, so changing sound replaces immutable Android channel selection',async()=>{
  jest.replaceProperty(Platform,'OS','android');
  const plan=notificationPlan(mockState,NOW);await synchronizeNative(plan,'pt',false);
  expect(Notifications.setNotificationChannelAsync).toHaveBeenLastCalledWith('dailoop-reminders-silent-v070',expect.objectContaining({sound:null,enableVibrate:false,lockscreenVisibility:0}));
  const first=jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.map(call=>call[0]);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue(first as Notifications.NotificationRequest[]);
  await synchronizeNative(plan,'pt',true);
  expect(Notifications.setNotificationChannelAsync).toHaveBeenLastCalledWith('dailoop-reminders-sound-v070',expect.objectContaining({sound:'default'}));
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(plan[0].identifier);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({content:expect.objectContaining({sound:'default'}),trigger:expect.objectContaining({channelId:'dailoop-reminders-sound-v070'})}));
});
test('permission denied cancels only Dailoop requests, schedules nothing and does not request permission',async()=>{
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({granted:false,status:'denied'} as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([{identifier:'dailoop:old',content:{}},{identifier:'unrelated:keep',content:{}}] as Notifications.NotificationRequest[]);
  await synchronizeNative(notificationPlan(mockState,NOW),'es',false);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('dailoop:old');expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('unrelated:keep');
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
