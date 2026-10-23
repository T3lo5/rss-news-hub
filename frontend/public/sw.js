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
 */

const VERSION = '__BUILD_VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `rss-news-hub-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
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
