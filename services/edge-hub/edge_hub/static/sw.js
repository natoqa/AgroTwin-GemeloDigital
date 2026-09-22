// Minimal service worker for the R-02 spike.
//
// It is not the real one: Workbox generates that in Phase 1. All this needs to
// prove is that Chrome accepts a service worker registration on an origin
// secured by an mkcert certificate over the LAN.

const CACHE = 'agrotwin-r02-spike-v1';
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first, so the page can be reloaded with the hub switched off.
// That is the point: the hub must never be required for the PWA to work.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => caches.match('/index.html')),
    ),
  );
});
