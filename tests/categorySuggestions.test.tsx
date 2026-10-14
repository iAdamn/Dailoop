import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { CurrentActivity } from '../src/domain';
import { ActivityForm } from '../src/ui/forms';
import { categorySuggestions, groupActivitiesByCategory } from '../src/ui/categories';

function activity(id: string, category: string | null, isArchived = false): CurrentActivity {
  return { id, name: id, emoji: '✨', color: '#DCCFFF', category, isArchived, isPrivate: false,
    createdAtMs: 0, sortOrder: 0, revisionId: `${id}-revision`, revisionNo: 1 };
}

const activities = [activity('a', 'Café y descanso'), activity('b', 'Salud'),
  activity('c', 'café y descanso'), activity('d', 'Lectura', true), activity('e', null)];

test('suggestions reuse stored spelling, search accents flexibly and include archived categories', () => {
  expect(categorySuggestions(activities, ' CAFE ')).toEqual(['Café y descanso']);
  expect(categorySuggestions(activities, 'lect')).toEqual(['Lectura']);
  expect(categorySuggestions(activities, 'desconocida')).toEqual([]);
  expect(categorySuggestions(activities, '')).toEqual(['Café y descanso', 'Lectura', 'Salud']);
});

test('folder grouping preserves exact category identity, activity order and uncategorized activities', () => {
  const groups = groupActivitiesByCategory(activities);
  expect(groups.map(group => group.category)).toEqual(['Café y descanso', 'café y descanso', 'Lectura', 'Salud', null]);
  expect(groups.find(group => group.category === 'Café y descanso')?.activities.map(item => item.id)).toEqual(['a']);
  expect(groups.find(group => group.category === 'café y descanso')?.activities.map(item => item.id)).toEqual(['c']);
  expect(groups.at(-1)?.activities.map(item => item.id)).toEqual(['e']);
  expect(groupActivitiesByCategory([])).toEqual([]);
});

test('focusing and typing reveals existing categories; selection preserves the draft and awaits saving', async () => {
  let finish!: () => void;
  const submit = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const close = jest.fn();
  await render(<ActivityForm activities={activities} submit={submit} onClose={close} />);
  const field = screen.getByLabelText('Categoría (opcional)');
  expect(screen.queryByRole('button', { name: 'Usar categoría Salud' })).toBeNull();
  await fireEvent(field, 'focus');
  expect(screen.getByRole('button', { name: 'Usar categoría Salud' })).toBeTruthy();
  await fireEvent.changeText(field, 'cafe');
  expect(screen.queryByRole('button', { name: 'Usar categoría Salud' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Usar categoría Café y descanso' })).toHaveLength(1);
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Mi pausa');
  // Moving focus to a suggestion must not remove it before its activation.
  await fireEvent(field, 'blur');
  await fireEvent.press(screen.getByRole('button', { name: 'Usar categoría Café y descanso' }));
  expect(screen.getByLabelText('Categoría (opcional)')).toHaveDisplayValue('Café y descanso');
  expect(screen.getByLabelText('Nombre de la actividad')).toHaveDisplayValue('Mi pausa');
  expect(screen.queryByRole('button', { name: 'Usar categoría Café y descanso' })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: 'createActivity', category: 'Café y descanso', name: 'Mi pausa' }), 'activity-form-new');
  expect(close).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  expect(close).toHaveBeenCalledTimes(1);
});

test('suggestions do not restrict free typing or alter categories in other activities', async () => {
  const submit = jest.fn(async () => undefined);
  await render(<ActivityForm activities={activities} submit={submit} onClose={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Un paseo');
  await fireEvent.changeText(screen.getByLabelText('Categoría (opcional)'), '  Al aire libre  ');
  expect(screen.queryByText('Categorías existentes')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ category: 'Al aire libre' }), 'activity-form-new');
  expect(activities[0].category).toBe('Café y descanso');
});
