import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { session, type SessionSnapshot } from '../infrastructure/session';
import { digest, uuid } from '../infrastructure/crypto';
import { saveText } from '../infrastructure/files';
import { exportBackup, createEmptyState, canonicalize } from '../domain';
import { purgeCloudAccount } from './deletion';
import { rememberDeletionReauth, takeDeletionReauth, clearDeletionReauth } from './reauth';
import { clearWidgets } from '../infrastructure/widgets';
import { synchronizeNotificationPlan } from '../infrastructure/notifications';
import { APP_VERSION } from '../version';
import type { AppLanguage } from '../i18n/core';
import { CloudAuth } from './auth';
import { cloudConfig } from './config';
import { credentialVault, googleCredential, pendingGoogleCredential, subscribeOnline } from './credentials';
import { FirestoreSyncTransport } from './firestore';
import { SyncMetadata } from './metadata';
import { SyncController, initialCloudSyncView } from './controller';
import type { CloudSyncProps, CloudSyncView } from './types';

function buildRuntime() {
  const config = cloudConfig(); if (!config) return null;
  const auth = new CloudAuth(config, credentialVault); const metadata = new SyncMetadata();
  const transport = new FirestoreSyncTransport(config, () => auth.token(), digest);
  const controller = new SyncController({
    context: () => ({ state: session.snapshot.state, demo: session.snapshot.mode === 'demo',
      readOnly: session.snapshot.readOnly || !!session.snapshot.recoveryRequired || !!session.snapshot.reloading }),
    apply: async (state, expected, guard) => {
      const store = session.store;
      if (!store || session.snapshot.mode !== 'personal' || session.snapshot.readOnly || session.snapshot.recoveryRequired || session.snapshot.reloading) throw new Error('La sincronización se pausó. Tus datos siguen aquí.');
      await store.applySync(state, expected, () => {
        guard?.();
        return session.store === store && session.snapshot.mode === 'personal'
          && !session.snapshot.readOnly && !session.snapshot.recoveryRequired && !session.snapshot.reloading;
      });
      await session.refresh();
    },
  }, transport, metadata, digest);
  return { config, auth, metadata, controller, transport };
}
type Runtime = NonNullable<ReturnType<typeof buildRuntime>>;
const shared = globalThis as typeof globalThis & { __dailoopCloud?: Runtime };
function createRuntime() {
  const config = cloudConfig(); if (!config) return null;
  if (shared.__dailoopCloud && shared.__dailoopCloud.config.projectId === config.projectId) return shared.__dailoopCloud;
  shared.__dailoopCloud?.controller.suspend();
  return shared.__dailoopCloud = buildRuntime() ?? undefined;
}

