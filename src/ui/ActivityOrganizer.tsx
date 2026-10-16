import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import type { CurrentActivity } from '../domain/types';
import { useI18n } from '../i18n/react';
import type { ActivityLayout } from '../infrastructure/preferences';
import { Button, GlassLayer, Label, ModalFrame, s, useColors } from './components';
import { moveActivity, orderActivities, togglePinned } from './activityOrder';
import { alpha, palette } from './tokens';

function DragHandle(props: { label: string; hint: string; disabled: boolean; onStart(): void; onMove(dy: number): void; onRelease(): void; onCancel(): void; onAdjust(delta: number): void }) {
  const { t } = useI18n(), c = useColors();
  const current = useRef(props);
  useLayoutEffect(() => { current.current = props; }, [props]);
  // A stable responder retains its gesture state while rows reorder underneath it.
  // eslint-disable-next-line react-hooks/refs -- PanResponder stores these callbacks; it does not invoke them during render.
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !current.current.disabled,
    onMoveShouldSetPanResponder: () => !current.current.disabled,
    onPanResponderGrant: () => current.current.onStart(),
    onPanResponderMove: (_event, gesture) => { if (!current.current.disabled) current.current.onMove(gesture.dy); },
    onPanResponderRelease: () => current.current.onRelease(),
    onPanResponderTerminate: () => current.current.onCancel(),
    onPanResponderTerminationRequest: () => false,
  }), []);
  return <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={props.label} accessibilityHint={props.hint}
    accessibilityState={{ disabled: props.disabled }} accessibilityActions={[{ name: 'increment', label: t('Bajar') }, { name: 'decrement', label: t('Subir') }]}
    onAccessibilityAction={event => { if (!props.disabled && (event.nativeEvent.actionName === 'increment' || event.nativeEvent.actionName === 'decrement')) props.onAdjust(event.nativeEvent.actionName === 'increment' ? 1 : -1); }}
    style={styles.handle}><Text style={{ color: c.text, fontSize: 27 }}>⠿</Text></View>;
}

export function ActivityOrganizer({ activities, layout, onChange, onClose }: {
  activities: readonly CurrentActivity[]; layout: ActivityLayout;
  onChange(layout: ActivityLayout): Promise<void>; onClose(): void;
}) {
  const { t } = useI18n(), c = useColors();
  const [draft, setDraft] = useState<ActivityLayout>(() => ({ order: [...layout.order], pinned: [...layout.pinned] }));
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [dragging, setDragging] = useState<string | null>(null);
  const rows = useMemo(() => orderActivities(activities, draft), [activities, draft]);
  const measurements = useRef(new Map<string, { y: number; height: number }>());
  const begin = useRef<{ id: string; layout: ActivityLayout; order: CurrentActivity[]; centers: number[] } | null>(null);
  const draftRef = useRef(draft);
  useLayoutEffect(() => { draftRef.current = draft; }, [draft]);
  const save = async (done: () => void) => {
    if (busy) return; setBusy(true); setError(false);
    try { await onChange(draft); done(); } catch { setError(true); } finally { setBusy(false); }
  };
  return <ModalFrame title={t('Organizar actividades')} subtitle={t('Arrastra el asa para ordenar. Fija tus favoritas para tenerlas arriba.')} onClose={onClose} canClose={!busy}>
    {({ closeWith }) => <View style={s.stack}>
      {rows.length === 0 && <Label>{t('No hay actividades para organizar.')}</Label>}
      {rows.map((activity, index) => {
        const pinned = draft.pinned.includes(activity.id);
        const group = rows.filter(item => draft.pinned.includes(item.id) === pinned);
        return <View key={activity.id} testID={`organizer-row-${activity.id}`} onLayout={event => measurements.current.set(activity.id, event.nativeEvent.layout)}
          style={[styles.row, { opacity: dragging && dragging !== activity.id ? 0.65 : 1, borderColor: dragging === activity.id ? palette.lilac : c.surfaceEdge, backgroundColor: dragging === activity.id ? alpha(palette.lavender, 0.12) : 'transparent' }]}>
          <GlassLayer radius={20} dark={c.dark} strength="control" />
          <View style={styles.heading}><DragHandle disabled={busy} label={t('Ordenar {name}', { name: activity.name })}
            hint={t('Arrastra arriba o abajo, o usa los botones para cambiar el orden.')}
            onStart={() => {
            const order = orderActivities(activities, draftRef.current);
            begin.current = { id: activity.id, layout: draftRef.current, order, centers: order.map((item, row) => {
              const box = measurements.current.get(item.id); return box ? box.y + box.height / 2 : row * 132 + 66;
            }) }; setDragging(activity.id);
            }}
            onMove={dy => {
            const start = begin.current; if (!start || busy) return;
            const position = start.order.findIndex(item => item.id === start.id), center = start.centers[position] + dy;
            let target = start.centers.findIndex(value => value > center); if (target < 0) target = start.centers.length - 1;
            else if (target > 0 && Math.abs(start.centers[target - 1] - center) < Math.abs(start.centers[target] - center)) target -= 1;
            setDraft(moveActivity(start.order, start.layout, start.id, target));
            }}
            onRelease={() => { begin.current = null; setDragging(null); }}
            onCancel={() => { if (begin.current) setDraft(begin.current.layout); begin.current = null; setDragging(null); }}
            onAdjust={delta => setDraft(current => moveActivity(activities, current, activity.id, index + delta))} />
            <View style={{ flex: 1 }}><Label strong>{activity.emoji} {activity.name}</Label>{pinned && <Label small>{t('Fijada')}</Label>}</View>
          </View>
          <View style={styles.actions}>
            <Button secondary compact disabled={busy || group[0]?.id === activity.id} label={t('Subir {name}', { name: activity.name })} onPress={() => setDraft(current => moveActivity(activities, current, activity.id, index - 1))}>↑</Button>
            <Button secondary compact disabled={busy || group[group.length - 1]?.id === activity.id} label={t('Bajar {name}', { name: activity.name })} onPress={() => setDraft(current => moveActivity(activities, current, activity.id, index + 1))}>↓</Button>
            <View style={{ flex: 1 }}><Button secondary compact disabled={busy} label={t(pinned ? 'Desfijar {name}' : 'Fijar {name}', { name: activity.name })} onPress={() => setDraft(current => togglePinned(current, activity.id))}>{t(pinned ? 'Desfijar' : 'Fijar')}</Button></View>
          </View>
        </View>;
      })}
      {error && <Label small strong>{t('No se pudo guardar el orden. Inténtalo de nuevo.')}</Label>}
      <Button busy={busy} disabled={!!dragging} onPress={() => { void save(() => closeWith(onClose)); }}>{t('Guardar organización')}</Button>
    </View>}
  </ModalFrame>;
}
const styles = StyleSheet.create({ row: { borderRadius: 20, borderWidth: 1, padding: 10, gap: 8 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, handle: { minHeight: 48, width: 44, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { touchAction: 'none' } : {}) }, actions: { flexDirection: 'row', gap: 6 } });
