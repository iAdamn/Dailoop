import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { createEmptyState } from '../src/domain';
import type { CloudAccount, CloudSyncView, RecoveryCopy } from '../src/sync/types';
import type { SessionSnapshot } from '../src/infrastructure/session';

const mockAccount: CloudAccount = { uid: 'user-a', email: 'Ajustes@example.test', displayName: 'Cancelar' };
let mockInitialAccount: CloudAccount | null = mockAccount;
let mockSavedOptIn = false;
let mockPauseFailure: Error | null = null;
const mockLoad = jest.fn<Promise<void>, []>();
const mockGoogleCredential = jest.fn();
const mockPendingCredential = jest.fn();
const mockCopies = jest.fn<Promise<RecoveryCopy[]>, [string]>();
const mockOnlineListeners: (() => void)[] = [];
const mockRemoveOnline = jest.fn();
const mockSubscribeOnline = jest.fn((listener: () => void) => { mockOnlineListeners.push(listener); return mockRemoveOnline; });
const mockConfig = { projectId: 'dailoop-hook-fixture', apiKey: 'public-fixture-key', googleWebClientId: 'fixture.apps.googleusercontent.com' };
const mockSnapshot = (): SessionSnapshot => ({ state: createEmptyState({ databaseId: '85000000-0000-4000-8000-000000000001', nowMs: Date.parse('2026-10-15T17:00:00Z') }),
  mode: 'personal', readOnly: false, storageLabel: 'fixture', error: null });
const mockSession = { snapshot: mockSnapshot(), store: null, refresh: jest.fn(async () => undefined) };
interface FakeAuth {
  account: CloudAccount | null;
  load: typeof mockLoad;
  signIn: jest.Mock<Promise<void>, [unknown]>;
  signOut: jest.Mock<Promise<void>, []>;
  token: jest.Mock<Promise<string>, []>;
}
interface FakeController {
  view: CloudSyncView;
  subscribe: jest.Mock;
  setAccount: jest.Mock<Promise<void>, [CloudAccount | null]>;
  enable: jest.Mock<Promise<void>, []>;
  pause: jest.Mock<Promise<void>, []>;
  synchronize: jest.Mock<Promise<void>, []>;
  suspend: jest.Mock<void, []>;
  refresh: jest.Mock<Promise<void>, []>;
  changed: jest.Mock<void, []>;
  resolve: jest.Mock;
  conflictState: jest.Mock;
  emit(changes: Partial<CloudSyncView>): void;
}
const mockAuths: FakeAuth[] = [];
const mockControllers: FakeController[] = [];
const mockInitialView: CloudSyncView = { configured: false, account: null, status: 'not-configured', enabled: false,
  lastSyncedAt: null, pending: false, error: null, conflict: null, boundToOtherAccount: false, readOnly: false, demo: false };

jest.mock('../src/infrastructure/session', () => ({ session: mockSession }));
jest.mock('../src/infrastructure/crypto', () => ({ digest: jest.fn(async () => 'fixture-digest'), uuid: jest.fn(() => 'fixture-id') }));
jest.mock('../src/infrastructure/files', () => ({ saveText: jest.fn(async () => 'saved') }));
jest.mock('../src/sync/config', () => ({ cloudConfig: jest.fn(() => mockConfig) }));
jest.mock('../src/sync/credentials', () => ({ credentialVault: {}, googleCredential: mockGoogleCredential,
  pendingGoogleCredential: mockPendingCredential, subscribeOnline: mockSubscribeOnline }));
