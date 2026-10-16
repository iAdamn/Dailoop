import { useI18n } from '../i18n/react';
import { localizeError } from '../i18n/errors';
import { translate, type AppLanguage } from '../i18n/core';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { deriveReminders, formatDateTime, getPlanning, localDate, localDateTime, localDateTimeCandidates, nextReminderDueAt, selectActivities } from '../domain';
import type { CommandResult, CurrentActivity, DerivedReminder, DomainState, PlanningCommand, Reminder, ReminderRecurrence } from '../domain';
import { Button, Chip, Empty, Field, Heading, Label, ModalFrame, Panel, s, Toggle, useColors } from './components';
import { ActiveTabModal, useActiveTab } from './navigation';
import { typefaces } from './typography';
import { ActivityForm, type SubmitCommand } from './forms';
import { CalendarField } from './CalendarField';
import { TimeField } from './TimeField';
import { LeadTimePicker } from './LeadTimePicker';

type SavePlanning = (command: PlanningCommand, operationId?: string) => Promise<void>;
type ReminderFilter = 'pending' | 'done' | 'skipped' | 'archived';
const leadOptions = [1440, 180, 60, 30, 0];
const weekdays = [{ day: 1, label: 'Lunes' }, { day: 2, label: 'Martes' }, { day: 3, label: 'Miércoles' }, { day: 4, label: 'Jueves' }, { day: 5, label: 'Viernes' }, { day: 6, label: 'Sábado' }, { day: 7, label: 'Domingo' }];
export function repetitionLabel(value?: ReminderRecurrence | null, language: AppLanguage = 'es') {
  const t = (source: string) => translate(language, source);
  return !value ? t('Una vez') : value.weekdays.length === 7 ? t('Todos los días') : weekdays.filter(day => value.weekdays.includes(day.day)).map(day => t(day.label)).join(' · ');
}
const errorText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo guardar. Puedes volver a intentarlo.';

export interface RemindersScreenProps {
  state: DomainState;
  nowMs: number;
  readOnly?: boolean;
  onSave: SavePlanning;
  onCreateActivity?: SubmitCommand;
  onComplete(reminderId: string, dueAtMs?: number): Promise<void>;
  notificationStatus: string;
  onEnableNotifications(): Promise<void>;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function reminderLeadLabel(minutes: number, language: AppLanguage = 'es') {
  const t = (source: string, params?: Record<string, string | number>) => translate(language, source, params);
  if (minutes === 0) return t('Al momento');
  if (minutes === 1440) return t('1 día antes');
  if (minutes % 60 === 0) return t(minutes === 60 ? '{count} hora antes' : '{count} horas antes', { count: minutes / 60 });
  return t('{count} min antes', { count: minutes });
}

function NotificationAvailability({ status, onEnable }: { status: string; onEnable(): Promise<void> }) {
  const { t, language } = useI18n();
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
      ? t("Puedes organizar y completar recordatorios aquí. Los avisos se envían desde la app Android, con tu permiso.")
      : status === 'granted'
        ? t("Notificaciones permitidas. Elige los avisos de cada recordatorio; funcionan sin internet.")
        : status === 'error'
          ? t("No se pudieron programar los avisos. Tus recordatorios están guardados; revisa el permiso y vuelve a intentarlo.")
        : status === 'denied'
          ? t("Las notificaciones están desactivadas. Puedes seguir usando los recordatorios; actívalas en los ajustes de Android para recibir avisos.")
          : t("Recibir avisos es opcional. Los recordatorios y el registro funcionan también sin notificaciones.")}</Label>
    {!browser && status !== 'granted' && <Button secondary compact label={status === 'denied' ? t("Revisar permiso de notificaciones") : t("Permitir notificaciones")}
      disabled={pending} onPress={enable}>{pending ? t("Comprobando…") : status === 'denied' ? t("Revisar permiso") : t("Permitir notificaciones")}</Button>}
    {!!error && <Label small strong>! {t(localizeError(language, error))}</Label>}
  </View>;
}

