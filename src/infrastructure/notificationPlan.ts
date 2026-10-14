import { activityStreaks, addCalendarDays, deriveReminders, getPlanning, localDate, localDateTimeCandidates, selectActivities } from '../domain';
import type { DomainState } from '../domain';

export interface PlannedNotification {
  identifier: string; fireAtMs: number; title: string; body: string;
  data: { databaseId: string; activityId: string; reminderId?: string; kind: 'reminder' | 'streak' };
}
export const notificationPrefix = 'dailoop:';

/** Pure local plan. Showing a notification has no domain command or write path. */
export function notificationPlan(state: DomainState, nowMs: number): PlannedNotification[] {
  const activities = new Map(selectActivities(state).map(activity => [activity.id, activity]));
  const result: PlannedNotification[] = [];
  const databaseId = state.meta.databaseId;
  for (const reminder of deriveReminders(state, nowMs)) {
    const activity = activities.get(reminder.activityId);
    if (!activity || !reminder.notifications || reminder.status === 'done' || reminder.status === 'archived') continue;
    for (const minutes of reminder.leadMinutes) {
      const fireAtMs = reminder.dueAtMs - minutes * 60_000;
      if (fireAtMs <= nowMs) continue;
      result.push({ identifier: `${notificationPrefix}${databaseId}:r:${reminder.id}:${minutes}`, fireAtMs,
        title: `${activity.emoji} ${activity.name}`, body: minutes === 0 ? 'Es el momento que elegiste para esta actividad.' : `Tu actividad está prevista para dentro de ${minutes < 60 ? `${minutes} minutos` : `${Number((minutes / 60).toFixed(2))} horas`}.`,
        data: { databaseId, activityId: activity.id, reminderId: reminder.id, kind: 'reminder' } });
    }
  }
  const alerts = getPlanning(state).streakAlerts;
  if (alerts.enabled) {
    const today = localDate(nowMs, state.settings.zone);
    for (const [activityId, streak] of activityStreaks(state, nowMs)) {
      const activity = activities.get(activityId);
      if (!activity || streak.days < 2) continue;
      const day = streak.recordedToday ? addCalendarDays(today, 1) : today;
      // Select the first future instance of a folded wall time. A nonexistent
      // wall time advances to the next real minute rather than using UTC hours.
      let fireAtMs: number | undefined;
      for (let advance = 0; advance <= 180 && fireAtMs === undefined; advance++) {
        const minuteOfDay = alerts.hour * 60 + alerts.minute + advance;
        const targetDay = addCalendarDays(day, Math.floor(minuteOfDay / 1440));
        const clockMinute = minuteOfDay % 1440;
        const wall = `${targetDay}T${String(Math.floor(clockMinute / 60)).padStart(2, '0')}:${String(clockMinute % 60).padStart(2, '0')}:00`;
        const candidates = localDateTimeCandidates(wall, state.settings.zone);
        if (candidates.length) { fireAtMs = candidates.find(candidate => candidate > nowMs); break; }
      }
      if (fireAtMs === undefined || result.some(item => item.data.activityId === activityId && Math.abs(item.fireAtMs - fireAtMs!) < 60_000)) continue;
      result.push({ identifier: `${notificationPrefix}${databaseId}:s:${activityId}:${day}`, fireAtMs,
        title: `${activity.emoji} Cuida tu racha de ${streak.days} días`, body: `Recuerda ${activity.name.toLocaleLowerCase('es')} antes de terminar el día.`,
        data: { databaseId, activityId, kind: 'streak' } });
    }
  }
  return result.sort((a, b) => a.fireAtMs - b.fireAtMs || a.identifier.localeCompare(b.identifier));
}
