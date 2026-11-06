'use client';

import { openDB } from 'idb';
import { useStorageStatus } from './status';
import type { AppSettings, AssistantDatabase, BackupData, BrowserDatabase, HistoryRecord, HistoryType } from '@/types';

export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze({ provider: 'auto', essayType: 'english1', composition: 'big', defaultFullTranslation: false, fontSize: 16 });
const memoryHistory = new Map<string, HistoryRecord>();
let memorySettings: AppSettings = { ...DEFAULT_SETTINGS };
let databasePromise: Promise<BrowserDatabase | null> | undefined;
let openedDatabase: BrowserDatabase | undefined;
let unavailable = false;

function fallBackToMemory(): void {
  unavailable = true;
  openedDatabase?.close();
  useStorageStatus.setState({ mode: 'memory' });
}

export function initializeStorage(): Promise<BrowserDatabase | null> {
  if (unavailable) return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') { fallBackToMemory(); return Promise.resolve(null); }
  databasePromise = new Promise((resolve) => {
    Promise.resolve().then(() => openDB<AssistantDatabase>('kaoyan-english-assistant', 1, {
      upgrade(db) {
        const history = db.createObjectStore('history', { keyPath: 'id' });
        history.createIndex('type', 'type'); history.createIndex('createdAt', 'createdAt');
        db.createObjectStore('settings', { keyPath: 'id' });
      },
      blocked() { fallBackToMemory(); resolve(null); },
      blocking() { fallBackToMemory(); },
      terminated() { fallBackToMemory(); },
    })).then((db) => {
      if (unavailable) { db.close(); resolve(null); return; }
      openedDatabase = db;
      useStorageStatus.setState({ mode: 'persistent' });
      resolve(db);
    }).catch(() => { fallBackToMemory(); resolve(null); });
  });
  return databasePromise;
}

async function access<T>(operation: (db: BrowserDatabase) => Promise<T>, fallback: () => T): Promise<T> {
  const db = await initializeStorage();
  if (db) {
    try { return await operation(db); }
    catch { fallBackToMemory(); }
  }
  return fallback();
}

export async function readAllHistory(): Promise<HistoryRecord[]> {
  return access(async (db) => {
    const records = await db.getAll('history');
    memoryHistory.clear(); records.forEach((record) => memoryHistory.set(record.id, structuredClone(record)));
    return records;
  }, () => structuredClone([...memoryHistory.values()]));
}

export async function readHistory(id: string): Promise<HistoryRecord | undefined> {
  return access(async (db) => {
    const record = await db.get('history', id);
    if (record) memoryHistory.set(id, structuredClone(record));
    return record;
  }, () => { const record = memoryHistory.get(id); return record ? structuredClone(record) : undefined; });
}

export async function writeHistory(record: HistoryRecord): Promise<void> {
  const copy = structuredClone(record);
  await access(async (db) => { await db.put('history', copy); }, () => undefined);
  memoryHistory.set(copy.id, copy);
}

export async function removeHistory(ids: string[]): Promise<void> {
  await access(async (db) => {
    const tx = db.transaction('history', 'readwrite');
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
  }, () => undefined);
  ids.forEach((id) => memoryHistory.delete(id));
}

export async function clearStoredHistory(type?: HistoryType): Promise<void> {
  if (type) { const records = await readAllHistory(); await removeHistory(records.filter((record) => record.type === type).map((record) => record.id)); return; }
  await access(async (db) => { await db.clear('history'); }, () => undefined);
  memoryHistory.clear();
}

export async function readSettings(): Promise<AppSettings> {
  return access(async (db) => {
    const row = await db.get('settings', 'app');
    memorySettings = row ? { provider: row.provider, essayType: row.essayType, composition: row.composition, defaultFullTranslation: row.defaultFullTranslation, fontSize: row.fontSize } : { ...DEFAULT_SETTINGS };
    return structuredClone(memorySettings);
  }, () => structuredClone(memorySettings));
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  const copy = structuredClone(settings);
  await access(async (db) => { await db.put('settings', { ...copy, id: 'app' }); }, () => undefined);
  memorySettings = copy;
}

export async function mergeStoredBackup(backup: BackupData): Promise<void> {
  const copy = structuredClone(backup);
  await access(async (db) => {
    const tx = db.transaction(['history', 'settings'], 'readwrite');
    const writes = copy.history.map((record) => tx.objectStore('history').put(record));
    await Promise.all([...writes, tx.objectStore('settings').put({ ...copy.settings, id: 'app' }), tx.done]);
  }, () => undefined);
  copy.history.forEach((record) => memoryHistory.set(record.id, record));
  memorySettings = copy.settings;
}
