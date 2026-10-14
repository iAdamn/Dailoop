import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { addCalendarDays, effectiveEntries, elapsedSince, formatDateTime, lastOccurredAt, localDate, periodFor, selectActivities, startOfLocalDay } from '../domain';
import type { Command, CommandResult, CurrentActivity, DomainState, EffectiveEntry, ParsedBackup, ReportModel, ReportOptions, Theme } from '../domain/types';
import { Button, Chip, ColorContext, Empty, Field, Heading, Label, ModalFrame, Panel, s, Toggle, useColors, quantity, webFocusRing, GlassLayer, titleReflection } from './components';
import { ActivityForm, EntryForm, type SubmitCommand } from './forms';
import { dateLabel, PeriodControls, ReportScreen, StatsScreen } from './reports';
import { alpha, palette, themeColors } from './tokens';
import { typefaces } from './typography';
import { GlassScene, GlassBackdrop, glassShadow } from './material';
import { AmbientBackground } from './ambience';
import { KeyboardScrollView } from './keyboard';
import { compactLastTime, effectiveActivityColumns } from './layout';
import type { ActivityColumns } from '../infrastructure/preferences';
import { DensityTransition, MotionPressable, MovingTabIndicator } from './motion';
import { APP_VERSION } from '../version';
import { ActiveTabModal, SwipeTabBar, TAB_ORDER, TabButton, TabPanel, useTabPosition } from './navigation';
import { retainedPeriod } from './retainedPeriod';

export type Tab = 'home' | 'history' | 'stats' | 'settings';
export interface UIRoute { tab: Tab; activityId?: string; report?: boolean }
export interface DailoopUIProps {
  state: DomainState; nowMs: number; mode: 'personal' | 'demo'; storageLabel: string; busy: boolean; error: string | null;
  onCommand(command: Command, operationId?: string): Promise<CommandResult>;
  onReport(options: ReportOptions): Promise<ReportModel>;
  onSaveReport(report: ReportModel): Promise<string>;
  onCopyReport(report: ReportModel): Promise<string>;
  onShareReport(report: ReportModel): Promise<string>;
  onExportBackup(): Promise<string>;
  onInspectBackup(): Promise<ParsedBackup | null>;
  onRestoreBackup(candidate: ParsedBackup): Promise<void>;
  onMode(mode: 'personal' | 'demo'): Promise<void>;
  onResetDemo?(): Promise<void>;
  onClearError(): void;
  activityColumns: ActivityColumns;
  onActivityColumns(columns: ActivityColumns): Promise<void>;
  presentationBusy?: boolean;
  readOnly?: boolean;
  readOnlyReason?: string;
  initialNotice?: string;
  route?: UIRoute;
  onNavigate?(route: UIRoute): void;
}
type ModalState = { kind: 'activity'; activityId?: string } | { kind: 'entry'; entryId: string } | { kind: 'entry-form'; activityId: string; entryId?: string } | { kind: 'activity-menu'; activityId: string } | null;
interface Confirmation { title: string; text: string; label: string; action(): Promise<unknown> }
const errText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la acción. Puedes volver a intentarlo.';
const labels: Record<Tab, string> = { home: 'Inicio', history: 'Historial', stats: 'Estadísticas', settings: 'Ajustes' };
const marks: Record<Tab, string> = { home: '⌂', history: '◷', stats: '▥', settings: '⚙' };

