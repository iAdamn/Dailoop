import React, { useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { deriveReminders, formatDateTime, getPlanning, localDate, localDateTime, localDateTimeCandidates, selectActivities } from '../domain';
import type { CommandResult, CurrentActivity, DomainState, PlanningCommand, Reminder } from '../domain';
import { Button, Chip, Empty, Field, Heading, Label, ModalFrame, Panel, s, Toggle, useColors } from './components';
import { KeyboardScrollView } from './keyboard';
import { ActiveTabModal } from './navigation';
import { typefaces } from './typography';
import { ActivityForm, type SubmitCommand } from './forms';
import { CalendarField } from './CalendarField';

type SavePlanning = (command: PlanningCommand, operationId?: string) => Promise<void>;
type ReminderFilter = 'pending' | 'done' | 'archived';
const leadOptions = [1440, 180, 60, 30, 0];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo guardar. Puedes volver a intentarlo.';

export interface RemindersScreenProps {
  state: DomainState;
  nowMs: number;
  readOnly?: boolean;
  onSave: SavePlanning;
  onCreateActivity?: SubmitCommand;
  onComplete(reminderId: string): Promise<void>;
  notificationStatus: string;
  onEnableNotifications(): Promise<void>;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function reminderLeadLabel(minutes: number) {
  if (minutes === 0) return 'Al momento';
  if (minutes === 1440) return '1 día antes';
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hora' : 'horas'} antes`;
  return `${minutes} min antes`;
}

function NotificationAvailability({ status, onEnable }: { status: string; onEnable(): Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const browser = Platform.OS === 'web' || status === 'unsupported';
  async function enable() {
    if (pending) return;
    setPending(true); setError('');
    try { await onEnable(); } catch (e) { setError(errorText(e)); } finally { setPending(false); }
  }
  return <View style={{ gap: 8 }}>
    <Label small>{browser
      ? 'Puedes organizar y completar recordatorios aquí. Los avisos se envían desde la app Android, con tu permiso.'
      : status === 'granted'
        ? 'Notificaciones permitidas. Elige los avisos de cada recordatorio; funcionan sin internet.'
        : status === 'error'
          ? 'No se pudieron programar los avisos. Tus recordatorios están guardados; revisa el permiso y vuelve a intentarlo.'
        : status === 'denied'
          ? 'Las notificaciones están desactivadas. Puedes seguir usando los recordatorios; actívalas en los ajustes de Android para recibir avisos.'
          : 'Recibir avisos es opcional. Los recordatorios y el registro funcionan también sin notificaciones.'}</Label>
    {!browser && status !== 'granted' && <Button secondary compact label={status === 'denied' ? 'Revisar permiso de notificaciones' : 'Permitir notificaciones'}
      disabled={pending} onPress={enable}>{pending ? 'Comprobando…' : status === 'denied' ? 'Revisar permiso' : 'Permitir notificaciones'}</Button>}
    {!!error && <Label small strong>! {error}</Label>}
  </View>;
}

/** Retained with the other tabs; inactive dialogs are excluded from the native tree. */
export function RemindersScreen({ state, nowMs, readOnly = false, onSave, onCreateActivity, onComplete, notificationStatus, onEnableNotifications, header, footer }: RemindersScreenProps) {
  const colors = useColors();
  const activities = useMemo(() => selectActivities(state, { includeArchived: true }), [state]);
  const activityById = useMemo(() => new Map(activities.map(activity => [activity.id, activity])), [activities]);
  const reminders = useMemo(() => deriveReminders(state, nowMs), [state, nowMs]);
  const planning = useMemo(() => getPlanning(state), [state]);
  const dueFormatter = useMemo(() => new Intl.DateTimeFormat('es-CO', { timeZone: state.settings.zone, dateStyle: 'medium', timeStyle: 'short', hour12: state.settings.hourFormat === '12h' }), [state.settings.zone, state.settings.hourFormat]);
  const [filter, setFilter] = useState<ReminderFilter>('pending');
  const [form, setForm] = useState<{ reminder?: Reminder } | null>(null);
  const [streakSettings, setStreakSettings] = useState(false);
  const [archive, setArchive] = useState<Reminder | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const persist = usePlanningSave(onSave);
  const filtered = reminders.filter(reminder => filter === 'pending'
    ? reminder.status === 'pending' || reminder.status === 'overdue'
    : reminder.status === filter);
  const activeActivities = activities.filter(activity => !activity.isArchived);
  async function complete(reminderId: string) {
    if (readOnly || pendingRef.current) return;
    pendingRef.current = true;
    setPending(reminderId); setError('');
    try { await onComplete(reminderId); } catch (e) { setError(errorText(e)); } finally { pendingRef.current = false; setPending(null); }
  }
  async function archiveReminder(afterSave: () => void) {
    if (!archive || readOnly || pendingRef.current) return;
    pendingRef.current = true;
    setPending(archive.id); setError('');
    try {
      await persist({ type: 'archiveReminder', reminderId: archive.id, archived: true });
      afterSave();
    } catch (e) { setError(errorText(e)); } finally { pendingRef.current = false; setPending(null); }
  }
  return <KeyboardScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screen}>
    {header}
    <Heading subtitle="Un momento para cada actividad, con los avisos que elijas.">Recordatorios</Heading>
    <View style={s.wrap}>
      <Button disabled={readOnly || (activeActivities.length === 0 && !onCreateActivity)} onPress={() => { setError(''); setForm({}); }}>+ Nuevo recordatorio</Button>
      <Button secondary label="Configurar avisos de racha" onPress={() => setStreakSettings(true)}>🔥 Avisos de racha</Button>
    </View>
    {activeActivities.length === 0 && <Label small>{onCreateActivity ? 'Puedes crear tu primera actividad al preparar un recordatorio.' : 'Crea una actividad en Registro para vincular tu primer recordatorio.'}</Label>}
    <NotificationAvailability status={notificationStatus} onEnable={onEnableNotifications} />
    <View style={s.wrap}>
      <Chip selected={filter === 'pending'} label="Recordatorios pendientes" onPress={() => setFilter('pending')}>Pendientes</Chip>
      <Chip selected={filter === 'done'} label="Recordatorios completados" onPress={() => setFilter('done')}>Completados</Chip>
      <Chip selected={filter === 'archived'} label="Recordatorios archivados" onPress={() => setFilter('archived')}>Archivados</Chip>
    </View>
    {!!error && !archive && <Label strong>! {error}</Label>}
    {filtered.length === 0 && <Empty symbol={filter === 'done' ? '✓' : '◷'}
      title={filter === 'done' ? 'Todavía sin completados' : filter === 'archived' ? 'Sin recordatorios archivados' : 'Tu próximo momento'}
      text={filter === 'pending' ? 'Elige una actividad y cuándo quieres hacerla. Un aviso nunca registra la actividad por ti.' : filter === 'done' ? 'Al completar un recordatorio se guarda un único registro en su actividad.' : 'Aquí aparecerán los recordatorios que archives.'} />}
    {filtered.map(reminder => {
      const activity = activityById.get(reminder.activityId);
      const done = reminder.status === 'done';
      const archived = reminder.status === 'archived';
      return <Panel key={reminder.id} tint={activity?.color}>
        <View style={s.row}>
          <Text accessible={false} style={styles.emoji}>{activity?.emoji || '◷'}</Text>
          <View style={s.flex}>
            <Text accessibilityRole="header" style={[styles.activityName, { color: colors.text }]}>{activity?.name || 'Actividad no disponible'}</Text>
            <Label small>{dueFormatter.format(reminder.dueAtMs)}</Label>
          </View>
        </View>
        <Label small strong>{archived ? 'Archivado' : done ? '✓ Completado · registrado en la actividad' : reminder.status === 'overdue' ? 'Pendiente · pasó la hora prevista' : 'Pendiente'}</Label>
        {activity?.isArchived && <Label small>La actividad está archivada. Sus avisos están suspendidos.</Label>}
        <Label small>{reminder.notifications
          ? `Avisos: ${reminder.leadMinutes.map(reminderLeadLabel).join(' · ')}`
          : 'Sin avisos · lo verás aquí'}</Label>
        {!done && !archived && <View style={s.wrap}>
          <Button compact label={`Completar recordatorio de ${activity?.name || 'actividad'}`} disabled={readOnly || !!pending || !activity || activity.isArchived}
            busy={pending === reminder.id} onPress={() => complete(reminder.id)}>✓ Hecho, registrar</Button>
          <Button secondary compact label={`Editar recordatorio de ${activity?.name || 'actividad'}`} disabled={readOnly || !!pending}
            onPress={() => { setError(''); setForm({ reminder }); }}>Editar</Button>
        </View>}
        {!archived && <Button subtle compact label={`Archivar recordatorio de ${activity?.name || 'actividad'}`} disabled={readOnly || !!pending}
          onPress={() => { setError(''); setArchive(reminder); }}>Archivar</Button>}
      </Panel>;
    })}
    {footer}
    <ActiveTabModal>
      {form && <ReminderForm activities={activities} reminder={form.reminder} nowMs={nowMs} zone={state.settings.zone}
        readOnly={readOnly} onClose={() => setForm(null)} onSave={onSave} onCreateActivity={onCreateActivity}
        notificationStatus={notificationStatus} onEnableNotifications={onEnableNotifications} />}
      {streakSettings && <StreakAlertForm value={planning.streakAlerts} readOnly={readOnly} onClose={() => setStreakSettings(false)}
        onSave={onSave} notificationStatus={notificationStatus} onEnableNotifications={onEnableNotifications} />}
      {archive && <ModalFrame title="Archivar recordatorio" subtitle={activityById.get(archive.activityId)?.name}
        canClose={!pending} onClose={() => { if (!pending) { setArchive(null); setError(''); } }}>
        {({ closeWith, isClosing }) => <>
        <Label>Dejará de enviar avisos. Los registros ya guardados de la actividad se conservan.</Label>
        {!!error && <Label strong>! {error}</Label>}
        <Button busy={pending === archive.id} disabled={readOnly || isClosing} onPress={() => archiveReminder(() => closeWith(() => setArchive(null)))}>Archivar recordatorio</Button>
        <Button secondary disabled={!!pending || isClosing} onPress={() => closeWith(() => { setArchive(null); setError(''); })}>Cancelar</Button>
        </>}
      </ModalFrame>}
    </ActiveTabModal>
  </KeyboardScrollView>;
}

function DiscardDraft({ onContinue, onDiscard }: { onContinue(): void; onDiscard(): void }) {
  return <Panel><Label strong>Hay cambios sin guardar</Label><Label>Si cierras ahora, perderás los cambios de este formulario.</Label>
    <Button secondary onPress={onContinue}>Seguir editando</Button><Button secondary onPress={onDiscard}>Descartar cambios</Button></Panel>;
}

function usePlanningSave(onSave: SavePlanning) {
  const attempt = useRef<{ signature: string; operationId: string } | null>(null);
  return async (command: PlanningCommand) => {
    const signature = JSON.stringify(command);
    if (attempt.current?.signature !== signature) attempt.current = { signature, operationId: randomUUID() };
    await onSave(command, attempt.current.operationId);
  };
}

export function ReminderForm({ activities, reminder, nowMs, zone, readOnly = false, onClose, onSave, onCreateActivity, notificationStatus, onEnableNotifications }: {
  activities: CurrentActivity[]; reminder?: Reminder; nowMs: number; zone: string; readOnly?: boolean;
  onClose(): void; onSave: SavePlanning; onCreateActivity?: SubmitCommand; notificationStatus: string; onEnableNotifications(): Promise<void>;
}) {
  const [initial] = useState(() => localDateTime(reminder?.dueAtMs ?? Math.ceil((nowMs + 3_600_000) / 60_000) * 60_000, zone));
  const [identity] = useState(() => reminder ? { id: reminder.id, completionEntryId: reminder.completionEntryId } : { id: randomUUID(), completionEntryId: randomUUID() });
  const [activityId, setActivityId] = useState(reminder?.activityId || '');
  const [date, setDate] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11, 16));
  const [choice, setChoice] = useState<number | null>(reminder?.dueAtMs ?? null);
  const [leadMinutes, setLeadMinutes] = useState<number[]>(reminder?.leadMinutes || [0]);
  const [notifications, setNotifications] = useState(reminder?.notifications ?? false);
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours'>('minutes');
  const [customError, setCustomError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [creatingActivity, setCreatingActivity] = useState(false);
  const creationId = useRef<string | null>(null);
  const [createdActivities, setCreatedActivities] = useState<CurrentActivity[]>([]);
  const persist = usePlanningSave(onSave);
  // A confirmed result can arrive before the parent publishes its refreshed snapshot.
  const allActivities = [...activities, ...createdActivities.filter(created => !activities.some(activity => activity.id === created.id))];
  const currentActivity = allActivities.find(activity => activity.id === activityId);
  const available = allActivities.filter(activity => !activity.isArchived || reminder?.activityId === activity.id);
  let candidates: number[] = [];
  let timeError = '';
  try {
    candidates = localDateTimeCandidates(`${date}T${time}:00`, zone);
    if (candidates.length === 0) timeError = 'Esta hora no existe en la zona elegida por un cambio de horario.';
  } catch { timeError = 'Elige una fecha y escribe una hora HH:mm válidas.'; }
  const resolved = candidates.length === 1 ? candidates[0] : candidates.includes(choice ?? NaN) ? choice : null;
  const unchangedTime = !!reminder && date === initial.slice(0, 10) && time === initial.slice(11, 16)
    && (candidates.length <= 1 || choice === reminder.dueAtMs);
  const dueAtMs = unchangedTime && reminder ? reminder.dueAtMs : resolved;
  const past = dueAtMs != null && dueAtMs <= nowMs;
  const dirty = activityId !== (reminder?.activityId || '') || date !== initial.slice(0, 10) || time !== initial.slice(11, 16)
    || (!!reminder && candidates.length > 1 && choice !== reminder.dueAtMs)
    || notifications !== (reminder?.notifications ?? false) || JSON.stringify(leadMinutes) !== JSON.stringify(reminder?.leadMinutes || [0]) || !!customValue;
  // A passed reminder can be edited only after choosing a new future date.
  const valid = !readOnly && !!currentActivity && !currentActivity.isArchived && !timeError && dueAtMs != null && !past
    && (!notifications || leadMinutes.length > 0) && (!reminder || dirty);
  const toggleLead = (minutes: number) => {
    setCustomError('');
    if (leadMinutes.includes(minutes)) setLeadMinutes(leadMinutes.filter(value => value !== minutes));
    else if (leadMinutes.length < 16) setLeadMinutes([...leadMinutes, minutes].sort((a, b) => b - a));
    else setCustomError('Puedes elegir hasta 16 avisos por recordatorio.');
  };
  const addCustom = () => {
    const value = /^\d+$/.test(customValue.trim()) ? Number(customValue.trim()) * (customUnit === 'hours' ? 60 : 1) : NaN;
    if (!Number.isSafeInteger(value) || value < 0 || value > 525_600) { setCustomError('Elige minutos u horas enteras entre 0 y un año de anticipación.'); return; }
    if (leadMinutes.includes(value)) { setCustomError('Este aviso ya está seleccionado.'); return; }
    if (leadMinutes.length >= 16) { setCustomError('Puedes elegir hasta 16 avisos por recordatorio.'); return; }
    setLeadMinutes([...leadMinutes, value].sort((a, b) => b - a)); setCustomValue(''); setCustomError('');
  };
  const save = async (afterSave: () => void) => {
    if (!valid || dueAtMs == null || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const fields = { dueAtMs, leadMinutes, notifications };
      await persist(reminder
        ? { type: 'updateReminder', reminderId: reminder.id, changes: fields }
        : { type: 'createReminder', ...identity, activityId, ...fields });
      afterSave();
    } catch (e) { setError(errorText(e)); } finally { savingRef.current = false; setSaving(false); }
  };
  const submitActivity: SubmitCommand = async command => {
    if (readOnly || !onCreateActivity || command.type !== 'createActivity') throw new Error('No se puede crear una actividad en esta vista.');
    const id = creationId.current;
    if (!id) throw new Error('Vuelve a abrir el formulario de actividad.');
    const result = await onCreateActivity({ ...command, id }, `reminder-create-activity-${id}`);
    const confirmed = result as CommandResult | undefined;
    if (confirmed?.state) {
      const created = selectActivities(confirmed.state).find(activity => activity.id === id);
      if (created) setCreatedActivities(previous => [...previous.filter(activity => activity.id !== id), created]);
    }
    setActivityId(id);
    return result;
  };
  if (creatingActivity) return <ActivityForm activities={allActivities} submit={submitActivity}
    onClose={() => setCreatingActivity(false)} />;
  return <ModalFrame title={reminder ? 'Editar recordatorio' : 'Nuevo recordatorio'} subtitle="Completarlo guardará un registro en la actividad elegida."
    canClose={!dirty && !saving} onClose={() => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } }}>
    {({ closeWith, isClosing }) => discard ? <DiscardDraft onContinue={() => setDiscard(false)} onDiscard={() => closeWith(onClose)} /> : <>
      <Label strong>Actividad vinculada</Label>
      {reminder ? <Label>{currentActivity?.emoji} {currentActivity?.name || 'Actividad no disponible'}</Label>
        : <View style={s.wrap}>{available.map(activity => <Chip key={activity.id} selected={activityId === activity.id}
          label={`Elegir actividad ${activity.name}`} disabled={readOnly || saving}
          onPress={() => setActivityId(activity.id)}>{activity.emoji} {activity.name}</Chip>)}</View>}
      {!reminder && onCreateActivity && <Button secondary compact disabled={readOnly || saving || isClosing}
        label="Crear una actividad para este recordatorio" onPress={() => closeWith(() => { creationId.current = randomUUID(); setCreatingActivity(true); })}>+ Crear actividad</Button>}
      {reminder && <Label small>Para vincular otra actividad, crea otro recordatorio.</Label>}
      <Label small>Zona de la fecha introducida: {zone}</Label>
      <CalendarField label="Fecha del recordatorio" value={date} minDate={localDate(nowMs, zone)} disabled={readOnly || saving}
        onChange={value => { setDate(value); setChoice(null); }} />
      <Field label="Hora del recordatorio (HH:mm, 24 horas)" value={time} autoCapitalize="none" placeholder="15:30"
        onChangeText={value => { setTime(value); setChoice(null); }} />
      {!!timeError && <Label small strong>! {timeError}</Label>}
      {past && <Label small strong>! Elige una fecha y hora futura para el recordatorio.</Label>}
      {candidates.length > 1 && <Panel><Label strong>Esta hora ocurre dos veces</Label><Label small>Elige explícitamente el desfase que corresponde.</Label>
        {candidates.map(value => <Chip key={value} selected={choice === value} onPress={() => setChoice(value)}>{formatDateTime(value, zone)}</Chip>)}
      </Panel>}
      <Toggle label="Avisos de este recordatorio" detail="Elige varias anticipaciones o déjalo sin notificaciones." value={notifications} onChange={setNotifications} />
      {notifications && <>
        <Label strong>Cuándo avisarte</Label>
        <View style={s.wrap}>{leadOptions.map(minutes => <Chip key={minutes} label={reminderLeadLabel(minutes)} selected={leadMinutes.includes(minutes)}
          onPress={() => toggleLead(minutes)}>{reminderLeadLabel(minutes)}</Chip>)}</View>
        {leadMinutes.filter(minutes => !leadOptions.includes(minutes)).length > 0 && <View style={s.wrap}>
          {leadMinutes.filter(minutes => !leadOptions.includes(minutes)).map(minutes => <Chip key={minutes} selected label={`Quitar aviso ${reminderLeadLabel(minutes)}`}
            onPress={() => toggleLead(minutes)}>{reminderLeadLabel(minutes)} ×</Chip>)}
        </View>}
        <View style={s.wrap}>
          <Field containerStyle={{ flex: 1, minWidth: 120 }} label="Anticipación personalizada" value={customValue} keyboardType="number-pad"
            placeholder="Por ejemplo, 15" onChangeText={value => { setCustomValue(value); setCustomError(''); }} />
        </View>
        <View style={s.wrap}>
          <Chip selected={customUnit === 'minutes'} onPress={() => setCustomUnit('minutes')}>Minutos</Chip>
          <Chip selected={customUnit === 'hours'} onPress={() => setCustomUnit('hours')}>Horas</Chip>
          <Button secondary compact disabled={!customValue.trim()} onPress={addCustom}>Añadir aviso</Button>
        </View>
        {!!customError && <Label small strong>! {customError}</Label>}
        {leadMinutes.length === 0 && <Label small>Selecciona al menos un aviso o desactiva las notificaciones.</Label>}
        {dueAtMs != null && leadMinutes.some(minutes => dueAtMs - minutes * 60_000 <= nowMs) && <Label small>Los avisos cuya hora ya haya pasado se omitirán; no se enviarán todos de golpe.</Label>}
        <NotificationAvailability status={notificationStatus} onEnable={onEnableNotifications} />
      </>}
      {currentActivity?.isArchived && <Label small strong>La actividad está archivada. Actívala en Registro antes de guardar este recordatorio.</Label>}
      {!!error && <Label strong>! {error}</Label>}
      <Button disabled={!valid || isClosing} busy={saving} onPress={() => save(() => closeWith(onClose))}>{reminder ? 'Guardar recordatorio' : 'Crear recordatorio'}</Button>
    </>}
  </ModalFrame>;
}

