import React, { useState } from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { Button, Chip, Field, Toggle } from '../src/ui/components';
import { ReportScreen } from '../src/ui/reports';
import { buildReport, createEmptyState, execute } from '../src/domain';
import type { DomainState, ReportModel, ReportOptions } from '../src/domain';

describe('Controles accesibles y prevención de envíos repetidos', () => {
  test('el botón no admite pulsaciones mientras guarda y conserva un nombre accesible', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    const view = await render(<Button label="Registrar lectura" busy onPress={onPress}>Registrar</Button>);
    const saving = screen.getByRole('button', { name: 'Registrar lectura' });
    expect(saving).toBeBusy();
    expect(saving).toBeDisabled();
    expect(screen.getByText('Guardando…')).toBeVisible();
    await user.press(saving);
    expect(onPress).not.toHaveBeenCalled();

    await view.rerender(<Button label="Registrar lectura" onPress={onPress}>Registrar</Button>);
    const ready = screen.getByRole('button', { name: 'Registrar lectura' });
    expect(ready).toBeEnabled();
    await user.press(ready);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('el selector comunica su estado sin depender solo de color o emoji', async () => {
    function Selection() {
      const [selected, setSelected] = useState(false);
      return <Chip selected={selected} label="Incluir lectura" onPress={() => setSelected(!selected)}>📖 Leer</Chip>;
    }
    const user = userEvent.setup();
    await render(<Selection />);
    const option = screen.getByRole('checkbox', { name: 'Incluir lectura' });
    expect(option).not.toBeChecked();
    await user.press(option);
    expect(screen.getByRole('checkbox', { name: 'Incluir lectura' })).toBeChecked();
  });

  test('un campo permite Unicode y expone etiqueta, ayuda y error legibles', async () => {
    function NameField() {
      const [value, setValue] = useState('');
      return <Field label="Nombre de la actividad" value={value} onChangeText={setValue}
        hint="Hasta 80 caracteres visibles." error="Revisa el nombre antes de guardar." />;
    }
    const user = userEvent.setup();
    await render(<NameField />);
    const input = screen.getByLabelText('Nombre de la actividad');
    await user.type(input, 'Café ☕');
    expect(screen.getByLabelText('Nombre de la actividad')).toHaveDisplayValue('Café ☕');
    expect(screen.getByText('Hasta 80 caracteres visibles.')).toBeVisible();
    expect(screen.getByText('! Revisa el nombre antes de guardar.')).toBeVisible();
  });

  test('privacidad presenta un control con nombre y estado, más su límite de protección', async () => {
    const onChange = jest.fn();
    function Privacy() {
      const [value, setValue] = useState(false);
      return <Toggle label="Actividad privada" value={value} onChange={next => { setValue(next); onChange(next); }}
        detail="No se incluirá inicialmente en reportes. Esto no cifra tus datos." />;
    }
    const user = userEvent.setup();
    await render(<Privacy />);
    expect(screen.getByRole('switch', { name: 'Actividad privada' })).not.toBeChecked();
    expect(screen.getByText('No se incluirá inicialmente en reportes. Esto no cifra tus datos.')).toBeVisible();
    await user.press(screen.getByRole('switch', { name: 'Actividad privada' }));
    expect(screen.getByRole('switch', { name: 'Actividad privada' })).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

function reportFixture(): DomainState {
  let counter = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
  const nowMs = Date.parse('2026-10-12T17:00:00.000Z');
  let state = createEmptyState({ databaseId: nextId(), nowMs, zone: 'America/Bogota' });
  for (const [name, isPrivate, note] of [
    ['Lectura QA', false, 'NOTAPUBLICAOCULTA'],
    ['ACTIVIDADPRIVADAOCULTA', true, 'NOTAPRIVADAOCULTA'],
  ] as const) {
    const activity = execute(state, { type: 'createActivity', name, emoji: '📖', color: '#DCCFFF', isPrivate },
      { nowMs, operationId: nextId(), nextId });
    state = execute(activity.state, { type: 'createEntry', activityId: activity.result.activityId!, note },
      { nowMs, operationId: nextId(), nextId }).state;
  }
  return state;
}

describe('Selección privada de reportes en la pantalla compartida', () => {
  test('excluye actividad privada y notas por defecto y entrega el mismo Markdown previsualizado', async () => {
    const state = reportFixture();
    const onSaveReport = jest.fn(async (_report: ReportModel) => 'Guardado');
    const user = userEvent.setup();
    await render(<ReportScreen state={state} nowMs={Date.parse('2026-10-12T17:00:00.000Z')}
      onBack={() => {}} onReport={async options => buildReport(state, options)}
      onSaveReport={onSaveReport} onCopyReport={async () => 'Copiado'} onShareReport={async () => 'Compartido'} />);
    expect(screen.getByRole('checkbox', { name: /ACTIVIDADPRIVADAOCULTA/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /^Notas$/ })).not.toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Ver vista previa' }));
    const preview = await screen.findByLabelText('Vista previa exacta del reporte Markdown');
    expect(preview).toHaveTextContent(/1 registros en 1 actividades/);
    expect(preview).toHaveTextContent(/Lectura QA/);
    expect(preview).not.toHaveTextContent(/ACTIVIDADPRIVADAOCULTA/);
    expect(preview).not.toHaveTextContent(/NOTAPUBLICAOCULTA/);
    expect(preview).not.toHaveTextContent(/NOTAPRIVADAOCULTA/);
    await user.press(screen.getByRole('button', { name: 'Guardar Markdown' }));
    expect(onSaveReport).toHaveBeenCalledTimes(1);
    expect(onSaveReport.mock.calls[0][0].markdown).toBe(preview.props.children);
  });

  test('selección vacía impide generar; no sustituye silenciosamente por todas las actividades', async () => {
    const state = reportFixture();
    const onReport = jest.fn(async (options: ReportOptions) => buildReport(state, options));
    const user = userEvent.setup();
    await render(<ReportScreen state={state} nowMs={Date.parse('2026-10-12T17:00:00.000Z')}
      onBack={() => {}} onReport={onReport} onSaveReport={async () => ''}
      onCopyReport={async () => ''} onShareReport={async () => ''} />);
    await user.press(screen.getByRole('button', { name: 'Ninguna' }));
    const preview = screen.getByRole('button', { name: 'Ver vista previa' });
    expect(preview).toBeDisabled();
    await user.press(preview);
    expect(onReport).not.toHaveBeenCalled();
  });
});
