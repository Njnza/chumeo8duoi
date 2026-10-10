const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { getDatabase, getNextId } = require('./lib/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper: PIN verification
function hashPin(pin, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPin(pin, storedPin) {
  if (!storedPin) return false;
  const pinStr = String(pin).trim();
  if (!storedPin.startsWith('scrypt:')) return pinStr === storedPin;
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

// ==================== 1. PRODUCTS ====================
app.get('/api/products', async (req, res) => {
  try {
    const db = await getDatabase();
    const { status, category_id, search, low_stock, expiry_filter, limit, offset } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category_id) query.category_id = parseInt(category_id, 10);
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ name: regex }, { sku: regex }, { barcode: regex }];
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

    // Map category name & color
    const categories = await db.collection('categories').find().toArray();
    const catMap = new Map(categories.map(c => [c.id, c]));

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
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/barcode/:barcode', async (req, res) => {
  try {
    const db = await getDatabase();
    const barcode = req.params.barcode;
    const product = await db.collection('products').findOne({
      $or: [{ barcode: barcode }, { sku: barcode }]
    });
    if (!product) return res.status(404).json(null);

    if (product.category_id) {
      const cat = await db.collection('categories').findOne({ id: product.category_id });
      product.category_name = cat ? cat.name : '';
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const product = await db.collection('products').findOne({ id });
    if (!product) return res.status(404).json(null);

    if (product.category_id) {
      const cat = await db.collection('categories').findOne({ id: product.category_id });
      product.category_name = cat ? cat.name : '';
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
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
      barcode: data.barcode || '',
      name: data.name,
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
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    await db.collection('products').deleteOne({ id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/batch-save', async (req, res) => {
  try {
    const db = await getDatabase();
    const { products, updateExisting } = req.body;
    let added = 0;
    let updated = 0;

    for (const p of products) {
      const existing = p.barcode ? await db.collection('products').findOne({ barcode: p.barcode }) : null;
      if (existing && updateExisting) {
        await db.collection('products').updateOne({ id: existing.id }, {
          $set: {
            name: p.name || existing.name,
            price: Number(p.price) || existing.price,
            stock: Number(p.stock) || existing.stock,
            updated_at: new Date()
          }
        });
        updated++;
      } else if (!existing) {
        const nextId = await getNextId(db, 'products');
        await db.collection('products').insertOne({
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
    res.json({ success: true, added, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 2. CATEGORIES ====================
app.get('/api/categories', async (req, res) => {
  try {
    const db = await getDatabase();
    const categories = await db.collection('categories').find().sort({ sort_order: 1, id: 1 }).toArray();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const nextId = await getNextId(db, 'categories');
    const newCat = {
      id: nextId,
      name: data.name,
      description: data.description || '',
      color: data.color || '#7c6aef',
      sort_order: Number(data.sort_order) || 0,
      created_at: new Date()
    };
    await db.collection('categories').insertOne(newCat);
    res.json(newCat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;
    await db.collection('categories').updateOne({ id }, {
      $set: {
        name: data.name,
        description: data.description || '',
        color: data.color || '#7c6aef',
        sort_order: Number(data.sort_order) || 0
      }
    });
    const updated = await db.collection('categories').findOne({ id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    await db.collection('categories').deleteOne({ id });
    // Reset category_id on associated products
    await db.collection('products').updateMany({ category_id: id }, { $set: { category_id: null } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 3. CUSTOMERS ====================
app.get('/api/customers', async (req, res) => {
  try {
    const db = await getDatabase();
    const { search, limit } = req.query;
    const query = {};
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ name: regex }, { phone: regex }];
    }
    let cursor = db.collection('customers').find(query).sort({ updated_at: -1, id: -1 });
    if (limit) cursor = cursor.limit(parseInt(limit, 10));
    const customers = await cursor.toArray();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const customer = await db.collection('customers').findOne({ id });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const nextId = await getNextId(db, 'customers');
    const newCust = {
      id: nextId,
      name: data.name,
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
      note: data.note || '',
      tier_mode: data.tier_mode || 'auto',
      fixed_tier_id: data.fixed_tier_id || '',
      custom_tiers_json: data.custom_tiers_json || '',
      total_spent: 0,
      visit_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    await db.collection('customers').insertOne(newCust);
    res.json(newCust);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;
    const updateDoc = {
      name: data.name,
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
      note: data.note || '',
      tier_mode: data.tier_mode || 'auto',
      fixed_tier_id: data.fixed_tier_id || '',
      custom_tiers_json: data.custom_tiers_json || '',
      updated_at: new Date()
    };
    await db.collection('customers').updateOne({ id }, { $set: updateDoc });
    const updated = await db.collection('customers').findOne({ id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    await db.collection('customers').deleteOne({ id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 4. ORDERS & RETURNS ====================
async function generateOrderCode(db) {
  const settings = await db.collection('settings').findOne({ key: 'order_prefix' });
  const prefix = settings?.value || 'HD';
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefixDate = `${prefix}${y}${m}${d}-`;

  const regex = new RegExp(`^${prefixDate}`);
  const lastOrder = await db.collection('orders')
    .find({ order_code: regex })
    .sort({ order_code: -1 })
    .limit(1)
    .toArray();

  let maxNum = 0;
  if (lastOrder.length > 0) {
    const parts = lastOrder[0].order_code.split('-');
    if (parts.length >= 2) {
      maxNum = parseInt(parts[parts.length - 1], 10) || 0;
    }
  }
  return `${prefixDate}${String(maxNum + 1).padStart(4, '0')}`;
}

app.get('/api/orders', async (req, res) => {
  try {
    const db = await getDatabase();
    const { status, customer_id, from, to, limit, offset } = req.query;
    const query = {};
    if (status) query.status = status;
    if (customer_id) query.customer_id = parseInt(customer_id, 10);
    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    let cursor = db.collection('orders').find(query).sort({ created_at: -1, id: -1 });
    if (offset) cursor = cursor.skip(parseInt(offset, 10));
    if (limit) cursor = cursor.limit(parseInt(limit, 10));

    const orders = await cursor.toArray();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const order = await db.collection('orders').findOne({ id });
    if (!order) return res.status(404).json(null);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const nextId = await getNextId(db, 'orders');
    const orderCode = await generateOrderCode(db);

    // Active shift
    const activeShift = await db.collection('shifts').findOne({ status: 'open' });
    const shiftId = data.shift_id !== undefined ? data.shift_id : (activeShift ? activeShift.id : null);

    // Customer name lookup
    let customerName = 'Khách lẻ';
    let customerPhone = '';
    if (data.customer_id) {
      const cust = await db.collection('customers').findOne({ id: parseInt(data.customer_id, 10) });
      if (cust) {
        customerName = cust.name;
        customerPhone = cust.phone || '';
      }
    }

    const orderDoc = {
      id: nextId,
      order_code: orderCode,
      customer_id: data.customer_id ? parseInt(data.customer_id, 10) : null,
      customer_name: customerName,
      customer_phone: customerPhone,
      subtotal: Number(data.subtotal) || 0,
      discount_amount: Number(data.discount_amount) || 0,
      discount_percent: Number(data.discount_percent) || 0,
      tax_amount: Number(data.tax_amount) || 0,
      total: Number(data.total) || 0,
      payment_method: data.payment_method || 'cash',
      amount_paid: Number(data.amount_paid) || 0,
      change_amount: Number(data.change_amount) || 0,
      user_id: data.user_id ? parseInt(data.user_id, 10) : null,
      staff_name: data.staff_name || '',
      shift_id: shiftId,
      status: data.status || 'completed',
      note: data.note || '',
      items: (data.items || []).map((it, idx) => ({
        id: idx + 1,
        product_id: it.product_id ? parseInt(it.product_id, 10) : null,
        product_name: it.product_name,
        product_sku: it.product_sku || '',
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 1,
        discount: Number(it.discount) || 0,
        subtotal: Number(it.subtotal) || 0,
        returned_quantity: 0
      })),
      created_at: new Date()
    };

    await db.collection('orders').insertOne(orderDoc);

    // Update product stock
    for (const it of orderDoc.items) {
      if (it.product_id) {
        await db.collection('products').updateOne(
          { id: it.product_id },
          { $inc: { stock: -it.quantity }, $set: { updated_at: new Date() } }
        );
      }
    }

    // Update customer stats
    if (orderDoc.customer_id) {
      await db.collection('customers').updateOne(
        { id: orderDoc.customer_id },
        {
          $inc: { total_spent: orderDoc.total, visit_count: 1 },
          $set: { updated_at: new Date() }
        }
      );
    }

    res.json({ id: nextId, order_code: orderCode, ...orderDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/:id/cancel', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const order = await db.collection('orders').findOne({ id });
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    if (order.status === 'cancelled') return res.status(400).json({ error: 'Đơn hàng đã bị hủy trước đó' });

    // Restore stock
    for (const it of (order.items || [])) {
      if (it.product_id) {
        await db.collection('products').updateOne(
          { id: it.product_id },
          { $inc: { stock: it.quantity }, $set: { updated_at: new Date() } }
        );
      }
    }

    // Revert customer total_spent
    if (order.customer_id) {
      await db.collection('customers').updateOne(
        { id: order.customer_id },
        {
          $inc: { total_spent: -order.total, visit_count: -1 },
          $set: { updated_at: new Date() }
        }
      );
    }

    await db.collection('orders').updateOne({ id }, { $set: { status: 'cancelled' } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Order Returns
app.post('/api/orders/return', async (req, res) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const order = await db.collection('orders').findOne({ id: parseInt(data.order_id, 10) });
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const returnId = await getNextId(db, 'order_returns');
    const now = new Date();
    const y = String(now.getFullYear()).slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const returnCode = `TH${y}${m}${d}-${String(returnId).padStart(4, '0')}`;

    const itemsToProcess = data.return_items || data.items || [];
    let totalRefund = 0;
    const returnItems = [];

    for (const it of itemsToProcess) {
      const origItem = (order.items || []).find(i => i.id === it.order_item_id);
      if (!origItem) continue;

      const maxReturnable = origItem.quantity - (origItem.returned_quantity || 0);
      const qtyToReturn = Math.min(Number(it.quantity) || 0, maxReturnable);
      if (qtyToReturn <= 0) continue;

      const subtotalRefund = Number(it.refund_subtotal) || (origItem.price * qtyToReturn);
      totalRefund += subtotalRefund;

      returnItems.push({
        order_item_id: origItem.id,
        product_id: origItem.product_id,
        product_name: origItem.product_name,
        product_sku: origItem.product_sku || '',
        price: origItem.price,
        quantity: qtyToReturn,
        refund_subtotal: subtotalRefund
      });

      // Update returned_quantity on order item
      origItem.returned_quantity = (origItem.returned_quantity || 0) + qtyToReturn;

      // Restock
      if (origItem.product_id) {
        await db.collection('products').updateOne(
          { id: origItem.product_id },
          { $inc: { stock: qtyToReturn }, $set: { updated_at: new Date() } }
        );
      }
    }

    const returnDoc = {
      id: returnId,
      return_code: returnCode,
      order_id: order.id,
      order_code: order.order_code,
      customer_id: order.customer_id,
      customer_name: order.customer_name || 'Khách lẻ',
      refund_amount: totalRefund,
      reason: data.reason || 'Khách đổi trả hàng',
      note: data.note || '',
      items: returnItems,
      created_at: new Date()
    };
    await db.collection('order_returns').insertOne(returnDoc);

    // Check if fully returned
    const allReturned = (order.items || []).every(i => (i.returned_quantity || 0) >= i.quantity);
    await db.collection('orders').updateOne(
      { id: order.id },
      {
        $set: {
          items: order.items,
          status: allReturned ? 'returned' : order.status
        }
      }
    );

    // Revert customer spent
    if (order.customer_id && totalRefund > 0) {
      await db.collection('customers').updateOne(
        { id: order.customer_id },
        { $inc: { total_spent: -totalRefund }, $set: { updated_at: new Date() } }
      );
    }

    res.json({ id: returnId, return_code: returnCode, refund_amount: totalRefund, order_code: order.order_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/returns', async (req, res) => {
  try {
    const db = await getDatabase();
    const { order_id } = req.query;
    const query = {};
    if (order_id) query.order_id = parseInt(order_id, 10);
    const returns = await db.collection('order_returns').find(query).sort({ created_at: -1 }).toArray();
    res.json(returns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/returns/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const ret = await db.collection('order_returns').findOne({ id });
    res.json(ret);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 5. SHIFTS & CASH FLOW ====================
app.get('/api/shifts/current', async (req, res) => {
  try {
    const db = await getDatabase();
    const { user_id } = req.query;
    const query = { status: 'open' };
    if (user_id) query.user_id = parseInt(user_id, 10);
    const shift = await db.collection('shifts').find(query).sort({ id: -1 }).limit(1).toArray();
    res.json(shift[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shifts/open', async (req, res) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const existing = await db.collection('shifts').findOne({ status: 'open' });
    if (existing) {
      return res.status(400).json({ error: `Đang có ca làm việc chưa đóng (Ca #${existing.id}). Vui lòng kết ca hiện tại trước.` });
    }
    const nextId = await getNextId(db, 'shifts');
    const newShift = {
      id: nextId,
      user_id: data.user_id ? parseInt(data.user_id, 10) : null,
      staff_name: data.staff_name || 'Nhân Viên',
      initial_cash: Number(data.initial_cash) || 0,
      status: 'open',
      note: data.note || '',
      start_time: new Date(),
      end_time: null
    };
    await db.collection('shifts').insertOne(newShift);
    res.json(newShift);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shifts/:id/summary', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const shift = await db.collection('shifts').findOne({ id });
    if (!shift) return res.status(404).json({ error: 'Không tìm thấy ca' });

    const orderQuery = {
      status: 'completed',
      $or: [
        { shift_id: id },
        { created_at: { $gte: new Date(shift.start_time), $lte: shift.end_time ? new Date(shift.end_time) : new Date() } }
      ]
    };
    const orders = await db.collection('orders').find(orderQuery).toArray();

    let cashSales = 0, cardSales = 0, transferSales = 0, totalRevenue = 0;
    for (const o of orders) {
      totalRevenue += o.total;
      if (o.payment_method === 'cash') cashSales += o.total;
      else if (o.payment_method === 'card') cardSales += o.total;
      else if (o.payment_method === 'transfer') transferSales += o.total;
    }

    const cashFlows = await db.collection('cash_flow').find({
      $or: [
        { shift_id: id },
        { created_at: { $gte: new Date(shift.start_time), $lte: shift.end_time ? new Date(shift.end_time) : new Date() } }
      ]
    }).toArray();

    let cashIn = 0, cashOut = 0;
    for (const c of cashFlows) {
      if (c.type === 'income') cashIn += c.amount;
      else if (c.type === 'expense') cashOut += c.amount;
    }

    const initialCash = Number(shift.initial_cash) || 0;
    const expectedCash = initialCash + cashSales + cashIn - cashOut;

    res.json({
      shift,
      orders_count: orders.length,
      total_revenue: totalRevenue,
      cash_sales: cashSales,
      card_sales: cardSales,
      transfer_sales: transferSales,
      cash_in: cashIn,
      cash_out: cashOut,
      initial_cash: initialCash,
      expected_cash: expectedCash
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shifts/:id/close', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;

    const actualCash = Number(data.actual_cash) || 0;
    // Calculate expected cash
    const shift = await db.collection('shifts').findOne({ id });
    if (!shift) return res.status(404).json({ error: 'Không tìm thấy ca' });

    const orders = await db.collection('orders').find({ shift_id: id, status: 'completed' }).toArray();
    const cashSales = orders.filter(o => o.payment_method === 'cash').reduce((sum, o) => sum + o.total, 0);

    const cashFlows = await db.collection('cash_flow').find({ shift_id: id }).toArray();
    const cashIn = cashFlows.filter(c => c.type === 'income').reduce((sum, c) => sum + c.amount, 0);
    const cashOut = cashFlows.filter(c => c.type === 'expense').reduce((sum, c) => sum + c.amount, 0);

    const expectedCash = (Number(shift.initial_cash) || 0) + cashSales + cashIn - cashOut;
    const difference = actualCash - expectedCash;

    await db.collection('shifts').updateOne({ id }, {
      $set: {
        end_time: new Date(),
        expected_cash: expectedCash,
        actual_cash: actualCash,
        difference: difference,
        status: 'closed',
        note: data.note || shift.note
      }
    });

    const updated = await db.collection('shifts').findOne({ id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shifts', async (req, res) => {
  try {
    const db = await getDatabase();
    const limit = parseInt(req.query.limit, 10) || 30;
    const shifts = await db.collection('shifts').find().sort({ id: -1 }).limit(limit).toArray();
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cash Flow
app.post('/api/cash-flow', async (req, res) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const nextId = await getNextId(db, 'cash_flow');
    const doc = {
      id: nextId,
      type: data.type,
      category: data.category || (data.type === 'income' ? 'Thu khác' : 'Chi khác'),
      amount: Math.abs(Number(data.amount)) || 0,
      user_id: data.user_id ? parseInt(data.user_id, 10) : null,
      staff_name: data.staff_name || '',
      shift_id: data.shift_id ? parseInt(data.shift_id, 10) : null,
      note: data.note || '',
      created_at: new Date()
    };
    await db.collection('cash_flow').insertOne(doc);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cash-flow', async (req, res) => {
  try {
    const db = await getDatabase();
    const { from, to, limit } = req.query;
    const query = {};
    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    let cursor = db.collection('cash_flow').find(query).sort({ created_at: -1 });
    if (limit) cursor = cursor.limit(parseInt(limit, 10));
    const list = await cursor.toArray();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cash-flow/summary', async (req, res) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const query = {};
    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    const list = await db.collection('cash_flow').find(query).toArray();
    let income = 0, expense = 0;
    for (const c of list) {
      if (c.type === 'income') income += c.amount;
      else if (c.type === 'expense') expense += c.amount;
    }
    res.json({ total_income: income, total_expense: expense, net_cash: income - expense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 6. REPORTS & DASHBOARD ====================
app.get('/api/reports/dashboard', async (req, res) => {
  try {
    const db = await getDatabase();
    const totalProducts = await db.collection('products').countDocuments({ status: 'active' });
    const totalOrders = await db.collection('orders').countDocuments({ status: 'completed' });
    const totalCustomers = await db.collection('customers').countDocuments();

    // Total revenue
    const revenueAgg = await db.collection('orders').aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]).toArray();
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayAgg = await db.collection('orders').aggregate([
      { $match: { status: 'completed', created_at: { $gte: today, $lte: todayEnd } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$total' } } }
    ]).toArray();
    const todayOrders = todayAgg[0]?.count || 0;
    const todayRevenue = todayAgg[0]?.total || 0;

    // Low stock (Tạm thời bỏ qua quản lý tồn kho)
    const lowStockProducts = [];

    res.json({
      totalProducts,
      totalOrders,
      totalRevenue,
      totalCustomers,
      todayOrders,
      todayRevenue,
      lowStockProducts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/revenue', async (req, res) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const query = { status: 'completed' };
    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const agg = await db.collection('orders').aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          order_count: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    const formatted = agg.map(r => ({ date: r._id, order_count: r.order_count, revenue: r.revenue }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/top-products', async (req, res) => {
  try {
    const db = await getDatabase();
    const limit = parseInt(req.query.limit, 10) || 10;
    const { from, to } = req.query;

    const match = { status: 'completed' };
    if (from || to) {
      match.created_at = {};
      if (from) match.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) match.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const agg = await db.collection('orders').aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product_id',
          product_name: { $first: '$items.product_name' },
          total_quantity: { $sum: '$items.quantity' },
          total_revenue: { $sum: '$items.subtotal' }
        }
      },
      { $sort: { total_quantity: -1 } },
      { $limit: limit }
    ]).toArray();

    res.json(agg.map(r => ({
      product_id: r._id,
      product_name: r.product_name,
      total_quantity: r.total_quantity,
      total_revenue: r.total_revenue
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/payment-method', async (req, res) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const match = { status: 'completed' };
    if (from || to) {
      match.created_at = {};
      if (from) match.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) match.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const agg = await db.collection('orders').aggregate([
      { $match: match },
      {
        $group: {
          _id: '$payment_method',
          order_count: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      }
    ]).toArray();

    res.json(agg.map(r => ({
      payment_method: r._id,
      order_count: r.order_count,
      revenue: r.revenue
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/profit', async (req, res) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const match = { status: { $in: ['completed', 'returned'] } };
    if (from || to) {
      match.created_at = {};
      if (from) match.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) match.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const orders = await db.collection('orders').find(match).toArray();
    let totalOrders = orders.length;
    let grossRevenue = orders.reduce((sum, o) => sum + o.total, 0);

    // COGS
    const products = await db.collection('products').find().toArray();
    const productCostMap = new Map(products.map(p => [p.id, p.cost_price || 0]));

    let totalCost = 0;
    for (const o of orders) {
      for (const it of (o.items || [])) {
        const netQty = it.quantity - (it.returned_quantity || 0);
        if (netQty > 0) {
          const cost = productCostMap.get(it.product_id) || 0;
          totalCost += netQty * cost;
        }
      }
    }

    // Refunds
    const returnMatch = {};
    if (from || to) {
      returnMatch.created_at = {};
      if (from) returnMatch.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) returnMatch.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    const returns = await db.collection('order_returns').find(returnMatch).toArray();
    const totalRefund = returns.reduce((sum, r) => sum + r.refund_amount, 0);

    const netRevenue = Math.max(0, grossRevenue - totalRefund);
    const grossProfit = netRevenue - totalCost;
    const profitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    res.json({
      totalOrders,
      grossRevenue,
      totalRefund,
      returnCount: returns.length,
      netRevenue,
      totalCost,
      grossProfit,
      profitMargin: Math.round(profitMargin * 10) / 10
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/hourly', async (req, res) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const match = { status: 'completed' };
    if (from || to) {
      match.created_at = {};
      if (from) match.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) match.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const orders = await db.collection('orders').find(match).toArray();
    const hourlyMap = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { hour: h, order_count: 0, revenue: 0 };
    }

    for (const o of orders) {
      const h = new Date(o.created_at).getHours();
      hourlyMap[h].order_count += 1;
      hourlyMap[h].revenue += o.total;
    }

    res.json(Object.values(hourlyMap));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ABC Product Analysis
app.get('/api/reports/abc-analysis', async (req, res) => {
  try {
    const db = await getDatabase();
    const products = await db.collection('products').find({ status: 'active' }).toArray();

    const orders = await db.collection('orders').find({ status: 'completed' }).toArray();
    const soldMap = {};
    const revenueMap = {};

    for (const o of orders) {
      for (const it of (o.items || [])) {
        if (it.product_id) {
          soldMap[it.product_id] = (soldMap[it.product_id] || 0) + it.quantity;
          revenueMap[it.product_id] = (revenueMap[it.product_id] || 0) + it.subtotal;
        }
      }
    }

    const items = products.map(p => ({
      ...p,
      total_sold: soldMap[p.id] || 0,
      total_revenue: revenueMap[p.id] || 0
    })).sort((a, b) => b.total_revenue - a.total_revenue);

    const grandTotalRevenue = items.reduce((sum, r) => sum + r.total_revenue, 0);
    let runningRevenue = 0;

    const result = items.map((p, idx) => {
      runningRevenue += p.total_revenue;
      const cumulativePercent = grandTotalRevenue > 0 ? (runningRevenue / grandTotalRevenue) * 100 : 100;
      let abcCategory = 'C';
      if (p.total_revenue > 0) {
        if (cumulativePercent <= 80 || idx === 0) abcCategory = 'A';
        else if (cumulativePercent <= 95) abcCategory = 'B';
      }

      const dailySalesRate = p.total_sold > 0 ? (p.total_sold / 30) : 0;
      const daysOfStock = dailySalesRate > 0 ? Math.round(p.stock / dailySalesRate) : (p.stock > 0 ? 999 : 0);

      let aiRecommendation = '';
      if (p.stock <= p.min_stock) aiRecommendation = 'Sắp hết hàng: Cần nhập thêm ngay lập tức';
      else if (abcCategory === 'A') aiRecommendation = 'Sản phẩm chủ lực (Nhóm A): Luôn duy trì đủ tồn kho';
      else if (abcCategory === 'C' && p.stock > 20) aiRecommendation = 'Hàng tồn đọng bán chậm (Nhóm C): Xem xét giảm giá xả kho';
      else aiRecommendation = 'Bán ổn định: Duy trì mức đặt hàng thông thường';

      return {
        ...p,
        abc_category: abcCategory,
        cumulative_percent: Math.round(cumulativePercent * 10) / 10,
        days_of_stock: daysOfStock,
        ai_recommendation: aiRecommendation
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 7. SETTINGS ====================
app.get('/api/settings', async (req, res) => {
  try {
    const db = await getDatabase();
    const rows = await db.collection('settings').find().toArray();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings/member-tiers', async (req, res) => {
  try {
    const db = await getDatabase();
    const doc = await db.collection('settings').findOne({ key: 'member_tiers' });
    const tiers = doc ? JSON.parse(doc.value) : [];
    res.json(tiers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/member-tiers', async (req, res) => {
  try {
    const db = await getDatabase();
    const tiers = req.body;
    await db.collection('settings').updateOne(
      { key: 'member_tiers' },
      { $set: { value: JSON.stringify(tiers) } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings/:key', async (req, res) => {
  try {
    const db = await getDatabase();
    const doc = await db.collection('settings').findOne({ key: req.params.key });
    res.json(doc ? doc.value : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const db = await getDatabase();
    const { key, value } = req.body;
    await db.collection('settings').updateOne(
      { key },
      { $set: { value: String(value) } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 8. USERS & AUTH ====================
app.get('/api/users', async (req, res) => {
  try {
    const db = await getDatabase();
    const users = await db.collection('users').find({}, { projection: { pin: 0 } }).sort({ role: 1, id: 1 }).toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const user = await db.collection('users').findOne({ id }, { projection: { pin: 0 } });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const nextId = await getNextId(db, 'users');
    const newUser = {
      id: nextId,
      username: data.username,
      name: data.name,
      role: data.role || 'staff',
      pin: hashPin(data.pin || '0000'),
      phone: data.phone || '',
      status: data.status || 'active',
      created_at: new Date()
    };
    await db.collection('users').insertOne(newUser);
    const { pin: _p, ...safe } = newUser;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;
    const updateDoc = {};
    if (data.username !== undefined) updateDoc.username = data.username;
    if (data.name !== undefined) updateDoc.name = data.name;
    if (data.role !== undefined) updateDoc.role = data.role;
    if (data.phone !== undefined) updateDoc.phone = data.phone;
    if (data.status !== undefined) updateDoc.status = data.status;
    if (data.pin) updateDoc.pin = hashPin(data.pin);

    await db.collection('users').updateOne({ id }, { $set: updateDoc });
    const updated = await db.collection('users').findOne({ id }, { projection: { pin: 0 } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const user = await db.collection('users').findOne({ id });
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (user.role === 'owner') {
      const ownerCount = await db.collection('users').countDocuments({ role: 'owner' });
      if (ownerCount <= 1) return res.status(400).json({ error: 'Không thể xóa tài khoản Chủ Shop duy nhất' });
    }
    await db.collection('users').deleteOne({ id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/authenticate', async (req, res) => {
  try {
    const db = await getDatabase();
    const { usernameOrPin, pin } = req.body;
    const activeUsers = await db.collection('users').find({ status: 'active' }).toArray();

    if (pin === undefined) {
      for (const u of activeUsers) {
        if (verifyPin(usernameOrPin, u.pin)) {
          const { pin: _p, ...safeUser } = u;
          return res.json(safeUser);
        }
      }
      return res.status(401).json({ error: 'Mã PIN không chính xác hoặc tài khoản đã bị khóa' });
    }

    const targetUser = req.body.userId
      ? activeUsers.find(u => u.id === Number(req.body.userId))
      : activeUsers.find(u => u.username === usernameOrPin || (usernameOrPin !== undefined && u.id === Number(usernameOrPin)));

    if (!targetUser || !verifyPin(pin, targetUser.pin)) {
      return res.status(401).json({ error: 'Tài khoản hoặc mã PIN không đúng' });
    }

    const { pin: _p, ...safeUser } = targetUser;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/verify-pin', async (req, res) => {
  try {
    const db = await getDatabase();
    const { pin } = req.body;
    const owners = await db.collection('users').find({ role: 'owner', status: 'active' }).toArray();
    for (const o of owners) {
      if (verifyPin(pin, o.pin)) return res.json({ valid: true });
    }
    res.json({ valid: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 11. PHONE SCANNER & CLOUD BRIDGE ====================
let lastScannerPing = 0;

// Scanner Server Info for QR code generation
app.get('/api/scanner/info', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Phone Ping (heartbeat)
const handleScannerPing = (req, res) => {
  lastScannerPing = Date.now();
  res.json({ success: true, timestamp: lastScannerPing });
};
app.post('/api/scanner/ping', handleScannerPing);
app.get('/api/scanner/ping', handleScannerPing);

// Phone Scanner Status
app.get('/api/scanner/status', (req, res) => {
  const isOnline = (Date.now() - lastScannerPing) < 60000;
  res.json({ online: isOnline, lastPing: lastScannerPing });
});

// Receive barcode scanned from phone
app.post('/api/scan-barcode', async (req, res) => {
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

    // Auto cleanup old events (> 10 minutes)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    await db.collection('scanner_events').deleteMany({ created_at: { $lt: tenMinAgo } }).catch(() => {});

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
    res.status(500).json({ success: false, error: err.message });
  }
});

// POS polls for new scanned barcodes
app.get('/api/scanner/events', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Check price API for phone scanner (supports both GET and POST)
const handleCheckPrice = async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
};
app.get('/api/check-price', handleCheckPrice);
app.post('/api/check-price', handleCheckPrice);

// Add product from phone scanner
app.post('/api/add-product', async (req, res) => {
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
    res.status(500).json({ success: false, error: err.message });
  }
});

// Continuous Batch Scan from phone
app.post('/api/batch-scan', async (req, res) => {
  try {
    const db = await getDatabase();
    const items = req.body.items || [];
    lastScannerPing = Date.now();

    for (const item of items) {
      const qty = item.quantity || 1;
      for (let i = 0; i < qty; i++) {
        await db.collection('scanner_events').insertOne({
          id: Date.now() + Math.floor(Math.random() * 10000),
          code: item.code,
          format: item.format || 'BATCH',
          created_at: new Date()
        });
      }
    }
    res.json({ success: true, count: items.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload product photo from phone camera
app.post('/api/upload-product-photo', async (req, res) => {
  try {
    const db = await getDatabase();
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu ảnh' });
    }
    lastScannerPing = Date.now();

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
    res.status(500).json({ success: false, error: err.message });
  }
});

// POS polls for newly taken product photo from phone
app.get('/api/scanner/latest-photo', async (req, res) => {
  try {
    const db = await getDatabase();
    const since = req.query.since ? new Date(Number(req.query.since)) : new Date(Date.now() - 30000);
    const photo = await db.collection('scanner_photos').findOne(
      { created_at: { $gt: since } },
      { sort: { created_at: -1 } }
    );
    res.json(photo || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend static files in local dev mode
const fs = require('fs');
const srcPath = path.join(__dirname, '..', 'src');
if (fs.existsSync(srcPath)) {
  app.use(express.static(srcPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(srcPath, 'index.html'));
  });
}

// For local testing
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Web Server] ShopPro POS running at http://localhost:${PORT}`);
  });
}

module.exports = app;
