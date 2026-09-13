/* ============================================
   SHOP PRO - Google Apps Script Backend API
   ============================================
   
   HƯỚNG DẪN TRIỂN KHAI:
   1. Mở https://script.google.com
   2. Tạo project mới
   3. Copy toàn bộ code này vào Code.gs
   4. Chạy hàm setupSpreadsheet() lần đầu tiên
      (Chạy → Chọn hàm setupSpreadsheet → Chạy)
   5. Cấp quyền truy cập Google Sheets
   6. Deploy → New deployment
      - Type: Web App
      - Execute as: Me
      - Who has access: Anyone
   7. Copy URL deployment → Paste vào js/config.js
   
   ============================================ */

// ========== CẤU HÌNH ==========
// ID của Google Sheets (lấy từ URL của sheet)
// Nếu để trống, hàm setupSpreadsheet() sẽ tạo sheet mới
let SPREADSHEET_ID = '';

// ========== SETUP ==========

/**
 * Tạo Google Sheets với cấu trúc ban đầu
 * Chạy hàm này MỘT LẦN khi setup
 */
function setupSpreadsheet() {
  let ss;
  
  if (SPREADSHEET_ID) {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } else {
    ss = SpreadsheetApp.create('ShopPro - Database');
    SPREADSHEET_ID = ss.getId();
    Logger.log('📊 Spreadsheet ID: ' + SPREADSHEET_ID);
    Logger.log('🔗 URL: ' + ss.getUrl());
  }
  
  // Tạo sheet Products
  let productsSheet = ss.getSheetByName('Products');
  if (!productsSheet) {
    productsSheet = ss.insertSheet('Products');
    productsSheet.appendRow([
      'ID', 'SKU', 'Name', 'Description', 'Price', 'SalePrice', 
      'Category', 'Stock', 'ImageURL', 'Status', 'CreatedAt', 'UpdatedAt'
    ]);
    productsSheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
    productsSheet.setFrozenRows(1);
    
    // Thêm dữ liệu mẫu
    const now = new Date().toISOString();
    productsSheet.appendRow(['P001', 'SP-001', 'Áo thun nam basic', 'Áo thun cotton 100%, form regular fit', 199000, 149000, 'Thời trang', 50, '', 'active', now, now]);
    productsSheet.appendRow(['P002', 'SP-002', 'Quần jeans slim fit', 'Quần jeans co giãn, form slim fit', 450000, 0, 'Thời trang', 30, '', 'active', now, now]);
    productsSheet.appendRow(['P003', 'SP-003', 'Tai nghe Bluetooth', 'Tai nghe không dây, pin 24h', 350000, 299000, 'Điện tử', 100, '', 'active', now, now]);
    productsSheet.appendRow(['P004', 'SP-004', 'Bình nước inox 500ml', 'Bình giữ nhiệt 24h, inox 304', 180000, 0, 'Gia dụng', 200, '', 'active', now, now]);
    productsSheet.appendRow(['P005', 'SP-005', 'Balo laptop 15.6 inch', 'Balo chống nước, nhiều ngăn', 520000, 420000, 'Phụ kiện', 45, '', 'active', now, now]);
  }
  
  // Tạo sheet Orders
  let ordersSheet = ss.getSheetByName('Orders');
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet('Orders');
    ordersSheet.appendRow([
      'OrderID', 'CustomerName', 'CustomerPhone', 'Items', 
      'TotalAmount', 'Status', 'PaymentMethod', 'Note', 'CreatedAt'
    ]);
    ordersSheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#e69138').setFontColor('#ffffff');
    ordersSheet.setFrozenRows(1);
  }
  
  // Tạo sheet Categories
  let categoriesSheet = ss.getSheetByName('Categories');
  if (!categoriesSheet) {
    categoriesSheet = ss.insertSheet('Categories');
    categoriesSheet.appendRow(['ID', 'Name', 'Description', 'Color']);
    categoriesSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#6aa84f').setFontColor('#ffffff');
    categoriesSheet.setFrozenRows(1);
    
    // Danh mục mẫu
    categoriesSheet.appendRow(['C001', 'Thời trang', 'Quần áo, giày dép', '#7c6aef']);
    categoriesSheet.appendRow(['C002', 'Điện tử', 'Thiết bị điện tử, phụ kiện', '#00d4ff']);
    categoriesSheet.appendRow(['C003', 'Gia dụng', 'Đồ gia dụng, nhà bếp', '#00e676']);
    categoriesSheet.appendRow(['C004', 'Phụ kiện', 'Balo, túi xách, phụ kiện', '#ffab40']);
  }
  
  // Xóa sheet mặc định "Sheet1" nếu có
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  Logger.log('✅ Setup hoàn tất!');
  Logger.log('📊 Spreadsheet ID: ' + ss.getId());
  Logger.log('🔗 URL: ' + ss.getUrl());
  
  // Lưu ID vào script properties
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
}

