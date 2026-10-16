import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, PanResponder, Platform, Pressable, Text } from 'react-native';
import type { CurrentActivity } from '../src/domain/types';
import { cleanActivityLayout, defaultSensoryPreferences, parsePresentationPreferences, presentationPreferences, sensoryPreferences, type ActivityLayout } from '../src/infrastructure/preferences';
import { ActivityOrganizer } from '../src/ui/ActivityOrganizer';
import { orderActivities, moveActivity, togglePinned } from '../src/ui/activityOrder';
import { SensorySettings } from '../src/ui/SensorySettings';
import { FeedbackProvider } from '../src/ui/FeedbackProvider';
import { useInteractionFeedback } from '../src/ui/feedback';
import * as Haptics from 'expo-haptics';
import { LanguageProvider } from '../src/i18n/react';
import { SyncStatusPill, syncStatusLabel } from '../src/ui/SyncStatusPill';
import type { CloudSyncView } from '../src/sync/types';
import DailoopUI, { type DailoopUIProps } from '../src/ui/DailoopUI';
import { buildReport, execute, selectActivities } from '../src/domain';
import { createV015State, V015_NOW } from './fixtures/v015';

const mockDispatch = jest.fn();
let mockStored: string | null = null;
const mockWrite = jest.fn(async (_query: string, json: string) => { mockStored = json; });
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => ({ getFirstAsync: async (query: string) => query.includes('PRAGMA') ? { user_version: 1 } : mockStored ? { json: mockStored } : null, withTransactionAsync: async (work: () => Promise<void>) => work(), execAsync: async () => undefined, runAsync: mockWrite })) }));
const mockNativePlayer = { volume: 1, currentStatus: { isLoaded: true }, play: jest.fn(), pause: jest.fn(), remove: jest.fn(), seekTo: jest.fn(async () => undefined) };
jest.mock('../src/ui/feedbackSounds', () => ({ feedbackSounds: { action: { source: 1, volume: 0.24 }, selection: { source: 2, volume: 0.14 } } }));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(() => mockNativePlayer), setAudioModeAsync: jest.fn(async () => undefined) }));
jest.mock('expo-haptics', () => ({ AndroidHaptics: { Virtual_Key: 'key', Segment_Frequent_Tick: 'tick' }, ImpactFeedbackStyle: { Light: 'light', Soft: 'soft' }, performAndroidHapticsAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined) }));
jest.mock('../src/ui/feedbackDriver', () => ({ useFeedbackDriver: () => mockDispatch }));
const { useFeedbackDriver: useNativeFeedbackDriver } = jest.requireActual<typeof import('../src/ui/feedbackDriver.native')>('../src/ui/feedbackDriver.native');
jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan, failOffsetY: () => pan, onStart: () => pan, onUpdate: () => pan, onEnd: () => pan, onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const activities: CurrentActivity[] = [1, 2, 3].map(n => ({ id: id(n), createdAtMs: n, revisionId: id(n + 3), revisionNo: 1, name: `Activity ${n}`, emoji: '✨', color: '#6F5BFF', isPrivate: n === 3, isArchived: false, sortOrder: n, category: n === 2 ? 'Group' : null }));
const layout = { order: activities.map(item => item.id), pinned: [] as string[] };

const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
afterEach(() => { jest.restoreAllMocks(); Object.defineProperty(AppState, 'currentState', originalAppState); mockDispatch.mockReset(); });

test('old preferences retain identical shape while new sensory flags parse strict booleans', () => {
  expect(parsePresentationPreferences('{"activityColumns":2}')).toEqual({ activityColumns: 2, homeListMode: 'activities' });
  expect(sensoryPreferences({})).toEqual(defaultSensoryPreferences);
  expect(parsePresentationPreferences('{"sensory":{"sounds":false,"haptics":"false","navigationSounds":false}}').sensory).toEqual({ ...defaultSensoryPreferences, sounds: false, navigationSounds: false });
  expect(cleanActivityLayout({ order: [id(1), id(1), 'invalid', '__proto__'], pinned: [id(2)] })).toEqual({ order: [id(1)], pinned: [id(2)] });
  const input = Object.fromEntries(Array.from({ length: 10 }, (_, n) => [id(n), layout]));
  expect(Object.keys(parsePresentationPreferences(JSON.stringify({ activityLayouts: input })).activityLayouts!)).toHaveLength(8);
  const large = Array.from({ length: 1001 }, (_, n) => id(n + 100));
  expect(cleanActivityLayout({ order: large }).order).toHaveLength(1001);
});

