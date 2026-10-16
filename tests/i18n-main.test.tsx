import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import DailoopUI, { type DailoopUIProps } from '../src/ui/DailoopUI';
import { ActivityForm } from '../src/ui/forms';
import { Button, quantity } from '../src/ui/components';
import { compactLastTime, elapsedText } from '../src/ui/layout';
import { LanguageProvider } from '../src/i18n/react';
import type { AppLanguage } from '../src/i18n/core';
import { buildReport, execute, selectActivities } from '../src/domain';
import { createV015State, V015_NOW } from './fixtures/v015';

jest.mock('react-native-gesture-handler', () => {
  const gesture = { enabled: () => gesture, maxPointers: () => gesture, activeOffsetX: () => gesture,
    failOffsetY: () => gesture, onStart: () => gesture, onUpdate: () => gesture, onEnd: () => gesture,
    onFinalize: () => gesture, maxDuration: () => gesture, maxDistance: () => gesture };
  return { Gesture: { Pan: () => gesture, Tap: () => gesture, Exclusive: () => gesture }, PointerType: { KEY: 3 },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const changeLanguage = jest.fn(async () => undefined);
function inLanguage(language: AppLanguage, children: React.ReactNode) {
  return <LanguageProvider language={language} onLanguageChange={changeLanguage}>{children}</LanguageProvider>;
}
function appProps(): DailoopUIProps {
  const state = createV015State(10, 0);
  state.activityRevisions[0].name = 'Ajustes';
  state.activityRevisions[0].category = 'Estadísticas';
  let serial = 1;
  const nextId = () => `17000000-0000-4000-9000-${String(serial++).padStart(12, '0')}`;
  return {
    state, nowMs: V015_NOW, mode: 'personal', storageLabel: 'QA', busy: false, error: null,
    activityColumns: 1, onActivityColumns: async () => undefined, onClearError: () => undefined,
    onPlanning: async () => undefined, onCompleteReminder: async () => undefined,
    notificationStatus: 'unsupported', onEnableNotifications: async () => undefined,
    onCommand: async command => execute(state, command, { nowMs: V015_NOW, operationId: nextId(), nextId }),
    onReport: async options => buildReport(state, options), onSaveReport: async () => '',
    onCopyReport: async () => '', onShareReport: async () => '', onExportBackup: async () => '',
    onInspectBackup: async () => null, onRestoreBackup: async () => undefined, onMode: async () => undefined,
  };
}

test.each([
  ['en', 'Activity name', 'Category (optional)', 'Create activity', 'Yellow'],
  ['pt', 'Nome da atividade', 'Categoria (opcional)', 'Criar atividade', 'Amarelo'],
] as const)('activity creation uses %s while submitting user content unchanged', async (language, nameLabel, categoryLabel, createLabel, colorLabel) => {
  const submit = jest.fn(async () => undefined);
  await render(inLanguage(language, <ActivityForm activities={[]} onClose={jest.fn()} submit={submit} />));
  await fireEvent.changeText(screen.getByLabelText(nameLabel), 'Ajustes');
  await fireEvent.changeText(screen.getByLabelText(categoryLabel), 'Estadísticas');
  expect(screen.getByRole('radio', { name: colorLabel })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: createLabel }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ajustes', category: 'Estadísticas' }), expect.any(String));
});

test('changing language keeps a live activity draft, including a name that is also an app label', async () => {
  const props = { activities: [], onClose: jest.fn(), submit: jest.fn(async () => undefined) };
  const view = await render(inLanguage('es', <ActivityForm {...props} />));
  await fireEvent.changeText(screen.getByLabelText('Nombre de la actividad'), 'Ajustes');
  await fireEvent.changeText(screen.getByLabelText('Categoría (opcional)'), 'Estadísticas');
  await view.rerender(inLanguage('en', <ActivityForm {...props} />));
  expect(screen.getByLabelText('Activity name')).toHaveDisplayValue('Ajustes');
  expect(screen.getByLabelText('Category (optional)')).toHaveDisplayValue('Estadísticas');
  await view.rerender(inLanguage('pt', <ActivityForm {...props} />));
  expect(screen.getByLabelText('Nome da atividade')).toHaveDisplayValue('Ajustes');
  expect(screen.getByLabelText('Categoria (opcional)')).toHaveDisplayValue('Estadísticas');
});

test('shared controls never translate arbitrary child or accessibility text', async () => {
  const activity = selectActivities(createV015State(10, 0))[0];
  await render(inLanguage('en', <Button label={activity.name} onPress={jest.fn()}>Ajustes</Button>));
  expect(screen.getByText('Ajustes')).toBeVisible();
  expect(screen.getByRole('button', { name: activity.name })).toBeVisible();
});

test.each([
  ['en', 'Log', 'Reminders', 'Statistics', 'Settings', 'Your settings'],
  ['pt', 'Registro', 'Lembretes', 'Estatísticas', 'Configurações', 'Suas configurações'],
] as const)('main navigation and persisted-language controls use %s without translating activities', async (language, log, reminders, stats, settings, heading) => {
  changeLanguage.mockClear();
  const props = appProps();
  const view = await render(inLanguage(language, <DailoopUI {...props} />));
  for (const label of [log, reminders, stats, settings]) expect(screen.getByRole('tab', { name: label })).toBeVisible();
  expect(screen.getByText('Ajustes')).toBeVisible();
  expect(screen.getByText(/Estadísticas/)).toBeVisible();
  await view.rerender(inLanguage(language, <DailoopUI {...props} route={{ tab: 'settings' }} />));
  expect(screen.getByRole('header', { name: heading })).toBeVisible();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Español' }));
  expect(changeLanguage).toHaveBeenCalledWith('es');
  expect(props.state.activityRevisions[0].name).toBe('Ajustes');
});

test('elapsed labels and quantities accept an explicit language with the original Spanish default', () => {
  expect(compactLastTime(null, V015_NOW)).toBe('Sin registros');
  expect(compactLastTime(null, V015_NOW, 'en')).toBe('No entries');
  expect(compactLastTime(V015_NOW - 120_000, V015_NOW, 'pt')).toBe('Há 2 min');
  expect(elapsedText(V015_NOW - 86_400_000, V015_NOW, 'en')).toBe('1 day ago');
  expect(elapsedText(V015_NOW - 172_800_000, V015_NOW, 'pt')).toBe('Há 2 dias');
  expect(elapsedText(V015_NOW + 1, V015_NOW, 'en')).toBe('Check your device time');
  expect(quantity(1, 'registro', 'registros', 'en')).toBe('1 entry');
  expect(quantity(2, 'registro', 'registros', 'pt')).toBe('2 registros');
});

test.each([
  ['en', 'Log Ajustes', 'Undo entry for Ajustes'],
  ['pt', 'Registrar Ajustes', 'Desfazer registro de Ajustes'],
] as const)('quick undo keeps its canonical audit reason in %s', async (language, record, undo) => {
  const props = appProps();
  const command = jest.fn(props.onCommand);
  await render(inLanguage(language, <DailoopUI {...props} onCommand={command} />));
  const clock = jest.spyOn(Date, 'now').mockReturnValue(V015_NOW);
  try {
    await fireEvent.press(screen.getByRole('button', { name: record }));
    await fireEvent.press(screen.getByRole('button', { name: undo }));
    expect(command.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      type: 'voidEntry', reason: 'Deshacer registro rápido',
    }));
  } finally { clock.mockRestore(); }
});
