import React from 'react';
import { AppState, Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, Chip } from '../src/ui/components';
import { FeedbackProvider } from '../src/ui/FeedbackProvider';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer } from 'expo-audio';

const mockPlayer = { volume: 1, isLoaded: true, play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), remove: jest.fn() };
const mockTick = { volume: 1, isLoaded: true, play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), remove: jest.fn() };
jest.mock('../src/ui/feedbackSounds', () => ({ feedbackSounds: { action: { source: 1, volume: 0.24 }, selection: { source: 2, volume: 0.14 } } }));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(source => source === 2 ? mockTick : mockPlayer), setAudioModeAsync: jest.fn(async () => undefined) }));
jest.mock('expo-haptics', () => ({
  AndroidHaptics: { Virtual_Key: 'virtual-key', Segment_Frequent_Tick: 'segment-frequent-tick' },
  ImpactFeedbackStyle: { Light: 'light', Soft: 'soft' },
  performAndroidHapticsAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined),
}));

let now = 0;
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
beforeEach(() => {
  jest.clearAllMocks(); now = 0;
  jest.replaceProperty(Platform, 'OS', 'android');
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  mockPlayer.seekTo.mockResolvedValue(undefined);
  mockTick.seekTo.mockResolvedValue(undefined);
  jest.mocked(Haptics.performAndroidHapticsAsync).mockResolvedValue(undefined);
});
afterEach(() => { jest.restoreAllMocks(); Object.defineProperty(AppState, 'currentState', originalAppState); });

test('a selection pairs a gentle Android haptic with the quieter glass tick', async () => {
  const choose = jest.fn();
  await render(<FeedbackProvider><Chip onPress={choose}>Semana</Chip></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('checkbox'));
  expect(choose).toHaveBeenCalledTimes(1);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('segment-frequent-tick');
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  expect(mockTick.seekTo).toHaveBeenCalledWith(0);
  expect(mockTick.play).toHaveBeenCalledTimes(1);
  expect(mockTick.volume).toBeLessThan(mockPlayer.volume);
  expect(mockPlayer.play).not.toHaveBeenCalled();
});

test('a primary action plays one quiet clink; busy and disabled buttons stay silent', async () => {
  const save = jest.fn();
  const view = await render(<FeedbackProvider><Button onPress={save}>Guardar</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  expect(save).toHaveBeenCalledTimes(1);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('virtual-key');
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(mockPlayer.volume).toBe(0.24);
  expect(mockTick.play).not.toHaveBeenCalled();
  now = 200;
  await view.rerender(<FeedbackProvider><Button busy onPress={save}>Guardar</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  await view.rerender(<FeedbackProvider><Button disabled onPress={save}>Guardar</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  expect(save).toHaveBeenCalledTimes(1);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(1);
});

test('device feedback failure does not cancel or delay the action', async () => {
  jest.mocked(Haptics.performAndroidHapticsAsync).mockRejectedValue(new Error('No motor'));
  mockPlayer.seekTo.mockRejectedValue(new Error('Audio unavailable'));
  const action = jest.fn();
  await render(<FeedbackProvider><Button onPress={action}>Crear actividad</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  expect(action).toHaveBeenCalledTimes(1);
  expect(mockPlayer.play).not.toHaveBeenCalled();
});

test('rapid feedback is limited without suppressing actual button actions', async () => {
  const action = jest.fn();
  await render(<FeedbackProvider><Button onPress={action}>Acción</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  await fireEvent.press(screen.getByRole('button'));
  expect(action).toHaveBeenCalledTimes(2);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(1);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

test('an important action keeps its sound when styled as a secondary button', async () => {
  await render(<FeedbackProvider><Button secondary feedback="action" onPress={jest.fn()}>Nueva actividad</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('virtual-key');
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

test('opening another screen uses the soft tick even on a primary styled button', async () => {
  const open = jest.fn();
  await render(<FeedbackProvider><Button feedback="selection" onPress={open}>Generar reporte</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  expect(open).toHaveBeenCalledTimes(1);
  expect(mockTick.play).toHaveBeenCalledTimes(1);
  expect(mockPlayer.play).not.toHaveBeenCalled();
});

test('audio initialization failure leaves the action and haptics available', async () => {
  jest.mocked(createAudioPlayer).mockImplementationOnce(() => { throw new Error('Audio unavailable'); });
  const action = jest.fn();
  await render(<FeedbackProvider><Button onPress={action}>Guardar</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  expect(action).toHaveBeenCalledTimes(1);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('virtual-key');
  expect(mockPlayer.play).not.toHaveBeenCalled();
});
