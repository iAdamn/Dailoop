import { canonicalize, COLORS, createEmptyState, offsetMinutesAt, offsetSecondsAt, type Command, type DomainState, type EntryRevision } from '../../src/domain';

/** Synthetic, deterministic test data only. Portable to the local Expo dev test route. */
export const STRESS_EXPECTED = {
  activities: 50,
  privateActivities: 8,
  entries: 10_000,
  corrected: 1_000,
  voided: 589,
  restored: 295,
  entryRevisions: 11_884,
  operations: 11_934,
  activeEntries: 9_706,
  activePublicEntries: 8_153,
} as const;
export const STRESS_NOW = Date.parse('2026-10-12T17:00:00.000Z');
export const stressId = (serial: number): string => `10000000-0000-4000-9000-${String(serial).padStart(12, '0')}`;

/** O(N) construction: no repeated whole-dataset execute or state cloning. */
export function createStressState(nowMs: number): DomainState {
  let serial = 1;
  const nextId = (): string => stressId(serial++);
  const state = createEmptyState({ databaseId: nextId(), nowMs: nowMs - 400 * 86_400_000, zone: 'America/Bogota' });
  const currentRevisions: EntryRevision[] = [];
  function operation(command: Command, entityId: string, recordedAtMs: number): string {
    const id = nextId(); state.operations.push({ id, entityId, kind: command.type, sequence: state.operations.length + 1, recordedAtMs, intent: canonicalize(command) }); return id;
  }
  for (let index = 0; index < STRESS_EXPECTED.activities; index++) {
    const id = nextId(); const recordedAtMs = nowMs - 399 * 86_400_000 + index; const isPrivate = index % 7 === 0;
    const fields = { name: `${isPrivate ? 'PRIVADA' : 'Actividad'} de carga ${String(index + 1).padStart(2, '0')}`, emoji: ['📚', '🌱', '🚶', '☕', '🎨'][index % 5], color: COLORS[index % COLORS.length], isPrivate, category: ['Personal', 'Casa', 'Aprendizaje'][index % 3] };
    const operationId = operation({ type: 'createActivity', id, ...fields }, id, recordedAtMs);
    state.activities.push({ id, createdAtMs: recordedAtMs });
    state.activityRevisions.push({ ...fields, id: nextId(), activityId: id, revisionNo: 1, previousRevisionId: null, operationId, recordedAtMs, isArchived: false, sortOrder: index });
  }
  for (let index = 0; index < STRESS_EXPECTED.entries; index++) {
    const activityIndex = index % STRESS_EXPECTED.activities; const activity = state.activities[activityIndex]; const activityRevision = state.activityRevisions[activityIndex];
    const id = nextId(); const recordedAtMs = nowMs - 30_000 + index;
    // Deliberate synthetic elapsed durations, not calendar navigation or a DST assumption.
    const occurredAtMs = nowMs - ((index * 37) % 365) * 86_400_000 - 3_600_000 - (index % 3600) * 1000;
    const note = index % 3 === 0 ? `${activityRevision.isPrivate ? 'DATO_PRIVADO' : 'Nota sintética'} ${index}: café, 📚 y texto *Markdown*.` : '';
    const operationId = operation({ type: 'createEntry', id, activityId: activity.id, occurredAtMs, occurredZone: state.settings.zone, note }, id, recordedAtMs);
    state.entries.push({ id, activityId: activity.id, createdAtMs: recordedAtMs, creationOperationId: operationId });
    const revision: EntryRevision = { id: nextId(), entryId: id, revisionNo: 1, previousRevisionId: null, operationId, kind: 'create', occurredAtMs, occurredZone: state.settings.zone, occurredOffsetMinutes: offsetMinutesAt(occurredAtMs, state.settings.zone), occurredOffsetSeconds: offsetSecondsAt(occurredAtMs, state.settings.zone), note, state: 'active', activityRevisionId: activityRevision.id, recordedAtMs, reason: '' };
    state.entryRevisions.push(revision); currentRevisions.push(revision);
  }
  function revise(index: number, kind: 'correct' | 'void' | 'restore'): void {
    const previous = currentRevisions[index]; const recordedAtMs = nowMs - 10_000 + state.operations.length - STRESS_EXPECTED.entries - STRESS_EXPECTED.activities;
    const reason = `${kind === 'correct' ? 'Corrección' : kind === 'void' ? 'Anulación' : 'Restauración'} sintética de carga`;
    const occurredAtMs = previous.occurredAtMs - 15 * 60_000;
    const command: Command = kind === 'correct' ? { type: 'correctEntry', entryId: previous.entryId, occurredAtMs, note: `${previous.note} Corregida.`, reason } : { type: kind === 'void' ? 'voidEntry' : 'restoreEntry', entryId: previous.entryId, reason };
    const operationId = operation(command, previous.entryId, recordedAtMs);
    const revision: EntryRevision = { ...previous, id: nextId(), revisionNo: previous.revisionNo + 1, previousRevisionId: previous.id, operationId, recordedAtMs, reason, kind, state: kind === 'void' ? 'void' : 'active' };
    if (kind === 'correct') { revision.occurredAtMs = occurredAtMs; revision.occurredOffsetMinutes = offsetMinutesAt(occurredAtMs, revision.occurredZone); revision.occurredOffsetSeconds = offsetSecondsAt(occurredAtMs, revision.occurredZone); revision.note = `${previous.note} Corregida.`; }
    state.entryRevisions.push(revision); currentRevisions[index] = revision;
  }
  for (let index = 0; index < STRESS_EXPECTED.entries; index++) {
    if (index % 10 === 0) revise(index, 'correct');
    if (index % 17 === 0) revise(index, 'void');
    if (index % 34 === 0) revise(index, 'restore');
  }
  return state;
}