// ========== API HANDLERS ==========

/**
 * Handle GET requests
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const params = e.parameter;
    
    let result;
    
    switch (action) {
      case 'getProducts':
        result = getProducts(params);
        break;
      case 'getProduct':
        result = getProduct(params.sku || params.id);
        break;
      case 'getCategories':
        result = getCategories();
        break;
      case 'getOrders':
        result = getOrders(params);
        break;
      case 'getOrder':
        result = getOrder(params.orderId);
        break;
      case 'getDashboard':
        result = getDashboard();
        break;
      // Write operations via GET (for CORS compatibility)
      case 'addProduct':
        result = addProduct(JSON.parse(params.data));
        break;
      case 'updateProduct':
        result = updateProduct(JSON.parse(params.data));
        break;
      case 'deleteProduct':
        result = deleteProduct(params.id);
        break;
      case 'createOrder':
        result = createOrder(JSON.parse(params.data));
        break;
      case 'updateOrderStatus':
        result = updateOrderStatus(params.orderId, params.status);
        break;
      case 'addCategory':
        result = addCategory(JSON.parse(params.data));
        break;
      case 'deleteCategory':
        result = deleteCategory(params.id);
        break;
      case 'ping':
        result = { success: true, message: 'ShopPro API is running!', timestamp: new Date().toISOString() };
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    return createJsonResponse(result);
    
  } catch (error) {
    return createJsonResponse({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
}

/**
 * Handle POST requests
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    let result;
    
    switch (action) {
      case 'addProduct':
        result = addProduct(data.payload);
        break;
      case 'updateProduct':
        result = updateProduct(data.payload);
        break;
      case 'deleteProduct':
        result = deleteProduct(data.payload.id);
        break;
      case 'createOrder':
        result = createOrder(data.payload);
        break;
      case 'updateOrderStatus':
        result = updateOrderStatus(data.payload.orderId, data.payload.status);
        break;
      case 'addCategory':
        result = addCategory(data.payload);
        break;
      case 'deleteCategory':
        result = deleteCategory(data.payload.id);
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    return createJsonResponse(result);
    
  } catch (error) {
    return createJsonResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * Create JSON response with CORS headers
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== HELPER FUNCTIONS ==========

/**
 * Get the spreadsheet
 */
function getSpreadsheet() {
  let id = SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('Spreadsheet chưa được setup. Chạy hàm setupSpreadsheet() trước.');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Get a sheet by name
 */
function getSheet(name) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" không tồn tại. Chạy setupSpreadsheet() để tạo.');
  }
  return sheet;
}

/**
 * Convert sheet data to array of objects
 */
function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  const objects = [];
  
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      let value = data[i][j];
      // Convert Date objects to ISO strings
      if (value instanceof Date) {
        value = value.toISOString();
      }
      obj[headers[j]] = value;
    }
    objects.push(obj);
  }
  
  return objects;
}

/**
 * Find row index by column value
 */
function findRowIndex(sheet, columnIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][columnIndex]) === String(value)) {
      return i + 1; // 1-indexed
    }
  }
  return -1;
}

/**
 * Generate next ID
 */
