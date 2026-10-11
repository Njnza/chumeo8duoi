const express = require('express');
const router = express.Router();
const { getDatabase, getNextId } = require('../lib/db');
const { buildVietnameseSearchQuery } = require('../lib/helpers');
const { validate, schemas } = require('../middleware/validate');

// GET /api/customers
router.get('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { search, limit } = req.query;
    const query = {};
    if (search) {
      const searchCond = buildVietnameseSearchQuery(search, ['name', 'phone', 'email', 'address']);
      if (searchCond) {
        query.$and = searchCond.$and;
      }
    }
    let cursor = db.collection('customers').find(query).sort({ updated_at: -1, id: -1 });
    if (limit) cursor = cursor.limit(parseInt(limit, 10));
    const customers = await cursor.toArray();
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const customer = await db.collection('customers').findOne({ id });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// POST /api/customers
router.post('/', validate(schemas.customer), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const nextId = await getNextId(db, 'customers');
    const newCust = {
      id: nextId,
      name: String(data.name).trim(),
      phone: data.phone ? String(data.phone).trim() : '',
      email: data.email ? String(data.email).trim() : '',
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
    next(err);
  }
});

// PUT /api/customers/:id
router.put('/:id', validate(schemas.customer), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;
    const updateDoc = {
      name: String(data.name).trim(),
      phone: data.phone ? String(data.phone).trim() : '',
      email: data.email ? String(data.email).trim() : '',
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
    next(err);
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    await db.collection('customers').deleteOne({ id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
