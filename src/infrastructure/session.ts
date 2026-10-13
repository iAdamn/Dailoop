import { Platform } from 'react-native';
import { getCalendars } from 'expo-localization';
import {createEmptyState,exportBackup,type DomainState} from '../domain';
import { DailoopStore, RECOVERY_MESSAGE, type Mode } from './store';
import { digest,uuid } from './crypto';
import { cleanExportCache } from './files';

type Listener=(snapshot:SessionSnapshot)=>void;
export interface SessionSnapshot { state:DomainState|null; mode:Mode; readOnly:boolean; storageLabel:string; error:string|null; recoveryRequired?:boolean; reloading?:boolean }
class Session {
  store:DailoopStore|null=null;
  snapshot:SessionSnapshot={state:null,mode:'personal',readOnly:false,storageLabel:'SQLite',error:null};
  private listeners=new Set<Listener>();
  private channel:BroadcastChannel|null=null;
  private ready:Promise<void>|null=null;
  private modeQueue:Promise<unknown>=Promise.resolve();
  subscribe(listener:Listener){this.listeners.add(listener);listener(this.snapshot);return()=>{this.listeners.delete(listener);};}
  emit(){for(const listener of this.listeners)listener(this.snapshot);}
  async init(){ if(!this.ready)this.ready=this.initialize(); return this.ready; }
  private async initialize(){
    try {
      if(Platform.OS==='web') {
        if(!globalThis.crossOriginIsolated || !navigator.locks) throw new Error('La vista previa necesita aislamiento COOP/COEP y Web Locks. Abre la URL local en una pestaña de Chromium o Edge.');
        this.channel=new BroadcastChannel('dailoop-snapshots-v1');
        this.channel.onmessage=(event:MessageEvent)=>{
          const data=event.data;
          if(data?.kind==='request' && !this.snapshot.readOnly && this.snapshot.state)this.publish();
          if(data?.kind==='snapshot' && this.snapshot.readOnly && data.snapshot?.state) { this.snapshot={...data.snapshot,readOnly:true};this.emit(); }
        };
        const primary=await new Promise<boolean>((resolve,reject)=>{
          navigator.locks.request('dailoop-sqlite-origin-v1',{ifAvailable:true},async(lock)=>{
            resolve(!!lock);
            if(lock) await new Promise<void>(()=>{/* Browser releases this lock when this document closes. */});
          }).catch(reject);
        });
        if(!primary){this.snapshot={...this.snapshot,readOnly:true,error:'Esta pestaña es de solo lectura. Usa la primera pestaña para registrar o restaurar datos.'};this.emit();this.channel.postMessage({kind:'request'});return;}
        void navigator.storage?.persist?.().catch(()=>false);
      }
      cleanExportCache();
      await this.openMode('personal');
    } catch(error){this.snapshot={...this.snapshot,error:error instanceof Error?error.message:String(error)};this.emit();throw error;}
  }
  private publish(){this.channel?.postMessage({kind:'snapshot',snapshot:this.snapshot});}
  noteStoreError(error:unknown){
    if(!this.store?.recoveryRequired)return;
    this.snapshot={...this.snapshot,recoveryRequired:true,error:error instanceof Error?error.message:RECOVERY_MESSAGE};this.emit();this.publish();
  }
  async refresh(){
    const store=this.store;if(!store)return;
    try {
      const state=await store.snapshot();
      if(this.store!==store)return;
      this.snapshot={...this.snapshot,state,storageLabel:store.label,error:null,recoveryRequired:false};this.emit();this.publish();
    }catch(error){
      // A mode change can retire this handle while its read is still pending.
      if(this.store!==store)return;
      this.noteStoreError(error);throw error;
    }
  }
  openMode(mode:Mode){
    const next=this.modeQueue.then(()=>this.changeMode(mode),()=>this.changeMode(mode));
    this.modeQueue=next.catch(()=>{});return next;
  }
  private async changeMode(mode:Mode){
    if(this.snapshot.readOnly)throw new Error('Esta pestaña es de solo lectura.');
    if(this.snapshot.recoveryRequired||this.store?.recoveryRequired){this.noteStoreError(new Error(RECOVERY_MESSAGE));throw new Error(RECOVERY_MESSAGE);}
    const zone=(Platform.OS==='web'?Intl.DateTimeFormat().resolvedOptions().timeZone:getCalendars()[0]?.timeZone) || 'America/Bogota';
    const previousMode=this.snapshot.mode;const previous=this.store;
    this.snapshot={...this.snapshot,reloading:true};this.emit();this.publish();
    try {
      if(previous){
        this.store=null;
        try {await previous.close();if(previous.recoveryRequired)throw new Error(RECOVERY_MESSAGE);}
        catch(error){this.store=previous;this.noteStoreError(error);throw error;}
      }
      try {
        this.store=await DailoopStore.open(mode,zone);
        if(mode==='demo' && !(await this.store.snapshot()).activities.length)await this.seedDemo();
        this.snapshot={...this.snapshot,mode};await this.refresh();
      }catch(error){
        if(this.store?.recoveryRequired){this.noteStoreError(error);throw error;}
        const failed=this.store;
        try {await failed?.close();}
        catch(closeError){this.noteStoreError(closeError);throw closeError;}
        this.store=null;
        if(previous){this.store=await DailoopStore.open(previousMode,zone);this.snapshot={...this.snapshot,mode:previousMode};await this.refresh();}
        throw error;
      }
    }finally{
      this.snapshot={...this.snapshot,reloading:false};this.emit();this.publish();
    }
  }
  resetDemo(){
    const work=async()=>{
      if(this.snapshot.recoveryRequired||this.store?.recoveryRequired)throw new Error(RECOVERY_MESSAGE);
      if(this.snapshot.readOnly||this.snapshot.mode!=='demo'||this.store?.mode!=='demo')throw new Error('Sólo se puede reiniciar la base de demostración abierta.');
      const now=Date.now();const state=createEmptyState({databaseId:uuid(),nowMs:now,zone:this.snapshot.state!.settings.zone});
      const text=await exportBackup(state,{backupId:uuid(),exportedAtMs:now,appVersion:'0.1.0'},digest);
      await this.store.restore(await this.store.inspect(text));await this.seedDemo();await this.refresh();
    };
    const next=this.modeQueue.then(work,work);this.modeQueue=next.catch(()=>{});return next;
  }
  private async seedDemo(){
    const store=this.store!; const now=Date.now();
    const activities=[{name:'Leer un rato',emoji:'📚',color:'#DCCFFF'},{name:'Regar las plantas',emoji:'🌱',color:'#8FD8FF'},{name:'Salir a caminar',emoji:'🚶',color:'#9A7CFF'},{name:'Momento para mí',emoji:'✨',color:'#DCCFFF'}] as const;
    for(let i=0;i<activities.length;i++) {
      const id=uuid();await store.dispatch({type:'createActivity',...activities[i],id,isPrivate:i===3});
      for(let day=5;day>=0;day--) {
        if((i+day)%3===0)continue;
        await store.dispatch({type:'createEntry',activityId:id,occurredAtMs:now-day*86_400_000-(i+1)*3_600_000,note:i===3?'Nota ficticia privada de demostración.':''});
      }
    }
  }
}
// Keep the single owner across React remounts / development Fast Refresh.
const globalSession=globalThis as typeof globalThis & {__dailoopSession?:Session};
export const session=globalSession.__dailoopSession ?? (globalSession.__dailoopSession=new Session());
