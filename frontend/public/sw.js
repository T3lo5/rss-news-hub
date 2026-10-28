/*
 * Service worker do RSS News Hub.
 *
 * Este arquivo é um template: o plugin `rss-pwa-sw` em frontend/vite.config.js
 * injeta a versão e a lista de precache a cada build. A versão do cache
 * vem do hash dos assets, então todo deploy invalida o cache antigo.
 *
 * Regras:
 *   - /api/*, /health e qualquer não-GET: network-only (JWT e dados privados
 *     nunca entram no cache);
 *   - navegação: network-first com fallback para o shell cacheado;
 *   - /assets/* (hash no nome): cache-first, imutáveis.
 *   - background-sync: filas de mutações offline (bookmark, read, telegram)
 *   - periodic-sync: busca periódica de feeds
 *   - push: notificações do servidor (ex.: digest "you missed")
 *
 * Atualização: o SW novo fica em "waiting" em vez de assumir na hora. A
 * página avisa e, quando o usuário clica em recarregar, manda SKIP_WAITING.
 */

const VERSION = '__BUILD_VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `rss-news-hub-${VERSION}`;

// Sync tags used by the app
const SYNC_TAGS = {
  BOOKMARK: 'bookmark-sync',
  READ: 'read-sync',
  TELEGRAM: 'telegram-sync',
  FEED_FETCH: 'feed-fetch-sync',
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ─── Background Sync ────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAGS.BOOKMARK) {
    event.waitUntil(processBookmarkQueue());
  } else if (event.tag === SYNC_TAGS.READ) {
    event.waitUntil(processReadQueue());
  } else if (event.tag === SYNC_TAGS.TELEGRAM) {
    event.waitUntil(processTelegramQueue());
  } else if (event.tag === SYNC_TAGS.FEED_FETCH) {
    event.waitUntil(fetchFeedsInBackground());
  }
});

// ─── Periodic Background Sync ───────────────────────────────────────────────

self.addEventListener('periodicsync', (event) => {
  if (event.tag === SYNC_TAGS.FEED_FETCH) {
    event.waitUntil(fetchFeedsInBackground());
  }
});

// ─── Push Notifications ─────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'RSS News Hub';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'news-hub-notification',
    data: data.url ? { url: data.url } : undefined,
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Try to focus existing window
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/index.html', response.clone());
    return response;
  } catch {
    const cached = (await cache.match('/index.html')) || (await cache.match('/'));
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// ─── Background Sync Handlers ───────────────────────────────────────────────

async function processBookmarkQueue() {
  const queue = await getQueue('bookmarks');
  if (!queue.length) return;

  for (const item of queue) {
    try {
      const res = await fetch(`/api/bookmarks/${item.newsId}`, {
        method: item.action === 'add' ? 'POST' : 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        await removeFromQueue('bookmarks', item.id);
      }
    } catch {
      // Keep in queue for next sync
      break;
    }
  }

  // Re-register sync if items remain
  const remaining = await getQueue('bookmarks');
  if (remaining.length && 'sync' in self.registration) {
    await self.registration.sync.register(SYNC_TAGS.BOOKMARK);
  }
}

async function processReadQueue() {
  const queue = await getQueue('reads');
  if (!queue.length) return;

  for (const item of queue) {
    try {
      const res = await fetch(`/api/news/${encodeURIComponent(item.newsId)}/read`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (res.ok) {
        await removeFromQueue('reads', item.id);
      }
    } catch {
      break;
    }
  }

  const remaining = await getQueue('reads');
  if (remaining.length && 'sync' in self.registration) {
    await self.registration.sync.register(SYNC_TAGS.READ);
  }
}

async function processTelegramQueue() {
  const queue = await getQueue('telegram');
  if (!queue.length) return;

  for (const item of queue) {
    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
        credentials: 'include',
      });
      if (res.ok) {
        await removeFromQueue('telegram', item.id);
      }
    } catch {
      break;
    }
  }

  const remaining = await getQueue('telegram');
  if (remaining.length && 'sync' in self.registration) {
    await self.registration.sync.register(SYNC_TAGS.TELEGRAM);
  }
}

async function fetchFeedsInBackground() {
  try {
    await fetch('/api/rss/fetch', { method: 'POST', credentials: 'include' });
  } catch {
    // Silent failure; will retry on next periodic sync
  }
}

// ─── IndexedDB Queue Helpers ────────────────────────────────────────────────

const QUEUE_DB = 'rss-news-hub-queues';
const QUEUE_VERSION = 1;

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, QUEUE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ['bookmarks', 'reads', 'telegram'].forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Queue DB open failed'));
  });
}

async function addToQueue(storeName, item) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).add({ ...item, createdAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getQueue(storeName) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromQueue(storeName, id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
