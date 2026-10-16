import { asciiCompare, effectiveEntries, selectActivities } from './core';
import { canonicalTimeZone, localDate } from './time';
import { nextReminderDueAt, recurrenceDueAt, validateReminderRecurrence } from './recurrence';
import { LIMITS, type CommandContext, type DerivedReminder, type EffectiveEntry, type DomainState, type PlanningCommand, type PlanningEvent, type PlanningState, type PlanningView, type Reminder } from './types';
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
    object(value, ['type', 'id', 'activityId', 'dueAtMs', 'leadMinutes', 'notifications', 'completionEntryId', ...(Object.hasOwn(value, 'recurrence') ? ['recurrence'] : [])], 'recordatorio');
    assertId(value.id); assertId(value.activityId); assertId(value.completionEntryId); assertTime(value.dueAtMs); leads(value.leadMinutes);
    invariant(typeof value.notifications === 'boolean', 'invalid_planning', 'La opción de avisos no es válida.');
    if (Object.hasOwn(value, 'recurrence')) validateReminderRecurrence(value.recurrence);
  } else if (value.type === 'updateReminder') {
    object(value, ['type', 'reminderId', 'changes'], 'cambios de recordatorio'); assertId(value.reminderId);
    invariant(isRecord(value.changes) && Object.keys(value.changes).length > 0 && Object.keys(value.changes).every(key => ['dueAtMs', 'leadMinutes', 'notifications', 'recurrence'].includes(key)), 'invalid_planning', 'Los cambios de recordatorio no son válidos.');
    if (Object.hasOwn(value.changes, 'dueAtMs')) assertTime(value.changes.dueAtMs);
    if (Object.hasOwn(value.changes, 'leadMinutes')) leads(value.changes.leadMinutes);
    if (Object.hasOwn(value.changes, 'notifications')) invariant(typeof value.changes.notifications === 'boolean', 'invalid_planning', 'La opción de avisos no es válida.');
    if (Object.hasOwn(value.changes, 'recurrence') && value.changes.recurrence !== null) validateReminderRecurrence(value.changes.recurrence);
  } else if (value.type === 'linkReminderOccurrence') {
    object(value, ['type', 'reminderId', 'dueAtMs', 'entryId'], 'registro de repetición');
    assertId(value.reminderId); assertId(value.entryId); assertTime(value.dueAtMs);
  } else if (value.type === 'snoozeReminderOccurrence' || value.type === 'skipReminderOccurrence') {
    object(value, ['type', 'reminderId', 'dueAtMs', ...(value.type === 'snoozeReminderOccurrence' ? ['snoozedUntilMs'] : [])], 'acción de ocasión');
    assertId(value.reminderId); assertTime(value.dueAtMs);
    if (value.type === 'snoozeReminderOccurrence') assertTime(value.snoozedUntilMs);
  } else if (value.type === 'archiveReminder') {
    object(value, ['type', 'reminderId', 'archived'], 'archivo de recordatorio'); assertId(value.reminderId);
    invariant(typeof value.archived === 'boolean', 'invalid_planning', 'La opción de archivo no es válida.');
  } else if (value.type === 'setStreakAlerts') {
    object(value, ['type', 'enabled', 'hour', 'minute'], 'avisos de racha');
    invariant(typeof value.enabled === 'boolean' && Number.isInteger(value.hour) && (value.hour as number) >= 0 && (value.hour as number) <= 23 && Number.isInteger(value.minute) && (value.minute as number) >= 0 && (value.minute as number) <= 59, 'invalid_streak_alerts', 'Elige una hora válida para los avisos de racha.');
  } else invariant(false, 'invalid_planning', 'Acción de recordatorio no válida.');
}

