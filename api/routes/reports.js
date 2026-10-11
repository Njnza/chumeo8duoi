const express = require('express');
const router = express.Router();
const { getDatabase } = require('../lib/db');

// 1. GET /api/reports/dashboard
router.get('/dashboard', async (req, res, next) => {
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

    // Low stock products query
    const lowStockProducts = await db.collection('products').find({
      status: 'active',
      $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$min_stock'] }] }
    }).limit(10).toArray();

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
    next(err);
  }
});

// 2. GET /api/reports/revenue
router.get('/revenue', async (req, res, next) => {
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
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at', timezone: '+07:00' } },
          order_count: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    const formatted = agg.map(r => ({ date: r._id, order_count: r.order_count, revenue: r.revenue }));
    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/reports/top-products
router.get('/top-products', async (req, res, next) => {
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
    next(err);
  }
});

// 4. GET /api/reports/payment-method
router.get('/payment-method', async (req, res, next) => {
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
    next(err);
  }
});

// 5. GET /api/reports/profit (P3 Optimization: MongoDB aggregation for revenue and COGS)
router.get('/profit', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const match = { status: { $in: ['completed', 'returned'] } };
    if (from || to) {
      match.created_at = {};
      if (from) match.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) match.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    // 1. Gross revenue & order count via aggregation
    const orderAgg = await db.collection('orders').aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          grossRevenue: { $sum: '$total' }
        }
      }
    ]).toArray();

    const totalOrders = orderAgg[0]?.totalOrders || 0;
    const grossRevenue = orderAgg[0]?.grossRevenue || 0;

    // 2. COGS calculation directly via Aggregation with $lookup
    const cogsAgg = await db.collection('orders').aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $project: {
          product_id: '$items.product_id',
          netQty: { $subtract: ['$items.quantity', { $ifNull: ['$items.returned_quantity', 0] }] }
        }
      },
      { $match: { netQty: { $gt: 0 }, product_id: { $ne: null } } },
      {
        $group: {
          _id: '$product_id',
          totalQty: { $sum: '$netQty' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'id',
          as: 'prod'
        }
      },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalCost: { $sum: { $multiply: ['$totalQty', { $ifNull: ['$prod.cost_price', 0] }] } }
        }
      }
    ]).toArray();

    const totalCost = cogsAgg[0]?.totalCost || 0;

    // 3. Refunds via Aggregation
    const returnMatch = {};
    if (from || to) {
      returnMatch.created_at = {};
      if (from) returnMatch.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) returnMatch.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const returnAgg = await db.collection('order_returns').aggregate([
      { $match: returnMatch },
      {
        $group: {
          _id: null,
          returnCount: { $sum: 1 },
          totalRefund: { $sum: '$refund_amount' }
        }
      }
    ]).toArray();

    const returnCount = returnAgg[0]?.returnCount || 0;
    const totalRefund = returnAgg[0]?.totalRefund || 0;

    const netRevenue = Math.max(0, grossRevenue - totalRefund);
    const grossProfit = netRevenue - totalCost;
    const profitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    res.json({
      totalOrders,
      grossRevenue,
      totalRefund,
      returnCount,
      netRevenue,
      totalCost,
      grossProfit,
      profitMargin: Math.round(profitMargin * 10) / 10
    });
  } catch (err) {
    next(err);
  }
});

// 6. GET /api/reports/hourly (P4 Optimization: MongoDB $hour aggregation)
router.get('/hourly', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const match = { status: 'completed' };
    if (from || to) {
      match.created_at = {};
      if (from) match.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) match.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const hourlyAgg = await db.collection('orders').aggregate([
      { $match: match },
      {
        $group: {
          _id: { $hour: { date: '$created_at', timezone: '+07:00' } },
          order_count: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      }
    ]).toArray();

    const hourlyMap = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { hour: h, order_count: 0, revenue: 0 };
    }

    for (const r of hourlyAgg) {
      const h = r._id;
      if (h !== null && hourlyMap[h]) {
        hourlyMap[h].order_count = r.order_count;
        hourlyMap[h].revenue = r.revenue;
      }
    }

    res.json(Object.values(hourlyMap));
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/reports/abc-analysis (P2 Optimization: Aggregation pipeline for order items)
router.get('/abc-analysis', async (req, res, next) => {
  try {
    const db = await getDatabase();

    // 1. Aggregate sold items and revenue per product in MongoDB
    const salesAgg = await db.collection('orders').aggregate([
      { $match: { status: 'completed' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product_id',
          total_sold: { $sum: '$items.quantity' },
          total_revenue: { $sum: '$items.subtotal' }
        }
      }
    ]).toArray();

    const salesMap = new Map(salesAgg.map(s => [s._id, s]));

    // 2. Fetch active products
    const products = await db.collection('products').find({ status: 'active' }).toArray();

    const items = products.map(p => {
      const s = salesMap.get(p.id);
      return {
        ...p,
        total_sold: s?.total_sold || 0,
        total_revenue: s?.total_revenue || 0
      };
    }).sort((a, b) => b.total_revenue - a.total_revenue);

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
    next(err);
  }
});

module.exports = router;
