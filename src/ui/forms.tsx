import React, { useMemo, useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { formatDateTime, localDate, localDateTime, localDateTimeCandidates } from '../domain';
import type { Color, Command, CurrentActivity, EffectiveEntry } from '../domain/types';
import { Button, Chip, Field, GlassLayer, Label, ModalFrame, Panel, Toggle, useColors, webSpaceKey, webFocusRing } from './components';
import { alpha, palette } from './tokens';
import { typefaces } from './typography';
import { useInteractionFeedback } from './feedback';
import { MotionPressable } from './motion';
import { EmojiPicker } from './EmojiPicker';
import { activityColors } from './activityColors';
import { categorySuggestions } from './categories';
import { CalendarField } from './CalendarField';

export type SubmitCommand = (command: Command, key: string) => Promise<unknown>;
const message = (error: unknown) => error instanceof Error ? error.message : 'No se pudo guardar. Puedes volver a intentarlo.';

function Discard({ onDiscard, onContinue }: { onDiscard(): void; onContinue(): void }) {
  return <Panel><Label strong>Hay cambios sin guardar</Label><Label>Si cierras ahora, perderás los cambios de este formulario.</Label><Button feedback="selection" onPress={onContinue}>Seguir editando</Button><Button secondary onPress={onDiscard}>Descartar cambios</Button></Panel>;
}

export function ActivityForm({ activity, activities, onClose, submit }: { activity?: CurrentActivity; activities: CurrentActivity[]; onClose(): void; submit: SubmitCommand }) {
  const colors = useColors();
  const respond = useInteractionFeedback();
  const selectColor = (value: Color) => { respond('selection'); setColor(value); };
  const [name, setName] = useState(activity?.name || '');
  const [emoji, setEmoji] = useState(activity?.emoji || '✨');
  const [emojiPicker, setEmojiPicker] = useState(false);
  const [color, setColor] = useState<Color>(activity?.color || palette.lavender);
  const [isPrivate, setPrivate] = useState(activity?.isPrivate || false);
  const [category, setCategory] = useState(activity?.category || '');
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const suggestions = useMemo(() => categorySuggestions(activities, category), [activities, category]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dirty = name !== (activity?.name || '') || emoji !== (activity?.emoji || '✨') || color !== (activity?.color || palette.lavender) || isPrivate !== (activity?.isPrivate || false) || category !== (activity?.category || '');
  const duplicate = activities.some(a => a.id !== activity?.id && a.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const save = async (closeWith: (action: () => void) => void) => {
    setError(''); setSaving(true);
    try {
      const fields = { name: name.trim(), emoji: emoji.trim(), color, isPrivate, category: category.trim() || null };
      await submit(activity ? { type: 'updateActivity', activityId: activity.id, changes: fields } : { type: 'createActivity', ...fields }, `activity-form-${activity?.id || 'new'}`);
      closeWith(onClose);
    } catch (e) { setError(message(e)); } finally { setSaving(false); }
  };
  return <ModalFrame canClose={!dirty && !saving} title={activity ? 'Editar actividad' : 'Una nueva actividad'} subtitle="Ponle nombre a eso que quieres recordar." onClose={() => dirty && !saving ? setDiscard(true) : !saving && onClose()}>
    {({ closeWith }) => discard ? <Discard onDiscard={() => closeWith(onClose)} onContinue={() => setDiscard(false)} /> : <>
      <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <Field containerStyle={{ flex: 1, minWidth: 0 }} label="Nombre de la actividad" value={name} onChangeText={setName} onFocus={() => setCategorySuggestionsOpen(false)} placeholder="Por ejemplo, leer un rato" autoFocus autoCapitalize="sentences" />
        <MotionPressable feedback={false} accessibilityRole="button" accessibilityLabel={`Cambiar emoji, actual ${emoji}`} accessibilityHint="Abre el selector de emojis" onPress={() => { respond('selection'); Keyboard.dismiss(); setEmojiPicker(true); }}
          style={({ focused }: { pressed: boolean; focused?: boolean }) => ({ width: 64, height: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, ...webFocusRing(focused) })}>
          <GlassLayer radius={17} dark={colors.dark} strength="control" /><Text accessible={false} style={{ fontSize: 27 }}>{emoji}</Text><Text accessible={false} style={{ color: colors.muted, fontSize: 14 }}>⌄</Text>
        </MotionPressable>
      </View>
      <Label small>Hasta 80 caracteres visibles. El nombre puede repetirse.</Label>
      {duplicate && <Label small strong>Ya existe una actividad con este nombre. Puedes guardar otra: tendrá su propio historial.</Label>}
      </View>
      <View style={{ gap: 8 }}>
        <Label strong>Color de tu actividad</Label>
        <View accessibilityRole="radiogroup" accessibilityLabel="Color de tu actividad" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {activityColors.map(item => <MotionPressable feedback={false} key={item.color} onPress={() => selectColor(item.color)} {...webSpaceKey(() => selectColor(item.color))}
            accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: color === item.color }} aria-checked={color === item.color}
            style={({ focused }: { pressed: boolean; focused?: boolean }) => ({ width: 48, height: 48, borderRadius: 16, padding: 3, borderWidth: color === item.color || focused ? 2 : 1,
              borderColor: color === item.color ? colors.text : colors.surfaceEdge, ...webFocusRing(focused, colors.dark ? palette.lavender : palette.violet) })}>
            <View style={{ flex: 1, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <LinearGradient colors={[alpha(item.color, 0.68), item.color, alpha(item.color, 0.7)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
              <LinearGradient colors={[alpha(palette.base, 0.65), alpha(palette.base, 0.04), alpha(palette.base, 0.2)]} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.65, y: 1 }} style={{ position: 'absolute', inset: 0, borderRadius: 11, borderWidth: 1, borderColor: alpha(palette.base, 0.6) }} />
              {color === item.color && <Text accessible={false} style={{ color: item.color === palette.ink ? palette.base : palette.ink, fontSize: 20, fontFamily: typefaces.semibold }}>✓</Text>}
            </View>
          </MotionPressable>)}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {categorySuggestionsOpen && suggestions.length > 0 && <View style={{ gap: 8 }}>
          <Label small>Categorías existentes</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.slice(0, 8).map(suggestion => <MotionPressable key={suggestion} accessibilityRole="button" accessibilityLabel={`Usar categoría ${suggestion}`}
              onPress={() => { setCategory(suggestion); setCategorySuggestionsOpen(false); }}
              style={({ focused }: { pressed: boolean; focused?: boolean }) => ({ minHeight: 48, minWidth: 48, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 11, justifyContent: 'center', ...webFocusRing(focused, colors.dark ? palette.lavender : palette.violet) })}>
              <GlassLayer radius={18} dark={colors.dark} strength="control" /><Text style={{ fontFamily: typefaces.semibold, fontSize: 13, lineHeight: 22, color: colors.text }}>{suggestion}</Text>
            </MotionPressable>)}
          </View>
          {suggestions.length > 8 && <Label small>Escribe para encontrar más categorías.</Label>}
        </View>}
        <Field label="Categoría (opcional)" value={category} onChangeText={value => { setCategory(value); setCategorySuggestionsOpen(true); }}
          onFocus={() => setCategorySuggestionsOpen(true)} placeholder="Por ejemplo, tiempo para mí" />
      </View>
      <Toggle label="Actividad privada" detail="No se incluirá inicialmente en reportes. Esto no cifra ni bloquea tus datos." value={isPrivate} onChange={setPrivate} />
      {!!error && <Label strong>! {error}</Label>}
      <Button onPress={() => { void save(closeWith); }} busy={saving} disabled={!name.trim() || !emoji.trim()}>{activity ? 'Guardar cambios' : 'Crear actividad'}</Button>
      {emojiPicker && <EmojiPicker value={emoji} onClose={() => setEmojiPicker(false)} onSelect={value => { setEmoji(value); setEmojiPicker(false); }} />}
    </>}
  </ModalFrame>;
}

export function EntryForm({ activity, entry, nowMs, zone, onClose, submit }: { activity: CurrentActivity; entry?: EffectiveEntry; nowMs: number; zone: string; onClose(): void; submit: SubmitCommand }) {
  const initial = localDateTime(entry?.revision.occurredAtMs ?? nowMs, zone);
  const [date, setDate] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11, 16));
  const [note, setNote] = useState(entry?.revision.note || '');
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [review, setReview] = useState(false);
  let candidates: number[] = [];
  let timeError = '';
  try { candidates = localDateTimeCandidates(`${date}T${time}:00`, zone); if (!candidates.length) timeError = 'Esta hora no existe en la zona elegida por un cambio de horario.'; }
  catch { timeError = 'Elige una fecha válida y escribe una hora HH:mm válida.'; }
  const resolved = candidates.length === 1 ? candidates[0] : choice;
  const unchangedTime = !!entry && date === initial.slice(0, 10) && time === initial.slice(11, 16);
  const future = !unchangedTime && resolved !== null && resolved !== undefined && resolved > nowMs;
  const occurredAtMs = unchangedTime && entry ? entry.revision.occurredAtMs : resolved;
  const dirty = date !== initial.slice(0, 10) || time !== initial.slice(11, 16) || note !== (entry?.revision.note || '') || !!reason;
  const changed = !entry || !unchangedTime || note !== entry.revision.note;
  const valid = !timeError && !future && occurredAtMs != null && changed;
  const save = async (closeWith: (action: () => void) => void) => {
    if (occurredAtMs == null || !valid) return;
    setError(''); setSaving(true);
    try {
      await submit(entry ? { type: 'correctEntry', entryId: entry.id, occurredAtMs, occurredZone: zone, note, reason } : { type: 'createEntry', activityId: activity.id, occurredAtMs, occurredZone: zone, note }, `entry-form-${entry?.id || activity.id}`);
      closeWith(onClose);
    } catch (e) { setError(message(e)); } finally { setSaving(false); }
  };
  return <ModalFrame canClose={!dirty && !saving} title={entry ? 'Corregir registro' : 'Registrar otra fecha'} subtitle={`${activity.emoji} ${activity.name}`} onClose={() => dirty && !saving ? setDiscard(true) : !saving && onClose()}>
    {({ closeWith }) => discard ? <Discard onDiscard={() => closeWith(onClose)} onContinue={() => setDiscard(false)} /> : <>
      <Label small>Zona de la fecha introducida: {zone}</Label>
      <CalendarField label="Fecha" value={date} maxDate={localDate(nowMs, zone)} onChange={v => { setDate(v); setChoice(null); setReview(false); }} disabled={saving} />
      <Field label="Hora (HH:mm, 24 horas)" value={time} onChangeText={v => { setTime(v); setChoice(null); setReview(false); }} placeholder="14:30" autoCapitalize="none" />
      {!!timeError && <Label small strong>! {timeError}</Label>}
      {future && <Label small strong>! La fecha no puede estar en el futuro.</Label>}
      {candidates.length > 1 && <Panel><Label strong>Esta hora ocurre dos veces</Label><Label small>Elige explícitamente el desfase que corresponde.</Label>{candidates.map(value => <Chip key={value} selected={choice === value} onPress={() => setChoice(value)}>{formatDateTime(value, zone)}</Chip>)}</Panel>}
      <Field label="Nota (opcional)" value={note} onChangeText={v => { setNote(v); setReview(false); }} multiline hint="Hasta 2.000 caracteres visibles. Las notas se excluyen inicialmente de reportes." />
      {entry && <Field label="Motivo de la corrección (opcional)" value={reason} onChangeText={setReason} />}
      {entry && <Label small strong>Se conservará la versión anterior.</Label>}
      {review && occurredAtMs != null && <Panel><Label strong>{entry ? 'Revisa la corrección' : 'Revisa el registro'}</Label>{entry && <Label small>Antes: {formatDateTime(entry.revision.occurredAtMs, zone)}</Label>}<Label>Ocurrió el: {formatDateTime(occurredAtMs, zone)}</Label><Label small>{entry ? 'La fecha de creación original se conservará.' : 'La fecha de creación será el momento de guardarlo.'}</Label>{note !== (entry?.revision.note || '') && <Label small>Nota: {note || 'Sin nota'}</Label>}</Panel>}
      {!!error && <Label strong>! {error}</Label>}
      <Button feedback={review ? 'action' : 'selection'} disabled={!valid} busy={saving} onPress={review ? () => { void save(closeWith); } : () => setReview(true)}>{review ? (entry ? 'Confirmar corrección' : 'Guardar registro') : 'Revisar antes de guardar'}</Button>
    </>}
  </ModalFrame>;
}
