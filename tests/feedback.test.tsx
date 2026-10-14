import React from 'react';
import { AppState, Platform, Pressable, Text, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Button, Chip } from '../src/ui/components';
import { FeedbackProvider } from '../src/ui/FeedbackProvider';
import { useInteractionFeedback, type FeedbackKind } from '../src/ui/feedback';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const mockPlayer = { volume: 1, isLoaded: true, currentStatus: { isLoaded: true, playbackState: 'ready' }, play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), remove: jest.fn() };
const mockTick = { volume: 1, isLoaded: true, currentStatus: { isLoaded: true, playbackState: 'ready' }, play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), remove: jest.fn() };
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
  for (const sound of [mockPlayer, mockTick]) {
    sound.isLoaded = true;
    sound.currentStatus = { isLoaded: true, playbackState: 'ready' };
  }
  jest.mocked(Haptics.performAndroidHapticsAsync).mockResolvedValue(undefined);
});
afterEach(() => { jest.restoreAllMocks(); Object.defineProperty(AppState, 'currentState', originalAppState); });

function FeedbackControl({ kind, boundary = false, repeats = 1 }: { kind: FeedbackKind; boundary?: boolean; repeats?: number }) {
  const respond = useInteractionFeedback();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${kind}-${boundary ? 'boundary' : 'normal'}`}
    onPress={() => { for (let i = 0; i < repeats; i += 1) respond(kind, { boundary }); }}><Text>Feedback</Text></Pressable>;
}

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

test('Android glass cues use media volume independently of the ringtone silent/vibrate switch', async () => {
  await render(<FeedbackProvider><Button onPress={jest.fn()}>Registrar</Button></FeedbackProvider>);
  // Expo Audio 57 Android rejects play() in silent/vibrate mode when this is false.
  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
    playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers',
  }));
});

test('iOS retains its existing silent-switch behavior', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await render(<FeedbackProvider><Button onPress={jest.fn()}>Registrar</Button></FeedbackProvider>);
  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false }));
});

test.each(['action', 'selection'] as const)('a completed Android %s sound can play again', async kind => {
  const action = jest.fn();
  const sound = kind === 'action' ? mockPlayer : mockTick;
  await render(<FeedbackProvider><Button feedback={kind} onPress={action}>Continuar</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  expect(sound.play).toHaveBeenCalledTimes(1);
  // These values match AudioModule.isLoaded and AudioPlayer.currentStatus at STATE_ENDED.
  sound.isLoaded = false;
  sound.currentStatus = { isLoaded: true, playbackState: 'ended' };
  now = 700;
  await fireEvent.press(screen.getByRole('button'));
  expect(action).toHaveBeenCalledTimes(2);
  expect(sound.seekTo).toHaveBeenCalledTimes(2);
  expect(sound.play).toHaveBeenCalledTimes(2);
});

test('a cue still loading does not delay the button action or haptic', async () => {
  mockPlayer.isLoaded = false;
  mockPlayer.currentStatus = { isLoaded: false, playbackState: 'buffering' };
  const action = jest.fn();
  await render(<FeedbackProvider><Button onPress={action}>Registrar</Button></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button'));
  expect(action).toHaveBeenCalledTimes(1);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('virtual-key');
  expect(mockPlayer.play).not.toHaveBeenCalled();
});

test('every coalesced drag boundary ticks without throttling the next normal action', async () => {
  await render(<FeedbackProvider><FeedbackControl kind="selection" boundary repeats={3} /><FeedbackControl kind="action" /></FeedbackProvider>);
  const cross = screen.getByRole('button', { name: 'selection-boundary' });
  await fireEvent.press(cross);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(3);
  expect(mockTick.seekTo).toHaveBeenCalledTimes(3);
  // Haptics preserve every boundary; superseded async seeks never queue late audio.
  expect(mockTick.play).toHaveBeenCalledTimes(1);
  const normal = screen.getByRole('button', { name: 'action-normal' });
  await fireEvent.press(normal);
  await fireEvent.press(normal);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(4);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

test('drag boundaries bypass a preceding tap throttle without resetting it', async () => {
  await render(<FeedbackProvider><FeedbackControl kind="selection" boundary /><FeedbackControl kind="action" /></FeedbackProvider>);
  const normal = screen.getByRole('button', { name: 'action-normal' });
  await fireEvent.press(normal);
  await fireEvent.press(screen.getByRole('button', { name: 'selection-boundary' }));
  await fireEvent.press(screen.getByRole('button', { name: 'selection-boundary' }));
  await fireEvent.press(normal);
  expect(mockTick.play).toHaveBeenCalledTimes(2);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(3);
});

test('a delayed old seek cannot play over the newer interaction cue', async () => {
  let resolveOld!: () => void;
  mockPlayer.seekTo.mockImplementationOnce(() => new Promise<void>(resolve => { resolveOld = resolve; }));
  await render(<FeedbackProvider><FeedbackControl kind="action" /><FeedbackControl kind="selection" /></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'action-normal' }));
  now = 100;
  await fireEvent.press(screen.getByRole('button', { name: 'selection-normal' }));
  expect(mockTick.play).toHaveBeenCalledTimes(1);
  await act(async () => { resolveOld(); });
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(2);
});

test('backgrounding invalidates an in-flight cue even after returning to the app', async () => {
  let resolveOld!: () => void;
  let onState: (state: AppStateStatus) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    onState = listener;
    return { remove: jest.fn() };
  });
  mockPlayer.seekTo.mockImplementationOnce(() => new Promise<void>(resolve => { resolveOld = resolve; }));
  await render(<FeedbackProvider><FeedbackControl kind="action" /></FeedbackProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'action-normal' }));
  AppState.currentState = 'background';
  await act(async () => { onState('background'); });
  AppState.currentState = 'active';
  await act(async () => { onState('active'); resolveOld(); });
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(mockPlayer.pause).toHaveBeenCalled();
});
