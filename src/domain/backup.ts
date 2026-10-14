import { effectiveEntries, validateCommandFields } from './core';
import { validatePlanning } from './planning';
import { offsetMinutesAt, offsetSecondsAt } from './time';
import { LIMITS, type ActivityFields, type ActivityRevision, type BackupCounts, type BackupFile, type BackupOptions, type Command, type Digest, type DomainState, type EntryRevision, type Operation, type ParsedBackup, type Settings } from './types';
import { assertId, assertTime, assertZone, canonicalize, exactKeys, invariant, isRecord, textLimit, utf8Length, validateActivity, validateSettings } from './validation';

const stateKeys = ['meta', 'activities', 'activityRevisions', 'entries', 'entryRevisions', 'operations', 'settings'];
const activityFields = ['name', 'emoji', 'color', 'isPrivate', 'isArchived', 'sortOrder', 'category'];
const kinds = ['createActivity', 'updateActivity', 'createEntry', 'correctEntry', 'voidEntry', 'restoreEntry', 'updateSettings'];
function record(value: unknown, keys: string[], label: string): asserts value is Record<string, unknown> { invariant(isRecord(value), 'invalid_object', `${label} no es un objeto válido.`); exactKeys(value, keys, label); }
function integer(value: unknown, minimum: number, label: string): asserts value is number { invariant(Number.isSafeInteger(value) && (value as number) >= minimum, 'invalid_number', `${label} no es válido.`); }
export function backupCounts(state: DomainState): BackupCounts { return { activities: state.activities.length, activityRevisions: state.activityRevisions.length, entries: state.entries.length, entryRevisions: state.entryRevisions.length, operations: state.operations.length }; }

