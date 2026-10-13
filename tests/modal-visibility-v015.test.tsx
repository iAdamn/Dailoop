import React, { useState } from 'react';
import { AccessibilityInfo, Pressable, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Field, ModalFrame } from '../src/ui/components';
import { MotionProvider, useMotionDisabled } from '../src/ui/motion';

function OpenAfterPreferenceLoads() {
  const reduced = useMotionDisabled();
  const [open, setOpen] = useState(false);
  return <>
    <Text>{reduced ? 'Movimiento reducido' : 'Movimiento activo'}</Text>
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)}><Text>Abrir formulario</Text></Pressable>
    {open && <ModalFrame title="Editar actividad" onClose={() => setOpen(false)}>
      <Field label="Nombre de la actividad" value="Lectura" onChangeText={() => undefined} />
    </ModalFrame>}
  </>;
}

afterEach(() => jest.restoreAllMocks());

test('an active-motion form is visible before a delayed native dialog show event', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  await render(<MotionProvider><OpenAfterPreferenceLoads /></MotionProvider>);
  await screen.findByText('Movimiento activo');
  await fireEvent.press(screen.getByRole('button', { name: 'Abrir formulario' }));

  // No native dialog/frame lifecycle exists in Jest: content availability must
  // not depend on completing its entry animation or receiving onShow first.
  expect(screen.getByLabelText('Nombre de la actividad')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cerrar diálogo' })).toBeVisible();
});
