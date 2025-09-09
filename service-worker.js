// Minimal pass-through service worker for zazzle
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  // Transparent proxy: just pass the request along
  event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })));
});