export default function DailoopUI(props: DailoopUIProps) {
  const { state, nowMs } = props;
  const systemDark = useColorScheme() === 'dark';
  const colors = useMemo(() => themeColors(state.settings.theme, systemDark), [state.settings.theme, systemDark]);
  const [tabSize, setTabSize] = useState({ width: 0, height: 0 });
  const [localRoute, setLocalRoute] = useState<UIRoute>({ tab: 'home' });
  const route = props.route || localRoute;
  const tabIndex = TAB_ORDER.indexOf(route.tab);
  const tabPosition = useTabPosition(tabIndex);
  const [modal, setModal] = useState<ModalState>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [notice, setNotice] = useState(props.initialNotice || '');
  const [localError, setLocalError] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ entryId: string; name: string } | null>(null);
  const [retry, setRetry] = useState<{ command: Command; key: string; onDone?: (r: CommandResult) => void } | null>(null);
  const attempts = useRef(new Map<string, { signature: string; command: Command; operationId: string }>());
  const scroll = useRef<ScrollView>(null);
  const resetReportScroll = useCallback(() => scroll.current?.scrollTo({ x: 0, y: 0, animated: false }), []);
  const allActivities = useMemo(() => selectActivities(state, { includeArchived: true }), [state]);
  const allEntries = useMemo(() => effectiveEntries(state, { includeVoided: true }), [state]);
  const onNavigate = props.onNavigate;
  const navigate = useCallback((next: UIRoute) => { Keyboard.dismiss(); setLocalRoute(next); onNavigate?.(next); setModal(null); if (next.report || next.activityId) scroll.current?.scrollTo({ y: 0, animated: false }); }, [onNavigate]);
  const openActivity = useCallback((activityId: string) => navigate({ tab: 'home', activityId }), [navigate]);
  const newActivity = useCallback(() => setModal({ kind: 'activity' }), []);
  const openMenu = useCallback((activityId: string) => setModal({ kind: 'activity-menu', activityId }), []);
  const openEntry = useCallback((entryId: string) => setModal({ kind: 'entry', entryId }), []);
  const statsReport = useCallback(() => navigate({ tab: 'stats', report: true }), [navigate]);
  const settingsReport = useCallback(() => navigate({ tab: 'settings', report: true }), [navigate]);
  const selectTab = useCallback((index: number) => {
    const tab = TAB_ORDER[index];
    if (!tab || modal || confirm || props.busy) return;
    if (tab !== route.tab || route.activityId || route.report) navigate({ tab });
  }, [modal, confirm, props.busy, route.tab, route.activityId, route.report, navigate]);

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirm || modal) return false;
      if (route.activityId || route.report) { navigate({ tab: route.tab }); return true; }
      if (route.tab !== 'home') { navigate({ tab: 'home' }); return true; }
      return false;
    });
    return () => listener.remove();
  }, [route, modal, confirm, navigate]);

  const { readOnly, readOnlyReason, onCommand, onClearError } = props;
  const perform = useCallback(async (command: Command, key: string, onDone?: (result: CommandResult) => void): Promise<CommandResult> => {
    if (readOnly) { const e = new Error(readOnlyReason || 'Esta pestaña está en modo lectura. Usa la pestaña que tiene abiertos estos datos para guardar cambios.'); setLocalError(e.message); throw e; }
    const signature = JSON.stringify(command);
    let attempt = attempts.current.get(key);
    if (!attempt || attempt.signature !== signature) {
      attempt = { signature, command, operationId: randomUUID() };
      attempts.current.set(key, attempt);
    }
    setPending(list => [...list, key]); setLocalError(''); onClearError();
    try {
      const result = await onCommand(command, attempt.operationId);
      attempts.current.delete(key); setRetry(null); onDone?.(result);
      return result;
    } catch (e) {
      setLocalError(errText(e)); setRetry({ command, key, onDone }); throw e;
    } finally { setPending(list => list.filter(item => item !== key)); }
  }, [readOnly, readOnlyReason, onCommand, onClearError]);
  const submit: SubmitCommand = useCallback((command, key) => perform(command, key, () => { setNotice('Cambios guardados'); setUndo(null); }), [perform]);
  const quickRecord = useCallback((activity: CurrentActivity) => {
    const key = `record-${activity.id}`;
    if (pending.includes(key)) return;
    const previousAttempt = attempts.current.get(key);
    const capturedNow = Date.now();
    const command: Command = previousAttempt?.command || { type: 'createEntry', activityId: activity.id, occurredAtMs: capturedNow, occurredZone: state.settings.zone };
    perform(command, key, result => {
      setNotice(`Registrado: ${activity.name}`);
      if (result.result.entryId) setUndo({ entryId: result.result.entryId, name: activity.name });
      AccessibilityInfo.announceForAccessibility(`Registrado: ${activity.name}, ${displayTime(command.type === 'createEntry' ? command.occurredAtMs ?? capturedNow : capturedNow, state)}`);
    }).catch(() => undefined);
  }, [pending, perform, state]);
  const ask = (confirmation: Confirmation) => { setConfirmationError(''); setModal(null); setConfirm(confirmation); };
  const archive = (activity: CurrentActivity) => ask({
    title: activity.isArchived ? 'Restaurar actividad' : 'Archivar actividad',
    text: activity.isArchived ? `${activity.name} volverá a Inicio con su mismo historial.` : `Archivar ${activity.name} la quita de Inicio. Su historial seguirá disponible.`,
    label: activity.isArchived ? 'Restaurar actividad' : 'Archivar actividad',
    action: () => perform({ type: 'updateActivity', activityId: activity.id, changes: { isArchived: !activity.isArchived } }, `archive-${activity.id}`, () => setNotice(activity.isArchived ? 'Actividad restaurada' : 'Actividad archivada')),
  });
  const detailActivity = allActivities.find(a => a.id === route.activityId);
  const modalActivity = modal && 'activityId' in modal ? allActivities.find(a => a.id === modal.activityId) : undefined;
  const modalEntry = modal && 'entryId' in modal ? allEntries.find(e => e.id === modal.entryId) : undefined;
  const error = localError || props.error;
  const banners = useMemo(() => <>{readOnly && <Panel><Label strong>Vista de sólo lectura</Label><Label small>{readOnlyReason || 'Otra pestaña tiene abiertos estos datos para guardar cambios. Puedes consultar tu historia aquí; realiza los cambios desde la otra pestaña.'}</Label></Panel>}
      {!!error && <Panel><Label strong>! {error}</Label>{retry && <Button secondary disabled={!!readOnly || pending.includes(retry.key)} onPress={() => perform(retry.command, retry.key, retry.onDone).catch(() => undefined)}>Reintentar la misma operación</Button>}<Button subtle compact onPress={() => { setLocalError(''); onClearError(); }}>Cerrar mensaje</Button></Panel>}</>, [readOnly, readOnlyReason, error, retry, pending, perform, onClearError]);
  const footer = useMemo(() => <View style={styles.footerNote}><Image source={require('../../assets/dailoop-glyph.png')} style={styles.footerGlyph} resizeMode="contain" accessible={false} /><Label small style={s.center}>Un registro a la vez. Tu historia, contigo.</Label></View>, []);
  const subpage = !!(route.report || detailActivity);

  return <ColorContext.Provider value={colors}><GlassScene><SafeAreaView style={[styles.outer, { backgroundColor: colors.background }]}>{Platform.OS !== 'web' && <StatusBar barStyle={colors.dark ? 'light-content' : 'dark-content'} animated={false} />}<GlassBackdrop><AmbientBackground dark={colors.dark} /></GlassBackdrop><View style={styles.shell}>
    {Platform.OS === 'web' && <View style={styles.preview}><GlassLayer radius={0} dark={colors.dark} strength="control" /><Text style={[styles.previewText, { color: colors.text }]}>VISTA PREVIA WEB{props.mode === 'demo' ? ' · DATOS DE DEMOSTRACIÓN' : ''}</Text></View>}
    <View style={styles.brandHeader}><View style={s.row}><Image source={require('../../assets/dailoop-app-icon.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Dailoop" /><View><Text style={[styles.wordmark, { color: colors.text }, titleReflection(colors.dark)]}>Dailoop</Text><Text style={[styles.brandCaption, { color: colors.text }]}>Tu día, a tu manera.</Text></View></View><View style={[styles.localPill, { borderColor: 'transparent', backgroundColor: 'transparent' }]}><GlassLayer radius={18} dark={colors.dark} strength="control" /><View style={styles.localDot} /><Text style={[styles.localText, { color: colors.text }]}>En tu dispositivo</Text></View></View>
    <View style={[s.flex, { overflow: 'hidden' }]}>
      <TabPanel active={!subpage && route.tab === 'home'}><HomeTab state={state} nowMs={nowMs} pending={pending} readOnly={readOnly} preferredColumns={props.activityColumns} header={banners} footer={footer} onNew={newActivity} onRecord={quickRecord} onActivity={openActivity} onMenu={openMenu} /></TabPanel>
      <TabPanel active={!subpage && route.tab === 'history'}><HistoryTab state={state} nowMs={nowMs} onEntry={openEntry} header={banners} footer={footer} /></TabPanel>
      <TabPanel active={!subpage && route.tab === 'stats'}><StatsTab state={state} nowMs={nowMs} openReport={statsReport} header={banners} footer={footer} /></TabPanel>
      <TabPanel active={!subpage && route.tab === 'settings'}><SettingsTab state={state} nowMs={nowMs} mode={props.mode} storageLabel={props.storageLabel} busy={props.busy} readOnly={readOnly} activityColumns={props.activityColumns} onActivityColumns={props.onActivityColumns} presentationBusy={props.presentationBusy} onInspectBackup={props.onInspectBackup} onRestoreBackup={props.onRestoreBackup} onExportBackup={props.onExportBackup} onMode={props.onMode} onResetDemo={props.onResetDemo} submit={submit} openReport={settingsReport} onNotice={setNotice} header={banners} footer={footer} /></TabPanel>
      {subpage && <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'android' ? 'height' : undefined}><KeyboardScrollView ref={scroll} style={s.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {banners}
      {route.report ? <ReportScreen state={state} nowMs={nowMs} onBack={() => navigate({ tab: route.tab })} onStageLayout={resetReportScroll} onReport={props.onReport} onSaveReport={props.onSaveReport} onCopyReport={props.onCopyReport} onShareReport={props.onShareReport} />
        : detailActivity ? <ActivityDetail activity={detailActivity} state={state} nowMs={nowMs} pending={pending.includes(`record-${detailActivity.id}`)} readOnly={props.readOnly} onBack={() => navigate({ tab: 'home' })} onRecord={() => quickRecord(detailActivity)} onRetro={() => setModal({ kind: 'entry-form', activityId: detailActivity.id })} onEdit={() => setModal({ kind: 'activity', activityId: detailActivity.id })} onArchive={() => archive(detailActivity)} onEntry={entryId => setModal({ kind: 'entry', entryId })} />
        : null}
      {footer}
    </KeyboardScrollView></KeyboardAvoidingView>}
    </View>
    {!!notice && <View accessibilityLiveRegion="polite" style={[styles.notice, { borderColor: 'transparent', backgroundColor: 'transparent', marginHorizontal: 16, marginBottom: 8 }]}><GlassLayer radius={20} dark={colors.dark} strength="strong" /><Label small strong style={s.flex}>✓ {notice}</Label>{undo && <Button compact subtle label={`Deshacer registro de ${undo.name}`} busy={pending.includes(`undo-${undo.entryId}`)} disabled={props.readOnly} onPress={() => perform({ type: 'voidEntry', entryId: undo.entryId, reason: 'Deshacer registro rápido' }, `undo-${undo.entryId}`, () => { setNotice('Registro anulado. Su historial se conserva.'); setUndo(null); }).catch(() => undefined)}>Deshacer</Button>}{!undo && <Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso" style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.dismiss, webFocusRing(focused, colors.dark ? palette.lavender : palette.violet)]} onPress={() => setNotice('')}><Text style={{ color: colors.text, fontSize: 24, fontFamily: typefaces.body }}>×</Text></Pressable>}</View>}
    <SwipeTabBar index={tabIndex} width={tabSize.width} enabled={!modal && !confirm && !props.busy} position={tabPosition} onSelect={selectTab} accessibilityRole="tablist" accessibilityLabel="Navegación principal" onLayout={event => { const { width, height } = event.nativeEvent.layout; setTabSize(previous => previous.width === width && previous.height === height ? previous : { width, height }); }} style={[styles.tabBar, { borderColor: 'transparent', backgroundColor: 'transparent', boxShadow: glassShadow(colors.dark) }]}><GlassLayer radius={28} dark={colors.dark} strength="strong" /><MovingTabIndicator index={tabIndex} width={tabSize.width} height={tabSize.height} dark={colors.dark} position={tabPosition} />{TAB_ORDER.map((tab, index) => <TabButton key={tab} accessibilityRole="tab" accessibilityLabel={labels[tab]} accessibilityState={{ selected: route.tab === tab }} aria-selected={route.tab === tab} onSelect={() => selectTab(index)} style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.tab, { borderColor: focused ? palette.violet : 'transparent', backgroundColor: 'transparent' }, webFocusRing(focused, colors.dark ? palette.lavender : palette.violet)]}><View style={styles.tabIconWrap}><Text style={[styles.tabIcon, { color: colors.text }]}>{marks[tab]}</Text></View><Text style={[styles.tabLabel, { color: colors.text }, route.tab === tab && { fontFamily: typefaces.bold }]}>{labels[tab]}</Text></TabButton>)}</SwipeTabBar>
  </View></SafeAreaView>
    {modal?.kind === 'activity' && <ActivityForm activity={modalActivity} activities={allActivities} submit={submit} onClose={() => setModal(null)} />}
    {modal?.kind === 'entry-form' && modalActivity && <EntryForm activity={modalActivity} entry={modalEntry} nowMs={nowMs} zone={state.settings.zone} submit={submit} onClose={() => setModal(null)} />}
    {modal?.kind === 'activity-menu' && modalActivity && <ModalFrame title={modalActivity.name} onClose={() => setModal(null)}><Button onPress={() => setModal({ kind: 'activity', activityId: modalActivity.id })}>Editar actividad</Button><Button secondary onPress={() => archive(modalActivity)}>{modalActivity.isArchived ? 'Restaurar actividad' : 'Archivar actividad'}</Button></ModalFrame>}
    {modal?.kind === 'entry' && modalEntry && <EntryDetail entry={modalEntry} state={state} readOnly={props.readOnly} onClose={() => setModal(null)} onEdit={() => setModal({ kind: 'entry-form', entryId: modalEntry.id, activityId: modalEntry.activityId })} onToggle={() => ask({ title: modalEntry.revision.state === 'void' ? 'Restaurar registro' : 'Anular registro', text: modalEntry.revision.state === 'void' ? 'El registro volverá a contar en tus estadísticas. Se añadirá una revisión al historial.' : 'El registro dejará de contar en tus estadísticas. Su historial de cambios se conservará.', label: modalEntry.revision.state === 'void' ? 'Restaurar registro' : 'Anular registro', action: () => perform({ type: modalEntry.revision.state === 'void' ? 'restoreEntry' : 'voidEntry', entryId: modalEntry.id }, `toggle-${modalEntry.id}`, () => setNotice(modalEntry.revision.state === 'void' ? 'Registro restaurado' : 'Registro anulado')) })} />}
    {confirm && <ModalFrame canClose={!confirmBusy} title={confirm.title} onClose={() => !confirmBusy && setConfirm(null)}><Label>{confirm.text}</Label>{!!confirmationError && <Label strong>! {confirmationError}</Label>}<Button busy={confirmBusy} onPress={async () => { setConfirmBusy(true); try { await confirm.action(); setConfirm(null); } catch (e) { setConfirmationError(errText(e)); } finally { setConfirmBusy(false); } }}>{confirm.label}</Button><Button secondary disabled={confirmBusy} onPress={() => setConfirm(null)}>Cancelar</Button></ModalFrame>}
  </GlassScene></ColorContext.Provider>;
}

type TabChrome = { header: React.ReactNode; footer: React.ReactNode };
function TabScroll({ header, footer, children }: TabChrome & { children: React.ReactNode }) {
  return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'android' ? 'height' : undefined}><KeyboardScrollView style={s.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{header}{children}{footer}</KeyboardScrollView></KeyboardAvoidingView>;
}
const HomeTab = memo(Home);
const HistoryTab = memo(function HistoryTab({ header, footer, ...props }: TabChrome & React.ComponentProps<typeof History>) {
  return <TabScroll header={header} footer={footer}><History {...props} /></TabScroll>;
});
const StatsTab = memo(function StatsTab({ header, footer, ...props }: TabChrome & React.ComponentProps<typeof StatsScreen>) {
  return <TabScroll header={header} footer={footer}><StatsScreen {...props} /></TabScroll>;
});
const SettingsTab = memo(function SettingsTab({ header, footer, ...props }: TabChrome & SettingsProps) {
  return <TabScroll header={header} footer={footer}><Settings {...props} /></TabScroll>;
});

function displayTime(ms: number, state: DomainState) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: state.settings.zone, hour: '2-digit', minute: '2-digit', hour12: state.settings.hourFormat === '12h' }).format(ms);
}
function Home({ state, nowMs, pending, readOnly, preferredColumns, header, footer, onNew, onRecord, onActivity, onMenu }: { state: DomainState; nowMs: number; pending: string[]; readOnly?: boolean; preferredColumns: ActivityColumns; header: React.ReactNode; footer: React.ReactNode; onNew(): void; onRecord(a: CurrentActivity): void; onActivity(id: string): void; onMenu(id: string): void }) {
  const colors = useColors();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(Math.min(560, windowWidth) - 46);
  const columns = effectiveActivityColumns(preferredColumns, availableWidth, fontScale);
  const cardWidth = (availableWidth - (columns - 1) * 8) / columns;
  const [showArchived, setShowArchived] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const activities = useMemo(() => selectActivities(state, { includeArchived: true }), [state]);
  const homeData = useMemo(() => {
    const entries = effectiveEntries(state);
    const lastByActivity = new Map<string, number>();
    for (const entry of entries) lastByActivity.set(entry.activityId, Math.max(lastByActivity.get(entry.activityId) ?? -Infinity, entry.revision.occurredAtMs));
    return { entries, lastByActivity };
  }, [state]);
  const active = activities.filter(a => showArchived ? a.isArchived : !a.isArchived);
  const categories = [...new Set(active.map(a => a.category).filter(Boolean))] as string[];
  const displayed = active.filter(a => !category || a.category === category);
  const today = localDate(nowMs, state.settings.zone);
  const zone = state.settings.zone;
  const todayCounts = useMemo(() => {
    const startMs = startOfLocalDay(today, zone);
    const endMs = startOfLocalDay(addCalendarDays(today, 1), zone);
    const byActivity = new Map<string, number>();
    let total = 0;
    for (const entry of homeData.entries) if (entry.revision.occurredAtMs >= startMs && entry.revision.occurredAtMs < endMs) { byActivity.set(entry.activityId, (byActivity.get(entry.activityId) ?? 0) + 1); total++; }
    return { total, byActivity };
  }, [homeData, today, zone]);
  const heading = <View style={[s.stack, { marginBottom: 18 }]}>{header}
    <View style={styles.eyebrowRow}><View style={styles.eyebrowLine} /><Text style={[styles.eyebrow, { color: colors.text }]}>{new Intl.DateTimeFormat('es-CO', { timeZone: state.settings.zone, weekday: 'long', day: 'numeric', month: 'long' }).format(nowMs)}</Text></View>
    <Heading subtitle="Las pequeñas cosas también tienen su historia.">¿Qué quieres registrar?</Heading>
    <View style={[s.spread, { flexWrap: 'wrap' }]}><View><Label small>{todayCounts.total} {todayCounts.total === 1 ? 'registro hoy' : 'registros hoy'} · {quantity(activities.filter(a => !a.isArchived).length, 'actividad activa', 'actividades activas')}</Label></View><Button compact secondary disabled={readOnly} onPress={onNew}>＋ Nueva actividad</Button></View>
    {!!categories.length && <View style={s.wrap}><Chip selected={!category} onPress={() => setCategory(null)}>Todas</Chip>{categories.map(item => <Chip key={item} selected={category === item} onPress={() => setCategory(item)}>{item}</Chip>)}</View>}
    {activities.length > 0 && <View style={s.wrap}><Chip selected={!showArchived} onPress={() => { setShowArchived(false); setCategory(null); }}>Activas</Chip><Chip selected={showArchived} onPress={() => { setShowArchived(true); setCategory(null); }}>Archivadas</Chip></View>}
    {!displayed.length && <Empty symbol="✧" title={activities.length === 0 ? 'Cada cosa tiene su momento' : showArchived ? 'No hay actividades archivadas' : 'No hay actividades en esta vista'} text={activities.length === 0 ? 'Leer, regar tus plantas, llamar a alguien… Tú decides qué merece un registro.' : 'Crea una actividad o cambia el filtro para seguir explorando.'}>{activities.length === 0 && <Button disabled={readOnly} onPress={onNew}>Crear mi primera actividad</Button>}</Empty>}
    {columns !== preferredColumns && <Label small>Tu elección de {preferredColumns} columnas se adapta a {columns} por el espacio y tamaño de texto.</Label>}
  </View>;
  return <DensityTransition columns={columns}><FlatList key={columns} data={displayed} numColumns={columns}
    testID="activity-grid" style={s.flex} contentContainerStyle={styles.content}
    onLayout={event => setAvailableWidth(Math.max(0, event.nativeEvent.layout.width - 46))}
    keyExtractor={activity => activity.id} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
    removeClippedSubviews={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
    columnWrapperStyle={columns > 1 ? { gap: 8 } : undefined} ListHeaderComponent={heading} ListFooterComponent={<>{footer}</>}
    renderItem={({ item: activity }) => <View style={{ width: cardWidth }}><ActivityCard activity={activity} columns={columns} zone={zone} nowMs={nowMs} todayCount={todayCounts.byActivity.get(activity.id) || 0} last={homeData.lastByActivity.get(activity.id) ?? null} pending={pending.includes(`record-${activity.id}`)} readOnly={readOnly} onRecord={() => onRecord(activity)} onOpen={() => onActivity(activity.id)} onMenu={() => onMenu(activity.id)} /></View>}
  /></DensityTransition>;
}
function ActivityCard({ activity, columns, zone, nowMs, todayCount, last, pending, readOnly, onRecord, onOpen, onMenu }: { activity: CurrentActivity; columns: ActivityColumns; zone: string; nowMs: number; todayCount: number; last: number | null; pending: boolean; readOnly?: boolean; onRecord(): void; onOpen(): void; onMenu(): void }) {
  const c = useColors();
  const elapsed = elapsedSince(last, nowMs);
  if (columns > 1) return <View testID={`activity-card-${columns}`} style={[styles.compactCard, { borderRadius: columns === 2 ? 26 : 22, padding: columns === 2 ? 14 : 7, boxShadow: glassShadow(c.dark) }]}>
    <GlassLayer radius={columns === 2 ? 26 : 22} tint={activity.color} dark={c.dark} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver detalle de ${activity.name}`} accessibilityHint="Abre el nombre y el historial de la actividad" onPress={onOpen} style={({ focused }: { pressed: boolean; focused?: boolean }) => [{ minHeight: 48, alignItems: 'center', gap: 5, borderRadius: 12 }, webFocusRing(focused, c.dark ? palette.lavender : palette.ink)]}>
      <Text accessible={false} style={{ fontSize: columns === 2 ? 32 : 27 }}>{activity.emoji}</Text>
      {columns < 4 && <Text numberOfLines={2} style={{ fontFamily: typefaces.display, fontSize: columns === 2 ? 20 : 16, lineHeight: columns === 2 ? 26 : 22, textAlign: 'center', color: c.text }}>{activity.name}</Text>}
    </Pressable>
    <Text numberOfLines={2} accessibilityLabel={last == null ? 'Aún no hay registros' : `Última vez: ${formatDateTime(last, zone)}`} style={{ fontFamily: typefaces.medium, fontSize: 11, lineHeight: 17, color: c.text, textAlign: 'center' }}>{compactLastTime(last, nowMs)}</Text>
    <MotionPressable accessibilityRole="button" accessibilityLabel={`${activity.isArchived ? 'Ver historial de' : 'Registrar'} ${activity.name}`} accessibilityState={{ busy: pending, disabled: pending || readOnly }} disabled={pending || readOnly} onPress={activity.isArchived ? onOpen : onRecord} style={({ focused }: { pressed: boolean; focused?: boolean }) => [{ minHeight: 48, minWidth: 48, paddingHorizontal: 2, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.ink, opacity: pending || readOnly ? 0.65 : 1 }, webFocusRing(focused, palette.lavender)]}>
      <GlassLayer radius={14} dark strength="control" highContrast /><Text style={{ fontFamily: typefaces.bold, fontSize: columns === 2 ? 13 : 11, lineHeight: 18, color: palette.base, textAlign: 'center' }}>{pending ? 'Guardando…' : activity.isArchived ? 'Historial' : 'Registrar'}</Text>
    </MotionPressable>
  </View>;
  return <View style={[styles.activityCard, { backgroundColor: 'transparent', borderColor: 'transparent', boxShadow: glassShadow(c.dark) }]}>
    <GlassLayer radius={30} tint={activity.color} dark={c.dark} />
    <View style={s.spread}><View style={[s.row, s.flex]}><View style={styles.emojiBadge}><GlassLayer radius={20} dark={c.dark} tint={activity.color} strength="control" /><Text accessible={false} style={styles.emoji}>{activity.emoji}</Text></View><View style={s.flex}><Text style={[styles.cardCategory, { color: c.text, borderLeftColor: activity.color }]}>{activity.category || 'TU ACTIVIDAD'}{activity.isPrivate ? ' · PRIVADA' : ''}</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel={`Opciones de ${activity.name}`} accessibilityState={{ disabled: readOnly }} disabled={readOnly} onPress={onMenu} style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.menuButton, webFocusRing(focused, c.dark ? palette.lavender : palette.ink)]}><Text style={[styles.menuText, { color: c.text }]}>···</Text></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver detalle de ${activity.name}`} onPress={onOpen} style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.cardInformation, webFocusRing(focused, c.dark ? palette.lavender : palette.ink)]}><Text numberOfLines={2} style={[styles.activityName, { color: c.text }, titleReflection(c.dark)]}>{activity.name}</Text><Text accessibilityLabel={last == null ? 'Aún no hay registros' : `Última vez: ${formatDateTime(last, zone)}`} style={[styles.lastTime, { color: c.text }]}>{elapsed.status === 'never' ? 'Aún no hay registros' : elapsed.status === 'clockChanged' ? `${formatDateTime(last!, zone)} · Revisa la hora del dispositivo` : `Última vez: ${elapsed.text.toLocaleLowerCase('es-CO')}`}</Text></Pressable>
    <View style={styles.cardBottom}><View style={styles.todayBadge}><Text style={[styles.todayCount, { color: c.text }]}>{todayCount}</Text><Text style={[styles.todayLabel, { color: c.text }]}>hoy</Text></View><View style={s.flex}>{activity.isArchived ? <Button secondary onPress={onOpen}>Ver historial</Button> : <MotionPressable accessibilityRole="button" accessibilityLabel={`Registrar ${activity.name}`} accessibilityState={{ busy: pending, disabled: pending || readOnly }} aria-busy={pending} aria-disabled={!!(pending || readOnly)} disabled={pending || readOnly} onPress={onRecord} style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [styles.recordButton, { opacity: pressed || pending || readOnly ? 0.7 : 1, borderWidth: 3, borderColor: focused ? palette.base : palette.ink }, webFocusRing(focused, c.dark ? palette.lavender : palette.ink)]}><GlassLayer radius={18} dark strength="control" highContrast /><Text style={styles.recordLabel}>{pending ? 'Guardando…' : '＋  Registrar'}</Text></MotionPressable>}</View></View>
  </View>;
}

