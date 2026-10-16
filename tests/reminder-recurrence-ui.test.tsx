import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { applyPlanning, createEmptyState, execute, getPlanning, selectActivities, type PlanningCommand } from '../src/domain';
import { ReminderForm, RemindersScreen } from '../src/ui/reminders';

jest.mock('expo-crypto', () => {
  let serial = 0;
  return { randomUUID: () => `55d00000-0000-4000-9000-${String(++serial).padStart(12, '0')}` };
});
jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan, failOffsetY: () => pan,
    onStart: () => pan, onUpdate: () => pan, onEnd: () => pan, onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});

const NOW = Date.parse('2026-10-14T17:00:00Z'); // Wednesday, noon in Bogotá.
let serial = 0;
const nextId = () => `55d10000-0000-4000-9000-${String(++serial).padStart(12, '0')}`;
function props() {
  const initial = createEmptyState({ databaseId: nextId(), nowMs: NOW - 60000, zone: 'America/Bogota' });
  const state = execute(initial, { type: 'createActivity', name: 'Leer', emoji: '📖', color: '#DCCFFF' }, { nowMs: NOW - 60000, nextId, operationId: nextId() }).state;
  return { state, activities: selectActivities(state), nowMs: NOW, zone: state.settings.zone, onSave: jest.fn<Promise<void>, [PlanningCommand, string?]>(async () => undefined), onClose: jest.fn(), notificationStatus: 'unsupported', onEnableNotifications: jest.fn(async () => undefined) };
}
async function selectTime(value: string) {
  const [hour, minute] = value.split(':');
  await fireEvent.press(screen.getByRole('button', { name: 'Hora del recordatorio' }));
  await fireEvent.press(screen.getByRole('button', { name: `Hora ${hour}` }));
  await fireEvent.press(screen.getByRole('button', { name: `Minuto ${minute}` }));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta hora' }));
}

test('weekday selection requires at least one day and starts on the next selected Monday', async () => {
  const value = props();
  await render(<ReminderForm {...value} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Leer' }));
  await selectTime('09:30');
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir días' }));
  expect(screen.getByRole('button', { name: 'Crear recordatorio' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Repetir los lunes' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Repetir los martes' }));
  expect(screen.getByRole('button', { name: 'Crear recordatorio' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(value.onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'createReminder', dueAtMs: Date.parse('2026-10-19T14:30:00Z'), recurrence: { weekdays: [1, 2], hour: 9, minute: 30, zone: 'America/Bogota' } }), expect.any(String));
});

test('daily selection includes every weekday and a return to once removes the recurrence', async () => {
  const value = props();
  const first = await render(<ReminderForm {...value} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Leer' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Todos los días' }));
  await selectTime('21:17');
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(value.onSave).toHaveBeenCalledWith(expect.objectContaining({ dueAtMs: Date.parse('2026-10-15T02:17:00Z'), recurrence: { weekdays: [1, 2, 3, 4, 5, 6, 7], hour: 21, minute: 17, zone: 'America/Bogota' } }), expect.any(String));
  await first.unmount();
  value.onSave.mockClear();
  await render(<ReminderForm {...value} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Leer' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Todos los días' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Una vez' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(value.onSave.mock.calls[0][0]).not.toHaveProperty('recurrence');
});

test('cancelling both graphic popups preserves the parent time, selected weekdays and alerts', async () => {
  const value = props();
  await render(<ReminderForm {...value} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir actividad Leer' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir días' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Repetir los jueves' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Hora del recordatorio' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Hora 23' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Minuto 59' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByRole('button', { name: 'Hora del recordatorio' })).toHaveAccessibilityValue({ text: '13:00' });
  await fireEvent.press(screen.getByRole('switch', { name: 'Avisos de este recordatorio' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir anticipación personalizada' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar días' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByRole('checkbox', { name: 'Repetir los jueves' })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(value.onSave).toHaveBeenCalledWith(expect.objectContaining({ leadMinutes: [0], recurrence: { weekdays: [4], hour: 13, minute: 0, zone: 'America/Bogota' } }), expect.any(String));
});

test('completing a recurring card sends the exact visible occurrence to persistence', async () => {
  const value = props();
  const command: PlanningCommand = { type: 'createReminder', id: nextId(), completionEntryId: nextId(), activityId: value.activities[0].id, dueAtMs: NOW + 3600000, leadMinutes: [0], notifications: false, recurrence: { weekdays: [1, 2, 3, 4, 5, 6, 7], hour: 13, minute: 0, zone: 'America/Bogota' } };
  const state = { ...value.state, planning: applyPlanning(value.state, command, { nowMs: NOW, nextId, operationId: nextId() }) };
  const complete = jest.fn(async () => undefined);
  await render(<RemindersScreen {...value} state={state} onComplete={complete} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Completar recordatorio de Leer' }));
  expect(complete).toHaveBeenCalledWith(getPlanning(state).reminders[0].id, NOW + 3600000);
});
