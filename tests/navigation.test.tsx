import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActiveTabModal, TabPanel } from '../src/ui/navigation';
import DailoopUI, { type DailoopUIProps } from '../src/ui/DailoopUI';
import { MotionProvider } from '../src/ui/motion';
import { buildReport, computeStats, execute } from '../src/domain';
import { createV015State, V015_NOW } from './fixtures/v015';

// This test exercises retained screen state and native accessibility visibility.
// RNGH registration/recognition and UI-thread timing require a real Android app.
jest.mock('react-native-gesture-handler', () => {
  const pan = {
    enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan,
    failOffsetY: () => pan, onUpdate: () => pan, onEnd: () => pan, onFinalize: () => pan,
    maxDuration: () => pan, maxDistance: () => pan,
  };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../src/domain', () => {
  const actual = jest.requireActual('../src/domain');
  return { ...actual, computeStats: jest.fn(actual.computeStats) };
});

function FilterScreen({ label }: { label: string }) {
  const [selected, setSelected] = useState(false);
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label}
    accessibilityState={{ checked: selected }} onPress={() => setSelected(!selected)}>
    <Text>{label}</Text>
  </Pressable>;
}

function RetainedScreens() {
  const [history, setHistory] = useState(true);
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Cambiar pantalla" onPress={() => setHistory(!history)}><Text>Cambiar</Text></Pressable>
    <TabPanel active={history}><FilterScreen label="Filtro del historial" /></TabPanel>
    <TabPanel active={!history}><FilterScreen label="Selección de estadísticas" /></TabPanel>
  </View>;
}

test('native hidden panels leave accessibility queries while each screen keeps its selected filter', async () => {
  await render(<RetainedScreens />);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Filtro del historial' }));
  expect(screen.getByRole('checkbox', { name: 'Filtro del historial' })).toBeChecked();
  expect(screen.queryByRole('checkbox', { name: 'Selección de estadísticas' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Cambiar pantalla' }));
  expect(screen.queryByRole('checkbox', { name: 'Filtro del historial' })).toBeNull();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Selección de estadísticas' }));
  expect(screen.getByRole('checkbox', { name: 'Selección de estadísticas' })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Cambiar pantalla' }));
  expect(screen.getByRole('checkbox', { name: 'Filtro del historial' })).toBeChecked();
  expect(screen.queryByRole('checkbox', { name: 'Selección de estadísticas' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Cambiar pantalla' }));
  expect(screen.getByRole('checkbox', { name: 'Selección de estadísticas' })).toBeChecked();
});

test('a retained tab modal leaves the native tree while inactive and reappears with its draft', async () => {
  function ModalTabs() {
    const [active, setActive] = useState(true);
    const [open, setOpen] = useState(false);
    return <View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cambiar pantalla" onPress={() => setActive(!active)}><Text>Cambiar</Text></Pressable>
      <TabPanel active={active}>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir diálogo retenido" onPress={() => setOpen(true)}><Text>Abrir</Text></Pressable>
        <ActiveTabModal>{open && <Modal visible><Text>BORRADOR_RETENIDO</Text></Modal>}</ActiveTabModal>
      </TabPanel>
    </View>;
  }
  await render(<ModalTabs />);
  await fireEvent.press(screen.getByRole('button', { name: 'Abrir diálogo retenido' }));
  expect(screen.getByText('BORRADOR_RETENIDO')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Cambiar pantalla' }));
  expect(screen.queryByText('BORRADOR_RETENIDO', { includeHiddenElements: true })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Cambiar pantalla' }));
  expect(screen.getByText('BORRADOR_RETENIDO')).toBeVisible();
});

test('the root UI reuses statistics across navigation and same-day clock ticks, then invalidates after confirmed data', async () => {
  const state = createV015State(10, 100);
  let serial = 1;
  const nextId = () => `16000000-0000-4000-9000-${String(serial++).padStart(12, '0')}`;
  const props: DailoopUIProps = {
    state, nowMs: V015_NOW, mode: 'personal', storageLabel: 'QA unit', busy: false, error: null,
    activityColumns: 1, onActivityColumns: async () => undefined,
    onClearError: () => undefined,
    onCommand: async command => execute(state, command, { nowMs: V015_NOW, operationId: nextId(), nextId }),
    onReport: async options => buildReport(state, options),
    onSaveReport: async () => '', onCopyReport: async () => '', onShareReport: async () => '',
    onExportBackup: async () => '', onInspectBackup: async () => null,
    onRestoreBackup: async () => undefined, onMode: async () => undefined,
  };
  const calculator = jest.mocked(computeStats);
  calculator.mockClear();
  const view = await render(<MotionProvider><DailoopUI {...props} /></MotionProvider>);
  const initialCalls = calculator.mock.calls.length;
  expect(initialCalls).toBeGreaterThan(0);
  for (const label of ['Historial', 'Estadísticas', 'Inicio', 'Estadísticas', 'Ajustes', 'Estadísticas']) {
    await fireEvent(screen.getByRole('tab', { name: label }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  }
  expect(screen.getByRole('header', { name: 'Tu ritmo' })).toBeVisible();
  expect(calculator).toHaveBeenCalledTimes(initialCalls);
  await view.rerender(<MotionProvider><DailoopUI {...props} nowMs={V015_NOW + 15_000} /></MotionProvider>);
  expect(calculator).toHaveBeenCalledTimes(initialCalls);
  const confirmed = execute(state, { type: 'createEntry', activityId: state.activities[1].id }, {
    nowMs: V015_NOW, operationId: nextId(), nextId,
  }).state;
  await view.rerender(<MotionProvider><DailoopUI {...props} state={confirmed} nowMs={V015_NOW + 15_000} /></MotionProvider>);
  expect(calculator.mock.calls.length).toBeGreaterThan(initialCalls);
  expect(calculator.mock.calls.at(-1)![0]).toBe(confirmed);
  expect(calculator.mock.results.at(-1)!.value.total).toBe(2);
});
