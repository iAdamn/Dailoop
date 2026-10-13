import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { digest } from '../src/infrastructure/crypto';
import { migrate } from '../src/infrastructure/schema';

export default function Spike() {
  const [result,setResult] = useState('Pendiente');
  async function run() {
    setResult('Ejecutando');
    let db: SQLite.SQLiteDatabase | undefined;
    try {
      db = await SQLite.openDatabaseAsync('dailoop-spike-v1.db');
      await migrate(db,digest);
      await db.execAsync('CREATE TABLE IF NOT EXISTS spike_probe(id INTEGER PRIMARY KEY, value INTEGER NOT NULL); INSERT OR IGNORE INTO spike_probe VALUES(1,0);');
      const before = await db.getFirstAsync<{value:number}>('SELECT value FROM spike_probe WHERE id=1');
      await db.withTransactionAsync(async () => { await db!.execAsync('UPDATE spike_probe SET value=value+1 WHERE id=1'); });
      let rolledBack = false;
      try { await db.withTransactionAsync(async () => { await db!.execAsync('UPDATE spike_probe SET value=99999 WHERE id=1'); throw new Error('Injected rollback'); }); } catch { rolledBack = true; }
      const after = await db.getFirstAsync<{value:number}>('SELECT value FROM spike_probe WHERE id=1');
      await db.closeAsync(); db = await SQLite.openDatabaseAsync('dailoop-spike-v1.db');
      await migrate(db,digest);
      const reopened = await db.getFirstAsync<{value:number}>('SELECT value FROM spike_probe WHERE id=1');
      const integrity = await db.getFirstAsync<{integrity_check:string}>('PRAGMA integrity_check');
      setResult(JSON.stringify({platform:Platform.OS,isolated:globalThis.crossOriginIsolated,previous:before?.value,value:after?.value,commit:after?.value === (before?.value??0)+1,rollback:rolledBack && after?.value !== 99999,reopen:reopened?.value===after?.value,migration:true,integrity:integrity?.integrity_check}));
    } catch(e) { setResult(JSON.stringify({error:e instanceof Error? e.message:String(e)})); }
    finally { await db?.closeAsync().catch(()=>{}); }
  }
  if (!__DEV__) return <Text>Ruta no disponible.</Text>;
  return <ScrollView contentContainerStyle={{padding:32,gap:24}}><Text style={{fontSize:28}}>Dailoop · Prueba de SQLite Web</Text><Pressable accessibilityRole="button" onPress={run} style={{backgroundColor:'#23263A',padding:20,borderRadius:16}}><Text style={{color:'#F7F7FC'}}>Ejecutar prueba SQLite</Text></Pressable><Text selectable testID="spike-result">{result}</Text></ScrollView>;
}
