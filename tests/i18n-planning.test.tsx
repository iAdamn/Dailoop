import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createEmptyState, execute, selectActivities, type PlanningCommand, type ReportOptions } from '../src/domain';
import { buildReport, localizeReport } from '../src/domain/reports';
import { LanguageProvider } from '../src/i18n/react';
import type { AppLanguage } from '../src/i18n/core';
import { CalendarField } from '../src/ui/CalendarField';
import { LeadTimePicker } from '../src/ui/LeadTimePicker';
import { getEmojiChoices, findEmojis } from '../src/ui/emojiCatalog';
import { ReminderForm, reminderLeadLabel, repetitionLabel } from '../src/ui/reminders';
import { dateLabel, intervalLabel, ReportScreen } from '../src/ui/reports';

jest.mock('expo-crypto', () => {
  let serial = 0;
  return { randomUUID: () => `75000000-0000-4000-9000-${String(++serial).padStart(12, '0')}` };
});
jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan,
    failOffsetY: () => pan, onStart: () => pan, onUpdate: () => pan, onEnd: () => pan,
    onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});

const NOW = Date.parse('2026-10-14T17:00:00Z');
let serial = 0;
const nextId = () => `76000000-0000-4000-9000-${String(++serial).padStart(12, '0')}`;
function fixture() {
  let state = createEmptyState({ databaseId: nextId(), nowMs: NOW - 60_000, zone: 'America/Bogota' });
  state = execute(state, { type: 'createActivity', name: 'Tu ritmo', emoji: '☕', color: '#DCCFFF' }, {
    nowMs: NOW - 60_000, operationId: nextId(), nextId,
  }).state;
  state = execute(state, { type: 'createEntry', activityId: state.activities[0].id, occurredAtMs: NOW - 30_000,
    occurredZone: state.settings.zone, note: 'Cancelar' }, { nowMs: NOW - 30_000, operationId: nextId(), nextId }).state;
  return state;
}
function localized(language: AppLanguage, children: React.ReactNode) {
  return <LanguageProvider language={language} onLanguageChange={async () => undefined}>{children}</LanguageProvider>;
}

test('planning labels and dates cover three languages while Spanish defaults stay unchanged', () => {
  expect(reminderLeadLabel(180)).toBe('3 horas antes');
  expect(reminderLeadLabel(180, 'en')).toBe('3 hours before');
  expect(reminderLeadLabel(1440, 'pt')).toBe('1 dia antes');
  expect(reminderLeadLabel(15, 'en')).toBe('15 min before');
  const recurrence = { weekdays: [1, 3], hour: 12, minute: 0, zone: 'America/Bogota' };
  expect(repetitionLabel(recurrence)).toBe('Lunes · Miércoles');
  expect(repetitionLabel(recurrence, 'en')).toBe('Monday · Wednesday');
  expect(repetitionLabel(recurrence, 'pt')).toBe('Segunda-feira · Quarta-feira');
  expect(dateLabel('2024-02-29', 'en')).toBe('Feb 29, 2024');
  expect(dateLabel('2024-02-29', 'pt')).toBe('29 de fev. de 2024');
  expect(intervalLabel(86_400_000, 'en')).toBe('1 day');
  expect(intervalLabel(129_600_000, 'pt')).toBe('1,5 dias');
});

test('an open graphical calendar changes language without losing its unconfirmed date', async () => {
  const changed = jest.fn();
  const calendar = <CalendarField label="Date" value="2024-02-20" onChange={changed} />;
  const view = await render(localized('en', calendar));
  await fireEvent.press(screen.getByRole('button', { name: 'Date' }));
  expect(screen.getByRole('button', { name: 'Choose month' })).toBeTruthy();
  await fireEvent.press(screen.getByTestId('calendar-day-2024-02-29'));
  await view.rerender(localized('pt', calendar));
  expect(screen.getByRole('button', { name: 'Escolher mês' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '29 de fevereiro de 2024', selected: true })).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Escolher esta data' }));
  expect(changed).toHaveBeenCalledWith('2024-02-29');
});

