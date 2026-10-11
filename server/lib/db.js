/**
 * ShopPro - MongoDB Connection & Caching Layer for Vercel Serverless & Node.js
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'shoppro';

if (!uri) {
  console.warn('[DB] WARNING: MONGODB_URI environment variable is not defined!');
}

let cachedClient = null;
let cachedDb = null;

function findMongoUri() {
  // 1. Check exact or known integration variables
  let val = process.env.MONGODB_URI || process.env.chumeo8duoi_MONGODB_URI || process.env.MONGODB_URL || process.env.STORAGE_MONGODB_URI;

  // 2. Scan all environment variables dynamically
  if (!val) {
    for (const [k, v] of Object.entries(process.env)) {
      if (v && typeof v === 'string' && (k.endsWith('MONGODB_URI') || k.endsWith('MONGODB_URL') || k.includes('MONGODB'))) {
        if (v.includes('mongodb://') || v.includes('mongodb+srv://')) {
          console.log(`[DB] Auto-detected MongoDB URI from env variable: ${k}`);
          val = v;
          break;
        }
      }
    }
  }

  if (!val) val = uri;
  if (!val) return null;

  // Strip accidental surrounding quotes and whitespace
  val = String(val).trim().replace(/^["']+|["']+$/g, '').trim();
  return val;
}

async function getDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  const connectionUri = findMongoUri();
  if (!connectionUri) {
    throw new Error('Chưa tìm thấy biến kết nối MongoDB trên Vercel. Vui lòng kiểm tra biến chumeo8duoi_MONGODB_URI hoặc MONGODB_URI.');
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(connectionUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
    });
    await cachedClient.connect();
    console.log('[DB] Connected to MongoDB Atlas:', dbName);
  }

  cachedDb = cachedClient.db(dbName);
  await initIndexesAndSeed(cachedDb);
  return cachedDb;
}

/**
 * Auto-generate next integer ID for a collection
 */
async function getNextId(db, sequenceName) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result?.seq || 1;
}

/**
 * Initialize Lean Indexes (Optimized for 512MB storage limit) and Seed data
 */
