import { canonicalize, validateState, type DomainState, type Operation, type PlanningEvent, type Settings } from '../domain';

export type SyncMergeResult =
  | { kind: 'same' | 'merged' | 'remote' | 'local'; state: DomainState }
  | { kind: 'conflict'; reason: 'different-dataset' | 'divergent-history' | 'identity-collision' };

const rowTables = ['activities', 'activityRevisions', 'entries', 'entryRevisions'] as const;
type LogRow = Operation | PlanningEvent;
const ordered = <T extends LogRow>(rows: readonly T[]): T[] => [...rows].sort((a, b) => a.sequence - b.sequence);
const events = (state: DomainState): PlanningEvent[] => ordered(state.planning?.events ?? []);
const equal = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
const conflict = (reason: Extract<SyncMergeResult, { kind: 'conflict' }>['reason'] = 'divergent-history'): SyncMergeResult => ({ kind: 'conflict', reason });

function logPayload(row: LogRow): unknown { const { sequence: _sequence, ...payload } = row; return payload; }
function prefix<T extends LogRow>(before: readonly T[], after: readonly T[]): boolean {
  return before.length <= after.length && before.every((row, index) => equal(row, after[index]));
}
function containsRows(before: DomainState, after: DomainState): boolean {
  return rowTables.every(table => {
    const rows = new Map(after[table].map(row => [row.id, canonicalize(row)]));
    return before[table].every(row => rows.get(row.id) === canonicalize(row));
  });
}
function applySettings(settings: Settings, operations: readonly Operation[]): Settings {
  const result = { ...settings };
  for (const operation of operations) if (operation.kind === 'updateSettings') Object.assign(result, JSON.parse(operation.intent).changes);
  return result;
}
function extendsState(before: DomainState, after: DomainState): boolean {
  const coreBefore = ordered(before.operations); const coreAfter = ordered(after.operations);
  return prefix(coreBefore, coreAfter) && prefix(events(before), events(after)) && containsRows(before, after)
    && equal(applySettings(before.settings, coreAfter.slice(coreBefore.length)), after.settings)
    && (!before.planning || !!after.planning);
}
function sharedPrefix<T extends LogRow>(a: readonly T[], b: readonly T[]): number {
  let count = 0;
  while (count < Math.min(a.length, b.length) && a[count].id === b[count].id && equal(logPayload(a[count]), logPayload(b[count]))) count++;
  return count;
}
function disjointTails<T extends LogRow>(a: readonly T[], b: readonly T[], common: number): boolean {
  const ids = new Set(a.slice(common).map(row => row.id));
  return b.slice(common).every(row => !ids.has(row.id));
}
function settingsWrites(operations: readonly Operation[]): Partial<Settings> {
  return operations.reduce<Partial<Settings>>((result, operation) => {
    if (operation.kind === 'updateSettings') Object.assign(result, JSON.parse(operation.intent).changes);
    return result;
  }, {});
}
function planningCollides(a: readonly PlanningEvent[], b: readonly PlanningEvent[]): boolean {
  const targets = (rows: readonly PlanningEvent[]): Set<string> => new Set(rows.flatMap(row => 'reminderId' in row.command ? [row.command.reminderId] : []));
  const aTargets = targets(a);
  if ([...targets(b)].some(id => aTargets.has(id))) return true;
  const streakA = a.filter(row => row.command.type === 'setStreakAlerts').at(-1);
  const streakB = b.filter(row => row.command.type === 'setStreakAlerts').at(-1);
  return !!streakA && !!streakB && !equal(streakA.command, streakB.command);
}

/**
 * Merge only histories representable by the existing linear audit model.
 * Original rows are retained, except candidate-local log sequences. The caller
 * must archive both original branches before committing a merged candidate.
 * No replay, timestamp winner, revision rebase or speculative mutation occurs.
 */
export function mergeSyncStates(local: DomainState, remote: DomainState): SyncMergeResult {
  try { validateState(local); validateState(remote); } catch { return conflict(); }
  if (!equal(local.meta, remote.meta)) return conflict('different-dataset');
  if (equal(local, remote)) return { kind: 'same', state: local };

  // Identity covers every actual row across tables, including cross-table IDs.
  // Log sequence alone is local ordering metadata, not operation identity.
  const identities = new Map<string, { table: string; row: { id: string } }>();
  for (const state of [local, remote]) {
    for (const table of [...rowTables, 'operations', 'planning'] as const) {
      const rows = table === 'planning' ? events(state) : state[table];
      for (const row of rows) {
        const before = identities.get(row.id);
        if (before) {
          const payload = table === 'operations' || table === 'planning' ? logPayload(row as LogRow) : row;
          const previous = before.table === 'operations' || before.table === 'planning' ? logPayload(before.row as LogRow) : before.row;
          if (before.table !== table || !equal(previous, payload)) return conflict('identity-collision');
        } else identities.set(row.id, { table, row });
      }
    }
  }
  if (extendsState(local, remote)) return { kind: 'remote', state: remote };
  if (extendsState(remote, local)) return { kind: 'local', state: local };

  const localCore = ordered(local.operations); const remoteCore = ordered(remote.operations);
  const localPlanning = events(local); const remotePlanning = events(remote);
  const commonCore = sharedPrefix(localCore, remoteCore); const commonPlanning = sharedPrefix(localPlanning, remotePlanning);
  if (!disjointTails(localCore, remoteCore, commonCore) || !disjointTails(localPlanning, remotePlanning, commonPlanning)) return conflict();
  const localSettings = settingsWrites(localCore.slice(commonCore)); const remoteSettings = settingsWrites(remoteCore.slice(commonCore));
  for (const key of Object.keys(local.settings) as (keyof Settings)[]) {
    if (Object.hasOwn(localSettings, key) && Object.hasOwn(remoteSettings, key) && localSettings[key] !== remoteSettings[key]) return conflict();
    if (!Object.hasOwn(localSettings, key) && !Object.hasOwn(remoteSettings, key) && local.settings[key] !== remote.settings[key]) return conflict();
  }
  if (planningCollides(localPlanning.slice(commonPlanning), remotePlanning.slice(commonPlanning))) return conflict();

  // Stable ordering makes independently computed merge candidates identical.
  const localKey = `${localCore[commonCore]?.id ?? ''}:${localPlanning[commonPlanning]?.id ?? ''}`;
  const remoteKey = `${remoteCore[commonCore]?.id ?? ''}:${remotePlanning[commonPlanning]?.id ?? ''}`;
  const [first, second] = localKey < remoteKey ? [local, remote] : [remote, local];
  const firstCore = ordered(first.operations); const secondCore = ordered(second.operations);
  const firstPlanning = events(first); const secondPlanning = events(second);
  const candidate: DomainState = {
    meta: { ...first.meta },
    activities: [], activityRevisions: [], entries: [], entryRevisions: [],
    operations: [...firstCore, ...secondCore.slice(commonCore)].map((row, index) => ({ ...row, sequence: index + 1 })),
    settings: applySettings(first.settings, secondCore.slice(commonCore)),
    ...(first.planning || second.planning ? { planning: { events: [...firstPlanning, ...secondPlanning.slice(commonPlanning)].map((row, index) => ({ ...row, sequence: index + 1 })) } } : {}),
  };
  for (const table of rowTables) {
    const seen = new Set(first[table].map(row => row.id));
    // Row unions are assigned independently to retain each table's precise type.
    Object.assign(candidate, { [table]: [...first[table], ...second[table].filter(row => !seen.has(row.id))] });
  }
  try { validateState(candidate); } catch { return conflict(); }
  return { kind: 'merged', state: candidate };
}
