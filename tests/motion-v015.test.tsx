import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { MotionProvider, useMotionDisabled } from '../src/ui/motion';

function Probe() {
  return <Text>{useMotionDisabled() ? 'Movimiento reducido' : 'Movimiento activo'}</Text>;
}
afterEach(() => jest.restoreAllMocks());

test('system reduced motion is honored initially and while the app remains open', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const listener = jest.spyOn(AccessibilityInfo, 'addEventListener');
  const view = await render(<MotionProvider><Probe /></MotionProvider>);
  expect(listener).toHaveBeenCalledWith('reduceMotionChanged', expect.any(Function));
  const subscription = listener.mock.results[0].value;
  const remove = jest.spyOn(subscription, 'remove');
  // Jest's overload inference chooses announcementFinished; the checked event above is boolean.
  const changed = listener.mock.calls[0][1] as unknown as (enabled: boolean) => void;
  expect(await screen.findByText('Movimiento activo')).toBeVisible();
  await act(async () => changed(true));
  expect(screen.getByText('Movimiento reducido')).toBeVisible();
  await act(async () => changed(false));
  expect(screen.getByText('Movimiento activo')).toBeVisible();
  await view.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('an unreadable system motion preference defaults to no animation', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('Preference unavailable'));
  await render(<MotionProvider><Probe /></MotionProvider>);
  expect(screen.getByText('Movimiento reducido')).toBeVisible();
});
