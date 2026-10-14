import { canonicalize, COLORS, createEmptyState, offsetMinutesAt, offsetSecondsAt, type Command, type DomainState } from '../../src/domain';

/** Deterministic synthetic device fixtures; never sourced from personal storage. */
export const V015_NOW = Date.parse('2026-10-12T17:00:00.000Z');
export function createV015State(activityCount: 10 | 100, entryCount = 10_000): DomainState {
  let serial = 1;
  const nextId = () => `15000000-0000-4000-9000-${String(serial++).padStart(12, '0')}`;
  const state = createEmptyState({ databaseId: nextId(), nowMs: V015_NOW - 400 * 86_400_000, zone: 'America/Bogota' });
  const operation = (command: Command, entityId: string, recordedAtMs: number) => {
    const id = nextId();
    state.operations.push({ id, entityId, kind: command.type, sequence: state.operations.length + 1, recordedAtMs, intent: canonicalize(command) });
    return id;
  };
  for (let index = 0; index < activityCount; index++) {
    const id = nextId();
    const recordedAtMs = V015_NOW - 399 * 86_400_000 + index;
    const fields = {
      name: `${index % 7 === 0 ? 'PRIVADA' : 'Actividad'} QA ${String(index + 1).padStart(3, '0')}${index === 1 ? ' con nombre largo y emoji repetido' : ''}`,
      emoji: index < 2 ? '📖' : ['🌿', '☕', '🚶', '💧'][index % 4],
      color: COLORS[index % COLORS.length], isPrivate: index % 7 === 0, category: null,
    };
    const operationId = operation({ type: 'createActivity', id, ...fields }, id, recordedAtMs);
    state.activities.push({ id, createdAtMs: recordedAtMs });
    state.activityRevisions.push({ ...fields, id: nextId(), activityId: id, revisionNo: 1, previousRevisionId: null, operationId, recordedAtMs, isArchived: false, sortOrder: index });
  }
  for (let index = 0; index < entryCount; index++) {
    const activityIndex = index % activityCount;
    const activity = state.activities[activityIndex];
    const activityRevision = state.activityRevisions[activityIndex];
    const id = nextId();
    const recordedAtMs = V015_NOW - 30_000 + index;
    const occurredAtMs = V015_NOW - ((index * 37) % 365) * 86_400_000 - 3_600_000 - index;
    const note = index % 3 === 0 ? `NOTA_QA_015_${index} con café y texto de prueba.` : '';
    const operationId = operation({ type: 'createEntry', id, activityId: activity.id, occurredAtMs, occurredZone: state.settings.zone, note }, id, recordedAtMs);
    state.entries.push({ id, activityId: activity.id, createdAtMs: recordedAtMs, creationOperationId: operationId });
    state.entryRevisions.push({ id: nextId(), entryId: id, revisionNo: 1, previousRevisionId: null, operationId, kind: 'create', occurredAtMs, occurredZone: state.settings.zone, occurredOffsetMinutes: offsetMinutesAt(occurredAtMs, state.settings.zone), occurredOffsetSeconds: offsetSecondsAt(occurredAtMs, state.settings.zone), note, state: 'active', activityRevisionId: activityRevision.id, recordedAtMs, reason: '' });
  }
  return state;
}
