const express = require('express');
const router = express.Router();
const { getDatabase } = require('../lib/db');
const { optionalAuth } = require('../middleware/auth');

// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.collection('settings').find().toArray();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/member-tiers (Must be before /:key)
router.get('/member-tiers', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const doc = await db.collection('settings').findOne({ key: 'member_tiers' });
    const tiers = doc ? JSON.parse(doc.value) : [];
    res.json(tiers);
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/member-tiers
router.post('/member-tiers', async (req, res, next) => {
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
    next(err);
  }
});

// GET /api/settings/:key
router.get('/:key', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const doc = await db.collection('settings').findOne({ key: req.params.key });
    res.json(doc ? doc.value : null);
  } catch (err) {
    next(err);
  }
});

// POST /api/settings
router.post('/', async (req, res, next) => {
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
    next(err);
  }
});

module.exports = router;
