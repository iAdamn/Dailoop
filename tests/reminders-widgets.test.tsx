import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StreakBadge } from '../src/ui/StreakBadge';
import { StatsScreen } from '../src/ui/reports';
import { createV015State, V015_NOW } from './fixtures/v015';

test('the small flame starts with two consecutive days and keeps its count inside an accessible badge', async () => {
  const view = await render(<StreakBadge days={1} />);
  expect(screen.queryByLabelText(/Racha/)).toBeNull();
  await view.rerender(<StreakBadge days={2} />);
  const badge = screen.getByLabelText('Racha de 2 días');
  expect(within(badge).getByTestId('symbol-flame')).toBeTruthy();
  expect(within(badge).getByText('2')).toBeTruthy();
  expect(badge.props.pointerEvents).toBe('none');
  await view.rerender(<StreakBadge days={1005} />);
  expect(screen.getByLabelText('Racha de 1005 días')).toBeTruthy();
  expect(screen.getByText('999+')).toBeTruthy();
  await view.rerender(<StreakBadge days={0} />);
  expect(screen.queryByLabelText(/Racha/)).toBeNull();
});

test('statistics opens full history from its heading and preserves its current period selection', async () => {
  const openHistory = jest.fn(), openReport = jest.fn();
  await render(<StatsScreen state={createV015State(10, 0)} nowMs={V015_NOW} openReport={openReport} openHistory={openHistory} />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Día' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Ver historial' }));
  expect(openHistory).toHaveBeenCalledTimes(1);
  expect(openReport).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox', { name: /Día/ })).toBeChecked();
});
