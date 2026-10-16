import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';
import DailoopUI, { type DailoopUIProps } from '../src/ui/DailoopUI';
import { buildReport, execute, selectActivities } from '../src/domain';
import { defaultSensoryPreferences } from '../src/infrastructure/preferences';
import { createV015State, V015_NOW } from './fixtures/v015';
import type { CloudSyncView } from '../src/sync/types';
import { requestWidgetPin } from '../src/infrastructure/widgets';

jest.mock('react-native-gesture-handler', () => {
  const gesture = { enabled: () => gesture, maxPointers: () => gesture, activeOffsetX: () => gesture, failOffsetY: () => gesture, onStart: () => gesture, onUpdate: () => gesture, onEnd: () => gesture, onFinalize: () => gesture, maxDistance: () => gesture };
  return { Gesture: { Pan: () => gesture, Tap: () => gesture, Exclusive: () => gesture }, PointerType: { KEY: 3 }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../src/infrastructure/widgets', () => ({ requestWidgetPin: jest.fn(async () => true) }));
function props(): DailoopUIProps {
  const state = createV015State(10, 2); let sequence = 1;
  const nextId = () => `72000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
  return { state, nowMs: V015_NOW, mode: 'personal', storageLabel: 'QA', busy: false, error: null, activityColumns: 2, onActivityColumns: async () => undefined, onClearError: () => undefined, onPlanning: async () => undefined, onCompleteReminder: async () => undefined, notificationStatus: 'unsupported', onEnableNotifications: async () => undefined, onCommand: async command => execute(state, command, { nowMs: V015_NOW, operationId: nextId(), nextId }), onReport: async options => buildReport(state, options), onSaveReport: async () => '', onCopyReport: async () => '', onShareReport: async () => '', onExportBackup: async () => '', onInspectBackup: async () => null, onRestoreBackup: async () => undefined, onMode: async () => undefined };
}
function cloud(view: Partial<CloudSyncView> = {}): NonNullable<DailoopUIProps['cloudSync']> {
  return { view: { configured: true, account: { uid: 'qa', email: '', displayName: 'QA' }, status: 'idle', enabled: true, lastSyncedAt: null, pending: true, error: null, conflict: null, boundToOtherAccount: false, readOnly: false, demo: false, ...view }, actions: { signIn: async () => undefined, enable: async () => undefined, pause: async () => undefined, synchronize: async () => undefined, signOut: async () => undefined, resolve: async () => undefined, exportConflict: async () => undefined } };
}
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

test('header status follows pending/offline/conflict without changing records and routes to Settings', async () => {
  const input = props(), navigate = jest.fn(), command = jest.fn(input.onCommand);
  const panel = await render(<DailoopUI {...input} cloudSync={cloud()} onNavigate={navigate} onCommand={command} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Estado de sincronización: Pendiente' }));
  expect(navigate).toHaveBeenCalledWith({ tab: 'settings' }); expect(command).not.toHaveBeenCalled();
  await panel.rerender(<DailoopUI {...input} cloudSync={cloud({ status: 'offline' })} />);
  expect(screen.getByRole('button', { name: 'Estado de sincronización: Sin conexión' })).toBeTruthy();
  await panel.rerender(<DailoopUI {...input} cloudSync={cloud({ status: 'conflict' })} />);
  expect(screen.getByRole('button', { name: 'Estado de sincronización: Revisar cambios' })).toBeTruthy();
});

test('retained calendar removes its Android back handler while another tab is active', async () => {
  const registered = new Set<Parameters<typeof BackHandler.addEventListener>[1]>();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => { registered.add(listener); return { remove: () => { registered.delete(listener); } }; });
  const input = props();
  const panel = await render(<DailoopUI {...input} route={{ tab: 'stats' }} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Ver calendario' }));
  expect(registered.size).toBe(2);
  await panel.rerender(<DailoopUI {...input} route={{ tab: 'home' }} />);
  expect(registered.size).toBe(1);
  await panel.rerender(<DailoopUI {...input} route={{ tab: 'stats' }} />);
  expect(registered.size).toBe(2);
  const listeners = [...registered];
  await act(() => { listeners[listeners.length - 1]({} as never); });
  expect(screen.queryByTestId('activity-calendar')).toBeNull();
});

test('disabled and read-only presentation cannot open organizer or create audit changes', async () => {
  const input = props(), save = jest.fn(async () => undefined), command = jest.fn(input.onCommand);
  await render(<DailoopUI {...input} readOnly onActivityLayout={save} onCommand={command} />);
  const organize = screen.getByRole('button', { name: 'Organizar actividades' });
  expect(organize.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(organize);
  expect(screen.queryByRole('button', { name: 'Guardar organización' })).toBeNull(); expect(save).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
});

test('organizing and pinning preserve search and folder context when list preferences update', async () => {
  const input = props(), activity = selectActivities(input.state)[2];
  const panel = await render(<DailoopUI {...input} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Buscar actividades' }));
  await fireEvent.changeText(screen.getByLabelText('Buscar en Registro'), activity.name);
  expect(screen.getAllByRole('button', { name: /^Ver detalle de/ })).toHaveLength(1);
  await panel.rerender(<DailoopUI {...input} activityLayout={{ order: [activity.id], pinned: [activity.id] }} />);
  expect(screen.getByLabelText('Buscar en Registro').props.value).toBe(activity.name);
  expect(screen.getAllByRole('button', { name: /^Ver detalle de/ })).toHaveLength(1);
  expect(screen.getByLabelText('Actividad fijada')).toBeTruthy();
});

test('notification sound remains a separately actionable preference with interface sound disabled', async () => {
  const input = props(), change = jest.fn(async () => undefined);
  await render(<DailoopUI {...input} route={{ tab: 'settings' }} presentationPreferences={{ activityColumns: 2, homeListMode: 'activities', sensory: { ...defaultSensoryPreferences, sounds: false } }} onSensory={change} />);
  const notification = screen.getByRole('switch', { name: 'Sonido de los avisos' });
  expect(notification.props.accessibilityState).toMatchObject({ checked: true, disabled: false });
  await fireEvent.press(notification); expect(change).toHaveBeenCalledWith({ notificationSounds: false });
});

test('Android widget request handles unsupported launchers and blocks demo/read-only requests', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(requestWidgetPin).mockResolvedValueOnce(false);
  const input = props(), panel = await render(<DailoopUI {...input} route={{ tab: 'settings' }} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir widget' }));
  expect(requestWidgetPin).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Tu escritorio no permite añadirlo desde aquí/)).toBeTruthy();
  await panel.rerender(<DailoopUI {...input} mode="demo" route={{ tab: 'settings' }} />);
  const blocked = screen.getByRole('button', { name: 'Añadir widget' }); expect(blocked.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(blocked); expect(requestWidgetPin).toHaveBeenCalledTimes(1);
});
