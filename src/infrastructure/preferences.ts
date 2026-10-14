import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

export type ActivityColumns = 1 | 2 | 3 | 4;
export type HomeListMode = 'activities' | 'categories';
export interface PresentationPreferences { activityColumns: ActivityColumns; homeListMode: HomeListMode }
export const defaultPresentationPreferences: PresentationPreferences = { activityColumns: 1, homeListMode: 'activities' };
const storageKey = 'dailoop.presentation.v1';

export function parsePresentationPreferences(value: string | null): PresentationPreferences {
  try {
    const parsed = JSON.parse(value || '{}');
    const columns: unknown = parsed?.activityColumns;
    return {
      activityColumns: columns === 1 || columns === 2 || columns === 3 || columns === 4 ? columns : 1,
      homeListMode: parsed?.homeListMode === 'categories' ? 'categories' : 'activities',
    };
  } catch { /* Only presentation preferences may recover to defaults; never personal data. */ }
  return { ...defaultPresentationPreferences };
}

/** Device preferences deliberately stay outside the portable, audited dataset. */
class PresentationPreferencesStore {
  private database?: Promise<SQLite.SQLiteDatabase>;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(value: PresentationPreferences) => void>();
  private value = { ...defaultPresentationPreferences };
  private listening = false;

  private db() {
    return this.database ??= (async () => {
      const db = await SQLite.openDatabaseAsync('dailoop-presentation-v1.db');
      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((version?.user_version ?? 0) > 1) throw new Error('Las preferencias pertenecen a una versión más reciente.');
      await db.withTransactionAsync(async () => {
        await db.execAsync('CREATE TABLE IF NOT EXISTS presentation_preferences (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL); PRAGMA user_version=1;');
      });
      return db;
    })();
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private publish(value: PresentationPreferences) {
    this.value = value;
    this.listeners.forEach(listener => listener(value));
    return value;
  }
  subscribe(listener: (value: PresentationPreferences) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  load() {
    return this.serial(async () => {
      if (Platform.OS === 'web') {
        // Preferences contain no records. localStorage avoids another OPFS owner/lock
        // and lets read-only data tabs share presentation without opening SQLite twice.
        if (!this.listening) {
          window.addEventListener('storage', event => {
            if (event.key === storageKey || event.key === null) this.publish(parsePresentationPreferences(localStorage.getItem(storageKey)));
          });
          this.listening = true;
        }
        return this.publish(parsePresentationPreferences(localStorage.getItem(storageKey)));
      }
      const row = await (await this.db()).getFirstAsync<{ json: string }>('SELECT json FROM presentation_preferences WHERE id=1');
      return this.publish(parsePresentationPreferences(row?.json ?? null));
    });
  }
  setColumns(activityColumns: ActivityColumns) {
    if (![1, 2, 3, 4].includes(activityColumns)) return Promise.reject(new Error('Selecciona de una a cuatro columnas.'));
    return this.set({ activityColumns });
  }
  setHomeListMode(homeListMode: HomeListMode) {
    if (homeListMode !== 'activities' && homeListMode !== 'categories') return Promise.reject(new Error('Selecciona actividades o categorías.'));
    return this.set({ homeListMode });
  }
  private set(changes: Partial<PresentationPreferences>) {
    return this.serial(async () => {
      const value = { ...this.value, ...changes };
      const json = JSON.stringify(value);
      if (Platform.OS === 'web') localStorage.setItem(storageKey, json);
      else await (await this.db()).runAsync('INSERT INTO presentation_preferences(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json', json);
      return this.publish(value);
    });
  }
}

const shared = globalThis as typeof globalThis & { __dailoopPresentation?: PresentationPreferencesStore };
export const presentationPreferences = shared.__dailoopPresentation ??= new PresentationPreferencesStore();
