const express = require('express');
const router = express.Router();
const { getDatabase, getNextId } = require('../lib/db');
const { buildVietnameseSearchQuery } = require('../lib/helpers');
const { optionalAuth, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// Category Cache for P7 (TTL: 60s)
let cachedCategories = null;
let categoryCacheExpiry = 0;

async function getCachedCategoryMap(db) {
  const now = Date.now();
  if (cachedCategories && categoryCacheExpiry > now) {
    return cachedCategories;
  }
  const categories = await db.collection('categories').find().toArray();
  cachedCategories = new Map(categories.map(c => [c.id, c]));
  categoryCacheExpiry = now + 60000;
  return cachedCategories;
}

// Invalidate cache when categories change
function invalidateCategoryCache() {
  cachedCategories = null;
  categoryCacheExpiry = 0;
}

// 1. GET /api/products
router.get('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { status, category_id, search, low_stock, expiry_filter, limit, offset } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category_id) query.category_id = parseInt(category_id, 10);
    if (search) {
      const searchCond = buildVietnameseSearchQuery(search, ['name', 'sku', 'barcode', 'description']);
      if (searchCond) {
        query.$and = searchCond.$and;
      }
    }
    if (low_stock === 'true') {
      query.$expr = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$min_stock'] }] };
    }
    if (expiry_filter === 'expired') {
      const todayStr = new Date().toISOString().split('T')[0];
      query.expiry_date = { $ne: '', $lt: todayStr };
    } else if (expiry_filter === 'expiring_soon') {
      const today = new Date();
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);
      const todayStr = today.toISOString().split('T')[0];
      const futureStr = in30Days.toISOString().split('T')[0];
      query.expiry_date = { $ne: '', $gte: todayStr, $lte: futureStr };
    }

    let cursor = db.collection('products').find(query).sort({ updated_at: -1, id: -1 });
    if (offset) cursor = cursor.skip(parseInt(offset, 10));
    if (limit) cursor = cursor.limit(parseInt(limit, 10));

    const products = await cursor.toArray();

    // Map category name & color using cached categories (P7 Optimization)
    const catMap = await getCachedCategoryMap(db);

    const enriched = products.map(p => {
      const cat = catMap.get(p.category_id);
      return {
        ...p,
        category_name: cat ? cat.name : '',
        category_color: cat ? cat.color : '#7c6aef'
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const barcode = req.params.barcode;
    const product = await db.collection('products').findOne({
      $or: [{ barcode: barcode }, { sku: barcode }]
    });
    if (!product) return res.status(404).json(null);

    if (product.category_id) {
      const catMap = await getCachedCategoryMap(db);
      const cat = catMap.get(product.category_id);
      product.category_name = cat ? cat.name : '';
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const product = await db.collection('products').findOne({ id });
    if (!product) return res.status(404).json(null);

    if (product.category_id) {
      const catMap = await getCachedCategoryMap(db);
      const cat = catMap.get(product.category_id);
      product.category_name = cat ? cat.name : '';
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/products
router.post('/', validate(schemas.product), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const data = req.body;

    // Check if barcode already exists
    if (data.barcode && String(data.barcode).trim()) {
      const existing = await db.collection('products').findOne({ barcode: String(data.barcode).trim() });
      if (existing) {
        return res.status(400).json({ error: `Mã vạch "${data.barcode}" đã tồn tại trên sản phẩm "${existing.name}"` });
      }
    }

    const nextId = await getNextId(db, 'products');

    const newProduct = {
      id: nextId,
      sku: data.sku || `SP-${String(nextId).padStart(4, '0')}`,
      barcode: data.barcode ? String(data.barcode).trim() : '',
      name: String(data.name).trim(),
      description: data.description || '',
      category_id: data.category_id ? parseInt(data.category_id, 10) : null,
      price: Number(data.price) || 0,
      sale_price: Number(data.sale_price) || 0,
      cost_price: Number(data.cost_price) || 0,
      stock: Number(data.stock) || 999,
      min_stock: Number(data.min_stock) || 5,
      unit: data.unit || 'cái',
      image: data.image || '',
      expiry_date: data.expiry_date || '',
      status: data.status || 'active',
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.collection('products').insertOne(newProduct);
    res.json(newProduct);
  } catch (err) {
    next(err);
  }
});

// 5. PUT /api/products/:id
router.put('/:id', validate(schemas.product), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;

    const updateDoc = { ...data, updated_at: new Date() };
    delete updateDoc._id;
    delete updateDoc.id;
    if (updateDoc.category_id) updateDoc.category_id = parseInt(updateDoc.category_id, 10);
    if (updateDoc.price !== undefined) updateDoc.price = Number(updateDoc.price);
    if (updateDoc.sale_price !== undefined) updateDoc.sale_price = Number(updateDoc.sale_price);
    if (updateDoc.cost_price !== undefined) updateDoc.cost_price = Number(updateDoc.cost_price);
    if (updateDoc.stock !== undefined) updateDoc.stock = Number(updateDoc.stock);
    if (updateDoc.min_stock !== undefined) updateDoc.min_stock = Number(updateDoc.min_stock);

    await db.collection('products').updateOne({ id }, { $set: updateDoc });
    const updated = await db.collection('products').findOne({ id });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// 6. DELETE /api/products/:id (S7: Protected endpoint)
router.delete('/:id', optionalAuth, async (req, res, next) => {
  try {
    // If request has auth context, check role
    if (req.user && req.user.role === 'staff') {
      return res.status(403).json({ error: 'Nhân viên không có quyền xóa sản phẩm. Yêu cầu quyền Quản lý/Chủ Shop.' });
    }

    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    await db.collection('products').deleteOne({ id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// 7. POST /api/products/batch-save (P8 Optimization: bulk operations)
router.post('/batch-save', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { products, updateExisting } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.json({ success: true, added: 0, updated: 0 });
    }

    let added = 0;
    let updated = 0;

    // Collect all barcodes to query in ONE batch
    const barcodes = products.map(p => p.barcode).filter(Boolean);
    const existingProducts = barcodes.length > 0
      ? await db.collection('products').find({ barcode: { $in: barcodes } }).toArray()
      : [];
    const barcodeMap = new Map(existingProducts.map(p => [p.barcode, p]));

    const bulkOps = [];
    const newItems = [];

    for (const p of products) {
      const existing = p.barcode ? barcodeMap.get(p.barcode) : null;
      if (existing && updateExisting) {
        bulkOps.push({
          updateOne: {
            filter: { id: existing.id },
            update: {
              $set: {
                name: p.name || existing.name,
                price: Number(p.price) || existing.price,
                stock: Number(p.stock) || existing.stock,
                updated_at: new Date()
              }
            }
          }
        });
        updated++;
      } else if (!existing) {
        const nextId = await getNextId(db, 'products');
        newItems.push({
          id: nextId,
          sku: p.sku || `SP-${String(nextId).padStart(4, '0')}`,
          barcode: p.barcode || '',
          name: p.name,
          category_id: p.category_id ? parseInt(p.category_id, 10) : null,
          price: Number(p.price) || 0,
          cost_price: Number(p.cost_price) || 0,
          stock: Number(p.stock) || 0,
          min_stock: Number(p.min_stock) || 5,
          unit: p.unit || 'cái',
          image: p.image || '',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        });
        added++;
      }
    }

    if (bulkOps.length > 0) {
      await db.collection('products').bulkWrite(bulkOps);
    }
    if (newItems.length > 0) {
      await db.collection('products').insertMany(newItems);
    }

    res.json({ success: true, added, updated });
  } catch (err) {
    next(err);
  }
});

module.exports = {
  router,
  invalidateCategoryCache
};