/** Retained with the other tabs; inactive dialogs are excluded from the native tree. */
export function RemindersScreen({ state, nowMs, readOnly = false, onSave, onCreateActivity, onComplete, notificationStatus, onEnableNotifications, header, footer }: RemindersScreenProps) {
  const { t, language, locale } = useI18n();
  const colors = useColors();
  const activities = useMemo(() => selectActivities(state, { includeArchived: true }), [state]);
  const activityById = useMemo(() => new Map(activities.map(activity => [activity.id, activity])), [activities]);
  const active = useActiveTab();
  const current = useMemo(() => active ? deriveReminders(state, nowMs) : null, [state, nowMs, active]);
  const [retained, setRetained] = useState(current);
  // Update only this component's retained snapshot during rendering. An effect
  // would display an empty/stale frame when activating or confirming a record.
  if (current !== null && current !== retained) setRetained(current);
  const reminders = current ?? retained ?? [];
  const planning = useMemo(() => getPlanning(state), [state]);
  const dueFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: state.settings.zone, dateStyle: 'medium', timeStyle: 'short', hour12: state.settings.hourFormat === '12h' }), [state.settings.zone, state.settings.hourFormat, locale]);
  const [filter, setFilter] = useState<ReminderFilter>('pending');
  const [form, setForm] = useState<{ reminder?: Reminder } | null>(null);
  const [streakSettings, setStreakSettings] = useState(false);
  const [archive, setArchive] = useState<Reminder | null>(null);
  const [occurrenceAction,setOccurrenceAction]=useState<{kind:'snooze'|'skip';reminder:DerivedReminder;anchorMs:number}|null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const persist = usePlanningSave(onSave);
  const filtered = reminders.filter(reminder => filter === 'pending'
    ? reminder.status === 'pending' || reminder.status === 'overdue'
    : reminder.status === filter);
  const activeActivities = activities.filter(activity => !activity.isArchived);
  async function complete(reminderId: string, dueAtMs?: number) {
    if (readOnly || pendingRef.current) return;
    pendingRef.current = true;
    setPending(reminderId); setError('');
    try { await onComplete(reminderId, dueAtMs); } catch (e) { setError(errorText(e)); } finally { pendingRef.current = false; setPending(null); }
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
  async function saveOccurrenceAction(minutes:10|30|60|null,afterSave:()=>void) {
    if(!occurrenceAction||readOnly||pendingRef.current)return;
    pendingRef.current=true;setPending(occurrenceAction.reminder.id);setError('');
    const {reminder,anchorMs}=occurrenceAction;
    const command:PlanningCommand=minutes===null
      ?{type:'skipReminderOccurrence',reminderId:reminder.id,dueAtMs:reminder.dueAtMs}
      :{type:'snoozeReminderOccurrence',reminderId:reminder.id,dueAtMs:reminder.dueAtMs,snoozedUntilMs:anchorMs+minutes*60_000};
    try{await persist(command);afterSave();}
    catch(e){setError(errorText(e));}finally{pendingRef.current=false;setPending(null);}
  }
  return <>
    <FlatList data={filtered} style={s.flex} showsVerticalScrollIndicator={false}
      keyExtractor={reminder => `${reminder.id}:${reminder.dueAtMs}`}
      initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
      contentContainerStyle={styles.screen}
      ListHeaderComponent={<View style={s.stack}>
    {header}
    <Heading subtitle={t("Un momento para cada actividad, con los avisos que elijas.")}>{t("Recordatorios")}</Heading>
    <View style={s.wrap}>
      <Button disabled={readOnly || (activeActivities.length === 0 && !onCreateActivity)} onPress={() => { setError(''); setForm({}); }}>{t("+ Nuevo recordatorio")}</Button>
      <Button secondary label={t("Configurar avisos de racha")} onPress={() => setStreakSettings(true)}>{t("🔥 Avisos de racha")}</Button>
    </View>
    {activeActivities.length === 0 && <Label small>{onCreateActivity ? t("Puedes crear tu primera actividad al preparar un recordatorio.") : t("Crea una actividad en Registro para vincular tu primer recordatorio.")}</Label>}
    <NotificationAvailability status={notificationStatus} onEnable={onEnableNotifications} />
    <View style={s.wrap}>
      <Chip selected={filter === 'pending'} label={t("Recordatorios pendientes")} onPress={() => setFilter('pending')}>{t("Pendientes")}</Chip>
      <Chip selected={filter === 'done'} label={t("Recordatorios completados")} onPress={() => setFilter('done')}>{t("Completados")}</Chip>
      <Chip selected={filter === 'skipped'} label={t("Recordatorios omitidos")} onPress={() => setFilter('skipped')}>{t("Omitidos")}</Chip>
      <Chip selected={filter === 'archived'} label={t("Recordatorios archivados")} onPress={() => setFilter('archived')}>{t("Archivados")}</Chip>
    </View>
    {!!error && !archive && !occurrenceAction && <Label strong>! {t(localizeError(language, error))}</Label>}
</View>}
      ListEmptyComponent={<Empty symbol={filter === 'done' ? t("✓") : '◷'}
      title={filter === 'done' ? t("Todavía sin completados") : filter === 'skipped' ? t("Sin ocasiones omitidas") : filter === 'archived' ? t("Sin recordatorios archivados") : t("Tu próximo momento")}
      text={filter === 'pending' ? t("Elige una actividad y cuándo quieres hacerla. Un aviso nunca registra la actividad por ti.") : filter === 'done' ? t("Al completar un recordatorio se guarda un único registro en su actividad.") : filter === 'skipped' ? t("Omitir una ocasión conserva la siguiente y no registra la actividad.") : t("Aquí aparecerán los recordatorios que archives.")} />}
      ListFooterComponent={footer ? <View>{footer}</View> : null}
      renderItem={({ item: reminder }) => {const activity = activityById.get(reminder.activityId);
      const done = reminder.status === 'done';
      const archived = reminder.status === 'archived';
      const skipped = reminder.status === 'skipped';
      return <Panel key={`${reminder.id}:${reminder.dueAtMs}`} tint={activity?.color}>
        <View style={s.row}>
          <Text accessible={false} style={styles.emoji}>{activity?.emoji || '◷'}</Text>
          <View style={s.flex}>
            <Text accessibilityRole="header" style={[styles.activityName, { color: colors.text }]}>{activity?.name || t("Actividad no disponible")}</Text>
            <Label small>{dueFormatter.format(reminder.dueAtMs)}</Label>
            {reminder.scheduledAtMs!==undefined&&!done&&!skipped&&!archived&&<Label small strong>{t('Pospuesto hasta {date}',{date:dueFormatter.format(reminder.scheduledAtMs)})}</Label>}
            {!!reminder.recurrence && <Label small>{repetitionLabel(reminder.recurrence, language)}</Label>}
          </View>
        </View>
        <Label small strong>{archived ? t("Archivado") : skipped ? t("Omitido · sin registrar la actividad") : done ? t("✓ Completado · registrado en la actividad") : reminder.status === 'overdue' ? t("Pendiente · pasó la hora prevista") : t("Pendiente")}</Label>
        {activity?.isArchived && <Label small>{t("La actividad está archivada. Sus avisos están suspendidos.")}</Label>}
        <Label small>{reminder.notifications
          ? t('Avisos: {leads}', { leads: reminder.leadMinutes.map(minutes => reminderLeadLabel(minutes, language)).join(' · ') })
          : t("Sin avisos · lo verás aquí")}</Label>
        {!done && !archived && !skipped && <View style={s.wrap}>
          <Button compact label={t('Completar recordatorio de {activity}', { activity: activity?.name || t('actividad') })} disabled={readOnly || !!pending || !activity || activity.isArchived}
            busy={pending === reminder.id} onPress={() => complete(reminder.id, reminder.dueAtMs)}>{t("✓ Hecho, registrar")}</Button>
          <Button secondary compact label={t('Posponer recordatorio de {activity}',{activity:activity?.name||t('actividad')})} disabled={readOnly||!!pending||!activity||activity.isArchived}
            onPress={()=>{setError('');setOccurrenceAction({kind:'snooze',reminder,anchorMs:nowMs});}}>{t("Posponer")}</Button>
          <Button secondary compact label={t('Omitir esta ocasión de {activity}',{activity:activity?.name||t('actividad')})} disabled={readOnly||!!pending||!activity||activity.isArchived}
            onPress={()=>{setError('');setOccurrenceAction({kind:'skip',reminder,anchorMs:nowMs});}}>{t("Omitir")}</Button>
          <Button secondary compact label={t('Editar recordatorio de {activity}', { activity: activity?.name || t('actividad') })} disabled={readOnly || !!pending}
            onPress={() => { setError(''); setForm({ reminder: planning.reminders.find(item => item.id === reminder.id) || reminder }); }}>{t("Editar")}</Button>
        </View>}
        {!archived && <Button subtle compact label={t('Archivar recordatorio de {activity}', { activity: activity?.name || t('actividad') })} disabled={readOnly || !!pending}
          onPress={() => { setError(''); setArchive(reminder); }}>{t("Archivar")}</Button>}
      </Panel>;}}
    />
    <ActiveTabModal>
      {form && <ReminderForm activities={activities} reminder={form.reminder} nowMs={nowMs} zone={state.settings.zone}
        readOnly={readOnly} onClose={() => setForm(null)} onSave={onSave} onCreateActivity={onCreateActivity}
        notificationStatus={notificationStatus} onEnableNotifications={onEnableNotifications} />}
      {streakSettings && <StreakAlertForm value={planning.streakAlerts} readOnly={readOnly} onClose={() => setStreakSettings(false)}
        onSave={onSave} notificationStatus={notificationStatus} onEnableNotifications={onEnableNotifications} />}
      {archive && <ModalFrame title={t("Archivar recordatorio")} subtitle={activityById.get(archive.activityId)?.name}
        canClose={!pending} onClose={() => { if (!pending) { setArchive(null); setError(''); } }}>
        {({ closeWith, isClosing }) => <>
        <Label>{t("Dejará de enviar avisos. Los registros ya guardados de la actividad se conservan.")}</Label>
        {!!error && <Label strong>! {t(localizeError(language, error))}</Label>}
        <Button busy={pending === archive.id} disabled={readOnly || isClosing} onPress={() => archiveReminder(() => closeWith(() => setArchive(null)))}>{t("Archivar recordatorio")}</Button>
        <Button secondary disabled={!!pending || isClosing} onPress={() => closeWith(() => { setArchive(null); setError(''); })}>{t("Cancelar")}</Button>
        </>}
      </ModalFrame>}
      {occurrenceAction&&<ModalFrame title={occurrenceAction.kind==='snooze'?t("Posponer recordatorio"):t("Omitir esta ocasión")}
        subtitle={activityById.get(occurrenceAction.reminder.activityId)?.name} canClose={!pending}
        onClose={()=>{if(!pending){setOccurrenceAction(null);setError('');}}}>
        {({closeWith,isClosing})=><>
          <Label>{occurrenceAction.kind==='snooze'?t("Elige cuándo volver a recibir el aviso. Esto no registra la actividad."):t("Solo se omite esta ocasión. La actividad no se registra y las siguientes repeticiones se conservan.")}</Label>
          <Label small>{dueFormatter.format(occurrenceAction.reminder.dueAtMs)}</Label>
          {!!error&&<Label strong>! {t(localizeError(language,error))}</Label>}
          {occurrenceAction.kind==='snooze'?<View style={s.wrap}>{([10,30,60] as const).map(minutes=><Button key={minutes} secondary compact
            disabled={readOnly||!!pending||isClosing} onPress={()=>saveOccurrenceAction(minutes,()=>closeWith(()=>setOccurrenceAction(null)))}>
            {minutes===60?t("1 hora"):t('{count} minutos',{count:minutes})}</Button>)}</View>
            :<Button disabled={readOnly||isClosing} busy={pending===occurrenceAction.reminder.id}
              onPress={()=>saveOccurrenceAction(null,()=>closeWith(()=>setOccurrenceAction(null)))}>{t("Confirmar omisión")}</Button>}
          <Button secondary disabled={!!pending||isClosing} onPress={()=>closeWith(()=>{setOccurrenceAction(null);setError('');})}>{t("Cancelar")}</Button>
        </>}
      </ModalFrame>}
    </ActiveTabModal>
  </>;
}

