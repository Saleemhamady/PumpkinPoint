// Autosave in IndexedDB (room for pictures), falling back to localStorage.

import type { Project } from '../shared/types.ts';
import { normalizeProject } from './state.ts';

const DB = 'pumpkinpoint';
const STORE = 'kv';
const KEY = 'project';
const LEGACY_KEY = 'pumpkinpoint:project';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadProject(): Promise<Project | null> {
  try {
    const saved = await idb<unknown>('readonly', (s) => s.get(KEY));
    if (saved) return normalizeProject(saved);
  } catch {
    /* fall through to localStorage */
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return normalizeProject(JSON.parse(legacy));
  } catch {
    /* nothing saved */
  }
  return null;
}

/** Returns false when the project could not be stored anywhere. */
export async function saveProject(project: Project): Promise<boolean> {
  try {
    await idb('readwrite', (s) => s.put(project, KEY));
    return true;
  } catch {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(project));
      return true;
    } catch {
      return false;
    }
  }
}
