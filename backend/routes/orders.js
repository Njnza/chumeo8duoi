const express = require('express');
const router = express.Router();
const { getDatabase, getNextId } = require('../lib/db');
const { buildVietnameseSearchQuery } = require('../lib/helpers');
const { validate, schemas } = require('../middleware/validate');
const { optionalAuth } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

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

// GET /api/orders
router.get('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { status, customer_id, from, to, limit, offset, search, payment_method } = req.query;
    const query = {};
    if (status) query.status = status;
    if (payment_method) query.payment_method = payment_method;
    if (customer_id) query.customer_id = parseInt(customer_id, 10);
    if (search) {
      const searchCond = buildVietnameseSearchQuery(search, ['order_code', 'customer_name', 'customer_phone']);
      if (searchCond) {
        query.$and = searchCond.$and;
      }
    }
    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    let cursor = db.collection('orders').find(query).sort({ created_at: -1, id: -1 });
    if (offset) cursor = cursor.skip(parseInt(offset, 10));
    if (limit) cursor = cursor.limit(parseInt(limit, 10));

    function sanitizeOrder(o) {
      if (!o || !Array.isArray(o.items)) return o;
      o.items.forEach(it => {
        if (it.product_name && it.product_name.includes('\ufffd')) {
          it.product_name = it.product_name.replace(/\ufffdo/g, 'Áo').replace(/\ufffd/g, '');
        }
      });
      return o;
    }

    const orders = await cursor.toArray();
    res.json(orders.map(sanitizeOrder));
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/returns (Must be before /:id)
router.get('/returns', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { order_id } = req.query;
    const query = {};
    if (order_id) query.order_id = parseInt(order_id, 10);
    const returns = await db.collection('order_returns').find(query).sort({ created_at: -1 }).toArray();
    res.json(returns);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/returns/:id
router.get('/returns/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const ret = await db.collection('order_returns').findOne({ id });
    res.json(ret);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const order = await db.collection('orders').findOne({ id });
    if (!order) return res.status(404).json(null);
    if (Array.isArray(order.items)) {
      order.items.forEach(it => {
        if (it.product_name && it.product_name.includes('\ufffd')) {
          it.product_name = it.product_name.replace(/\ufffdo/g, 'Áo').replace(/\ufffd/g, '');
        }
      });
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders
router.post('/', optionalAuth, validate(schemas.order), async (req, res, next) => {
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

    // Authoritative product lookup to prevent font/encoding corruption (e.g. \ufffd)
    const productIds = (data.items || []).map(it => it.product_id ? parseInt(it.product_id, 10) : null).filter(Boolean);
    const dbProducts = productIds.length > 0
      ? await db.collection('products').find({ id: { $in: productIds } }).toArray()
      : [];
    const prodMap = new Map(dbProducts.map(p => [p.id, p]));

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
      items: (data.items || []).map((it, idx) => {
        const pid = it.product_id ? parseInt(it.product_id, 10) : null;
        const dbProd = pid ? prodMap.get(pid) : null;
        const safeName = (dbProd && dbProd.name)
          ? dbProd.name
          : String(it.product_name || '').replace(/\ufffd/g, '');
        return {
          id: idx + 1,
          product_id: pid,
          product_name: safeName || it.product_name || 'Sản phẩm',
          product_sku: dbProd?.sku || it.product_sku || '',
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 1,
          discount: Number(it.discount) || 0,
          subtotal: Number(it.subtotal) || 0,
          returned_quantity: 0
        };
      }),
      created_at: new Date()
    };

    await db.collection('orders').insertOne(orderDoc);

    // Update product stock with bulkWrite
    const stockUpdates = orderDoc.items
      .filter(it => it.product_id)
      .map(it => ({
        updateOne: {
          filter: { id: it.product_id },
          update: { $inc: { stock: -it.quantity }, $set: { updated_at: new Date() } }
        }
      }));

    if (stockUpdates.length > 0) {
      await db.collection('products').bulkWrite(stockUpdates);
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

    await logAudit({
      action: 'ORDER_CREATE',
      entity: 'orders',
      entity_id: nextId,
      user: req.user,
      description: `Tạo đơn hàng ${orderCode} (${orderDoc.customer_name}) - Tổng tiền: ${orderDoc.total}₫`,
      details: { order_code: orderCode, total: orderDoc.total, items_count: orderDoc.items.length },
      req
    });

    res.json({ id: nextId, order_code: orderCode, ...orderDoc });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/cancel
router.post('/:id/cancel', optionalAuth, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const order = await db.collection('orders').findOne({ id });
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    if (order.status === 'cancelled') return res.status(400).json({ error: 'Đơn hàng đã bị hủy trước đó' });

    // Restore stock with bulkWrite
    const stockRestores = (order.items || [])
      .filter(it => it.product_id)
      .map(it => ({
        updateOne: {
          filter: { id: it.product_id },
          update: { $inc: { stock: it.quantity }, $set: { updated_at: new Date() } }
        }
      }));

    if (stockRestores.length > 0) {
      await db.collection('products').bulkWrite(stockRestores);
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

    await logAudit({
      action: 'ORDER_CANCEL',
      entity: 'orders',
      entity_id: id,
      user: req.user,
      description: `Hủy đơn hàng #${id} (${order.order_code}) - Hoàn trả ${order.items?.length || 0} sản phẩm vào kho`,
      details: { order_code: order.order_code, total: order.total },
      req
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/return
router.post('/return', optionalAuth, async (req, res, next) => {
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

    await logAudit({
      action: 'ORDER_RETURN',
      entity: 'orders',
      entity_id: order.id,
      user: req.user,
      description: `Đổi trả hàng ${returnCode} cho đơn ${order.order_code} - Hoàn trả: ${totalRefund}₫`,
      details: { return_code: returnCode, refund_amount: totalRefund, items_count: returnItems.length },
      req
    });

    res.json({ id: returnId, return_code: returnCode, refund_amount: totalRefund, order_code: order.order_code });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
