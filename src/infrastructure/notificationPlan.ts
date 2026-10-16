import { activityStreaks, addCalendarDays, canonicalTimeZone, deriveReminders, getPlanning, isReminderOccurrence, localDate, localDateTimeCandidates, nextReminderDueAt, recurrenceDueAt, selectActivities } from '../domain';
import type { DomainState } from '../domain';
import { translate, type AppLanguage } from '../i18n/core';

export interface PlannedNotification {
  identifier: string; fireAtMs: number; title: string; body: string;
  weekly?: { weekday: number; hour: number; minute: number; zone: string; leadMinutes: number; startAtMs: number; skipDates: string[] };
  data: { databaseId: string; activityId: string; reminderId?: string; kind: 'reminder' | 'streak'; dueAtMs?: number; scheduledAtMs?: number; weeklyOccurrence?: boolean; recurrenceWeekday?: number; leadMinutes?: number; recurrenceAnchorAtMs?: number; recurrenceZone?: string; recurrenceHour?: number; recurrenceMinute?: number };
}
export const notificationPrefix = 'dailoop:';

/** Pure local plan. Showing a notification has no domain command or write path. */
export function notificationPlan(state: DomainState, nowMs: number, language: AppLanguage = 'es'): PlannedNotification[] {
  const t = (source: string, params: Record<string, string | number> = {}) => translate(language, source, params);
  const reminderBody = (minutes: number) => minutes === 0 ? t('Es el momento que elegiste para esta actividad.') : minutes < 60 ? t(language !== 'es' && minutes === 1 ? 'Tu actividad está prevista para dentro de 1 minuto.' : 'Tu actividad está prevista para dentro de {minutes} minutos.', { minutes }) : t(language !== 'es' && minutes === 60 ? 'Tu actividad está prevista para dentro de 1 hora.' : 'Tu actividad está prevista para dentro de {hours} horas.', { hours: Number((minutes / 60).toFixed(2)) });
  const activities = new Map(selectActivities(state).map(activity => [activity.id, activity]));
  const result: PlannedNotification[] = [];
  const databaseId = state.meta.databaseId;
  const planning = getPlanning(state);
  const reminders = deriveReminders(state, nowMs);
  const completedByReminder = new Map<string, number[]>();
  for(const reminder of reminders) if(reminder.status==='done' && reminder.recurrence) {
    const dates=completedByReminder.get(reminder.id) ?? [];
    dates.push(reminder.dueAtMs); completedByReminder.set(reminder.id,dates);
  }
  for (const reminder of reminders.filter(item => !item.recurrence || item.scheduledAtMs !== undefined)) {
    const activity = activities.get(reminder.activityId);
    if (!activity || !reminder.notifications || (reminder.status !== 'pending' && reminder.status !== 'overdue')) continue;
    for (const minutes of reminder.scheduledAtMs !== undefined ? [0] : reminder.leadMinutes) {
      const fireAtMs = (reminder.scheduledAtMs ?? reminder.dueAtMs) - minutes * 60_000;
      if (fireAtMs <= nowMs) continue;
      result.push({ identifier: `${notificationPrefix}${databaseId}:r:${reminder.id}:${reminder.dueAtMs}:${minutes}`, fireAtMs,
        title: `${activity.emoji} ${activity.name}`, body: reminderBody(minutes),
        data: { databaseId, activityId: activity.id, reminderId: reminder.id, kind: 'reminder', dueAtMs: reminder.dueAtMs, ...(reminder.scheduledAtMs !== undefined ? { scheduledAtMs: reminder.scheduledAtMs } : {}) } });
    }
  }
  for (const reminder of planning.reminders) {
    const recurrence = reminder.recurrence;
    const activity = activities.get(reminder.activityId);
    if (!recurrence || !activity || reminder.isArchived || !reminder.notifications) continue;
    const today = localDate(nowMs, recurrence.zone);
    const actionDates = (planning.occurrenceActions ?? []).filter(action => action.reminderId === reminder.id && isReminderOccurrence(reminder, action.dueAtMs)).map(action => action.dueAtMs);
    const skipDates = [...new Set([...(completedByReminder.get(reminder.id) ?? []), ...actionDates]
      .map(dueAtMs => localDate(dueAtMs, recurrence.zone)).filter(date => date >= today))].sort();
    const skipped = new Set(skipDates);
    for (const weekday of recurrence.weekdays) for (const minutes of reminder.leadMinutes) {
      const after = nowMs + minutes * 60_000;
      if (after > 253_402_300_799_999) continue;
      const rule = { dueAtMs: reminder.dueAtMs, recurrence: { ...recurrence, weekdays: [weekday] } };
      let due = nextReminderDueAt(rule, after);
      for (let attempt = 0; due !== null && skipped.has(localDate(due, recurrence.zone)) && attempt <= skipped.size; attempt++) due = nextReminderDueAt(rule, due);
      if (due === null) continue;
      const expoWeekday = weekday % 7 + 1;
      result.push({ identifier: `${notificationPrefix}${databaseId}:w:${reminder.id}:${weekday}:${minutes}`,
        fireAtMs: due - minutes * 60_000, title: `${activity.emoji} ${activity.name}`,
        body: reminderBody(minutes),
        weekly: { weekday: expoWeekday, hour: recurrence.hour, minute: recurrence.minute, zone: canonicalTimeZone(recurrence.zone),
          leadMinutes: minutes, startAtMs: reminder.dueAtMs, skipDates },
        data: { databaseId, activityId: activity.id, reminderId: reminder.id, kind: 'reminder', dueAtMs: due,
          weeklyOccurrence: true, recurrenceWeekday: weekday, leadMinutes: minutes, recurrenceAnchorAtMs: reminder.dueAtMs,
          recurrenceZone: canonicalTimeZone(recurrence.zone), recurrenceHour: recurrence.hour, recurrenceMinute: recurrence.minute } });
    }
  }
  const alerts = planning.streakAlerts;
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
        title: `${activity.emoji} ${t('Cuida tu racha de {days} días', { days: streak.days })}`, body: t('Recuerda {activity} antes de terminar el día.', { activity: language === 'es' ? activity.name.toLocaleLowerCase('es') : activity.name }),
        data: { databaseId, activityId, kind: 'streak' } });
    }
  }
  return result.sort((a, b) => a.fireAtMs - b.fireAtMs || a.identifier.localeCompare(b.identifier));
}

