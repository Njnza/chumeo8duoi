/* ============================================
   ShopPro Desktop - Preload Script
   Secure bridge between main ↔ renderer
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // -- Window controls --
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },

  // -- Products --
  getProducts: (filters) => ipcRenderer.invoke('db:getProducts', filters),
  getProduct: (id) => ipcRenderer.invoke('db:getProduct', id),
  getProductByBarcode: (barcode) => ipcRenderer.invoke('db:getProductByBarcode', barcode),
  addProduct: (data) => ipcRenderer.invoke('db:addProduct', data),
  updateProduct: (id, data) => ipcRenderer.invoke('db:updateProduct', id, data),
  deleteProduct: (id) => ipcRenderer.invoke('db:deleteProduct', id),
  exportProductsExcel: () => ipcRenderer.invoke('products:exportExcel'),
  downloadProductTemplate: () => ipcRenderer.invoke('products:downloadTemplate'),
  parseProductsExcelFile: () => ipcRenderer.invoke('products:parseExcelFile'),
  batchSaveProducts: (products, updateExisting) => ipcRenderer.invoke('products:batchSave', { products, updateExisting }),

  // -- Categories --
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  addCategory: (data) => ipcRenderer.invoke('db:addCategory', data),
  updateCategory: (id, data) => ipcRenderer.invoke('db:updateCategory', id, data),
  deleteCategory: (id) => ipcRenderer.invoke('db:deleteCategory', id),

  // -- Customers --
  getCustomers: (filters) => ipcRenderer.invoke('db:getCustomers', filters),
  getCustomer: (id) => ipcRenderer.invoke('db:getCustomer', id),
  addCustomer: (data) => ipcRenderer.invoke('db:addCustomer', data),
  updateCustomer: (id, data) => ipcRenderer.invoke('db:updateCustomer', id, data),
  deleteCustomer: (id) => ipcRenderer.invoke('db:deleteCustomer', id),

  // -- Orders --
  createOrder: (data) => ipcRenderer.invoke('db:createOrder', data),
  getOrders: (filters) => ipcRenderer.invoke('db:getOrders', filters),
  getOrder: (id) => ipcRenderer.invoke('db:getOrder', id),
  cancelOrder: (id) => ipcRenderer.invoke('db:cancelOrder', id),
  processOrderReturn: (data) => ipcRenderer.invoke('db:processOrderReturn', data),
  getOrderReturns: (orderId) => ipcRenderer.invoke('db:getOrderReturns', orderId),
  getOrderReturnDetail: (returnId) => ipcRenderer.invoke('db:getOrderReturnDetail', returnId),

  // -- Dashboard / Reports --
  getDashboardStats: () => ipcRenderer.invoke('db:getDashboardStats'),
  getRevenueByDateRange: (from, to) => ipcRenderer.invoke('db:getRevenueByDateRange', from, to),
  getTopProducts: (limit, from, to) => ipcRenderer.invoke('db:getTopProducts', limit, from, to),
  getRevenueByPaymentMethod: (from, to) => ipcRenderer.invoke('db:getRevenueByPaymentMethod', from, to),
  getProfitReport: (from, to) => ipcRenderer.invoke('db:getProfitReport', from, to),
  getHourlySales: (from, to) => ipcRenderer.invoke('db:getHourlySales', from, to),

  // -- Shifts & Cash Flow --
  getCurrentShift: (userId) => ipcRenderer.invoke('shifts:getCurrent', userId),
  openShift: (data) => ipcRenderer.invoke('shifts:open', data),
  closeShift: (id, data) => ipcRenderer.invoke('shifts:close', id, data),
  getShiftSummary: (id) => ipcRenderer.invoke('shifts:getSummary', id),
  getShifts: (limit) => ipcRenderer.invoke('shifts:getList', limit),
  addCashFlow: (data) => ipcRenderer.invoke('cashFlow:add', data),
  getCashFlows: (filter) => ipcRenderer.invoke('cashFlow:getList', filter),
  getCashFlowSummary: (from, to) => ipcRenderer.invoke('cashFlow:getSummary', from, to),

  // -- AI Assistant & Business Analytics --
  getABCProductAnalysis: () => ipcRenderer.invoke('ai:getABCAnalysis'),

  // -- Settings & Member Tiers --
  getAllSettings: () => ipcRenderer.invoke('db:getAllSettings'),
  getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
  setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
  getMemberTiers: () => ipcRenderer.invoke('db:getMemberTiers'),
  saveMemberTiers: (tiers) => ipcRenderer.invoke('db:saveMemberTiers', tiers),

  // -- Users & Permissions --
  getUsers: () => ipcRenderer.invoke('users:getAll'),
  getUserById: (id) => ipcRenderer.invoke('users:getById', id),
  createUser: (data) => ipcRenderer.invoke('users:create', data),
  updateUser: (id, data) => ipcRenderer.invoke('users:update', id, data),
  deleteUser: (id) => ipcRenderer.invoke('users:delete', id),
  authenticateUser: (usernameOrPin, pin) => ipcRenderer.invoke('users:authenticate', usernameOrPin, pin),
  verifyOwnerPin: (pin) => ipcRenderer.invoke('users:verifyOwnerPin', pin),

  // -- Scanner --
  getScannerInfo: () => ipcRenderer.invoke('scanner:getInfo'),
  generateAddToken: () => ipcRenderer.invoke('scanner:generateAddToken'),
  generateQRCode: (text) => ipcRenderer.invoke('scanner:generateQRCode', text),
  onBarcode: (callback) => {
    ipcRenderer.on('scanner:barcode', (_, data) => callback(data));
  },
  onScannerConnected: (callback) => {
    ipcRenderer.on('scanner:client-connected', (_, info) => callback(info));
  },
  onScannerDisconnected: (callback) => {
    ipcRenderer.on('scanner:client-disconnected', () => callback());
  },
  onAddProduct: (callback) => {
    ipcRenderer.on('scanner:add-product', (_, data) => callback(data));
  },
  onProductPhoto: (callback) => {
    ipcRenderer.on('scanner:product-photo', (_, data) => callback(data));
  },
  openUploadsFolder: () => ipcRenderer.invoke('scanner:openUploadsFolder'),
  getUploadsFolderPath: () => ipcRenderer.invoke('scanner:getUploadsFolderPath'),
  decodeBarcodeFromImage: (imageSource) => ipcRenderer.invoke('scanner:decodeBarcodeFromImage', imageSource),
  pickAndDecodeBarcode: () => ipcRenderer.invoke('scanner:pickAndDecodeBarcode'),
  saveProductImage: (fileData) => ipcRenderer.invoke('scanner:saveProductImage', fileData),

  // -- Backup / Restore --
  backup: () => ipcRenderer.invoke('db:backup'),
  restore: () => ipcRenderer.invoke('db:restore'),

  // -- Audit Logs --
  getAuditLogs: (filters) => ipcRenderer.invoke('audit:getLogs', filters),
  getAuditActions: () => ipcRenderer.invoke('audit:getActions'),

  // -- Print --
  printReceipt: (html) => ipcRenderer.invoke('print:receipt', html),

  // -- External --
  openExternal: (url) => ipcRenderer.send('open:external', url),

  // -- Logging & Error Tracking (MOI-07) --
  log: {
    info: (message, context, extra) => ipcRenderer.invoke('logger:log', { level: 'info', message, context, extra }),
    warn: (message, context, extra) => ipcRenderer.invoke('logger:log', { level: 'warn', message, context, extra }),
    error: (message, context, extra) => ipcRenderer.invoke('logger:log', { level: 'error', message, context, extra }),
    debug: (message, context, extra) => ipcRenderer.invoke('logger:log', { level: 'debug', message, context, extra }),
    getRecent: (limit) => ipcRenderer.invoke('logger:getRecentLogs', limit),
    openFolder: () => ipcRenderer.invoke('logger:openLogFolder'),
    clearToday: () => ipcRenderer.invoke('logger:clearTodayLog')
  },

  // -- Auto-Updater (MOI-06) --
  updater: {
    check: (manual) => ipcRenderer.invoke('updater:check', manual),
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    simulateDownload: () => ipcRenderer.invoke('updater:simulateDownload'),
    onUpdateAvailable: (callback) => ipcRenderer.on('updater:available', (_, info) => callback(info)),
    onDownloadProgress: (callback) => ipcRenderer.on('updater:downloadProgress', (_, percent) => callback(percent))
  },

  // -- Plugin System (MOI-09) --
  plugins: {
    getAll: () => ipcRenderer.invoke('plugins:getAll'),
    toggle: (id, enable) => ipcRenderer.invoke('plugins:toggle', id, enable),
    openFolder: () => ipcRenderer.invoke('plugins:openFolder'),
    emitHook: (hookName, ...args) => ipcRenderer.invoke('plugins:emitHook', hookName, ...args)
  }
});