function generateNextId(sheet, prefix) {
  const data = sheet.getDataRange().getValues();
  let maxNum = 0;
  
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]);
    const match = id.match(/\d+$/);
    if (match) {
      const num = parseInt(match[0]);
      if (num > maxNum) maxNum = num;
    }
  }
  
  return prefix + String(maxNum + 1).padStart(3, '0');
}

// ========== PRODUCTS API ==========

/**
 * Lấy danh sách sản phẩm
 */
function getProducts(params) {
  const sheet = getSheet('Products');
  let products = sheetToObjects(sheet);
  
  // Filter by category
  if (params && params.category) {
    products = products.filter(p => p.Category === params.category);
  }
  
  // Filter by status
  if (params && params.status) {
    products = products.filter(p => p.Status === params.status);
  }
  
  // Search by name or SKU
  if (params && params.search) {
    const search = params.search.toLowerCase();
    products = products.filter(p => 
      (p.Name && p.Name.toLowerCase().includes(search)) || 
      (p.SKU && p.SKU.toLowerCase().includes(search))
    );
  }
  
  // Sort by newest first
  products.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  
  return {
    success: true,
    data: products,
    total: products.length
  };
}

/**
 * Lấy chi tiết sản phẩm theo SKU hoặc ID
 */
function getProduct(identifier) {
  const sheet = getSheet('Products');
  const products = sheetToObjects(sheet);
  
  const product = products.find(p => 
    p.SKU === identifier || p.ID === identifier
  );
  
  if (!product) {
    return { success: false, error: 'Không tìm thấy sản phẩm: ' + identifier };
  }
  
  return { success: true, data: product };
}

/**
 * Thêm sản phẩm mới
 */
function addProduct(data) {
  const sheet = getSheet('Products');
  const now = new Date().toISOString();
  
  // Check duplicate SKU
  if (data.SKU) {
    const existing = sheetToObjects(sheet).find(p => p.SKU === data.SKU);
    if (existing) {
      return { success: false, error: 'SKU đã tồn tại: ' + data.SKU };
    }
  }
  
  const id = data.ID || generateNextId(sheet, 'P');
  const sku = data.SKU || id;
  
  sheet.appendRow([
    id,
    sku,
    data.Name || '',
    data.Description || '',
    Number(data.Price) || 0,
    Number(data.SalePrice) || 0,
    data.Category || '',
    Number(data.Stock) || 0,
    data.ImageURL || '',
    data.Status || 'active',
    now,
    now
  ]);
  
  return { 
    success: true, 
    message: 'Đã thêm sản phẩm: ' + (data.Name || sku),
    data: { ID: id, SKU: sku }
  };
}

/**
 * Cập nhật sản phẩm
 */
function updateProduct(data) {
  const sheet = getSheet('Products');
  const rowIndex = findRowIndex(sheet, 0, data.ID); // Column A = ID
  
  if (rowIndex === -1) {
    return { success: false, error: 'Không tìm thấy sản phẩm ID: ' + data.ID };
  }
  
  const now = new Date().toISOString();
  const row = sheet.getRange(rowIndex, 1, 1, 12).getValues()[0];
  
  sheet.getRange(rowIndex, 1, 1, 12).setValues([[
    data.ID,
    data.SKU || row[1],
    data.Name || row[2],
    data.Description !== undefined ? data.Description : row[3],
    data.Price !== undefined ? Number(data.Price) : row[4],
    data.SalePrice !== undefined ? Number(data.SalePrice) : row[5],
    data.Category !== undefined ? data.Category : row[6],
    data.Stock !== undefined ? Number(data.Stock) : row[7],
    data.ImageURL !== undefined ? data.ImageURL : row[8],
    data.Status || row[9],
    row[10], // CreatedAt unchanged
    now      // UpdatedAt
  ]]);
  
  return { 
    success: true, 
    message: 'Đã cập nhật sản phẩm: ' + (data.Name || data.ID)
  };
}

/**
 * Xóa sản phẩm
 */