test('reminder draft keeps activity, weekdays and graphical time when the language changes', async () => {
  const state = fixture();
  const save = jest.fn<Promise<void>, [PlanningCommand, string?]>(async () => undefined);
  const form = <ReminderForm activities={selectActivities(state)} nowMs={NOW} zone={state.settings.zone}
    onClose={jest.fn()} onSave={save} notificationStatus="unsupported" onEnableNotifications={async () => undefined} />;
  const view = await render(localized('en', form));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Choose activity Tu ritmo' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Choose days' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Repeat on monday' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Repeat on tuesday' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Reminder time' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Hour 21' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Minute 17' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Choose this time' }));
  await view.rerender(localized('pt', form));
  expect(screen.getByRole('checkbox', { name: 'Escolher atividade Tu ritmo', checked: true })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Repetir: segunda-feira', checked: true })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Repetir: terça-feira', checked: true })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Hora do lembrete' }).props.accessibilityValue.text).toBe('21:17');
  await fireEvent.press(screen.getByRole('button', { name: 'Criar lembrete' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ type: 'createReminder',
    activityId: state.activities[0].id, recurrence: { weekdays: [1, 2], hour: 21, minute: 17, zone: state.settings.zone } }), expect.any(String));
});

test('custom anticipation preserves the numeric draft through a language switch', async () => {
  const changed = jest.fn();
  const picker = <LeadTimePicker visible onClose={jest.fn()} onSelect={changed} />;
  const view = await render(localized('pt', picker));
  await fireEvent.press(screen.getByRole('button', { name: 'Aumentar minutos' }));
  await view.rerender(localized('en', picker));
  expect(screen.getByLabelText('Minutes: 16')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Add custom alert' }));
  expect(changed).toHaveBeenCalledWith(16);
});

test('all emoji choices retain their identity and have offline localized names and search', () => {
  const spanish = getEmojiChoices();
  for (const language of ['en', 'pt'] as const) {
    const choices = getEmojiChoices(language);
    expect(choices).toHaveLength(3953);
    expect(choices.map(choice => choice.emoji)).toEqual(spanish.map(choice => choice.emoji));
    expect(choices.every(choice => choice.name.length > 0)).toBe(true);
    expect(getEmojiChoices(language)).toBe(choices);
  }
  expect(getEmojiChoices('en').find(choice => choice.emoji === '☕')?.name).toBe('hot beverage');
  expect(getEmojiChoices('pt').find(choice => choice.emoji === '☕')?.name).toBe('café');
  expect(findEmojis('coffee', -1, 'en').some(choice => choice.emoji === '☕')).toBe(true);
  expect(findEmojis('cafezinho', -1, 'pt').some(choice => choice.emoji === '☕')).toBe(true);
});

test('an existing report changes its exact preview and exported language without translating user content', async () => {
  const state = fixture();
  const onReport = jest.fn(async (options: ReportOptions) => buildReport(state, options, 'en'));
  const onSave = jest.fn(async () => '');
  const props = { state, nowMs: NOW, onBack: jest.fn(), onReport, onSaveReport: onSave,
    onCopyReport: jest.fn(async () => ''), onShareReport: jest.fn(async () => '') };
  const view = await render(localized('en', <ReportScreen {...props} />));
  await fireEvent.press(screen.getByRole('switch', { name: 'Notes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'View preview' }));
  const original = await onReport.mock.results[0].value;
  await view.rerender(localized('pt', <ReportScreen {...props} />));
  expect(onReport).toHaveBeenCalledTimes(1);
  const expected = localizeReport(original, 'pt');
  expect(screen.getByLabelText('Prévia exata do relatório Markdown').props.children).toBe(expected.markdown);
  expect(expected.markdown).toContain('Tu ritmo');
  expect(expected.markdown).toContain('Cancelar');
  await fireEvent.press(screen.getByRole('button', { name: 'Salvar Markdown' }));
  expect(onSave).toHaveBeenCalledWith(expected);
});
