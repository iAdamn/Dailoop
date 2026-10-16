import { pendingReminderOccurrence, type DomainState } from '../domain';
import { session } from './session';
import { notificationPlan, resolveNotificationOccurrence } from './notificationPlan';
import { synchronizeNotificationPlan, dismissNativeNotification } from './notifications';
import { presentationPreferences, sensoryPreferences } from './preferences';
import { NativeActionUnavailableError, type NativeAction } from './widgetActions';

/** Uses the same serialized SQLite writer as foreground controls. */
export async function processReminderAction(action: NativeAction): Promise<void> {
  const store = session.store;
  const context = session.snapshot;
  if (!store || !context.state || context.mode !== 'personal' || context.readOnly || context.reloading || context.recoveryRequired) throw new Error('Native reminder unavailable');
  const guard = (state: DomainState) => {
    if (state.meta.databaseId !== action.databaseId) throw new NativeActionUnavailableError('Native dataset changed');
    if (session.store !== store || session.snapshot.mode !== 'personal'
      || session.snapshot.readOnly || session.snapshot.reloading || session.snapshot.recoveryRequired) throw new Error('Native dataset changed');
  };
  const state = await store.snapshot(); guard(state);
  const replayed = state.operations.some(row => row.id === action.id) || state.planning?.events.some(row => row.id === action.id);
  if (!replayed) {
    if(action.kind==='reminder-snooze' && action.occurredAtMs + action.minutes! * 60_000 <= Date.now())throw new NativeActionUnavailableError('Native snooze expired');
    const occurrence = resolveNotificationOccurrence({ ...action, kind: 'reminder' }, action.deliveredAtMs ?? action.occurredAtMs, state);
    if (!occurrence) throw new NativeActionUnavailableError('Native occurrence unavailable');
    const checked = (current: DomainState) => { guard(current); try { pendingReminderOccurrence(current, occurrence.reminderId, occurrence.dueAtMs, Date.now()); } catch { throw new NativeActionUnavailableError('Native occurrence unavailable'); } };
    if (action.kind === 'reminder-done') await store.completeReminder(occurrence.reminderId, action.id, occurrence.dueAtMs, checked);
    else if (action.kind === 'reminder-snooze') await store.dispatchPlanning({ type: 'snoozeReminderOccurrence', ...occurrence, snoozedUntilMs: action.occurredAtMs + action.minutes! * 60_000 }, action.id, checked);
    else if (action.kind === 'reminder-skip') await store.dispatchPlanning({ type: 'skipReminderOccurrence', ...occurrence }, action.id, checked);
    else throw new Error('Native action unavailable');
  }
  await session.refresh();
  if(action.notificationIdentifier)await dismissNativeNotification(action.notificationIdentifier).catch(()=>undefined);
}
export async function reconcileNativeNotifications():Promise<void> {
  const prefs = await presentationPreferences.load();
  const next = session.snapshot.state;
  if (next && session.snapshot.mode === 'personal' && !session.snapshot.readOnly)
    await synchronizeNotificationPlan(notificationPlan(next, Date.now(), prefs.language ?? 'es'), prefs.language ?? 'es', sensoryPreferences(prefs).notificationSounds);
}