function deleteProduct(id) {
  const sheet = getSheet('Products');
  const rowIndex = findRowIndex(sheet, 0, id);
  
  if (rowIndex === -1) {
    return { success: false, error: 'Không tìm thấy sản phẩm ID: ' + id };
  }
  
  sheet.deleteRow(rowIndex);
  
  return { success: true, message: 'Đã xóa sản phẩm ID: ' + id };
}

// ========== ORDERS API ==========

/**
 * Lấy danh sách đơn hàng
 */
function getOrders(params) {
  const sheet = getSheet('Orders');
  let orders = sheetToObjects(sheet);
  
  // Parse Items JSON
  orders = orders.map(order => {
    try {
      if (typeof order.Items === 'string' && order.Items) {
        order.Items = JSON.parse(order.Items);
      }
    } catch (e) {
      order.Items = [];
    }
    return order;
  });
  
  // Filter by status
  if (params && params.status) {
    orders = orders.filter(o => o.Status === params.status);
  }
  
  // Sort by newest first
  orders.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  
  return {
    success: true,
    data: orders,
    total: orders.length
  };
}

/**
 * Lấy chi tiết đơn hàng
 */
function getOrder(orderId) {
  const sheet = getSheet('Orders');
  const orders = sheetToObjects(sheet);
  const order = orders.find(o => o.OrderID === orderId);
  
  if (!order) {
    return { success: false, error: 'Không tìm thấy đơn hàng: ' + orderId };
  }
  
  try {
    if (typeof order.Items === 'string') {
      order.Items = JSON.parse(order.Items);
    }
  } catch (e) {
    order.Items = [];
  }
  
  return { success: true, data: order };
}

/**
 * Tạo đơn hàng mới
 */
function createOrder(data) {
  const ordersSheet = getSheet('Orders');
  const productsSheet = getSheet('Products');
  const now = new Date().toISOString();
  
  const orderId = data.OrderID || generateNextId(ordersSheet, 'ORD');
  
  // Cập nhật tồn kho
  if (data.Items && Array.isArray(data.Items)) {
    for (const item of data.Items) {
      const rowIndex = findRowIndex(productsSheet, 0, item.productId);
      if (rowIndex > 0) {
        const currentStock = productsSheet.getRange(rowIndex, 8).getValue();
        const newStock = Math.max(0, currentStock - (item.quantity || 1));
        productsSheet.getRange(rowIndex, 8).setValue(newStock);
      }
    }
  }
  
  ordersSheet.appendRow([
    orderId,
    data.CustomerName || 'Khách vãng lai',
    data.CustomerPhone || '',
    JSON.stringify(data.Items || []),
    Number(data.TotalAmount) || 0,
    data.Status || 'pending',
    data.PaymentMethod || 'cash',
    data.Note || '',
    now
  ]);
  
  return {
    success: true,
    message: 'Đơn hàng #' + orderId + ' đã được tạo',
    data: { OrderID: orderId }
  };
}

/**
 * Cập nhật trạng thái đơn hàng
 */
function updateOrderStatus(orderId, status) {
  const sheet = getSheet('Orders');
  const rowIndex = findRowIndex(sheet, 0, orderId);
  
  if (rowIndex === -1) {
    return { success: false, error: 'Không tìm thấy đơn hàng: ' + orderId };
  }
  
  sheet.getRange(rowIndex, 6).setValue(status); // Column F = Status
  
  return { 
    success: true, 
    message: 'Đã cập nhật trạng thái đơn hàng #' + orderId
  };
}

// ========== CATEGORIES API ==========

/**
 * Lấy danh sách danh mục
 */
function getCategories() {
  const sheet = getSheet('Categories');
  const categories = sheetToObjects(sheet);
  
  return {
    success: true,
    data: categories
  };
}

/**
 * Thêm danh mục
 */
