import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { CloudSyncView } from '../sync/types';
import { useI18n } from '../i18n/react';
import { GlassLayer, useColors, webFocusRing } from './components';
import { MotionPressable } from './motion';
import { palette } from './tokens';
import { typefaces } from './typography';

export function syncStatusLabel(view?: CloudSyncView): string {
  if (!view?.account || view.demo || !view.configured) return 'En tu dispositivo';
  if (view.boundToOtherAccount) return 'Otra cuenta';
  if (view.status === 'conflict') return 'Revisar cambios';
  if (view.status === 'error') return 'Revisar conexión';
  if (view.status === 'syncing') return 'Sincronizando';
  if (!view.enabled || view.status === 'paused') return 'En pausa';
  if (view.status === 'offline') return 'Sin conexión';
  if (view.pending) return 'Pendiente';
  return view.lastSyncedAt === null ? 'Sincronización activa' : 'Sincronizado';
}
export function SyncStatusPill({ view, onPress, disabled = false }: { view?: CloudSyncView; onPress(): void; disabled?: boolean }) {
  const { t } = useI18n(), c = useColors(), label = t(syncStatusLabel(view));
  return <MotionPressable testID="sync-status-pill" accessibilityRole="button" accessibilityLabel={t('Estado de sincronización: {status}', { status: label })}
    accessibilityHint={t('Abre los ajustes de cuenta y sincronización')} accessibilityState={{ disabled, busy: view?.status === 'syncing' }} disabled={disabled} onPress={onPress}
    style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.pill, webFocusRing(focused, c.dark ? palette.lavender : palette.violet)]}>
    <GlassLayer radius={18} dark={c.dark} strength="control" />
    {view?.status === 'syncing' && view.account && !view.demo ? <ActivityIndicator size="small" color={c.text} style={{ width: 12, height: 12 }} /> : <View accessible={false} style={[styles.dot, { backgroundColor: view?.pending || view?.status === 'conflict' || view?.status === 'error' ? palette.lilac : palette.violet }]} />}
    <Text numberOfLines={2} style={[styles.text, { color: c.text }]}>{label}</Text>
  </MotionPressable>;
}
const styles = StyleSheet.create({ pill: { borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, minHeight: 44, maxWidth: 150, flexDirection: 'row', gap: 6, alignItems: 'center' }, dot: { width: 5, height: 5, borderRadius: 3 }, text: { fontFamily: typefaces.medium, fontSize: 10, lineHeight: 16, flexShrink: 1 } });
