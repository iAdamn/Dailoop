import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { execute, createEmptyState, type Command, type DomainState } from '../src/domain';
import { ActivityCalendar, activityCalendarIndex, calendarMonthDays } from '../src/ui/ActivityCalendar';

jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan, failOffsetY: () => pan, onStart: () => pan, onUpdate: () => pan, onEnd: () => pan, onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
const id = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const now = Date.parse('2026-10-16T18:00:00Z');
function fixture() {
  let state = createEmptyState({ databaseId: id(1), nowMs: Date.parse('2026-01-01T00:00:00Z'), zone: 'America/Bogota' }), counter = 10;
  const command = (value: Command) => { state = execute(state, value, { nowMs: now, operationId: id(counter++), nextId: () => id(counter++) }).state; };
  command({ type: 'createActivity', id: id(2), name: 'Read', emoji: '📖', color: '#6F5BFF' });
  command({ type: 'createActivity', id: id(3), name: 'Walk', emoji: '🌱', color: '#8FD8FF' });
  command({ type: 'createEntry', id: id(4), activityId: id(2), occurredAtMs: Date.parse('2026-10-15T02:00:00Z') }); // Bogota Oct14.
  command({ type: 'createEntry', id: id(5), activityId: id(2), occurredAtMs: Date.parse('2026-10-15T13:00:00Z') });
  command({ type: 'createEntry', id: id(6), activityId: id(3), occurredAtMs: Date.parse('2026-10-15T14:00:00Z') });
  command({ type: 'createEntry', id: id(7), activityId: id(3), occurredAtMs: Date.parse('2026-10-15T15:00:00Z') });
  command({ type: 'correctEntry', entryId: id(5), occurredAtMs: Date.parse('2026-10-14T13:00:00Z') });
  command({ type: 'voidEntry', entryId: id(7) });
  return { get state() { return state; }, command };
}

test('calendar counts effective local days, moves corrected records and excludes voided records', () => {
  const input = fixture(), before = JSON.stringify(input.state), index = activityCalendarIndex(input.state);
  expect(index.get('2026-10-14')!.map(entry => entry.id)).toEqual([id(4), id(5)]);
  expect(index.get('2026-10-15')!.map(entry => entry.id)).toEqual([id(6)]);
  expect(activityCalendarIndex(input.state, id(2)).has('2026-10-15')).toBe(false);
  expect(JSON.stringify(input.state)).toBe(before);
  input.command({ type: 'restoreEntry', entryId: id(7) });
  expect(activityCalendarIndex(input.state).get('2026-10-15')).toHaveLength(2);
});

test('Monday calendar handles leap years, leading blanks and years below 100 correctly', () => {
  expect(calendarMonthDays('2024-02').filter(Boolean)).toHaveLength(29);
  expect(calendarMonthDays('2025-02').filter(Boolean)).toHaveLength(28);
  expect(calendarMonthDays('2026-10').slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
  expect(calendarMonthDays('0001-01')[0]).toBe('0001-01-01');
});

test('calendar day opens existing detail callback; empty/future days and activity filters are accessible', async () => {
  const input = fixture(), open = jest.fn();
  await render(<ActivityCalendar state={input.state} nowMs={now} onEntry={open} />);
  await fireEvent.press(screen.getByTestId('activity-calendar-day-2026-10-14'));
  expect(screen.getByText('2 registros en este día')).toBeTruthy();
  await fireEvent.press(screen.getAllByRole('button', { name: /📖 Read ·/ })[0]); expect(open).toHaveBeenCalledWith(id(4));
  expect(screen.getByTestId('activity-calendar-day-2026-10-17').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Filtrar actividades' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: '🌱 Walk' }));
  expect(screen.getByText('0 registros en este día')).toBeTruthy();
  expect(screen.getByText('Sin registros este día. Esto no significa que no hicieras la actividad.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('activity-calendar-day-2026-10-15'));
  expect(screen.getByText('1 registros en este día')).toBeTruthy();
});

test('timezone changes recompute calendar grouping and archived activity remains available', async () => {
  const input = fixture(); input.command({ type: 'updateActivity', activityId: id(2), changes: { isArchived: true } });
  const view = await render(<ActivityCalendar state={input.state} nowMs={now} onEntry={() => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Filtrar actividades' }));
  expect(screen.getByRole('checkbox', { name: '📖 Read · archivada' })).toBeTruthy();
  input.command({ type: 'updateSettings', changes: { zone: 'Asia/Tokyo' } });
  await view.rerender(<ActivityCalendar state={input.state} nowMs={now} onEntry={() => undefined} />);
  await fireEvent.press(screen.getByTestId('activity-calendar-day-2026-10-15'));
  expect(screen.getByText('2 registros en este día')).toBeTruthy();
});

test('empty calendar allows previous months, stops at present month, and preserves clock-regression records', async () => {
  const empty = createEmptyState({ databaseId: id(1), nowMs: now, zone: 'America/Bogota' });
  const view = await render(<ActivityCalendar state={empty} nowMs={now} onEntry={() => undefined} />);
  expect(screen.getByRole('button', { name: 'Mes siguiente' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Mes anterior' }));
  expect(screen.getByTestId('activity-calendar-day-2026-09-01')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Hoy' }));
  const input = fixture();
  await view.rerender(<ActivityCalendar state={input.state as DomainState} nowMs={Date.parse('2026-10-13T18:00:00Z')} onEntry={() => undefined} />);
  const futureRecord = screen.getByTestId('activity-calendar-day-2026-10-14');
  expect(futureRecord.props.accessibilityState.disabled).toBe(false);
  await fireEvent.press(futureRecord);
  expect(screen.getByText('Estos registros están después del reloj actual. Revisa la hora del dispositivo.')).toBeTruthy();
});
