import { AppRegistry, Platform } from 'react-native';
import { session } from './session';
import { discardWidgetAction, finishWidgetAction, pendingWidgetActions, publishWidgetSnapshot, subscribeWidgetActions } from './widgets';
import { assertWidgetActivityAvailable, NativeActionUnavailableError, processWidgetAction, type NativeAction } from './widgetActions';
import type { AppLanguage } from '../i18n/core';
import { presentationPreferences } from './preferences';

type Handler=(action:NativeAction)=>Promise<void>;
const runtime=globalThis as typeof globalThis & {__dailoopWidgetRunner?:{queue:Promise<void>;handler?:Handler;afterCommit?:()=>Promise<void>;registered:boolean;language:AppLanguage}};
const shared=runtime.__dailoopWidgetRunner??(runtime.__dailoopWidgetRunner={queue:Promise.resolve(),registered:false,language:'es'});
export function setWidgetLanguage(language:AppLanguage){shared.language=language;}
export function runWidgetActions():Promise<void> {
  if(Platform.OS!=='android')return Promise.resolve();
  const work=async()=>{
    await session.init();
    const preferences=await presentationPreferences.load();shared.language=preferences.language??'es';
    for(const action of await pendingWidgetActions()) {
      try {
        await processWidgetAction(action,{context:()=>session.snapshot,dispatch:(command,id,databaseId)=>{
          const store=session.store;if(!store||store.mode!=='personal')throw new Error('Native store unavailable');
          return store.dispatch(command,id,(current)=>{
            if(current.meta.databaseId!==databaseId||session.store!==store)throw new NativeActionUnavailableError('Native dataset changed');
            if(session.snapshot.mode!=='personal'||session.snapshot.readOnly||session.snapshot.reloading||session.snapshot.recoveryRequired)throw new Error('Native dataset unavailable');
            if(command.type==='createEntry')assertWidgetActivityAvailable(current,id,command.activityId);
          });
        },refresh:()=>session.refresh()},shared.handler);
        await shared.afterCommit?.();
        const state=session.snapshot.state;
        if(state&&session.snapshot.mode==='personal')await publishWidgetSnapshot(state,shared.language);
        await finishWidgetAction(action.id,true);
      } catch(error) {
        if(error instanceof NativeActionUnavailableError){
          // An archived/deleted target cannot become valid by replaying this old intent forever.
          const state=session.snapshot.state;
          if(state&&session.snapshot.mode==='personal'&&!session.snapshot.readOnly)
            await publishWidgetSnapshot(state,shared.language).catch(()=>{});
          await discardWidgetAction(action.id);
          continue;
        }
        // SQLite remains authoritative; failed/unconfirmed commands never display success.
        await finishWidgetAction(action.id,false);
      }
    }
  };
  const next=shared.queue.then(work,work);shared.queue=next.catch(()=>{});return next;
}
/** Call once in the native entry before mounting the UI; cold-start headless work uses the same session/store. */
export function registerWidgetTasks(extraHandler?:Handler,afterCommit?:()=>Promise<void>):void {
  if(Platform.OS!=='android')return;
  shared.handler=extraHandler;
  shared.afterCommit=afterCommit;
  if(shared.registered)return;
  shared.registered=true;
  AppRegistry.registerHeadlessTask('DailoopNativeActions',()=>runWidgetActions);
  subscribeWidgetActions(()=>{void runWidgetActions().catch(()=>{});});
}
