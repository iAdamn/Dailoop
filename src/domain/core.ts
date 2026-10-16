import { LIMITS, type ActivityFields, type ActivityRevision, type ChangeSet, type Command, type CommandContext, type CommandResult, type CurrentActivity, type DomainState, type EffectiveEntry, type EntryFilter, type EntryRevision, type IntervalStats, type Period, type PeriodStats } from './types';
import { offsetMinutesAt, offsetSecondsAt, previousPeriod } from './time';
import { assertId, assertTime, assertZone, canonicalize, invariant, isRecord, textLimit, validateActivity, validateSettings } from './validation';

export function createEmptyState(input: { databaseId: string; nowMs: number; zone?: string }): DomainState {
  assertId(input.databaseId); assertTime(input.nowMs); assertZone(input.zone ?? 'America/Bogota');
  return { meta: { databaseId: input.databaseId, schemaVersion: 1, formatVersion: 1, createdAtMs: input.nowMs }, activities: [], activityRevisions: [], entries: [], entryRevisions: [], operations: [], settings: { zone: input.zone ?? 'America/Bogota', hourFormat: '24h', weekStartsOn: 1, theme: 'system' } };
}
export const asciiCompare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export function currentSequence(state: DomainState): number { return state.operations.reduce((max, operation) => Math.max(max, operation.sequence), 0); }
function currentActivities(state: DomainState, atSequence = Infinity): Map<string, CurrentActivity> {
  const operationSequence = new Map(state.operations.map(op => [op.id, op.sequence])); const revisions = new Map<string, ActivityRevision>();
  for (const revision of state.activityRevisions) if ((operationSequence.get(revision.operationId) ?? Infinity) <= atSequence && (!revisions.has(revision.activityId) || revisions.get(revision.activityId)!.revisionNo < revision.revisionNo)) revisions.set(revision.activityId, revision);
  const result = new Map<string, CurrentActivity>();
  for (const activity of state.activities) { const r = revisions.get(activity.id); if (r) result.set(activity.id, { id: activity.id, createdAtMs: activity.createdAtMs, revisionId: r.id, revisionNo: r.revisionNo, name: r.name, emoji: r.emoji, color: r.color, isPrivate: r.isPrivate, isArchived: r.isArchived, sortOrder: r.sortOrder, category: r.category }); }
  return result;
}
export function selectActivities(state: DomainState, options: { includeArchived?: boolean; atSequence?: number } = {}): CurrentActivity[] {
  return [...currentActivities(state, options.atSequence).values()].filter(activity => options.includeArchived || !activity.isArchived).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs || asciiCompare(a.id, b.id));
}
export function effectiveEntries(state: DomainState, filter: EntryFilter = {}): EffectiveEntry[] {
  const activities = currentActivities(state, filter.atSequence); const sequences = new Map(state.operations.map(op => [op.id, op.sequence])); const revisions = new Map<string, EntryRevision>(); const ids = filter.activityIds ? new Set(filter.activityIds) : null;
  for (const revision of state.entryRevisions) if ((sequences.get(revision.operationId) ?? Infinity) <= (filter.atSequence ?? Infinity) && (!revisions.has(revision.entryId) || revisions.get(revision.entryId)!.revisionNo < revision.revisionNo)) revisions.set(revision.entryId, revision);
  const result: EffectiveEntry[] = [];
  for (const entry of state.entries) {
    const revision = revisions.get(entry.id); const activity = activities.get(entry.activityId);
    if (!revision || !activity || (!filter.includeVoided && revision.state !== 'active') || (ids && !ids.has(entry.activityId)) || (filter.fromMs !== undefined && revision.occurredAtMs < filter.fromMs) || (filter.toMs !== undefined && revision.occurredAtMs >= filter.toMs)) continue;
    result.push({ ...entry, revision, activity, sequence: sequences.get(entry.creationOperationId) ?? 0 });
  }
  return result.sort((a, b) => a.revision.occurredAtMs - b.revision.occurredAtMs || a.sequence - b.sequence || asciiCompare(a.id, b.id));
}
export function lastOccurredAt(state: DomainState, activityId: string): number | null { const entries = effectiveEntries(state, { activityIds: [activityId] }); return entries.length ? entries[entries.length - 1].revision.occurredAtMs : null; }
function emptyChanges(): ChangeSet { return { activities: [], activityRevisions: [], entries: [], entryRevisions: [], operations: [], settings: null, activityIds: [], entryIds: [] }; }
export function validateCommandFields(command: Command): void {
  invariant(isRecord(command), 'invalid_command', 'Operación no válida.');
  const allowed: Record<Command['type'], readonly string[]> = { createActivity: ['type', 'name', 'emoji', 'color', 'isPrivate', 'category', 'id'], updateActivity: ['type', 'activityId', 'changes'], createEntry: ['type', 'activityId', 'occurredAtMs', 'occurredZone', 'note', 'id'], correctEntry: ['type', 'entryId', 'occurredAtMs', 'occurredZone', 'note', 'reason'], voidEntry: ['type', 'entryId', 'reason'], restoreEntry: ['type', 'entryId', 'reason'], updateSettings: ['type', 'changes'] };
  invariant(Object.hasOwn(allowed, command.type) && Object.keys(command).every(key => allowed[command.type].includes(key)), 'invalid_command', 'Operación o campos no válidos.');
  if ('activityId' in command) assertId(command.activityId);
  if ('entryId' in command) assertId(command.entryId);
  if ('id' in command && command.id !== undefined) assertId(command.id);
  if ('occurredAtMs' in command && command.occurredAtMs !== undefined) assertTime(command.occurredAtMs);
  if ('occurredZone' in command && command.occurredZone !== undefined) assertZone(command.occurredZone);
  if ('note' in command && command.note !== undefined) textLimit(command.note, 'La nota', LIMITS.noteGraphemes, LIMITS.noteBytes);
  if ('reason' in command && command.reason !== undefined) textLimit(command.reason, 'El motivo', LIMITS.noteGraphemes, LIMITS.noteBytes);
  if (command.type === 'createActivity') {
    textLimit(command.name, 'El nombre', LIMITS.nameGraphemes, LIMITS.nameBytes, true);
    textLimit(command.emoji, 'El emoji', 8, 256, true);
    if (command.category !== undefined && command.category !== null) textLimit(command.category, 'La categoría', 80, 8192);
  }
  if (command.type === 'updateActivity' || command.type === 'updateSettings') {
    const keys = command.type === 'updateActivity' ? ['name', 'emoji', 'color', 'isPrivate', 'isArchived', 'sortOrder', 'category'] : ['zone', 'hourFormat', 'weekStartsOn', 'theme'];
    invariant(isRecord(command.changes) && Object.keys(command.changes).length > 0 && Object.keys(command.changes).every(key => keys.includes(key) && command.changes[key as keyof typeof command.changes] !== undefined), 'invalid_changes', 'Los cambios contienen campos no válidos.');
  }
}
export function execute(state: DomainState, command: Command, ctx: CommandContext): CommandResult {
  validateCommandFields(command); assertId(ctx.operationId); assertTime(ctx.nowMs);
  // Omitted optional properties are equivalent to undefined in an in-process command.
  const intent = canonicalize(JSON.parse(JSON.stringify(command)) as unknown);
  const previous = state.operations.find(op => op.id === ctx.operationId);
  if (previous) {
    invariant(previous.intent === intent, 'operation_conflict', 'Esta operación ya se utilizó para otra acción.');
    const result: CommandResult['result'] = { replayed: true };
    if (previous.entityId && (command.type === 'createActivity' || command.type === 'updateActivity')) result.activityId = previous.entityId;
    else if (previous.entityId) result.entryId = previous.entityId;
    return { state, changeSet: emptyChanges(), result };
  }
  // Reject before allocating IDs or persisting a state that restore/open would
  // reject. Idempotent replays above remain available even at the limit.
  invariant(state.operations.length < LIMITS.revisions + LIMITS.entries, 'data_too_large', 'El historial alcanzó su límite. Exporta una copia para conservar tus datos.');
  if (command.type === 'createActivity') invariant(state.activities.length < LIMITS.entries, 'data_too_large', 'Se alcanzó el límite de actividades.');
  if (command.type === 'createEntry') invariant(state.entries.length < LIMITS.entries, 'data_too_large', 'Se alcanzó el límite de registros.');
  if (command.type !== 'updateSettings') invariant(state.activityRevisions.length + state.entryRevisions.length < LIMITS.revisions, 'data_too_large', 'El historial de cambios alcanzó su límite.');
  const used = new Set([state.meta.databaseId, ...state.activities.map(x => x.id), ...state.entries.map(x => x.id), ...state.activityRevisions.map(x => x.id), ...state.entryRevisions.map(x => x.id), ...state.operations.map(x => x.id)]);
  invariant(!used.has(ctx.operationId), 'duplicate_id', 'El ID de operación ya existe.'); used.add(ctx.operationId);
  const allocate = (specified?: string): string => { const id = specified ?? ctx.nextId(); assertId(id); invariant(!used.has(id), 'duplicate_id', 'El identificador ya existe.'); used.add(id); return id; };
  const changes = emptyChanges(); const result: CommandResult['result'] = { replayed: false }; let entityId: string | null = null;
  const activities = currentActivities(state);
  if (command.type === 'createActivity' || command.type === 'updateActivity') {
    let fields: ActivityFields; let revisionNo = 1; let previousRevisionId: string | null = null;
    if (command.type === 'createActivity') {
      entityId = allocate(command.id); fields = { name: command.name.trim(), emoji: command.emoji, color: command.color, isPrivate: command.isPrivate ?? false, isArchived: false, sortOrder: state.activities.length, category: command.category?.trim() || null };
      changes.activities.push({ id: entityId, createdAtMs: ctx.nowMs });
    } else {
      assertId(command.activityId); const current = activities.get(command.activityId); invariant(current, 'missing_activity', 'La actividad no existe.');
      entityId = current.id; revisionNo = current.revisionNo + 1; previousRevisionId = current.revisionId;
      fields = { name: current.name, emoji: current.emoji, color: current.color, isPrivate: current.isPrivate, isArchived: current.isArchived, sortOrder: current.sortOrder, category: current.category, ...command.changes };
      if (typeof fields.name === 'string') fields.name = fields.name.trim();
      if (typeof fields.category === 'string') fields.category = fields.category.trim() || null;
      invariant((Object.keys(fields) as (keyof ActivityFields)[]).some(key => fields[key] !== current[key]), 'no_changes', 'No hay cambios para guardar.');
    }
    validateActivity(fields);
    changes.activityRevisions.push({ ...fields, id: allocate(), activityId: entityId, revisionNo, previousRevisionId, operationId: ctx.operationId, recordedAtMs: ctx.nowMs });
    changes.activityIds.push(entityId); result.activityId = entityId;
  } else if (command.type === 'updateSettings') {
    const settings = { ...state.settings, ...command.changes }; validateSettings(settings); changes.settings = settings;
  } else {
    let revision: EntryRevision;
    if (command.type === 'createEntry') {
      assertId(command.activityId); const activity = activities.get(command.activityId); invariant(activity, 'missing_activity', 'La actividad no existe.'); invariant(!activity.isArchived, 'archived_activity', 'Restaura esta actividad antes de registrar.');
      entityId = allocate(command.id); const occurredAtMs = command.occurredAtMs ?? ctx.nowMs; const occurredZone = command.occurredZone ?? state.settings.zone; assertTime(occurredAtMs); assertZone(occurredZone); invariant(occurredAtMs <= ctx.nowMs, 'future_entry', 'La hora del registro no puede ser futura.');
      changes.entries.push({ id: entityId, activityId: activity.id, createdAtMs: ctx.nowMs, creationOperationId: ctx.operationId });
      revision = { id: allocate(), entryId: entityId, revisionNo: 1, previousRevisionId: null, operationId: ctx.operationId, kind: 'create', occurredAtMs, occurredZone, occurredOffsetMinutes: offsetMinutesAt(occurredAtMs, occurredZone), occurredOffsetSeconds: offsetSecondsAt(occurredAtMs, occurredZone), note: command.note ?? '', state: 'active', activityRevisionId: activity.revisionId, recordedAtMs: ctx.nowMs, reason: '' };
      changes.activityIds.push(activity.id);
    } else {
      assertId(command.entryId); const current = effectiveEntries(state, { includeVoided: true }).find(entry => entry.id === command.entryId); invariant(current, 'missing_entry', 'El registro no existe.'); entityId = current.id;
      if (command.type === 'correctEntry') invariant((command.occurredAtMs ?? current.revision.occurredAtMs) !== current.revision.occurredAtMs || (command.occurredZone ?? current.revision.occurredZone) !== current.revision.occurredZone || (command.note ?? current.revision.note) !== current.revision.note, 'no_changes', 'No hay cambios para guardar. Cambia la fecha, la hora o la nota.');
      revision = { ...current.revision, id: allocate(), revisionNo: current.revision.revisionNo + 1, previousRevisionId: current.revision.id, operationId: ctx.operationId, recordedAtMs: ctx.nowMs, reason: command.reason ?? '', occurredOffsetSeconds: current.revision.occurredOffsetSeconds ?? offsetSecondsAt(current.revision.occurredAtMs, current.revision.occurredZone) };
      if (command.type === 'voidEntry') { invariant(revision.state === 'active', 'already_void', 'El registro ya está anulado.'); revision.kind = 'void'; revision.state = 'void'; }
      else if (command.type === 'restoreEntry') { invariant(revision.state === 'void', 'already_active', 'El registro ya está vigente.'); revision.kind = 'restore'; revision.state = 'active'; }
      else {
        const occurredAtMs = command.occurredAtMs ?? revision.occurredAtMs; const occurredZone = command.occurredZone ?? revision.occurredZone; assertTime(occurredAtMs); assertZone(occurredZone);
        invariant(occurredAtMs === revision.occurredAtMs || occurredAtMs <= ctx.nowMs, 'future_entry', 'La hora del registro no puede ser futura.');
        revision.kind = 'correct'; revision.occurredAtMs = occurredAtMs; revision.occurredZone = occurredZone; revision.occurredOffsetMinutes = offsetMinutesAt(occurredAtMs, occurredZone); revision.occurredOffsetSeconds = offsetSecondsAt(occurredAtMs, occurredZone); revision.note = command.note ?? revision.note;
      }
      changes.activityIds.push(current.activityId);
    }
    textLimit(revision.note, 'La nota', LIMITS.noteGraphemes, LIMITS.noteBytes); textLimit(revision.reason, 'El motivo', LIMITS.noteGraphemes, LIMITS.noteBytes);
    changes.entryRevisions.push(revision); changes.entryIds.push(entityId); result.entryId = entityId;
  }
  changes.operations.push({ id: ctx.operationId, kind: command.type, sequence: currentSequence(state) + 1, recordedAtMs: ctx.nowMs, intent, entityId });
  const next: DomainState = { ...state, activities: [...state.activities, ...changes.activities], activityRevisions: [...state.activityRevisions, ...changes.activityRevisions], entries: [...state.entries, ...changes.entries], entryRevisions: [...state.entryRevisions, ...changes.entryRevisions], operations: [...state.operations, ...changes.operations], settings: changes.settings ?? state.settings };
  return { state: next, changeSet: changes, result };
}
export function intervalStats(entries: readonly EffectiveEntry[]): IntervalStats {
  const times = entries.map(entry => entry.revision.occurredAtMs).sort((a, b) => a - b); const differences = times.slice(1).map((time, index) => time - times[index]);
  if (!differences.length) return { count: 0, averageMs: null, shortestMs: null, longestMs: null };
  return { count: differences.length, averageMs: differences.reduce((sum, n) => sum + n, 0) / differences.length, shortestMs: differences.reduce((min, n) => Math.min(min, n), Infinity), longestMs: differences.reduce((max, n) => Math.max(max, n), 0) };
}
export function computeStats(state: DomainState, period: Period, nowMs: number, activityIds?: readonly string[]): PeriodStats {
  const entries = effectiveEntries(state, { activityIds, fromMs: period.startMs, toMs: period.endMs }); const previous = previousPeriod(period, nowMs); const previousTotal = effectiveEntries(state, { activityIds, fromMs: previous.startMs, toMs: previous.endMs }).length;
  const counts = new Map<string, number>(); for (const entry of entries) counts.set(entry.activityId, (counts.get(entry.activityId) ?? 0) + 1);
  return { total: entries.length, perActivity: [...counts].map(([activityId, count]) => ({ activityId, count })), intervals: intervalStats(entries), previousTotal, change: entries.length - previousTotal, changePercent: previousTotal === 0 ? null : ((entries.length - previousTotal) / previousTotal) * 100, previousPeriod: previous };
}
