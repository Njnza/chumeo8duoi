/* ============================================
   ShopPro Desktop - Electron Main Process
   ============================================ */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ShopDatabase = require('./database/db');
const ScannerServer = require('./server/scanner-server');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const AppLogger = require('./services/logger');
const AppUpdater = require('./services/updater');
const PluginManager = require('./services/plugin-manager');

let mainWindow;
let db;
let scannerServer;
let logger;
let updater;
let pluginManager;

// Global process error trackers (MOI-07)
process.on('uncaughtException', (err) => {
  if (logger) logger.error('Uncaught Exception in Main Process', 'Process', err);
  else console.error('[UncaughtException]:', err);
});

process.on('unhandledRejection', (reason) => {
  if (logger) logger.error('Unhandled Promise Rejection in Main Process', 'Process', reason);
  else console.error('[UnhandledRejection]:', reason);
});

// Disable GPU shader disk cache to prevent Windows "Access is denied (0x5)" cache lock errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Database path in user data directory
const DB_PATH = path.join(app.getPath('userData'), 'shoppro.db');

function createWindow() {
  // Ensure uploads directory exists and is accessible from src/
  const uploadsDir = path.join(__dirname, 'uploads');
  const productsUploadsDir = path.join(uploadsDir, 'products');
  if (!fs.existsSync(productsUploadsDir)) {
    fs.mkdirSync(productsUploadsDir, { recursive: true });
  }
  const srcUploadsDir = path.join(__dirname, 'src', 'uploads');
  if (!fs.existsSync(srcUploadsDir)) {
    try {
      fs.symlinkSync(uploadsDir, srcUploadsDir, 'junction');
    } catch (_) {}
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Shop - Phần Mềm Bán Hàng',
    frame: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#0a0a1a',
    show: false
  });

  mainWindow.loadFile('src/index.html');

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initDatabase() {
  db = new ShopDatabase(DB_PATH);
  await db.init();
  console.log('[Main] Database ready');
}

function initScannerServer() {
  const port = parseInt(db.getSetting('scanner_port')) || 8765;
  scannerServer = new ScannerServer(port);
  scannerServer.setDatabase(db);
  scannerServer.start();

  // Forward barcode to renderer
  scannerServer.on('barcode', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scanner:barcode', data);
    }
  });

  scannerServer.on('client-connected', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scanner:client-connected', info);
    }
  });

  scannerServer.on('client-disconnected', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scanner:client-disconnected');
    }
  });

  // Forward add-product from phone to renderer
  scannerServer.on('add-product', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scanner:add-product', data);
    }
  });

  // Forward product-photo from phone to renderer
  scannerServer.on('product-photo', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scanner:product-photo', data);
    }
  });
}

// ==================== IPC HANDLERS ====================

