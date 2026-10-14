import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActivityForm } from '../src/ui/forms';
import { findEmojis, getEmojiChoices, isSingleEmoji } from '../src/ui/emojiCatalog';
import { activityColors } from '../src/ui/activityColors';
import { COLORS } from '../src/domain';

test('the offline catalog includes Spanish search, flags, families and skin-tone sequences', () => {
  expect(getEmojiChoices().length).toBeGreaterThan(3900);
  expect(findEmojis('cafe', 0).some(item => item.emoji === '☕')).toBe(true);
  expect(findEmojis('Colombia', 0).some(item => item.emoji === '🇨🇴')).toBe(true);
  expect(getEmojiChoices().some(item => item.emoji === '👩🏽‍💻')).toBe(true);
  expect(isSingleEmoji('👨‍👩‍👧‍👦')).toBe(true);
  expect(isSingleEmoji('🇨🇴')).toBe(true);
  expect(isSingleEmoji('1️⃣')).toBe(true);
  expect(isSingleEmoji('A')).toBe(false);
  expect(isSingleEmoji('😀😀')).toBe(false);
  expect(new Set(activityColors.map(item => item.color))).toEqual(new Set(COLORS));
});

test('closing the popup preserves the activity draft without saving or discarding it', async () => {
  const submit = jest.fn(async () => undefined), close = jest.fn();
  await render(<ActivityForm activities={[]} submit={submit} onClose={close} />);
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Mi actividad');
  await fireEvent.press(screen.getByRole('button', { name: 'Cambiar emoji, actual ✨' }));
  expect(screen.getByText('Elige un emoji')).toBeTruthy();
  // The most recently mounted modal is the picker; the first is the activity form.
  await fireEvent.press(screen.getAllByRole('button', { name: 'Cerrar diálogo' }).at(-1)!);
  expect(screen.queryByText('Elige un emoji')).toBeNull();
  expect(screen.getByLabelText('Nombre de la actividad').props.value).toBe('Mi actividad');
  expect(screen.queryByLabelText('Buscar entre los emojis sugeridos')).toBeNull();
  expect(screen.queryByLabelText('Emoji')).toBeNull();
  expect(submit).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});

test('selecting a searched emoji and a new glass color submits the full draft once', async () => {
  const submit = jest.fn(async () => undefined), close = jest.fn();
  await render(<ActivityForm activities={[]} submit={submit} onClose={close} />);
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Un café');
  await fireEvent.changeText(screen.getByLabelText('Categoría (opcional)'), 'Descanso');
  await fireEvent.press(screen.getByRole('radio', { name: 'Amarillo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cambiar emoji, actual ✨' }));
  await fireEvent(screen.getByTestId('emoji-grid'), 'layout', { nativeEvent: { layout: { width: 314, height: 300 } } });
  await fireEvent.changeText(screen.getByLabelText('Buscar emoji'), 'café');
  await fireEvent.press(screen.getByRole('button', { name: /^Elegir ☕,/ }));
  expect(screen.getByRole('button', { name: 'Cambiar emoji, actual ☕' })).toBeTruthy();
  expect(screen.getByLabelText('Categoría (opcional)').props.value).toBe('Descanso');
  await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith({ type: 'createActivity', name: 'Un café', emoji: '☕', color: '#F3E6A2', isPrivate: false, category: 'Descanso' }, 'activity-form-new');
  expect(close).toHaveBeenCalledTimes(1);
});

test('the device keyboard option accepts one complete emoji sequence and rejects plain text', async () => {
  const submit = jest.fn(async () => undefined);
  await render(<ActivityForm activities={[]} submit={submit} onClose={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Cambiar emoji, actual ✨' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Usar mi teclado' }));
  await fireEvent.changeText(screen.getByLabelText('Escribe o pega un emoji'), 'texto');
  expect(screen.getByRole('button', { name: 'Usar este emoji' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Escribe o pega un emoji'), '👨‍👩‍👧‍👦');
  await fireEvent.press(screen.getByRole('button', { name: 'Usar este emoji' }));
  expect(screen.getByRole('button', { name: 'Cambiar emoji, actual 👨‍👩‍👧‍👦' })).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});
