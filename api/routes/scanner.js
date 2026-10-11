const express = require('express');
const router = express.Router();
const { getDatabase, getNextId } = require('../lib/db');

let lastScannerPing = 0;

// Scanner Server Info for QR code generation
router.get('/scanner/info', async (req, res, next) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const scannerUrl = `${protocol}://${host}/scanner.html`;
    res.json({
      running: true,
      ip: host.split(':')[0],
      port: host.split(':')[1] || (protocol === 'https' ? 443 : 80),
      url: scannerUrl,
      httpsUrl: scannerUrl,
      online: (Date.now() - lastScannerPing) < 60000
    });
  } catch (err) {
    next(err);
  }
});

// Phone Ping (heartbeat)
const handleScannerPing = (req, res) => {
  lastScannerPing = Date.now();
  res.json({ success: true, timestamp: lastScannerPing });
};
router.post('/scanner/ping', handleScannerPing);
router.get('/scanner/ping', handleScannerPing);

// Phone Scanner Status
router.get('/scanner/status', (req, res) => {
  const isOnline = (Date.now() - lastScannerPing) < 60000;
  res.json({ online: isOnline, lastPing: lastScannerPing });
});

// Receive barcode scanned from phone
router.post('/scan-barcode', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const code = String(req.body.code || '').trim();
    const format = req.body.format || 'unknown';

    if (!code) {
      return res.status(400).json({ success: false, error: 'Thiếu mã barcode' });
    }

    lastScannerPing = Date.now();

    // 1. Store event for desktop/POS to fetch
    const event = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      code,
      format,
      created_at: new Date()
    };
    await db.collection('scanner_events').insertOne(event);

    // Auto cleanup old events (> 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.collection('scanner_events').deleteMany({ created_at: { $lt: oneHourAgo } }).catch(() => {});

    // 2. Lookup product info to return to phone
    let product = await db.collection('products').findOne({
      $or: [{ barcode: code }, { sku: code }]
    });
    if (!product) {
      product = await db.collection('products').findOne({
        name: new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      });
    }

    let productData = null;
    if (product) {
      productData = {
        id: product.id,
        name: product.name,
        barcode: product.barcode || product.sku || '',
        price: product.price,
        sale_price: product.sale_price,
        category_name: product.category_name || '',
        stock: product.stock,
        image: product.image || '',
        image_url: product.image || '',
        unit: product.unit || 'cái'
      };
    }

    res.json({
      success: true,
      code,
      found: !!product,
      product: productData
    });
  } catch (err) {
    next(err);
  }
});

// POS polls for new scanned barcodes
router.get('/scanner/events', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const sinceParam = req.query.since;
    let sinceDate;
    if (sinceParam) {
      sinceDate = new Date(!isNaN(Number(sinceParam)) ? Number(sinceParam) : sinceParam);
    } else {
      sinceDate = new Date(Date.now() - 10000);
    }

    const events = await db.collection('scanner_events')
      .find({ created_at: { $gt: sinceDate } })
      .sort({ created_at: 1 })
      .toArray();

    res.json(events);
  } catch (err) {
    next(err);
  }
});

// Check price API for phone scanner (supports both GET and POST)
const handleCheckPrice = async (req, res, next) => {
  try {
    const db = await getDatabase();
    const code = String(req.query.code || (req.body && req.body.code) || '').trim();
    if (!code) {
      return res.json({ found: false, error: 'Thiếu mã' });
    }

    lastScannerPing = Date.now();

    let product = await db.collection('products').findOne({
      $or: [{ barcode: code }, { sku: code }]
    });
    if (!product) {
      product = await db.collection('products').findOne({
        name: new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      });
    }

    if (product) {
      res.json({
        found: true,
        product: {
          id: product.id,
          name: product.name,
          barcode: product.barcode || product.sku || '',
          price: product.price,
          sale_price: product.sale_price,
          cost_price: product.cost_price,
          category_name: product.category_name || '',
          stock: product.stock,
          image: product.image || '',
          unit: product.unit || 'cái'
        }
      });
    } else {
      res.json({ found: false, code });
    }
  } catch (err) {
    next(err);
  }
};
router.get('/check-price', handleCheckPrice);
router.post('/check-price', handleCheckPrice);

