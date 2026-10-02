/* Service worker: makes the app work offline and handles notification buttons. */
const CACHE = 'tasks-v1.1.0';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'ai.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first, then network; refresh the cache in the background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => cached || caches.match('index.html'));
      return cached || network;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  const { taskId } = event.notification.data || {};
  const action = event.action || 'open';
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all[0];
    if (client) {
      if (taskId) client.postMessage({ type: 'notification-action', action, taskId });
      if (action === 'open' || !taskId) return client.focus();
      return undefined;
    }
    const url = new URL(self.registration.scope);
    if (taskId) { url.searchParams.set('task', taskId); url.searchParams.set('action', action); }
    return self.clients.openWindow(url.href);
  })());
});
