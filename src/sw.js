/* ============================================
   ShopPro POS - Progressive Web App (PWA)
   Service Worker (sw.js) v2.0
   Enables offline-first selling, instant asset caching, and notifications
   ============================================ */

const CACHE_NAME = 'shoppro-pos-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js?v=2.2.0',
  './js/api-client.js?v=2.2.0',
  './js/pos.js?v=2.2.0',
  './js/products.js?v=2.2.0',
  './js/orders.js?v=2.2.0',
  './js/customers.js?v=2.2.0',
  './js/reports.js?v=2.2.0',
  './js/settings.js?v=2.2.0',
  './js/offline-store.js?v=2.2.0',
  './js/i18n.js?v=2.2.0',
  './js/pdf-exporter.js?v=2.2.0',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching ShopPro POS shell assets (v4)');
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to pre-cache (non-critical):', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing deprecated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET, WebSockets, and SSE streams
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/events/sse') ||
    url.pathname.startsWith('/ws')
  ) {
    return;
  }

  // Network-First for HTML navigation and JS files (ensures updates apply immediately)
  if (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request) || caches.match('./index.html') || caches.match('/index.html'))
    );
    return;
  }

  // Stale-While-Revalidate for CSS, fonts, images
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  let data = { title: 'ShopPro POS', body: 'Có thông báo mới từ hệ thống' };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [200, 100, 200]
    })
  );
});
