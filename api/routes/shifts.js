const express = require('express');
const router = express.Router();
const { getDatabase, getNextId } = require('../lib/db');
const { validate, schemas } = require('../middleware/validate');

// ==================== SHIFTS ====================

// GET /api/shifts/current
router.get('/current', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { user_id } = req.query;
    const query = { status: 'open' };
    if (user_id) query.user_id = parseInt(user_id, 10);
    const shift = await db.collection('shifts').find(query).sort({ id: -1 }).limit(1).toArray();
    res.json(shift[0] || null);
  } catch (err) {
    next(err);
  }
});

// POST /api/shifts/open
router.post('/open', async (req, res, next) => {
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
    next(err);
  }
});

// GET /api/shifts/:id/summary
router.get('/:id/summary', async (req, res, next) => {
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
    next(err);
  }
});

// POST /api/shifts/:id/close
router.post('/:id/close', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;

    const actualCash = Number(data.actual_cash) || 0;
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
    next(err);
  }
});

// GET /api/shifts
router.get('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const limit = parseInt(req.query.limit, 10) || 30;
    const shifts = await db.collection('shifts').find().sort({ id: -1 }).limit(limit).toArray();
    res.json(shifts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
