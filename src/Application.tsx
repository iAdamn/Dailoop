import './bootstrap';
import { typefaces } from './ui/typography';
import React,{useCallback,useEffect,useState} from 'react';
import { AppState, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import DailoopUI, { type UIRoute } from './ui';
import { session, type SessionSnapshot } from './infrastructure/session';
import { pickBackup, saveText, copyText, shareText } from './infrastructure/files';
import { buildReport, localDate, parseBackup, type Command, type PlanningCommand, type ReportOptions, type ParsedBackup, type ReportModel } from './domain';
import { notificationPlan } from './infrastructure/notificationPlan';
import { useLocalNotifications } from './infrastructure/notifications';
import { digest } from './infrastructure/crypto';
import {RECOVERY_MESSAGE} from './infrastructure/store';
import { presentationPreferences, defaultPresentationPreferences, type ActivityColumns, type HomeListMode } from './infrastructure/preferences';
import { MotionProvider } from './ui/motion';

const message=(e:unknown)=>e instanceof Error?e.message:String(e);
const saveReport=(r:ReportModel)=>saveText(r.markdown,r.filename,'text/markdown');
const copyReport=(r:ReportModel)=>copyText(r.markdown);
const shareReport=(r:ReportModel)=>shareText(r.markdown,r.filename);
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
  const [presentationError,setPresentationError]=useState<string|null>(null);
  const [notificationTarget,setNotificationTarget]=useState<unknown>(null);
  const [notificationEpoch,setNotificationEpoch]=useState(0);
  const notificationOpened=useCallback((data:unknown)=>setNotificationTarget(data),[]);
  const {status:notificationStatus,request:requestNotifications,synchronize:synchronizeNotifications}=useLocalNotifications(notificationOpened);
  const notificationDay=snapshot.state?localDate(nowMs,snapshot.state.settings.zone):'';
  useEffect(()=>{
    if(snapshot.state && !snapshot.readOnly && snapshot.mode==='personal')void synchronizeNotifications(notificationPlan(snapshot.state,Date.now()));
  },[snapshot.state,snapshot.readOnly,snapshot.mode,synchronizeNotifications,notificationStatus,notificationDay,notificationEpoch]);
  useEffect(()=>{
    const unsubscribe=presentationPreferences.subscribe(setPresentation);
    void presentationPreferences.load().catch(e=>setPresentationError(`No se pudieron leer tus preferencias. ${message(e)}`));
    return unsubscribe;
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
  useEffect(()=>{
    const unsubscribe=session.subscribe(setSnapshot);
    void session.init().catch(e=>setError(message(e)));
    const tick=setInterval(()=>setNow(Date.now()),15_000);
    const active=AppState.addEventListener('change',state=>{if(state==='active'){setNow(Date.now());setNotificationEpoch(value=>value+1);}});
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
  const completeReminder=useCallback(async(reminderId:string)=>{
    setError(null);
    try{await mustWrite().completeReminder(reminderId);await session.refresh();setNow(Date.now());}
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
    if(snapshot.readOnly && snapshot.state)return buildReport(snapshot.state,options);
    return mustWrite().report(options);
  },[snapshot.readOnly,snapshot.state,mustWrite]);
  const clearError=useCallback(()=>{setError(null);setPresentationError(null);},[]);
  const resetDemo=useCallback(async()=>{setBusy(true);setError(null);try{mustWrite();await session.resetDemo();setInitialNotice('Demostración reiniciada. Tus datos personales se conservan.');setViewRevision(value=>value+1);navigate({tab:'home'});}catch(e){session.noteStoreError(e);setError(message(e));throw e;}finally{setBusy(false);}},[mustWrite,navigate]);
  const exportBackup=useCallback(async()=>{const text=await mustWrite().backup();return saveText(text,`dailoop-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json');},[mustWrite]);
  const openMode=useCallback(async(mode:'personal'|'demo')=>{setBusy(true);setError(null);try{mustWrite();await session.openMode(mode);setInitialNotice(mode==='demo'?'Demostración: datos ficticios en una base separada':'Tus datos personales están abiertos');setViewRevision(value=>value+1);navigate({tab:'home'});}catch(e){session.noteStoreError(e);setError(message(e));throw e;}finally{setBusy(false);}},[mustWrite,navigate]);
  if(!snapshot.state){return <ScrollView contentContainerStyle={{flexGrow:1,backgroundColor:'#F7F7FC',padding:32,justifyContent:'center',alignItems:'center',gap:20}}><Text style={{fontSize:36,fontFamily:typefaces.displayBold,color:'#23263A'}}>Dailoop</Text><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center',maxWidth:480}}>{error||snapshot.error||'Preparando tus datos…'}</Text>{(error||snapshot.error)&&<><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center'}}>Conservamos el almacenamiento existente. No se han borrado datos automáticamente.</Text>{Platform.OS==='web'&&<Pressable accessibilityRole="button" onPress={()=>location.reload()} style={{backgroundColor:'#23263A',padding:18,borderRadius:16}}><Text style={{color:'#F7F7FC',fontFamily:typefaces.semibold}}>Reintentar apertura</Text></Pressable>}</>}</ScrollView>;}
  const disabledReason=snapshot.recoveryRequired?RECOVERY_MESSAGE:snapshot.reloading?'Cambiando de base. Espera a que termine para guardar cambios.':undefined;
  return <MotionProvider><View style={{flex:1}}>{(snapshot.readOnly||snapshot.recoveryRequired)&&<View accessibilityRole="alert" style={{backgroundColor:'#DCCFFF',padding:12}}><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center'}}>{snapshot.recoveryRequired?RECOVERY_MESSAGE:'Solo lectura · usa la primera pestaña para registrar. Si la cerraste, recarga esta pestaña.'}</Text>{snapshot.recoveryRequired&&Platform.OS==='web'&&<Pressable accessibilityRole="button" onPress={()=>location.reload()} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center',fontWeight:'700'}}>Recargar y recuperar almacenamiento</Text></Pressable>}</View>}<DailoopUI key={`${snapshot.state.meta.databaseId}-${viewRevision}`}
    state={snapshot.state} nowMs={nowMs} mode={snapshot.mode} storageLabel={snapshot.storageLabel} initialNotice={initialNotice}
    activityColumns={presentation.activityColumns} onActivityColumns={setActivityColumns} presentationBusy={presentationBusy}
    homeListMode={presentation.homeListMode} onHomeListMode={setHomeListMode}
    busy={busy||!!snapshot.reloading} readOnly={snapshot.readOnly||!!snapshot.recoveryRequired||!!snapshot.reloading} readOnlyReason={disabledReason} error={error||snapshot.error||presentationError} onClearError={clearError} route={route} onNavigate={navigate}
    onCommand={command} onReport={report}
    onPlanning={planning} onCompleteReminder={completeReminder} notificationStatus={notificationStatus} onEnableNotifications={requestNotifications}
    onSaveReport={saveReport} onCopyReport={copyReport} onShareReport={shareReport}
    onInspectBackup={inspect} onRestoreBackup={restore}
    onResetDemo={resetDemo} onExportBackup={exportBackup} onMode={openMode}
  /></View></MotionProvider>;
}