function addCategory(data) {
  const sheet = getSheet('Categories');
  const id = data.ID || generateNextId(sheet, 'C');
  
  // Check duplicate name
  const existing = sheetToObjects(sheet).find(c => c.Name === data.Name);
  if (existing) {
    return { success: false, error: 'Danh mục đã tồn tại: ' + data.Name };
  }
  
  sheet.appendRow([
    id,
    data.Name || '',
    data.Description || '',
    data.Color || '#7c6aef'
  ]);
  
  return {
    success: true,
    message: 'Đã thêm danh mục: ' + data.Name,
    data: { ID: id }
  };
}

/**
 * Xóa danh mục
 */
function deleteCategory(id) {
  const sheet = getSheet('Categories');
  const rowIndex = findRowIndex(sheet, 0, id);
  
  if (rowIndex === -1) {
    return { success: false, error: 'Không tìm thấy danh mục ID: ' + id };
  }
  
  sheet.deleteRow(rowIndex);
  
  return { success: true, message: 'Đã xóa danh mục ID: ' + id };
}

// ========== DASHBOARD API ==========

/**
 * Lấy thống kê tổng quan
 */
function getDashboard() {
  const productsSheet = getSheet('Products');
  const ordersSheet = getSheet('Orders');
  
  const products = sheetToObjects(productsSheet);
  const orders = sheetToObjects(ordersSheet);
  
  // Parse order items
  orders.forEach(order => {
    try {
      if (typeof order.Items === 'string' && order.Items) {
        order.Items = JSON.parse(order.Items);
      }
    } catch (e) {
      order.Items = [];
    }
  });
  
  // Tổng sản phẩm
  const totalProducts = products.filter(p => p.Status === 'active').length;
  
  // Tổng đơn hàng
  const totalOrders = orders.length;
  
  // Tổng doanh thu
  const totalRevenue = orders
    .filter(o => o.Status !== 'cancelled')
    .reduce((sum, o) => sum + (Number(o.TotalAmount) || 0), 0);
  
  // Đơn hàng hôm nay
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOrders = orders.filter(o => {
    const orderDate = new Date(o.CreatedAt);
    orderDate.setHours(0, 0, 0, 0);
    return orderDate.getTime() === today.getTime();
  });
  
  const todayRevenue = todayOrders
    .filter(o => o.Status !== 'cancelled')
    .reduce((sum, o) => sum + (Number(o.TotalAmount) || 0), 0);
  
  // Sản phẩm sắp hết hàng (stock < 10)
  const lowStock = products.filter(p => p.Status === 'active' && Number(p.Stock) < 10);
  
  // Đơn hàng theo trạng thái
  const ordersByStatus = {};
  orders.forEach(o => {
    ordersByStatus[o.Status] = (ordersByStatus[o.Status] || 0) + 1;
  });
  
  // Top sản phẩm bán chạy
  const productSales = {};
  orders.filter(o => o.Status !== 'cancelled').forEach(order => {
    if (Array.isArray(order.Items)) {
      order.Items.forEach(item => {
        const key = item.productId || item.name;
        if (!productSales[key]) {
          productSales[key] = { name: item.name, quantity: 0, revenue: 0 };
        }
        productSales[key].quantity += (item.quantity || 1);
        productSales[key].revenue += (item.price || 0) * (item.quantity || 1);
      });
    }
  });
  
  const topProducts = Object.values(productSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
  
  // Doanh thu 7 ngày gần nhất
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const dayOrders = orders.filter(o => {
      const orderDate = new Date(o.CreatedAt);
      orderDate.setHours(0, 0, 0, 0);
      return orderDate.getTime() === date.getTime() && o.Status !== 'cancelled';
    });
    
    last7Days.push({
      date: date.toISOString().split('T')[0],
      revenue: dayOrders.reduce((sum, o) => sum + (Number(o.TotalAmount) || 0), 0),
      orders: dayOrders.length
    });
  }
  
  return {
    success: true,
    data: {
      totalProducts,
      totalOrders,
      totalRevenue,
      todayOrders: todayOrders.length,
      todayRevenue,
      lowStock: lowStock.map(p => ({ ID: p.ID, Name: p.Name, Stock: p.Stock })),
      ordersByStatus,
      topProducts,
      last7Days,
      recentOrders: orders.slice(0, 5)
    }
  };
}
