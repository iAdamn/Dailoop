import { asciiCompare, effectiveEntries, selectActivities } from './core';
import { localDate } from './time';
import { LIMITS, type CommandContext, type DerivedReminder, type DomainState, type PlanningCommand, type PlanningEvent, type PlanningState, type PlanningView, type Reminder } from './types';
import { assertId, assertTime, canonicalize, exactKeys, invariant, isRecord } from './validation';

export const PLANNING_LIMITS = { notificationsPerReminder: 16, leadMinutes: 525_600, events: LIMITS.revisions } as const;

function object(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  invariant(isRecord(value), 'invalid_planning', `${label} no es válido.`);
  exactKeys(value, keys, label);
}
function leads(value: unknown): asserts value is number[] {
  invariant(Array.isArray(value) && value.length <= PLANNING_LIMITS.notificationsPerReminder && value.every(lead => Number.isSafeInteger(lead) && lead >= 0 && lead <= PLANNING_LIMITS.leadMinutes), 'invalid_reminder_offsets', 'Elige hasta 16 avisos entre 0 y 525600 minutos antes.');
  invariant(new Set(value).size === value.length, 'duplicate_reminder_offsets', 'Los tiempos de aviso no pueden repetirse.');
}
export function validatePlanningCommand(value: unknown): asserts value is PlanningCommand {
  invariant(isRecord(value) && typeof value.type === 'string', 'invalid_planning', 'Acción de recordatorio no válida.');
  if (value.type === 'createReminder') {
    object(value, ['type', 'id', 'activityId', 'dueAtMs', 'leadMinutes', 'notifications', 'completionEntryId'], 'recordatorio');
    assertId(value.id); assertId(value.activityId); assertId(value.completionEntryId); assertTime(value.dueAtMs); leads(value.leadMinutes);
    invariant(typeof value.notifications === 'boolean', 'invalid_planning', 'La opción de avisos no es válida.');
  } else if (value.type === 'updateReminder') {
    object(value, ['type', 'reminderId', 'changes'], 'cambios de recordatorio'); assertId(value.reminderId);
    invariant(isRecord(value.changes) && Object.keys(value.changes).length > 0 && Object.keys(value.changes).every(key => ['dueAtMs', 'leadMinutes', 'notifications'].includes(key)), 'invalid_planning', 'Los cambios de recordatorio no son válidos.');
    if (Object.hasOwn(value.changes, 'dueAtMs')) assertTime(value.changes.dueAtMs);
    if (Object.hasOwn(value.changes, 'leadMinutes')) leads(value.changes.leadMinutes);
    if (Object.hasOwn(value.changes, 'notifications')) invariant(typeof value.changes.notifications === 'boolean', 'invalid_planning', 'La opción de avisos no es válida.');
  } else if (value.type === 'archiveReminder') {
    object(value, ['type', 'reminderId', 'archived'], 'archivo de recordatorio'); assertId(value.reminderId);
    invariant(typeof value.archived === 'boolean', 'invalid_planning', 'La opción de archivo no es válida.');
  } else if (value.type === 'setStreakAlerts') {
    object(value, ['type', 'enabled', 'hour', 'minute'], 'avisos de racha');
    invariant(typeof value.enabled === 'boolean' && Number.isInteger(value.hour) && (value.hour as number) >= 0 && (value.hour as number) <= 23 && Number.isInteger(value.minute) && (value.minute as number) >= 0 && (value.minute as number) <= 59, 'invalid_streak_alerts', 'Elige una hora válida para los avisos de racha.');
  } else invariant(false, 'invalid_planning', 'Acción de recordatorio no válida.');
}

