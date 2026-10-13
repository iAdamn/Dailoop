import type { SQLiteDatabase } from 'expo-sqlite';

export const SCHEMA_VERSION = 1;
export const MIGRATION_1 = `
CREATE TABLE database_meta (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
CREATE TABLE operations (id TEXT PRIMARY KEY, sequence INTEGER UNIQUE NOT NULL, json TEXT NOT NULL);
CREATE TABLE activities (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE activity_revisions (
 id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id), revision_no INTEGER NOT NULL,
 previous_revision_id TEXT REFERENCES activity_revisions(id), operation_id TEXT NOT NULL REFERENCES operations(id), json TEXT NOT NULL,
 UNIQUE(activity_id,revision_no));
CREATE TABLE entries (id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id), creation_operation_id TEXT UNIQUE NOT NULL REFERENCES operations(id), json TEXT NOT NULL);
CREATE TABLE entry_revisions (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id), revision_no INTEGER NOT NULL,
 previous_revision_id TEXT REFERENCES entry_revisions(id), operation_id TEXT NOT NULL REFERENCES operations(id),
 activity_revision_id TEXT NOT NULL REFERENCES activity_revisions(id), json TEXT NOT NULL, UNIQUE(entry_id,revision_no));
CREATE TABLE activity_current (id TEXT PRIMARY KEY REFERENCES activities(id), revision_id TEXT NOT NULL REFERENCES activity_revisions(id), json TEXT NOT NULL);
CREATE TABLE entry_current (id TEXT PRIMARY KEY REFERENCES entries(id), revision_id TEXT NOT NULL REFERENCES entry_revisions(id), activity_id TEXT NOT NULL REFERENCES activities(id), state TEXT NOT NULL CHECK(state IN ('active','void')), occurred_at_ms INTEGER NOT NULL, json TEXT NOT NULL);
CREATE INDEX entry_time ON entry_current(state,occurred_at_ms);
CREATE INDEX entry_activity_time ON entry_current(activity_id,state,occurred_at_ms);
${['activities','entries','activity_revisions','entry_revisions','operations'].map(table => `
CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Append-only history'); END;
CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Append-only history'); END;`).join('\n')}
`;

/** A failed migration rolls back all DDL and its receipt. Never reset an unknown DB. */
export async function migrate(db: SQLiteDatabase, digest: (s:string)=>Promise<string>): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=4000;');
  const row = await db.getFirstAsync<{ user_version:number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version > SCHEMA_VERSION) throw new Error('Esta base pertenece a una versión más nueva de Dailoop. No se ha modificado.');
  const checksum = await digest(MIGRATION_1);
  if (version === 0) {
    await db.withTransactionAsync(async () => {
      await db.execAsync('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at_ms INTEGER NOT NULL, checksum TEXT NOT NULL);');
      await db.execAsync(MIGRATION_1);
      await db.runAsync('INSERT INTO schema_migrations VALUES(1,?,?)', Date.now(), checksum);
      await db.execAsync('PRAGMA user_version=1');
    });
  } else {
    const receipt = await db.getFirstAsync<{checksum:string}>('SELECT checksum FROM schema_migrations WHERE version=1');
    if (receipt?.checksum !== checksum) throw new Error('La migración no coincide con esta versión. Conserva la base y restaura una copia compatible.');
  }
}