test('queued sensory and dataset layout changes persist without overwriting each other or existing settings', async () => {
  mockStored = '{"activityColumns":3,"homeListMode":"categories","language":"pt"}';
  await presentationPreferences.load();
  await Promise.all([presentationPreferences.setSensory({ sounds: false }), presentationPreferences.setSensory({ haptics: false }), presentationPreferences.setActivityLayout(id(99), { order: [id(3), id(1)], pinned: [id(3)] })]);
  const saved = parsePresentationPreferences(mockStored);
  expect(saved).toMatchObject({ activityColumns: 3, homeListMode: 'categories', language: 'pt', sensory: { sounds: false, haptics: false }, activityLayouts: { [id(99)]: { order: [id(3), id(1)], pinned: [id(3)] } } });
  const before = mockStored;
  mockWrite.mockRejectedValueOnce(new Error('full'));
  await expect(presentationPreferences.setSensory({ sounds: true })).rejects.toThrow('full');
  expect(mockStored).toBe(before); expect(presentationPreferences.current()).toEqual(saved);
  await expect(presentationPreferences.setActivityLayout('__proto__', layout)).rejects.toThrow('Identificador');
});

test('pin/order preserves activity identity, input data, categories, filters and unknown layout IDs', () => {
  const saved = JSON.stringify(activities), configured = { order: [id(3), id(2), id(1), id(90)], pinned: [id(1)] };
  expect(orderActivities(activities, configured).map(item => item.id)).toEqual([id(1), id(3), id(2)]);
  expect(orderActivities(activities.filter(item => item.category), configured)).toEqual([activities[1]]);
  const moved = moveActivity(activities, configured, id(2), 1);
  expect(orderActivities(activities, moved).map(item => item.id)).toEqual([id(1), id(2), id(3)]);
  expect(moved.order).toContain(id(90));
  expect(moveActivity(activities, moved, id(2), -50).order.slice(0, 2)).toEqual([id(1), id(2)]);
  expect(togglePinned(togglePinned(configured, id(2)), id(2))).toEqual(configured);
  expect(JSON.stringify(activities)).toBe(saved);
  expect(orderActivities(activities, moved)[1]).toBe(activities[1]);
});

test('organizer uses a draft; accessible movement/pins save together only after confirmation', async () => {
  const save = jest.fn(async (_layout: ActivityLayout) => undefined), close = jest.fn();
  await render(<ActivityOrganizer activities={activities} layout={layout} onChange={save} onClose={close} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Subir Activity 3' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Fijar Activity 2' }));
  expect(save).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar organización' }));
  expect(save).toHaveBeenCalledTimes(1);
  const selected = save.mock.calls[0][0];
  expect(selected.pinned).toEqual([id(2)]);
  expect(orderActivities(activities, selected).map(item => item.id)).toEqual([id(2), id(1), id(3)]);
});

test('dragging a handle changes actual order and retains the stable responder across rerenders', async () => {
  const configurations: Parameters<typeof PanResponder.create>[0][] = [];
  jest.spyOn(PanResponder, 'create').mockImplementation(configuration => { configurations.push(configuration); return { panHandlers: {} }; });
  const save = jest.fn(async (_value: unknown) => undefined);
  await render(<ActivityOrganizer activities={activities} layout={layout} onChange={save} onClose={() => undefined} />);
  const first = configurations[0];
  await act(() => { first.onPanResponderGrant?.({} as never, {} as never); });
  await act(() => { first.onPanResponderMove?.({} as never, { dy: 300 } as never); });
  await act(() => { first.onPanResponderRelease?.({} as never, {} as never); });
  expect(configurations).toHaveLength(3);
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar organización' }));
  expect((save.mock.calls[0][0] as typeof layout).order.slice(0, 3)).toEqual([id(2), id(3), id(1)]);
});

test('cancelling an interrupted drag restores the previous organization', async () => {
  const configurations: Parameters<typeof PanResponder.create>[0][] = [];
  jest.spyOn(PanResponder, 'create').mockImplementation(configuration => { configurations.push(configuration); return { panHandlers: {} }; });
  const save = jest.fn(async (_value: unknown) => undefined);
  await render(<ActivityOrganizer activities={activities} layout={layout} onChange={save} onClose={() => undefined} />);
  await act(() => { configurations[0].onPanResponderGrant?.({} as never, {} as never); });
  await act(() => { configurations[0].onPanResponderMove?.({} as never, { dy: 300 } as never); });
  await act(() => { configurations[0].onPanResponderTerminate?.({} as never, {} as never); });
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar organización' }));
  expect(save).toHaveBeenCalledWith(layout);
});

