import { requireOptionalNativeModule } from 'expo-modules-core';
import type { AppLanguage } from '../i18n/core';
import type { DomainState } from '../domain';
import { widgetProjection } from './widgetProjection';
import { validateNativeAction, type NativeAction } from './widgetActions';
interface WidgetsModule {
  publishSnapshot(json:string):Promise<void>;requestPin():Promise<boolean>;clear():Promise<void>;
  pendingActions():Promise<string>;finishAction(id:string,ok:boolean):Promise<void>;discardAction(id:string):Promise<void>;enqueueAction(json:string):Promise<void>;
  addListener(name:'onActionsAvailable',listener:()=>void):{remove():void};
}
const native=requireOptionalNativeModule<WidgetsModule>('DailoopWidgets');
export const publishWidgetSnapshot=async(state:DomainState,language:AppLanguage)=>{await native?.publishSnapshot(JSON.stringify(widgetProjection(state,language)));};
export const requestWidgetPin=async()=>await native?.requestPin()??false;
export const clearWidgets=async()=>{await native?.clear();};
export const pendingWidgetActions=async():Promise<NativeAction[]>=>{
  if(!native)return [];
  const values:unknown=JSON.parse(await native.pendingActions());
  if(!Array.isArray(values)||values.length>64)throw new Error('Invalid native outbox');
  return values.map(validateNativeAction);
};
export const finishWidgetAction=async(id:string,ok:boolean)=>{await native?.finishAction(id,ok);};
export const discardWidgetAction=async(id:string)=>{await native?.discardAction(id);};
export const enqueueNativeAction=async(action:NativeAction)=>{validateNativeAction(action);await native?.enqueueAction(JSON.stringify(action));};
export const subscribeWidgetActions=(listener:()=>void)=>{const subscription=native?.addListener('onActionsAvailable',listener);return()=>subscription?.remove();};