function ActivityDetail({ activity, state, nowMs, pending, readOnly, onBack, onRecord, onRetro, onEdit, onArchive, onEntry }: { activity: CurrentActivity; state: DomainState; nowMs: number; pending: boolean; readOnly?: boolean; onBack(): void; onRecord(): void; onRetro(): void; onEdit(): void; onArchive(): void; onEntry(id: string): void }) {
  const [includeVoided, setIncludeVoided] = useState(false);
  const [limit, setLimit] = useState(40);
  const entries = effectiveEntries(state, { activityIds: [activity.id], includeVoided }).reverse();
  const last = lastOccurredAt(state, activity.id);
  return <View style={s.stack}><Button subtle compact onPress={onBack}>‹ Volver a Inicio</Button><Heading subtitle={activity.isArchived ? 'Actividad archivada · su historia sigue contigo' : 'Cada registro, en su lugar.'}>{activity.emoji} {activity.name}</Heading>
    <Panel><Label strong>{elapsedSince(last, nowMs).text}</Label>{last != null && <Label small>{formatDateTime(last, state.settings.zone)}</Label>}<Label>{quantity(effectiveEntries(state, { activityIds: [activity.id] }).length, 'registro vigente', 'registros vigentes')}</Label>{activity.isPrivate && <Label small>Privada · se excluye inicialmente de reportes</Label>}{activity.category && <Label small>Categoría: {activity.category}</Label>}</Panel>
    {!activity.isArchived ? <><Button disabled={readOnly} busy={pending} onPress={onRecord}>Registrar {activity.name}</Button><Button disabled={readOnly} secondary onPress={onRetro}>Registrar otra fecha</Button></> : <Button disabled={readOnly} onPress={onArchive}>Restaurar actividad</Button>}
    <View style={s.row}><View style={s.flex}><Button disabled={readOnly} subtle compact onPress={onEdit}>Editar actividad</Button></View>{!activity.isArchived && <View style={s.flex}><Button disabled={readOnly} subtle compact onPress={onArchive}>Archivar</Button></View>}</View>
    <Heading>Su historia</Heading><Toggle label="Mostrar anulados" value={includeVoided} onChange={setIncludeVoided} /><Label small>{quantity(entries.length, 'registro', 'registros')} en esta vista</Label>{!entries.length && <Empty title="Aún no has registrado esta actividad" text="Su historia aparecerá aquí después del primer registro." />}
    <EntryList entries={entries.slice(0, limit)} state={state} onEntry={onEntry} />{entries.length > limit && <Button secondary onPress={() => setLimit(n => n + 40)}>Cargar más registros</Button>}
  </View>;
}

