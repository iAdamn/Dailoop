import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notificationPrefix, type PlannedNotification } from './notificationPlan';
import { translate, type AppLanguage } from '../i18n/core';

const actionCategory = 'dailoop.v070.actions';
export async function dismissNativeNotification(identifier:string):Promise<void>{if(identifier.startsWith(notificationPrefix))await Notifications.dismissNotificationAsync(identifier);}
let notificationSound = true;
let schedulingQueue: Promise<unknown> = Promise.resolve();
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: notificationSound, shouldSetBadge: false }) });

async function prepareChannel(language: AppLanguage, sound = true) {
  const channelId = sound ? 'dailoop-reminders-sound-v070' : 'dailoop-reminders-silent-v070';
  await Notifications.setNotificationCategoryAsync(actionCategory, [
    {identifier:'dailoop.v070.done',buttonTitle:translate(language,'Hecho'),options:{opensAppToForeground:false}},
    {identifier:'dailoop.v070.snooze30',buttonTitle:translate(language,'Posponer 30 min'),options:{opensAppToForeground:false}},
    {identifier:'dailoop.v070.skip',buttonTitle:translate(language,'Omitir'),options:{opensAppToForeground:false}},
  ]);
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(channelId, {
    name: translate(language, 'Recordatorios y rachas'), importance: Notifications.AndroidImportance.DEFAULT,
    sound: sound ? 'default' : null, enableVibrate: false, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  return channelId;
}

export function useLocalNotifications(onOpen: (data: unknown) => void, language: AppLanguage = 'es', sound = true) {
  const [status, setStatus] = useState('undetermined');
  const live = useRef(true);
  const open = useRef(onOpen);
  useLayoutEffect(() => { open.current = onOpen; }, [onOpen]);
  useEffect(()=>{notificationSound=sound;},[sound]);
  const generation = useRef(0);
  useEffect(() => {
    const revisions = generation;
    live.current = true;
    const refresh = () => { void Notifications.getPermissionsAsync().then(permission => { if (live.current) setStatus(permission.granted ? 'granted' : permission.status); }).catch(() => { if (live.current) setStatus('error'); }); };
    refresh();
    const receive = (response: Notifications.NotificationResponse) => {
      if (!response.actionIdentifier?.startsWith('dailoop.v070.')) open.current(response.notification.request.content.data);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    const response = Notifications.addNotificationResponseReceivedListener(receive);
    void Notifications.getLastNotificationResponseAsync().then(value => { if (value && live.current) receive(value); }).catch(() => undefined);
    const active = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { live.current = false; revisions.current++; response.remove(); active.remove(); };
  }, []);
  const request = useCallback(async () => {
    try {
      await prepareChannel(language, sound);
      const current = await Notifications.getPermissionsAsync();
      if (!current.granted && !current.canAskAgain) { await Linking.openSettings(); return; }
      const permission = await Notifications.requestPermissionsAsync();
      if (live.current) setStatus(permission.granted ? 'granted' : permission.status);
    } catch { if (live.current) setStatus('error'); }
  }, [language, sound]);
  const synchronize = useCallback((plan: PlannedNotification[]) => {
    const revision = ++generation.current;
    const pending = synchronizeNotificationPlan(plan, language, sound, () => live.current && revision === generation.current, value => {if(live.current && revision === generation.current)setStatus(value);});
    return pending.catch(() => { if (live.current && revision === generation.current) setStatus('error'); });
  }, [language, sound]);
  return { status, request, synchronize };
}

/** Shared queue prevents cold widget actions racing foreground rescheduling. */
export function synchronizeNotificationPlan(plan:PlannedNotification[],language:AppLanguage='es',sound=true,allowed:()=>boolean=()=>true,onPermission?:(value:string)=>void):Promise<void> {
  const work = async () => {
      if (!allowed()) return;
      const permission = await Notifications.getPermissionsAsync();
      const desired = new Map((permission.granted ? plan : []).map(item => [item.identifier, item]));
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const existing = new Map(scheduled.filter(item => item.identifier.startsWith(notificationPrefix)).map(item => [item.identifier, item]));
      for (const id of existing.keys()) {
        if (!allowed()) return;
        if (!desired.has(id)) await Notifications.cancelScheduledNotificationAsync(id);
      }
      const confirmed = () => onPermission?.(permission.granted ? 'granted' : permission.status);
      const channelId = permission.granted ? await prepareChannel(language, sound) : '';
      notificationSound = sound;
      if (!desired.size) { confirmed(); return; }
      for (const item of desired.values()) {
        if (!allowed()) return;
        const signature = JSON.stringify({item,sound,actionCategory});
        if (existing.get(item.identifier)?.content.data?.dailoopSignature === signature) continue;
        if (existing.has(item.identifier)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
        if (!allowed()) return;
        // Date and zoned weekly triggers persist through Expo and its boot receiver.
        // No push token, remote endpoint, or activity completion runs here.
        await Notifications.scheduleNotificationAsync({ identifier: item.identifier,
          content: { title: item.title, body: item.body, sound: sound ? 'default' : false, ...(item.data.kind === 'reminder' ? {categoryIdentifier:actionCategory} : {}), data: { ...item.data, dailoopSignature: signature } },
          trigger: item.weekly ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: item.weekly.weekday, hour: item.weekly.hour, minute: item.weekly.minute, channelId,
            dailoopZone: item.weekly.zone, dailoopLeadMinutes: item.weekly.leadMinutes,
            dailoopStartAtMs: item.weekly.startAtMs, dailoopSkipDates: item.weekly.skipDates,
          } : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(item.fireAtMs), channelId },
        });
      }
      confirmed();
    };
  const pending=schedulingQueue.then(work,work);schedulingQueue=pending.catch(()=>undefined);return pending;
}
