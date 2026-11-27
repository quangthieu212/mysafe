const SHELL_CACHE = 'ksv-shell-v1';
const STATIC_CACHE = 'ksv-static-v1';
const APP_SHELL = '/';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.add(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('ksv-') && key !== SHELL_CACHE && key !== STATIC_CACHE).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(STATIC_CACHE).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
    return;
  }

  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok) await (await caches.open(SHELL_CACHE)).put(APP_SHELL, response.clone());
      return response;
    }).catch(async () => (await caches.match(APP_SHELL)) || Response.error()));
  }
});
