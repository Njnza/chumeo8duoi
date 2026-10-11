const express = require('express');
const router = express.Router();
const { getDatabase } = require('../lib/db');
const { optionalAuth, requireRole } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

// GET /api/backup/export - Xuất toàn bộ dữ liệu database ra JSON
router.get('/export', optionalAuth, async (req, res, next) => {
  try {
    const db = await getDatabase();

    const [
      products,
      categories,
      customers,
      orders,
      orderReturns,
      shifts,
      cashFlow,
      settings
    ] = await Promise.all([
      db.collection('products').find().toArray(),
      db.collection('categories').find().toArray(),
      db.collection('customers').find().toArray(),
      db.collection('orders').find().toArray(),
      db.collection('order_returns').find().toArray(),
      db.collection('shifts').find().toArray(),
      db.collection('cash_flow').find().toArray(),
      db.collection('settings').find().toArray()
    ]);

    const backupData = {
      app: 'ShopPro POS',
      version: '2.0.0',
      exported_at: new Date().toISOString(),
      counts: {
        products: products.length,
        categories: categories.length,
        customers: customers.length,
        orders: orders.length,
        order_returns: orderReturns.length,
        shifts: shifts.length,
        cash_flow: cashFlow.length,
        settings: settings.length
      },
      data: {
        products,
        categories,
        customers,
        orders,
        order_returns: orderReturns,
        shifts,
        cash_flow: cashFlow,
        settings
      }
    };

    await logAudit({
      action: 'BACKUP_EXPORT',
      entity: 'backup',
      user: req.user,
      description: `Xuất bản sao lưu hệ thống: ${orders.length} đơn hàng, ${products.length} sản phẩm`,
      details: backupData.counts,
      req
    });

    const filename = `shoppro-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backupData);
  } catch (err) {
    next(err);
  }
});

// POST /api/backup/restore - Khôi phục toàn bộ dữ liệu từ file backup JSON
router.post('/restore', optionalAuth, async (req, res, next) => {
  try {
    const backup = req.body;
    if (!backup || !backup.data || typeof backup.data !== 'object') {
      return res.status(400).json({ error: 'File sao lưu không hợp lệ. Vui lòng chọn đúng file JSON sao lưu từ ShopPro.' });
    }

    const db = await getDatabase();
    const { data } = backup;
    const restoredCounts = {};

    // 1. Categories
    if (Array.isArray(data.categories) && data.categories.length > 0) {
      await db.collection('categories').deleteMany({});
      const catsToInsert = data.categories.map(({ _id, ...c }) => c);
      await db.collection('categories').insertMany(catsToInsert);
      restoredCounts.categories = catsToInsert.length;
    }

    // 2. Products
    if (Array.isArray(data.products) && data.products.length > 0) {
      await db.collection('products').deleteMany({});
      const prodsToInsert = data.products.map(({ _id, ...p }) => p);
      await db.collection('products').insertMany(prodsToInsert);
      restoredCounts.products = prodsToInsert.length;
    }

    // 3. Customers
    if (Array.isArray(data.customers) && data.customers.length > 0) {
      await db.collection('customers').deleteMany({});
      const custsToInsert = data.customers.map(({ _id, ...c }) => c);
      await db.collection('customers').insertMany(custsToInsert);
      restoredCounts.customers = custsToInsert.length;
    }

    // 4. Orders
    if (Array.isArray(data.orders) && data.orders.length > 0) {
      await db.collection('orders').deleteMany({});
      const ordersToInsert = data.orders.map(({ _id, ...o }) => o);
      await db.collection('orders').insertMany(ordersToInsert);
      restoredCounts.orders = ordersToInsert.length;
    }

    // 5. Order Returns
    if (Array.isArray(data.order_returns) && data.order_returns.length > 0) {
      await db.collection('order_returns').deleteMany({});
      const returnsToInsert = data.order_returns.map(({ _id, ...r }) => r);
      await db.collection('order_returns').insertMany(returnsToInsert);
      restoredCounts.order_returns = returnsToInsert.length;
    }

    // 6. Shifts
    if (Array.isArray(data.shifts) && data.shifts.length > 0) {
      await db.collection('shifts').deleteMany({});
      const shiftsToInsert = data.shifts.map(({ _id, ...s }) => s);
      await db.collection('shifts').insertMany(shiftsToInsert);
      restoredCounts.shifts = shiftsToInsert.length;
    }

    // 7. Cash Flow
    if (Array.isArray(data.cash_flow) && data.cash_flow.length > 0) {
      await db.collection('cash_flow').deleteMany({});
      const cfToInsert = data.cash_flow.map(({ _id, ...c }) => c);
      await db.collection('cash_flow').insertMany(cfToInsert);
      restoredCounts.cash_flow = cfToInsert.length;
    }

    // 8. Settings
    if (Array.isArray(data.settings) && data.settings.length > 0) {
      for (const s of data.settings) {
        if (s.key) {
          await db.collection('settings').updateOne(
            { key: s.key },
            { $set: { value: s.value } },
            { upsert: true }
          );
        }
      }
      restoredCounts.settings = data.settings.length;
    }

    await logAudit({
      action: 'BACKUP_RESTORE',
      entity: 'backup',
      user: req.user,
      description: `Khôi phục dữ liệu từ bản sao lưu ngày ${backup.exported_at || 'trước đó'}`,
      details: restoredCounts,
      req
    });

    res.json({
      success: true,
      message: 'Khôi phục dữ liệu thành công!',
      restoredCounts
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
