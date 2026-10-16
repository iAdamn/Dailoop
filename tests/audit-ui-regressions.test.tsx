import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ActiveTabModal, TabPanel } from '../src/ui/navigation';
import { ReminderForm, RemindersScreen } from '../src/ui/reminders';
import { ActivityForm, EntryForm } from '../src/ui/forms';
import { applyPlanning, deriveReminders, effectiveEntries, execute, selectActivities } from '../src/domain';
import { createV015State, V015_NOW } from './fixtures/v015';


jest.mock('react-native-gesture-handler', () => {
  const gesture = { enabled: () => gesture, maxPointers: () => gesture, activeOffsetX: () => gesture,
    failOffsetY: () => gesture, onStart: () => gesture, onUpdate: () => gesture, onEnd: () => gesture,
    onFinalize: () => gesture, maxDuration: () => gesture, maxDistance: () => gesture };
  return { Gesture: { Pan: () => gesture, Tap: () => gesture, Exclusive: () => gesture }, PointerType: { KEY: 3 },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('../src/domain', () => {
  const actual = jest.requireActual('../src/domain');
  return { ...actual, deriveReminders: jest.fn(actual.deriveReminders) };
});

const activity = selectActivities(createV015State(10, 0))[0];

test('clock ticks do not turn an untouched entry draft into unsaved changes', async () => {
  const close = jest.fn();
  const props = { activity, zone: 'America/Bogota', submit: jest.fn(async () => undefined), onClose: close };
  const view = await render(<EntryForm {...props} nowMs={V015_NOW} />);
  await view.rerender(<EntryForm {...props} nowMs={V015_NOW + 120_000} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  expect(screen.queryByText('Hay cambios sin guardar')).toBeNull();
  expect(close).toHaveBeenCalledTimes(1);
});

test('correcting only the DST occurrence preserves the chosen instant and requires confirmation', async () => {
  let serial = 1;
  const nextId = () => `34000000-0000-4000-9000-${String(serial++).padStart(12, '0')}`;
  const state = createV015State(10, 0);
  const corrected = execute(state, { type: 'createEntry', activityId: activity.id,
    occurredAtMs: Date.parse('2026-11-01T05:30:00Z'), occurredZone: 'America/New_York' },
    { nowMs: Date.parse('2026-11-02T15:00:00Z'), nextId, operationId: nextId() }).state;
  const entry = effectiveEntries(corrected)[0];
  const submit = jest.fn(async () => undefined);
  await render(<EntryForm activity={activity} entry={entry} nowMs={Date.parse('2026-11-02T15:00:00Z')} zone="America/New_York" submit={submit} onClose={jest.fn()} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: '2026-11-01 01:30:00 -05:00' }));
  expect(screen.getByRole('button', { name: 'Revisar antes de guardar' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Revisar antes de guardar' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirmar corrección' }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: 'correctEntry', occurredAtMs: Date.parse('2026-11-01T06:30:00Z') }), expect.any(String));
});

test('all activity inputs stay locked during persistence, then recover the exact draft after failure', async () => {
  let reject!: (error: Error) => void;
  const submit = jest.fn(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
  await render(<ActivityForm activities={[]} onClose={jest.fn()} submit={submit} />);
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Original');
  await fireEvent.changeText(screen.getByLabelText('Categoría (opcional)'), 'Familia');
  await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
  expect(screen.getByLabelText('Nombre de la actividad')).toBeDisabled();
  expect(screen.getByLabelText('Categoría (opcional)')).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'Amarillo' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Actividad privada' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cambiar emoji, actual ✨' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cerrar diálogo' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Lost edit');
  await act(async () => reject(new Error('falló el guardado')));
  expect(screen.getByLabelText('Nombre de la actividad')).toHaveDisplayValue('Original');
  expect(screen.getByLabelText('Nombre de la actividad')).toBeEnabled();
  expect(screen.getByLabelText('Categoría (opcional)')).toHaveDisplayValue('Familia');
});


test('an edited entry remains dirty when the moving clock catches its chosen time', async () => {
  const close = jest.fn();
  const props = { activity, zone: 'America/Bogota', submit: jest.fn(async () => undefined), onClose: close };
  const view = await render(<EntryForm {...props} nowMs={Date.parse('2026-10-14T17:00:00Z')} />);
  await fireEvent.changeText(screen.getByLabelText('Hora (HH:mm, 24 horas)'), '12:01');
  await view.rerender(<EntryForm {...props} nowMs={Date.parse('2026-10-14T17:01:00Z')} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  expect(screen.getByText('Hay cambios sin guardar')).toBeVisible();
  expect(close).not.toHaveBeenCalled();
});

test('an entry submission freezes its date, time and note until persistence rejects', async () => {
  let reject!: (error: Error) => void;
  const submit = jest.fn(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
  await render(<EntryForm activity={activity} nowMs={V015_NOW} zone="America/Bogota" submit={submit} onClose={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText('Nota (opcional)'), 'Nota original');
  await fireEvent.press(screen.getByRole('button', { name: 'Revisar antes de guardar' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar registro' }));
  expect(screen.getByRole('button', { name: 'Fecha' })).toBeDisabled();
  expect(screen.getByLabelText('Hora (HH:mm, 24 horas)')).toBeDisabled();
  expect(screen.getByLabelText('Nota (opcional)')).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Nota (opcional)'), 'Perdida');
  await act(async () => reject(new Error('Reintentar')));
  expect(screen.getByLabelText('Nota (opcional)')).toHaveDisplayValue('Nota original');
  expect(screen.getByLabelText('Nota (opcional)')).toBeEnabled();
});

test('reminder persistence locks the complete selection and keeps it available after failure', async () => {
  let reject!: (error: Error) => void;
  const save = jest.fn(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
  await render(<ReminderForm activities={[activity]} nowMs={V015_NOW} zone="America/Bogota" onSave={save} onClose={jest.fn()}
    notificationStatus="denied" onEnableNotifications={jest.fn(async () => undefined)} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: `Elegir actividad ${activity.name}` }));
  await fireEvent.press(screen.getByRole('checkbox', { name: /Todos los días/ }));
  await fireEvent.press(screen.getByRole('switch', { name: 'Avisos de este recordatorio' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: '30 min antes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Crear recordatorio' }));
  expect(screen.getByRole('button', { name: 'Fecha de inicio' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Hora del recordatorio' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Una vez' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Avisos de este recordatorio' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: '30 min antes' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Elegir anticipación personalizada' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Revisar permiso de notificaciones' })).toBeDisabled();
  await act(async () => reject(new Error('Reintentar')));
  expect(screen.getByRole('checkbox', { name: /Todos los días/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: '30 min antes' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Hora del recordatorio' })).toBeEnabled();
});

test('streak persistence freezes the switch and local hour and restores editing after failure', async () => {
  let reject!: (error: Error) => void;
  const save = jest.fn(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
  await render(<RemindersScreen state={createV015State(10, 0)} nowMs={V015_NOW} onSave={save} onComplete={jest.fn(async () => undefined)}
    notificationStatus="denied" onEnableNotifications={jest.fn(async () => undefined)} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Configurar avisos de racha' }));
  await fireEvent.press(screen.getByRole('switch', { name: 'Recordarme mantener las rachas' }));
  await fireEvent.changeText(screen.getByLabelText('Hora del aviso de racha (HH:mm, 24 horas)'), '21:37');
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar avisos de racha' }));
  expect(screen.getByRole('switch', { name: 'Recordarme mantener las rachas' })).toBeDisabled();
  expect(screen.getByLabelText('Hora del aviso de racha (HH:mm, 24 horas)')).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Hora del aviso de racha (HH:mm, 24 horas)'), '19:00');
  await act(async () => reject(new Error('Reintentar')));
  expect(screen.getByLabelText('Hora del aviso de racha (HH:mm, 24 horas)')).toHaveDisplayValue('21:37');
  expect(screen.getByRole('switch', { name: 'Recordarme mantener las rachas' })).toBeChecked();
});

test('hidden reminders suspend derivation and keep their edited reminder across an external route change', async () => {
  const state = createV015State(10, 0);
  const derive = jest.mocked(deriveReminders);
  derive.mockClear();
  function Retained({ nowMs }: { nowMs: number }) {
    const [active, setActive] = useState(true);
    return <View><Pressable accessibilityRole="button" accessibilityLabel="Ruta externa" onPress={() => setActive(!active)}><Text>Cambiar</Text></Pressable>
      <TabPanel active={active}><ActiveTabModal><RemindersScreen state={state} nowMs={nowMs} onSave={jest.fn(async () => undefined)} onComplete={jest.fn(async () => undefined)}
        notificationStatus="unsupported" onEnableNotifications={jest.fn(async () => undefined)} /></ActiveTabModal></TabPanel></View>;
  }
  const view = await render(<Retained nowMs={V015_NOW} />);
  await fireEvent.press(screen.getByRole('button', { name: '+ Nuevo recordatorio' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: `Elegir actividad ${activity.name}` }));
  await fireEvent.press(screen.getByRole('checkbox', { name: /Todos los días/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Ruta externa' }));
  const calls = derive.mock.calls.length;
  expect(screen.queryByRole('button', { name: 'Hora del recordatorio', includeHiddenElements: true })).toBeNull();
  await view.rerender(<Retained nowMs={V015_NOW + 15_000} />);
  expect(derive).toHaveBeenCalledTimes(calls);
  await fireEvent.press(screen.getByRole('button', { name: 'Ruta externa' }));
  expect(screen.getByRole('checkbox', { name: /Todos los días/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: `Elegir actividad ${activity.name}` })).toBeChecked();
  expect(derive.mock.calls.length).toBeGreaterThan(calls);
});


test('completed reminders keep the full history but mount only a bounded initial window', async () => {
  let state = createV015State(10, 100);
  let serial = 0;
  const nextId = () => `36000000-0000-4000-9000-${String(++serial).padStart(12, '0')}`;
  for (const entry of state.entries) {
    const dueAtMs = state.entryRevisions.find(revision => revision.entryId === entry.id)!.occurredAtMs;
    const nowMs = state.meta.createdAtMs + 2 * 86_400_000 + serial;
    state = { ...state, planning: applyPlanning(state, { type: 'createReminder', id: nextId(), completionEntryId: entry.id,
      activityId: entry.activityId, dueAtMs, notifications: false, leadMinutes: [] }, { nowMs, nextId, operationId: nextId() }) };
  }
  await render(<RemindersScreen state={state} nowMs={V015_NOW} onSave={jest.fn(async () => undefined)} onComplete={jest.fn(async () => undefined)}
    notificationStatus="unsupported" onEnableNotifications={jest.fn(async () => undefined)} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Recordatorios completados' }));
  expect(deriveReminders(state, V015_NOW).filter(reminder => reminder.status === 'done')).toHaveLength(100);
  const mounted = screen.getAllByText('✓ Completado · registrado en la actividad');
  expect(mounted.length).toBeGreaterThan(0);
  expect(mounted.length).toBeLessThan(100);
});

