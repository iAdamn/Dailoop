import { selectActivities, type Command, type DomainState } from '../domain';

export interface NativeAction {
  id:string; kind:'record'|'reminder-done'|'reminder-snooze'|'reminder-skip'; databaseId:string;
  activityId?:string; reminderId?:string; dueAtMs?:number; minutes?:10|30|60; occurredAtMs:number;
  deliveredAtMs?:number;notificationIdentifier?:string;weeklyOccurrence?:boolean;recurrenceWeekday?:number;
  leadMinutes?:number;recurrenceAnchorAtMs?:number;recurrenceZone?:string;recurrenceHour?:number;recurrenceMinute?:number;scheduledAtMs?:number;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** An obsolete target is terminal; storage/lifecycle failures must retain the original durable action. */
export class NativeActionUnavailableError extends Error {
  constructor(message='Native action unavailable'){super(message);this.name='NativeActionUnavailableError';}
}
export function validateNativeAction(value:unknown):NativeAction {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid native action');
  const action=value as NativeAction;
  if(!uuid.test(action.id)||!uuid.test(action.databaseId)||!Number.isSafeInteger(action.occurredAtMs)||action.occurredAtMs<0||action.occurredAtMs>8.64e15)throw new Error('Invalid native action');
  if(action.kind==='record'){if(!uuid.test(action.activityId??''))throw new Error('Invalid native activity');}
  else if(['reminder-done','reminder-snooze','reminder-skip'].includes(action.kind)) {
    if(!uuid.test(action.reminderId??'')||!Number.isSafeInteger(action.dueAtMs)||action.dueAtMs!<0||action.dueAtMs!>8.64e15)throw new Error('Invalid native reminder');
    if(action.kind==='reminder-snooze'&&![10,30,60].includes(action.minutes??0))throw new Error('Invalid snooze');
  } else throw new Error('Unknown native action');
  for(const key of ['deliveredAtMs','recurrenceAnchorAtMs','scheduledAtMs'] as const)if(action[key]!==undefined&&(!Number.isSafeInteger(action[key])||action[key]!<0||action[key]!>8.64e15))throw new Error('Invalid native time');
  if(action.notificationIdentifier!==undefined&&(typeof action.notificationIdentifier!=='string'||!action.notificationIdentifier.startsWith('dailoop:')||action.notificationIdentifier.length>1024))throw new Error('Invalid native notification');
  if(action.weeklyOccurrence!==undefined&&typeof action.weeklyOccurrence!=='boolean')throw new Error('Invalid native recurrence');
  for(const [key,min,max] of [['recurrenceWeekday',1,7],['recurrenceHour',0,23],['recurrenceMinute',0,59],['leadMinutes',0,525600]] as const)if(action[key]!==undefined&&(!Number.isInteger(action[key])||action[key]!<min||action[key]!>max))throw new Error('Invalid native recurrence');
  if(action.recurrenceZone!==undefined&&(typeof action.recurrenceZone!=='string'||action.recurrenceZone.length>128))throw new Error('Invalid native zone');
  return action;
}
/** Distinct deterministic UUID: a crash between SQLite commit and native ack cannot duplicate an entry. */
export function widgetEntryId(operationId:string):string {
  if(!uuid.test(operationId))throw new Error('Invalid native operation');
  return (parseInt(operationId[0],16)^8).toString(16)+operationId.slice(1).toLowerCase();
}
export interface WidgetActionPort {
  context():{state:DomainState|null;mode:'personal'|'demo';readOnly:boolean;reloading?:boolean;recoveryRequired?:boolean};
  dispatch(command:Command,operationId:string,databaseId:string):Promise<unknown>;
  refresh():Promise<void>;
}
export function assertWidgetActivityAvailable(state:DomainState,operationId:string,activityId:string):void {
  const alreadyCommitted=state.operations.some(operation=>operation.id===operationId);
  if(!alreadyCommitted&&!selectActivities(state).some(activity=>activity.id===activityId))throw new NativeActionUnavailableError('Native activity unavailable');
}
export async function processWidgetAction(value:unknown,port:WidgetActionPort,extraHandler?:(action:NativeAction)=>Promise<void>):Promise<void> {
  const action=validateNativeAction(value);const context=port.context();
  if(!context.state||context.mode!=='personal'||context.readOnly||context.reloading||context.recoveryRequired)throw new Error('Native action dataset unavailable');
  if(context.state.meta.databaseId!==action.databaseId)throw new NativeActionUnavailableError('Native action dataset changed');
  if(action.kind==='record') {
    assertWidgetActivityAvailable(context.state,action.id,action.activityId!);
    // Keep the exact command stable on retry, including the original tap time.
    await port.dispatch({type:'createEntry',activityId:action.activityId!,id:widgetEntryId(action.id),occurredAtMs:action.occurredAtMs},action.id,action.databaseId);
  } else {
    if(!extraHandler)throw new Error('Native reminder handler unavailable');
    await extraHandler(action);
  }
  await port.refresh();
}
