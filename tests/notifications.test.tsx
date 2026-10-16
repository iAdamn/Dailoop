import { AppState, Linking, Platform, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { useLocalNotifications } from '../src/infrastructure/notifications.native';
import type { PlannedNotification } from '../src/infrastructure/notificationPlan';

// This boundary fake exercises permission/queue/lifecycle contracts. It does
// not represent Android delivery, process death, boot or hardware reception.
type Scheduled = { identifier: string; content: { data?: Record<string, unknown> }; trigger?: Notifications.NotificationTriggerInput };
const mockScheduled = new Map<string, Scheduled>();
let mockReceive: ((response: Notifications.NotificationResponse) => void) | undefined;
const mockRemoveResponse = jest.fn();
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 }, AndroidNotificationVisibility: { PRIVATE: 0 }, SchedulableTriggerInputTypes: { DATE: 'date', WEEKLY: 'weekly' },
  setNotificationCategoryAsync: jest.fn(async () => undefined), setNotificationHandler: jest.fn(), setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(), cancelScheduledNotificationAsync: jest.fn(), scheduleNotificationAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null), clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn((receive: (response: Notifications.NotificationResponse) => void) => {
    mockReceive = receive; return { remove: mockRemoveResponse };
  }),
}));

const NOW = Date.parse('2026-10-14T17:00:00Z');
function planned(suffix = 'r:one:0', fireAtMs = NOW + 60_000): PlannedNotification {
  return { identifier: `dailoop:db:${suffix}`, fireAtMs, title: '📖 Leer', body: 'Es el momento que elegiste.',
    data: { databaseId: 'db', activityId: 'activity', reminderId: 'one', kind: 'reminder' } };
}
function permission(granted: boolean): Notifications.NotificationPermissionsStatus {
  return { granted, status: granted ? 'granted' : 'denied', canAskAgain: true, expires: 'never' } as Notifications.NotificationPermissionsStatus;
}
function response(data: Record<string, unknown>, identifier = 'dailoop:db:r:one:0'): Notifications.NotificationResponse {
  return { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { date: NOW, request: {
    identifier, content: { title: null, subtitle: null, body: null, sound: null, data }, trigger: { type: 'unknown' },
  } } } as Notifications.NotificationResponse;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

let onAppState: (state: AppStateStatus) => void;
const removeAppState = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); mockScheduled.clear(); mockReceive = undefined;
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { onAppState = listener; return { remove: removeAppState }; });
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(true));
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue(permission(true));
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockImplementation(async () => [...mockScheduled.values()] as Notifications.NotificationRequest[]);
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async id => { mockScheduled.delete(id); });
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async request => {
    if (!request.identifier) throw new Error('Test requires explicit identifier');
    mockScheduled.set(request.identifier, { identifier: request.identifier, content: request.content, trigger: request.trigger });
    return request.identifier;
  });
});
afterEach(() => { jest.restoreAllMocks(); });

test('mounting and reconciling never ask permission; only the explicit request does', async () => {
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  expect(result.current.status).toBe('granted');
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  await act(async () => { await result.current.synchronize([planned()]); });
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.request(); });
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

test('denied notifications cancel only app-owned pending requests and leave the API usable', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(false));
  mockScheduled.set('dailoop:old-db:r:old:0', { identifier: 'dailoop:old-db:r:old:0', content: {} });
  mockScheduled.set('other-library:keep', { identifier: 'other-library:keep', content: {} });
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  await act(async () => { await result.current.synchronize([planned()]); });
  expect(result.current.status).toBe('denied');
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('dailoop:old-db:r:old:0');
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('other-library:keep');
  expect([...mockScheduled.keys()]).toEqual(['other-library:keep']);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  await act(async () => { await result.current.request(); });
  expect(result.current.status).toBe('granted');
});

test('permanently denied permission opens Android settings only after explicit action and does not re-request OS permission', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ ...permission(false), canAskAgain: false });
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  expect(result.current.status).toBe('denied');
  expect(Linking.openSettings).not.toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  await act(async () => { await result.current.request(); });
  expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(result.current.status).toBe('denied');
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(true));
  await act(async () => { onAppState('active'); });
  expect(result.current.status).toBe('granted');
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('an unchanged plan is stable; changing one item replaces only that request', async () => {
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  const first = planned(), second = planned('r:two:30', NOW + 120_000);
  await act(async () => { await result.current.synchronize([first, second]); });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  await act(async () => { await result.current.synchronize([first, second]); });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  const changed = { ...first, fireAtMs: NOW + 180_000 };
  await act(async () => { await result.current.synchronize([changed, second]); });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(first.identifier);
  expect(mockScheduled.get(first.identifier)?.trigger).toEqual({type:'date',date:new Date(NOW+180_000),channelId:'dailoop-reminders-sound-v070'});
  expect(mockScheduled.get(second.identifier)?.trigger).toEqual({type:'date',date:new Date(NOW+120_000),channelId:'dailoop-reminders-sound-v070'});
});

