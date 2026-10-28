/**
 * Offline mutation queue for PWA background sync.
 *
 * When the user is offline, mutations (bookmark, read, telegram send) are
 * stored in IndexedDB. When connectivity returns, the service worker's
 * background sync processes the queue.
 */

const QUEUE_DB = 'rss-news-hub-queues';
const QUEUE_VERSION = 1;
const STORES = ['bookmarks', 'reads', 'telegram'] as const;

type StoreName = (typeof STORES)[number];

interface QueuedItem<T = unknown> {
  id?: number;
  createdAt: number;
  payload: T;
}

interface BookmarkPayload {
  newsId: string;
  action: 'add' | 'remove';
}

interface ReadPayload {
  newsId: string;
  read: boolean;
}

interface TelegramPayload {
  text: string;
  parseMode?: string;
}

type Payload = BookmarkPayload | ReadPayload | TelegramPayload;

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(QUEUE_DB, QUEUE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Queue DB open failed'));
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Queue DB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Queue DB transaction aborted'));
  });
}

/** Add an item to the specified queue and register background sync. */
export async function enqueueMutation(store: StoreName, payload: Payload): Promise<void> {
  const db = await openQueueDb();
  try {
    const tx = db.transaction(store, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = tx.objectStore(store).add({ payload, createdAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await complete(tx);
  } finally {
    db.close();
  }

  // Register background sync if supported
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    const registration = await navigator.serviceWorker.ready;
    const tag = getSyncTag(store);
    try {
      await registration.sync.register(tag);
    } catch {
      // Sync registration failed (may be offline), will retry on next online event
    }
  }
}

/** Get all pending items in a queue (for UI indicators). */
export async function getPendingMutations(store: StoreName): Promise<QueuedItem[]> {
  const db = await openQueueDb();
  try {
    const tx = db.transaction(store, 'readonly');
    const items = await new Promise<QueuedItem[]>((resolve, reject) => {
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    await complete(tx);
    return items;
  } finally {
    db.close();
  }
}

/** Clear all items in a queue (e.g., after successful sync). */
export async function clearQueue(store: StoreName): Promise<void> {
  const db = await openQueueDb();
  try {
    const tx = db.transaction(store, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await complete(tx);
  } finally {
    db.close();
  }
}

/** Convenience helpers for each mutation type. */
export const offlineQueue = {
  bookmark: {
    add: (newsId: string) => enqueueMutation('bookmarks', { newsId, action: 'add' }),
    remove: (newsId: string) => enqueueMutation('bookmarks', { newsId, action: 'remove' }),
    getPending: () => getPendingMutations('bookmarks'),
    clear: () => clearQueue('bookmarks'),
  },
  read: {
    toggle: (newsId: string, read: boolean) => enqueueMutation('reads', { newsId, read }),
    getPending: () => getPendingMutations('reads'),
    clear: () => clearQueue('reads'),
  },
  telegram: {
    send: (text: string, parseMode?: string) => enqueueMutation('telegram', { text, parseMode }),
    getPending: () => getPendingMutations('telegram'),
    clear: () => clearQueue('telegram'),
  },
};

/** Map store name to sync tag used by the service worker. */
function getSyncTag(store: StoreName): string {
  switch (store) {
    case 'bookmarks':
      return 'bookmark-sync';
    case 'reads':
      return 'read-sync';
    case 'telegram':
      return 'telegram-sync';
  }
}

/** Register periodic background sync for feed fetching (if supported). */
export async function registerPeriodicFeedSync(): Promise<void> {
  if (
    !('serviceWorker' in navigator && 'periodicSync' in window.ServiceWorkerRegistration.prototype)
  ) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  try {
    await (registration as any).periodicSync.register('feed-fetch-sync', {
      minInterval: 24 * 60 * 60 * 1000, // 24 hours
    });
  } catch {
    // Periodic sync not available or permission denied
  }
}

/** Check if background sync is supported. */
export function isBackgroundSyncSupported(): boolean {
  return 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype;
}

/** Check if periodic background sync is supported. */
export function isPeriodicSyncSupported(): boolean {
  return (
    'serviceWorker' in navigator && 'periodicSync' in window.ServiceWorkerRegistration.prototype
  );
}
