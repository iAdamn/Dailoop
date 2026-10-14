import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CalendarField } from '../src/ui/CalendarField';
import { EntryForm } from '../src/ui/forms';
import { PeriodControls } from '../src/ui/reports';
import { periodFor, selectActivities } from '../src/domain';
import { createV015State } from './fixtures/v015';

function Calendar({ value = '2024-02-20', minDate, maxDate, changed = jest.fn() }: { value?: string; minDate?: string; maxDate?: string; changed?: (date: string) => void }) {
  const [date, setDate] = useState(value);
  return <CalendarField label="Fecha de prueba" value={date} minDate={minDate} maxDate={maxDate} onChange={next => { setDate(next); changed(next); }} />;
}

test('calendar chooses a leap day and only commits after confirmation', async () => {
  const changed = jest.fn();
  await render(<Calendar changed={changed} />);
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha de prueba' }));
  await fireEvent.press(screen.getByTestId('calendar-day-2024-02-29'));
  expect(changed).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta fecha' }));
  expect(changed).toHaveBeenCalledWith('2024-02-29');
  expect(screen.queryByText('Elegir fecha')).toBeNull();
  expect(screen.getByText('29 de febrero de 2024')).toBeTruthy();
});

test('cancel discards the draft and reopens the original date', async () => {
  const changed = jest.fn();
  await render(<Calendar changed={changed} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha de prueba' }));
  await fireEvent.press(screen.getByTestId('calendar-day-2024-02-25'));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
  expect(changed).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha de prueba' }));
  expect(screen.getByRole('button', { name: '20 de febrero de 2024', selected: true })).toBeTruthy();
});

test('calendar enforces allowed date bounds without changing the selected date', async () => {
  const changed = jest.fn();
  await render(<Calendar minDate="2024-02-10" maxDate="2024-02-25" changed={changed} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha de prueba' }));
  expect(screen.getByTestId('calendar-day-2024-02-09')).toBeDisabled();
  expect(screen.getByTestId('calendar-day-2024-02-26')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
  await fireEvent.press(screen.getByTestId('calendar-day-2024-02-26'));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta fecha' }));
  expect(changed).toHaveBeenCalledWith('2024-02-20');
});

test('month and year selection reaches a distant date without typing and February stays valid', async () => {
  await render(<Calendar value="2024-01-31" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha de prueba' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir año' }));
  await fireEvent.press(screen.getByRole('button', { name: '12 años anteriores' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Año 2012' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir mes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'febrero' }));
  expect(screen.queryByTestId('calendar-day-2012-02-30')).toBeNull();
  expect(screen.getByTestId('calendar-day-2012-02-29')).toBeTruthy();
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
});

test('century boundaries obey Gregorian leap years and years below 100 preserve their value', async () => {
  const result = await render(<Calendar value="1900-02-20" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha de prueba' }));
  expect(screen.queryByTestId('calendar-day-1900-02-29')).toBeNull();
  await result.unmount();
  await render(<Calendar value="0096-02-20" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha de prueba' }));
  expect(screen.getByTestId('calendar-day-0096-02-29')).toBeTruthy();
});

test('entry calendar keeps a repeated local hour explicit and submits the chosen instant', async () => {
  const submit = jest.fn(async () => undefined);
  const activity = selectActivities(createV015State(10, 0))[0];
  await render(<EntryForm activity={activity} nowMs={Date.parse('2026-11-02T15:00:00Z')} zone="America/New_York" onClose={jest.fn()} submit={submit} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha' }));
  await fireEvent.press(screen.getByTestId('calendar-day-2026-11-01'));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta fecha' }));
  await fireEvent.changeText(screen.getByLabelText('Hora (HH:mm, 24 horas)'), '01:30');
  expect(screen.getByText('Esta hora ocurre dos veces')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Revisar antes de guardar' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('checkbox', { name: '2026-11-01 01:30:00 -05:00' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Revisar antes de guardar' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar registro' }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: 'createEntry', occurredAtMs: Date.parse('2026-11-01T06:30:00Z'), occurredZone: 'America/New_York' }), expect.any(String));
});

test('entry calendar leaves nonexistent daylight-saving times invalid and blocks tomorrow', async () => {
  const activity = selectActivities(createV015State(10, 0))[0];
  await render(<EntryForm activity={activity} nowMs={Date.parse('2026-03-09T15:00:00Z')} zone="America/New_York" onClose={jest.fn()} submit={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fecha' }));
  expect(screen.getByTestId('calendar-day-2026-03-10')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('calendar-day-2026-03-08'));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta fecha' }));
  await fireEvent.changeText(screen.getByLabelText('Hora (HH:mm, 24 horas)'), '02:30');
  expect(screen.getByText('! Esta hora no existe en la zona elegida por un cambio de horario.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Revisar antes de guardar' })).toBeDisabled();
});

test('shared period controls choose an inclusive range through calendars and retain the grouping zone', async () => {
  const nowMs = Date.parse('2026-10-14T02:00:00Z'); // Still October 13 in Bogotá.
  const changed = jest.fn();
  await render(<PeriodControls period={periodFor('day', '2026-10-13', 'America/Bogota', nowMs)} nowMs={nowMs} onChange={changed} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Elegir fechas' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Desde' }));
  expect(screen.getByTestId('calendar-day-2026-10-14')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('calendar-day-2026-10-10'));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta fecha' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Hasta, incluido' }));
  expect(screen.getByTestId('calendar-day-2026-10-09')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('calendar-day-2026-10-12'));
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta fecha' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Aplicar fechas' }));
  expect(changed).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-10-10', to: '2026-10-12', zone: 'America/Bogota' }));
});