test('failed organizer save keeps the draft open and does not claim success', async () => {
  const close = jest.fn(), save = jest.fn(async () => { throw new Error('disk'); });
  await render(<ActivityOrganizer activities={activities} layout={layout} onChange={save} onClose={close} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar organización' }));
  expect(screen.getByText('No se pudo guardar el orden. Inténtalo de nuevo.')).toBeTruthy(); expect(close).not.toHaveBeenCalled();
});

function Cue() { const feedback = useInteractionFeedback(); return <><Pressable accessibilityRole="button" accessibilityLabel="navigate" onPress={() => feedback('selection', { boundary: true })}><Text>navigate</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="save" onPress={() => feedback('action')}><Text>save</Text></Pressable></>; }
test('independent channel flags gate sound/haptics without suppressing interaction dispatch', async () => {
  const view = await render(<FeedbackProvider preferences={{ ...defaultSensoryPreferences, haptics: false, navigationSounds: false }}><Cue /></FeedbackProvider>);
  expect(mockDispatch).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'navigate' }));
  expect(mockDispatch).toHaveBeenLastCalledWith('selection', { haptics: false, sound: false });
  await fireEvent.press(screen.getByRole('button', { name: 'save' }));
  expect(mockDispatch).toHaveBeenLastCalledWith('action', { haptics: false, sound: true });
  await view.rerender(<FeedbackProvider preferences={{ ...defaultSensoryPreferences, sounds: false }}><Cue /></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'navigate' }));
  expect(mockDispatch).toHaveBeenLastCalledWith('selection', { haptics: true, sound: false });
});

function NativeCue({ vibration, sound }: { vibration: boolean; sound: boolean }) { const dispatch = useNativeFeedbackDriver(); return <Pressable accessibilityRole="button" accessibilityLabel="native cue" onPress={() => dispatch('action', { haptics: vibration, sound })}><Text>Native cue</Text></Pressable>; }
test('native sound and vibration gates suppress the actual hardware APIs independently', async () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.replaceProperty(Platform, 'OS', 'ios');
  const panel = await render(<NativeCue vibration={false} sound />);
  await fireEvent.press(screen.getByRole('button', { name: 'native cue' }));
  expect(Haptics.impactAsync).not.toHaveBeenCalled(); expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  expect(mockNativePlayer.play).toHaveBeenCalledTimes(1);
  await panel.rerender(<NativeCue vibration sound={false} />);
  await fireEvent.press(screen.getByRole('button', { name: 'native cue' }));
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1); expect(mockNativePlayer.play).toHaveBeenCalledTimes(1);
  expect(mockNativePlayer.pause).toHaveBeenCalled();
});