function History({ state, nowMs, onEntry }: { state: DomainState; nowMs: number; onEntry(id: string): void }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeVoided, setIncludeVoided] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [allTime, setAllTime] = useState(true);
  const [limit, setLimit] = useState(40);
  const [period, setPeriod] = useState(() => periodFor('month', localDate(nowMs, state.settings.zone), state.settings.zone, nowMs));
  const activities = useMemo(() => selectActivities(state, { includeArchived: true }), [state]);
  const today = localDate(nowMs, state.settings.zone);
  const dayNow = useMemo(() => startOfLocalDay(today, state.settings.zone), [today, state.settings.zone]);
  const normalized = useMemo(() => retainedPeriod(period, state.settings.zone, dayNow), [period, state.settings.zone, dayNow]);
  const entries = useMemo(() => effectiveEntries(state, { includeVoided, activityIds: selected.length ? selected : undefined, ...(allTime ? {} : { fromMs: normalized.startMs, toMs: normalized.endMs }) }).filter(e => (includeArchived || !e.activity.isArchived) && e.activity.name.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())).reverse(), [state, includeVoided, selected, allTime, normalized.startMs, normalized.endMs, includeArchived, search]);
  return <View style={s.stack}><Heading subtitle="Vuelve a cualquier momento, sin perder el hilo.">Tu historia</Heading><Field label="Buscar una actividad" placeholder="Nombre de la actividad" value={search} onChangeText={v => { setSearch(v); setLimit(40); }} /><Button secondary compact onPress={() => setFilters(!filters)}>{filters ? 'Cerrar filtros' : 'Filtrar historial'}</Button>
    {filters && <Panel><Toggle label="Todo el historial" value={allTime} onChange={setAllTime} />{!allTime && <PeriodControls period={normalized} nowMs={nowMs} onChange={p => { setPeriod(p); setLimit(40); }} />}<Toggle label="Incluir actividades archivadas" value={includeArchived} onChange={setIncludeArchived} /><Toggle label="Mostrar registros anulados" value={includeVoided} onChange={setIncludeVoided} /><Label strong>Actividades</Label><View style={s.wrap}><Chip selected={!selected.length} onPress={() => setSelected([])}>Todas</Chip>{activities.filter(a => includeArchived || !a.isArchived).map(a => <Chip key={a.id} selected={selected.includes(a.id)} onPress={() => setSelected(selected.includes(a.id) ? selected.filter(id => id !== a.id) : [...selected, a.id])}>{a.emoji} {a.name}</Chip>)}</View><Button subtle compact onPress={() => { setSelected([]); setAllTime(true); setSearch(''); setIncludeArchived(false); setIncludeVoided(false); }}>Restablecer filtros</Button></Panel>}
    <Label small>{quantity(entries.length, 'registro', 'registros')} · {allTime ? 'Todo el historial' : `${dateLabel(normalized.from)} — ${dateLabel(normalized.to)}`} · {state.settings.zone}</Label>
    {!entries.length && <Empty title="Todavía no hay registros aquí" text="Prueba otro período o cambia los filtros. Cada registro que guardes tendrá su lugar en esta historia." />}
    <EntryList entries={entries.slice(0, limit)} state={state} onEntry={onEntry} />{entries.length > limit && <Button secondary onPress={() => setLimit(n => n + 40)}>Cargar más · {quantity(entries.length - limit, 'restante', 'restantes')}</Button>}
  </View>;
}

