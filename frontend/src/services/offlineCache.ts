import type { NewsCounts, NewsItem } from '../types';

/**
 * Offline snapshot of the news list, keyed by user id.
 *
 * The service worker deliberately never caches `/api/*` (private data), so the
 * last successful first page of `/api/news` is persisted here instead:
 * IndexedDB is not evicted as aggressively as the HTTP cache and holds the
 * whole payload, including the per-user `readAt`. The snapshot is read-only —
 * mutations still require the server.
 */
const DB_NAME = 'rss-news-hub';
const DB_VERSION = 1;
const STORE = 'news_snapshots';

export interface NewsSnapshot {
  userId: string;
  /** Epoch ms of the last successful fetch. */
  savedAt: number;
  items: NewsItem[];
  /** Page metadata, so counters/“x de y” stay right offline. */
  total?: number;
  counts?: NewsCounts;
  sources?: string[];
}

export interface NewsSnapshotPayload {
  items: NewsItem[];
  total: number;
  counts: NewsCounts;
  sources: string[];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
  });
}

export async function saveNewsSnapshot(
  userId: string,
  payload: NewsSnapshotPayload
): Promise<void> {
  if (!userId) return;

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({ userId, savedAt: Date.now(), ...payload });
    await complete(transaction);
  } finally {
    db.close();
  }
}

export async function readNewsSnapshot(userId: string): Promise<NewsSnapshot | null> {
  if (!userId) return null;

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(userId);
    const snapshot = await new Promise<NewsSnapshot | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as NewsSnapshot | undefined);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    });
    return snapshot?.items?.length ? snapshot : null;
  } finally {
    db.close();
  }
}

export async function clearNewsSnapshot(userId: string): Promise<void> {
  if (!userId) return;

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(userId);
    await complete(transaction);
  } finally {
    db.close();
  }
}