// Add product from phone scanner
router.post('/add-product', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const p = req.body.product || req.body;
    if (!p || (!p.barcode && !p.sku) || !p.name) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin sản phẩm' });
    }

    lastScannerPing = Date.now();

    // Check if barcode or sku already exists to prevent duplicate insertion
    let existing = null;
    if (p.barcode) {
      existing = await db.collection('products').findOne({ barcode: String(p.barcode).trim() });
    }
    if (!existing && p.sku) {
      existing = await db.collection('products').findOne({ sku: String(p.sku).trim() });
    }

    if (existing) {
      await db.collection('products').updateOne({ id: existing.id }, {
        $set: {
          name: p.name || existing.name,
          price: Number(p.price) || existing.price,
          sale_price: Number(p.sale_price) || existing.sale_price,
          unit: p.unit || existing.unit,
          image: p.image_url || p.image || existing.image,
          updated_at: new Date()
        }
      });
      const updated = await db.collection('products').findOne({ id: existing.id });
      await db.collection('scanner_events').insertOne({
        id: Date.now() + Math.floor(Math.random() * 1000),
        code: updated.barcode || updated.sku,
        format: 'ADD_PRODUCT',
        product: updated,
        created_at: new Date()
      });
      return res.json({ success: true, message: 'Đã cập nhật sản phẩm thành công', product: updated });
    }

    const nextId = await getNextId(db, 'products');
    const newProduct = {
      id: nextId,
      sku: p.sku || `SP-${String(nextId).padStart(4, '0')}`,
      barcode: p.barcode || '',
      name: p.name,
      description: p.description || '',
      category_id: p.category_id ? parseInt(p.category_id, 10) : null,
      price: Number(p.price) || 0,
      sale_price: Number(p.sale_price) || 0,
      cost_price: Number(p.cost_price) || 0,
      stock: Number(p.stock) || 999,
      min_stock: Number(p.min_stock) || 0,
      unit: p.unit || 'cái',
      image: p.image_url || p.image || '',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.collection('products').insertOne(newProduct);

    // Also trigger scanner event so POS sees it
    await db.collection('scanner_events').insertOne({
      id: Date.now() + Math.floor(Math.random() * 1000),
      code: newProduct.barcode || newProduct.sku,
      format: 'ADD_PRODUCT',
      product: newProduct,
      created_at: new Date()
    });

    res.json({ success: true, message: 'Đã thêm sản phẩm thành công', product: newProduct });
  } catch (err) {
    next(err);
  }
});

// Continuous Batch Scan from phone
router.post('/batch-scan', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const items = req.body.items || [];
    lastScannerPing = Date.now();

    const eventsToInsert = [];
    for (const item of items) {
      const qty = item.quantity || 1;
      for (let i = 0; i < qty; i++) {
        eventsToInsert.push({
          id: Date.now() + Math.floor(Math.random() * 10000) + i,
          code: item.code,
          format: item.format || 'BATCH',
          created_at: new Date()
        });
      }
    }

    if (eventsToInsert.length > 0) {
      await db.collection('scanner_events').insertMany(eventsToInsert);
    }
    res.json({ success: true, count: items.length });
  } catch (err) {
    next(err);
  }
});

// Upload product photo from phone camera
router.post('/upload-product-photo', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu ảnh' });
    }
    lastScannerPing = Date.now();

    // Auto cleanup old photos (> 24 hours) - B4 Fix
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.collection('scanner_photos').deleteMany({ created_at: { $lt: oneDayAgo } }).catch(() => {});

    await db.collection('scanner_photos').insertOne({
      id: Date.now(),
      image,
      created_at: new Date()
    });

    res.json({
      success: true,
      filename: `photo-${Date.now()}.jpg`,
      relativePath: image,
      url: image
    });
  } catch (err) {
    next(err);
  }
});

// POS polls for newly taken product photo from phone
router.get('/scanner/latest-photo', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const since = req.query.since ? new Date(Number(req.query.since)) : new Date(Date.now() - 30000);
    const photo = await db.collection('scanner_photos').findOne(
      { created_at: { $gt: since } },
      { sort: { created_at: -1 } }
    );
    res.json(photo || null);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
