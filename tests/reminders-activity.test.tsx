import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createEmptyState, execute, selectActivities, type Command, type CommandResult, type DomainState } from '../src/domain';
import { ReminderForm, RemindersScreen } from '../src/ui/reminders';

jest.mock('expo-crypto', () => {
  let serial = 0;
  return { randomUUID: () => `559b0000-0000-4000-9000-${String(++serial).padStart(12, '0')}` };
});
jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan,
    failOffsetY: () => pan, onStart: () => pan, onUpdate: () => pan, onEnd: () => pan,
    onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});

const NOW = Date.parse('2026-10-14T17:00:00Z');
let serial = 0;
const nextId = () => `559c0000-0000-4000-9000-${String(++serial).padStart(12, '0')}`;
const empty = () => createEmptyState({ databaseId: nextId(), nowMs: NOW - 60_000, zone: 'America/Bogota' });
function fixture() {
  return execute(empty(), { type: 'createActivity', name: 'Café', emoji: '☕', color: '#DCCFFF' }, {
    nowMs: NOW - 60_000, operationId: nextId(), nextId,
  }).state;
}
function props(state: DomainState = fixture()) {
  const create = jest.fn<Promise<unknown>, [Command, string]>(async command => execute(state, command, {
    nowMs: NOW, operationId: nextId(), nextId,
  }));
  return { state, activities: selectActivities(state), nowMs: NOW, zone: state.settings.zone,
    onClose: jest.fn(), onSave: jest.fn(async () => undefined), onCreateActivity: create,
    notificationStatus: 'unsupported', onEnableNotifications: jest.fn(async () => undefined) };
}
const openActivity = async () => {
  await fireEvent.press(screen.getByRole('button', { name: 'Crear una actividad para este recordatorio' }));
  expect(screen.getByText('Una nueva actividad')).toBeTruthy();
};

test('an empty reminder screen can create its first activity without leaving Recordatorios', async () => {
  const values = props(empty());
  await render(<RemindersScreen {...values} onComplete={async () => undefined} />);
  expect(screen.getByRole('button', { name: '+ Nuevo recordatorio' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: '+ Nuevo recordatorio' }));
  await openActivity();
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Leer');
  await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
  expect(screen.getByText('Nuevo recordatorio')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Elegir actividad Leer' })).toBeChecked();
  expect(values.onCreateActivity).toHaveBeenCalledTimes(1);
  expect(values.onSave).not.toHaveBeenCalled();
});

test('cancelling a nested activity preserves the selected activity, time and notification draft', async () => {
  const values = props();
  await render(<ReminderForm {...values} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Café' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha del recordatorio' }));
  await fireEvent.press(screen.getByTestId('calendar-day-2026-10-15'));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta fecha' }));
  await fireEvent.changeText(screen.getByLabelText('Hora del recordatorio (HH:mm, 24 horas)'), '19:45');
  await fireEvent.press(screen.getByRole('switch', { name: 'Avisos de este recordatorio' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: '3 horas antes' }));
  await openActivity();
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'No guardar');
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Descartar cambios' }));
  expect(screen.getByText('Nuevo recordatorio')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Elegir actividad Café' })).toBeChecked();
  expect(screen.getByText('15 de octubre de 2026')).toBeTruthy();
  expect(screen.getByLabelText('Hora del recordatorio (HH:mm, 24 horas)')).toHaveDisplayValue('19:45');
  expect(screen.getByRole('switch', { name: 'Avisos de este recordatorio' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: '3 horas antes' })).toBeChecked();
  expect(values.onCreateActivity).not.toHaveBeenCalled();
  expect(values.onSave).not.toHaveBeenCalled();
  expect(values.onClose).not.toHaveBeenCalled();
});

test('only a confirmed activity is selected, and the reminder is saved separately with its original draft', async () => {
  const values = props();
  let resolve!: (result: CommandResult) => void;
  values.onCreateActivity.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await render(<ReminderForm {...values} />);
  await fireEvent.changeText(screen.getByLabelText('Hora del recordatorio (HH:mm, 24 horas)'), '21:15');
  await openActivity();
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Leer');
  await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
  expect(screen.getByText('Una nueva actividad')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  expect(values.onSave).not.toHaveBeenCalled();
  const [command, key] = values.onCreateActivity.mock.calls[0];
  expect(command).toMatchObject({ type: 'createActivity', name: 'Leer', id: expect.any(String) });
  const result = execute(values.state, command, { nowMs: NOW, operationId: nextId(), nextId });
  await act(async () => { resolve(result); });
  expect(screen.getByRole('checkbox', { name: 'Elegir actividad Leer' })).toBeChecked();
  expect(screen.getByLabelText('Hora del recordatorio (HH:mm, 24 horas)')).toHaveDisplayValue('21:15');
  expect(key).toBe(`reminder-create-activity-${result.result.activityId}`);
  expect(values.onSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(values.onSave).toHaveBeenCalledTimes(1);
  expect(values.onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'createReminder', activityId: result.result.activityId,
    dueAtMs: Date.parse('2026-10-15T02:15:00Z') }), expect.any(String));
  expect(values.onCreateActivity).toHaveBeenCalledTimes(1);
});

test('a failed activity write keeps its form and retries the same entity and operation key', async () => {
  const values = props();
  values.onCreateActivity.mockRejectedValueOnce(new Error('Disco ocupado'));
  await render(<ReminderForm {...values} />);
  await openActivity();
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Leer');
  await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
  expect(screen.getByText('! Disco ocupado')).toBeTruthy();
  expect(screen.getByLabelText('Nombre de la actividad')).toHaveDisplayValue('Leer');
  expect(screen.queryByText('Nuevo recordatorio')).toBeNull();
  expect(values.onSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
  expect(values.onCreateActivity.mock.calls[1]).toEqual(values.onCreateActivity.mock.calls[0]);
  expect(screen.getByRole('checkbox', { name: 'Elegir actividad Leer' })).toBeChecked();
  expect(values.onSave).not.toHaveBeenCalled();
});

test('read-only mode blocks nested activity creation and leaves persistence untouched', async () => {
  const values = props();
  await render(<ReminderForm {...values} readOnly />);
  const create = screen.getByRole('button', { name: 'Crear una actividad para este recordatorio' });
  expect(create).toBeDisabled();
  await fireEvent.press(create);
  expect(screen.queryByText('Una nueva actividad')).toBeNull();
  expect(values.onCreateActivity).not.toHaveBeenCalled();
  expect(values.onSave).not.toHaveBeenCalled();
});