function DiscardDraft({ onContinue, onDiscard }: { onContinue(): void; onDiscard(): void }) {
  const { t } = useI18n();
  return <Panel><Label strong>{t("Hay cambios sin guardar")}</Label><Label>{t("Si cierras ahora, perderás los cambios de este formulario.")}</Label>
    <Button secondary onPress={onContinue}>{t("Seguir editando")}</Button><Button secondary onPress={onDiscard}>{t("Descartar cambios")}</Button></Panel>;
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
  const { t, language, locale } = useI18n();
  const formZone = reminder?.recurrence?.zone || zone;
  const [initial] = useState(() => localDateTime(reminder?.dueAtMs ?? Math.ceil((nowMs + 3_600_000) / 60_000) * 60_000, formZone));
  const [identity] = useState(() => reminder ? { id: reminder.id, completionEntryId: reminder.completionEntryId } : { id: randomUUID(), completionEntryId: randomUUID() });
  const [activityId, setActivityId] = useState(reminder?.activityId || '');
  const [date, setDate] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11, 16));
  const [choice, setChoice] = useState<number | null>(reminder?.dueAtMs ?? null);
  const [leadMinutes, setLeadMinutes] = useState<number[]>(reminder?.leadMinutes || [0]);
  const [notifications, setNotifications] = useState(reminder?.notifications ?? false);
  const [customOpen, setCustomOpen] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'once' | 'daily' | 'days'>(reminder?.recurrence ? reminder.recurrence.weekdays.length === 7 ? 'daily' : 'days' : 'once');
  const [repeatDays, setRepeatDays] = useState<number[]>(reminder?.recurrence?.weekdays || []);
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
    candidates = localDateTimeCandidates(`${date}T${time}:00`, formZone);
    if (candidates.length === 0) timeError = t("Esta hora no existe en la zona elegida por un cambio de horario.");
  } catch { timeError = t("Elige una fecha y escribe una hora HH:mm válidas."); }
  const resolved = candidates.length === 1 ? candidates[0] : candidates.includes(choice ?? NaN) ? choice : null;
  const unchangedTime = !!reminder && date === initial.slice(0, 10) && time === initial.slice(11, 16)
    && (candidates.length <= 1 || choice === reminder.dueAtMs);
  const selectedDays = repeatMode === 'daily' ? weekdays.map(day => day.day) : repeatDays;
  const recurrence: ReminderRecurrence | null = repeatMode === 'once' ? null : {
    weekdays: selectedDays, hour: Number(time.slice(0, 2)), minute: Number(time.slice(3, 5)), zone: formZone,
  };
  const anchor = unchangedTime && reminder ? reminder.dueAtMs : resolved;
  let dueAtMs = anchor;
  const unchangedRecurrence = JSON.stringify(recurrence) === JSON.stringify(reminder?.recurrence || null);
  if (recurrence && selectedDays.length && anchor != null && (!reminder || !unchangedTime || !unchangedRecurrence)) {
    try { dueAtMs = nextReminderDueAt({ dueAtMs: anchor, recurrence }, Math.max(nowMs, anchor - 1)); }
    catch { dueAtMs = null; }
  }
  const past = !recurrence && dueAtMs != null && dueAtMs <= nowMs;
  const dirty = activityId !== (reminder?.activityId || '') || date !== initial.slice(0, 10) || time !== initial.slice(11, 16)
    || (!!reminder && candidates.length > 1 && choice !== reminder.dueAtMs)
    || notifications !== (reminder?.notifications ?? false) || JSON.stringify(leadMinutes) !== JSON.stringify(reminder?.leadMinutes || [0]) || !unchangedRecurrence;
  // A passed reminder can be edited only after choosing a new future date.
  const valid = !readOnly && !!currentActivity && !currentActivity.isArchived && !timeError && dueAtMs != null && !past
    && (!notifications || leadMinutes.length > 0) && (!recurrence || selectedDays.length > 0) && (!reminder || dirty);
  const toggleLead = (minutes: number) => {
    setCustomError('');
    if (leadMinutes.includes(minutes)) setLeadMinutes(leadMinutes.filter(value => value !== minutes));
    else if (leadMinutes.length < 16) setLeadMinutes([...leadMinutes, minutes].sort((a, b) => b - a));
    else setCustomError("Puedes elegir hasta 16 avisos por recordatorio.");
  };
  const addCustom = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > 525_600) { setCustomError("Elige hasta un año de anticipación."); return; }
    if (leadMinutes.includes(value)) { setCustomError("Este aviso ya está seleccionado."); return; }
    if (leadMinutes.length >= 16) { setCustomError("Puedes elegir hasta 16 avisos por recordatorio."); return; }
    setLeadMinutes([...leadMinutes, value].sort((a, b) => b - a)); setCustomError('');
  };
  const save = async (afterSave: () => void) => {
    if (!valid || dueAtMs == null || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const fields = { dueAtMs, leadMinutes, notifications };
      await persist(reminder
        ? { type: 'updateReminder', reminderId: reminder.id, changes: { ...fields, ...((recurrence || reminder.recurrence) ? { recurrence } : {}) } }
        : { type: 'createReminder', ...identity, activityId, ...fields, ...(recurrence ? { recurrence } : {}) });
      afterSave();
    } catch (e) { setError(errorText(e)); } finally { savingRef.current = false; setSaving(false); }
  };
  const submitActivity: SubmitCommand = async command => {
    if (readOnly || !onCreateActivity || command.type !== 'createActivity') throw new Error(t("No se puede crear una actividad en esta vista."));
    const id = creationId.current;
    if (!id) throw new Error(t("Vuelve a abrir el formulario de actividad."));
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
  return <ModalFrame interactionDisabled={saving || readOnly} title={reminder ? t("Editar recordatorio") : t("Nuevo recordatorio")} subtitle={t("Completarlo guardará un registro en la actividad elegida.")}
    canClose={!dirty && !saving} onClose={() => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } }}>
    {({ closeWith, isClosing }) => discard ? <DiscardDraft onContinue={() => setDiscard(false)} onDiscard={() => closeWith(onClose)} /> : <>
      <Label strong>{t("Actividad vinculada")}</Label>
      {reminder ? <Label>{currentActivity?.emoji} {currentActivity?.name || t("Actividad no disponible")}</Label>
        : <View style={s.wrap}>{available.map(activity => <Chip key={activity.id} selected={activityId === activity.id}
          label={t('Elegir actividad {activity}', { activity: activity.name })} disabled={readOnly || saving}
          onPress={() => setActivityId(activity.id)}>{activity.emoji} {activity.name}</Chip>)}</View>}
      {!reminder && onCreateActivity && <Button secondary compact disabled={readOnly || saving || isClosing}
        label={t("Crear una actividad para este recordatorio")} onPress={() => closeWith(() => { creationId.current = randomUUID(); setCreatingActivity(true); })}>{t("+ Crear actividad")}</Button>}
      {reminder && <Label small>{t("Para vincular otra actividad, crea otro recordatorio.")}</Label>}
      <Label small>{t('Zona de la fecha introducida: {zone}', { zone: formZone })}</Label>
      <CalendarField label={recurrence ? t("Fecha de inicio") : t("Fecha del recordatorio")} value={date} minDate={recurrence && reminder ? undefined : localDate(nowMs, formZone)} disabled={readOnly || saving}
        onChange={value => { setDate(value); setChoice(null); }} />
      <TimeField label={t("Hora del recordatorio")} value={time} disabled={readOnly || saving}
        onChange={value => { setTime(value); setChoice(null); }} />
      <Label strong>{t("Repetir")}</Label>
      <View style={s.wrap}>
        <Chip selected={repeatMode === 'once'} disabled={readOnly || saving} onPress={() => setRepeatMode('once')}>{t("Una vez")}</Chip>
        <Chip selected={repeatMode === 'daily'} disabled={readOnly || saving} onPress={() => setRepeatMode('daily')}>{t("Todos los días")}</Chip>
        <Chip selected={repeatMode === 'days'} disabled={readOnly || saving} onPress={() => { if (repeatMode !== 'days') setRepeatDays([]); setRepeatMode('days'); }}>{t("Elegir días")}</Chip>
      </View>
      {repeatMode === 'days' && <View style={s.wrap}>{weekdays.map(day => <Chip key={day.day} label={t('Repetir los {day}', { day: t(day.label).toLocaleLowerCase(locale) })} selected={repeatDays.includes(day.day)} disabled={readOnly || saving}
        onPress={() => setRepeatDays(previous => previous.includes(day.day) ? previous.filter(value => value !== day.day) : [...previous, day.day].sort((a, b) => a - b))}>{t(day.label)}</Chip>)}</View>}
      {recurrence && <Label small>{selectedDays.length ? t('{days} · {time}. Completar una ocasión deja preparada la siguiente.', { days: repetitionLabel(recurrence, language), time }) : t("Elige al menos un día de la semana.")}</Label>}
      {!!timeError && <Label small strong>! {timeError}</Label>}
      {past && <Label small strong>{t("! Elige una fecha y hora futura para el recordatorio.")}</Label>}
      {candidates.length > 1 && <Panel><Label strong>{t("Esta hora ocurre dos veces")}</Label><Label small>{t("Elige explícitamente el desfase que corresponde.")}</Label>
        {candidates.map(value => <Chip key={value} selected={choice === value} onPress={() => setChoice(value)}>{formatDateTime(value, formZone)}</Chip>)}
      </Panel>}
      <Toggle label={t("Avisos de este recordatorio")} detail={t("Elige varias anticipaciones o déjalo sin notificaciones.")} value={notifications} onChange={setNotifications} />
      {notifications && <>
        <Label strong>{t("Cuándo avisarte")}</Label>
        <View style={s.wrap}>
          {leadOptions.map(minutes => <Chip key={minutes} label={reminderLeadLabel(minutes, language)} selected={leadMinutes.includes(minutes)}
            onPress={() => toggleLead(minutes)}>{reminderLeadLabel(minutes, language)}</Chip>)}
          {leadMinutes.filter(minutes => !leadOptions.includes(minutes)).map(minutes => <Chip key={minutes} selected label={t('Quitar aviso {lead}', { lead: reminderLeadLabel(minutes, language) })}
            onPress={() => toggleLead(minutes)}>{reminderLeadLabel(minutes, language)} ×</Chip>)}
          <Button secondary compact label={t("Elegir anticipación personalizada")} disabled={readOnly || saving || leadMinutes.length >= 16}
            onPress={() => { setCustomError(''); setCustomOpen(true); }}>{t("Personalizado")}</Button>
        </View>
        <LeadTimePicker visible={customOpen} onClose={() => setCustomOpen(false)} onSelect={addCustom} selectedMinutes={leadMinutes} />
        {!!customError && <Label small strong>! {t(customError)}</Label>}
        {leadMinutes.length === 0 && <Label small>{t("Selecciona al menos un aviso o desactiva las notificaciones.")}</Label>}
        {dueAtMs != null && leadMinutes.some(minutes => dueAtMs - minutes * 60_000 <= nowMs) && <Label small>{t("Los avisos cuya hora ya haya pasado se omitirán; no se enviarán todos de golpe.")}</Label>}
        <NotificationAvailability status={notificationStatus} onEnable={onEnableNotifications} />
      </>}
      {currentActivity?.isArchived && <Label small strong>{t("La actividad está archivada. Actívala en Registro antes de guardar este recordatorio.")}</Label>}
      {!!error && <Label strong>! {t(localizeError(language, error))}</Label>}
      <Button disabled={!valid || isClosing} busy={saving} onPress={() => save(() => closeWith(onClose))}>{reminder ? t("Guardar recordatorio") : t("Crear recordatorio")}</Button>
    </>}
  </ModalFrame>;
}

