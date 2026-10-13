import './bootstrap';
import { typefaces } from './ui/typography';
import React,{useEffect,useState} from 'react';
import { AppState, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import DailoopUI, { type UIRoute } from './ui';
import { session, type SessionSnapshot } from './infrastructure/session';
import { pickBackup, saveText, copyText, shareText } from './infrastructure/files';
import { buildReport, parseBackup, type Command, type ReportOptions, type ParsedBackup } from './domain';
import { digest } from './infrastructure/crypto';
import {RECOVERY_MESSAGE} from './infrastructure/store';
import { presentationPreferences, defaultPresentationPreferences, type ActivityColumns } from './infrastructure/preferences';
import { MotionProvider } from './ui/motion';

const message=(e:unknown)=>e instanceof Error?e.message:String(e);
function initialRoute():UIRoute {
  if(Platform.OS!=='web')return {tab:'home'};
  const parameters=new URLSearchParams(location.hash.replace(/^#/,''));
  const tab=parameters.get('tab');
  return {tab:tab==='history'||tab==='stats'||tab==='settings'?tab:'home',activityId:parameters.get('activity')||undefined,report:parameters.get('report')==='1'};
}
export default function Application(){
  const [snapshot,setSnapshot]=useState<SessionSnapshot>(session.snapshot);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [nowMs,setNow]=useState(Date.now());
  const [route,setRoute]=useState<UIRoute>(initialRoute);
  const [viewRevision,setViewRevision]=useState(0);
  const [initialNotice,setInitialNotice]=useState('');
  const [presentation,setPresentation]=useState(defaultPresentationPreferences);
  const [presentationBusy,setPresentationBusy]=useState(false);
  const [presentationError,setPresentationError]=useState<string|null>(null);
  useEffect(()=>{
    const unsubscribe=presentationPreferences.subscribe(setPresentation);
    void presentationPreferences.load().catch(e=>setPresentationError(`No se pudieron leer tus preferencias. ${message(e)}`));
    return unsubscribe;
  },[]);
  async function setActivityColumns(columns:ActivityColumns){
    setPresentationBusy(true);setPresentationError(null);
    try{await presentationPreferences.setColumns(columns);}
    catch(e){setPresentationError(`No se guardó la distribución. ${message(e)}`);}
    finally{setPresentationBusy(false);}
  }
  useEffect(()=>{
    const unsubscribe=session.subscribe(setSnapshot);
    void session.init().catch(e=>setError(message(e)));
    const tick=setInterval(()=>setNow(Date.now()),15_000);
    const active=AppState.addEventListener('change',state=>{if(state==='active')setNow(Date.now());});
    return ()=>{unsubscribe();clearInterval(tick);active.remove();};
  },[]);
  useEffect(()=>{
    if(Platform.OS!=='web')return;
    const changed=()=>setRoute(initialRoute());
    window.addEventListener('popstate',changed); window.addEventListener('hashchange',changed);
    return ()=>{window.removeEventListener('popstate',changed);window.removeEventListener('hashchange',changed);};
  },[]);
  function navigate(next:UIRoute){
    setRoute(next);
    if(Platform.OS==='web'){
      const params=new URLSearchParams({tab:next.tab});
      if(next.activityId)params.set('activity',next.activityId);if(next.report)params.set('report','1');
      history.pushState(null,'',`#${params.toString()}`);
    }
  }
  const mustWrite=()=>{if(session.snapshot.recoveryRequired||session.store?.recoveryRequired)throw new Error(RECOVERY_MESSAGE);if(session.snapshot.readOnly)throw new Error('Esta pestaña es de solo lectura. Regresa a la primera pestaña.');if(session.snapshot.reloading)throw new Error('Espera a que termine el cambio de base.');if(!session.store)throw new Error('Los datos aún no están listos.');return session.store;};
  async function command(command:Command,operationId?:string){
    setError(null);
    try{const result=await mustWrite().dispatch(command,operationId);await session.refresh();setNow(Date.now());return result;}
    catch(e){session.noteStoreError(e);setError(message(e));throw e;}
  }
  async function inspect(){
    try{const text=await pickBackup();return text===null?null:await parseBackup(text,digest);}
    catch(e){setError(`No se importó ningún dato. ${message(e)}`);throw e;}
  }
  async function restore(candidate:ParsedBackup){
    setBusy(true);setError(null);
    try{await mustWrite().restore(candidate);await session.refresh();setInitialNotice('Backup restaurado y verificado');setViewRevision(value=>value+1);navigate({tab:'home'});}
    catch(e){session.noteStoreError(e);setError(message(e));throw e;}finally{setBusy(false);}
  }
  async function report(options:ReportOptions){
    if(snapshot.readOnly && snapshot.state)return buildReport(snapshot.state,options);
    return mustWrite().report(options);
  }
  if(!snapshot.state){return <ScrollView contentContainerStyle={{flexGrow:1,backgroundColor:'#F7F7FC',padding:32,justifyContent:'center',alignItems:'center',gap:20}}><Text style={{fontSize:36,fontFamily:typefaces.displayBold,color:'#23263A'}}>Dailoop</Text><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center',maxWidth:480}}>{error||snapshot.error||'Preparando tus datos…'}</Text>{(error||snapshot.error)&&<><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center'}}>Conservamos el almacenamiento existente. No se han borrado datos automáticamente.</Text>{Platform.OS==='web'&&<Pressable accessibilityRole="button" onPress={()=>location.reload()} style={{backgroundColor:'#23263A',padding:18,borderRadius:16}}><Text style={{color:'#F7F7FC',fontFamily:typefaces.semibold}}>Reintentar apertura</Text></Pressable>}</>}</ScrollView>;}
  const disabledReason=snapshot.recoveryRequired?RECOVERY_MESSAGE:snapshot.reloading?'Cambiando de base. Espera a que termine para guardar cambios.':undefined;
  return <MotionProvider><View style={{flex:1}}>{(snapshot.readOnly||snapshot.recoveryRequired)&&<View accessibilityRole="alert" style={{backgroundColor:'#DCCFFF',padding:12}}><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center'}}>{snapshot.recoveryRequired?RECOVERY_MESSAGE:'Solo lectura · usa la primera pestaña para registrar. Si la cerraste, recarga esta pestaña.'}</Text>{snapshot.recoveryRequired&&Platform.OS==='web'&&<Pressable accessibilityRole="button" onPress={()=>location.reload()} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:'#23263A',fontFamily:typefaces.body,textAlign:'center',fontWeight:'700'}}>Recargar y recuperar almacenamiento</Text></Pressable>}</View>}<DailoopUI key={`${snapshot.state.meta.databaseId}-${viewRevision}`}
    state={snapshot.state} nowMs={nowMs} mode={snapshot.mode} storageLabel={snapshot.storageLabel} initialNotice={initialNotice}
    activityColumns={presentation.activityColumns} onActivityColumns={setActivityColumns} presentationBusy={presentationBusy}
    busy={busy||!!snapshot.reloading} readOnly={snapshot.readOnly||!!snapshot.recoveryRequired||!!snapshot.reloading} readOnlyReason={disabledReason} error={error||snapshot.error||presentationError} onClearError={()=>{setError(null);setPresentationError(null);}} route={route} onNavigate={navigate}
    onCommand={command} onReport={report}
    onSaveReport={r=>saveText(r.markdown,r.filename,'text/markdown')}
    onCopyReport={r=>copyText(r.markdown)} onShareReport={r=>shareText(r.markdown,r.filename)}
    onInspectBackup={inspect} onRestoreBackup={restore}
    onResetDemo={async()=>{setBusy(true);setError(null);try{mustWrite();await session.resetDemo();setInitialNotice('Demostración reiniciada. Tus datos personales se conservan.');setViewRevision(value=>value+1);navigate({tab:'home'});}catch(e){session.noteStoreError(e);setError(message(e));throw e;}finally{setBusy(false);}}}
    onExportBackup={async()=>{const text=await mustWrite().backup();return saveText(text,`dailoop-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json');}}
    onMode={async mode=>{setBusy(true);setError(null);try{mustWrite();await session.openMode(mode);setInitialNotice(mode==='demo'?'Demostración: datos ficticios en una base separada':'Tus datos personales están abiertos');setViewRevision(value=>value+1);navigate({tab:'home'});}catch(e){session.noteStoreError(e);setError(message(e));throw e;}finally{setBusy(false);}}}
  /></View></MotionProvider>;
}