interface LinkedOccurrence { reminder: Reminder; dueAtMs: number; entryId: string; recordedAtMs: number }
interface Projection { view: PlanningView; byId: Map<string, Reminder>; completionIds: Set<string>; linked: LinkedOccurrence[] }
interface References { activityIds: Set<string>; entries: Map<string, DomainState['entries'][number]> }
function emptyProjection(): Projection { return { view: { reminders: [], streakAlerts: { enabled: false, hour: 22, minute: 0 } }, byId: new Map(), completionIds: new Set(), linked: [] }; }
function project(projection: Projection, event: PlanningEvent): void {
  const { view, byId, completionIds } = projection;
  const command = event.command;
  if (command.type === 'createReminder') {
    const reminder: Reminder = { id: command.id, activityId: command.activityId, dueAtMs: command.dueAtMs, leadMinutes: [...command.leadMinutes], notifications: command.notifications, completionEntryId: command.completionEntryId, createdAtMs: event.recordedAtMs, isArchived: false, ...(command.recurrence ? { recurrence: { ...command.recurrence, weekdays: [...command.recurrence.weekdays] } } : {}) };
    view.reminders.push(reminder); byId.set(reminder.id, reminder); completionIds.add(reminder.completionEntryId);
  }
  else if (command.type === 'setStreakAlerts') view.streakAlerts = { enabled: command.enabled, hour: command.hour, minute: command.minute };
  else {
    const reminder = byId.get(command.reminderId);
    invariant(reminder, 'missing_reminder', 'El recordatorio no existe.');
    if (command.type === 'updateReminder') {
      const { recurrence, ...changes } = command.changes;
      Object.assign(reminder, changes, changes.leadMinutes ? { leadMinutes: [...changes.leadMinutes] } : {});
      if (recurrence === null) delete reminder.recurrence;
      else if (recurrence) reminder.recurrence = { ...recurrence, weekdays: [...recurrence.weekdays] };
    } else if (command.type === 'linkReminderOccurrence') {
      const binding = { reminderId: reminder.id, dueAtMs: command.dueAtMs, entryId: command.entryId };
      (view.occurrenceEntries ??= []).push(binding);
      projection.linked.push({ reminder: JSON.parse(JSON.stringify(reminder)) as Reminder, dueAtMs: command.dueAtMs, entryId: command.entryId, recordedAtMs: event.recordedAtMs });
    } else if (command.type === 'snoozeReminderOccurrence' || command.type === 'skipReminderOccurrence') {
      const actions = view.occurrenceActions ??= [];
      const index = actions.findIndex(action => action.reminderId === reminder.id && action.dueAtMs === command.dueAtMs);
      const action = { reminderId: reminder.id, dueAtMs: command.dueAtMs, skipped: command.type === 'skipReminderOccurrence', ...(command.type === 'snoozeReminderOccurrence' ? { snoozedUntilMs: command.snoozedUntilMs } : {}) };
      if (index < 0) actions.push(action); else actions[index] = action;
    } else reminder.isArchived = command.archived;
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
    invariant(!projection.linked.some(link => link.entryId === command.completionEntryId), 'duplicate_id', 'El registro ya pertenece a una repetición.');
    used.add(command.completionEntryId);
  } else if (command.type !== 'setStreakAlerts') {
    const reminder = projection.byId.get(command.reminderId);
    invariant(reminder, 'missing_reminder', 'El recordatorio no existe.');
    if (command.type === 'updateReminder') {
      invariant(!reminder.isArchived, 'archived_reminder', 'Restaura el recordatorio antes de editarlo.');
      if (command.changes.dueAtMs !== undefined && command.changes.dueAtMs !== reminder.dueAtMs) invariant(command.changes.dueAtMs > event.recordedAtMs, 'past_reminder', 'La nueva fecha del recordatorio debe ser futura.');
    } else if (command.type === 'snoozeReminderOccurrence' || command.type === 'skipReminderOccurrence') {
      invariant(!reminder.isArchived && event.recordedAtMs >= reminder.createdAtMs && isReminderOccurrence(reminder, command.dueAtMs), 'invalid_occurrence', 'Esta ocasión del recordatorio ya no está disponible.');
      const previous = projection.view.occurrenceActions?.find(action => action.reminderId === reminder.id && action.dueAtMs === command.dueAtMs);
      invariant(!previous?.skipped, 'skipped_occurrence', 'Esta ocasión del recordatorio ya fue omitida.');
      if (command.type === 'snoozeReminderOccurrence') invariant(command.snoozedUntilMs > event.recordedAtMs, 'past_snooze', 'Elige una hora futura para posponer el recordatorio.');
    } else if (command.type === 'linkReminderOccurrence') {
      invariant(!reminder.isArchived && reminder.recurrence, 'invalid_occurrence', 'La repetición no está activa.');
      invariant(recurrenceDueAt(reminder, localDate(command.dueAtMs, reminder.recurrence.zone)) === command.dueAtMs, 'invalid_occurrence', 'El registro no corresponde a un día de esta repetición.');
      invariant(!projection.view.occurrenceActions?.some(action => action.reminderId === reminder.id && action.dueAtMs === command.dueAtMs && action.skipped), 'skipped_occurrence', 'Esta ocasión del recordatorio ya fue omitida.');
      const entry = refs.entries.get(command.entryId);
      invariant(entry && entry.activityId === reminder.activityId && entry.createdAtMs >= reminder.createdAtMs && entry.createdAtMs <= event.recordedAtMs && event.recordedAtMs >= reminder.createdAtMs, 'invalid_occurrence_entry', 'El registro de la repetición no existe o pertenece a otra actividad.');
      invariant(!projection.completionIds.has(command.entryId) && !projection.linked.some(link => link.entryId === command.entryId || (link.reminder.id === reminder.id && link.dueAtMs === command.dueAtMs)), 'duplicate_occurrence', 'Esta repetición o registro ya tiene un vínculo.');
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
  if (command.type === 'snoozeReminderOccurrence' || command.type === 'skipReminderOccurrence') invariant(pendingReminderOccurrence(state, command.reminderId, command.dueAtMs, ctx.nowMs), 'stale_occurrence', 'Esta ocasión del recordatorio ya no está pendiente.');
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

/** Match the original occurrence instant; a postponement never changes this key. */
export function isReminderOccurrence(reminder: Pick<Reminder, 'dueAtMs' | 'recurrence'>, dueAtMs: number): boolean {
  assertTime(dueAtMs);
  return reminder.recurrence ? recurrenceDueAt(reminder, localDate(dueAtMs, reminder.recurrence.zone)) === dueAtMs : reminder.dueAtMs === dueAtMs;
}
/** Guard notification/UI actions against completing a different or stale occasion. */
export function pendingReminderOccurrence(state: DomainState, reminderId: string, dueAtMs: number, nowMs: number): DerivedReminder | null {
  assertTime(dueAtMs);
  return deriveReminders(state, nowMs).find(row => row.id === reminderId && row.dueAtMs === dueAtMs && (row.status === 'pending' || row.status === 'overdue')) ?? null;
}

/** Available entries keep effective ordering and support a creation-time cutoff.
 * A max tree avoids rescanning rejected/consumed candidates for every reminder. */
class EntryPool {
  private readonly size: number;
  private readonly maximum: number[];
  constructor(private readonly entries: EffectiveEntry[]) {
    this.size = 2 ** Math.ceil(Math.log2(Math.max(1, entries.length)));
    this.maximum = Array(this.size * 2).fill(-Infinity);
    entries.forEach((entry, index) => { this.maximum[this.size + index] = entry.createdAtMs; });
    for (let index = this.size - 1; index > 0; index--) this.maximum[index] = Math.max(this.maximum[index * 2], this.maximum[index * 2 + 1]);
  }
  take(createdAfter: number, assigned: Set<string>, reserved: Set<string>): EffectiveEntry | undefined {
    while (this.maximum[1] >= createdAfter) {
      let index = 1;
      while (index < this.size) index = this.maximum[index * 2] >= createdAfter ? index * 2 : index * 2 + 1;
      const entry = this.entries[index - this.size];
      this.maximum[index] = -Infinity;
      for (index = Math.floor(index / 2); index > 0; index = Math.floor(index / 2)) this.maximum[index] = Math.max(this.maximum[index * 2], this.maximum[index * 2 + 1]);
      if (!assigned.has(entry.id) && !reserved.has(entry.id)) return entry;
    }
    return undefined;
  }
  get latestCreatedAt(): number { return this.maximum[1]; }
}
/** Date buckets index both selected weekdays and creation-time eligibility. */
class DatePools {
  readonly byDate: Map<string, EntryPool>;
  private readonly weekdays: { dates: string[]; pools: EntryPool[]; size: number; maximum: number[] }[];
  constructor(entries: Map<string, EffectiveEntry[]>) {
    this.byDate = new Map([...entries].sort(([a], [b]) => asciiCompare(a, b)).map(([date, group]) => [date, new EntryPool(group)]));
    this.weekdays = Array.from({ length: 7 }, () => ({ dates: [], pools: [], size: 1, maximum: [] }));
    for (const [date, pool] of this.byDate) {
      const parsed = new Date(`${date}T00:00:00Z`); const group = this.weekdays[(parsed.getUTCDay() || 7) - 1];
      group.dates.push(date); group.pools.push(pool);
    }
    for (const group of this.weekdays) {
      group.size = 2 ** Math.ceil(Math.log2(Math.max(1, group.dates.length)));
      group.maximum = Array(group.size * 2).fill(-Infinity);
      group.pools.forEach((pool, index) => { group.maximum[group.size + index] = pool.latestCreatedAt; });
      for (let index = group.size - 1; index > 0; index--) group.maximum[index] = Math.max(group.maximum[index * 2], group.maximum[index * 2 + 1]);
    }
  }
  *eligible(weekdays: number[], from: string, createdAfter: number): Generator<[string, EntryPool]> {
    for (const weekday of weekdays) {
      const group = this.weekdays[weekday - 1];
      function* visit(index: number, left: number, right: number): Generator<[string, EntryPool]> {
        if (left >= group.dates.length || group.dates[Math.min(right - 1, group.dates.length - 1)] < from || group.maximum[index] < createdAfter) return;
        if (right - left === 1) {
          const pool = group.pools[left];
          if (pool.latestCreatedAt >= createdAfter) yield [group.dates[left], pool];
          group.maximum[index] = pool.latestCreatedAt;
        } else {
          const middle = Math.floor((left + right) / 2);
          yield* visit(index * 2, left, middle); yield* visit(index * 2 + 1, middle, right);
          group.maximum[index] = Math.max(group.maximum[index * 2], group.maximum[index * 2 + 1]);
        }
      }
      yield* visit(1, 0, group.size);
    }
  }
}
interface DerivedCache { fromMs: number; untilMs: number; dates: [string, string][]; rows: DerivedReminder[] }
const immutableValues = new WeakSet<object>();
const derivedCache = new WeakMap<DomainState, DerivedCache>();
function deeplyImmutable(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  if (immutableValues.has(value)) return true;
  if (!Object.isFrozen(value) || !Object.values(value).every(deeplyImmutable)) return false;
  immutableValues.add(value); return true;
}
function copyRows(rows: DerivedReminder[]): DerivedReminder[] {
  return rows.map(row => ({ ...row, leadMinutes: [...row.leadMinutes], ...(row.recurrence ? { recurrence: { ...row.recurrence, weekdays: [...row.recurrence.weekdays] } } : {}) }));
}
/** One effective entry completes at most one reminder. Corrections/voids recalculate it.
 * Only deeply frozen snapshots can reuse rows between temporal frontiers. */
export function deriveReminders(state: DomainState, nowMs: number): DerivedReminder[] {
  assertTime(nowMs);
  const immutable = deeplyImmutable(state);
  const cached = immutable ? derivedCache.get(state) : undefined;
  if (cached && nowMs >= cached.fromMs && nowMs < cached.untilMs && cached.dates.every(([zone, date]) => localDate(nowMs, zone) === date)) return copyRows(cached.rows);
  const projection = planningProjection(state);
  const reminders = projection.view.reminders.sort((a, b) => a.dueAtMs - b.dueAtMs || a.createdAtMs - b.createdAtMs || asciiCompare(a.id, b.id));
  if (!reminders.length) return [];
  const activities = new Map(selectActivities(state, { includeArchived: true }).map(activity => [activity.id, activity]));
  const allEntries = effectiveEntries(state);
  const entries = allEntries.filter(entry => entry.revision.occurredAtMs <= nowMs);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const byActivity = new Map<string, EffectiveEntry[]>();
  for (const entry of entries) { const group = byActivity.get(entry.activityId) ?? []; group.push(entry); byActivity.set(entry.activityId, group); }
  const reserved = new Set(reminders.map(reminder => reminder.completionEntryId));
  const assigned = new Set<string>();
  const result: DerivedReminder[] = [];
  const linksByReminder = new Map<string, LinkedOccurrence[]>();
  const completedLinks = new Map<string, EffectiveEntry>();
  const actionsByReminder = new Map<string, NonNullable<PlanningView['occurrenceActions']>>();
  for (const action of projection.view.occurrenceActions ?? []) {
    const reminder = projection.byId.get(action.reminderId);
    // A later schedule edit can invalidate an old action without rewriting its audit.
    if (!reminder || !isReminderOccurrence(reminder, action.dueAtMs)) continue;
    const group = actionsByReminder.get(action.reminderId) ?? []; group.push(action); actionsByReminder.set(action.reminderId, group);
  }
  // Compute local dates once per activity/zone, shared by reminders in that group.
  const groups = new Map<string, DatePools>();
  const datesFor = (activityId: string, zone: string): DatePools => {
    zone=canonicalTimeZone(zone);
    const key = `${activityId}|${zone}`; const existing = groups.get(key); if (existing) return existing;
    const dates = new Map<string, EffectiveEntry[]>();
    for (const entry of byActivity.get(activityId) ?? []) {
      if (reserved.has(entry.id) || assigned.has(entry.id)) continue;
      const date = localDate(entry.revision.occurredAtMs, zone); const group = dates.get(date) ?? []; group.push(entry); dates.set(date, group);
    }
    const pools = new DatePools(dates);
    groups.set(key, pools); return pools;
  };
  // Explicit bindings take priority over date matching, including early completion.
  for (const link of projection.linked) {
    const links = linksByReminder.get(link.reminder.id) ?? []; links.push(link); linksByReminder.set(link.reminder.id, links);
    const entry = byId.get(link.entryId); const zone = link.reminder.recurrence!.zone;
    if (entry && !actionsByReminder.get(link.reminder.id)?.some(action => action.dueAtMs === link.dueAtMs && action.skipped) && entry.activityId === link.reminder.activityId && [localDate(link.recordedAtMs, zone), localDate(link.dueAtMs, zone)].includes(localDate(entry.revision.occurredAtMs, zone))) {
      completedLinks.set(`${link.reminder.id}|${link.dueAtMs}`, entry); assigned.add(entry.id); reserved.add(entry.id);
    }
  }
  for (const reminder of reminders) {
    const archived = reminder.isArchived || activities.get(reminder.activityId)?.isArchived === true;
    if (archived) { result.push({ ...reminder, completedEntryId: null, status: 'archived' }); continue; }
    const actions = actionsByReminder.get(reminder.id) ?? [];
    const skippedDates = new Set(actions.filter(action => action.skipped).map(action => action.dueAtMs));
    const snoozedDates = new Map(actions.filter(action => !action.skipped && action.snoozedUntilMs !== undefined).map(action => [action.dueAtMs, action.snoozedUntilMs!]));
    for (const dueAtMs of skippedDates) result.push({ ...reminder, dueAtMs, completedEntryId: null, status: 'skipped' });
    if (!reminder.recurrence && skippedDates.has(reminder.dueAtMs)) continue;
    const completedDates = new Set<number>();
    for (const link of linksByReminder.get(reminder.id) ?? []) {
      const completed = completedLinks.get(`${reminder.id}|${link.dueAtMs}`);
      if (completed) { completedDates.add(link.dueAtMs); result.push({ ...reminder, dueAtMs: link.dueAtMs, completedEntryId: completed.id, status: 'done' }); }
    }
    if (reminder.recurrence) {
      const zone = reminder.recurrence.zone;
      const dates = datesFor(reminder.activityId, zone);
      for (const [date, pool] of dates.eligible(reminder.recurrence.weekdays, localDate(reminder.dueAtMs, zone), reminder.createdAtMs)) {
        if (pool.latestCreatedAt < reminder.createdAtMs) continue;
        const dueAtMs = recurrenceDueAt(reminder, date);
        if (dueAtMs === null || completedDates.has(dueAtMs) || skippedDates.has(dueAtMs)) continue;
        const completed = pool.take(reminder.createdAtMs, assigned, reserved);
        if (completed) { assigned.add(completed.id); completedDates.add(dueAtMs); result.push({ ...reminder, dueAtMs, completedEntryId: completed.id, status: 'done' }); }
      }
      let dueAtMs = recurrenceDueAt(reminder, localDate(nowMs, zone)) ?? nextReminderDueAt(reminder, nowMs);
      for (let skipped = 0; dueAtMs !== null && (completedDates.has(dueAtMs) || skippedDates.has(dueAtMs)) && skipped <= completedDates.size + skippedDates.size; skipped++) dueAtMs = nextReminderDueAt(reminder, dueAtMs);
      const pending = new Set([...snoozedDates.keys()].filter(due => !completedDates.has(due)));
      if (dueAtMs !== null) pending.add(dueAtMs);
      for (const due of pending) {
        const scheduledAtMs = snoozedDates.get(due);
        result.push({ ...reminder, dueAtMs: due, ...(scheduledAtMs !== undefined ? { scheduledAtMs } : {}), completedEntryId: null, status: (scheduledAtMs ?? due) < nowMs ? 'overdue' : 'pending' });
      }
      continue;
    }
    let completed = byId.get(reminder.completionEntryId);
    if (completed?.activityId !== reminder.activityId || completed.createdAtMs < reminder.createdAtMs) completed = undefined;
    if (!completed && completedDates.has(reminder.dueAtMs)) continue;
    if (!completed) {
      const dueDate = localDate(reminder.dueAtMs, state.settings.zone);
      completed = datesFor(reminder.activityId, state.settings.zone).byDate.get(dueDate)?.take(reminder.createdAtMs, assigned, reserved);
    }
    if (completed) assigned.add(completed.id);
    const scheduledAtMs = snoozedDates.get(reminder.dueAtMs);
    result.push({ ...reminder, ...(scheduledAtMs !== undefined ? { scheduledAtMs } : {}), completedEntryId: completed?.id ?? null, status: completed ? 'done' : (scheduledAtMs ?? reminder.dueAtMs) < nowMs ? 'overdue' : 'pending' });
  }
  result.sort((a, b) => (a.scheduledAtMs ?? a.dueAtMs) - (b.scheduledAtMs ?? b.dueAtMs) || a.createdAtMs - b.createdAtMs || asciiCompare(a.id, b.id));
  if (immutable) {
    const futureEntry = allEntries.find(entry => entry.revision.occurredAtMs > nowMs)?.revision.occurredAtMs ?? Infinity;
    const pendingBoundary = result.reduce((next, row) => row.status === 'pending' ? Math.min(next, (row.scheduledAtMs ?? row.dueAtMs) + 1) : next, Infinity);
    const zones = new Set([state.settings.zone, ...reminders.flatMap(reminder => reminder.recurrence ? [reminder.recurrence.zone] : [])].map(canonicalTimeZone));
    derivedCache.set(state, { fromMs: nowMs, untilMs: Math.min(futureEntry, pendingBoundary), dates: [...zones].map(zone => [zone, localDate(nowMs, zone)]), rows: copyRows(result) });
  }
  return result;
}
