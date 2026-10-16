export interface CloudAccount { uid: string; email: string; displayName: string }
export type CloudSyncStatus = 'not-configured' | 'disconnected' | 'paused' | 'idle' | 'syncing' | 'offline' | 'conflict' | 'error';
export interface SyncConflictSummary { reason: string; localActivities: number; localEntries: number; remoteActivities: number; remoteEntries: number }
export interface RecoveryCopy { version: string; createdAt?: number; activities?: number; entries?: number }
export interface CloudSyncView {
  configured: boolean;
  account: CloudAccount | null;
  status: CloudSyncStatus;
  enabled: boolean;
  lastSyncedAt: number | null;
  pending: boolean;
  error: string | null;
  conflict: SyncConflictSummary | null;
  boundToOtherAccount: boolean;
  readOnly: boolean;
  demo: boolean;
  recoveryCopies?: RecoveryCopy[];
  deletionReady?: boolean;
  deleting?: boolean;
}
export interface CloudSyncActions {
  signIn(): Promise<void>;
  enable(): Promise<void>;
  pause(): Promise<void>;
  synchronize(): Promise<void>;
  signOut(): Promise<void>;
  resolve(side: 'local' | 'remote'): Promise<void>;
  exportConflict(side: 'local' | 'remote'): Promise<void>;
  exportRecoveryCopy?(version: string): Promise<void>;
  loadRecoveryCopies?(): Promise<void>;
  prepareDeletion?(): Promise<void>;
  cancelDeletion?(): void;
  deleteAccount?(keepLocal: boolean): Promise<void>;
  detachLocalData?(): Promise<void>;
}
export interface CloudSyncProps { view: CloudSyncView; actions: CloudSyncActions }