function setupIPC() {
  // -- Window controls --
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // Helper to persist product images to disk (uploads/products/)
  function saveProductImageFile(imageInput) {
    if (!imageInput || typeof imageInput !== 'string') return null;
    try {
      const uploadsDir = path.join(__dirname, 'uploads', 'products');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const rand = Math.random().toString(36).substring(2, 6);

      if (imageInput.startsWith('data:')) {
        const match = imageInput.match(/^data:image\/(\w+);base64,/);
        const ext = match && match[1] === 'png' ? 'png' : match && match[1] === 'webp' ? 'webp' : 'jpg';
        const filename = `product_${timestamp}_${rand}.${ext}`;
        const targetPath = path.join(uploadsDir, filename);
        const base64Data = imageInput.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
        return {
          success: true,
          filename,
          relativePath: `uploads/products/${filename}`,
          absolutePath: targetPath
        };
      } else if (fs.existsSync(imageInput) && fs.statSync(imageInput).isFile()) {
        const ext = path.extname(imageInput).toLowerCase().replace('.', '') || 'jpg';
        const filename = `product_${timestamp}_${rand}.${ext}`;
        const targetPath = path.join(uploadsDir, filename);
        fs.copyFileSync(imageInput, targetPath);
        return {
          success: true,
          filename,
          relativePath: `uploads/products/${filename}`,
          absolutePath: targetPath
        };
      }
    } catch (err) {
      console.error('[Main] Save product image error:', err);
    }
    return null;
  }

  // KT-01: Centralized IPC handler wrapper with error catching and structured logging
  function handleSafe(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args);
      } catch (err) {
        console.error(`[IPC Error] [${channel}]:`, err.message || err);
        throw err;
      }
    });
  }

  // -- Products --
  handleSafe('db:getProducts', (_, filters) => db.getProducts(filters));
  handleSafe('db:getProduct', (_, id) => db.getProduct(id));
  handleSafe('db:getProductByBarcode', (_, barcode) => db.getProductByBarcode(barcode));
  handleSafe('db:addProduct', (_, data) => {
    if (data) {
      const imgVal = data.image || data.image_url;
      if (imgVal && imgVal.startsWith('data:')) {
        const saved = saveProductImageFile(imgVal);
        data.image = saved ? saved.relativePath : '';
      } else {
        data.image = imgVal || '';
      }
    }
    return db.addProduct(data);
  });
  handleSafe('db:updateProduct', (_, id, data) => {
    if (data) {
      const imgVal = data.image !== undefined ? data.image : data.image_url;
      if (imgVal !== undefined) {
        if (imgVal && imgVal.startsWith('data:')) {
          const saved = saveProductImageFile(imgVal);
          data.image = saved ? saved.relativePath : '';
        } else {
          data.image = imgVal || '';
        }
      }
    }
    return db.updateProduct(id, data);
  });
  handleSafe('db:deleteProduct', (_, id) => db.deleteProduct(id));

  // -- Products Excel Import/Export (SP-01) --
  handleSafe('products:exportExcel', async () => {
    const products = db.getProducts({ limit: 50000 });
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất danh sách sản phẩm ra Excel',
      defaultPath: `DanhSach_SanPham_${dateStr}.xlsx`,
      filters: [{ name: 'Excel Workbook (*.xlsx)', extensions: ['xlsx'] }]
    });

    if (canceled || !filePath) return { canceled: true };

    const rows = products.map((p, idx) => ({
      'STT': idx + 1,
      'Mã SKU': p.sku || '',
      'Mã vạch (Barcode)': p.barcode || '',
      'Tên sản phẩm': p.name || '',
      'Danh mục': p.category_name || '',
      'Giá bán': p.price || 0,
      'Giá vốn': p.cost_price || 0,
      'Tồn kho': p.stock || 0,
      'Tồn tối thiểu': p.min_stock || 0,
      'Đơn vị tính': p.unit || 'cái',
      'Hạn sử dụng': p.expiry_date || '',
      'Trạng thái': p.status === 'active' ? 'Hoạt động' : 'Ẩn',
      'Mô tả': p.description || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 16 },
      { wch: 32 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 30 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm');
    XLSX.writeFile(wb, filePath);

    return { success: true, filePath, count: products.length };
  });

  handleSafe('products:downloadTemplate', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Tải file mẫu Excel nhập sản phẩm',
      defaultPath: 'Mau_Nhap_SanPham_ShopPro.xlsx',
      filters: [{ name: 'Excel Workbook (*.xlsx)', extensions: ['xlsx'] }]
    });

    if (canceled || !filePath) return { canceled: true };

    const sampleRows = [
      {
        'Mã SKU': 'SP000001',
        'Mã vạch (Barcode)': '8934567890123',
        'Tên sản phẩm (*)': 'Sữa tươi tiệt trùng Vinamilk 1L',
        'Danh mục': 'Sữa & Bơ',
        'Giá bán (*)': 35000,
        'Giá vốn': 28000,
        'Tồn kho': 50,
        'Tồn tối thiểu': 10,
        'Đơn vị tính': 'Hộp',
        'Hạn sử dụng (YYYY-MM-DD)': '2026-12-31',
        'Mô tả': 'Sữa tươi ít đường đóng hộp 1 lít'
      },
      {
        'Mã SKU': 'SP000002',
        'Mã vạch (Barcode)': '8936012345678',
        'Tên sản phẩm (*)': 'Bánh quy Cosy mè 300g',
        'Danh mục': 'Bánh kẹo',
        'Giá bán (*)': 42000,
        'Giá vốn': 32000,
        'Tồn kho': 100,
        'Tồn tối thiểu': 15,
        'Đơn vị tính': 'Gói',
        'Hạn sử dụng (YYYY-MM-DD)': '2027-06-15',
        'Mô tả': 'Bánh quy giòn thơm vị mè'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 18 }, { wch: 35 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 25 }, { wch: 35 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_Lieu');
    XLSX.writeFile(wb, filePath);

    return { success: true, filePath };
  });

  handleSafe('products:parseExcelFile', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn tệp Excel nhập danh sách sản phẩm',
      filters: [
        { name: 'Tệp bảng tính Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }
      ],
      properties: ['openFile']
    });

    if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };

    const filePath = filePaths[0];
    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return { success: false, error: 'File không có dữ liệu hoặc không có trang tính hợp lệ' };
    }

    const parsedRows = [];
    const errors = [];

    function getVal(row, candidates) {
      for (const k of Object.keys(row)) {
        const cleanK = k.trim().toLowerCase().replace(/[*()_\-\s]/g, '');
        for (const cand of candidates) {
          const cleanCand = cand.toLowerCase().replace(/[*()_\-\s]/g, '');
          if (cleanK === cleanCand || cleanK.includes(cleanCand)) {
            return row[k];
          }
        }
      }
      return '';
    }

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const rowIdx = i + 2;

      const name = String(getVal(r, ['tensanpham', 'tensp', 'tenhang', 'name']) || '').trim();
      const sku = String(getVal(r, ['masku', 'sku', 'mahang']) || '').trim();
      const barcode = String(getVal(r, ['mavach', 'barcode', 'code']) || '').trim();
      const categoryName = String(getVal(r, ['danhmuc', 'nhomhang', 'loaihang', 'category']) || '').trim();
      const priceRaw = getVal(r, ['giaban', 'dongia', 'price']);
      const costRaw = getVal(r, ['giavon', 'gianhap', 'cost']);
      const stockRaw = getVal(r, ['tonkho', 'soluong', 'stock']);
      const minStockRaw = getVal(r, ['tontoithieu', 'minstock']);
      const unit = String(getVal(r, ['donvitinh', 'dvt', 'unit']) || 'cái').trim();
      let expiryDate = String(getVal(r, ['hansudung', 'hsd', 'expiry']) || '').trim();
      const description = String(getVal(r, ['mota', 'ghichu', 'description']) || '').trim();

      if (!name) {
        errors.push(`Dòng ${rowIdx}: Bỏ qua vì thiếu Tên sản phẩm`);
        continue;
      }

      const price = parseFloat(String(priceRaw).replace(/[^0-9.-]/g, '')) || 0;
      const costPrice = parseFloat(String(costRaw).replace(/[^0-9.-]/g, '')) || 0;
      const stock = parseInt(String(stockRaw).replace(/[^0-9.-]/g, ''), 10) || 0;
      const minStock = parseInt(String(minStockRaw).replace(/[^0-9.-]/g, ''), 10) || 5;

      if (typeof expiryDate === 'number') {
        const dateObj = XLSX.SSF.parse_date_code(expiryDate);
        if (dateObj) {
          const m = String(dateObj.m).padStart(2, '0');
          const d = String(dateObj.d).padStart(2, '0');
          expiryDate = `${dateObj.y}-${m}-${d}`;
        }
      } else if (expiryDate) {
        const dmy = expiryDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmy) {
          expiryDate = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        }
      }

      parsedRows.push({
        name,
        sku,
        barcode,
        category_name: categoryName,
        price,
        cost_price: costPrice,
        stock,
        min_stock: minStock,
        unit,
        expiry_date: expiryDate,
        description,
        status: 'active'
      });
    }

    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      totalRows: rawRows.length,
      parsedRows,
      errors
    };
  });

  handleSafe('products:batchSave', async (_, { products, updateExisting }) => {
    return db.batchUpsertProducts(products, updateExisting);
  });

  // -- Categories --
  handleSafe('db:getCategories', () => db.getCategories());
  handleSafe('db:addCategory', (_, data) => db.addCategory(data));
  handleSafe('db:updateCategory', (_, id, data) => db.updateCategory(id, data));
  handleSafe('db:deleteCategory', (_, id) => db.deleteCategory(id));

  // -- Customers --
  handleSafe('db:getCustomers', (_, filters) => db.getCustomers(filters));
  handleSafe('db:getCustomer', (_, id) => db.getCustomer(id));
  handleSafe('db:addCustomer', (_, data) => db.addCustomer(data));
  handleSafe('db:updateCustomer', (_, id, data) => db.updateCustomer(id, data));
  handleSafe('db:deleteCustomer', (_, id) => db.deleteCustomer(id));

  // -- Orders --
  handleSafe('db:createOrder', (_, data) => {
    const order = db.createOrder(data);
    if (pluginManager && order) {
      try {
        pluginManager.emitHook('onOrderCreated', order);
      } catch (_) {}
    }
    return order;
  });
  handleSafe('db:getOrders', (_, filters) => db.getOrders(filters));
  handleSafe('db:getOrder', (_, id) => db.getOrder(id));
  handleSafe('db:cancelOrder', (_, id) => db.cancelOrder(id));
  handleSafe('db:processOrderReturn', (_, data) => db.processOrderReturn(data));
  handleSafe('db:getOrderReturns', (_, orderId) => db.getOrderReturns(orderId));
  handleSafe('db:getOrderReturnDetail', (_, returnId) => db.getOrderReturnDetail(returnId));

  // -- Dashboard / Reports --
  handleSafe('db:getDashboardStats', () => db.getDashboardStats());
  handleSafe('db:getRevenueByDateRange', (_, from, to) => db.getRevenueByDateRange(from, to));
  handleSafe('db:getTopProducts', (_, limit, from, to) => db.getTopProducts(limit, from, to));
  handleSafe('db:getRevenueByPaymentMethod', (_, from, to) => db.getRevenueByPaymentMethod(from, to));
  handleSafe('db:getProfitReport', (_, from, to) => db.getProfitReport(from, to));
  handleSafe('db:getHourlySales', (_, from, to) => db.getHourlySales(from, to));

  // -- Settings & Member Tiers --
  handleSafe('db:getAllSettings', () => db.getAllSettings());
  handleSafe('db:getSetting', (_, key) => db.getSetting(key));
  handleSafe('db:setSetting', (_, key, value) => db.setSetting(key, value));
  handleSafe('db:getMemberTiers', () => db.getMemberTiers());
  handleSafe('db:saveMemberTiers', (_, tiers) => db.saveMemberTiers(tiers));

  // -- Users & Permissions --
  handleSafe('users:getAll', () => db.getUsers());
  handleSafe('users:getById', (_, id) => db.getUserById(id));
  handleSafe('users:create', (_, data) => db.createUser(data));
  handleSafe('users:update', (_, id, data) => db.updateUser(id, data));
  handleSafe('users:delete', (_, id) => db.deleteUser(id));
  handleSafe('users:authenticate', (_, usernameOrPin, pin) => db.authenticateUser(usernameOrPin, pin));
  handleSafe('users:verifyOwnerPin', (_, pin) => db.verifyOwnerPin(pin));

  // -- Scanner --
  handleSafe('scanner:getInfo', () => {
    if (scannerServer) {
      return scannerServer.getInfo();
    }
    return null;
  });

  handleSafe('scanner:generateAddToken', () => {
    if (scannerServer) {
      const token = scannerServer.generateAddToken();
      const info = scannerServer.getInfo();
      return { token, serverUrl: info.url, httpsUrl: info.httpsUrl };
    }
    return null;
  });

  handleSafe('scanner:openUploadsFolder', () => {
    const uploadsDir = path.join(__dirname, 'uploads', 'products');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    shell.openPath(uploadsDir);
    return uploadsDir;
  });

  handleSafe('scanner:getUploadsFolderPath', () => {
    return path.join(__dirname, 'uploads', 'products');
  });

  handleSafe('scanner:generateQRCode', async (_, text) => {
    if (!text) return null;
    return await QRCode.toDataURL(text, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    });
  });

  // Decode barcode directly from image file or base64 data on computer
  handleSafe('scanner:decodeBarcodeFromImage', async (_, imageSource) => {
    const { readBarcodesFromImageFile } = require('zxing-wasm/reader');
    let buffer;
    if (typeof imageSource === 'string' && imageSource.startsWith('data:')) {
      const base64Data = imageSource.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else if (typeof imageSource === 'string' && fs.existsSync(imageSource)) {
      buffer = fs.readFileSync(imageSource);
    } else {
      throw new Error('Dữ liệu hoặc tệp ảnh không hợp lệ');
    }

    const blob = new Blob([buffer]);
    const results = await readBarcodesFromImageFile(blob, {
      formats: ['EAN-13', 'EAN-8', 'Code 128', 'Code 39', 'Code 93', 'UPC-A', 'UPC-E', 'QR Code', 'Data Matrix', 'ITF'],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      binarizer: 'LocalAverage'
    });

    if (results && results.length > 0) {
      const codes = [...new Set(results.map(r => String(r.text || '').trim()).filter(Boolean))];
      return {
        success: true,
        code: codes[0],
        format: results[0].format,
        allCodes: codes
      };
    }
    return { success: false, error: 'Không tìm thấy mã vạch trong ảnh đã chọn' };
  });

  // Open native Windows file dialog to select image and decode barcode instantly
  handleSafe('scanner:pickAndDecodeBarcode', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Chọn ảnh tem mã vạch từ máy tính',
        filters: [
          { name: 'Tệp hình ảnh', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tiff'] }
        ],
        properties: ['openFile']
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { canceled: true };
      }

      const filePath = filePaths[0];
      const { readBarcodesFromImageFile } = require('zxing-wasm/reader');
      const buffer = fs.readFileSync(filePath);
      const blob = new Blob([buffer]);
      const results = await readBarcodesFromImageFile(blob, {
        formats: ['EAN-13', 'EAN-8', 'Code 128', 'Code 39', 'Code 93', 'UPC-A', 'UPC-E', 'QR Code', 'Data Matrix', 'ITF'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        binarizer: 'LocalAverage'
      });

      if (results && results.length > 0) {
        const codes = [...new Set(results.map(r => String(r.text || '').trim()).filter(Boolean))];
        return {
          success: true,
          filePath,
          code: codes[0],
          format: results[0].format,
          allCodes: codes
        };
      }
      return {
        success: false,
        filePath,
        error: 'Không tìm thấy mã vạch trong ảnh. Vui lòng chọn ảnh chụp rõ nét tem mã vạch.'
      };
    } catch (err) {
      console.error('[PickAndDecodeBarcode] Error:', err);
      return { success: false, error: err.message || 'Lỗi khi đọc file ảnh' };
    }
  });

  // Save image directly to uploads/products/ and return relative path
  ipcMain.handle('scanner:saveProductImage', async (_, fileData) => {
    const res = saveProductImageFile(fileData);
    if (res) return res;
    return { success: false, error: 'Không thể lưu tệp ảnh' };
  });

  // -- Backup --
  ipcMain.handle('db:backup', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Backup Database',
      defaultPath: `shoppro_backup_${new Date().toISOString().split('T')[0]}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    });

    if (canceled || !filePath) return { success: false };

    try {
      await db.backup(filePath);
      return { success: true, path: filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db:restore', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore Database',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return { success: false };

    try {
      db.close();
      fs.copyFileSync(filePaths[0], DB_PATH);
      db = new ShopDatabase(DB_PATH);
      await db.init();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // -- Print --
  ipcMain.handle('print:receipt', async (_, html) => {
    const printWindow = new BrowserWindow({
      width: 300,
      height: 600,
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    printWindow.webContents.print({
      silent: false,
      printBackground: true,
      margins: { marginType: 'none' }
    }, (success) => {
      printWindow.close();
    });

    return { success: true };
  });

  // -- Open external link --
  ipcMain.on('open:external', (_, url) => {
    shell.openExternal(url);
  });

  // -- Shifts (Quản Lý Ca Bán Hàng) --
  handleSafe('shifts:getCurrent', (_, userId) => db.getCurrentShift(userId));
  handleSafe('shifts:open', (_, data) => db.openShift(data));
  handleSafe('shifts:close', (_, id, data) => db.closeShift(id, data));
  handleSafe('shifts:getSummary', (_, id) => db.getShiftSummary(id));
  handleSafe('shifts:getList', (_, limit) => db.getShifts(limit));

  // -- Cash Flow (Sổ Quỹ Thu Chi) --
  handleSafe('cashFlow:add', (_, data) => db.addCashFlow(data));
  handleSafe('cashFlow:getList', (_, filter) => db.getCashFlows(filter));
  handleSafe('cashFlow:getSummary', (_, from, to) => db.getCashFlowSummary(from, to));

  // -- AI Assistant & Business Analytics --
  handleSafe('ai:getABCAnalysis', () => db.getABCProductAnalysis());

  // ==================== LOGGING & ERROR TRACKING (MOI-07) ====================
  handleSafe('logger:log', (_, { level, message, context, extra }) => {
    if (logger) {
      const lvl = String(level || 'info').toLowerCase();
      if (lvl === 'error') logger.error(message, context, extra);
      else if (lvl === 'warn') logger.warn(message, context, extra);
      else if (lvl === 'debug') logger.debug(message, context, extra);
      else logger.info(message, context, extra);
    }
    return { success: true };
  });

  handleSafe('logger:getRecentLogs', (_, limit) => {
    return logger ? logger.getRecentLogs(limit || 150) : [];
  });

  handleSafe('logger:openLogFolder', () => {
    if (logger) {
      const p = logger.getLogFolderPath();
      shell.openPath(p);
      return p;
    }
    return null;
  });

  handleSafe('logger:clearTodayLog', () => {
    return logger ? logger.clearTodayLog() : false;
  });

  // ==================== AUTO-UPDATE (MOI-06) ====================
  handleSafe('updater:check', async (_, manual = true) => {
    if (!updater) return { hasUpdate: false };
    return await updater.checkForUpdates(manual);
  });

  handleSafe('updater:getStatus', () => {
    return updater ? updater.getStatus() : { hasUpdate: false };
  });

  handleSafe('updater:simulateDownload', async () => {
    if (!updater) return { success: false };
    return await updater.simulateDownload((percent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:downloadProgress', percent);
      }
    });
  });

  // ==================== PLUGIN SYSTEM (MOI-09) ====================
  handleSafe('plugins:getAll', () => {
    return pluginManager ? pluginManager.getPlugins() : [];
  });

  handleSafe('plugins:toggle', (_, id, enable) => {
    return pluginManager ? pluginManager.togglePlugin(id, enable) : { success: false };
  });

  handleSafe('plugins:openFolder', () => {
    if (pluginManager) {
      const p = pluginManager.getPluginsFolderPath();
      shell.openPath(p);
      return p;
    }
    return null;
  });

  handleSafe('plugins:emitHook', (_, hookName, ...args) => {
    return pluginManager ? pluginManager.emitHook(hookName, ...args) : [];
  });
}

// ==================== APP LIFECYCLE ====================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main] Một phiên bản Shop khác đang chạy. Tự động chuyển sang cửa sổ hiện tại.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      // 1. Initialize Logger
      logger = new AppLogger({
        logsDir: path.join(app.getPath('userData'), 'logs')
      });
      logger.info('=== SHOPPRO DESKTOP APPLICATION STARTING ===', 'System');

      // 2. Initialize Database & Window
      await initDatabase();
      createWindow();
      setupIPC();
      initScannerServer();

      // 3. Initialize Auto-Updater
      updater = new AppUpdater({
        currentVersion: app.getVersion() || '2.0.0',
        logger
      });

      // 4. Initialize Plugin Manager
      pluginManager = new PluginManager({
        pluginsDir: path.join(__dirname, 'plugins'),
        db,
        logger
      });
      await pluginManager.init({ app, db, logger, mainWindow });

      // Background update check after 5s
      setTimeout(async () => {
        try {
          const updateInfo = await updater.checkForUpdates(false);
          if (updateInfo && updateInfo.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater:available', updateInfo);
          }
        } catch (_) {}
      }, 5000);
    } catch (startupErr) {
      if (logger) logger.error('Fatal startup error', 'Startup', startupErr);
      console.error('[Startup Fatal Error]:', startupErr);
    }
  });
}

app.on('before-quit', () => {
  if (db) db.flush();
});

app.on('window-all-closed', () => {
  if (scannerServer) scannerServer.stop();
  if (db) db.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