function StreakAlertForm({ value, readOnly = false, onClose, onSave, notificationStatus, onEnableNotifications }: {
  value: { enabled: boolean; hour: number; minute: number }; readOnly?: boolean; onClose(): void;
  onSave: SavePlanning; notificationStatus: string; onEnableNotifications(): Promise<void>;
}) {
  const [enabled, setEnabled] = useState(value.enabled);
  const [time, setTime] = useState(`${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const persist = usePlanningSave(onSave);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const hour = match ? Number(match[1]) : NaN;
  const minute = match ? Number(match[2]) : NaN;
  const validTime = hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  const dirty = enabled !== value.enabled || time !== `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
  async function save(afterSave: () => void) {
    if (readOnly || !validTime || !dirty || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try { await persist({ type: 'setStreakAlerts', enabled, hour, minute }); afterSave(); }
    catch (e) { setError(errorText(e)); } finally { savingRef.current = false; setSaving(false); }
  }
  return <ModalFrame title="Avisos de racha" subtitle="Una ayuda opcional antes de terminar el día."
    canClose={!dirty && !saving} onClose={() => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } }}>
    {({ closeWith, isClosing }) => discard ? <DiscardDraft onContinue={() => setDiscard(false)} onDiscard={() => closeWith(onClose)} /> : <>
      <Toggle label="Recordarme mantener las rachas" detail="Un aviso si aún no registraste hoy una actividad con racha vigente." value={enabled} onChange={setEnabled} />
      <Label small>Varios registros el mismo día cuentan como un solo día. La racha crece al registrar la actividad en días consecutivos.</Label>
      <Field label="Hora del aviso de racha (HH:mm, 24 horas)" value={time} onChangeText={setTime} placeholder="22:00" autoCapitalize="none" />
      {!validTime && <Label small strong>! Escribe una hora válida entre 00:00 y 23:59.</Label>}
      <Label small>Se usa la zona horaria elegida en Ajustes. Al registrar la actividad, se cancelan sus avisos de racha pendientes.</Label>
      <NotificationAvailability status={notificationStatus} onEnable={onEnableNotifications} />
      {!!error && <Label strong>! {error}</Label>}
      <Button disabled={readOnly || !validTime || !dirty || isClosing} busy={saving} onPress={() => save(() => closeWith(onClose))}>Guardar avisos de racha</Button>
    </>}
  </ModalFrame>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 5, paddingHorizontal: 23, paddingBottom: 24, gap: 18 },
  emoji: { fontSize: 30, width: 42, textAlign: 'center' },
  activityName: { fontFamily: typefaces.semibold, fontSize: 18, lineHeight: 25 },
});