/** Validate untrusted storage/import data without changing the supplied object. */
export function validateState(value: unknown): DomainState {
  record(value, [...stateKeys, ...(isRecord(value) && Object.hasOwn(value, 'planning') ? ['planning'] : [])], 'dataset'); record(value.meta, ['databaseId', 'schemaVersion', 'formatVersion', 'createdAtMs'], 'metadatos');
  invariant(value.meta.schemaVersion === 1 && value.meta.formatVersion === 1, 'unsupported_version', 'Versión de datos no compatible.'); assertId(value.meta.databaseId); assertTime(value.meta.createdAtMs);
  record(value.settings, ['zone', 'hourFormat', 'weekStartsOn', 'theme'], 'ajustes'); validateSettings(value.settings as unknown as DomainState['settings']);
  for (const table of ['activities', 'activityRevisions', 'entries', 'entryRevisions', 'operations']) invariant(Array.isArray(value[table]), 'invalid_table', `Tabla ${table} no válida.`);
  const state = value as unknown as DomainState;
  invariant(state.entries.length <= LIMITS.entries && state.activityRevisions.length + state.entryRevisions.length <= LIMITS.revisions, 'backup_too_large', 'Los datos superan los límites admitidos de restauración.');
  invariant(state.activities.length <= LIMITS.entries && state.operations.length <= LIMITS.revisions + LIMITS.entries, 'backup_too_large', 'Los datos superan los límites admitidos.');
  const ids = new Set<string>([state.meta.databaseId]);
  const uniqueId = (id: unknown): void => { assertId(id); invariant(!ids.has(id), 'duplicate_id', 'El archivo contiene identificadores duplicados.'); ids.add(id); };
  const operations = new Map<string, Operation>(); const sequences = new Set<number>();
  for (const operation of state.operations) {
    record(operation, ['id', 'kind', 'sequence', 'recordedAtMs', 'intent', 'entityId'], 'operación'); uniqueId(operation.id); integer(operation.sequence, 1, 'Secuencia'); assertTime(operation.recordedAtMs);
    invariant(kinds.includes(operation.kind), 'invalid_operation', 'Tipo de operación no válido.');
    invariant(typeof operation.intent === 'string' && utf8Length(operation.intent) <= 1024 * 1024, 'invalid_intent', 'Intención de operación no válida.');
    let intent: unknown; try { intent = JSON.parse(operation.intent); } catch { invariant(false, 'invalid_intent', 'Intención de operación no válida.'); }
    invariant(isRecord(intent) && intent.type === operation.kind && canonicalize(intent) === operation.intent, 'invalid_intent', 'La intención no corresponde a la operación.');
    if (operation.entityId !== null) assertId(operation.entityId);
    invariant(!sequences.has(operation.sequence), 'duplicate_sequence', 'La secuencia local está duplicada.'); sequences.add(operation.sequence); operations.set(operation.id, operation);
  }
  for (let sequence = 1; sequence <= state.operations.length; sequence++) invariant(sequences.has(sequence), 'broken_sequence', 'La secuencia local tiene huecos.');
  const activities = new Map<string, DomainState['activities'][number]>();
  for (const activity of state.activities) { record(activity, ['id', 'createdAtMs'], 'actividad'); uniqueId(activity.id); assertTime(activity.createdAtMs); activities.set(activity.id, activity); }
  const activityRevisions = new Map<string, ActivityRevision>(); const activityChains = new Map<string, ActivityRevision[]>(); const effects = new Map<string, number>();
  const effect = (id: string): void => { effects.set(id, (effects.get(id) ?? 0) + 1); };
  for (const revision of state.activityRevisions) {
    record(revision, [...activityFields, 'id', 'activityId', 'revisionNo', 'previousRevisionId', 'operationId', 'recordedAtMs'], 'revisión de actividad'); uniqueId(revision.id); assertId(revision.activityId); assertId(revision.operationId); assertTime(revision.recordedAtMs); integer(revision.revisionNo, 1, 'Número de revisión'); validateActivity(revision);
    if (revision.previousRevisionId !== null) assertId(revision.previousRevisionId);
    invariant(activities.has(revision.activityId), 'orphan_reference', 'Revisión de una actividad inexistente.');
    const operation = operations.get(revision.operationId); invariant(operation && operation.entityId === revision.activityId && operation.recordedAtMs === revision.recordedAtMs && operation.kind === (revision.revisionNo === 1 ? 'createActivity' : 'updateActivity'), 'invalid_operation', 'Operación de actividad incoherente.');
    effect(operation.id); activityRevisions.set(revision.id, revision); const chain = activityChains.get(revision.activityId) ?? []; chain.push(revision); activityChains.set(revision.activityId, chain);
  }
  for (const activity of state.activities) {
    const chain = activityChains.get(activity.id); invariant(chain && chain.length > 0, 'missing_revision', 'Actividad sin historial.'); chain.sort((a, b) => a.revisionNo - b.revisionNo);
    invariant(chain[0].recordedAtMs === activity.createdAtMs, 'invalid_creation', 'Fecha de creación de actividad incoherente.'); validateChain(chain, operations);
  }
  const entries = new Map<string, DomainState['entries'][number]>(); const creationOperations = new Set<string>();
  for (const entry of state.entries) {
    record(entry, ['id', 'activityId', 'createdAtMs', 'creationOperationId'], 'ocurrencia'); uniqueId(entry.id); assertId(entry.activityId); assertId(entry.creationOperationId); assertTime(entry.createdAtMs);
    invariant(activities.has(entry.activityId), 'orphan_reference', 'Ocurrencia de una actividad inexistente.'); invariant(!creationOperations.has(entry.creationOperationId), 'duplicate_creation', 'Una operación creó varias ocurrencias.'); creationOperations.add(entry.creationOperationId); entries.set(entry.id, entry);
  }
  const entryChains = new Map<string, EntryRevision[]>();
  for (const revision of state.entryRevisions) {
    record(revision, ['id', 'entryId', 'revisionNo', 'previousRevisionId', 'operationId', 'kind', 'occurredAtMs', 'occurredZone', 'occurredOffsetMinutes', ...(isRecord(revision) && Object.hasOwn(revision, 'occurredOffsetSeconds') ? ['occurredOffsetSeconds'] : []), 'note', 'state', 'activityRevisionId', 'recordedAtMs', 'reason'], 'revisión de ocurrencia');
    uniqueId(revision.id); assertId(revision.entryId); assertId(revision.operationId); assertId(revision.activityRevisionId); assertTime(revision.occurredAtMs); assertTime(revision.recordedAtMs); assertZone(revision.occurredZone); integer(revision.revisionNo, 1, 'Número de revisión'); if (revision.previousRevisionId !== null) assertId(revision.previousRevisionId);
    invariant(['create', 'correct', 'void', 'restore'].includes(revision.kind) && ['active', 'void'].includes(revision.state), 'invalid_revision', 'Estado o tipo de revisión no válido.');
    invariant(Number.isInteger(revision.occurredOffsetMinutes) && Math.abs(revision.occurredOffsetMinutes) <= 24 * 60 && revision.occurredOffsetMinutes === offsetMinutesAt(revision.occurredAtMs, revision.occurredZone), 'invalid_offset', 'El offset no corresponde a la zona e instante.');
    if ('occurredOffsetSeconds' in revision) invariant(Number.isInteger(revision.occurredOffsetSeconds) && revision.occurredOffsetSeconds === offsetSecondsAt(revision.occurredAtMs, revision.occurredZone), 'invalid_offset', 'El offset preciso no corresponde a la zona e instante.');
    textLimit(revision.note, 'La nota', LIMITS.noteGraphemes, LIMITS.noteBytes); textLimit(revision.reason, 'El motivo', LIMITS.noteGraphemes, LIMITS.noteBytes);
    const entry = entries.get(revision.entryId); invariant(entry, 'orphan_reference', 'Revisión de una ocurrencia inexistente.'); const activityRevision = activityRevisions.get(revision.activityRevisionId); invariant(activityRevision?.activityId === entry.activityId, 'crossed_activity', 'La revisión cruza actividades.');
    const operation = operations.get(revision.operationId); const expectedKind = { create: 'createEntry', correct: 'correctEntry', void: 'voidEntry', restore: 'restoreEntry' }[revision.kind];
    invariant(operation && operation.entityId === entry.id && operation.recordedAtMs === revision.recordedAtMs && operation.kind === expectedKind, 'invalid_operation', 'Operación de ocurrencia incoherente.');
    invariant(operations.get(activityRevision.operationId)!.sequence < operation.sequence, 'future_reference', 'La revisión referencia metadatos que aún no existían.'); effect(operation.id);
    const chain = entryChains.get(entry.id) ?? []; chain.push(revision); entryChains.set(entry.id, chain);
  }
  for (const entry of state.entries) {
    const chain = entryChains.get(entry.id); invariant(chain && chain.length > 0, 'missing_revision', 'Ocurrencia sin historial.'); chain.sort((a, b) => a.revisionNo - b.revisionNo); validateChain(chain, operations);
    const first = chain[0]; invariant(first.kind === 'create' && first.state === 'active' && first.operationId === entry.creationOperationId && first.recordedAtMs === entry.createdAtMs && first.occurredAtMs <= first.recordedAtMs, 'invalid_creation', 'Creación de ocurrencia incoherente.');
    for (let index = 1; index < chain.length; index++) {
      const before = chain[index - 1]; const after = chain[index]; invariant(after.kind !== 'create', 'invalid_transition', 'Solo la primera revisión puede crear una ocurrencia.');
      invariant(after.activityRevisionId === before.activityRevisionId, 'crossed_activity', 'El snapshot original de actividad debe conservarse.');
      if (after.kind === 'correct') invariant(after.state === before.state && (after.occurredAtMs === before.occurredAtMs || after.occurredAtMs <= after.recordedAtMs), 'invalid_transition', 'Corrección no válida.');
      else {
        invariant((after.kind === 'void' && before.state === 'active' && after.state === 'void') || (after.kind === 'restore' && before.state === 'void' && after.state === 'active'), 'invalid_transition', 'Anulación o restauración no válida.');
        invariant(after.occurredAtMs === before.occurredAtMs && after.occurredZone === before.occurredZone && after.occurredOffsetMinutes === before.occurredOffsetMinutes && after.note === before.note, 'invalid_transition', 'Anular/restaurar debe conservar la hora y nota.');
        invariant((after.occurredOffsetSeconds ?? offsetSecondsAt(after.occurredAtMs, after.occurredZone)) === (before.occurredOffsetSeconds ?? offsetSecondsAt(before.occurredAtMs, before.occurredZone)), 'invalid_transition', 'Anular/restaurar debe conservar el offset preciso.');
      }
    }
  }
  for (const operation of state.operations) {
    if (operation.kind === 'updateSettings') invariant(operation.entityId === null && !effects.has(operation.id), 'invalid_operation', 'Operación de ajustes incoherente.');
    else invariant(effects.get(operation.id) === 1, 'invalid_operation', 'Operación sin una revisión única.');
  }
  validateIntentEffects(state, activityRevisions);
  if (Object.hasOwn(state, 'planning')) validatePlanning(state);
  return state;
}
function validateIntentEffects(state: DomainState, activityByRevision: Map<string, ActivityRevision>): void {
  const activityEffects = new Map(state.activityRevisions.map(revision => [revision.operationId, revision]));
  const entryEffects = new Map(state.entryRevisions.map(revision => [revision.operationId, revision]));
  const entryByRevision = new Map(state.entryRevisions.map(revision => [revision.id, revision]));
  const activityCurrent = new Map<string, ActivityRevision>();
  const knownSettings: Partial<Settings> = { hourFormat: '24h', weekStartsOn: 1, theme: 'system' };
  let activityCount = 0;
  const same = (condition: unknown): void => invariant(condition, 'intent_mismatch', 'La intención de una operación no coincide con sus datos confirmados.');
  for (const operation of [...state.operations].sort((a, b) => a.sequence - b.sequence)) {
    const command = JSON.parse(operation.intent) as Command; validateCommandFields(command);
    if (command.type === 'createActivity') {
      const revision = activityEffects.get(operation.id)!;
      same((command.id === undefined || command.id === operation.entityId) && revision.name === command.name.trim() && revision.emoji === command.emoji && revision.color === command.color && revision.isPrivate === (command.isPrivate ?? false) && revision.category === (command.category?.trim() || null) && !revision.isArchived && revision.sortOrder === activityCount);
      activityCurrent.set(revision.activityId, revision); activityCount++;
    } else if (command.type === 'updateActivity') {
      const revision = activityEffects.get(operation.id)!; const previous = activityByRevision.get(revision.previousRevisionId!)!;
      const fields: ActivityFields = { name: previous.name, emoji: previous.emoji, color: previous.color, isPrivate: previous.isPrivate, isArchived: previous.isArchived, sortOrder: previous.sortOrder, category: previous.category, ...command.changes };
      if (typeof fields.name === 'string') fields.name = fields.name.trim(); if (typeof fields.category === 'string') fields.category = fields.category.trim() || null; validateActivity(fields);
      same(command.activityId === operation.entityId && activityFields.every(key => revision[key as keyof ActivityFields] === fields[key as keyof ActivityFields])); activityCurrent.set(revision.activityId, revision);
    } else if (command.type === 'updateSettings') {
      validateSettings({ ...state.settings, ...knownSettings, ...command.changes }); Object.assign(knownSettings, command.changes);
    } else {
      const revision = entryEffects.get(operation.id)!;
      if (command.type === 'createEntry') {
        const activity = activityCurrent.get(command.activityId); same(activity && !activity.isArchived && revision.activityRevisionId === activity.id);
        same((command.id === undefined || command.id === operation.entityId) && revision.occurredAtMs === (command.occurredAtMs ?? operation.recordedAtMs) && revision.note === (command.note ?? '') && revision.reason === '');
        if (command.occurredZone !== undefined) same(revision.occurredZone === command.occurredZone);
        else if (knownSettings.zone) same(revision.occurredZone === knownSettings.zone);
        else knownSettings.zone = revision.occurredZone;
      } else {
        const previous = entryByRevision.get(revision.previousRevisionId!)!; same(command.entryId === operation.entityId && revision.reason === (command.reason ?? ''));
        if (command.type === 'correctEntry') same(revision.occurredAtMs === (command.occurredAtMs ?? previous.occurredAtMs) && revision.occurredZone === (command.occurredZone ?? previous.occurredZone) && revision.note === (command.note ?? previous.note));
      }
    }
  }
  for (const key of Object.keys(knownSettings) as (keyof Settings)[]) same(state.settings[key] === knownSettings[key]);
}
function validateChain(chain: { id: string; revisionNo: number; previousRevisionId: string | null; operationId: string }[], operations: Map<string, Operation>): void {
  chain.forEach((revision, index) => {
    invariant(revision.revisionNo === index + 1 && revision.previousRevisionId === (index ? chain[index - 1].id : null), 'broken_chain', 'Cadena de revisiones rota, cruzada o bifurcada.');
    if (index) invariant(operations.get(chain[index - 1].operationId)!.sequence < operations.get(revision.operationId)!.sequence, 'broken_sequence', 'Las revisiones no siguen el orden de confirmación.');
  });
}
function validateDigest(digest: unknown): asserts digest is string { invariant(typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest), 'invalid_digest', 'El checksum SHA-256 no es válido.'); }
export async function exportBackup(state: DomainState, options: BackupOptions, digest: Digest): Promise<string> {
  validateState(state); assertId(options.backupId); assertTime(options.exportedAtMs); textLimit(options.appVersion, 'La versión', 80, 8192, true);
  const canonical = canonicalize(state); const checksum = await digest(canonical); validateDigest(checksum);
  const backup: BackupFile = { format: 'dailoop-backup', formatVersion: Object.hasOwn(state, 'planning') ? 2 : 1, schemaVersion: 1, backupId: options.backupId, databaseId: state.meta.databaseId, exportedAt: new Date(options.exportedAtMs).toISOString(), appVersion: options.appVersion, scope: 'full', counts: backupCounts(state), payload: JSON.parse(canonical) as DomainState, digest: checksum };
  const text = JSON.stringify(backup, null, 2) + '\n'; invariant(utf8Length(text) <= LIMITS.backupBytes, 'backup_too_large', 'Esta copia supera el límite restaurable. No se generó un archivo incompleto.'); return text;
}
export async function parseBackup(text: string, digest: Digest): Promise<ParsedBackup> {
  invariant(typeof text === 'string' && utf8Length(text) <= LIMITS.backupBytes, 'backup_too_large', 'El archivo supera el límite admitido.');
  let raw: unknown; try { raw = JSON.parse(text); } catch { invariant(false, 'invalid_json', 'El archivo no contiene JSON válido.'); }
  record(raw, ['format', 'formatVersion', 'schemaVersion', 'backupId', 'databaseId', 'exportedAt', 'appVersion', 'scope', 'counts', 'payload', 'digest'], 'backup');
  invariant(raw.format === 'dailoop-backup' && raw.scope === 'full', 'invalid_format', 'Selecciona un backup completo de Dailoop.'); invariant((raw.formatVersion === 1 || raw.formatVersion === 2) && raw.schemaVersion === 1, 'unsupported_version', 'Esta versión de backup no es compatible.'); assertId(raw.backupId); assertId(raw.databaseId); validateDigest(raw.digest);
  textLimit(raw.appVersion, 'La versión', 80, 8192, true);
  invariant(typeof raw.exportedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw.exportedAt) && Number.isFinite(Date.parse(raw.exportedAt)) && new Date(raw.exportedAt).toISOString() === raw.exportedAt, 'invalid_time', 'Fecha de exportación no válida.');
  const checksum = await digest(canonicalize(raw.payload)); validateDigest(checksum); invariant(checksum === raw.digest, 'checksum_mismatch', 'El archivo está dañado: checksum incorrecto.');
  const state = validateState(raw.payload); invariant((raw.formatVersion === 2) === Object.hasOwn(state, 'planning'), 'invalid_format', 'La versión del backup no corresponde a su planificación.'); invariant(state.meta.databaseId === raw.databaseId, 'database_mismatch', 'La identidad del dataset no coincide.'); record(raw.counts, ['activities', 'activityRevisions', 'entries', 'entryRevisions', 'operations'], 'conteos');
  const counts = backupCounts(state); invariant(Object.entries(counts).every(([key, value]) => raw.counts && (raw.counts as unknown as Record<string, unknown>)[key] === value), 'count_mismatch', 'Los conteos del archivo no coinciden.');
  const all = effectiveEntries(state, { includeVoided: true });
  return { backup: raw as unknown as BackupFile, state, summary: { ...counts, databaseId: state.meta.databaseId, backupId: raw.backupId, exportedAt: raw.exportedAt, firstOccurredAtMs: all.length ? all[0].revision.occurredAtMs : null, lastOccurredAtMs: all.length ? all[all.length - 1].revision.occurredAtMs : null } };
}
