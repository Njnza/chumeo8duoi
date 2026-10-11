const express = require('express');
const router = express.Router();
const { getDatabase } = require('../lib/db');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET /api/audit-logs - Xem danh sách nhật ký hoạt động
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { action, entity, user_id, from, to, limit, offset, search } = req.query;

    const query = {};
    if (action) query.action = action;
    if (entity) query.entity = entity;
    if (user_id) query.user_id = parseInt(user_id, 10);

    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    if (search) {
      const reg = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { description: reg },
        { username: reg },
        { user_name: reg },
        { entity_id: reg },
        { action: reg }
      ];
    }

    const pageSize = Math.min(parseInt(limit, 10) || 50, 200);
    const skip = parseInt(offset, 10) || 0;

    const [logs, total] = await Promise.all([
      db.collection('audit_logs')
        .find(query)
        .sort({ created_at: -1, id: -1 })
        .skip(skip)
        .limit(pageSize)
        .toArray(),
      db.collection('audit_logs').countDocuments(query)
    ]);

    res.json({
      logs,
      total,
      limit: pageSize,
      offset: skip
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-logs/actions - Lấy danh sách các loại hành động để lọc
router.get('/actions', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const actions = await db.collection('audit_logs').distinct('action');
    res.json(actions);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
