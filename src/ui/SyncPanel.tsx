import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '../i18n/react';
import { localizeError } from '../i18n/errors';
import type { CloudSyncProps, CloudSyncStatus } from '../sync/types';
import { Button, Label, ModalFrame, Panel, s } from './components';
import { ActiveTabModal } from './navigation';
import { AccountPrivacy } from './AccountPrivacy';

const statusMessages: Record<CloudSyncStatus, string> = {
  'not-configured': 'Configuración pendiente', disconnected: 'Sin cuenta conectada', paused: 'Sincronización pausada',
  idle: 'Sincronización activa', syncing: 'Sincronizando…', offline: 'Sin conexión: tus cambios quedan en este dispositivo',
  conflict: 'Hay cambios que necesitan tu revisión', error: 'No se pudo sincronizar',
};
type Dialog = 'enable' | 'sign-out' | 'conflict' | 'local' | 'remote' | 'copies' | null;

/** Presentation only: authentication and synchronization remain separate explicit actions. */
export function SyncPanel({ view, actions }: CloudSyncProps) {
  // Consent belongs to one account/context and cannot survive an identity change.
  return <SyncPanelContent key={JSON.stringify([view.account?.uid, view.configured, view.demo, view.readOnly])} view={view} actions={actions} />;
}
function SyncPanelContent({ view, actions }: CloudSyncProps) {
  const { t, locale, language } = useI18n();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const lock = useRef(false);
  const blocked = view.demo || view.readOnly || !view.configured || !!view.deleting;
  const inFlight = busy || view.status === 'syncing';
  const accountBlocked = blocked || !view.account || view.boundToOtherAccount;
  async function run(action: () => Promise<void>, after?: () => void) {
    if (blocked || inFlight || lock.current) return;
    lock.current = true;
    setBusy(true); setActionError(null);
    try { await action(); after?.(); }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  const error = actionError || view.error;
  const showError = error ? <Label small strong>! {localizeError(language, error)}</Label> : null;
  const canSync = !accountBlocked && !inFlight && view.enabled && !view.conflict;
  const lastSync = view.lastSyncedAt != null && Number.isSafeInteger(view.lastSyncedAt) && view.lastSyncedAt >= 0 && view.lastSyncedAt <= 8.64e15
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(view.lastSyncedAt) : null;
  return <>
    <Panel>
      <Label strong>{t('Cuenta y sincronización')}</Label>
      <Label small>{t('Opcional. Dailoop sigue funcionando sin cuenta y sin internet. Tus actividades se guardan primero en este dispositivo.')}</Label>
      <Label strong>{t(statusMessages[view.configured ? view.status : 'not-configured'])}</Label>
      {!view.configured && <Label small>{t('La conexión online todavía no está disponible. Puedes seguir usando todos tus datos locales.')}</Label>}
      {view.demo && <Label small>{t('La demostración no se conecta a cuentas ni sube datos.')}</Label>}
      {view.readOnly && <Label small>{t('La sincronización está desactivada mientras esta base está en modo de solo lectura.')}</Label>}
      {view.account ? <>
        {!!view.account.displayName && <Label strong>{view.account.displayName}</Label>}
        <Label small>{view.account.email}</Label>
        {view.boundToOtherAccount && <Label small strong>{t('Estos datos locales están vinculados a otra cuenta. Conecta esa misma cuenta para sincronizarlos. No se mezclarán cuentas.')}</Label>}
        {!!lastSync && <Label small>{t('Última sincronización: {date}', { date: lastSync })}</Label>}
        {view.pending && <Label small>{t('Hay cambios locales pendientes. Se conservan aunque no tengas conexión.')}</Label>}
        {!view.enabled && <>
          <Label small>{t('Conectar una cuenta no sube tus datos. Activa la sincronización cuando quieras compartirlos con tus otros dispositivos.')}</Label>
          <Button disabled={accountBlocked || inFlight} onPress={() => setDialog('enable')}>{t(lastSync ? 'Reanudar sincronización' : 'Activar sincronización')}</Button>
        </>}
        {view.enabled && <View style={s.stack}>
          <Button disabled={!canSync} onPress={() => run(actions.synchronize)}>{t('Sincronizar ahora')}</Button>
          <Button secondary disabled={blocked || inFlight} onPress={() => run(actions.pause)}>{t('Pausar sincronización')}</Button>
        </View>}
        {!!view.conflict && <Button secondary disabled={accountBlocked || inFlight} onPress={() => setDialog('conflict')}>{t('Revisar cambios')}</Button>}
        <Button secondary disabled={blocked || inFlight} onPress={() => setDialog('sign-out')}>{t('Cerrar sesión')}</Button>
        {actions.exportRecoveryCopy && (actions.loadRecoveryCopies || !!view.recoveryCopies?.length) && <Button secondary disabled={blocked || inFlight} onPress={() => run(async () => { await actions.loadRecoveryCopies?.(); }, () => setDialog('copies'))}>{t('Copias de recuperación')}</Button>}
      </> : <Button disabled={blocked || inFlight} onPress={() => run(actions.signIn)}>{t('Conectar con Google')}</Button>}
      {showError}
    </Panel>
    <AccountPrivacy view={view} actions={actions} />
    {!!dialog && <ActiveTabModal><ModalFrame canClose={!inFlight} interactionDisabled={blocked}
      title={t(dialog === 'enable' ? 'Activar sincronización' : dialog === 'sign-out' ? 'Cerrar sesión' : dialog === 'copies' ? 'Copias de recuperación' : dialog === 'conflict' ? 'Revisar cambios' : 'Confirmar versión')}
      onClose={() => !inFlight && setDialog(null)}>{({ closeWith }) => <>
      {dialog === 'enable' && <>
        <Label>{t('Se enviarán a tu cuenta tus actividades, registros, notas, historial de cambios y recordatorios, incluidos los datos marcados como privados. Privado no significa cifrado de extremo a extremo.')}</Label>
        <Label>{t('Los datos de tu cuenta se descargarán aquí. Si hay versiones incompatibles, podrás revisarlas antes de elegir. El uso sin conexión seguirá disponible.')}</Label>
        <Button disabled={accountBlocked || inFlight} onPress={() => run(actions.enable, () => closeWith(() => setDialog(null)))}>{t('Confirmar y activar')}</Button>
      </>}
      {dialog === 'sign-out' && <>
        <Label>{t('Se detendrá la sincronización. Tus datos permanecerán en este dispositivo y en tu cuenta. No se borrará nada de la nube.')}</Label>
        <Label>{t('Esta base conservará su vínculo con la cuenta original para impedir que sus datos se suban a una cuenta distinta.')}</Label>
        <Button disabled={blocked || inFlight} onPress={() => run(actions.signOut, () => closeWith(() => setDialog(null)))}>{t('Confirmar cierre de sesión')}</Button>
      </>}
      {dialog === 'conflict' && view.conflict && <>
        <Label>{t('Ambas versiones se conservarán. Guarda sus copias antes de decidir qué versión usar como vista actual.')}</Label>
        <Panel><Label strong>{t('Este dispositivo')}</Label><Label>{t('{activities} actividades · {entries} registros', { activities: view.conflict.localActivities, entries: view.conflict.localEntries })}</Label>
          <Button secondary disabled={accountBlocked || inFlight} onPress={() => run(() => actions.exportConflict('local'))}>{t('Guardar copia local')}</Button>
        </Panel>
        <Panel><Label strong>{t('Tu cuenta online')}</Label><Label>{t('{activities} actividades · {entries} registros', { activities: view.conflict.remoteActivities, entries: view.conflict.remoteEntries })}</Label>
          <Button secondary disabled={accountBlocked || inFlight} onPress={() => run(() => actions.exportConflict('remote'))}>{t('Guardar copia online')}</Button>
        </Panel>
        <Button secondary disabled={accountBlocked || inFlight} onPress={() => setDialog('local')}>{t('Usar versión de este dispositivo')}</Button>
        <Button secondary disabled={accountBlocked || inFlight} onPress={() => setDialog('remote')}>{t('Usar versión de mi cuenta')}</Button>
      </>}
      {dialog === 'copies' && <>
        <Label>{t('Versiones conservadas antes de combinar o elegir cambios. Puedes guardar una copia y restaurarla desde Tus datos.')}</Label>
        {!view.recoveryCopies?.length && <Label small>{t('Todavía no hay copias de recuperación.')}</Label>}
        {view.recoveryCopies?.map(copy => <Panel key={copy.version}>
          <Label strong>{copy.createdAt != null && Number.isSafeInteger(copy.createdAt) && copy.createdAt >= 0 && copy.createdAt <= 8.64e15 ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(copy.createdAt) : t('Versión {version}', { version: copy.version.slice(0, 8) })}</Label>
          {copy.activities != null && copy.entries != null && <Label small>{t('{activities} actividades · {entries} registros', { activities: copy.activities, entries: copy.entries })}</Label>}
          <Button secondary disabled={inFlight || !actions.exportRecoveryCopy} onPress={() => run(() => actions.exportRecoveryCopy!(copy.version))}>{t('Guardar copia de recuperación')}</Button>
        </Panel>)}
      </>}
      {(dialog === 'local' || dialog === 'remote') && <>
        <Label strong>{t(dialog === 'local' ? 'Se usará la versión de este dispositivo.' : 'Se usará la versión de tu cuenta online.')}</Label>
        <Label>{t('La otra versión quedará guardada como copia de recuperación. Esta elección no combina los cambios automáticamente.')}</Label>
        <Button disabled={accountBlocked || inFlight || !view.conflict} onPress={() => {
          const side = dialog;
          if (side === 'local' || side === 'remote') void run(() => actions.resolve(side), () => closeWith(() => setDialog(null)));
        }}>{t('Confirmar esta versión')}</Button>
        <Button secondary disabled={inFlight} onPress={() => setDialog('conflict')}>{t('Volver a revisar')}</Button>
      </>}
      {showError}
      <Button secondary disabled={inFlight} onPress={() => closeWith(() => setDialog(null))}>{t('Cancelar')}</Button>
    </>}</ModalFrame></ActiveTabModal>}
  </>;
}
