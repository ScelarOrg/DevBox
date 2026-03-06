// IndexedDB-backed cache for node_modules snapshots.
// Keyed by a hash of the package.json contents so stale caches auto-invalidate.

import type { VolumeSnapshot } from '../engine-types';

const DB_NAME = 'nodepod-snapshots';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface IDBSnapshotCache {
  get(packageJsonHash: string): Promise<VolumeSnapshot | null>;
  set(packageJsonHash: string, snapshot: VolumeSnapshot): Promise<void>;
  close(): void;
}

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbCleanExpired(db: IDBDatabase): void {
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    const now = Date.now();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const entry = cursor.value;
      if (entry?.createdAt && (now - entry.createdAt) > MAX_AGE_MS) {
        cursor.delete();
      }
      cursor.continue();
    };
  } catch { /* best-effort cleanup */ }
}

export async function openSnapshotCache(): Promise<IDBSnapshotCache | null> {
  const db = await openDB();
  if (!db) return null;

  // Background cleanup of expired entries
  idbCleanExpired(db);

  return {
    async get(packageJsonHash: string): Promise<VolumeSnapshot | null> {
      try {
        const entry = await idbGet(db, packageJsonHash);
        if (!entry?.snapshot) return null;
        // Check expiry
        if (entry.createdAt && (Date.now() - entry.createdAt) > MAX_AGE_MS) return null;
        return entry.snapshot as VolumeSnapshot;
      } catch {
        return null;
      }
    },

    async set(packageJsonHash: string, snapshot: VolumeSnapshot): Promise<void> {
      try {
        await idbPut(db, packageJsonHash, {
          snapshot,
          createdAt: Date.now(),
        });
      } catch { /* silently fail — cache is optional */ }
    },

    close(): void {
      try { db.close(); } catch { /* ignore */ }
    },
  };
}
