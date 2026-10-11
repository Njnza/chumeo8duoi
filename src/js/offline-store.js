/* ============================================================
   ShopPro - Offline-First & Sync Engine (IndexedDB)
   Allows POS to continue selling smoothly when internet drops
   and auto-synchronizes pending orders when back online
   ============================================================ */

(function () {
  const DB_NAME = 'ShopProOfflineDB';
  const DB_VERSION = 1;

  let dbInstance = null;

  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pending_orders')) {
          db.createObjectStore('pending_orders', { keyPath: 'local_id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };

      request.onerror = (e) => {
        console.error('[OfflineDB] Error opening IndexedDB:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // 1. Cache Products locally
  async function cacheProducts(products) {
    if (!Array.isArray(products)) return;
    try {
      const db = await openDB();
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');
      for (const p of products) {
        store.put(p);
      }
    } catch (err) {
      console.warn('[OfflineDB] Failed to cache products:', err);
    }
  }

  // 2. Get cached products when offline
  async function getCachedProducts() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('products', 'readonly');
        const store = tx.objectStore('products');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (_) {
      return [];
    }
  }

  // 3. Save pending order when offline
  async function savePendingOrder(orderData) {
    try {
      const db = await openDB();
      const tx = db.transaction('pending_orders', 'readwrite');
      const store = tx.objectStore('pending_orders');
      const localOrder = {
        ...orderData,
        is_offline: true,
        saved_at: new Date().toISOString()
      };
      return new Promise((resolve, reject) => {
        const req = store.add(localOrder);
        req.onsuccess = () => {
          updatePendingBadge();
          resolve(req.result);
        };
        req.onerror = reject;
      });
    } catch (err) {
      console.error('[OfflineDB] Error saving pending order:', err);
      throw err;
    }
  }

  // 4. Get all pending orders
  async function getPendingOrders() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('pending_orders', 'readonly');
        const store = tx.objectStore('pending_orders');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (_) {
      return [];
    }
  }

  // 5. Delete synced order
  async function removePendingOrder(localId) {
    try {
      const db = await openDB();
      const tx = db.transaction('pending_orders', 'readwrite');
      tx.objectStore('pending_orders').delete(localId);
      updatePendingBadge();
    } catch (_) {}
  }

  // 6. Synchronize pending orders to server
  let isSyncing = false;
  async function syncPendingOrders() {
    if (isSyncing || !navigator.onLine) return;
    isSyncing = true;

    try {
      const orders = await getPendingOrders();
      if (orders.length === 0) {
        isSyncing = false;
        return;
      }

      console.log(`[OfflineSync] Đang tự động đồng bộ ${orders.length} đơn hàng ngoại tuyến lên máy chủ...`);
      if (window.showToast) {
        window.showToast('info', 'Đồng bộ đơn hàng', `Đang đồng bộ ${orders.length} đơn bán khi mất mạng...`);
      }

      for (const ord of orders) {
        try {
          const { local_id, is_offline, saved_at, ...cleanDoc } = ord;
          if (window.api && typeof window.api.createOrder === 'function') {
            await window.api.createOrder(cleanDoc);
          } else {
            await fetch('/api/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(cleanDoc)
            });
          }
          await removePendingOrder(local_id);
        } catch (postErr) {
          console.warn('[OfflineSync] Failed to sync order #' + ord.local_id, postErr);
        }
      }

      const remaining = await getPendingOrders();
      if (remaining.length === 0 && window.showToast) {
        window.showToast('success', 'Đồng bộ hoàn tất', 'Tất cả đơn hàng ngoại tuyến đã được lưu trữ an toàn trên đám mây!');
      }
    } catch (err) {
      console.error('[OfflineSync] Error during sync:', err);
    } finally {
      isSyncing = false;
      updatePendingBadge();
    }
  }

  // 7. Update UI status indicator
  async function updatePendingBadge() {
    const orders = await getPendingOrders();
    const badge = document.getElementById('offlineSyncBadge');
    if (badge) {
      if (orders.length > 0) {
        badge.style.display = 'inline-flex';
        badge.innerHTML = `📡 Chờ đồng bộ: <strong>${orders.length}</strong> đơn`;
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // Listen to network status changes
  window.addEventListener('online', () => {
    console.log('[Network] Internet reconnected!');
    if (window.showToast) window.showToast('success', 'Đã kết nối Internet', 'Hệ thống tự động kích hoạt đồng bộ đám mây');
    syncPendingOrders();
  });

  window.addEventListener('offline', () => {
    console.warn('[Network] Internet connection lost! Switching to Offline Mode.');
    if (window.showToast) window.showToast('warning', 'Mất kết nối mạng', 'Hệ thống chuyển sang chế độ Ngoại Tuyến (Offline Mode). Bạn vẫn có thể bán hàng bình thường.');
  });

  // Expose global offlineStore
  window.offlineStore = {
    cacheProducts,
    getCachedProducts,
    savePendingOrder,
    getPendingOrders,
    removePendingOrder,
    syncPendingOrders,
    updatePendingBadge
  };

  // Initialize
  setTimeout(() => {
    openDB().then(() => {
      updatePendingBadge();
      if (navigator.onLine) syncPendingOrders();
    });
  }, 1000);
})();