export function useCloudSync(snapshot: SessionSnapshot, language: AppLanguage): CloudSyncProps {
  const runtime = useMemo(() => createRuntime(), []);
  const [view, setView] = useState<CloudSyncView>(initialCloudSyncView);
  const [deletionReady,setDeletionReady]=useState<{uid:string;at:number}|null>(null);
  const [deleting,setDeleting]=useState(false);
  const deletionLock=useRef(false);
  useEffect(()=>{if(!deletionReady)return;const timeout=setTimeout(()=>setDeletionReady(null),Math.max(0,300000-(Date.now()-deletionReady.at)));return()=>clearTimeout(timeout);},[deletionReady]);
  const [recoveryCopies, setRecoveryCopies] = useState<{ uid: string; copies: NonNullable<CloudSyncView['recoveryCopies']> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(false);
  const initialized = useRef(false);
  const mountGeneration = useRef(0);
  const accountGeneration = useRef(0);
  const schedule = useCallback(() => {
    if (!runtime?.controller.view.enabled || timer.current || !alive.current) return;
    // One batch after a burst of local activity, never a continuous network poll.
    timer.current = setTimeout(() => { timer.current = null; if (alive.current) void runtime.controller.synchronize(); }, 15_000);
  }, [runtime]);
  useEffect(() => {
    const mount = ++mountGeneration.current;
    alive.current = true;
    if (!runtime) return () => { alive.current = false; };
    const unsubscribe = runtime.controller.subscribe(value => {
      if (!alive.current || mount !== mountGeneration.current) return;
      setView(value);
    });
    void (async () => {
      await runtime.auth.load();
      if (!alive.current || mount !== mountGeneration.current) return;
      const credential = await pendingGoogleCredential();
      if (!alive.current || mount !== mountGeneration.current) return;
      if (credential) {
        const intent=takeDeletionReauth();
        await runtime.auth.signIn(credential,intent?.uid,!!intent);
        if(intent)setDeletionReady({uid:intent.uid,at:Date.now()});
        if (!alive.current || mount !== mountGeneration.current) return;
        if (Platform.OS === 'web') {
          history.replaceState(null, '', location.pathname + location.search + '#tab=settings');
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      }
      if (!alive.current || mount !== mountGeneration.current) return;
      await runtime.controller.setAccount(runtime.auth.account);
      if (!alive.current || mount !== mountGeneration.current) return;
      initialized.current = true; schedule();
    })().catch(error => { if (alive.current && mount === mountGeneration.current) setView(value => ({ ...value, configured: true, status: 'error', error: error instanceof Error ? error.message : 'No se pudo conectar con Google.' })); });
    const active = AppState.addEventListener('change', state => { if (state === 'active') schedule(); });
    return () => {
      mountGeneration.current = mount + 1; alive.current = false; initialized.current = false; unsubscribe(); active.remove();
      runtime.controller.suspend();
      if (timer.current) clearTimeout(timer.current); timer.current = null;
    };
  }, [runtime, schedule]);
  useEffect(() => {
    if (!runtime || !view.enabled) return;
    return subscribeOnline(() => schedule());
  }, [runtime, view.enabled, schedule]);
  useEffect(() => {
    let current = true; const uid = view.account?.uid;
    if (runtime && uid) void runtime.metadata.copies(uid).then(copies => { if (current) setRecoveryCopies({ uid, copies }); }).catch(() => { if (current) setRecoveryCopies(null); });
    return () => { current = false; };
  }, [runtime, view.account?.uid, view.lastSyncedAt, view.conflict]);
  useEffect(() => {
    if (!runtime || !initialized.current) return;
    runtime.controller.changed();
    void runtime.controller.refresh().then(() => schedule()).catch(error => {
      if (alive.current) setView(value => ({ ...value, status: 'error', error: error instanceof Error ? error.message : 'No se pudo sincronizar. Tus datos siguen aquí.' }));
    });
  }, [runtime, schedule, snapshot.state, snapshot.mode, snapshot.readOnly, snapshot.reloading, snapshot.recoveryRequired]);
  const actions = useMemo<CloudSyncProps['actions']>(() => {
    const required = () => { if (!runtime) throw new Error('La conexión online todavía no está configurada.'); return runtime; };
    const offer = async (state: Parameters<typeof exportBackup>[0], label: string) => {
      const content = await exportBackup(state, { backupId: uuid(), exportedAtMs: Date.now(), appVersion: APP_VERSION }, digest);
      await saveText(content, `dailoop-recovery-${label}-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', language);
    };
    return {
      signIn: async () => {
        if(deletionLock.current)return;
        setDeletionReady(null);clearDeletionReauth();
        const current = required();
        const mount = mountGeneration.current; const generation = ++accountGeneration.current;
        const allowed = () => alive.current && mount === mountGeneration.current && generation === accountGeneration.current
          && session.snapshot.mode === 'personal' && !session.snapshot.readOnly && !session.snapshot.reloading && !session.snapshot.recoveryRequired;
        if (!allowed()) return;
        const credential = await googleCredential(current.config.googleWebClientId);
        if (credential && allowed()) {
          await current.auth.signIn(credential);
          if (!allowed()) return;
          await current.controller.setAccount(current.auth.account);
          if (allowed()) initialized.current = true;
        }
      },
      enable: async () => { if(!deletionLock.current)await required().controller.enable(); },
      pause: async () => { await required().controller.pause(); },
      synchronize: async () => { await required().controller.synchronize(); },
      signOut: async () => {
        if(deletionLock.current)return;
        setDeletionReady(null);clearDeletionReauth();
        const current = required();
        accountGeneration.current++;
        let error: unknown;
        try { if (current.controller.view.enabled) await current.controller.pause(); } catch (failure) { error = failure; }
        current.controller.suspend();
        try { await current.auth.signOut(); } finally { await current.controller.setAccount(null); }
        if (error) throw error;
      },
      resolve: async side => { await required().controller.resolve(side); },
      exportConflict: async side => { await offer(required().controller.conflictState(side), side); },
      exportRecoveryCopy: async version => {
        const current = required(); const uid = current.auth.account?.uid;
        if (!uid) throw new Error('La sesión de Google caducó. Vuelve a conectar.');
        let state;
        try { state = await current.metadata.recovery(uid, version); }
        catch { state = await current.transport.load(uid, version); }
        if (await digest((await import('../domain')).canonicalize(state)) !== version) throw new Error('La copia de recuperación no coincide con su identificador.');
        if (current.auth.account?.uid !== uid) throw new Error('La sesión de Google caducó. Vuelve a conectar.');
        await offer(state, version.slice(0, 8));
      },
      loadRecoveryCopies: async () => {
        const current = required(); const uid = current.auth.account?.uid;
        if (!uid) throw new Error('La sesión de Google caducó. Vuelve a conectar.');
        const local = await current.metadata.copies(uid);
        let versions: string[] = [];
        try { const head = await current.transport.readHead(uid); versions = head ? [...(head.recovery ?? []), head.version] : []; }
        catch (error) { if (!local.length) throw error; }
        if (current.auth.account?.uid !== uid) throw new Error('La sesión de Google caducó. Vuelve a conectar.');
        const seen = new Set(local.map(copy => copy.version));
        setRecoveryCopies({ uid, copies: [...local, ...versions.filter(version => !seen.has(version)).map(version => ({ version }))] });
      },
      prepareDeletion: async () => {
        if(deletionLock.current)return;
        const generation=++accountGeneration.current;const mount=mountGeneration.current;
        const current=required();const uid=current.auth.account?.uid;
        if(!uid||session.snapshot.mode!=='personal'||session.snapshot.readOnly)throw new Error('La sesión de Google caducó. Vuelve a conectar.');
        const allowed=()=>alive.current&&mount===mountGeneration.current&&generation===accountGeneration.current&&current.auth.account?.uid===uid&&session.snapshot.mode==='personal'&&!session.snapshot.readOnly&&!session.snapshot.reloading&&!session.snapshot.recoveryRequired;
        await current.controller.pause();setDeletionReady(null);
        if(!allowed())return;
        rememberDeletionReauth(uid);
        try {
          const credential=await googleCredential(current.config.googleWebClientId);
          if(credential&&allowed()){clearDeletionReauth();await current.auth.signIn(credential,uid,true);if(allowed())setDeletionReady({uid,at:Date.now()});}
        }catch(error){clearDeletionReauth();throw error;}
      },
      cancelDeletion: () => {if(!deletionLock.current){setDeletionReady(null);clearDeletionReauth();}},
      deleteAccount: async (keepLocal=true) => {
        const current=required();const uid=current.auth.account?.uid;const store=session.store;
        if(deletionLock.current||!uid||!deletionReady||deletionReady.uid!==uid||Date.now()-deletionReady.at<0||Date.now()-deletionReady.at>300000)throw new Error('Confirma de nuevo tu cuenta con Google.');
        if(!store||session.snapshot.mode!=='personal'||session.snapshot.readOnly||session.snapshot.reloading||session.snapshot.recoveryRequired)throw new Error('La sincronización se pausó. Tus datos siguen aquí.');
        deletionLock.current=true;setDeleting(true);
        ++accountGeneration.current;
        try {
          await current.controller.quiesce();current.controller.suspend();
          await purgeCloudAccount(current.config,uid,()=>{if(current.auth.account?.uid!==uid)throw new Error('La sesión de Google caducó. Vuelve a conectar.');return current.auth.token();});
          if(current.auth.account?.uid!==uid||session.store!==store||session.snapshot.mode!=='personal'||session.snapshot.readOnly||session.snapshot.reloading||session.snapshot.recoveryRequired)throw new Error('La sincronización se pausó. Tus datos siguen aquí.');
          if(keepLocal===false){
            const state=await store.snapshot();const expected=await digest(canonicalize(state));
            const empty=createEmptyState({databaseId:uuid(),nowMs:Date.now(),zone:state.settings.zone});
            empty.settings={...state.settings};
            await store.applySync(empty,expected,()=>current.auth.account?.uid===uid&&session.store===store&&session.snapshot.mode==='personal'&&!session.snapshot.readOnly&&!session.snapshot.reloading);
            await session.refresh();await clearWidgets();await synchronizeNotificationPlan([],language,false);
          }
          await current.metadata.clearAccount(uid);
          if(current.auth.account?.uid!==uid)throw new Error('La sesión de Google caducó. Vuelve a conectar.');
          await current.auth.deleteAccount(uid);
          await current.controller.setAccount(null);setRecoveryCopies(null);setDeletionReady(null);clearDeletionReauth();
        }finally{deletionLock.current=false;setDeleting(false);setDeletionReady(null);if(!current.auth.account)await current.controller.setAccount(null);}
      },
      detachLocalData: async () => {
        if(deletionLock.current)return;
        const current=required();const state=session.snapshot.state;
        if(!state||session.snapshot.mode!=='personal'||session.snapshot.readOnly||session.snapshot.reloading)throw new Error('La sincronización se pausó. Tus datos siguen aquí.');
        await current.controller.pause();current.controller.suspend();
        await current.metadata.unbind(state.meta.databaseId);await current.controller.refresh();
      },
    };
  }, [runtime, language, deletionReady]);
  return { view: { ...view, readOnly: snapshot.readOnly || !!snapshot.reloading || !!snapshot.recoveryRequired,
    demo: snapshot.mode === 'demo', deleting, deletionReady:!!deletionReady&&deletionReady.uid===view.account?.uid, recoveryCopies: recoveryCopies?.uid === view.account?.uid ? recoveryCopies?.copies ?? [] : [] }, actions };
}
