// CAN SLIM Service Worker — network-first for navigation, RELOAD broadcast on activate
const SW_VERSION = '2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    self.clients.claim().then(() =>
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'RELOAD' }));
      })
    )
  );
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request))
    );
  }
});
