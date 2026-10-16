import React,{useRef,useState} from 'react';
import { Linking } from 'react-native';
import type { CloudSyncProps } from '../sync/types';
import { useI18n } from '../i18n/react';
import { Button,Label,ModalFrame,Panel,Toggle } from './components';
import { ActiveTabModal } from './navigation';
export const ACCOUNT_DELETION_URL='https://iadamn.github.io/Dailoop/delete-account/';
export const PRIVACY_URL='https://iadamn.github.io/Dailoop/privacy/';
export function AccountPrivacy({view,actions}:CloudSyncProps){
 const {t}=useI18n();const [dialog,setDialog]=useState<'delete'|'detach'|null>(null);const [keepLocal,setKeepLocal]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const lock=useRef(false);
 const blocked=view.demo||view.readOnly||busy||!!view.deleting;
 async function run(work:()=>Promise<void>,after?:()=>void){if(blocked||lock.current)return;lock.current=true;setBusy(true);setError('');try{await work();after?.();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setBusy(false);}}
 return <Panel><Label strong>{t('Cuenta y privacidad')}</Label><Label small>{t('El borrado online elimina actividades, registros, notas, recordatorios y copias de recuperación de tu cuenta.')}</Label>
 <Button secondary compact onPress={()=>void Linking.openURL(PRIVACY_URL).catch(()=>setError(t('No se pudo abrir la página.')))}>{t('Política de privacidad')}</Button>
 <Button secondary compact onPress={()=>void Linking.openURL(ACCOUNT_DELETION_URL).catch(()=>setError(t('No se pudo abrir la página.')))}>{t('Borrar cuenta desde la web')}</Button>
 {view.account&&actions.prepareDeletion&&actions.deleteAccount&&<Button secondary disabled={blocked} onPress={()=>{setError('');setNotice('');setKeepLocal(true);setDialog('delete');}}>{t('Borrar cuenta y datos online')}</Button>}
 {actions.detachLocalData&&<Button secondary disabled={blocked} onPress={()=>{setError('');setDialog('detach');}}>{t('Desvincular esta copia local')}</Button>}
 {!!notice&&<Label strong>{notice}</Label>}{!!error&&<Label strong>{t(error)}</Label>}
 {(dialog||view.deletionReady)&&<ActiveTabModal><ModalFrame title={t(dialog==='detach'?'Desvincular esta copia local':'Borrar cuenta y datos online')} canClose={!busy&&!view.deleting} onClose={()=>{if(!busy&&!view.deleting){setDialog(null);actions.cancelDeletion?.();}}}>
 {({closeWith})=>dialog==='detach'?<><Label>{t('No se borra nada. La sincronización se pausa. Activarla con otra cuenta compartirá esta copia allí; revisa su contenido antes.')}</Label><Button disabled={blocked} onPress={()=>run(()=>actions.detachLocalData!(),()=>closeWith(()=>{setDialog(null);setNotice(t('Copia local desvinculada.'));}))}>{t('Confirmar desvinculación')}</Button></>:<>
 <Label>{view.account?.email}</Label><Label>{t('Es irreversible. Guarda un backup antes. Confirma la misma cuenta con Google y después confirma el borrado.')}</Label>
 <Label small>{t('Se conserva un identificador técnico de bloqueo, sin actividades ni notas, para impedir que sesiones antiguas vuelvan a subir datos borrados.')}</Label>
 <Toggle label={t('Conservar mis datos en este dispositivo')} value={keepLocal} onChange={setKeepLocal} detail={t('Si lo desactivas, se vacía esta base local. Las copias de otros dispositivos y los archivos exportados permanecen allí.')} />
 {!view.deletionReady?<Button busy={busy} disabled={blocked} onPress={()=>run(()=>actions.prepareDeletion!())}>{t('Confirmar cuenta con Google')}</Button>:<Button busy={busy||view.deleting} disabled={blocked} onPress={()=>run(()=>actions.deleteAccount!(keepLocal),()=>closeWith(()=>{setDialog(null);setNotice(t('Cuenta y datos online borrados.'));}))}>{t('Borrar definitivamente')}</Button>}
 <Label small>{t('Si se interrumpe, confirma tu cuenta y reintenta. El éxito se anuncia solo después de verificar el borrado.')}</Label></>}
 </ModalFrame></ActiveTabModal>}</Panel>;
}


