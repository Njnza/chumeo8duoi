const express = require('express');
const router = express.Router();
const { getDatabase, getNextId } = require('../lib/db');
const { validate, schemas } = require('../middleware/validate');
const { invalidateCategoryCache } = require('./products');

// GET /api/categories
router.get('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const categories = await db.collection('categories').find().sort({ sort_order: 1, id: 1 }).toArray();
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories
router.post('/', validate(schemas.category), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const nextId = await getNextId(db, 'categories');
    const newCat = {
      id: nextId,
      name: String(data.name).trim(),
      description: data.description || '',
      color: data.color || '#7c6aef',
      sort_order: Number(data.sort_order) || 0,
      created_at: new Date()
    };
    await db.collection('categories').insertOne(newCat);
    invalidateCategoryCache();
    res.json(newCat);
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/:id
router.put('/:id', validate(schemas.category), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;
    await db.collection('categories').updateOne({ id }, {
      $set: {
        name: String(data.name).trim(),
        description: data.description || '',
        color: data.color || '#7c6aef',
        sort_order: Number(data.sort_order) || 0
      }
    });
    const updated = await db.collection('categories').findOne({ id });
    invalidateCategoryCache();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    await db.collection('categories').deleteOne({ id });
    // Reset category_id on associated products
    await db.collection('products').updateMany({ category_id: id }, { $set: { category_id: null } });
    invalidateCategoryCache();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
