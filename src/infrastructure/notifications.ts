import { useCallback } from 'react';
import type { PlannedNotification } from './notificationPlan';
import type { AppLanguage } from '../i18n/core';
export async function dismissNativeNotification(_identifier:string):Promise<void>{}

/** The preview edits real reminder data; native delivery is a phone capability. */
export function useLocalNotifications(_onOpen: (data: unknown) => void, _language: AppLanguage = 'es', _sound = true) {
  const request = useCallback(async () => undefined, []);
  const synchronize = useCallback(async (_plan: PlannedNotification[]) => undefined, []);
  return { status: 'unsupported', request, synchronize };
}

export async function synchronizeNotificationPlan(_plan:PlannedNotification[],_language:AppLanguage='es',_sound=true):Promise<void> {}