interface Projection { view: PlanningView; byId: Map<string, Reminder>; completionIds: Set<string> }
interface References { activityIds: Set<string>; entries: Map<string, DomainState['entries'][number]> }
function emptyProjection(): Projection { return { view: { reminders: [], streakAlerts: { enabled: false, hour: 22, minute: 0 } }, byId: new Map(), completionIds: new Set() }; }
function project(projection: Projection, event: PlanningEvent): void {
  const { view, byId, completionIds } = projection;
  const command = event.command;
  if (command.type === 'createReminder') {
    const reminder: Reminder = { id: command.id, activityId: command.activityId, dueAtMs: command.dueAtMs, leadMinutes: [...command.leadMinutes], notifications: command.notifications, completionEntryId: command.completionEntryId, createdAtMs: event.recordedAtMs, isArchived: false };
    view.reminders.push(reminder); byId.set(reminder.id, reminder); completionIds.add(reminder.completionEntryId);
  }
  else if (command.type === 'setStreakAlerts') view.streakAlerts = { enabled: command.enabled, hour: command.hour, minute: command.minute };
  else {
    const reminder = byId.get(command.reminderId);
    invariant(reminder, 'missing_reminder', 'El recordatorio no existe.');
    if (command.type === 'updateReminder') Object.assign(reminder, command.changes, command.changes.leadMinutes ? { leadMinutes: [...command.changes.leadMinutes] } : {});
    else reminder.isArchived = command.archived;
  }
}
/** Project the independent append-only log without altering the stored events. */
export function getPlanning(state: DomainState): PlanningView {
  return planningProjection(state).view;
}
function planningProjection(state: DomainState): Projection {
  const projection = emptyProjection();
  for (const event of [...(state.planning?.events ?? [])].sort((a, b) => a.sequence - b.sequence)) project(projection, event);
  return projection;
}
function coreIds(state: DomainState): Set<string> {
  return new Set([state.meta.databaseId, ...state.activities.map(item => item.id), ...state.activityRevisions.map(item => item.id), ...state.entries.map(item => item.id), ...state.entryRevisions.map(item => item.id), ...state.operations.map(item => item.id)]);
}
function references(state: DomainState): References { return { activityIds: new Set(state.activities.map(item => item.id)), entries: new Map(state.entries.map(item => [item.id, item])) }; }
function validateEffect(refs: References, projection: Projection, event: PlanningEvent, used: Set<string>): void {
  const command = event.command;
  if (command.type === 'createReminder') {
    invariant(refs.activityIds.has(command.activityId), 'missing_activity', 'La actividad del recordatorio no existe.');
    invariant(command.dueAtMs > event.recordedAtMs, 'past_reminder', 'La fecha del recordatorio debe ser futura.');
    invariant(!used.has(command.id), 'duplicate_id', 'El identificador del recordatorio ya existe.'); used.add(command.id);
    const entry = refs.entries.get(command.completionEntryId);
    invariant(!used.has(command.completionEntryId) || (entry && entry.activityId === command.activityId && entry.createdAtMs >= event.recordedAtMs), 'duplicate_id', 'El identificador de registro del recordatorio ya existe o pertenece a otra actividad.');
    // A completion ID can later become a core entry, but it can belong to only one reminder.
    invariant(!projection.completionIds.has(command.completionEntryId), 'duplicate_id', 'El identificador de registro ya pertenece a otro recordatorio.');
    used.add(command.completionEntryId);
  } else if (command.type !== 'setStreakAlerts') {
    const reminder = projection.byId.get(command.reminderId);
    invariant(reminder, 'missing_reminder', 'El recordatorio no existe.');
    if (command.type === 'updateReminder') {
      invariant(!reminder.isArchived, 'archived_reminder', 'Restaura el recordatorio antes de editarlo.');
      if (command.changes.dueAtMs !== undefined && command.changes.dueAtMs !== reminder.dueAtMs) invariant(command.changes.dueAtMs > event.recordedAtMs, 'past_reminder', 'La nueva fecha del recordatorio debe ser futura.');
    }
  }
}

