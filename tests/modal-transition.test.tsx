import React, { useState } from 'react';
import { AccessibilityInfo, Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Button, ModalFrame } from '../src/ui/components';
import { MotionProvider, useMotionDisabled } from '../src/ui/motion';

let mockExits: (() => void)[] = [];
jest.mock('react-native-reanimated', () => {
  // Hoisted Jest factories must load collaborators inside the factory.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Easing } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useRef } = require('react');
  return {
    __esModule: true, default: { View }, Easing,
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
    withSpring: (value: number) => value,
    cancelAnimation: () => undefined,
    runOnJS: (callback: () => void) => callback,
  };
});

function Launcher({ onClose, onTransition, dirty = false }: { onClose(): void; onTransition(): void; dirty?: boolean }) {
  const reduced = useMotionDisabled();
  const [open, setOpen] = useState(false);
  return <>
    <Text>{reduced ? 'Movimiento reducido' : 'Movimiento activo'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir" onPress={() => setOpen(true)}><Text>Abrir</Text></Pressable>
    {open && <ModalFrame title="Administrar" onClose={onClose} canClose={!dirty}>
      {({ closeWith }) => <Button onPress={() => closeWith(onTransition)}>Completar</Button>}
    </ModalFrame>}
  </>;
}

beforeEach(() => {
  mockExits = [];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

async function open(onClose: () => void, onTransition: () => void, dirty = false) {
  const result = await render(<MotionProvider><Launcher onClose={onClose} onTransition={onTransition} dirty={dirty} /></MotionProvider>);
  await screen.findByText('Movimiento activo');
  await fireEvent.press(screen.getByRole('button', { name: 'Abrir' }));
  return result;
}

test('normal close preserves the dialog until exit completion and closes once', async () => {
  const closed = jest.fn();
  await open(closed, jest.fn());
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  expect(screen.getByText('Administrar', { includeHiddenElements: true })).toBeTruthy();
  expect(closed).not.toHaveBeenCalled();
  await act(async () => { mockExits[0](); mockExits[0](); });
  expect(closed).toHaveBeenCalledTimes(1);
});

test('a confirmed transition bypasses dirty-close handling and blocks duplicate submission', async () => {
  const requestedClose = jest.fn(), transition = jest.fn();
  await open(requestedClose, transition, true);
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  expect(requestedClose).toHaveBeenCalledTimes(1);
  expect(mockExits).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Completar' }));
  expect(screen.getByRole('button', { name: 'Completar' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Completar' }));
  expect(mockExits).toHaveLength(1);
  expect(transition).not.toHaveBeenCalled();
  await act(async () => { mockExits[0](); });
  expect(transition).toHaveBeenCalledTimes(1);
  expect(requestedClose).toHaveBeenCalledTimes(1);
});

test('enabling reduced motion finishes the selected transition without a stale second close', async () => {
  const listener = jest.spyOn(AccessibilityInfo, 'addEventListener');
  listener.mockClear();
  const closed = jest.fn(), transition = jest.fn();
  await open(closed, transition);
  const changed = listener.mock.calls.find(call => String(call[0]) === 'reduceMotionChanged')![1] as unknown as (enabled: boolean) => void;
  await fireEvent.press(screen.getByRole('button', { name: 'Completar' }));
  await act(async () => { changed(true); });
  expect(transition).toHaveBeenCalledTimes(1);
  expect(closed).not.toHaveBeenCalled();
  await act(async () => { mockExits[0](); });
  expect(transition).toHaveBeenCalledTimes(1);
});

test('unmount cancels a queued dialog transition', async () => {
  const transition = jest.fn();
  const result = await open(jest.fn(), transition);
  await fireEvent.press(screen.getByRole('button', { name: 'Completar' }));
  await result.unmount();
  await act(async () => { mockExits[0](); });
  expect(transition).not.toHaveBeenCalled();
});
