import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate } from '../src/infrastructure/schema';

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
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()!.n,1);
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