jest.mock('../src/sync/auth', () => ({ CloudAuth: jest.fn(() => {
  const auth: FakeAuth = { account: mockInitialAccount, load: mockLoad,
    signIn: jest.fn(async (_credential: unknown) => { auth.account = mockAccount; }),
    signOut: jest.fn(async () => { auth.account = null; }), token: jest.fn(async () => 'fixture-token') };
  mockAuths.push(auth); return auth;
}) }));
jest.mock('../src/sync/firestore', () => ({ FirestoreSyncTransport: jest.fn(() => ({
  readHead: jest.fn(async () => null), load: jest.fn(), stage: jest.fn(), publish: jest.fn(),
})) }));
jest.mock('../src/sync/metadata', () => ({ SyncMetadata: jest.fn(() => ({ copies: mockCopies, recovery: jest.fn() })) }));
jest.mock('../src/sync/controller', () => ({ initialCloudSyncView: mockInitialView, SyncController: jest.fn(() => {
  const listeners = new Set<(mockView: CloudSyncView) => void>();
  const controller: FakeController = {
    view: { ...mockInitialView, configured: true },
    emit(changes) { controller.view = { ...controller.view, ...changes }; for (const listener of listeners) listener(controller.view); },
    subscribe: jest.fn((listener: (mockView: CloudSyncView) => void) => { listeners.add(listener); listener(controller.view); return () => listeners.delete(listener); }),
    setAccount: jest.fn(async (account: CloudAccount | null) => { controller.emit({ account, enabled: !!account && mockSavedOptIn, status: account ? mockSavedOptIn ? 'idle' : 'paused' : 'disconnected' }); }),
    enable: jest.fn(async () => { controller.emit({ enabled: true, status: 'idle' }); }),
    pause: jest.fn(async () => { if (mockPauseFailure) throw mockPauseFailure; controller.emit({ enabled: false, status: 'paused' }); }),
    synchronize: jest.fn(async () => undefined),
    suspend: jest.fn(() => { controller.emit({ enabled: false, status: controller.view.account ? 'paused' : 'disconnected' }); }),
    refresh: jest.fn(async () => undefined), changed: jest.fn(), resolve: jest.fn(), conflictState: jest.fn(),
  };
  mockControllers.push(controller); return controller;
}) }));

let useCloudSync: typeof import('../src/sync/react').useCloudSync;
beforeAll(() => { useCloudSync = jest.requireActual('../src/sync/react').useCloudSync; });
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  delete (globalThis as typeof globalThis & { __dailoopCloud?: unknown }).__dailoopCloud;
  mockAuths.length = 0; mockControllers.length = 0; mockOnlineListeners.length = 0;
  mockInitialAccount = mockAccount; mockSavedOptIn = false; mockPauseFailure = null;
  mockSession.snapshot = mockSnapshot();
  mockLoad.mockResolvedValue(undefined); mockPendingCredential.mockResolvedValue(null);
  mockGoogleCredential.mockResolvedValue(null); mockCopies.mockResolvedValue([]);
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => {
  delete (globalThis as typeof globalThis & { __dailoopCloud?: unknown }).__dailoopCloud;
  jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
});
async function flush() { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); }
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function mounted() {
  const hook = await renderHook(() => useCloudSync(mockSession.snapshot, 'es'));
  await flush(); return hook;
}

test('remounts reuse one auth/runtime and detach the old controller host', async () => {
  const first = await mounted();
  const auth = mockAuths[0]; const controller = mockControllers[0];
  await first.unmount();
  expect(controller.suspend).toHaveBeenCalledTimes(1);
  const second = await mounted();
  expect(mockAuths).toHaveLength(1); expect(mockControllers).toHaveLength(1);
  expect(mockAuths[0]).toBe(auth); expect(mockControllers[0]).toBe(controller);
  expect(auth.load).toHaveBeenCalledTimes(2);
  await act(async () => { await second.result.current.actions.signOut(); });
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  expect(second.result.current.view.account).toBeNull();
  await second.unmount();
});

test('logout still clears auth and disconnects when saving pause fails', async () => {
  mockSavedOptIn = true;
  const hook = await mounted();
  mockPauseFailure = new Error('No se pudieron guardar las preferencias de sincronización.');
  await act(async () => { await expect(hook.result.current.actions.signOut()).rejects.toThrow('No se pudieron guardar'); });
  expect(mockControllers[0].pause).toHaveBeenCalledTimes(1);
  expect(mockAuths[0].signOut).toHaveBeenCalledTimes(1);
  expect(mockControllers[0].setAccount).toHaveBeenLastCalledWith(null);
  expect(hook.result.current.view.account).toBeNull();
  expect(hook.result.current.view.enabled).toBe(false);
  await hook.unmount();
});

test('unmount during cache loading never exchanges a pending credential or publishes an account', async () => {
  const loading = deferred<void>(); mockLoad.mockReturnValue(loading.promise);
  mockPendingCredential.mockResolvedValue({ kind: 'access_token', token: 'fixture-credential' });
  const hook = await renderHook(() => useCloudSync(mockSession.snapshot, 'es'));
  await hook.unmount();
  loading.resolve(); await flush();
  expect(mockPendingCredential).not.toHaveBeenCalled();
  expect(mockAuths[0].signIn).not.toHaveBeenCalled();
  expect(mockControllers[0].setAccount).not.toHaveBeenCalled();
});

