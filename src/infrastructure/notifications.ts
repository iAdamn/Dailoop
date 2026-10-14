import { useCallback } from 'react';
import type { PlannedNotification } from './notificationPlan';

/** The preview edits real reminder data; native delivery is a phone capability. */
export function useLocalNotifications(_onOpen: (data: unknown) => void) {
  const request = useCallback(async () => undefined, []);
  const synchronize = useCallback(async (_plan: PlannedNotification[]) => undefined, []);
  return { status: 'unsupported', request, synchronize };
}
