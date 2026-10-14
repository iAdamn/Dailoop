import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { MIGRATION_1, MIGRATION_2, migrate } from '../src/infrastructure/schema';

const hash=async(s:string)=>createHash('sha256').update(s).digest('hex');
function database(){
  const raw=new DatabaseSync(':memory:');
  const adapter={
    execAsync:async(sql:string)=>{raw.exec(sql);},
    runAsync:async(sql:string,...params:any[])=>raw.prepare(sql).run(...params),
    getFirstAsync:async(sql:string,...params:any[])=>raw.prepare(sql).get(...params)??null,
    getAllAsync:async(sql:string,...params:any[])=>raw.prepare(sql).all(...params),
    withTransactionAsync:async(work:()=>Promise<void>)=>{raw.exec('BEGIN');try{await work();raw.exec('COMMIT');}catch(error){raw.exec('ROLLBACK');throw error;}},
  };
  return {raw,adapter:adapter as unknown as SQLiteDatabase};
}
test('real SQLite schema migration is repeatable and rejects modified receipts / future versions',async()=>{
  const {raw,adapter}=database();try{
    await migrate(adapter,hash);await migrate(adapter,hash);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()!.n,2);
    raw.exec("UPDATE schema_migrations SET checksum='changed'");
    await assert.rejects(migrate(adapter,hash),/migración no coincide/);
    raw.exec('PRAGMA user_version=99');
    await assert.rejects(migrate(adapter,hash),/versión más nueva/);
    assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,99);
  }finally{raw.close();}
});
test('failed migration rolls back its DDL and receipt, preserving existing data',async()=>{
  const {raw,adapter}=database();try{
    raw.exec("CREATE TABLE activities(id TEXT PRIMARY KEY,json TEXT);INSERT INTO activities VALUES('old','preserved');");
    await assert.rejects(migrate(adapter,hash));
    assert.equal(raw.prepare("SELECT json FROM activities WHERE id='old'").get()!.json,'preserved');
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='schema_migrations'").get()!.n,0);
    assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,0);
  }finally{raw.close();}
});
test('append-only SQL rejects identity and revision mutation and enforces foreign keys',async()=>{
  const {raw,adapter}=database();try{
    await migrate(adapter,hash);
    raw.exec("INSERT INTO operations VALUES('op',1,'{}');INSERT INTO activities VALUES('activity','{}');INSERT INTO activity_revisions VALUES('rev','activity',1,NULL,'op','{}');");
    for(const table of ['activities','activity_revisions','operations']) {
      assert.throws(()=>raw.exec(`DELETE FROM ${table}`),/Append-only/);
      assert.throws(()=>raw.exec(`UPDATE ${table} SET json='changed'`),/Append-only/);
    }
    assert.throws(()=>raw.exec("INSERT INTO entries VALUES('orphan','missing','op','{}')"),/FOREIGN KEY/);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM activity_revisions').get()!.n,1);
  }finally{raw.close();}
});

async function legacyDatabase(raw:DatabaseSync) {
  raw.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at_ms INTEGER NOT NULL,checksum TEXT NOT NULL);');
  raw.exec(MIGRATION_1);
  raw.prepare('INSERT INTO schema_migrations VALUES(1,?,?)').run(1,await hash(MIGRATION_1));
  raw.exec("INSERT INTO activities VALUES('legacy-activity','preserved activity');PRAGMA user_version=1;");
}

test('physical schema 1 upgrades to 2 without rewriting old rows or the first receipt',async()=>{
  const {raw,adapter}=database();try{
    await legacyDatabase(raw);
    const first=raw.prepare('SELECT * FROM schema_migrations WHERE version=1').get();
    await migrate(adapter,hash);await migrate(adapter,hash);
    assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,2);
    assert.deepEqual(raw.prepare('SELECT * FROM schema_migrations WHERE version=1').get(),first);
    assert.equal(raw.prepare("SELECT json FROM activities WHERE id='legacy-activity'").get()!.json,'preserved activity');
    assert.equal(raw.prepare('SELECT checksum FROM schema_migrations WHERE version=2').get()!.checksum,await hash(MIGRATION_2));
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_events').get()!.n,0);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_meta').get()!.n,0);
  }finally{raw.close();}
});

test('failed schema 2 DDL rolls back its tables, triggers and receipt while retaining the complete schema 1 dataset',async()=>{
  const {raw,adapter}=database();try{
    await legacyDatabase(raw);
    const before=raw.prepare('SELECT * FROM schema_migrations').all();
    const failed={...adapter,execAsync:async(sql:string)=>{
      // Execute all new DDL first, then make SQLite reject the same transaction.
      raw.exec(sql===MIGRATION_2?`${sql}\nTHIS IS INVALID DDL;`:sql);
    }} as SQLiteDatabase;
    await assert.rejects(migrate(failed,hash),/syntax/);
    assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,1);
    assert.deepEqual(raw.prepare('SELECT * FROM schema_migrations').all(),before);
    assert.equal(raw.prepare("SELECT json FROM activities WHERE id='legacy-activity'").get()!.json,'preserved activity');
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'planning_%'").get()!.n,0);
    await migrate(adapter,hash);
    assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,2);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()!.n,2);
  }finally{raw.close();}
});

test('planning events are append-only in real SQLite and reject duplicate IDs or sequences',async()=>{
  const {raw,adapter}=database();try{
    await migrate(adapter,hash);
    raw.exec("INSERT INTO planning_events VALUES('event-1',1,'{}');");
    assert.throws(()=>raw.exec("UPDATE planning_events SET json='changed'"),/Append-only/);
    assert.throws(()=>raw.exec('DELETE FROM planning_events'),/Append-only/);
    assert.throws(()=>raw.exec("INSERT INTO planning_events VALUES('event-1',2,'{}')"),/UNIQUE/);
    assert.throws(()=>raw.exec("INSERT INTO planning_events VALUES('event-2',1,'{}')"),/UNIQUE/);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_events').get()!.n,1);
    raw.exec("UPDATE schema_migrations SET checksum='tampered-second' WHERE version=2");
    await assert.rejects(migrate(adapter,hash),/migración no coincide/);
    assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version,2);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM planning_events').get()!.n,1);
  }finally{raw.close();}
});
