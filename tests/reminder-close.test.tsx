import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ModalControls } from '../src/ui/components';
import { ReminderForm, RemindersScreen } from '../src/ui/reminders';
import { createV015State, V015_NOW } from './fixtures/v015';
import { applyPlanning, getPlanning, selectActivities, type PlanningCommand } from '../src/domain';

const mockExitActions: (() => void)[] = [];
jest.mock('expo-crypto', () => {
  let serial = 0;
  return { randomUUID: () => `55990000-0000-4000-9000-${String(++serial).padStart(12, '0')}` };
});
jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan, failOffsetY: () => pan,
    onStart: () => pan, onUpdate: () => pan, onEnd: () => pan, onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('../src/ui/components', () => {
  const actual = jest.requireActual('../src/ui/components');
  const ReactModule = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { ...actual, ModalFrame: ({ children, onClose }: { children: React.ReactNode | ((controls: ModalControls) => React.ReactNode); onClose(): void }) => {
    const [isClosing, setClosing] = ReactModule.useState(false);
    const controls: ModalControls = { isClosing, close: onClose, closeWith: action => { setClosing(true); mockExitActions.push(action); } };
    return ReactModule.createElement(View, null,
      ReactModule.createElement(actual.Button, { label: 'Cerrar diálogo', onPress: onClose }, 'Cerrar'),
      typeof children === 'function' ? children(controls) : children);
  } };
});

beforeEach(() => { mockExitActions.length = 0; });

test('reminder save requests exit after confirmed persistence and blocks another save until unmount', async () => {
  let finish!: () => void;
  const save = jest.fn(() => new Promise<void>(resolve => { finish = resolve; })), close = jest.fn();
  const state = createV015State(10, 0);
  await render(<ReminderForm activities={selectActivities(state)} nowMs={V015_NOW} zone={state.settings.zone}
    onClose={close} onSave={save} notificationStatus="denied" onEnableNotifications={async () => undefined} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad PRIVADA QA 001' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(mockExitActions).toHaveLength(0);
  expect(close).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  expect(mockExitActions).toHaveLength(1);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Crear recordatorio' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => { mockExitActions[0](); });
  expect(close).toHaveBeenCalledTimes(1);
});

test('explicit discard goes through the exit transition before removing the reminder form', async () => {
  const state = createV015State(10, 0), close = jest.fn(), save = jest.fn(async () => undefined);
  await render(<ReminderForm activities={selectActivities(state)} nowMs={V015_NOW} zone={state.settings.zone}
    onClose={close} onSave={save} notificationStatus="denied" onEnableNotifications={async () => undefined} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad PRIVADA QA 001' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Descartar cambios' }));
  expect(mockExitActions).toHaveLength(1);
  expect(close).not.toHaveBeenCalled();
  await act(async () => { mockExitActions[0](); });
  expect(close).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});

test('archive confirmation remains mounted and disabled while its successful exit runs', async () => {
  const initial = createV015State(10, 0);
  const command: PlanningCommand = { type: 'createReminder', id: '559a0000-0000-4000-9000-000000000001',
    completionEntryId: '559a0000-0000-4000-9000-000000000002', activityId: initial.activities[0].id,
    dueAtMs: V015_NOW + 3_600_000, leadMinutes: [0], notifications: false };
  const state = { ...initial, planning: applyPlanning(initial, command, { nowMs: V015_NOW, operationId: '559a0000-0000-4000-9000-000000000003', nextId: () => '' }) };
  const save = jest.fn(async () => undefined);
  await render(<RemindersScreen state={state} nowMs={V015_NOW} onSave={save} onComplete={async () => undefined}
    notificationStatus="denied" onEnableNotifications={async () => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Archivar recordatorio de PRIVADA QA 001' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Archivar recordatorio' }));
  expect(save).toHaveBeenCalledWith({ type: 'archiveReminder', reminderId: getPlanning(state).reminders[0].id, archived: true }, expect.any(String));
  expect(screen.getByRole('button', { name: 'Archivar recordatorio' })).toBeDisabled();
  expect(mockExitActions).toHaveLength(1);
  await act(async () => { mockExitActions[0](); });
  expect(screen.queryByRole('button', { name: 'Archivar recordatorio' })).toBeNull();
});
