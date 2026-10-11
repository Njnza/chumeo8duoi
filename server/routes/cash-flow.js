const express = require('express');
const router = express.Router();
const { getDatabase, getNextId } = require('../lib/db');
const { validate, schemas } = require('../middleware/validate');

// POST /api/cash-flow
router.post('/', validate(schemas.cashFlow), async (req, res, next) => {
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
    next(err);
  }
});

// GET /api/cash-flow/summary (Must be before /api/cash-flow if parameterized)
router.get('/summary', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const query = {};
    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    // Use aggregation for summary
    const summary = await db.collection('cash_flow').aggregate([
      { $match: query },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' }
        }
      }
    ]).toArray();

    let income = 0, expense = 0;
    for (const s of summary) {
      if (s._id === 'income') income = s.total;
      else if (s._id === 'expense') expense = s.total;
    }

    res.json({ total_income: income, total_expense: expense, net_cash: income - expense });
  } catch (err) {
    next(err);
  }
});

// GET /api/cash-flow
router.get('/', async (req, res, next) => {
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
    next(err);
  }
});

module.exports = router;
