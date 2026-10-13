import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, formatDateTime, localDateTime, localDateTimeCandidates } from '../domain';
import type { Color, Command, CurrentActivity, EffectiveEntry } from '../domain/types';
import { Button, Chip, Field, Label, ModalFrame, Panel, s, Toggle, webSpaceKey, webFocusRing } from './components';
import { palette } from './tokens';
import { typefaces } from './typography';

export type SubmitCommand = (command: Command, key: string) => Promise<unknown>;
const message = (error: unknown) => error instanceof Error ? error.message : 'No se pudo guardar. Puedes volver a intentarlo.';

function Discard({ onDiscard, onContinue }: { onDiscard(): void; onContinue(): void }) {
  return <Panel><Label strong>Hay cambios sin guardar</Label><Label>Si cierras ahora, perderás los cambios de este formulario.</Label><Button onPress={onContinue}>Seguir editando</Button><Button secondary onPress={onDiscard}>Descartar cambios</Button></Panel>;
}

export function ActivityForm({ activity, activities, onClose, submit }: { activity?: CurrentActivity; activities: CurrentActivity[]; onClose(): void; submit: SubmitCommand }) {
  const [name, setName] = useState(activity?.name || '');
  const [emoji, setEmoji] = useState(activity?.emoji || '✨');
  const [emojiSearch, setEmojiSearch] = useState('');
  const [color, setColor] = useState<Color>(activity?.color || palette.lavender);
  const [isPrivate, setPrivate] = useState(activity?.isPrivate || false);
  const [category, setCategory] = useState(activity?.category || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dirty = name !== (activity?.name || '') || emoji !== (activity?.emoji || '✨') || color !== (activity?.color || palette.lavender) || isPrivate !== (activity?.isPrivate || false) || category !== (activity?.category || '');
  const duplicate = activities.some(a => a.id !== activity?.id && a.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const save = async () => {
    setError(''); setSaving(true);
    try {
      const fields = { name: name.trim(), emoji: emoji.trim(), color, isPrivate, category: category.trim() || null };
      await submit(activity ? { type: 'updateActivity', activityId: activity.id, changes: fields } : { type: 'createActivity', ...fields }, `activity-form-${activity?.id || 'new'}`);
      onClose();
    } catch (e) { setError(message(e)); } finally { setSaving(false); }
  };
  return <ModalFrame title={activity ? 'Editar actividad' : 'Una nueva actividad'} subtitle="Ponle nombre a eso que quieres recordar." onClose={() => dirty && !saving ? setDiscard(true) : !saving && onClose()}>
    {discard ? <Discard onDiscard={onClose} onContinue={() => setDiscard(false)} /> : <>
      <Field label="Nombre de la actividad" value={name} onChangeText={setName} placeholder="Por ejemplo, leer un rato" autoFocus autoCapitalize="sentences" hint="Hasta 80 caracteres visibles. El nombre puede repetirse." />
      {duplicate && <Label small strong>Ya existe una actividad con este nombre. Puedes guardar otra: tendrá su propio historial.</Label>}
      <Field label="Emoji" value={emoji} onChangeText={setEmoji} placeholder="✨" hint="Un emoji. También puedes usar el teclado de tu dispositivo." />
      <Field label="Buscar entre los emojis sugeridos" value={emojiSearch} onChangeText={setEmojiSearch} placeholder="Libro, planta, café…" />
      <View style={s.wrap}>{[['📖', 'libro leer lectura'], ['🌿', 'planta regar jardín'], ['☕', 'café bebida'], ['🚶', 'caminar paseo'], ['💧', 'agua beber'], ['🎨', 'arte pintar'], ['💬', 'hablar conversar llamada'], ['✨', 'estrellas brillo']].filter(([symbol, words]) => !emojiSearch || `${symbol} ${words}`.toLocaleLowerCase('es-CO').includes(emojiSearch.toLocaleLowerCase('es-CO'))).map(([item, description]) => <Chip key={item} selected={emoji === item} label={`Usar emoji ${item}, ${description}`} onPress={() => setEmoji(item)}>{item}</Chip>)}</View>
      <Label strong>Color de tu actividad</Label>
      <View style={s.wrap}>{COLORS.map((item, i) => <Pressable key={item} onPress={() => setColor(item)} {...webSpaceKey(() => setColor(item))} accessibilityRole="radio" accessibilityLabel={['Violeta', 'Lila', 'Lavanda', 'Celeste', 'Claro', 'Oscuro'][i]} accessibilityState={{ selected: color === item, checked: color === item }} aria-checked={color === item} style={({ focused }: { pressed: boolean; focused?: boolean }) => ({ width: 54, height: 54, borderRadius: 18, padding: 4, borderWidth: color === item || focused ? 3 : 1, borderColor: focused ? palette.violet : palette.lilac, ...webFocusRing(focused) })}><View style={{ backgroundColor: item, flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>{color === item && <Text style={{ color: item === palette.ink ? palette.base : palette.ink, fontSize: 20, fontFamily: typefaces.semibold }}>✓</Text>}</View></Pressable>)}</View>
      <Field label="Categoría (opcional)" value={category} onChangeText={setCategory} placeholder="Por ejemplo, tiempo para mí" />
      <Toggle label="Actividad privada" detail="No se incluirá inicialmente en reportes. Esto no cifra ni bloquea tus datos." value={isPrivate} onChange={setPrivate} />
      {!!error && <Label strong>! {error}</Label>}
      <Button onPress={save} busy={saving} disabled={!name.trim() || !emoji.trim()}>{activity ? 'Guardar cambios' : 'Crear actividad'}</Button>
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
  catch { timeError = 'Escribe una fecha AAAA-MM-DD y una hora HH:mm válidas.'; }
  const resolved = candidates.length === 1 ? candidates[0] : choice;
  const unchangedTime = !!entry && date === initial.slice(0, 10) && time === initial.slice(11, 16);
  const future = !unchangedTime && resolved !== null && resolved !== undefined && resolved > nowMs;
  const occurredAtMs = unchangedTime && entry ? entry.revision.occurredAtMs : resolved;
  const dirty = date !== initial.slice(0, 10) || time !== initial.slice(11, 16) || note !== (entry?.revision.note || '') || !!reason;
  const changed = !entry || !unchangedTime || note !== entry.revision.note;
  const valid = !timeError && !future && occurredAtMs != null && changed;
  const save = async () => {
    if (occurredAtMs == null || !valid) return;
    setError(''); setSaving(true);
    try {
      await submit(entry ? { type: 'correctEntry', entryId: entry.id, occurredAtMs, occurredZone: zone, note, reason } : { type: 'createEntry', activityId: activity.id, occurredAtMs, occurredZone: zone, note }, `entry-form-${entry?.id || activity.id}`);
      onClose();
    } catch (e) { setError(message(e)); } finally { setSaving(false); }
  };
  return <ModalFrame title={entry ? 'Corregir registro' : 'Registrar otra fecha'} subtitle={`${activity.emoji} ${activity.name}`} onClose={() => dirty && !saving ? setDiscard(true) : !saving && onClose()}>
    {discard ? <Discard onDiscard={onClose} onContinue={() => setDiscard(false)} /> : <>
      <Label small>Zona de la fecha introducida: {zone}</Label>
      <Field label="Fecha (AAAA-MM-DD)" value={date} onChangeText={v => { setDate(v); setChoice(null); setReview(false); }} placeholder="2026-10-12" autoCapitalize="none" />
      <Field label="Hora (HH:mm, 24 horas)" value={time} onChangeText={v => { setTime(v); setChoice(null); setReview(false); }} placeholder="14:30" autoCapitalize="none" />
      {!!timeError && <Label small strong>! {timeError}</Label>}
      {future && <Label small strong>! La fecha no puede estar en el futuro.</Label>}
      {candidates.length > 1 && <Panel><Label strong>Esta hora ocurre dos veces</Label><Label small>Elige explícitamente el desfase que corresponde.</Label>{candidates.map(value => <Chip key={value} selected={choice === value} onPress={() => setChoice(value)}>{formatDateTime(value, zone)}</Chip>)}</Panel>}
      <Field label="Nota (opcional)" value={note} onChangeText={v => { setNote(v); setReview(false); }} multiline hint="Hasta 2.000 caracteres visibles. Las notas se excluyen inicialmente de reportes." />
      {entry && <Field label="Motivo de la corrección (opcional)" value={reason} onChangeText={setReason} />}
      {entry && <Label small strong>Se conservará la versión anterior.</Label>}
      {review && occurredAtMs != null && <Panel><Label strong>{entry ? 'Revisa la corrección' : 'Revisa el registro'}</Label>{entry && <Label small>Antes: {formatDateTime(entry.revision.occurredAtMs, zone)}</Label>}<Label>Ocurrió el: {formatDateTime(occurredAtMs, zone)}</Label><Label small>{entry ? 'La fecha de creación original se conservará.' : 'La fecha de creación será el momento de guardarlo.'}</Label>{note !== (entry?.revision.note || '') && <Label small>Nota: {note || 'Sin nota'}</Label>}</Panel>}
      {!!error && <Label strong>! {error}</Label>}
      <Button disabled={!valid} busy={saving} onPress={review ? save : () => setReview(true)}>{review ? (entry ? 'Confirmar corrección' : 'Guardar registro') : 'Revisar antes de guardar'}</Button>
    </>}
  </ModalFrame>;
}