test('removing a plan cancels owned identifiers across databases without touching unrelated libraries', async () => {
  mockScheduled.set('dailoop:previous-db:s:old', { identifier: 'dailoop:previous-db:s:old', content: {} });
  mockScheduled.set('external:alarm', { identifier: 'external:alarm', content: {} });
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  await act(async () => { await result.current.synchronize([planned()]); });
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('dailoop:previous-db:s:old');
  await act(async () => { await result.current.synchronize([]); });
  expect([...mockScheduled.keys()]).toEqual(['external:alarm']);
});

test('a superseded queued plan cannot schedule an old alarm after its replacement cancellation awaits', async () => {
  const old = planned();
  mockScheduled.set(old.identifier, { identifier: old.identifier, content: { data: { dailoopSignature: 'previous revision' } } });
  const blocked = deferred<void>(), entered = deferred<void>();
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementationOnce(async id => {
    entered.resolve(); await blocked.promise; mockScheduled.delete(id);
  });
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  let oldWork!: Promise<unknown>, newWork!: Promise<unknown>;
  await act(async () => { oldWork = result.current.synchronize([old]); await entered.promise; });
  await act(async () => { newWork = result.current.synchronize([]); });
  await act(async () => { blocked.resolve(); await Promise.all([oldWork, newWork]); });
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(mockScheduled.size).toBe(0);
});

test('a newer plan wins while an earlier permission check is still pending', async () => {
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  const blocked = deferred<Notifications.NotificationPermissionsStatus>(), entered = deferred<void>();
  jest.mocked(Notifications.getPermissionsAsync).mockImplementationOnce(() => { entered.resolve(); return blocked.promise; });
  let oldWork!: Promise<unknown>, newWork!: Promise<unknown>;
  await act(async () => { oldWork = result.current.synchronize([planned('r:old:0')]); await entered.promise; });
  await act(async () => { newWork = result.current.synchronize([planned('r:new:0')]); });
  await act(async () => { blocked.resolve(permission(true)); await Promise.all([oldWork, newWork]); });
  expect([...mockScheduled.keys()]).toEqual(['dailoop:db:r:new:0']);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test('cold-start and later taps only hand navigation data to the current onOpen callback', async () => {
  const cold = { databaseId: 'db', activityId: 'activity', reminderId: 'one', kind: 'reminder' };
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response(cold));
  const first = jest.fn(), latest = jest.fn();
  const { rerender, unmount } = await renderHook(({ onOpen }: { onOpen: (data: unknown) => void }) => useLocalNotifications(onOpen), { initialProps: { onOpen: first } });
  expect(first).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledWith(cold);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  await rerender({ onOpen: latest });
  const tap = { databaseId: 'db', activityId: 'another', kind: 'streak' };
  await act(async () => { mockReceive!(response(tap, 'dailoop:db:s:another:today')); });
  expect(latest).toHaveBeenCalledWith(tap);
  expect(first).toHaveBeenCalledTimes(1);
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(2);
  await unmount();
  expect(mockRemoveResponse).toHaveBeenCalledTimes(1);
  expect(removeAppState).toHaveBeenCalled();
});

test('returning to foreground refreshes permission without prompting', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(false));
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  expect(result.current.status).toBe('denied');
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(true));
  await act(async () => { onAppState('active'); });
  expect(result.current.status).toBe('granted');
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('native scheduling errors leave a retryable error status instead of throwing into app operations', async () => {
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  jest.mocked(Notifications.scheduleNotificationAsync).mockRejectedValueOnce(new Error('Native alarm unavailable'));
  await act(async () => { await result.current.synchronize([planned()]); });
  expect(result.current.status).toBe('error');
  await act(async () => { await result.current.synchronize([planned()]); });
  expect(mockScheduled.has(planned().identifier)).toBe(true);
  expect(result.current.status).toBe('granted');
});

test('successful reconciliation also clears an earlier error to denied when OS permission has been revoked', async () => {
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockRejectedValueOnce(new Error('Native query failed'));
  await act(async () => { await result.current.synchronize([planned()]); });
  expect(result.current.status).toBe('error');
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(false));
  await act(async () => { await result.current.synchronize([planned()]); });
  expect(result.current.status).toBe('denied');
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});


test('recurring plans forward the zone, elapsed lead, start boundary and skipped occurrence dates to the native trigger', async () => {
  const item: PlannedNotification = { ...planned('w:one:1:30'), weekly: { weekday: 2, hour: 9, minute: 15, zone: 'America/Bogota', leadMinutes: 30,
    startAtMs: NOW + 60_000, skipDates: ['2026-10-19'] } };
  const { result } = await renderHook(() => useLocalNotifications(jest.fn()));
  await act(async () => { await result.current.synchronize([item]); });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ identifier: item.identifier,
    trigger: { type: 'weekly', weekday: 2, hour: 9, minute: 15, channelId: 'dailoop-reminders-sound-v070', dailoopZone: 'America/Bogota',
      dailoopLeadMinutes: 30, dailoopStartAtMs: NOW + 60_000, dailoopSkipDates: ['2026-10-19'] } }));
  await act(async () => { await result.current.synchronize([item]); });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.synchronize([]); });
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(item.identifier);
});
