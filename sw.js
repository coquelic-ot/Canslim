// CAN SLIM Service Worker — adds Cache-Control: no-store to prevent bfcache
const SW_VERSION = '3';

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
      fetch(e.request, { cache: 'no-store' }).then(async resp => {
        // Cache-Control: no-store on the response opts this page out of bfcache entirely
        const headers = new Headers(resp.headers);
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        const body = await resp.arrayBuffer();
        return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
      }).catch(() => fetch(e.request))
    );
  }
});
