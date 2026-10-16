import './bootstrap';
import { typefaces } from './ui/typography';
import React,{useCallback,useEffect,useState} from 'react';
import { AppState, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import DailoopUI, { type UIRoute } from './ui';
import { session, type SessionSnapshot } from './infrastructure/session';
import { pickBackup, saveText, copyText, shareText } from './infrastructure/files';
import { buildReport, localizeReport, localDate, parseBackup, type Command, type PlanningCommand, type ReportOptions, type ParsedBackup, type ReportModel } from './domain';
import { notificationPlan } from './infrastructure/notificationPlan';
import { useLocalNotifications } from './infrastructure/notifications';
import { digest } from './infrastructure/crypto';
import {RECOVERY_MESSAGE} from './infrastructure/store';
import { presentationPreferences, defaultPresentationPreferences, type ActivityColumns, type HomeListMode, type ActivityLayout, type SensoryPreferences, sensoryPreferences } from './infrastructure/preferences';
import { MotionProvider } from './ui/motion';
import { translate, languageLocales, type AppLanguage, type MessageParams } from './i18n/core';
import { LanguageProvider } from './i18n/react';
import { localizeApplicationMessage } from './i18n/application';
import { publishWidgetSnapshot } from './infrastructure/widgets';
import { runWidgetActions } from './infrastructure/widgetTasks';
import { useCloudSync } from './sync/react';

const message=(e:unknown)=>e instanceof Error?e.message:String(e);
function initialRoute():UIRoute {
  if(Platform.OS!=='web')return {tab:'home'};
  const parameters=new URLSearchParams(location.hash.replace(/^#/,''));
  const tab=parameters.get('tab');
  return {tab:tab==='history'?'stats':tab==='reminders'||tab==='stats'||tab==='settings'?tab:'home',history:tab==='history'||(tab==='stats'&&parameters.get('history')==='1'),activityId:parameters.get('activity')||undefined,report:parameters.get('report')==='1'};
}
export default function Application(){
  const [snapshot,setSnapshot]=useState<SessionSnapshot>(session.snapshot);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [nowMs,setNow]=useState(Date.now);
  const [route,setRoute]=useState<UIRoute>(initialRoute);
  const [viewRevision,setViewRevision]=useState(0);
  const [initialNotice,setInitialNotice]=useState('');
  const [presentation,setPresentation]=useState(defaultPresentationPreferences);
  const [presentationBusy,setPresentationBusy]=useState(false);
  const [presentationReady,setPresentationReady]=useState(false);
  const [presentationError,setPresentationError]=useState<string|null>(null);
  const [notificationTarget,setNotificationTarget]=useState<unknown>(null);
  const [notificationEpoch,setNotificationEpoch]=useState(0);
  const language=presentation.language??'es';
  const cloudSync=useCloudSync(snapshot,language);
  const t=useCallback((source:string,params?:MessageParams)=>translate(language,source,params),[language]);
  const saveReport=useCallback((r:ReportModel)=>saveText(r.markdown,r.filename,'text/markdown',language),[language]);
  const copyReport=useCallback((r:ReportModel)=>copyText(r.markdown,language),[language]);
  const shareReport=useCallback((r:ReportModel)=>shareText(r.markdown,r.filename,language),[language]);
  const notificationOpened=useCallback((data:unknown)=>setNotificationTarget(data),[]);
  const {status:notificationStatus,request:requestNotifications,synchronize:synchronizeNotifications}=useLocalNotifications(notificationOpened,language,sensoryPreferences(presentation).notificationSounds);
  const notificationDay=snapshot.state?localDate(nowMs,snapshot.state.settings.zone):'';
  useEffect(()=>{
    if(snapshot.state && !snapshot.readOnly && snapshot.mode==='personal')void synchronizeNotifications(notificationPlan(snapshot.state,Date.now(),language));
  },[snapshot.state,snapshot.readOnly,snapshot.mode,synchronizeNotifications,notificationStatus,notificationDay,notificationEpoch,language]);
  useEffect(()=>{if(Platform.OS==='web')document.documentElement.lang=languageLocales[language];},[language]);
  useEffect(()=>{
    const unsubscribe=presentationPreferences.subscribe(setPresentation);
    let active=true;
    void presentationPreferences.load().catch(e=>{if(active)setPresentationError(`No se pudieron leer tus preferencias. ${message(e)}`);}).finally(()=>{if(active)setPresentationReady(true);});
    return ()=>{active=false;unsubscribe();};
  },[]);
  const setActivityColumns=useCallback(async(columns:ActivityColumns)=>{
    setPresentationBusy(true);setPresentationError(null);
    try{await presentationPreferences.setColumns(columns);}
    catch(e){setPresentationError(`No se guardó la distribución. ${message(e)}`);}
    finally{setPresentationBusy(false);}
  },[]);
  const setHomeListMode=useCallback(async(mode:HomeListMode)=>{
    setPresentationBusy(true);setPresentationError(null);
    try{await presentationPreferences.setHomeListMode(mode);}
    catch(e){setPresentationError(`No se guardó el tipo de lista. ${message(e)}`);}
    finally{setPresentationBusy(false);}
  },[]);
  const setSensory=useCallback(async(changes:Partial<SensoryPreferences>)=>{await presentationPreferences.setSensory(changes);},[]);
  const setActivityLayout=useCallback(async(layout:ActivityLayout)=>{const id=session.snapshot.state?.meta.databaseId;if(id)await presentationPreferences.setActivityLayout(id,layout);},[]);
  useEffect(()=>{if(snapshot.state&&snapshot.mode==='personal'&&!snapshot.readOnly)void publishWidgetSnapshot(snapshot.state,language).catch(()=>{});},[snapshot.state,snapshot.mode,snapshot.readOnly,language]);
  const setLanguage=useCallback(async(value:AppLanguage)=>{
    setPresentationBusy(true);setPresentationError(null);
    try{await presentationPreferences.setLanguage(value);}
    catch(e){setPresentationError(`No se guardó el idioma. ${message(e)}`);}
    finally{setPresentationBusy(false);}
  },[]);
  useEffect(()=>{
    const unsubscribe=session.subscribe(setSnapshot);
    void session.init().then(()=>runWidgetActions()).catch(e=>setError(message(e)));
    const tick=setInterval(()=>setNow(Date.now()),15_000);
    const active=AppState.addEventListener('change',state=>{if(state==='active'){void runWidgetActions().catch(()=>{});setNow(Date.now());setNotificationEpoch(value=>value+1);}});
    return ()=>{unsubscribe();clearInterval(tick);active.remove();};
  },[]);
  useEffect(()=>{
    if(Platform.OS!=='web')return;
    const changed=()=>setRoute(initialRoute());
    window.addEventListener('popstate',changed); window.addEventListener('hashchange',changed);
    return ()=>{window.removeEventListener('popstate',changed);window.removeEventListener('hashchange',changed);};
  },[]);
  const navigate=useCallback((next:UIRoute)=>{
    setRoute(next);
    if(Platform.OS==='web'){
      const params=new URLSearchParams({tab:next.tab});
      if(next.activityId)params.set('activity',next.activityId);if(next.report)params.set('report','1');if(next.history)params.set('history','1');
      history.pushState(null,'',`#${params.toString()}`);
    }
  },[]);
  useEffect(()=>{
    if(!snapshot.state || !notificationTarget || typeof notificationTarget!=='object')return;
    const target=notificationTarget as Record<string,unknown>;
    // Deliver the external tap after the database has opened, outside this
    // render's effect. Cancelling protects a target replaced during startup.
    const databaseId=snapshot.state.meta.databaseId;
    const pending=setTimeout(()=>{
      if(target.databaseId===databaseId && typeof target.activityId==='string') {
        navigate(target.kind==='reminder'?{tab:'reminders'}:{tab:'home',activityId:target.activityId});
      }
      setNotificationTarget(null);
    },0);
    return ()=>clearTimeout(pending);
  },[notificationTarget,snapshot.state,navigate]);
  const mustWrite=useCallback(()=>{if(session.snapshot.recoveryRequired||session.store?.recoveryRequired)throw new Error(RECOVERY_MESSAGE);if(session.snapshot.readOnly)throw new Error('Esta pestaña es de solo lectura. Regresa a la primera pestaña.');if(session.snapshot.reloading)throw new Error('Espera a que termine el cambio de base.');if(!session.store)throw new Error('Los datos aún no están listos.');return session.store;},[]);
  const command=useCallback(async(command:Command,operationId?:string)=>{
    setError(null);
    try{const result=await mustWrite().dispatch(command,operationId);await session.refresh();setNow(Date.now());return result;}
    catch(e){session.noteStoreError(e);setError(message(e));throw e;}
  },[mustWrite]);
  const planning=useCallback(async(command:PlanningCommand,operationId?:string)=>{
    setError(null);
    try{await mustWrite().dispatchPlanning(command,operationId);await session.refresh();setNow(Date.now());}
    catch(e){session.noteStoreError(e);setError(message(e));throw e;}
  },[mustWrite]);
  const completeReminder=useCallback(async(reminderId:string,dueAtMs?:number)=>{
    setError(null);
    try{await mustWrite().completeReminder(reminderId,undefined,dueAtMs);await session.refresh();setNow(Date.now());}
    catch(e){session.noteStoreError(e);setError(message(e));throw e;}
  },[mustWrite]);
  const inspect=useCallback(async()=>{
    try{const text=await pickBackup();return text===null?null:await parseBackup(text,digest);}
    catch(e){setError(`No se importó ningún dato. ${message(e)}`);throw e;}
  },[]);
  const restore=useCallback(async(candidate:ParsedBackup)=>{
    setBusy(true);setError(null);
    try{await mustWrite().restore(candidate);await session.refresh();setInitialNotice('Backup restaurado y verificado');setViewRevision(value=>value+1);navigate({tab:'home'});}
    catch(e){session.noteStoreError(e);setError(message(e));throw e;}finally{setBusy(false);}
  },[mustWrite,navigate]);
  const report=useCallback(async(options:ReportOptions)=>{
    if(snapshot.readOnly && snapshot.state)return buildReport(snapshot.state,options,language);
    const model=await mustWrite().report(options);
    // Only report presentation changes language; the audited dataset and options stay intact.
    return language==='es'?model:localizeReport(model,language);
  },[snapshot.readOnly,snapshot.state,mustWrite,language]);
  const clearError=useCallback(()=>{setError(null);setPresentationError(null);},[]);
  const resetDemo=useCallback(async()=>{setBusy(true);setError(null);try{mustWrite();await session.resetDemo();setInitialNotice('Demostración reiniciada. Tus datos personales se conservan.');setViewRevision(value=>value+1);navigate({tab:'home'});}catch(e){session.noteStoreError(e);setError(message(e));throw e;}finally{setBusy(false);}},[mustWrite,navigate]);
  const exportBackup=useCallback(async()=>{const text=await mustWrite().backup();return saveText(text,`dailoop-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json',language);},[mustWrite,language]);
  const openMode=useCallback(async(mode:'personal'|'demo')=>{setBusy(true);setError(null);try{mustWrite();await session.openMode(mode);setInitialNotice(mode==='demo'?'Demostración: datos ficticios en una base separada':'Tus datos personales están abiertos');setViewRevision(value=>value+1);navigate({tab:'home'});}catch(e){session.noteStoreError(e);setError(message(e));throw e;}finally{setBusy(false);}},[mustWrite,navigate]);
  if(!snapshot.state||!presentationReady){return <ScrollView contentContainerStyle={{flexGrow:1,backgroundColor:'#F7F7FC',padding:32,justifyContent:'center',alignItems:'center',gap:20}}><Text style={{fontSize:36,fontFamily:typefaces.displayBold,color:'#23263A'}}>Dailoop</Text><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center',maxWidth:480}}>{presentationReady?(error||snapshot.error?localizeApplicationMessage(language,error||snapshot.error):t('Preparando tus datos…')):''}</Text>{presentationReady&&(error||snapshot.error)&&<><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center'}}>{t('Conservamos el almacenamiento existente. No se han borrado datos automáticamente.')}</Text>{Platform.OS==='web'&&<Pressable accessibilityRole="button" onPress={()=>location.reload()} style={{backgroundColor:'#23263A',padding:18,borderRadius:16}}><Text style={{color:'#F7F7FC',fontFamily:typefaces.semibold}}>{t('Reintentar apertura')}</Text></Pressable>}</>}</ScrollView>;}
  const disabledReason=snapshot.recoveryRequired?RECOVERY_MESSAGE:snapshot.reloading?'Cambiando de base. Espera a que termine para guardar cambios.':undefined;
  return <LanguageProvider language={language} onLanguageChange={setLanguage} busy={presentationBusy}><MotionProvider><View style={{flex:1}}>{(snapshot.readOnly||snapshot.recoveryRequired)&&<View accessibilityRole="alert" style={{backgroundColor:'#DCCFFF',padding:12}}><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center'}}>{snapshot.recoveryRequired?localizeApplicationMessage(language,RECOVERY_MESSAGE):t('Solo lectura · usa la primera pestaña para registrar. Si la cerraste, recarga esta pestaña.')}</Text>{snapshot.recoveryRequired&&Platform.OS==='web'&&<Pressable accessibilityRole="button" onPress={()=>location.reload()} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center',fontWeight:'700'}}>{t('Recargar y recuperar almacenamiento')}</Text></Pressable>}</View>}<DailoopUI key={`${snapshot.state.meta.databaseId}-${viewRevision}`}
    state={snapshot.state} nowMs={nowMs} mode={snapshot.mode} storageLabel={snapshot.storageLabel} initialNotice={t(initialNotice)}
    cloudSync={cloudSync}
    presentationPreferences={presentation} onSensory={setSensory} activityLayout={presentation.activityLayouts?.[snapshot.state.meta.databaseId]} onActivityLayout={setActivityLayout}
    activityColumns={presentation.activityColumns} onActivityColumns={setActivityColumns} presentationBusy={presentationBusy}
    homeListMode={presentation.homeListMode} onHomeListMode={setHomeListMode}
    busy={busy||!!snapshot.reloading} readOnly={snapshot.readOnly||!!snapshot.recoveryRequired||!!snapshot.reloading||!!cloudSync.view.deleting} readOnlyReason={disabledReason?localizeApplicationMessage(language,disabledReason):undefined} error={error||snapshot.error||presentationError?localizeApplicationMessage(language,error||snapshot.error||presentationError):null} onClearError={clearError} route={route} onNavigate={navigate}
    onCommand={command} onReport={report}
    onPlanning={planning} onCompleteReminder={completeReminder} notificationStatus={notificationStatus} onEnableNotifications={requestNotifications}
    onSaveReport={saveReport} onCopyReport={copyReport} onShareReport={shareReport}
    onInspectBackup={inspect} onRestoreBackup={restore}
    onResetDemo={resetDemo} onExportBackup={exportBackup} onMode={openMode}
  /></View></MotionProvider></LanguageProvider>;
}
