import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { createEmptyState } from '../src/domain';
import { LanguageProvider } from '../src/i18n/react';
import { AccountPrivacy } from '../src/ui/AccountPrivacy';
import type { CloudSyncActions, CloudSyncProps, CloudSyncView } from '../src/sync/types';

jest.mock('react-native-gesture-handler', () => {
  const pan = { enabled: () => pan, maxPointers: () => pan, activeOffsetX: () => pan, failOffsetY: () => pan, onStart: () => pan, onUpdate: () => pan, onEnd: () => pan, onFinalize: () => pan, maxDistance: () => pan };
  return { Gesture: { Pan: () => pan, Tap: () => pan, Exclusive: () => pan }, PointerType: { KEY: 3 }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
const mockAccount = { uid: 'alice', email: 'alice@example.test', displayName: 'Alice' };
const mockBaseView: CloudSyncView = { configured: true, account: mockAccount, status: 'paused', enabled: false, lastSyncedAt: null, pending: false, error: null, conflict: null, boundToOtherAccount: false, readOnly: false, demo: false };
const mockState = () => createEmptyState({ databaseId: '94000000-0000-4000-8000-000000000001', nowMs: Date.parse('2026-10-16T03:00:00Z') });
const mockOrder: string[] = [];
const mockStore = { snapshot: jest.fn(async () => mockState()), applySync: jest.fn(async () => { mockOrder.push('local-clear'); }) };
const mockSession = { snapshot: { state: mockState(), mode: 'personal', readOnly: false, storageLabel: 'fixture', error: null, reloading: false, recoveryRequired: null }, store: mockStore, refresh: jest.fn(async () => undefined) };
const mockPurge = jest.fn<Promise<void>, unknown[]>(async () => { mockOrder.push('purge'); });
const mockGoogle = jest.fn(); const mockPending = jest.fn();
const mockRemember = jest.fn(); const mockTake = jest.fn(); const mockClearIntent = jest.fn();
const mockClearAccount = jest.fn(async () => { mockOrder.push('metadata-clear'); }); const mockUnbind = jest.fn(async () => undefined);
const mockAuth = { account: mockAccount as typeof mockAccount | null, load: jest.fn(async () => undefined), signIn: jest.fn(async () => undefined), token: jest.fn(async () => 'isolated-id-token'), signOut: jest.fn(async () => undefined), deleteAccount: jest.fn(async () => { mockOrder.push('auth-delete'); mockAuth.account = null; }) };
let mockController: any;
jest.mock('../src/infrastructure/session', () => ({ session: mockSession }));
jest.mock('../src/infrastructure/crypto', () => ({ digest: jest.fn(async () => 'a'.repeat(64)), uuid: jest.fn(() => '94000000-0000-4000-8000-000000000099') }));
jest.mock('../src/infrastructure/files', () => ({ saveText: jest.fn() }));
jest.mock('../src/infrastructure/widgets', () => ({ clearWidgets: jest.fn(async () => undefined) }));
jest.mock('../src/infrastructure/notifications', () => ({ synchronizeNotificationPlan: jest.fn(async () => undefined) }));
jest.mock('../src/sync/config', () => ({ cloudConfig: () => ({ projectId: 'dailoop-account-test', apiKey: 'public', googleWebClientId: 'fixture.apps.googleusercontent.com' }) }));
jest.mock('../src/sync/credentials', () => ({ credentialVault: {}, googleCredential: mockGoogle, pendingGoogleCredential: mockPending, subscribeOnline: () => () => undefined }));
jest.mock('../src/sync/deletion', () => ({ purgeCloudAccount: mockPurge }));
jest.mock('../src/sync/reauth', () => ({ rememberDeletionReauth: mockRemember, takeDeletionReauth: mockTake, clearDeletionReauth: mockClearIntent }));
jest.mock('../src/sync/auth', () => ({ CloudAuth: jest.fn(() => mockAuth) }));
jest.mock('../src/sync/firestore', () => ({ FirestoreSyncTransport: jest.fn(() => ({ readHead: jest.fn(async () => null) })) }));
jest.mock('../src/sync/metadata', () => ({ SyncMetadata: jest.fn(() => ({ copies: jest.fn(async () => []), clearAccount: mockClearAccount, unbind: mockUnbind })) }));
jest.mock('../src/sync/controller', () => ({ initialCloudSyncView: mockBaseView, SyncController: jest.fn(() => {
  const listeners = new Set<(mockView: CloudSyncView) => void>();
  mockController = { view: { ...mockBaseView }, emit(changes: Partial<CloudSyncView>) { this.view = { ...this.view, ...changes }; for (const listener of listeners) listener(this.view); },
    subscribe: jest.fn((listener: (mockView: CloudSyncView) => void) => { listeners.add(listener); listener(mockController.view); return () => listeners.delete(listener); }),
    pause: jest.fn(async () => undefined), quiesce: jest.fn(async () => { mockOrder.push('quiesce'); }), suspend: jest.fn(), changed: jest.fn(), refresh: jest.fn(async () => undefined),
    setAccount: jest.fn(async (account: typeof mockAccount | null) => { mockController.emit({ account }); }), enable: jest.fn(), synchronize: jest.fn(), resolve: jest.fn() };
  return mockController;
}) }));

let useCloudSync: typeof import('../src/sync/react').useCloudSync;
beforeAll(() => { useCloudSync = jest.requireActual('../src/sync/react').useCloudSync; });
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); delete (globalThis as any).__dailoopCloud;
  mockOrder.length = 0; mockAuth.account = mockAccount;
  mockSession.snapshot = { state: mockState(), mode: 'personal', readOnly: false, storageLabel: 'fixture', error: null, reloading: false, recoveryRequired: null };
  mockPending.mockReset().mockResolvedValue(null); mockGoogle.mockReset().mockResolvedValue({ kind: 'id_token', token: 'isolated-google-token' }); mockTake.mockReset().mockReturnValue(null);
  mockPurge.mockReset().mockImplementation(async () => { mockOrder.push('purge'); }); mockClearAccount.mockResolvedValue(undefined);
  mockAuth.deleteAccount.mockImplementation(async () => { mockOrder.push('auth-delete'); mockAuth.account = null; });
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => { delete (globalThis as any).__dailoopCloud; jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
async function flush() { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); }
async function hookReady() { const hook = await renderHook(() => useCloudSync(mockSession.snapshot as any, 'es')); await flush(); return hook; }
function actions(): CloudSyncActions {
  return { signIn: jest.fn(async () => undefined), signOut: jest.fn(async () => undefined), enable: jest.fn(async () => undefined), pause: jest.fn(async () => undefined), synchronize: jest.fn(async () => undefined), resolve: jest.fn(async () => undefined), exportConflict: jest.fn(async () => undefined), prepareDeletion: jest.fn(async () => undefined), deleteAccount: jest.fn(async () => undefined), detachLocalData: jest.fn(async () => undefined) };
}
function ui(props: CloudSyncProps) { return <LanguageProvider language="es" onLanguageChange={async () => undefined}><AccountPrivacy {...props} /></LanguageProvider>; }

test('deletion confirmation keeps local data by default and does not act before the final button', async () => {
  const control = actions(); const view = await render(ui({ view: mockBaseView, actions: control }));
  await fireEvent.press(screen.getByRole('button', { name: 'Borrar cuenta y datos online' }));
  expect(control.prepareDeletion).not.toHaveBeenCalled(); expect(control.deleteAccount).not.toHaveBeenCalled();
  expect(screen.getByRole('switch', { name: 'Conservar mis datos en este dispositivo' }).props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Confirmar cuenta con Google' })); expect(control.prepareDeletion).toHaveBeenCalledTimes(1); expect(control.deleteAccount).not.toHaveBeenCalled();
  await view.rerender(ui({ view: { ...mockBaseView, deletionReady: true }, actions: control }));
  await fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' })); expect(control.deleteAccount).toHaveBeenCalledWith(true);
});

test('local data is removed only after explicitly disabling the preservation switch', async () => {
  const control = actions(); await render(ui({ view: { ...mockBaseView, deletionReady: true }, actions: control }));
  await fireEvent.press(screen.getByRole('switch', { name: 'Conservar mis datos en este dispositivo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' })); expect(control.deleteAccount).toHaveBeenCalledWith(false);
});

test('a reauthenticated deletion dialog can still be cancelled without deleting or detaching', async () => {
  function Host() { return ui(useCloudSync(mockSession.snapshot as any, 'es')); }
  await render(<Host />); await flush();
  await fireEvent.press(screen.getByRole('button', { name: 'Borrar cuenta y datos online' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirmar cuenta con Google' })); await flush();
  expect(screen.getByRole('button', { name: 'Borrar definitivamente' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  await act(async () => { jest.advanceTimersByTime(1_000); });
  expect(screen.queryByRole('button', { name: 'Borrar definitivamente' })).toBeNull();
  expect(mockAuth.deleteAccount).not.toHaveBeenCalled(); expect(mockUnbind).not.toHaveBeenCalled(); expect(mockClearIntent).toHaveBeenCalled();
});

test('detaching a local dataset requires a dedicated explicit confirmation', async () => {
  const control = actions(); await render(ui({ view: mockBaseView, actions: control }));
  await fireEvent.press(screen.getByRole('button', { name: 'Desvincular esta copia local' }));
  expect(control.detachLocalData).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirmar desvinculación' })); expect(control.detachLocalData).toHaveBeenCalledTimes(1);
});

test('a new deletion attempt restores the safe keep-local default after cancelling an opt-out', async () => {
  const control = actions(); await render(ui({ view: mockBaseView, actions: control }));
  await fireEvent.press(screen.getByRole('button', { name: 'Borrar cuenta y datos online' }));
  await fireEvent.press(screen.getByRole('switch', { name: 'Conservar mis datos en este dispositivo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar diálogo' })); await act(async () => { jest.advanceTimersByTime(1_000); });
  await fireEvent.press(screen.getByRole('button', { name: 'Borrar cuenta y datos online' }));
  expect(screen.getByRole('switch', { name: 'Conservar mis datos en este dispositivo' }).props.accessibilityState.checked).toBe(true);
});

test('failed deletion stays visible for retry and never claims success', async () => {
  const control = actions(); (control.deleteAccount as jest.Mock).mockRejectedValueOnce(new Error('No hay conexión. Tus datos siguen guardados aquí.'));
  await render(ui({ view: { ...mockBaseView, deletionReady: true }, actions: control }));
  await fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' })); await flush();
  expect(screen.getByText('No hay conexión. Tus datos siguen guardados aquí.')).toBeTruthy(); expect(screen.queryByText('Cuenta y datos online borrados.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' })); expect(control.deleteAccount).toHaveBeenCalledTimes(2);
});

test('OAuth reauthentication callback marks ready but cannot start cloud or Auth deletion', async () => {
  mockPending.mockResolvedValue({ kind: 'access_token', token: 'isolated-redirect' }); mockTake.mockReturnValue({ uid: 'alice', createdAt: Date.now() });
  const hook = await hookReady(); expect(mockAuth.signIn).toHaveBeenCalledWith({ kind: 'access_token', token: 'isolated-redirect' }, 'alice', true);
  expect(hook.result.current.view.deletionReady).toBe(true); expect(mockPurge).not.toHaveBeenCalled(); expect(mockAuth.deleteAccount).not.toHaveBeenCalled(); await hook.unmount();
});

test('expired deletion redirect intent cannot fall through to ordinary account creation', async () => {
  mockPending.mockResolvedValue({ kind: 'access_token', token: 'expired-redirect' }); mockTake.mockImplementationOnce(() => { throw new Error('Confirma de nuevo tu cuenta con Google.'); });
  const hook = await hookReady(); expect(mockAuth.signIn).not.toHaveBeenCalled(); expect(mockPurge).not.toHaveBeenCalled();
  expect(hook.result.current.view.deletionReady).toBe(false); expect(hook.result.current.view.error).toBe('Confirma de nuevo tu cuenta con Google.'); await hook.unmount();
});

test('Auth deletion follows successful purge and local data survives the default action argument', async () => {
  const hook = await hookReady(); await act(async () => { await hook.result.current.actions.prepareDeletion!(); });
  await act(async () => { await (hook.result.current.actions.deleteAccount as any)(); });
  expect(mockOrder.indexOf('purge')).toBeLessThan(mockOrder.indexOf('auth-delete')); expect(mockStore.applySync).not.toHaveBeenCalled(); await hook.unmount();
});

test('explicit false clears local data, widgets and schedules after purging; true preserves them', async () => {
  for (const keep of [true, false]) {
    const hook = await hookReady(); await act(async () => { await hook.result.current.actions.prepareDeletion!(); });
    await act(async () => { await hook.result.current.actions.deleteAccount!(keep); });
    expect(mockStore.applySync).toHaveBeenCalledTimes(keep ? 0 : 1); await hook.unmount();
    delete (globalThis as any).__dailoopCloud; mockAuth.account = mockAccount; mockStore.applySync.mockClear();
  }
});

test('a purge failure retains credentials and local data and never calls Auth deletion', async () => {
  const hook = await hookReady(); await act(async () => { await hook.result.current.actions.prepareDeletion!(); });
  mockPurge.mockRejectedValueOnce(new Error('deletion:network'));
  await act(async () => { await expect(hook.result.current.actions.deleteAccount!(false)).rejects.toThrow('deletion:network'); });
  expect(mockStore.applySync).not.toHaveBeenCalled(); expect(mockAuth.deleteAccount).not.toHaveBeenCalled(); expect(mockAuth.account?.uid).toBe('alice'); await hook.unmount();
});

test('reauth readiness expires after five minutes so the user can reconfirm', async () => {
  const hook = await hookReady(); await act(async () => { await hook.result.current.actions.prepareDeletion!(); });
  expect(hook.result.current.view.deletionReady).toBe(true);
  await act(async () => { jest.advanceTimersByTime(300_001); });
  expect(hook.result.current.view.deletionReady).toBe(false); expect(mockPurge).not.toHaveBeenCalled(); await hook.unmount();
});

test('an account change while purge is finishing cannot clear the new account or local dataset', async () => {
  const hook = await hookReady(); await act(async () => { await hook.result.current.actions.prepareDeletion!(); });
  let resolve!: () => void; const gate = new Promise<void>(done => { resolve = done; }); mockPurge.mockReturnValueOnce(gate);
  let outcome!: Promise<void>; await act(async () => { outcome = hook.result.current.actions.deleteAccount!(false).catch(() => undefined); });
  mockAuth.account = { ...mockAccount, uid: 'bob' };
  await act(async () => { resolve(); await outcome; });
  expect(mockStore.applySync).not.toHaveBeenCalled(); expect(mockAuth.deleteAccount).not.toHaveBeenCalled(); expect(mockAuth.account.uid).toBe('bob'); await hook.unmount();
});

test('a Google reauthentication picker returning after unmount is ignored', async () => {
  const hook = await hookReady(); let resolve!: (value: unknown) => void;
  mockGoogle.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  let preparing!: Promise<void>; await act(async () => { preparing = hook.result.current.actions.prepareDeletion!(); });
  await hook.unmount(); resolve({ kind: 'id_token', token: 'late-credential' }); await preparing;
  expect(mockAuth.signIn).not.toHaveBeenCalled(); expect(mockPurge).not.toHaveBeenCalled();
});
