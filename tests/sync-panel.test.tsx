import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LanguageProvider } from '../src/i18n/react';
import type { AppLanguage } from '../src/i18n/core';
import type { CloudSyncActions, CloudSyncProps, CloudSyncView } from '../src/sync/types';
import { SyncPanel } from '../src/ui/SyncPanel';

jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan,
    failOffsetY: () => pan, onStart: () => pan, onUpdate: () => pan, onEnd: () => pan,
    onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});

const base: CloudSyncView = {
  configured: true, account: null, status: 'disconnected', enabled: false, lastSyncedAt: null,
  pending: false, error: null, conflict: null, boundToOtherAccount: false, readOnly: false, demo: false,
};
const account = { uid: 'user-1', email: 'Ajustes@example.test', displayName: 'Cancelar' };
function controls(): jest.Mocked<CloudSyncActions> {
  return { signIn: jest.fn(async () => undefined), enable: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined), synchronize: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined), resolve: jest.fn<Promise<void>, ['local' | 'remote']>(async () => undefined),
    exportConflict: jest.fn<Promise<void>, ['local' | 'remote']>(async () => undefined) };
}
function localized(language: AppLanguage, props: CloudSyncProps) {
  return <LanguageProvider language={language} onLanguageChange={async () => undefined}><SyncPanel {...props} /></LanguageProvider>;
}

