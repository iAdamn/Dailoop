import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { isAppLanguage, type AppLanguage } from '../i18n/core';
import { LIMITS } from '../domain/types';

export type ActivityColumns = 1 | 2 | 3 | 4;
export type HomeListMode = 'activities' | 'categories';
export interface SensoryPreferences { haptics: boolean; sounds: boolean; navigationSounds: boolean; confirmationSounds: boolean; notificationSounds: boolean }
export interface ActivityLayout { order: string[]; pinned: string[] }
export interface PresentationPreferences { activityColumns: ActivityColumns; homeListMode: HomeListMode; language?: AppLanguage; sensory?: SensoryPreferences; activityLayouts?: Record<string, ActivityLayout> }
export const defaultSensoryPreferences: Readonly<SensoryPreferences> = { haptics: true, sounds: true, navigationSounds: true, confirmationSounds: true, notificationSounds: true };
export function sensoryPreferences(value: Pick<PresentationPreferences, 'sensory'>): SensoryPreferences { return { ...defaultSensoryPreferences, ...value.sensory }; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LAYOUT_IDS = LIMITS.entries;
function cleanIds(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && uuid.test(id)))].slice(0, MAX_LAYOUT_IDS) : []; }
export function cleanActivityLayout(value: unknown): ActivityLayout {
  const source = value && typeof value === 'object' ? value as Partial<ActivityLayout> : {};
  return { order: cleanIds(source.order), pinned: cleanIds(source.pinned) };
}
function cleanSensory(value: unknown): SensoryPreferences {
  const result = { ...defaultSensoryPreferences };
  if (value && typeof value === 'object') for (const key of Object.keys(result) as (keyof SensoryPreferences)[]) {
    const flag = (value as Record<string, unknown>)[key]; if (typeof flag === 'boolean') result[key] = flag;
  }
  return result;
}
export const defaultPresentationPreferences: PresentationPreferences = { activityColumns: 1, homeListMode: 'activities' };
const storageKey = 'dailoop.presentation.v1';

export function parsePresentationPreferences(value: string | null): PresentationPreferences {
  try {
    const parsed = JSON.parse(value || '{}');
    const columns: unknown = parsed?.activityColumns;
    const layouts: Record<string, ActivityLayout> = {};
    if (parsed?.activityLayouts && typeof parsed.activityLayouts === 'object' && !Array.isArray(parsed.activityLayouts)) {
      for (const [id, value] of Object.entries(parsed.activityLayouts).filter(([id]) => uuid.test(id)).slice(-8)) layouts[id] = cleanActivityLayout(value);
    }
    return {
      activityColumns: columns === 1 || columns === 2 || columns === 3 || columns === 4 ? columns : 1,
      homeListMode: parsed?.homeListMode === 'categories' ? 'categories' : 'activities',
      ...(isAppLanguage(parsed?.language) ? { language: parsed.language } : {}),
      ...(parsed?.sensory && typeof parsed.sensory === 'object' ? { sensory: cleanSensory(parsed.sensory) } : {}),
      ...(Object.keys(layouts).length ? { activityLayouts: layouts } : {}),
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
  current() { return this.value; }
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
  setLanguage(language: AppLanguage) {
    if (!isAppLanguage(language)) return Promise.reject(new Error('Selecciona español, inglés o portugués.'));
    return this.set({ language });
  }
  setSensory(changes: Partial<SensoryPreferences>) {
    return this.set(current => ({ sensory: cleanSensory({ ...sensoryPreferences(current), ...changes }) }));
  }
  setActivityLayout(databaseId: string, layout: ActivityLayout) {
    if (!uuid.test(databaseId)) return Promise.reject(new Error('Identificador de base no válido.'));
    return this.set(current => {
      const next = { ...current.activityLayouts };
      delete next[databaseId]; next[databaseId] = cleanActivityLayout(layout);
      const activityLayouts = Object.fromEntries(Object.entries(next).slice(-8));
      return { activityLayouts };
    });
  }
  private set(changes: Partial<PresentationPreferences> | ((current: PresentationPreferences) => Partial<PresentationPreferences>)) {
    return this.serial(async () => {
      const value = { ...this.value, ...(typeof changes === 'function' ? changes(this.value) : changes) };
      const json = JSON.stringify(value);
      if (Platform.OS === 'web') localStorage.setItem(storageKey, json);
      else await (await this.db()).runAsync('INSERT INTO presentation_preferences(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json', json);
      return this.publish(value);
    });
  }
}

const shared = globalThis as typeof globalThis & { __dailoopPresentation?: PresentationPreferencesStore };
export const presentationPreferences = shared.__dailoopPresentation ??= new PresentationPreferencesStore();