function StreakAlertForm({ value, readOnly = false, onClose, onSave, notificationStatus, onEnableNotifications }: {
  value: { enabled: boolean; hour: number; minute: number }; readOnly?: boolean; onClose(): void;
  onSave: SavePlanning; notificationStatus: string; onEnableNotifications(): Promise<void>;
}) {
  const { t, language } = useI18n();
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
  return <ModalFrame interactionDisabled={saving || readOnly} title={t("Avisos de racha")} subtitle={t("Una ayuda opcional antes de terminar el día.")}
    canClose={!dirty && !saving} onClose={() => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } }}>
    {({ closeWith, isClosing }) => discard ? <DiscardDraft onContinue={() => setDiscard(false)} onDiscard={() => closeWith(onClose)} /> : <>
      <Toggle label={t("Recordarme mantener las rachas")} detail={t("Un aviso si aún no registraste hoy una actividad con racha vigente.")} value={enabled} onChange={setEnabled} />
      <Label small>{t("Varios registros el mismo día cuentan como un solo día. La racha crece al registrar la actividad en días consecutivos.")}</Label>
      <Field label={t("Hora del aviso de racha (HH:mm, 24 horas)")} value={time} onChangeText={setTime} placeholder="22:00" autoCapitalize="none" />
      {!validTime && <Label small strong>{t("! Escribe una hora válida entre 00:00 y 23:59.")}</Label>}
      <Label small>{t("Se usa la zona horaria elegida en Ajustes. Al registrar la actividad, se cancelan sus avisos de racha pendientes.")}</Label>
      <NotificationAvailability status={notificationStatus} onEnable={onEnableNotifications} />
      {!!error && <Label strong>! {t(localizeError(language, error))}</Label>}
      <Button disabled={readOnly || !validTime || !dirty || isClosing} busy={saving} onPress={() => save(() => closeWith(onClose))}>{t("Guardar avisos de racha")}</Button>
    </>}
  </ModalFrame>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 5, paddingHorizontal: 23, paddingBottom: 24, gap: 18 },
  emoji: { fontSize: 30, width: 42, textAlign: 'center' },
  activityName: { fontFamily: typefaces.semibold, fontSize: 18, lineHeight: 25 },
});