function EntryList({ entries, state, onEntry }: { entries: EffectiveEntry[]; state: DomainState; onEntry(id: string): void }) {
  const c = useColors();
  return <View style={{ gap: 10 }}>{entries.map((entry, index) => {
    const date = localDate(entry.revision.occurredAtMs, state.settings.zone);
    const newDay = index === 0 || date !== localDate(entries[index - 1].revision.occurredAtMs, state.settings.zone);
    return <React.Fragment key={entry.id}>{newDay && <Text accessibilityRole="header" style={[styles.dayHeading, { color: c.text }]}>{dateLabel(date)}</Text>}<Pressable accessibilityRole="button" accessibilityLabel={`${entry.activity.name}, ${displayTime(entry.revision.occurredAtMs, state)}, ${entry.revision.state === 'void' ? 'anulado' : entry.revision.revisionNo > 1 ? 'con cambios' : 'registrado'}`} onPress={() => onEntry(entry.id)} style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [styles.entryRow, { borderColor: 'transparent', backgroundColor: 'transparent', opacity: pressed ? 0.7 : 1 }, webFocusRing(focused, c.dark ? palette.lavender : palette.violet)]}><GlassLayer radius={22} dark={c.dark} strength="strong" /><View style={styles.entryEmoji}><Text style={{ fontSize: 24 }} accessible={false}>{entry.activity.emoji}</Text></View><View style={s.flex}><Label strong>{entry.activity.name}</Label><Label small>{displayTime(entry.revision.occurredAtMs, state)}{entry.revision.state === 'void' ? ' · Anulado' : entry.revision.revisionNo > 1 ? ' · Con cambios' : ''}{entry.activity.isArchived ? ' · Archivada' : ''}</Label></View><Text style={{ color: c.text, fontSize: 23, fontFamily: typefaces.body }}>›</Text></Pressable></React.Fragment>;
  })}</View>;
}
function EntryDetail({ entry, state, readOnly, onClose, onEdit, onToggle }: { entry: EffectiveEntry; state: DomainState; readOnly?: boolean; onClose(): void; onEdit(): void; onToggle(): void }) {
  const [audit, setAudit] = useState(false);
  const revisions = state.entryRevisions.filter(r => r.entryId === entry.id).sort((a, b) => a.revisionNo - b.revisionNo);
  const kindLabel = { create: 'Registrado', correct: 'Corregido', void: 'Anulado', restore: 'Restaurado' };
  return <ModalFrame title={`${entry.activity.emoji} ${entry.activity.name}`} subtitle={entry.revision.state === 'void' ? 'Registro anulado' : 'Registro vigente'} onClose={onClose}>
    <Panel><Label small>OCURRIÓ EL</Label><Label strong>{formatDateTime(entry.revision.occurredAtMs, state.settings.zone)}</Label><Label small>Zona de agrupación: {state.settings.zone}</Label><Label small>Dato original: {formatDateTime(entry.revision.occurredAtMs, entry.revision.occurredZone)} · {entry.revision.occurredZone}</Label><Label small>REGISTRADO EL</Label><Label>{formatDateTime(entry.createdAtMs, state.settings.zone)}</Label>{!!entry.revision.note && <><Label small>NOTA</Label><Label>{entry.revision.note}</Label></>}</Panel>
    {entry.revision.state === 'active' && <Button disabled={readOnly} onPress={onEdit}>Corregir registro</Button>}<Button disabled={readOnly} secondary onPress={onToggle}>{entry.revision.state === 'void' ? 'Restaurar registro' : 'Anular registro'}</Button><Button subtle onPress={() => setAudit(!audit)}>{audit ? 'Ocultar cambios' : `Ver cambios (${revisions.length})`}</Button>
    {audit && <View style={s.stack}><Label small>Orden de guardado. Las versiones anteriores se conservan incluso si cambia el reloj del dispositivo.</Label>{revisions.map((revision, index) => {
      const snapshot = state.activityRevisions.find(a => a.id === revision.activityRevisionId);
      const operation = state.operations.find(o => o.id === revision.operationId);
      return <Panel key={revision.id}><Label strong>{index + 1}. {kindLabel[revision.kind]}</Label><Label small>Operación {operation?.sequence ?? '—'} · {formatDateTime(revision.recordedAtMs, state.settings.zone)}</Label><Label small>Ocurrió el: {formatDateTime(revision.occurredAtMs, revision.occurredZone)}</Label><Label small>Actividad en ese momento: {snapshot?.name || entry.activity.name}</Label><Label small>Estado: {revision.state === 'active' ? 'vigente' : 'anulado'}</Label>{!!revision.note && <Label small>Nota: {revision.note}</Label>}{!!revision.reason && <Label small>Motivo: {revision.reason}</Label>}</Panel>;
    })}</View>}
  </ModalFrame>;
}

