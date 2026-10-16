import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TimeField } from '../src/ui/TimeField';

function Field({ changed, disabled = false }: { changed: (value: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('08:44');
  return <TimeField label="Hora del recordatorio" value={value} disabled={disabled} onChange={next => { setValue(next); changed(next); }} />;
}

test('graphical time selection preserves exact minutes and commits only on confirmation', async () => {
  const changed = jest.fn();
  await render(<Field changed={changed} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Hora del recordatorio' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Hora 23' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Minuto 59' }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir esta hora' }));
  expect(changed).toHaveBeenCalledWith('23:59');
  expect(screen.getByRole('button', { name: 'Hora del recordatorio' })).toHaveAccessibilityValue({ text: '23:59' });
});

test('cancel discards draft time and reopening restores saved value', async () => {
  const changed = jest.fn();
  await render(<Field changed={changed} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Hora del recordatorio' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Hora 00' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Minuto 00' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
  expect(changed).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Hora del recordatorio' }));
  expect(screen.getByRole('button', { name: 'Hora 08', selected: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir minutos, 44' }));
  expect(screen.getByRole('button', { name: 'Minuto 44', selected: true })).toBeTruthy();
});

test('disabled time field cannot open a picker', async () => {
  await render(<Field changed={jest.fn()} disabled />);
  const button = screen.getByRole('button', { name: 'Hora del recordatorio' });
  expect(button).toBeDisabled();
  await fireEvent.press(button);
  expect(screen.queryByText('Elegir hora')).toBeNull();
});

test('every hour and every minute have a named touch target with a minimum height', async () => {
  await render(<Field changed={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Hora del recordatorio' }));
  for (const value of ['00', '08', '12', '23']) {
    expect(screen.getByRole('button', { name: `Hora ${value}` })).toHaveStyle({ minHeight: 46, width: '100%' });
  }
  expect(screen.getAllByRole('button', { name: /^Hora \d{2}$/ })).toHaveLength(24);
  await fireEvent.press(screen.getByRole('button', { name: 'Elegir minutos, 44' }));
  expect(screen.getAllByRole('button', { name: /^Minuto \d{2}$/ })).toHaveLength(60);
  expect(screen.getByRole('button', { name: 'Minuto 59' })).toHaveStyle({ minHeight: 46, width: '100%' });
});
