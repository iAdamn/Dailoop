import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notificationPrefix, type PlannedNotification } from './notificationPlan';

const channelId = 'dailoop-reminders';
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

async function prepareChannel() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(channelId, {
    name: 'Recordatorios y rachas', importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default', enableVibrate: false, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export function useLocalNotifications(onOpen: (data: unknown) => void) {
  const [status, setStatus] = useState('undetermined');
  const live = useRef(true);
  const open = useRef(onOpen);
  useLayoutEffect(() => { open.current = onOpen; }, [onOpen]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  useEffect(() => {
    const revisions = generation;
    live.current = true;
    const refresh = () => { void Notifications.getPermissionsAsync().then(permission => { if (live.current) setStatus(permission.granted ? 'granted' : permission.status); }).catch(() => { if (live.current) setStatus('error'); }); };
    refresh();
    const receive = (response: Notifications.NotificationResponse) => {
      open.current(response.notification.request.content.data);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    const response = Notifications.addNotificationResponseReceivedListener(receive);
    void Notifications.getLastNotificationResponseAsync().then(value => { if (value && live.current) receive(value); }).catch(() => undefined);
    const active = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { live.current = false; revisions.current++; response.remove(); active.remove(); };
  }, []);
  const request = useCallback(async () => {
    try {
      await prepareChannel();
      const current = await Notifications.getPermissionsAsync();
      if (!current.granted && !current.canAskAgain) { await Linking.openSettings(); return; }
      const permission = await Notifications.requestPermissionsAsync();
      if (live.current) setStatus(permission.granted ? 'granted' : permission.status);
    } catch { if (live.current) setStatus('error'); }
  }, []);
  const synchronize = useCallback((plan: PlannedNotification[]) => {
    const revision = ++generation.current;
    const work = async () => {
      if (!live.current || revision !== generation.current) return;
      const permission = await Notifications.getPermissionsAsync();
      const desired = new Map((permission.granted ? plan : []).map(item => [item.identifier, item]));
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const existing = new Map(scheduled.filter(item => item.identifier.startsWith(notificationPrefix)).map(item => [item.identifier, item]));
      for (const id of existing.keys()) {
        if (revision !== generation.current) return;
        if (!desired.has(id)) await Notifications.cancelScheduledNotificationAsync(id);
      }
      const confirmed = () => { if (live.current && revision === generation.current) setStatus(permission.granted ? 'granted' : permission.status); };
      if (!desired.size) { confirmed(); return; }
      await prepareChannel();
      for (const item of desired.values()) {
        if (!live.current || revision !== generation.current) return;
        const signature = JSON.stringify(item);
        if (existing.get(item.identifier)?.content.data?.dailoopSignature === signature) continue;
        if (existing.has(item.identifier)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
        if (!live.current || revision !== generation.current) return;
        // Date triggers are persisted by Expo and restored by its boot receiver.
        // No push token, remote endpoint, or activity completion runs here.
        await Notifications.scheduleNotificationAsync({ identifier: item.identifier,
          content: { title: item.title, body: item.body, sound: 'default', data: { ...item.data, dailoopSignature: signature } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(item.fireAtMs), channelId },
        });
      }
      confirmed();
    };
    const pending = queue.current.then(work, work);
    queue.current = pending.catch(() => undefined);
    return pending.catch(() => { if (live.current && revision === generation.current) setStatus('error'); });
  }, []);
  return { status, request, synchronize };
}
