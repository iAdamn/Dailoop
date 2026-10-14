/** Portable domain data. Times are UTC milliseconds; all persisted IDs are UUIDs. */
// Keep every original value valid for existing activities, history and backups.
export const COLORS = ['#6F5BFF', '#9A7CFF', '#DCCFFF', '#8FD8FF', '#F7F7FC', '#23263A',
  '#F4B2B8', '#F4BBA8', '#F6C9A2', '#F6D7A1', '#F3E6A2', '#DCE9AA',
  '#B8DFBA', '#A9DFD2', '#AFD3F6', '#BCC6F5', '#D3BEF4', '#E7B7DB'] as const;
export type Color = typeof COLORS[number];
export type Theme = 'system' | 'light' | 'dark';
export interface Settings { zone: string; hourFormat: '24h' | '12h'; weekStartsOn: 1; theme: Theme }
export interface Meta { databaseId: string; schemaVersion: 1; formatVersion: 1; createdAtMs: number }
export interface Activity { id: string; createdAtMs: number }
export interface ActivityFields { name: string; emoji: string; color: Color; isPrivate: boolean; isArchived: boolean; sortOrder: number; category: string | null }
export interface ActivityRevision extends ActivityFields { id: string; activityId: string; revisionNo: number; previousRevisionId: string | null; operationId: string; recordedAtMs: number }
export interface Entry { id: string; activityId: string; createdAtMs: number; creationOperationId: string }
export type RevisionKind = 'create' | 'correct' | 'void' | 'restore';
export interface EntryRevision { id: string; entryId: string; revisionNo: number; previousRevisionId: string | null; operationId: string; kind: RevisionKind; occurredAtMs: number; occurredZone: string; occurredOffsetMinutes: number; occurredOffsetSeconds?: number; note: string; state: 'active' | 'void'; activityRevisionId: string; recordedAtMs: number; reason: string }
export interface Operation { id: string; kind: Command['type']; sequence: number; recordedAtMs: number; intent: string; entityId: string | null }
export interface DomainState { meta: Meta; activities: Activity[]; activityRevisions: ActivityRevision[]; entries: Entry[]; entryRevisions: EntryRevision[]; operations: Operation[]; settings: Settings }
export interface CurrentActivity extends ActivityFields { id: string; createdAtMs: number; revisionId: string; revisionNo: number }
export interface EffectiveEntry { id: string; activityId: string; createdAtMs: number; revision: EntryRevision; sequence: number; activity: CurrentActivity }
export type Command =
  | { type: 'createActivity'; name: string; emoji: string; color: Color; isPrivate?: boolean; category?: string | null; id?: string }
  | { type: 'updateActivity'; activityId: string; changes: Partial<ActivityFields> }
  | { type: 'createEntry'; activityId: string; occurredAtMs?: number; occurredZone?: string; note?: string; id?: string }
  | { type: 'correctEntry'; entryId: string; occurredAtMs?: number; occurredZone?: string; note?: string; reason?: string }
  | { type: 'voidEntry'; entryId: string; reason?: string }
  | { type: 'restoreEntry'; entryId: string; reason?: string }
  | { type: 'updateSettings'; changes: Partial<Settings> };
export interface CommandContext { nowMs: number; operationId: string; nextId(): string }
export interface ChangeSet { activities: Activity[]; activityRevisions: ActivityRevision[]; entries: Entry[]; entryRevisions: EntryRevision[]; operations: Operation[]; settings: Settings | null; activityIds: string[]; entryIds: string[] }
export interface CommandResult { state: DomainState; changeSet: ChangeSet; result: { activityId?: string; entryId?: string; replayed: boolean } }
export interface EntryFilter { activityIds?: readonly string[]; fromMs?: number; toMs?: number; includeVoided?: boolean; atSequence?: number }
export type PeriodKind = 'day' | 'week' | 'month' | 'range';
export interface Period { kind: PeriodKind; from: string; to: string; zone: string; startMs: number; endMs: number; partial: boolean }
export interface ReportOptions { from: string; to: string; zone: string; kind?: PeriodKind; selectedActivityIds: readonly string[]; explicitPrivateActivityIds?: readonly string[]; includeNotes?: boolean; includeHours?: boolean; includeAudit?: boolean; includeVoidedAudit?: boolean; includeIds?: boolean; generatedAtMs: number }
export interface ReportItem { date: string; activity: string; emoji: string; time?: string; note?: string; corrected: boolean; id?: string }
export interface ReportAudit { activity: string; entryId?: string; revisions: { kind: RevisionKind; date: string; time?: string; recordedAt?: string; note?: string; reason?: string; state: 'active' | 'void' }[] }
export interface ReportModel { format: 'dailoop-report/1'; period: Period; generatedAtMs: number; generatedAt: string; sequence: number; selection: string[]; includeHours: boolean; includeNotes: boolean; includeAudit: boolean; includeIds: boolean; total: number; daysWithEntries: number; totalDays: number; totals: { activity: string; emoji: string; count: number }[]; items: ReportItem[]; audit: ReportAudit[]; clockWarning?: string; markdown: string; filename: string }
export interface IntervalStats { count: number; averageMs: number | null; shortestMs: number | null; longestMs: number | null }
export interface PeriodStats { total: number; perActivity: { activityId: string; count: number }[]; intervals: IntervalStats; previousTotal: number; change: number; changePercent: number | null; previousPeriod: Period }
export interface BackupCounts { activities: number; activityRevisions: number; entries: number; entryRevisions: number; operations: number }
export interface BackupFile { format: 'dailoop-backup'; formatVersion: 1; schemaVersion: 1; backupId: string; databaseId: string; exportedAt: string; appVersion: string; scope: 'full'; counts: BackupCounts; payload: DomainState; digest: string }
export type Digest = (canonicalUtf8: string) => Promise<string>;
export interface BackupOptions { backupId: string; exportedAtMs: number; appVersion: string }
export interface ParsedBackup { backup: BackupFile; state: DomainState; summary: BackupCounts & { databaseId: string; backupId: string; exportedAt: string; firstOccurredAtMs: number | null; lastOccurredAtMs: number | null } }
export const LIMITS = { backupBytes: 50 * 1024 * 1024, entries: 200_000, revisions: 1_000_000, nameGraphemes: 80, noteGraphemes: 2_000, nameBytes: 8_192, noteBytes: 65_536 } as const;
