/* ============================================
   ShopPro POS - Progressive Web App (PWA)
   Service Worker (sw.js) v2.0
   Enables offline-first selling, instant asset caching, and notifications
   ============================================ */

const CACHE_NAME = 'shoppro-pos-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/api-client.js',
  '/js/pos.js',
  '/js/products.js',
  '/js/orders.js',
  '/js/customers.js',
  '/js/reports.js',
  '/js/settings.js',
  '/js/offline-store.js',
  '/js/i18n.js',
  '/js/pdf-exporter.js',
  '/manifest.json',
  '/icon.svg',
  '/scanner-client.css',
  '/scanner-client.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching ShopPro POS shell assets');
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to pre-cache (non-critical):', err);
      });
    }).then(() => self.skipWaiting())
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

  // Network-First for HTML navigation
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match('/index.html') || caches.match(event.request))
    );
    return;
  }

  // Stale-While-Revalidate for CSS, JS, fonts, images
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