test('unmount during redirect consumption never exchanges the late credential', async () => {
  const pending = deferred<{ kind: 'access_token'; token: string } | null>();
  mockPendingCredential.mockReturnValue(pending.promise);
  const hook = await renderHook(() => useCloudSync(mockSession.snapshot, 'es'));
  await flush(); expect(mockPendingCredential).toHaveBeenCalledTimes(1);
  await hook.unmount(); pending.resolve({ kind: 'access_token', token: 'fixture-late-credential' }); await flush();
  expect(mockAuths[0].signIn).not.toHaveBeenCalled();
  expect(mockControllers[0].setAccount).not.toHaveBeenCalled();
});

test.each([false, true])('startup auto-sync obeys the saved explicit opt-in: %p', async optedIn => {
  mockSavedOptIn = optedIn;
  const hook = await mounted();
  expect(mockAuths[0].signIn).not.toHaveBeenCalled();
  expect(mockControllers[0].enable).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(15_000); });
  expect(mockControllers[0].synchronize).toHaveBeenCalledTimes(optedIn ? 1 : 0);
  expect(mockSubscribeOnline).toHaveBeenCalledTimes(optedIn ? 1 : 0);
  await hook.unmount();
});

test('an absent account never auto-syncs even with a saved device preference', async () => {
  mockInitialAccount = null; mockSavedOptIn = true;
  const hook = await mounted();
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(hook.result.current.view.account).toBeNull();
  expect(mockControllers[0].synchronize).not.toHaveBeenCalled();
  expect(mockSubscribeOnline).not.toHaveBeenCalled();
  await hook.unmount();
});

test('online subscriptions exist only while enabled and group reconnect signals into one sync', async () => {
  const hook = await mounted();
  expect(mockSubscribeOnline).not.toHaveBeenCalled();
  await act(async () => { await hook.result.current.actions.enable(); });
  expect(mockSubscribeOnline).toHaveBeenCalledTimes(1);
  await act(async () => { mockOnlineListeners[0](); mockOnlineListeners[0](); jest.advanceTimersByTime(15_000); });
  expect(mockControllers[0].synchronize).toHaveBeenCalledTimes(1);
  await act(async () => { await hook.result.current.actions.pause(); });
  expect(mockRemoveOnline).toHaveBeenCalledTimes(1);
  await act(async () => { mockOnlineListeners[0](); jest.advanceTimersByTime(15_000); });
  expect(mockControllers[0].synchronize).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

test('recovery copies never show the previous account while a new account query is pending or fails', async () => {
  const copiesA: RecoveryCopy[] = [{ version: 'a'.repeat(64), activities: 2, entries: 5, createdAt: Date.now() }];
  const pendingB = deferred<RecoveryCopy[]>();
  mockCopies.mockImplementation(uid => uid === 'user-a' ? Promise.resolve(copiesA) : pendingB.promise);
  const hook = await mounted();
  expect(hook.result.current.view.recoveryCopies).toEqual(copiesA);
  const accountB = { ...mockAccount, uid: 'user-b', email: 'B@example.test' };
  await act(async () => { mockAuths[0].account = accountB; await mockControllers[0].setAccount(accountB); });
  expect(hook.result.current.view.account?.uid).toBe('user-b');
  expect(hook.result.current.view.recoveryCopies).toEqual([]);
  pendingB.reject(new Error('fixture-storage-unavailable')); await flush();
  expect(hook.result.current.view.recoveryCopies).toEqual([]);
  await hook.unmount();
});

test('a credential returned after entering demo is not exchanged', async () => {
  const pending = deferred<{ kind: 'id_token'; token: string } | null>();
  mockGoogleCredential.mockReturnValue(pending.promise);
  const hook = await mounted();
  let signingIn!: Promise<void>;
  await act(async () => { signingIn = hook.result.current.actions.signIn(); });
  mockSession.snapshot = { ...mockSession.snapshot, mode: 'demo' };
  await act(async () => { pending.resolve({ kind: 'id_token', token: 'fixture-late-google' }); await signingIn; });
  expect(mockAuths[0].signIn).not.toHaveBeenCalled();
  await hook.unmount();
});

test('retired Google picker callbacks cannot connect an account after unmount', async () => {
  const pending = deferred<{ kind: 'id_token'; token: string } | null>();
  mockGoogleCredential.mockReturnValue(pending.promise);
  const hook = await mounted();
  let signingIn!: Promise<void>;
  await act(async () => { signingIn = hook.result.current.actions.signIn(); });
  await hook.unmount();
  pending.resolve({ kind: 'id_token', token: 'fixture-retired-google' }); await signingIn;
  expect(mockAuths[0].signIn).not.toHaveBeenCalled();
});