test('Google connection never implicitly uploads; activating requires disclosure and confirmation', async () => {
  const actions = controls();
  const panel = await render(localized('es', { view: base, actions }));
  await fireEvent.press(screen.getByRole('button', { name: 'Conectar con Google' }));
  expect(actions.signIn).toHaveBeenCalledTimes(1);
  expect(actions.enable).not.toHaveBeenCalled();
  await panel.rerender(localized('es', { view: { ...base, account, status: 'paused' }, actions }));
  expect(screen.getByText('Cancelar')).toBeTruthy();
  expect(screen.getByText('Ajustes@example.test')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Activar sincronización' }));
  expect(screen.getByText(/incluidos los datos marcados como privados/)).toBeTruthy();
  expect(actions.enable).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirmar y activar' }));
  expect(actions.enable).toHaveBeenCalledTimes(1);
});

test.each([
  { configured: false, status: 'not-configured' as const },
  { demo: true },
  { readOnly: true },
])('unavailable, demo or read-only panels cannot initiate Google or synchronization: %p', async restriction => {
  const actions = controls();
  const panel = await render(localized('es', { view: { ...base, ...restriction }, actions }));
  const connect = screen.getByRole('button', { name: 'Conectar con Google' });
  expect(connect.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(connect);
  expect(actions.signIn).not.toHaveBeenCalled();
  await panel.rerender(localized('es', { view: { ...base, account, enabled: true, status: 'idle', ...restriction }, actions }));
  expect(screen.getByRole('button', { name: 'Sincronizar ahora' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Sincronizar ahora' }));
  expect(actions.synchronize).not.toHaveBeenCalled();
});

test('a different linked account blocks activation and sync while allowing safe sign-out', async () => {
  const actions = controls();
  const panel = await render(localized('en', { view: { ...base, account, status: 'paused', boundToOtherAccount: true }, actions }));
  expect(screen.getByText(/This local data is linked to another account/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Enable sync' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Enable sync' }));
  expect(actions.enable).not.toHaveBeenCalled();
  await panel.rerender(localized('en', { view: { ...base, account, enabled: true, status: 'idle', boundToOtherAccount: true }, actions }));
  expect(screen.getByRole('button', { name: 'Sync now' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(actions.signOut).not.toHaveBeenCalled();
  expect(screen.getByText(/This database will stay linked to the original account/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm sign out' }));
  expect(actions.signOut).toHaveBeenCalledTimes(1);
});

test.each(['local', 'remote'] as const)('conflict exports both branches and requires a second explicit confirmation for %s', async side => {
  const actions = controls();
  await render(localized('en', { view: { ...base, account, enabled: true, status: 'conflict',
    conflict: { reason: 'divergent', localActivities: 2, localEntries: 5, remoteActivities: 3, remoteEntries: 8 } }, actions }));
  expect(screen.getByRole('button', { name: 'Sync now' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Review changes' }));
  expect(screen.getByText('2 activities · 5 entries')).toBeTruthy();
  expect(screen.getByText('3 activities · 8 entries')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save local copy' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save online copy' }));
  expect(actions.exportConflict.mock.calls).toEqual([['local'], ['remote']]);
  await fireEvent.press(screen.getByRole('button', { name: side === 'local' ? 'Use this device’s version' : 'Use my account’s version' }));
  expect(actions.resolve).not.toHaveBeenCalled();
  expect(screen.getByText(/The other version will be saved as a recovery copy/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm this version' }));
  expect(actions.resolve).toHaveBeenCalledWith(side);
  expect(actions.resolve).toHaveBeenCalledTimes(1);
});

test('English and Portuguese remain reactive while account text is never translated', async () => {
  const actions = controls();
  const props = { view: { ...base, account, enabled: true, status: 'offline' as const,
    pending: true, lastSyncedAt: Date.parse('2026-10-15T17:00:00Z') }, actions };
  const panel = await render(localized('en', props));
  expect(screen.getByText('Account and sync')).toBeTruthy();
  expect(screen.getByText('Offline: your changes stay on this device')).toBeTruthy();
  expect(screen.getByText(/Last synced:/)).toBeTruthy();
  await panel.rerender(localized('pt', props));
  expect(screen.getByText('Conta e sincronização')).toBeTruthy();
  expect(screen.getByText('Sem conexão: suas alterações ficam neste dispositivo')).toBeTruthy();
  expect(screen.getByText(/Última sincronização:/)).toBeTruthy();
  expect(screen.getByText('Cancelar')).toBeTruthy();
  expect(screen.getByText('Ajustes@example.test')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Pausar sincronização' }));
  expect(actions.pause).toHaveBeenCalledTimes(1);
  await panel.rerender(localized('pt', { view: { ...props.view, enabled: false, status: 'paused' }, actions }));
  await fireEvent.press(screen.getByRole('button', { name: 'Retomar sincronização' }));
  expect(actions.enable).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirmar e ativar' }));
  expect(actions.enable).toHaveBeenCalledTimes(1);
});

test('failed actions keep the consent open and report the failure without claiming success', async () => {
  const actions = controls();
  actions.enable.mockRejectedValue(new Error('NETWORK_FAILURE'));
  await render(localized('en', { view: { ...base, account, status: 'paused' }, actions }));
  await fireEvent.press(screen.getByRole('button', { name: 'Enable sync' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm and enable' }));
  expect(screen.getAllByText('! NETWORK_FAILURE').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Confirm and enable' })).toBeTruthy();
  expect(actions.synchronize).not.toHaveBeenCalled();
});

test('changing accounts invalidates a previous activation consent', async () => {
  const actions = controls();
  const panel = await render(localized('es', { view: { ...base, account, status: 'paused' }, actions }));
  await fireEvent.press(screen.getByRole('button', { name: 'Activar sincronización' }));
  expect(screen.getByRole('button', { name: 'Confirmar y activar' })).toBeTruthy();
  await panel.rerender(localized('es', { view: { ...base, account: { ...account, uid: 'user-2' }, status: 'paused' }, actions }));
  expect(screen.queryByRole('button', { name: 'Confirmar y activar' })).toBeNull();
  expect(actions.enable).not.toHaveBeenCalled();
});

test('sync-in-progress disables initiating another operation', async () => {
  const actions = controls();
  await render(localized('es', { view: { ...base, account, status: 'syncing', enabled: true }, actions }));
  for (const label of ['Sincronizar ahora', 'Pausar sincronización', 'Cerrar sesión']) {
    const button = screen.getByRole('button', { name: label });
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
  }
  expect(actions.synchronize).not.toHaveBeenCalled();
  expect(actions.pause).not.toHaveBeenCalled();
  expect(actions.signOut).not.toHaveBeenCalled();
});

test('recovery copies load only when requested and export the chosen original version', async () => {
  const version = 'a'.repeat(64);
  const actions = { ...controls(), loadRecoveryCopies: jest.fn(async () => undefined), exportRecoveryCopy: jest.fn(async (_version: string) => undefined) };
  await render(localized('en', { view: { ...base, account, status: 'paused', recoveryCopies: [{ version, activities: 2, entries: 7 }] }, actions }));
  expect(actions.loadRecoveryCopies).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Recovery copies' }));
  expect(actions.loadRecoveryCopies).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Version aaaaaaaa')).toBeTruthy();
  expect(screen.getByText('2 activities · 7 entries')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save recovery copy' }));
  expect(actions.exportRecoveryCopy).toHaveBeenCalledWith(version);
  expect(actions.resolve).not.toHaveBeenCalled(); expect(actions.enable).not.toHaveBeenCalled();
});

test('invalid or out-of-range timestamps cannot crash account or recovery rendering', async () => {
  const actions = { ...controls(), exportRecoveryCopy: jest.fn(async () => undefined) };
  await render(localized('pt', { view: { ...base, account, status: 'paused', lastSyncedAt: Number.MAX_SAFE_INTEGER,
    recoveryCopies: [{ version: 'b'.repeat(64), createdAt: Number.MAX_SAFE_INTEGER }] }, actions }));
  expect(screen.queryByText(/Última sincronização:/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Cópias de recuperação' }));
  expect(screen.getByText('Versão bbbbbbbb')).toBeTruthy();
});
