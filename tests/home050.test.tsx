import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import DailoopUI, { type DailoopUIProps } from '../src/ui/DailoopUI';
import { buildReport, execute } from '../src/domain';
import { createV015State, V015_NOW } from './fixtures/v015';

jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan,
    failOffsetY: () => pan, onStart: () => pan, onUpdate: () => pan, onEnd: () => pan,
    onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

function setup() {
  let state = createV015State(10, 0);
  let serial = 1;
  const nextId = () => `50000000-0000-4000-9000-${String(serial++).padStart(12, '0')}`;
  const command = jest.fn(async (command: Parameters<DailoopUIProps['onCommand']>[0]) => {
    const result = execute(state, command, { nowMs: Date.now(), operationId: nextId(), nextId });
    state = result.state;
    return result;
  });
  const props: DailoopUIProps = {
    state, nowMs: V015_NOW, mode: 'personal', storageLabel: 'QA', busy: false, error: null,
    activityColumns: 1, onActivityColumns: async () => undefined, onClearError: () => undefined, onPlanning: async () => undefined, onCompleteReminder: async () => undefined, notificationStatus: 'unsupported', onEnableNotifications: async () => undefined,
    onCommand: command, onReport: async options => buildReport(state, options),
    onSaveReport: async () => '', onCopyReport: async () => '', onShareReport: async () => '',
    onExportBackup: async () => '', onInspectBackup: async () => null,
    onRestoreBackup: async () => undefined, onMode: async () => undefined,
  };
  return { props, command };
}

test('notice can close while Undo is available without changing a confirmed record', async () => {
  const { props, command } = setup();
  await render(<DailoopUI {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Registrar PRIVADA QA 001' }));
  expect(screen.getByRole('button', { name: 'Deshacer registro de PRIVADA QA 001' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar aviso' }));
  expect(screen.queryByText('✓ Registrado: PRIVADA QA 001')).toBeNull();
  expect(command).toHaveBeenCalledTimes(1);
  expect(command.mock.calls[0][0].type).toBe('createEntry');
});

test('each repeat registration resets the notice lifetime to five seconds', async () => {
  jest.useFakeTimers({ now: V015_NOW });
  try {
    const { props, command } = setup();
    await render(<DailoopUI {...props} />);
    const record = () => fireEvent.press(screen.getByRole('button', { name: 'Registrar PRIVADA QA 001' }));
    await record();
    await act(async () => jest.advanceTimersByTime(4_000));
    await record();
    await act(async () => jest.advanceTimersByTime(1_100));
    expect(screen.getByText('✓ Registrado: PRIVADA QA 001')).toBeVisible();
    await act(async () => jest.advanceTimersByTime(3_899));
    expect(screen.getByRole('button', { name: 'Cerrar aviso' })).toBeVisible();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.queryByText('✓ Registrado: PRIVADA QA 001')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deshacer registro de PRIVADA QA 001' })).toBeNull();
    expect(command).toHaveBeenCalledTimes(2);
  } finally { jest.useRealTimers(); }
});

test('compact home opens uncategorized folders and search without writing activity data', async () => {
  const { props, command } = setup();
  await render(<DailoopUI {...props} />);
  expect(screen.queryByLabelText('Buscar en Registro')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver categorías' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Ver actividades sin categoría' }));
  expect(screen.getByRole('button', { name: 'Registrar PRIVADA QA 001' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '‹ Todas las categorías' }));
  expect(screen.getByRole('button', { name: 'Ver actividades sin categoría' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver actividades' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Buscar actividades' }));
  await fireEvent.changeText(screen.getByLabelText('Buscar en Registro'), 'PRIVADA QA 001');
  expect(screen.getByRole('button', { name: 'Registrar PRIVADA QA 001' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Registrar Actividad QA 003' })).toBeNull();
  expect(command).not.toHaveBeenCalled();
});

test('the register ellipsis opens a past-time draft without quick-recording and saves only on confirmation', async () => {
  const { props, command } = setup();
  await render(<DailoopUI {...props} activityColumns={4} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Registrar PRIVADA QA 001 en otra fecha' }));
  expect(command).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Hora (HH:mm, 24 horas)'), '09:30');
  await fireEvent.press(screen.getByRole('button', { name: 'Revisar antes de guardar' }));
  expect(command).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar registro' }));
  expect(command).toHaveBeenCalledTimes(1);
  expect(command.mock.calls[0][0]).toMatchObject({ type: 'createEntry', occurredAtMs: Date.parse('2026-10-12T14:30:00Z'), occurredZone: 'America/Bogota' });
});