async function initIndexesAndSeed(db) {
  try {
    // Lean indexes: only index necessary query fields
    await Promise.allSettled([
      db.collection('products').createIndex({ id: 1 }, { unique: true }),
      db.collection('products').createIndex({ barcode: 1 }),
      db.collection('products').createIndex({ sku: 1 }),
      db.collection('products').createIndex({ category_id: 1 }),
      db.collection('products').createIndex({ status: 1 }),
      db.collection('categories').createIndex({ id: 1 }, { unique: true }),
      db.collection('customers').createIndex({ id: 1 }, { unique: true }),
      db.collection('customers').createIndex({ phone: 1 }),
      db.collection('orders').createIndex({ id: 1 }, { unique: true }),
      db.collection('orders').createIndex({ order_code: 1 }, { unique: true }),
      db.collection('orders').createIndex({ created_at: -1 }),
      db.collection('orders').createIndex({ status: 1 }),
      db.collection('order_returns').createIndex({ id: 1 }, { unique: true }),
      db.collection('order_returns').createIndex({ order_id: 1 }),
      db.collection('users').createIndex({ id: 1 }, { unique: true }),
      db.collection('users').createIndex({ username: 1 }, { unique: true }),
      db.collection('shifts').createIndex({ id: 1 }, { unique: true }),
      db.collection('cash_flow').createIndex({ id: 1 }, { unique: true }),
      db.collection('settings').createIndex({ key: 1 }, { unique: true }),
      // TTL indexes for auto-cleanup (B3, B4, S5)
      db.collection('scanner_events').createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 }),
      db.collection('scanner_photos').createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 }),
      db.collection('login_attempts').createIndex({ created_at: 1 }, { expireAfterSeconds: 900 }),
      db.collection('audit_logs').createIndex({ created_at: -1 })
    ]);

    // Check if initial seed is needed
    const userCount = await db.collection('users').countDocuments();
    if (userCount === 0) {
      console.log('[DB] Seeding default database records...');

      // 1. Users
      const crypto = require('crypto');
      const hashPin = (pin) => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
        return `scrypt:${salt}:${hash}`;
      };

      await db.collection('users').insertMany([
        { id: 1, username: 'admin', name: 'Chủ Cửa Hàng', role: 'owner', pin: hashPin('1234'), phone: '0900000001', status: 'active', created_at: new Date() },
        { id: 2, username: 'thungan', name: 'Thu Ngân Ca 1', role: 'staff', pin: hashPin('0000'), phone: '0900000002', status: 'active', created_at: new Date() }
      ]);
      await db.collection('counters').updateOne({ _id: 'users' }, { $set: { seq: 2 } }, { upsert: true });

      // 2. Categories
      const categories = [
        { id: 1, name: 'Thời trang', description: 'Quần áo, giày dép, phụ kiện thời trang', color: '#7c6aef', sort_order: 1, created_at: new Date() },
        { id: 2, name: 'Điện tử', description: 'Thiết bị điện tử, linh kiện, phụ kiện', color: '#00d4ff', sort_order: 2, created_at: new Date() },
        { id: 3, name: 'Gia dụng', description: 'Đồ gia dụng, nhà bếp, nội thất', color: '#00e676', sort_order: 3, created_at: new Date() },
        { id: 4, name: 'Thực phẩm', description: 'Thực phẩm, đồ uống, bánh kẹo', color: '#ff6b6b', sort_order: 4, created_at: new Date() },
        { id: 5, name: 'Phụ kiện', description: 'Balo, túi xách, phụ kiện khác', color: '#ffab40', sort_order: 5, created_at: new Date() }
      ];
      await db.collection('categories').insertMany(categories);
      await db.collection('counters').updateOne({ _id: 'categories' }, { $set: { seq: 5 } }, { upsert: true });

      // 3. Settings
      await db.collection('settings').insertMany([
        { key: 'shop_name', value: 'ShopPro' },
        { key: 'shop_address', value: '' },
        { key: 'shop_phone', value: '' },
        { key: 'shop_email', value: '' },
        { key: 'tax_enabled', value: 'false' },
        { key: 'tax_rate', value: '10' },
        { key: 'currency', value: 'VND' },
        { key: 'receipt_width', value: '80' },
        { key: 'receipt_footer', value: 'Cảm ơn quý khách!' },
        { key: 'order_prefix', value: 'HD' },
        { key: 'auto_print', value: 'false' },
        { key: 'theme_mode', value: 'light' },
        { key: 'theme_color', value: '#364e68' },
        {
          key: 'member_tiers',
          value: JSON.stringify([
            { id: 'bronze', name: 'Đồng', min_spent: 0, discount_percent: 0, color: '#cd7f32', badge: '🥉' },
            { id: 'silver', name: 'Bạc', min_spent: 2000000, discount_percent: 5, color: '#c0c0c0', badge: '🥈' },
            { id: 'gold', name: 'Vàng', min_spent: 5000000, discount_percent: 10, color: '#ffd700', badge: '🥇' },
            { id: 'diamond', name: 'Kim Cương', min_spent: 10000000, discount_percent: 15, color: '#00d4ff', badge: '💎' }
          ])
        }
      ]);

      // 4. Sample Products (Lightweight CDN URLs, no base64)
      const sampleProducts = [
        { id: 1, sku: 'SP-001', barcode: '8936082031001', name: 'Áo thun nam basic', description: 'Áo thun cotton 100%, form regular fit', category_id: 1, price: 199000, sale_price: 149000, cost_price: 95000, stock: 50, min_stock: 5, unit: 'cái', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=60', expiry_date: '', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 2, sku: 'SP-002', barcode: '8936082031002', name: 'Quần jeans slim fit', description: 'Quần jeans co giãn, form slim fit', category_id: 1, price: 450000, sale_price: 0, cost_price: 220000, stock: 30, min_stock: 5, unit: 'cái', image: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=300&auto=format&fit=crop&q=60', expiry_date: '', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 3, sku: 'SP-003', barcode: '8936082031003', name: 'Tai nghe Bluetooth TWS', description: 'Tai nghe không dây, pin 24h, chống ồn', category_id: 2, price: 350000, sale_price: 299000, cost_price: 150000, stock: 100, min_stock: 5, unit: 'cái', image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=300&auto=format&fit=crop&q=60', expiry_date: '', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 4, sku: 'SP-004', barcode: '8936082031004', name: 'Bình nước inox 500ml', description: 'Bình giữ nhiệt 24h, inox 304', category_id: 3, price: 180000, sale_price: 0, cost_price: 85000, stock: 200, min_stock: 5, unit: 'cái', image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=300&auto=format&fit=crop&q=60', expiry_date: '', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 5, sku: 'SP-005', barcode: '8936082031005', name: 'Balo laptop 15.6 inch', description: 'Balo chống nước, nhiều ngăn', category_id: 5, price: 520000, sale_price: 420000, cost_price: 250000, stock: 45, min_stock: 5, unit: 'cái', image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&auto=format&fit=crop&q=60', expiry_date: '', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 6, sku: 'SP-006', barcode: '8936082031006', name: 'Áo khoác gió unisex', description: 'Áo khoác gió nhẹ, chống nước', category_id: 1, price: 320000, sale_price: 250000, cost_price: 155000, stock: 80, min_stock: 5, unit: 'cái', image: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=300&auto=format&fit=crop&q=60', expiry_date: '', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 7, sku: 'SP-007', barcode: '8936082031007', name: 'Chuột không dây', description: 'Chuột silent click, pin AA 12 tháng', category_id: 2, price: 150000, sale_price: 0, cost_price: 65000, stock: 150, min_stock: 5, unit: 'cái', image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=300&auto=format&fit=crop&q=60', expiry_date: '', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 8, sku: 'SP-008', barcode: '8936082031008', name: 'Sổ tay bìa da A5', description: 'Sổ 200 trang giấy kem, bìa da PU', category_id: 5, price: 95000, sale_price: 75000, cost_price: 40000, stock: 300, min_stock: 5, unit: 'cuốn', image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop&q=60', expiry_date: '', status: 'active', created_at: new Date(), updated_at: new Date() }
      ];
      await db.collection('products').insertMany(sampleProducts);
      await db.collection('counters').updateOne({ _id: 'products' }, { $set: { seq: 8 } }, { upsert: true });

      console.log('[DB] Seeding completed successfully!');
    }
  } catch (err) {
    console.error('[DB] Index/Seed error:', err.message);
  }
}

module.exports = {
  getDatabase,
  getNextId
};
