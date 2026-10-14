import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { SwipeTabBar } from '../src/ui/navigation';

type GestureEvent = { x: number; pointerType: number };
type Handlers = {
  start?: (event: GestureEvent) => void;
  update?: (event: GestureEvent) => void;
  end?: (event: GestureEvent, success: boolean) => void;
  finalize?: (event: GestureEvent, success: boolean) => void;
};
const mockRecognizers: { pan?: Handlers; tap?: Handlers } = {};

// Exercise the recognized gesture's callback contract. Recognition and actual
// UI-thread interpolation are separately checked in the browser and Android.
jest.mock('react-native-gesture-handler', () => {
  const recognizer = (kind: 'pan' | 'tap') => {
    const handlers: Handlers = {};
    mockRecognizers[kind] = handlers;
    const chain = {
      enabled: () => chain, maxPointers: () => chain, activeOffsetX: () => chain,
      failOffsetY: () => chain, maxDistance: () => chain,
      onStart: (callback: Handlers['start']) => { handlers.start = callback; return chain; },
      onUpdate: (callback: Handlers['update']) => { handlers.update = callback; return chain; },
      onEnd: (callback: Handlers['end']) => { handlers.end = callback; return chain; },
      onFinalize: (callback: Handlers['finalize']) => { handlers.finalize = callback; return chain; },
    };
    return chain;
  };
  return { Gesture: { Pan: () => recognizer('pan'), Tap: () => recognizer('tap'), Exclusive: () => ({}) },
    PointerType: { KEY: 3 }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});

function shared<T>(value: T) {
  return { value, get() { return this.value; }, set(next: T) { this.value = next; } };
}

test('crossing tabs signals every boundary during contact and commits only once on release', async () => {
  const position = shared(0);
  const dragging = shared(false);
  const onCross = jest.fn();
  const onSelect = jest.fn();
  await render(<SwipeTabBar index={0} width={412} enabled position={position as never} dragging={dragging as never}
    onCross={onCross} onSelect={onSelect}><View /></SwipeTabBar>);
  const pan = mockRecognizers.pan!;
  pan.start!({ x: 56, pointerType: 0 });
  pan.update!({ x: 100, pointerType: 0 });
  expect(onCross).not.toHaveBeenCalled();
  expect(dragging.get()).toBe(true);
  pan.update!({ x: 110, pointerType: 0 });
  pan.update!({ x: 356, pointerType: 0 });
  pan.update!({ x: 156, pointerType: 0 });
  expect(onCross.mock.calls.map(([index]) => index)).toEqual([1, 2, 3, 2, 1]);
  expect(onSelect).not.toHaveBeenCalled();
  expect(position.get()).toBe(1);
  pan.end!({ x: 156, pointerType: 0 }, true);
  pan.finalize!({ x: 156, pointerType: 0 }, true);
  expect(onSelect.mock.calls).toEqual([[1, true]]);
  expect(onCross).toHaveBeenCalledTimes(5);
  expect(dragging.get()).toBe(false);
});

test('cancelling a preview rolls back without committing or suppressing a later tap', async () => {
  const position = shared(1);
  const dragging = shared(false);
  const onSelect = jest.fn();
  await render(<SwipeTabBar index={1} width={412} enabled position={position as never} dragging={dragging as never}
    onSelect={onSelect}><View /></SwipeTabBar>);
  mockRecognizers.pan!.start!({ x: 156, pointerType: 0 });
  mockRecognizers.pan!.update!({ x: 306, pointerType: 0 });
  expect(position.get()).toBe(2.5);
  mockRecognizers.pan!.finalize!({ x: 306, pointerType: 0 }, false);
  expect(position.get()).toBe(1);
  expect(dragging.get()).toBe(false);
  expect(onSelect).not.toHaveBeenCalled();
  mockRecognizers.tap!.end!({ x: 356, pointerType: 0 }, true);
  expect(onSelect.mock.calls).toEqual([[3]]);
});

test('synthetic key coordinates never select a tab through the pointer recognizers', async () => {
  const onSelect = jest.fn();
  const position = shared(0);
  const dragging = shared(false);
  await render(<SwipeTabBar index={0} width={412} enabled position={position as never} dragging={dragging as never}
    onSelect={onSelect}><View /></SwipeTabBar>);
  mockRecognizers.pan!.start!({ x: 356, pointerType: 3 });
  mockRecognizers.pan!.update!({ x: 356, pointerType: 3 });
  mockRecognizers.tap!.end!({ x: 356, pointerType: 3 }, true);
  mockRecognizers.pan!.end!({ x: 356, pointerType: 3 }, true);
  mockRecognizers.pan!.finalize!({ x: 356, pointerType: 3 }, true);
  expect(onSelect).not.toHaveBeenCalled();
  expect(dragging.get()).toBe(false);
  expect(position.get()).toBe(0);
});

test('tapping the committed tab during a pending snap finishes the capsule at its centre', async () => {
  const position = shared(0.7);
  const dragging = shared(true);
  const onSelect = jest.fn();
  await render(<SwipeTabBar index={1} width={412} enabled position={position as never} dragging={dragging as never}
    onSelect={onSelect}><View /></SwipeTabBar>);
  // The destination is already committed, but its UI-thread snap has not ended.
  // A same-tab selection intentionally causes no new route/render effect.
  mockRecognizers.tap!.end!({ x: 156, pointerType: 0 }, true);
  expect(onSelect.mock.calls).toEqual([[1]]);
  expect(dragging.get()).toBe(false);
  expect(position.get()).toBe(1);
});
