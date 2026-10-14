import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { applyPlanning, createEmptyState, execute, getPlanning, selectActivities, type DomainState, type PlanningCommand } from '../src/domain';
import { ReminderForm, RemindersScreen, type RemindersScreenProps } from '../src/ui/reminders';

jest.mock('expo-crypto', () => {
  let serial = 0;
  return { randomUUID: () => `55900000-0000-4000-9000-${String(++serial).padStart(12, '0')}` };
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
const nextId = () => `55000000-0000-4000-9000-${String(++serial).padStart(12, '0')}`;
function fixture(zone = 'America/Bogota', nowMs = NOW) {
  let state = createEmptyState({ databaseId: nextId(), nowMs: nowMs - 60_000, zone });
  state = execute(state, { type: 'createActivity', name: 'Café', emoji: '☕', color: '#DCCFFF' }, {
    nowMs: nowMs - 60_000, operationId: nextId(), nextId,
  }).state;
  return state;
}
function addReminder(state: DomainState) {
  const command: PlanningCommand = { type: 'createReminder', id: nextId(), completionEntryId: nextId(),
    activityId: state.activities[0].id, dueAtMs: NOW + 3_600_000, leadMinutes: [60, 0], notifications: true };
  return { ...state, planning: applyPlanning(state, command, { nowMs: NOW, operationId: nextId(), nextId }) };
}
function formProps(state = fixture()) {
  return { activities: selectActivities(state), zone: state.settings.zone, nowMs: NOW,
    onClose: jest.fn(), onSave: jest.fn<Promise<void>, [PlanningCommand, string?]>(async () => undefined),
    notificationStatus: 'denied', onEnableNotifications: jest.fn(async () => undefined) };
}
// Calendar selection itself is exercised in calendar tests; here its public callback
// lets reminder validation cover past dates and DST independently of month navigation.
async function selectDate(value: string) {
  await fireEvent(screen.getByLabelText('Fecha del recordatorio'), 'change', value);
}
function screenProps(state: DomainState): RemindersScreenProps {
  return { state, nowMs: NOW, notificationStatus: 'denied', onEnableNotifications: jest.fn(async () => undefined),
    onSave: jest.fn(async () => undefined), onComplete: jest.fn(async () => undefined) };
}

test('new reminder links an existing activity ID and saves several distinct lead times even with notification permission denied', async () => {
  const props = formProps();
  await render(<ReminderForm {...props} />);
  expect(props.onSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Café' }));
  await selectDate('2026-10-15');
  await fireEvent.changeText(screen.getByLabelText('Hora del recordatorio (HH:mm, 24 horas)'), '09:30');
  await fireEvent.press(screen.getByRole('switch', { name: 'Avisos de este recordatorio' }));
  for (const label of ['1 día antes', '3 horas antes', '1 hora antes', '30 min antes']) {
    await fireEvent.press(screen.getByRole('checkbox', { name: label }));
  }
  await fireEvent.changeText(screen.getByLabelText('Anticipación personalizada'), '15');
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir aviso' }));
  await fireEvent.changeText(screen.getByLabelText('Anticipación personalizada'), '30');
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir aviso' }));
  expect(screen.getByText('! Este aviso ya está seleccionado.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(props.onSave).toHaveBeenCalledTimes(1);
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
    type: 'createReminder', activityId: props.activities[0].id,
    dueAtMs: Date.parse('2026-10-15T14:30:00Z'), notifications: true,
    leadMinutes: [1440, 180, 60, 30, 15, 0],
    id: expect.any(String), completionEntryId: expect.any(String),
  }), expect.any(String));
  const command = props.onSave.mock.calls[0][0];
  expect(command.type).toBe('createReminder');
  expect(props.onEnableNotifications).not.toHaveBeenCalled();
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('saving awaits persistence, keeps the draft after rejection and reuses operation and entity IDs for a retry', async () => {
  let reject!: (error: Error) => void;
  const props = formProps();
  props.onSave.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  await render(<ReminderForm {...props} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Café' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await act(async () => { reject(new Error('Disco ocupado')); });
  expect(screen.getByText('! Disco ocupado')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Elegir actividad Café' })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(props.onSave).toHaveBeenCalledTimes(2);
  expect(props.onSave.mock.calls[1]).toEqual(props.onSave.mock.calls[0]);
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('a dirty reminder requires explicit discard and never saves when closing', async () => {
  const props = formProps();
  await render(<ReminderForm {...props} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Café' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  expect(screen.getByText('Hay cambios sin guardar')).toBeTruthy();
  expect(props.onClose).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Seguir editando' }));
  expect(screen.getByRole('checkbox', { name: 'Elegir actividad Café' })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Descartar cambios' }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.onSave).not.toHaveBeenCalled();
});

test('past and nonexistent local times are rejected and a repeated DST hour requires an explicit occurrence', async () => {
  const nowMs = Date.parse('2026-10-31T16:00:00Z');
  const props = { ...formProps(fixture('America/New_York', nowMs)), nowMs };
  await render(<ReminderForm {...props} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Café' }));
  await selectDate('2026-10-30');
  expect(screen.getByText('! Elige una fecha y hora futura para el recordatorio.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Crear recordatorio' })).toBeDisabled();
  await selectDate('2027-03-14');
  await fireEvent.changeText(screen.getByLabelText('Hora del recordatorio (HH:mm, 24 horas)'), '02:30');
  expect(screen.getByText('! Esta hora no existe en la zona elegida por un cambio de horario.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Crear recordatorio' })).toBeDisabled();
  await selectDate('2026-11-01');
  await fireEvent.changeText(screen.getByLabelText('Hora del recordatorio (HH:mm, 24 horas)'), '01:30');
  expect(screen.getByText('Esta hora ocurre dos veces')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Crear recordatorio' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('checkbox', { name: '2026-11-01 01:30:00 -05:00' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ dueAtMs: Date.parse('2026-11-01T06:30:00Z') }), expect.any(String));
});

test('the reminder list keeps completion explicit and then moves a real confirmed entry to completed', async () => {
  const state = addReminder(fixture());
  const props = screenProps(state);
  const view = await render(<RemindersScreen {...props} />);
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(props.onSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Completar recordatorio de Café' }));
  const reminder = getPlanning(state).reminders[0];
  expect(props.onComplete).toHaveBeenCalledWith(reminder.id);
  const confirmed = execute(state, { type: 'createEntry', id: reminder.completionEntryId, activityId: reminder.activityId }, {
    nowMs: NOW, operationId: nextId(), nextId,
  }).state;
  await view.rerender(<RemindersScreen {...props} state={confirmed} />);
  expect(screen.queryByRole('button', { name: 'Completar recordatorio de Café' })).toBeNull();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Recordatorios completados' }));
  expect(screen.getByText('✓ Completado · registrado en la actividad')).toBeTruthy();
});

test('archiving asks first, reports a failed write and retries with the same operation', async () => {
  const props = screenProps(addReminder(fixture()));
  const save = jest.fn<Promise<void>, [PlanningCommand, string?]>().mockRejectedValueOnce(new Error('No se pudo escribir')).mockResolvedValue(undefined);
  props.onSave = save;
  await render(<RemindersScreen {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Archivar recordatorio de Café' }));
  expect(save).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Archivar recordatorio' }));
  expect(screen.getByText('! No se pudo escribir')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Archivar recordatorio' }));
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  expect(save).toHaveBeenCalledWith({ type: 'archiveReminder', reminderId: getPlanning(props.state).reminders[0].id, archived: true }, expect.any(String));
  expect(props.onComplete).not.toHaveBeenCalled();
});

test('streak alerts are opt-in with an editable local time and invalid hours cannot be saved', async () => {
  const props = screenProps(fixture());
  const save = jest.fn<Promise<void>, [PlanningCommand, string?]>(async () => undefined);
  props.onSave = save;
  await render(<RemindersScreen {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Configurar avisos de racha' }));
  expect(screen.getByRole('switch', { name: 'Recordarme mantener las rachas' })).not.toBeChecked();
  expect(screen.getByLabelText('Hora del aviso de racha (HH:mm, 24 horas)')).toHaveDisplayValue('22:00');
  await fireEvent.press(screen.getByRole('switch', { name: 'Recordarme mantener las rachas' }));
  await fireEvent.changeText(screen.getByLabelText('Hora del aviso de racha (HH:mm, 24 horas)'), '24:01');
  expect(screen.getByRole('button', { name: 'Guardar avisos de racha' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Hora del aviso de racha (HH:mm, 24 horas)'), '21:30');
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar avisos de racha' }));
  expect(save).toHaveBeenCalledWith({ type: 'setStreakAlerts', enabled: true, hour: 21, minute: 30 }, expect.any(String));
});

test('custom hours become minutes and can be removed without changing other selected times', async () => {
  const props = formProps();
  await render(<ReminderForm {...props} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Café' }));
  await fireEvent.press(screen.getByRole('switch', { name: 'Avisos de este recordatorio' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Horas' }));
  await fireEvent.changeText(screen.getByLabelText('Anticipación personalizada'), '2');
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir aviso' }));
  expect(screen.getByRole('checkbox', { name: 'Quitar aviso 2 horas antes' })).toBeChecked();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Quitar aviso 2 horas antes' }));
  expect(screen.queryByRole('checkbox', { name: 'Quitar aviso 2 horas antes' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Anticipación personalizada'), '2');
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir aviso' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ leadMinutes: [120, 0] }), expect.any(String));
});

test('read-only reminder views allow consultation but cannot create, complete, edit or archive', async () => {
  const props = screenProps(addReminder(fixture()));
  await render(<RemindersScreen {...props} readOnly />);
  for (const name of ['+ Nuevo recordatorio', 'Completar recordatorio de Café', 'Editar recordatorio de Café', 'Archivar recordatorio de Café']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.onComplete).not.toHaveBeenCalled();
});