type SettingsProps = Pick<DailoopUIProps, 'state' | 'nowMs' | 'mode' | 'storageLabel' | 'busy' | 'readOnly' | 'activityColumns' | 'onActivityColumns' | 'presentationBusy' | 'onInspectBackup' | 'onRestoreBackup' | 'onExportBackup' | 'onMode' | 'onResetDemo'> & { submit: SubmitCommand; openReport(): void; onNotice(message: string): void };
function Settings(props: SettingsProps) {
  const { state, submit } = props;
  const [zone, setZone] = useState(state.settings.zone);
  const committedZone = useRef(state.settings.zone);
  useEffect(() => {
    const previous = committedZone.current;
    committedZone.current = state.settings.zone;
    setZone(draft => draft === previous || draft.trim() === state.settings.zone ? state.settings.zone : draft);
  }, [state.settings.zone]);
  const [candidate, setCandidate] = useState<ParsedBackup | null>(null);
  const [backupConfirm, setBackupConfirm] = useState(false);
  const [demoResetConfirm, setDemoResetConfirm] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const action = async (key: string, work: () => Promise<unknown>) => { setBusy(key); setError(''); try { const result = await work(); if (typeof result === 'string') props.onNotice(result); } catch (e) { setError(errText(e)); } finally { setBusy(''); } };
  return <View style={s.stack}><Heading subtitle="A tu manera. Siempre bajo tu control.">Tus ajustes</Heading>
    <Panel><Label strong>Apariencia</Label><View style={s.wrap}>{([['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']] as [Theme, string][]).map(([theme, label]) => <Chip key={theme} disabled={props.readOnly} selected={state.settings.theme === theme} onPress={() => action('theme', () => submit({ type: 'updateSettings', changes: { theme } }, 'settings-theme'))}>{label}</Chip>)}</View><Label small>Respeta el tamaño de texto y movimiento reducido de tu dispositivo.</Label></Panel>
    <Panel><Label strong>Distribución de actividades</Label><Label small>Elige cuántas tarjetas quieres ver por fila.</Label><View style={s.wrap}>{([1, 2, 3, 4] as ActivityColumns[]).map(columns => <Chip key={columns} label={`${columns} ${columns === 1 ? 'columna' : 'columnas'}`} selected={props.activityColumns === columns} disabled={props.presentationBusy} onPress={() => { void props.onActivityColumns(columns); }}>{columns}</Chip>)}</View><Label small>Se guarda en este dispositivo. Con texto ampliado, las tarjetas se adaptan para seguir siendo legibles. No cambia tus registros ni el contenido del backup.</Label></Panel>
    <Panel><Label strong>Fechas y horas</Label><View style={s.wrap}>{(['24h', '12h'] as const).map(hourFormat => <Chip key={hourFormat} disabled={props.readOnly} selected={state.settings.hourFormat === hourFormat} onPress={() => action('time', () => submit({ type: 'updateSettings', changes: { hourFormat } }, 'settings-hour'))}>{hourFormat === '24h' ? '24 horas' : '12 horas'}</Chip>)}</View><Field label="Zona horaria para agrupar" value={zone} editable={!props.readOnly} onChangeText={setZone} autoCapitalize="none" autoCorrect={false} hint="Identificador IANA, por ejemplo America/Bogota." /><Label small>Al cambiarla, los registros cerca de medianoche pueden aparecer en otro día. Sus instantes originales no cambian. Las semanas van de lunes a domingo.</Label><Button secondary busy={busy === 'zone'} disabled={props.readOnly || zone === state.settings.zone} onPress={() => action('zone', () => submit({ type: 'updateSettings', changes: { zone: zone.trim() } }, 'settings-zone'))}>Guardar zona</Button></Panel>
    <Panel><Label strong>Tus datos</Label><Label>Tus datos se guardan en este dispositivo. No necesitas cuenta ni conexión.</Label><Button onPress={props.openReport}>Generar reporte</Button><Button secondary disabled={!!busy} onPress={() => setBackupConfirm(true)}>Crear backup completo</Button><Button subtle disabled={!!busy || props.readOnly} onPress={() => action('inspect', async () => { const parsed = await props.onInspectBackup(); if (parsed) setCandidate(parsed); })}>{busy === 'inspect' ? 'Validando archivo…' : 'Restaurar un backup'}</Button>{lastBackup && <Label small>Último archivo preparado en esta sesión: {lastBackup}. Esto no confirma que el archivo siga existiendo.</Label>}<Label small>Los reportes contienen lo que eliges. Un backup incluye todas las actividades, datos privados e historial de cambios.</Label></Panel>
    {Platform.OS === 'web' ? <Panel><Label strong>Acerca de esta preview</Label><Label small>{props.storageLabel}</Label><Label small>Datos locales de este navegador; no se sincronizan con Android. Borrar datos del sitio puede eliminarlos.</Label><Label small>Comparte pantallas y reglas con Android. Los diálogos de archivos, compartir, emojis y persistencia dependen del navegador. Las capacidades nativas siguen pendientes de probar en Android.</Label><Label small>{props.mode === 'demo' ? 'Datos ficticios en una base separada. No son tus registros personales.' : 'Base personal. No se crean datos de ejemplo automáticamente.'}</Label><Button secondary disabled={!!busy || props.busy || props.readOnly} onPress={() => action('mode', () => props.onMode(props.mode === 'demo' ? 'personal' : 'demo'))}>{props.mode === 'demo' ? 'Volver a mis datos' : 'Explorar con datos de demostración'}</Button>{props.mode === 'demo' && props.onResetDemo && <Button subtle disabled={!!busy || props.busy || props.readOnly} onPress={() => setDemoResetConfirm(true)}>Reiniciar demostración</Button>}<Label small>Dailoop · v{APP_VERSION} · Sin cuenta, anuncios ni analítica</Label></Panel> : <Panel><Label strong>Acerca de Dailoop</Label><Label small>v{APP_VERSION} · Sin cuenta, anuncios ni analítica</Label></Panel>}
    {!!error && <Label strong>! {error}</Label>}
    {demoResetConfirm && <ActiveTabModal><ModalFrame canClose={!busy} title="Reiniciar demostración" onClose={() => !busy && setDemoResetConfirm(false)}><Label>Se eliminarán los registros que añadiste a la demostración y se repondrán las actividades y registros ficticios iniciales. Esta acción afecta exclusivamente a la base de demostración.</Label><Label strong>Tus datos personales no cambiarán.</Label>{!!error && <Label strong>! {error}</Label>}<Button disabled={!!busy || props.busy || props.readOnly} onPress={() => action('reset-demo', async () => { await props.onResetDemo?.(); setDemoResetConfirm(false); })}>{busy === 'reset-demo' ? 'Reiniciando demostración…' : 'Confirmar reinicio de demostración'}</Button><Button secondary disabled={!!busy || props.busy} onPress={() => setDemoResetConfirm(false)}>Cancelar</Button></ModalFrame></ActiveTabModal>}
    {backupConfirm && <ActiveTabModal><ModalFrame canClose={!busy} title="Tu historia, en un archivo" onClose={() => !busy && setBackupConfirm(false)}><Label>El backup incluye todas tus actividades, registros privados, notas e historial de cambios.</Label><Panel><Label strong>{quantity(state.activities.length, 'actividad', 'actividades')} · {quantity(state.entries.length, 'registro', 'registros')}</Label><Label small>{quantity(state.entryRevisions.length, 'revisión', 'revisiones')} de registros</Label><Label small>El archivo es legible y no tiene cifrado con contraseña. Guárdalo en un lugar que controles.</Label></Panel>{!!error && <Label strong>! {error}</Label>}<Button disabled={!!busy} onPress={() => action('export', async () => { const result = await props.onExportBackup(); setLastBackup(formatDateTime(props.nowMs, state.settings.zone)); setBackupConfirm(false); return result; })}>{busy === 'export' ? 'Preparando archivo…' : 'Guardar backup completo'}</Button><Button secondary disabled={!!busy} onPress={() => setBackupConfirm(false)}>Cancelar</Button></ModalFrame></ActiveTabModal>}
    {candidate && <ActiveTabModal><ModalFrame canClose={!busy} title="Revisar restauración" onClose={() => !busy && setCandidate(null)}><Label>El archivo pasó la validación previa. Estos metadatos los declara el propio archivo:</Label><Panel><Label strong>{quantity(candidate.summary.activities, 'actividad', 'actividades')} · {quantity(candidate.summary.entries, 'registro', 'registros')}</Label><Label>{quantity(candidate.summary.entryRevisions, 'revisión', 'revisiones')}</Label><Label small>Exportado: {candidate.summary.exportedAt}</Label>{candidate.summary.firstOccurredAtMs != null && <Label small>Desde: {formatDateTime(candidate.summary.firstOccurredAtMs, candidate.state.settings.zone)}</Label>}{candidate.summary.lastOccurredAtMs != null && <Label small>Hasta: {formatDateTime(candidate.summary.lastOccurredAtMs, candidate.state.settings.zone)}</Label>}</Panel><Label strong>Reemplazará todos los datos de la base {props.mode === 'demo' ? 'de demostración' : 'personal'} actual. No se mezclarán las bases.</Label><Label>Se conservará una copia local de recuperación durante la restauración. Recomendamos guardar antes tu backup actual.</Label><Button secondary disabled={!!busy} onPress={() => action('before-restore', props.onExportBackup)}>Guardar mi backup actual</Button>{!!error && <Label strong>! {error}</Label>}<Button disabled={!!busy} onPress={() => action('restore', async () => { await props.onRestoreBackup(candidate); setCandidate(null); props.onNotice('Backup restaurado y verificado.'); })}>{busy === 'restore' ? 'Restaurando y verificando…' : 'Confirmar reemplazo y restaurar'}</Button><Button subtle disabled={!!busy} onPress={() => setCandidate(null)}>Cancelar sin cambiar datos</Button></ModalFrame></ActiveTabModal>}
  </View>;
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' }, shell: { flex: 1, width: '100%', maxWidth: 560 }, ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: 330 },
  preview: { paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center' }, previewText: { fontFamily: typefaces.bold, color: palette.ink, fontSize: 10, lineHeight: 16, letterSpacing: 1.4, textAlign: 'center' },
  brandHeader: { paddingHorizontal: 23, paddingTop: 25, paddingBottom: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }, logo: { width: 47, height: 47 }, wordmark: { fontFamily: typefaces.displayBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.8 }, brandCaption: { fontFamily: typefaces.medium, fontSize: 11, lineHeight: 17, opacity: 0.8 }, localPill: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', gap: 6, alignItems: 'center' }, localDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.violet }, localText: { fontFamily: typefaces.medium, fontSize: 10, lineHeight: 16 },
  content: { paddingHorizontal: 23, paddingTop: 5, paddingBottom: 24, gap: 16 }, eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, eyebrowLine: { width: 20, height: 2, backgroundColor: palette.violet }, eyebrow: { fontFamily: typefaces.semibold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', lineHeight: 18 },
  compactCard: { borderWidth: 1, borderColor: 'transparent', gap: 10, flex: 1, justifyContent: 'space-between' },
  activityCard: { padding: 22, borderRadius: 30, borderWidth: 1, gap: 18, boxShadow: '0 10px 25px ' + alpha(palette.ink, 0.09) }, cardDecoration: { position: 'absolute', top: 1, right: 1, bottom: 1, left: 1, borderRadius: 29, overflow: 'hidden' }, cardArc: { position: 'absolute', width: 230, height: 230, borderRadius: 115, right: -88, top: -133, borderWidth: 1, borderColor: alpha(palette.base, 0.72), backgroundColor: alpha(palette.base, 0.12) }, emojiBadge: { width: 54, height: 54, borderRadius: 20, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', boxShadow: '0 5px 12px ' + alpha(palette.ink, 0.045) }, emoji: { fontSize: 29 }, cardCategory: { fontFamily: typefaces.bold, color: palette.ink, fontSize: 10, lineHeight: 17, letterSpacing: 1.1, flexShrink: 1, borderLeftWidth: 3, paddingLeft: 8 }, menuButton: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, menuText: { fontFamily: typefaces.body, fontSize: 28, lineHeight: 34, color: palette.ink }, cardInformation: { gap: 8, borderRadius: 8 }, activityName: { fontFamily: typefaces.display, fontSize: 27, lineHeight: 34, letterSpacing: -0.5, color: palette.ink }, lastTime: { fontFamily: typefaces.medium, fontSize: 12, lineHeight: 21, color: palette.ink }, cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 16 }, todayBadge: { minWidth: 49, alignItems: 'center', gap: 0 }, todayCount: { fontFamily: typefaces.display, fontSize: 29, color: palette.ink, lineHeight: 34 }, todayLabel: { fontFamily: typefaces.medium, fontSize: 11, color: palette.ink, lineHeight: 17 }, recordButton: { minHeight: 54, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 18, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center', boxShadow: '0 5px 12px ' + alpha(palette.ink, 0.13) }, recordLabel: { fontFamily: typefaces.bold, fontSize: 14, color: palette.base, lineHeight: 23 },
  tabBar: { flexDirection: 'row', borderWidth: 1, borderRadius: 28, marginHorizontal: 12, marginBottom: 12, marginTop: 3, paddingVertical: 8, paddingHorizontal: 5, gap: 2 }, tab: { flex: 1, minWidth: 0, borderWidth: 2, borderRadius: 21, alignItems: 'center', gap: 5, minHeight: 66, justifyContent: 'flex-start', paddingVertical: 5 }, tabIconWrap: { width: 46, minHeight: 29, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, tabIcon: { fontFamily: typefaces.body, fontSize: 23, lineHeight: 29 }, tabLabel: { fontFamily: typefaces.medium, fontSize: 11, lineHeight: 18, textAlign: 'center', maxWidth: '100%', flexShrink: 1 }, footerNote: { alignItems: 'center', paddingVertical: 26, gap: 10, opacity: 0.8 }, footerGlyph: { width: 25, height: 25 },
  notice: { borderWidth: 1, borderRadius: 20, paddingLeft: 15, paddingRight: 7, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }, dismiss: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  dayHeading: { fontFamily: typefaces.bold, fontSize: 12, lineHeight: 21, marginTop: 16, marginBottom: 3, letterSpacing: 0.2 }, entryRow: { borderWidth: 1, borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 86 }, entryEmoji: { width: 46, height: 46, borderRadius: 16, backgroundColor: palette.lavender, alignItems: 'center', justifyContent: 'center' },
});