/** Resolve against the delivery instant, never the later notification tap time.
 * Series metadata rejects notifications left over from an edited schedule. */
export function resolveNotificationOccurrence(data: unknown, deliveredAtMs: number, state: DomainState): { reminderId: string; dueAtMs: number } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Number.isSafeInteger(deliveredAtMs) || deliveredAtMs < 0 || deliveredAtMs > 253_402_300_799_999) return null;
  const value = data as Record<string, unknown>;
  if (value.kind !== 'reminder' || value.databaseId !== state.meta.databaseId || typeof value.reminderId !== 'string') return null;
  const reminder = getPlanning(state).reminders.find(item => item.id === value.reminderId && item.activityId === value.activityId && !item.isArchived);
  if (!reminder || !selectActivities(state).some(item => item.id === reminder.activityId)) return null;
  if (value.weeklyOccurrence === true) {
    const recurrence = reminder.recurrence;
    const lead = value.leadMinutes;
    if (!recurrence || value.recurrenceAnchorAtMs !== reminder.dueAtMs || value.recurrenceZone !== canonicalTimeZone(recurrence.zone) || value.recurrenceHour !== recurrence.hour || value.recurrenceMinute !== recurrence.minute || !Number.isSafeInteger(lead) || !reminder.leadMinutes.includes(lead as number) || !recurrence.weekdays.includes(value.recurrenceWeekday as number)) return null;
    const target = deliveredAtMs + (lead as number) * 60_000;
    if (target > 253_402_300_799_999) return null;
    const date = localDate(target, recurrence.zone);
    const due = recurrenceDueAt(reminder, date);
    const day = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    if (due === null || day !== value.recurrenceWeekday) return null;
    // Broadly delayed deliveries cannot safely identify an occurrence from wall
    // time alone. Keep those as open-only notifications rather than guessing.
    if (Math.abs(due - (lead as number) * 60_000 - deliveredAtMs) > 2 * 3_600_000) return null;
    return { reminderId: reminder.id, dueAtMs: due };
  }
  if (!Number.isSafeInteger(value.dueAtMs) || (value.dueAtMs as number) < 0 || (value.dueAtMs as number) > 253_402_300_799_999 || !isReminderOccurrence(reminder, value.dueAtMs as number)) return null;
  const action = getPlanning(state).occurrenceActions?.find(item => item.reminderId === reminder.id && item.dueAtMs === value.dueAtMs);
  if (action?.skipped || (action?.snoozedUntilMs ?? undefined) !== value.scheduledAtMs) return null;
  return { reminderId: reminder.id, dueAtMs: value.dueAtMs as number };
}
