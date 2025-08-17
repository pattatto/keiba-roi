// Simple offline-first Service Worker for keiba-roi
const CACHE_NAME = 'keiba-roi-cache-v4';
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './races.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-origin navigation -> serve cached index.html for offline
  if (req.mode === 'navigate' && url.origin === location.origin) {
    event.respondWith(
      caches.match('./index.html').then((res) => res || fetch(req))
    );
    return;
  }

  // Static assets: cache-first, then update in background
  const ASSET_RE = /\.(?:js|css|html|png|svg|ico|json)$/i;
  if (url.origin === location.origin && ASSET_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchAndCache = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        }).catch(() => cached || Promise.reject('offline'));
        return cached || fetchAndCache;
      })
    );
  }
});
