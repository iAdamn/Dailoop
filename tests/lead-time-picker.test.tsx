import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LeadTimePicker } from '../src/ui/LeadTimePicker';

function Picker({ selected = [], changed = jest.fn(), closed = jest.fn() }: { selected?: number[]; changed?: (value: number) => void; closed?: () => void }) {
  const [visible, setVisible] = useState(true);
  return <LeadTimePicker visible={visible} onClose={() => { setVisible(false); closed(); }} onSelect={changed} selectedMinutes={selected} />;
}

test('custom anticipation combines graphical days, hours and exact minutes before confirmation', async () => {
  const changed = jest.fn(), closed = jest.fn();
  await render(<Picker changed={changed} closed={closed} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Anticipación de 0 minutos' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar días' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar horas' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar minutos' }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir aviso personalizado' }));
  expect(changed).toHaveBeenCalledWith(1501);
  expect(closed).toHaveBeenCalledTimes(1);
});

test('cancel does not add an alert', async () => {
  const changed = jest.fn(), closed = jest.fn();
  await render(<Picker changed={changed} closed={closed} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar minutos' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
  expect(changed).not.toHaveBeenCalled();
  expect(closed).toHaveBeenCalledTimes(1);
});

test('existing offsets and full alert limit cannot be confirmed', async () => {
  const changed = jest.fn();
  const first = await render(<Picker selected={[15]} changed={changed} />);
  expect(screen.getByRole('button', { name: 'Añadir aviso personalizado' })).toBeDisabled();
  expect(screen.getByText('Este aviso ya está añadido.')).toBeTruthy();
  await first.unmount();
  await render(<Picker selected={Array.from({ length: 16 }, (_, index) => index)} changed={changed} />);
  expect(screen.getByRole('button', { name: 'Añadir aviso personalizado' })).toBeDisabled();
  expect(screen.getByText('Puedes añadir hasta 16 avisos.')).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
});

test('duration remains bounded at one year and zero without typing', async () => {
  const changed = jest.fn();
  await render(<Picker changed={changed} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Anticipación de 365 días' }));
  expect(screen.getByRole('button', { name: 'Aumentar minutos' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Aumentar horas' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Aumentar días' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Anticipación de 0 minutos' }));
  expect(screen.getByRole('button', { name: 'Disminuir minutos' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir aviso personalizado' }));
  expect(changed).toHaveBeenCalledWith(0);
});

test('each new opening resets an unconfirmed draft', async () => {
  const onSelect = jest.fn(), onClose = jest.fn();
  const view = await render(<LeadTimePicker visible onClose={onClose} onSelect={onSelect} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar días' }));
  await view.rerender(<LeadTimePicker visible={false} onClose={onClose} onSelect={onSelect} />);
  await view.rerender(<LeadTimePicker visible onClose={onClose} onSelect={onSelect} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir aviso personalizado' }));
  expect(onSelect).toHaveBeenCalledWith(15);
});

test('minute adjustments carry into the next hour without losing the duration', async () => {
  const changed = jest.fn();
  await render(<Picker changed={changed} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Anticipación de 1 hora' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Disminuir minutos' }));
  expect(screen.getByLabelText('Horas: 0')).toBeTruthy();
  expect(screen.getByLabelText('Minutos: 59')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar minutos' }));
  expect(screen.getByLabelText('Horas: 1')).toBeTruthy();
  expect(screen.getByLabelText('Minutos: 0')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Añadir aviso personalizado' }));
  expect(changed).toHaveBeenCalledWith(60);
});
