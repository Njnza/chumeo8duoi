/* ============================================================
   ShopPro - Web Bridge API Client
   Allows running in web browsers (Vercel / Cloud) seamlessly
   by providing the exact same window.api interface as Electron preload
   ============================================================ */

(function () {
  if (window.api) {
    console.log('[ShopPro] Running inside Electron Desktop environment');
    return;
  }

  console.log('[ShopPro] Running in Web environment (Vercel / Browser)');

  async function request(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });
      if (!res.ok) {
        let errMsg = `HTTP Error ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }
      return await res.json();
    } catch (err) {
      console.error(`[Web API] Request to ${url} failed:`, err.message);
      throw err;
    }
  }

  function toQueryString(params) {
    if (!params) return '';
    const valid = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return valid.length > 0 ? `?${valid.join('&')}` : '';
  }

  // Scanner real-time event bridge for Web / Vercel
  const barcodeListeners = [];
  const scannerConnectedListeners = [];
  const scannerDisconnectedListeners = [];
  const addProductListeners = [];
  const productPhotoListeners = [];
  let lastEventTimestamp = Date.now() - 5000;
  let lastPhotoTimestamp = Date.now() - 5000;
  let scannerPollingStarted = false;
  let isPhoneOnline = false;

  function startScannerPolling() {
    if (scannerPollingStarted) return;
    scannerPollingStarted = true;

    // 1. Poll for barcode events from phone
    setInterval(async () => {
      try {
        const events = await request(`/api/scanner/events?since=${lastEventTimestamp}`);
        if (Array.isArray(events) && events.length > 0) {
          if (!isPhoneOnline) {
            isPhoneOnline = true;
            scannerConnectedListeners.forEach(fn => fn({ ip: 'Điện thoại di động' }));
          }
          for (const ev of events) {
            const evTime = new Date(ev.created_at).getTime();
            if (evTime >= lastEventTimestamp) {
              lastEventTimestamp = evTime + 1;
            }
            if (ev.format === 'ADD_PRODUCT' && ev.product) {
              addProductListeners.forEach(fn => fn({ product: ev.product }));
            } else {
              barcodeListeners.forEach(fn => fn({ code: ev.code, format: ev.format }));
            }
          }
        }
      } catch (_) {}
    }, 1200);

    // 2. Poll for photos sent from phone camera
    setInterval(async () => {
      try {
        const photo = await request(`/api/scanner/latest-photo?since=${lastPhotoTimestamp}`);
        if (photo && photo.image) {
          lastPhotoTimestamp = new Date(photo.created_at).getTime() + 1;
          productPhotoListeners.forEach(fn => fn({ image: photo.image, relativePath: photo.image }));
        }
      } catch (_) {}
    }, 2000);

    // 3. Heartbeat for connection badge
    setInterval(async () => {
      try {
        const status = await request('/api/scanner/status');
        if (status && status.online) {
          if (!isPhoneOnline) {
            isPhoneOnline = true;
            scannerConnectedListeners.forEach(fn => fn({ ip: 'Điện thoại di động' }));
          }
        } else {
          if (isPhoneOnline) {
            isPhoneOnline = false;
            scannerDisconnectedListeners.forEach(fn => fn());
          }
        }
      } catch (_) {}
    }, 6000);
  }

  window.api = {
    // -- Window controls (Safe no-op on Web) --
    window: {
      minimize: () => {},
      maximize: () => {},
      close: () => {}
    },

    // -- Products --
    getProducts: (filters) => request(`/api/products${toQueryString(filters)}`),
    getProduct: (id) => request(`/api/products/${id}`),
    getProductByBarcode: (barcode) => request(`/api/products/barcode/${encodeURIComponent(barcode)}`),
    addProduct: (data) => request('/api/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => request(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteProduct: (id) => request(`/api/products/${id}`, { method: 'DELETE' }),
    batchSaveProducts: (products, updateExisting) =>
      request('/api/products/batch-save', { method: 'POST', body: JSON.stringify({ products, updateExisting }) }),

    exportProductsExcel: async () => {
      alert('Chức năng xuất Excel trên Web: Dữ liệu tải từ danh sách sản phẩm');
      return { success: true };
    },
    downloadProductTemplate: async () => {
      alert('Tải file mẫu Excel: Vui lòng sử dụng file mẫu chuẩn');
      return { success: true };
    },
    parseProductsExcelFile: async () => {
      return { success: false, message: 'Vui lòng chọn file Excel qua form nhập hàng' };
    },

    // -- Categories --
    getCategories: () => request('/api/categories'),
    addCategory: (data) => request('/api/categories', { method: 'POST', body: JSON.stringify(data) }),
    updateCategory: (id, data) => request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCategory: (id) => request(`/api/categories/${id}`, { method: 'DELETE' }),

    // -- Customers --
    getCustomers: (filters) => request(`/api/customers${toQueryString(filters)}`),
    getCustomer: (id) => request(`/api/customers/${id}`),
    addCustomer: (data) => request('/api/customers', { method: 'POST', body: JSON.stringify(data) }),
    updateCustomer: (id, data) => request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCustomer: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),

    // -- Orders --
    createOrder: (data) => request('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
    getOrders: (filters) => request(`/api/orders${toQueryString(filters)}`),
    getOrder: (id) => request(`/api/orders/${id}`),
    cancelOrder: (id) => request(`/api/orders/${id}/cancel`, { method: 'POST' }),
    processOrderReturn: (data) => request('/api/orders/return', { method: 'POST', body: JSON.stringify(data) }),
    getOrderReturns: (orderId) => request(`/api/orders/returns${toQueryString(orderId ? { order_id: orderId } : null)}`),
    getOrderReturnDetail: (returnId) => request(`/api/orders/returns/${returnId}`),

    // -- Dashboard / Reports --
    getDashboardStats: () => request('/api/reports/dashboard'),
    getRevenueByDateRange: (from, to) => request(`/api/reports/revenue${toQueryString({ from, to })}`),
    getTopProducts: (limit, from, to) => request(`/api/reports/top-products${toQueryString({ limit, from, to })}`),
    getRevenueByPaymentMethod: (from, to) => request(`/api/reports/payment-method${toQueryString({ from, to })}`),
    getProfitReport: (from, to) => request(`/api/reports/profit${toQueryString({ from, to })}`),
    getHourlySales: (from, to) => request(`/api/reports/hourly${toQueryString({ from, to })}`),
    getABCProductAnalysis: () => request('/api/reports/abc-analysis'),

    // -- Shifts & Cash Flow --
    getCurrentShift: (userId) => request(`/api/shifts/current${toQueryString(userId ? { user_id: userId } : null)}`),
    openShift: (data) => request('/api/shifts/open', { method: 'POST', body: JSON.stringify(data) }),
    closeShift: (id, data) => request(`/api/shifts/${id}/close`, { method: 'POST', body: JSON.stringify(data) }),
    getShiftSummary: (id) => request(`/api/shifts/${id}/summary`),
    getShifts: (limit) => request(`/api/shifts${toQueryString({ limit })}`),
    addCashFlow: (data) => request('/api/cash-flow', { method: 'POST', body: JSON.stringify(data) }),
    getCashFlows: (filter) => request(`/api/cash-flow${toQueryString(filter)}`),
    getCashFlowSummary: (from, to) => request(`/api/cash-flow/summary${toQueryString({ from, to })}`),

    // -- Settings & Member Tiers --
    getAllSettings: () => request('/api/settings'),
    getSetting: (key) => request(`/api/settings/${encodeURIComponent(key)}`),
    setSetting: (key, value) => request('/api/settings', { method: 'POST', body: JSON.stringify({ key, value }) }),
    getMemberTiers: () => request('/api/settings/member-tiers'),
    saveMemberTiers: (tiers) => request('/api/settings/member-tiers', { method: 'POST', body: JSON.stringify(tiers) }),

    // -- Users & Permissions --
    getUsers: () => request('/api/users'),
    getUserById: (id) => request(`/api/users/${id}`),
    createUser: (data) => request('/api/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id, data) => request(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
    authenticateUser: (usernameOrPin, pin) =>
      request('/api/users/authenticate', { method: 'POST', body: JSON.stringify({ usernameOrPin, pin }) }),
    verifyOwnerPin: (pin) =>
      request('/api/users/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) }).then((r) => r.valid),

    // -- Scanner (Web & Cloud Bridge) --
    getScannerInfo: () =>
      request('/api/scanner/info').catch(() => ({
        running: true,
        ip: window.location.hostname,
        port: window.location.port || (window.location.protocol === 'https:' ? '443' : '80'),
        url: `${window.location.origin}/scanner.html`,
        httpsUrl: `${window.location.origin}/scanner.html`,
        qrCodeDataUrl: ''
      })),
    generateAddToken: () => Promise.resolve({ token: 'web-' + Math.random().toString(36).substring(2), expiresAt: Date.now() + 3600000 }),
    generateQRCode: (text) =>
      Promise.resolve(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(text)}`),
    onBarcode: (cb) => {
      if (typeof cb === 'function') barcodeListeners.push(cb);
      startScannerPolling();
    },
    onScannerConnected: (cb) => {
      if (typeof cb === 'function') scannerConnectedListeners.push(cb);
      startScannerPolling();
    },
    onScannerDisconnected: (cb) => {
      if (typeof cb === 'function') scannerDisconnectedListeners.push(cb);
      startScannerPolling();
    },
    onAddProduct: (cb) => {
      if (typeof cb === 'function') addProductListeners.push(cb);
      startScannerPolling();
    },
    onProductPhoto: (cb) => {
      if (typeof cb === 'function') productPhotoListeners.push(cb);
      startScannerPolling();
    },
    openUploadsFolder: () => {},
    getUploadsFolderPath: () => Promise.resolve(''),
    decodeBarcodeFromImage: () => Promise.resolve({ success: false }),
    pickAndDecodeBarcode: () => Promise.resolve({ success: false }),
    saveProductImage: (fileData) => Promise.resolve({ success: true, relativePath: fileData }),

    // -- Backup & Restore --
    backup: () =>
      Promise.resolve({
        success: true,
        message: 'Dữ liệu được lưu trữ tự động trên MongoDB Atlas Cloud.'
      }),
    restore: () =>
      Promise.resolve({
        success: true,
        message: 'Dữ liệu MongoDB Atlas đang hoạt động bình thường.'
      }),

    // -- Printing --
    printReceipt: (html) => {
      const printWindow = window.open('', '_blank', 'width=400,height=600');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      }
    },

    // -- External --
    openExternal: (url) => window.open(url, '_blank'),

    // -- Logging --
    log: {
      info: (msg, ctx) => console.log(`[INFO][${ctx || 'App'}]`, msg),
      warn: (msg, ctx) => console.warn(`[WARN][${ctx || 'App'}]`, msg),
      error: (msg, ctx) => console.error(`[ERROR][${ctx || 'App'}]`, msg),
      debug: (msg, ctx) => console.debug(`[DEBUG][${ctx || 'App'}]`, msg),
      getRecent: () => Promise.resolve([]),
      openFolder: () => {},
      clearToday: () => {}
    },

    // -- Updater (Web already has latest version) --
    updater: {
      check: () => Promise.resolve({ hasUpdate: false, currentVersion: '2.0.0-web' }),
      getStatus: () => Promise.resolve({ status: 'idle' }),
      simulateDownload: () => Promise.resolve({ success: true }),
      onUpdateAvailable: () => {},
      onDownloadProgress: () => {}
    },

    // -- Plugins --
    plugins: {
      getAll: () => Promise.resolve([]),
      toggle: () => Promise.resolve({ success: true }),
      openFolder: () => {},
      emitHook: () => {}
    }
  };
})();