test('sensory controls expose notification sound independently and failures remain visible', async () => {
  const change = jest.fn(async (_value: unknown) => undefined);
  const view = await render(<SensorySettings preferences={{ activityColumns: 1, homeListMode: 'activities', sensory: { ...defaultSensoryPreferences, sounds: false } }} onChange={change} />);
  expect(screen.getByRole('switch', { name: 'Sonidos al navegar' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('switch', { name: 'Sonido de los avisos' }));
  expect(change).toHaveBeenCalledWith({ notificationSounds: false });
  change.mockRejectedValueOnce(new Error('disk'));
  await fireEvent.press(screen.getByRole('switch', { name: 'Vibración háptica' }));
  expect(screen.getByText('No se pudo guardar esta preferencia. Inténtalo de nuevo.')).toBeTruthy();
  await view.rerender(<SensorySettings preferences={{ activityColumns: 1, homeListMode: 'activities' }} onChange={change} disabled />);
  await fireEvent.press(screen.getByRole('switch', { name: 'Sonido de los avisos' })); expect(change).toHaveBeenCalledTimes(2);
});

test('English and Portuguese translate presentation controls while activity names remain inert', async () => {
  const selected = [{ ...activities[0], name: 'Sonido y vibración' }], change = jest.fn(async () => undefined);
  const view = await render(<LanguageProvider language="en" onLanguageChange={change}><SensorySettings preferences={{ activityColumns: 1, homeListMode: 'activities' }} onChange={change} /><ActivityOrganizer activities={selected} layout={layout} onChange={change} onClose={() => undefined} /></LanguageProvider>);
  expect(screen.getByText('Sound and vibration')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Pin Sonido y vibración' })).toBeTruthy();
  await view.rerender(<LanguageProvider language="pt" onLanguageChange={change}><SensorySettings preferences={{ activityColumns: 1, homeListMode: 'activities' }} onChange={change} /><ActivityOrganizer activities={selected} layout={layout} onChange={change} onClose={() => undefined} /></LanguageProvider>);
  expect(screen.getByText('Som e vibração')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Fixar Sonido y vibración' })).toBeTruthy();
});

test('header status never claims a successful sync before one completes and opens account settings', async () => {
  const view: CloudSyncView = { configured: true, account: { uid: 'qa', email: '', displayName: '' }, status: 'idle', enabled: true, lastSyncedAt: null, pending: false, error: null, conflict: null, boundToOtherAccount: false, readOnly: false, demo: false };
  expect(syncStatusLabel(view)).toBe('Sincronización activa'); expect(syncStatusLabel({ ...view, lastSyncedAt: 1 })).toBe('Sincronizado');
  expect(syncStatusLabel({ ...view, pending: true })).toBe('Pendiente'); expect(syncStatusLabel({ ...view, pending: true, status: 'offline' })).toBe('Sin conexión');
  expect(syncStatusLabel({ ...view, status: 'conflict' })).toBe('Revisar cambios'); expect(syncStatusLabel({ ...view, enabled: false })).toBe('En pausa');
  expect(syncStatusLabel({ ...view, account: null })).toBe('En tu dispositivo');
  const open = jest.fn();
  await render(<LanguageProvider language="en" onLanguageChange={async () => undefined}><SyncStatusPill view={{ ...view, pending: true }} onPress={open} /></LanguageProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Sync status: Pending' })); expect(open).toHaveBeenCalledTimes(1);
});

function integratedProps(): DailoopUIProps {
  const state = createV015State(10, 2); let counter = 100;
  const nextId = () => id(counter++);
  return { state, nowMs: V015_NOW, mode: 'personal', storageLabel: 'QA', busy: false, error: null, activityColumns: 2, onActivityColumns: async () => undefined, onClearError: () => undefined,
    onPlanning: async () => undefined, onCompleteReminder: async () => undefined, notificationStatus: 'unsupported', onEnableNotifications: async () => undefined,
    onCommand: async command => execute(state, command, { nowMs: V015_NOW, operationId: nextId(), nextId }), onReport: async options => buildReport(state, options), onSaveReport: async () => '', onCopyReport: async () => '', onShareReport: async () => '', onExportBackup: async () => '', onInspectBackup: async () => null, onRestoreBackup: async () => undefined, onMode: async () => undefined };
}
test('integrated home organizes through preferences and exposes pin marks without writing audited commands', async () => {
  const props = integratedProps(), ordered = selectActivities(props.state), save = jest.fn(async (_value: ActivityLayout) => undefined), command = jest.fn(props.onCommand);
  await render(<DailoopUI {...props} activityLayout={{ order: ordered.map(item => item.id), pinned: [ordered[1].id] }} onActivityLayout={save} onCommand={command} />);
  expect(screen.getByLabelText('Actividad fijada')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Organizar actividades' }));
  await fireEvent.press(screen.getByRole('button', { name: `Fijar ${ordered[0].name}` }));
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar organización' }));
  expect(save).toHaveBeenCalledTimes(1); expect(save.mock.calls[0][0].pinned).toContain(ordered[0].id); expect(command).not.toHaveBeenCalled();
});

test('integrated statistics mounts calendar only on request and opens the existing entry detail', async () => {
  const props = integratedProps();
  await render(<DailoopUI {...props} route={{ tab: 'stats' }} />);
  expect(screen.queryByTestId('activity-calendar')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver calendario' }));
  expect(screen.getByTestId('activity-calendar')).toBeTruthy();
  const entries = props.state.entryRevisions.filter(row => row.state === 'active');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: props.state.settings.zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(entries[0].occurredAtMs);
  await fireEvent.press(screen.getByTestId(`activity-calendar-day-${date}`));
  const activity = selectActivities(props.state).find(item => item.id === props.state.entries.find(row => row.id === entries[0].entryId)!.activityId)!;
  await fireEvent.press(screen.getAllByRole('button', { name: new RegExp(activity.name + ' ·') })[0]);
  expect(screen.getByRole('button', { name: 'Corregir registro' })).toBeTruthy();
});