/** Validate imported planning, replay every command and reject dangling/crossed IDs. */
export function validatePlanning(state: DomainState, value: unknown = state.planning): PlanningState {
  object(value, ['events'], 'planificación');
  invariant(Array.isArray(value.events) && value.events.length <= PLANNING_LIMITS.events, 'invalid_planning', 'El historial de recordatorios no es válido.');
  const events = value.events as PlanningEvent[]; const used = coreIds(state); const sequence = new Set<number>();
  for (const event of events) {
    object(event, ['id', 'sequence', 'recordedAtMs', 'command'], 'evento de recordatorio'); assertId(event.id); assertTime(event.recordedAtMs); validatePlanningCommand(event.command);
    invariant(Number.isSafeInteger(event.sequence) && event.sequence >= 1 && !sequence.has(event.sequence), 'invalid_planning_sequence', 'Secuencia de recordatorios no válida.'); sequence.add(event.sequence);
    invariant(!used.has(event.id), 'duplicate_id', 'El identificador del evento de recordatorio ya existe.'); used.add(event.id);
  }
  const projection = emptyProjection(); const refs = references(state);
  for (const [index, event] of [...events].sort((a, b) => a.sequence - b.sequence).entries()) {
    invariant(event.sequence === index + 1, 'invalid_planning_sequence', 'La secuencia de recordatorios tiene huecos.');
    validateEffect(refs, projection, event, used); project(projection, event);
  }
  return value as unknown as PlanningState;
}

/** A replay returns the same planning reference; persistence owns committing the new event. */
export function applyPlanning(state: DomainState, command: PlanningCommand, ctx: CommandContext): PlanningState {
  validatePlanningCommand(command); assertTime(ctx.nowMs); assertId(ctx.operationId);
  const planning = state.planning ?? { events: [] };
  const previous = planning.events.find(event => event.id === ctx.operationId);
  if (previous) { invariant(canonicalize(previous.command) === canonicalize(command), 'operation_conflict', 'Esta operación ya se utilizó para otra acción.'); return planning; }
  const used = coreIds(state);
  for (const event of planning.events) {
    used.add(event.id);
    if (event.command.type === 'createReminder') { used.add(event.command.id); used.add(event.command.completionEntryId); }
  }
  invariant(!used.has(ctx.operationId), 'duplicate_id', 'El identificador de operación ya existe.'); used.add(ctx.operationId);
  invariant(planning.events.length < PLANNING_LIMITS.events, 'planning_too_large', 'El historial de recordatorios alcanzó su límite.');
  const event: PlanningEvent = { id: ctx.operationId, sequence: planning.events.length + 1, recordedAtMs: ctx.nowMs, command: JSON.parse(JSON.stringify(command)) as PlanningCommand };
  validateEffect(references(state), planningProjection(state), event, used);
  return { events: [...planning.events, event] };
}

/** One effective entry completes at most one reminder. Corrections/voids recalculate it. */
export function deriveReminders(state: DomainState, nowMs: number): DerivedReminder[] {
  assertTime(nowMs);
  const reminders = getPlanning(state).reminders.sort((a, b) => a.dueAtMs - b.dueAtMs || a.createdAtMs - b.createdAtMs || asciiCompare(a.id, b.id));
  if (!reminders.length) return [];
  const activities = new Map(selectActivities(state, { includeArchived: true }).map(activity => [activity.id, activity]));
  const entries = effectiveEntries(state).filter(entry => entry.revision.occurredAtMs <= nowMs);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const reserved = new Set(reminders.map(reminder => reminder.completionEntryId));
  const assigned = new Set<string>();
  return reminders.map(reminder => {
    const archived = reminder.isArchived || activities.get(reminder.activityId)?.isArchived === true;
    let completed = byId.get(reminder.completionEntryId);
    if (completed?.activityId !== reminder.activityId || completed.createdAtMs < reminder.createdAtMs) completed = undefined;
    if (archived) completed = undefined;
    if (!archived && !completed) {
      const dueDate = localDate(reminder.dueAtMs, state.settings.zone);
      completed = entries.find(entry => !assigned.has(entry.id) && !reserved.has(entry.id) && entry.activityId === reminder.activityId && entry.createdAtMs >= reminder.createdAtMs && localDate(entry.revision.occurredAtMs, state.settings.zone) === dueDate);
    }
    if (completed) assigned.add(completed.id);
    return { ...reminder, completedEntryId: completed?.id ?? null, status: archived ? 'archived' : completed ? 'done' : reminder.dueAtMs < nowMs ? 'overdue' : 'pending' };
  });
}
