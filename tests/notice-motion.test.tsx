import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AnimatedNotice } from '../src/ui/AnimatedNotice';

let mockReduced = false;
let mockExits: (() => void)[] = [];
jest.mock('../src/ui/motion', () => ({ useMotionDisabled: () => mockReduced }));
// Native timing is intentionally not claimed here. Hold completion callbacks to
// verify the observable lifecycle/race independently of the animation duration.
jest.mock('react-native-reanimated', () => {
  // Hoisted Jest factories must load collaborators inside the factory.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useRef } = require('react');
  return {
  __esModule: true,
  default: { View },
  useSharedValue(initial: number) {
    const ref = useRef(null) as React.MutableRefObject<{ value: number; get(): number; set(value: number): void } | null>;
    if (!ref.current) ref.current = { value: initial, get() { return this.value; }, set(value) { this.value = value; } };
    return ref.current;
  },
  useAnimatedStyle: (callback: () => object) => callback(),
  withTiming: (value: number, _options: object, complete?: (done: boolean) => void) => {
    if (complete) mockExits.push(() => complete(true));
    return value;
  },
  withSequence: (...values: number[]) => values.at(-1),
  Easing: { out: (value: unknown) => value, in: (value: unknown) => value, inOut: (value: unknown) => value, cubic: () => undefined, quad: () => undefined },
  cancelAnimation: () => undefined,
  runOnJS: (callback: () => void) => callback,
  };
});

beforeEach(() => { mockReduced = false; mockExits = []; });

test('an initially absent notice does not emit an exit', async () => {
  const exited = jest.fn();
  await render(<AnimatedNotice visible={false} token={0} onExited={exited}><Text>Nunca visible</Text></AnimatedNotice>);
  expect(screen.queryByText('Nunca visible', { includeHiddenElements: true })).toBeNull();
  expect(mockExits).toHaveLength(0);
  expect(exited).not.toHaveBeenCalled();
});

test('notice actions remain immediate and its last content stays mounted during exit', async () => {
  const action = jest.fn(), exited = jest.fn();
  const result = await render(<AnimatedNotice visible token={1} onExited={exited}><Text>Guardado</Text><Pressable accessibilityRole="button" accessibilityLabel="Deshacer" onPress={action}><Text>Deshacer</Text></Pressable></AnimatedNotice>);
  await fireEvent.press(screen.getByRole('button', { name: 'Deshacer' }));
  expect(action).toHaveBeenCalledTimes(1);
  await result.rerender(<AnimatedNotice visible={false} token={1} onExited={exited}><Text>Vacío</Text></AnimatedNotice>);
  expect(screen.getByText('Guardado', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
  expect(exited).not.toHaveBeenCalled();
  await act(async () => { mockExits[0](); });
  expect(screen.queryByText('Guardado', { includeHiddenElements: true })).toBeNull();
  expect(exited).toHaveBeenCalledTimes(1);
});

test('an old exit cannot dismiss a newer notice even if its completion arrives late', async () => {
  const exited = jest.fn();
  const result = await render(<AnimatedNotice visible token={1} onExited={exited}><Text>Primero</Text></AnimatedNotice>);
  await result.rerender(<AnimatedNotice visible={false} token={1} onExited={exited}><Text /></AnimatedNotice>);
  const oldCompletion = mockExits[0];
  await result.rerender(<AnimatedNotice visible token={2} onExited={exited}><Text>Segundo</Text></AnimatedNotice>);
  await act(async () => { oldCompletion(); });
  expect(screen.getByText('Segundo')).toBeTruthy();
  expect(exited).not.toHaveBeenCalled();
});

test('reduced motion dismisses immediately without waiting for a visual effect', async () => {
  mockReduced = true;
  const exited = jest.fn();
  const result = await render(<AnimatedNotice visible token={1} onExited={exited}><Text>Guardado</Text></AnimatedNotice>);
  await result.rerender(<AnimatedNotice visible={false} token={1} onExited={exited}><Text /></AnimatedNotice>);
  expect(screen.queryByText('Guardado', { includeHiddenElements: true })).toBeNull();
  expect(exited).toHaveBeenCalledTimes(1);
  expect(mockExits).toHaveLength(0);
});

test('unmount invalidates an outstanding exit completion', async () => {
  const exited = jest.fn();
  const result = await render(<AnimatedNotice visible token={1} onExited={exited}><Text>Guardado</Text></AnimatedNotice>);
  await result.rerender(<AnimatedNotice visible={false} token={1} onExited={exited}><Text /></AnimatedNotice>);
  await result.unmount();
  await act(async () => { mockExits[0](); });
  expect(exited).not.toHaveBeenCalled();
});
