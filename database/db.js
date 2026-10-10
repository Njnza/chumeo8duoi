/* ============================================
   ShopPro Desktop - Database Module
   SQLite via sql.js (pure JS/WASM - cross-platform, no native compilation)
   ============================================ */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class ShopDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.SQL = null;
    this._saveTimer = null;
  }

  /**
   * Initialize database connection and run migrations
   */
  async init() {
    // Ensure directory exists
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Initialize sql.js
    this.SQL = await initSqlJs();

    // Load existing database or create new
    if (this.dbPath !== ':memory:' && fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    // Enable foreign keys
    this.db.run('PRAGMA foreign_keys = ON');

    // Run migrations for existing databases before running schema
    try {
      const tables = this._all("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
      if (tables.includes('products')) {
        const pragmaProd = this._all("PRAGMA table_info(products)");
        if (!pragmaProd.some(col => col.name === 'expiry_date')) {
          this.db.run("ALTER TABLE products ADD COLUMN expiry_date TEXT DEFAULT ''");
        }
      }
      if (tables.includes('order_items')) {
        const pragmaItems = this._all("PRAGMA table_info(order_items)");
        if (!pragmaItems.some(col => col.name === 'returned_quantity')) {
          this.db.run("ALTER TABLE order_items ADD COLUMN returned_quantity INTEGER DEFAULT 0");
        }
      }
      if (tables.includes('orders')) {
        const pragmaOrders = this._all("PRAGMA table_info(orders)");
        if (!pragmaOrders.some(col => col.name === 'user_id')) {
          this.db.run("ALTER TABLE orders ADD COLUMN user_id INTEGER");
        }
        if (!pragmaOrders.some(col => col.name === 'staff_name')) {
          this.db.run("ALTER TABLE orders ADD COLUMN staff_name TEXT DEFAULT ''");
        }
        if (!pragmaOrders.some(col => col.name === 'shift_id')) {
          this.db.run("ALTER TABLE orders ADD COLUMN shift_id INTEGER");
        }
      }
      if (tables.includes('customers')) {
        const pragmaCust = this._all("PRAGMA table_info(customers)");
        if (!pragmaCust.some(col => col.name === 'tier_mode')) {
          this.db.run("ALTER TABLE customers ADD COLUMN tier_mode TEXT DEFAULT 'auto'");
        }
        if (!pragmaCust.some(col => col.name === 'fixed_tier_id')) {
          this.db.run("ALTER TABLE customers ADD COLUMN fixed_tier_id TEXT DEFAULT ''");
        }
        if (!pragmaCust.some(col => col.name === 'custom_tiers_json')) {
          this.db.run("ALTER TABLE customers ADD COLUMN custom_tiers_json TEXT DEFAULT ''");
        }
      }
    } catch (e) {
      console.warn('[DB Pre-Migration]', e.message);
    }

    // Run schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
    }

    // Ensure expiry index
    try {
      this.db.run("CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(expiry_date)");
    } catch (e) {
      console.warn('[DB Migration] idx_products_expiry:', e.message);
    }

    // Ensure member_tiers setting
    try {
      const tiersSetting = this.getSetting('member_tiers');
      if (!tiersSetting) {
        this.setSetting('member_tiers', JSON.stringify([
          { id: 'bronze', name: 'Đồng', min_spent: 0, discount_percent: 0, color: '#cd7f32', badge: '🥉' },
          { id: 'silver', name: 'Bạc', min_spent: 2000000, discount_percent: 5, color: '#c0c0c0', badge: '🥈' },
          { id: 'gold', name: 'Vàng', min_spent: 5000000, discount_percent: 10, color: '#ffd700', badge: '🥇' },
          { id: 'diamond', name: 'Kim Cương', min_spent: 10000000, discount_percent: 15, color: '#00d4ff', badge: '💎' }
        ]));
      }
    } catch (e) {
      console.warn('[DB Migration] member_tiers default:', e.message);
    }

    // Ensure users table and seed
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('owner', 'staff')),
          pin TEXT NOT NULL DEFAULT '0000',
          phone TEXT DEFAULT '',
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const userCount = this._get("SELECT COUNT(*) as count FROM users")?.count || 0;
      if (userCount === 0) {
        const adminPin = this._hashPin('1234');
        const staffPin = this._hashPin('0000');
        this.db.run(`
          INSERT INTO users (username, name, role, pin, phone, status) VALUES
            ('admin', 'Chủ Cửa Hàng', 'owner', ?, '0900000001', 'active'),
            ('thungan', 'Thu Ngân Ca 1', 'staff', ?, '0900000002', 'active')
        `, [adminPin, staffPin]);
      } else {
        // BM-01: Auto-migrate any existing plaintext PINs to scrypt hash
        const allUsers = this._all("SELECT id, pin FROM users");
        for (const u of allUsers) {
          if (u.pin && !u.pin.startsWith('scrypt:')) {
            const hashed = this._hashPin(u.pin);
            this.db.run("UPDATE users SET pin = ? WHERE id = ?", [hashed, u.id]);
          }
        }
      }
    } catch (e) {
      console.warn('[DB Migration] users table:', e.message);
    }

    // Save to disk
    this._saveToDisk();

    console.log('[DB] Database initialized at:', this.dbPath);
    return this;
  }

  // ==================== HELPERS ====================

  /**
   * Run a query and return all rows as objects
   */
  _all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  /**
   * Run a query and return first row as object
   */
  _get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  /**
   * Run an INSERT/UPDATE/DELETE and return changes info
   */
  _run(sql, params = []) {
    this.db.run(sql, params);
    const lastId = this._get('SELECT last_insert_rowid() as id')?.id;
    const changes = this.db.getRowsModified();
    this._scheduleSave();
    return { lastInsertRowid: lastId, changes };
  }

  /**
   * Save database to disk (debounced)
   */
  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveToDisk(), 500);
  }

  /**
   * Flush pending database saves immediately
   */
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._saveToDisk();
  }

  _saveToDisk() {
    if (!this.db || this.dbPath === ':memory:') return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('[DB] Save error:', err.message);
    }
  }

  // ==================== SECURITY HELPERS (PIN HASHING) ====================

  _hashPin(pin, salt) {
    if (!salt) {
      salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
  }

  _verifyPin(pin, storedPin) {
    if (!storedPin) return false;
    const pinStr = String(pin).trim();
    if (!storedPin.startsWith('scrypt:')) {
      // Legacy plaintext match
      return pinStr === storedPin;
    }
    const parts = storedPin.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedHash = parts[2];
    try {
      const computedHash = crypto.scryptSync(pinStr, salt, 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
    } catch (_) {
      return false;
    }
  }

  // ==================== PRODUCTS ====================

  getProducts(filters = {}) {
    let query = `
      SELECT p.*, c.name as category_name, c.color as category_color
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
      query += ' AND p.status = ?';
      params.push(filters.status);
    }
    if (filters.category_id) {
      query += ' AND p.category_id = ?';
      params.push(filters.category_id);
    }
    if (filters.search) {
      query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }
    if (filters.low_stock) {
      query += ' AND p.stock <= p.min_stock AND p.stock > 0';
    }
    if (filters.expiry_filter === 'expired') {
      query += " AND p.expiry_date != '' AND DATE(p.expiry_date) < DATE('now', 'localtime')";
    } else if (filters.expiry_filter === 'expiring_soon') {
      query += " AND p.expiry_date != '' AND DATE(p.expiry_date) >= DATE('now', 'localtime') AND DATE(p.expiry_date) <= DATE('now', '+30 days', 'localtime')";
    }

    query += ' ORDER BY p.updated_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    return this._all(query, params);
  }

  getProduct(id) {
    return this._get(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `, [id]);
  }

  getProductByBarcode(barcode) {
    return this._get(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.barcode = ? OR p.sku = ?
    `, [barcode, barcode]);
  }

  addProduct(data) {
    const result = this._run(`
      INSERT INTO products (sku, barcode, name, description, category_id, price, sale_price, cost_price, stock, min_stock, unit, image, expiry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.sku, data.barcode || '', data.name, data.description || '',
      data.category_id || null, data.price || 0, data.sale_price || 0,
      data.cost_price || 0, data.stock || 0, data.min_stock || 5,
      data.unit || 'cái', data.image || '', data.expiry_date || '', data.status || 'active'
    ]);
    return { id: result.lastInsertRowid, ...data };
  }

  updateProduct(id, data) {
    if (!data || typeof data !== 'object') return null;

    // BM-03: Validate all input keys against allowed alphanumeric + underscore pattern
    for (const key of Object.keys(data)) {
      if (!/^[a-z_]+$/.test(key)) {
        throw new Error(`Tên trường không hợp lệ: ${key}`);
      }
    }

    const fields = [];
    const params = [];

    const allowedFields = ['sku', 'barcode', 'name', 'description', 'category_id',
      'price', 'sale_price', 'cost_price', 'stock', 'min_stock', 'unit', 'image', 'expiry_date', 'status'];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field]);
      }
    }

    if (fields.length === 0) return null;

    fields.push("updated_at = datetime('now')");
    params.push(id);

    this._run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getProduct(id);
  }

  deleteProduct(id) {
    return this._run('DELETE FROM products WHERE id = ?', [id]);
  }

  updateStock(productId, quantityChange) {
    this._run(`UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?`,
      [quantityChange, productId]);
  }

  batchUpsertProducts(productsList, updateExisting = true) {
    if (!Array.isArray(productsList) || productsList.length === 0) {
      return { success: true, count: 0, inserted: 0, updated: 0 };
    }

    this.db.run('BEGIN TRANSACTION');
    try {
      let inserted = 0;
      let updated = 0;

      const allowedFields = ['sku', 'barcode', 'name', 'description', 'category_id',
        'price', 'sale_price', 'cost_price', 'stock', 'min_stock', 'unit', 'image', 'expiry_date', 'status'];

      for (const p of productsList) {
        if (!p || !p.name) continue;

        // Auto-resolve category by name if category_id not provided
        let categoryId = p.category_id ? parseInt(p.category_id, 10) : null;
        if (!categoryId && p.category_name) {
          const catName = String(p.category_name).trim();
          if (catName) {
            const existingCat = this._get('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)', [catName]);
            if (existingCat) {
              categoryId = existingCat.id;
            } else {
              const res = this._run('INSERT INTO categories (name, description, color, sort_order) VALUES (?, ?, ?, ?)',
                [catName, 'Tự động tạo từ Excel', '#0284c7', 0]);
              categoryId = res.lastInsertRowid;
            }
          }
        }
        if (categoryId) p.category_id = categoryId;

        // Clean payload to allowed fields
        const cleanData = {};
        for (const f of allowedFields) {
          if (p[f] !== undefined) cleanData[f] = p[f];
        }

        let existing = null;
        if (cleanData.barcode) {
          existing = this._get('SELECT id FROM products WHERE barcode = ?', [String(cleanData.barcode).trim()]);
        }
        if (!existing && cleanData.sku) {
          existing = this._get('SELECT id FROM products WHERE sku = ?', [String(cleanData.sku).trim()]);
        }

        if (existing && updateExisting) {
          this.updateProduct(existing.id, cleanData);
          updated++;
        } else if (!existing) {
          if (!cleanData.sku) {
            cleanData.sku = 'SP' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
          }
          this.addProduct(cleanData);
          inserted++;
        }
      }

      this.db.run('COMMIT');
      this._saveToDisk();

      return { success: true, count: inserted + updated, inserted, updated };
    } catch (err) {
      try {
        this.db.run('ROLLBACK');
      } catch (_) {}
      throw err;
    }
  }

  getProductCount() {
    return this._get("SELECT COUNT(*) as count FROM products WHERE status = 'active'")?.count || 0;
  }

  // ==================== CATEGORIES ====================

  getCategories() {
    return this._all('SELECT * FROM categories ORDER BY sort_order, name');
  }

  getCategory(id) {
    return this._get('SELECT * FROM categories WHERE id = ?', [id]);
  }

  addCategory(data) {
    const result = this._run(`
      INSERT INTO categories (name, description, color, sort_order)
      VALUES (?, ?, ?, ?)
    `, [data.name, data.description || '', data.color || '#7c6aef', data.sort_order || 0]);
    return { id: result.lastInsertRowid, ...data };
  }

  updateCategory(id, data) {
    this._run(`
      UPDATE categories SET name = ?, description = ?, color = ?, sort_order = ? WHERE id = ?
    `, [data.name, data.description || '', data.color || '#7c6aef', data.sort_order || 0, id]);
    return this.getCategory(id);
  }

  deleteCategory(id) {
    return this._run('DELETE FROM categories WHERE id = ?', [id]);
  }

  // ==================== CUSTOMERS ====================

  getCustomers(filters = {}) {
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];

    if (filters.search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s);
    }

    query += ' ORDER BY updated_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this._all(query, params);
  }

  getCustomer(id) {
    return this._get('SELECT * FROM customers WHERE id = ?', [parseInt(id, 10)]);
  }

  addCustomer(data) {
    const result = this._run(`
      INSERT INTO customers (name, phone, email, address, note, tier_mode, fixed_tier_id, custom_tiers_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.name,
      data.phone || '',
      data.email || '',
      data.address || '',
      data.note || '',
      data.tier_mode || 'auto',
      data.fixed_tier_id || '',
      data.custom_tiers_json || ''
    ]);
    return { id: result.lastInsertRowid, ...data };
  }

  updateCustomer(id, data) {
    const custId = parseInt(id, 10);
    this._run(`
      UPDATE customers SET 
        name = ?, 
        phone = ?, 
        email = ?, 
        address = ?, 
        note = ?, 
        tier_mode = ?, 
        fixed_tier_id = ?, 
        custom_tiers_json = ?, 
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      data.name, 
      data.phone || '', 
      data.email || '', 
      data.address || '', 
      data.note || '', 
      data.tier_mode || 'auto',
      data.fixed_tier_id || '',
      data.custom_tiers_json || '',
      custId
    ]);
    return this.getCustomer(custId);
  }

  deleteCustomer(id) {
    return this._run('DELETE FROM customers WHERE id = ?', [id]);
  }

  // ==================== ORDERS ====================

  generateOrderCode() {
    const prefix = this.getSetting('order_prefix') || 'HD';
    const now = new Date();
    const y = now.getFullYear().toString().slice(2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const prefixDate = `${prefix}${y}${m}${d}-`;

    const rows = this._all('SELECT order_code FROM orders WHERE order_code LIKE ?', [`${prefixDate}%`]);
    let maxNum = 0;
    for (const r of rows) {
      const parts = r.order_code.split('-');
      if (parts.length >= 2) {
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }

    return `${prefixDate}${String(maxNum + 1).padStart(4, '0')}`;
  }

  createOrder(data) {
    const orderCode = this.generateOrderCode();

    this.db.run('BEGIN TRANSACTION');
    try {
      const activeShift = this.getCurrentShift(data.user_id);
      const shiftId = data.shift_id !== undefined ? data.shift_id : (activeShift ? activeShift.id : null);

      // Insert order
      this.db.run(`
        INSERT INTO orders (order_code, customer_id, subtotal, discount_amount, discount_percent, tax_amount, total, payment_method, amount_paid, change_amount, user_id, staff_name, shift_id, status, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        orderCode,
        data.customer_id || null,
        data.subtotal || 0,
        data.discount_amount || 0,
        data.discount_percent || 0,
        data.tax_amount || 0,
        data.total || 0,
        data.payment_method || 'cash',
        data.amount_paid || 0,
        data.change_amount || 0,
        data.user_id || null,
        data.staff_name || '',
        shiftId,
        data.status || 'completed',
        data.note || ''
      ]);

      const orderId = this._get('SELECT last_insert_rowid() as id')?.id;

      // Insert items and update stock
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          this.db.run(`
            INSERT INTO order_items (order_id, product_id, product_name, product_sku, price, quantity, discount, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            orderId, item.product_id, item.product_name, item.product_sku || '',
            item.price, item.quantity, item.discount || 0, item.subtotal
          ]);

          // Decrease stock
          if (item.product_id) {
            this.db.run('UPDATE products SET stock = stock - ?, updated_at = datetime(\'now\') WHERE id = ?',
              [item.quantity, item.product_id]);
          }
        }
      }

      // Update customer stats
      if (data.customer_id) {
        this.db.run('UPDATE customers SET total_spent = total_spent + ?, visit_count = visit_count + 1, updated_at = datetime(\'now\') WHERE id = ?',
          [data.total, data.customer_id]);
      }

      this.db.run('COMMIT');
      this._saveToDisk();

      return { id: orderId, order_code: orderCode };
    } catch (err) {
      try {
        this.db.run('ROLLBACK');
      } catch (_) {}
      throw err;
    }
  }

  getOrders(filters = {}) {
    let query = `
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
      query += ' AND o.status = ?';
      params.push(filters.status);
    }
    if (filters.payment_method) {
      query += ' AND o.payment_method = ?';
      params.push(filters.payment_method);
    }
    if (filters.date_from) {
      query += ' AND o.created_at >= ?';
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      query += ' AND o.created_at <= ?';
      params.push(filters.date_to);
    }
    if (filters.search) {
      query += ' AND (o.order_code LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY o.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    return this._all(query, params);
  }

  getOrder(id) {
    const order = this._get(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `, [id]);

    if (order) {
      order.items = this._all('SELECT * FROM order_items WHERE order_id = ?', [id]);
    }

    return order;
  }

  cancelOrder(id) {
    const order = this.getOrder(id);
    if (!order) return null;

    this.db.run('BEGIN TRANSACTION');
    try {
      // Restore stock
      if (order.items) {
        for (const item of order.items) {
          if (item.product_id) {
            this.db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
          }
        }
      }

      // Update customer stats
      if (order.customer_id) {
        this.db.run('UPDATE customers SET total_spent = total_spent - ?, visit_count = MAX(0, visit_count - 1) WHERE id = ?',
          [order.total, order.customer_id]);
      }

      // Mark as cancelled
      this.db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [id]);

      this.db.run('COMMIT');
      this._saveToDisk();

      return this.getOrder(id);
    } catch (err) {
      try {
        this.db.run('ROLLBACK');
      } catch (_) {}
      throw err;
    }
  }

  // ==================== REPORTS ====================

  getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];

    const totalProducts = this._get("SELECT COUNT(*) as count FROM products WHERE status = 'active'")?.count || 0;
    const totalOrders = this._get("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'")?.count || 0;
    const totalRevenue = this._get("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'completed'")?.total || 0;
    const totalCustomers = this._get('SELECT COUNT(*) as count FROM customers')?.count || 0;

    const todayOrders = this._get(`
      SELECT COUNT(*) as count FROM orders WHERE status = 'completed' AND DATE(created_at) = ?
    `, [today])?.count || 0;

    const todayRevenue = this._get(`
      SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'completed' AND DATE(created_at) = ?
    `, [today])?.total || 0;

    const lowStockProducts = this.getProducts({ low_stock: true, status: 'active' });

    return {
      totalProducts, totalOrders, totalRevenue, totalCustomers,
      todayOrders, todayRevenue, lowStockProducts
    };
  }

  getRevenueByDateRange(from, to) {
    return this._all(`
      SELECT DATE(created_at) as date,
             COUNT(*) as order_count,
             COALESCE(SUM(total), 0) as revenue
      FROM orders
      WHERE status = 'completed' AND DATE(created_at) BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [from, to]);
  }

  getTopProducts(limit = 10, from = null, to = null) {
    let query = `
      SELECT oi.product_id, oi.product_name,
             SUM(oi.quantity) as total_quantity,
             SUM(oi.subtotal) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'completed'
    `;
    const params = [];

    if (from) {
      query += ' AND DATE(o.created_at) >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND DATE(o.created_at) <= ?';
      params.push(to);
    }

    query += ' GROUP BY oi.product_id, oi.product_name ORDER BY total_quantity DESC LIMIT ?';
    params.push(limit);

    return this._all(query, params);
  }

  getRevenueByPaymentMethod(from, to) {
    return this._all(`
      SELECT payment_method, COUNT(*) as order_count, COALESCE(SUM(total), 0) as revenue
      FROM orders WHERE status = 'completed' AND DATE(created_at) BETWEEN ? AND ?
      GROUP BY payment_method
    `, [from, to]);
  }

  // ==================== ORDER RETURNS ====================

  generateReturnCode() {
    const d = new Date();
    const y = String(d.getFullYear()).slice(-2);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const prefixDate = `TH${y}${m}${day}-`;

    const rows = this._all('SELECT return_code FROM order_returns WHERE return_code LIKE ?', [`${prefixDate}%`]);
    let maxNum = 0;
    for (const r of rows) {
      const parts = r.return_code.split('-');
      if (parts.length >= 2) {
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    return `${prefixDate}${String(maxNum + 1).padStart(4, '0')}`;
  }

  processOrderReturn(data) {
    const order = this.getOrder(data.order_id);
    if (!order) throw new Error('Không tìm thấy đơn hàng cần trả');

    const returnCode = this.generateReturnCode();

    this.db.run('BEGIN TRANSACTION');
    try {
      let totalRefund = 0;
      const returnItems = data.return_items || data.items || [];
      for (const it of returnItems) {
        totalRefund += Number(it.refund_subtotal || it.refund_price || 0) * (Number(it.quantity) || 1);
      }

      this.db.run(`
        INSERT INTO order_returns (return_code, order_id, order_code, customer_id, customer_name, refund_amount, reason, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        returnCode,
        order.id,
        order.order_code,
        order.customer_id || null,
        order.customer_name || 'Khách lẻ',
        totalRefund,
        data.reason || 'Khách đổi trả hàng',
        data.note || ''
      ]);

      const returnId = this._get('SELECT last_insert_rowid() as id')?.id;

      const itemsToProcess = data.return_items || data.items || [];
      for (const it of itemsToProcess) {
        if (!it.quantity || it.quantity <= 0) continue;

        const origItem = this._get('SELECT * FROM order_items WHERE id = ?', [it.order_item_id]);
        if (!origItem) continue;

        const maxReturnable = origItem.quantity - (origItem.returned_quantity || 0);
        const qtyToReturn = Math.min(it.quantity, maxReturnable);
        if (qtyToReturn <= 0) continue;

        this.db.run(`
          INSERT INTO order_return_items (return_id, order_item_id, product_id, product_name, product_sku, price, quantity, refund_subtotal)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          returnId,
          origItem.id,
          origItem.product_id,
          origItem.product_name,
          origItem.product_sku || '',
          origItem.price,
          qtyToReturn,
          it.refund_subtotal !== undefined ? it.refund_subtotal : ((it.refund_price || origItem.price) * qtyToReturn)
        ]);

        this.db.run('UPDATE order_items SET returned_quantity = COALESCE(returned_quantity, 0) + ? WHERE id = ?', [qtyToReturn, origItem.id]);

        if (origItem.product_id) {
          this.db.run("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?", [qtyToReturn, origItem.product_id]);
        }
      }

      const checkItems = this._all('SELECT quantity, returned_quantity FROM order_items WHERE order_id = ?', [order.id]);
      const allReturned = checkItems.length > 0 && checkItems.every(i => (i.returned_quantity || 0) >= i.quantity);
      if (allReturned) {
        this.db.run("UPDATE orders SET status = 'returned' WHERE id = ?", [order.id]);
      }

      if (order.customer_id && totalRefund > 0) {
        this.db.run("UPDATE customers SET total_spent = MAX(0, total_spent - ?), updated_at = datetime('now') WHERE id = ?",
          [totalRefund, order.customer_id]);
      }

      this.db.run('COMMIT');
      this._saveToDisk();

      return {
        id: returnId,
        return_code: returnCode,
        refund_amount: totalRefund,
        order_code: order.order_code
      };
    } catch (err) {
      try {
        this.db.run('ROLLBACK');
      } catch (_) {}
      throw err;
    }
  }

  getOrderReturns(orderId = null) {
    let sql = `
      SELECT r.*, COUNT(ri.id) as item_count
      FROM order_returns r
      LEFT JOIN order_return_items ri ON r.id = ri.return_id
    `;
    const params = [];
    if (orderId) {
      sql += ' WHERE r.order_id = ?';
      params.push(orderId);
    }
    sql += ' GROUP BY r.id ORDER BY r.created_at DESC';
    return this._all(sql, params);
  }

  getOrderReturnDetail(returnId) {
    const ret = this._get('SELECT * FROM order_returns WHERE id = ?', [returnId]);
    if (!ret) return null;
    ret.items = this._all('SELECT * FROM order_return_items WHERE return_id = ?', [returnId]);
    return ret;
  }

  // ==================== PROFIT & HOURLY REPORTS ====================

  getProfitReport(from = null, to = null) {
    let dateFilter = '';
    const params = [];
    if (from) {
      dateFilter += ' AND DATE(o.created_at) >= ?';
      params.push(from);
    }
    if (to) {
      dateFilter += ' AND DATE(o.created_at) <= ?';
      params.push(to);
    }

    const orderStats = this._get(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(subtotal), 0) as total_subtotal,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(tax_amount), 0) as total_tax,
        COALESCE(SUM(total), 0) as total_revenue
      FROM orders o
      WHERE o.status IN ('completed', 'returned') ${dateFilter}
    `, params) || { total_orders: 0, total_subtotal: 0, total_discount: 0, total_tax: 0, total_revenue: 0 };

    const cogsStats = this._get(`
      SELECT 
        COALESCE(SUM((oi.quantity - COALESCE(oi.returned_quantity, 0)) * COALESCE(p.cost_price, 0)), 0) as total_cost,
        COALESCE(SUM((oi.quantity - COALESCE(oi.returned_quantity, 0)) * oi.price), 0) as net_items_sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.status IN ('completed', 'returned') ${dateFilter}
    `, params) || { total_cost: 0, net_items_sales: 0 };

    let returnDateFilter = '';
    const returnParams = [];
    if (from) {
      returnDateFilter += ' AND DATE(created_at) >= ?';
      returnParams.push(from);
    }
    if (to) {
      returnDateFilter += ' AND DATE(created_at) <= ?';
      returnParams.push(to);
    }
    const refundStats = this._get(`
      SELECT COALESCE(SUM(refund_amount), 0) as total_refund, COUNT(id) as return_count
      FROM order_returns
      WHERE 1=1 ${returnDateFilter}
    `, returnParams) || { total_refund: 0, return_count: 0 };

    const netRevenue = Math.max(0, orderStats.total_revenue - refundStats.total_refund);
    const totalCost = cogsStats.total_cost;
    const grossProfit = netRevenue - totalCost;
    const profitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    return {
      totalOrders: orderStats.total_orders,
      grossRevenue: orderStats.total_revenue,
      totalRefund: refundStats.total_refund,
      returnCount: refundStats.return_count,
      netRevenue,
      totalCost,
      grossProfit,
      profitMargin: Math.round(profitMargin * 10) / 10
    };
  }

  getHourlySales(from = null, to = null) {
    let dateFilter = '';
    const params = [];
    if (from) {
      dateFilter += ' AND DATE(created_at) >= ?';
      params.push(from);
    }
    if (to) {
      dateFilter += ' AND DATE(created_at) <= ?';
      params.push(to);
    }

    const rows = this._all(`
      SELECT 
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(id) as order_count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      WHERE status = 'completed' ${dateFilter}
      GROUP BY hour
      ORDER BY hour ASC
    `, params);

    const hourlyMap = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { hour: h, order_count: 0, revenue: 0 };
    }
    for (const r of rows) {
      if (hourlyMap[r.hour] !== undefined) {
        hourlyMap[r.hour] = r;
      }
    }

    return Object.values(hourlyMap);
  }

  // ==================== SETTINGS ====================

  getSetting(key) {
    const row = this._get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    this._run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
  }

  getAllSettings() {
    const rows = this._all('SELECT * FROM settings');
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  // ==================== MEMBER TIERS ====================

  getMemberTiers() {
    const raw = this.getSetting('member_tiers');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (_) {
      return [];
    }
  }

  saveMemberTiers(tiers) {
    return this.setSetting('member_tiers', JSON.stringify(tiers));
  }

  // ==================== USERS & PERMISSIONS ====================

  getUsers() {
    return this._all('SELECT id, username, name, role, phone, status, created_at FROM users ORDER BY role ASC, id ASC');
  }

  getUserById(id) {
    return this._get('SELECT id, username, name, role, phone, status, created_at FROM users WHERE id = ?', [id]);
  }

  createUser(data) {
    if (!data.username || !data.name) throw new Error('Tên đăng nhập và họ tên không được để trống');
    const existing = this._get('SELECT id FROM users WHERE username = ?', [data.username]);
    if (existing) throw new Error(`Tên đăng nhập "${data.username}" đã tồn tại`);

    const rawPin = (data.pin !== undefined && data.pin !== null && data.pin !== '') ? String(data.pin) : '0000';
    const hashedPin = rawPin.startsWith('scrypt:') ? rawPin : this._hashPin(rawPin);

    this.db.run(`
      INSERT INTO users (username, name, role, pin, phone, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      data.username,
      data.name,
      data.role || 'staff',
      hashedPin,
      data.phone || '',
      data.status || 'active'
    ]);
    this._saveToDisk();
    const id = this._get('SELECT last_insert_rowid() as id')?.id;
    return this.getUserById(id);
  }

  updateUser(id, data) {
    const user = this._get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) throw new Error('Không tìm thấy người dùng');

    if (data.username && data.username !== user.username) {
      const existing = this._get('SELECT id FROM users WHERE username = ? AND id != ?', [data.username, id]);
      if (existing) throw new Error(`Tên đăng nhập "${data.username}" đã tồn tại`);
    }

    let pinToUpdate = user.pin;
    if (data.pin !== undefined && data.pin !== null && String(data.pin).trim() !== '') {
      const rawPin = String(data.pin).trim();
      pinToUpdate = rawPin.startsWith('scrypt:') ? rawPin : this._hashPin(rawPin);
    }

    this.db.run(`
      UPDATE users SET
        username = ?,
        name = ?,
        role = ?,
        pin = ?,
        phone = ?,
        status = ?
      WHERE id = ?
    `, [
      data.username !== undefined ? data.username : user.username,
      data.name !== undefined ? data.name : user.name,
      data.role !== undefined ? data.role : user.role,
      pinToUpdate,
      data.phone !== undefined ? data.phone : user.phone,
      data.status !== undefined ? data.status : user.status,
      id
    ]);
    this._saveToDisk();
    return this.getUserById(id);
  }

  deleteUser(id) {
    const user = this.getUserById(id);
    if (!user) throw new Error('Không tìm thấy người dùng');
    if (user.role === 'owner') {
      const ownerCount = this._get("SELECT COUNT(*) as count FROM users WHERE role = 'owner'")?.count || 0;
      if (ownerCount <= 1) throw new Error('Không thể xóa tài khoản Chủ Shop duy nhất');
    }
    this.db.run('DELETE FROM users WHERE id = ?', [id]);
    this._saveToDisk();
    return { success: true };
  }

  authenticateUser(usernameOrPin, pin) {
    if (pin === undefined) {
      const users = this._all("SELECT id, username, name, role, pin, phone, status FROM users WHERE status = 'active'");
      for (const u of users) {
        if (this._verifyPin(usernameOrPin, u.pin)) {
          const { pin: _p, ...safeUser } = u;
          return safeUser;
        }
      }
      throw new Error('Mã PIN không chính xác hoặc tài khoản đã bị khóa');
    }
    const user = this._get("SELECT id, username, name, role, pin, phone, status FROM users WHERE username = ? AND status = 'active'", [usernameOrPin]);
    if (!user || !this._verifyPin(pin, user.pin)) {
      throw new Error('Tài khoản hoặc mã PIN không đúng');
    }
    const { pin: _p, ...safeUser } = user;
    return safeUser;
  }

  verifyOwnerPin(pin) {
    const owners = this._all("SELECT id, name, pin FROM users WHERE role = 'owner' AND status = 'active'");
    for (const o of owners) {
      if (this._verifyPin(pin, o.pin)) {
        return true;
      }
    }
    return false;
  }

  // ==================== SHIFTS (QUẢN LÝ CA BÁN HÀNG) ====================

  getCurrentShift(userId = null) {
    let sql = "SELECT * FROM shifts WHERE status = 'open'";
    const params = [];
    if (userId) {
      sql += " AND user_id = ?";
      params.push(userId);
    }
    sql += " ORDER BY id DESC LIMIT 1";
    return this._get(sql, params);
  }

  openShift(data) {
    const userId = data.user_id !== undefined ? data.user_id : data.userId;
    const existing = this.getCurrentShift(userId);
    if (existing) {
      throw new Error(`Đang có ca làm việc chưa đóng (Ca #${existing.id} mở lúc ${existing.start_time}). Vui lòng kết ca hiện tại trước.`);
    }

    const staffName = data.staff_name || data.staffName || 'Nhân Viên';
    const initCash = Number(data.initial_cash !== undefined ? data.initial_cash : (data.initialCash !== undefined ? data.initialCash : 0)) || 0;

    const info = this._run(`
      INSERT INTO shifts (user_id, staff_name, initial_cash, status, note, start_time)
      VALUES (?, ?, ?, 'open', ?, datetime('now', 'localtime'))
    `, [
      userId || null,
      staffName,
      initCash,
      data.note || ''
    ]);

    return this.getShiftById(info.lastInsertRowid);
  }

  getShiftById(id) {
    return this._get('SELECT * FROM shifts WHERE id = ?', [id]);
  }

  getShiftSummary(id) {
    const shift = this.getShiftById(id);
    if (!shift) throw new Error('Không tìm thấy ca làm việc');

    // Orders placed during this shift
    const ordersStats = this._get(`
      SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END), 0) as transfer_sales
      FROM orders
      WHERE status = 'completed'
        AND (shift_id = ? OR (shift_id IS NULL AND datetime(created_at, 'localtime') > datetime(?) AND datetime(created_at, 'localtime') <= ${shift.end_time ? "datetime(?)" : "datetime('now', 'localtime')"}))
    `, shift.end_time ? [id, shift.start_time, shift.end_time] : [id, shift.start_time]);

    // Cash flow during shift
    const cashFlowStats = this._get(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as cash_in,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as cash_out
      FROM cash_flow
      WHERE (shift_id = ? OR (shift_id IS NULL AND datetime(created_at, 'localtime') >= datetime(?)))
    `, [id, shift.start_time]);

    const initialCash = Number(shift.initial_cash) || 0;
    const cashSales = Number(ordersStats?.cash_sales) || 0;
    const cashIn = Number(cashFlowStats?.cash_in) || 0;
    const cashOut = Number(cashFlowStats?.cash_out) || 0;
    const expectedCash = initialCash + cashSales + cashIn - cashOut;

    return {
      shift,
      orders_count: ordersStats?.order_count || 0,
      total_revenue: ordersStats?.total_revenue || 0,
      cash_sales: cashSales,
      card_sales: ordersStats?.card_sales || 0,
      transfer_sales: ordersStats?.transfer_sales || 0,
      cash_in: cashIn,
      cash_out: cashOut,
      initial_cash: initialCash,
      expected_cash: expectedCash
    };
  }

  closeShift(id, data = {}) {
    const summary = this.getShiftSummary(id);
    const actualCash = Number(data.actual_cash !== undefined ? data.actual_cash : (data.actualCash !== undefined ? data.actualCash : 0)) || 0;
    const difference = actualCash - summary.expected_cash;

    this._run(`
      UPDATE shifts SET
        end_time = datetime('now', 'localtime'),
        expected_cash = ?,
        actual_cash = ?,
        difference = ?,
        status = 'closed',
        note = CASE WHEN ? != '' THEN ? ELSE note END
      WHERE id = ?
    `, [
      summary.expected_cash,
      actualCash,
      difference,
      data.note || '',
      data.note || '',
      id
    ]);

    return this.getShiftById(id);
  }

  getShifts(limit = 30) {
    return this._all(`
      SELECT * FROM shifts ORDER BY id DESC LIMIT ?
    `, [limit]);
  }

  // ==================== CASH FLOW (SỔ QUỸ THU CHI) ====================

  addCashFlow(data) {
    if (!data.type || !data.amount) throw new Error('Loại phiếu và số tiền không được để trống');
    if (!['income', 'expense'].includes(data.type)) throw new Error('Loại phiếu không hợp lệ');

    const userId = data.user_id !== undefined ? data.user_id : data.userId;
    const staffName = data.staff_name !== undefined ? data.staff_name : (data.staffName || '');
    const shiftId = data.shift_id !== undefined ? data.shift_id : data.shiftId;

    const info = this._run(`
      INSERT INTO cash_flow (type, category, amount, user_id, staff_name, shift_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      data.type,
      data.category || (data.type === 'income' ? 'Thu khác' : 'Chi khác'),
      Math.abs(Number(data.amount)),
      userId || null,
      staffName,
      shiftId || null,
      data.note || ''
    ]);

    return this.getCashFlowById(info.lastInsertRowid);
  }

  getCashFlowById(id) {
    return this._get('SELECT * FROM cash_flow WHERE id = ?', [id]);
  }

  getCashFlows(filter = {}) {
    let sql = 'SELECT * FROM cash_flow WHERE 1=1';
    const params = [];
    if (filter.type) {
      sql += ' AND type = ?';
      params.push(filter.type);
    }
    if (filter.from) {
      sql += ' AND DATE(created_at) >= ?';
      params.push(filter.from);
    }
    if (filter.to) {
      sql += ' AND DATE(created_at) <= ?';
      params.push(filter.to);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(filter.limit || 50);

    return this._all(sql, params);
  }

  getCashFlowSummary(from = null, to = null) {
    let sql = `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
      FROM cash_flow WHERE 1=1
    `;
    const params = [];
    if (from) {
      sql += ' AND DATE(created_at) >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND DATE(created_at) <= ?';
      params.push(to);
    }
    const row = this._get(sql, params) || { total_income: 0, total_expense: 0 };
    return {
      total_income: row.total_income,
      total_expense: row.total_expense,
      net_cash: row.total_income - row.total_expense
    };
  }

  // ==================== AI ASSISTANT & SMART ANALYTICS ====================

  getABCProductAnalysis() {
    // 1. Get revenue per active product
    const rows = this._all(`
      SELECT 
        p.id, p.sku, p.barcode, p.name, p.price, p.cost_price, p.stock, p.min_stock,
        COALESCE(SUM(oi.quantity), 0) as total_sold,
        COALESCE(SUM(oi.subtotal), 0) as total_revenue
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'completed'
      WHERE p.status = 'active'
      GROUP BY p.id
      ORDER BY total_revenue DESC
    `);

    const grandTotalRevenue = rows.reduce((sum, r) => sum + (Number(r.total_revenue) || 0), 0);
    let runningRevenue = 0;

    return rows.map((p, idx) => {
      runningRevenue += Number(p.total_revenue) || 0;
      const cumulativePercent = grandTotalRevenue > 0 ? (runningRevenue / grandTotalRevenue) * 100 : 100;
      
      let abcCategory = 'C';
      if (p.total_revenue > 0) {
        if (cumulativePercent <= 80 || idx === 0) {
          abcCategory = 'A';
        } else if (cumulativePercent <= 95) {
          abcCategory = 'B';
        }
      }

      // Estimate Days of Stock (dựa trên 30 ngày qua)
      const dailySalesRate = p.total_sold > 0 ? (p.total_sold / 30) : 0;
      const daysOfStock = dailySalesRate > 0 ? Math.round(p.stock / dailySalesRate) : (p.stock > 0 ? 999 : 0);

      // AI Recommendation
      let aiRecommendation = '';
      if (p.stock <= p.min_stock) {
        aiRecommendation = 'Sắp hết hàng: Cần nhập thêm ngay lập tức';
      } else if (abcCategory === 'A') {
        aiRecommendation = 'Sản phẩm chủ lực (Nhóm A): Luôn duy trì đủ tồn kho và trưng bày vị trí đẹp';
      } else if (abcCategory === 'C' && p.stock > 20) {
        aiRecommendation = 'Hàng tồn đọng bán chậm (Nhóm C): Xem xét giảm giá xả kho hoặc làm combo';
      } else {
        aiRecommendation = 'Bán ổn định: Duy trì mức đặt hàng thông thường';
      }

      return {
        ...p,
        abc_category: abcCategory,
        cumulative_percent: Math.round(cumulativePercent * 10) / 10,
        days_of_stock: daysOfStock,
        ai_recommendation: aiRecommendation
      };
    });
  }

  // ==================== BACKUP & CLOSE ====================

  async backup(backupPath) {
    this.flush(); // ensure latest data is saved
    fs.copyFileSync(this.dbPath, backupPath);
  }

  close() {
    this.flush();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = ShopDatabase;
