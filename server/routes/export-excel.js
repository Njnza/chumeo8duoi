const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { getDatabase } = require('../lib/db');
const { optionalAuth } = require('../middleware/auth');

function formatCurrencyNum(val) {
  return Number(val) || 0;
}

// 1. GET /api/export-excel/products - Xuất kho hàng hóa
router.get('/products', optionalAuth, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const [products, categories] = await Promise.all([
      db.collection('products').find().sort({ id: 1 }).toArray(),
      db.collection('categories').find().toArray()
    ]);

    const catMap = new Map(categories.map(c => [c.id, c.name]));

    const rows = products.map((p, idx) => ({
      'STT': idx + 1,
      'Mã SKU': p.sku || '',
      'Mã Vạch Barcode': p.barcode || '',
      'Tên Sản Phẩm': p.name || '',
      'Danh Mục': catMap.get(p.category_id) || 'Chưa phân loại',
      'Đơn Vị': p.unit || 'cái',
      'Giá Bán (VNĐ)': formatCurrencyNum(p.price),
      'Giá Khuyến Mãi (VNĐ)': formatCurrencyNum(p.sale_price),
      'Giá Vốn (VNĐ)': formatCurrencyNum(p.cost_price),
      'Tồn Kho': formatCurrencyNum(p.stock),
      'Tồn Tối Thiểu': formatCurrencyNum(p.min_stock),
      'Trạng Thái': p.status === 'active' ? 'Đang bán' : 'Ngừng bán',
      'Cảnh Báo Tồn': p.stock <= p.min_stock ? 'SẮP HẾT HÀNG' : 'Bình thường'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto-fit column widths
    worksheet['!cols'] = [
      { wch: 6 },  // STT
      { wch: 14 }, // SKU
      { wch: 18 }, // Barcode
      { wch: 35 }, // Tên
      { wch: 18 }, // Danh mục
      { wch: 10 }, // Đơn vị
      { wch: 16 }, // Giá bán
      { wch: 20 }, // Giá KM
      { wch: 16 }, // Giá vốn
      { wch: 12 }, // Tồn kho
      { wch: 14 }, // Tồn min
      { wch: 14 }, // Trạng thái
      { wch: 18 }  // Cảnh báo
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kho Hàng Hóa');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Danh_Sach_San_Pham_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/export-excel/orders - Xuất danh sách đơn hàng
router.get('/orders', optionalAuth, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { from, to, status } = req.query;
    const query = {};
    if (status) query.status = status;
    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.created_at.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const orders = await db.collection('orders').find(query).sort({ created_at: -1 }).toArray();

    const paymentMap = { cash: 'Tiền mặt', card: 'Thẻ ngân hàng', transfer: 'Chuyển khoản' };
    const statusMap = { completed: 'Hoàn thành', cancelled: 'Đã hủy', returned: 'Đã trả hàng' };

    const rows = orders.map((o, idx) => ({
      'STT': idx + 1,
      'Mã Đơn Hàng': o.order_code,
      'Ngày Tạo': o.created_at ? new Date(o.created_at).toLocaleString('vi-VN') : '',
      'Khách Hàng': o.customer_name || 'Khách lẻ',
      'Số Điện Thoại': o.customer_phone || '',
      'Thu Ngân': o.staff_name || 'Thu Ngân',
      'Số Lượng Món': o.items?.length || 0,
      'Tạm Tính (VNĐ)': formatCurrencyNum(o.subtotal),
      'Giảm Giá (VNĐ)': formatCurrencyNum(o.discount_amount),
      'Tổng Tiền (VNĐ)': formatCurrencyNum(o.total),
      'Phương Thức': paymentMap[o.payment_method] || o.payment_method,
      'Trạng Thái': statusMap[o.status] || o.status,
      'Ghi Chú': o.note || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 6 },  // STT
      { wch: 18 }, // Mã đơn
      { wch: 22 }, // Ngày tạo
      { wch: 22 }, // Khách hàng
      { wch: 14 }, // SĐT
      { wch: 16 }, // Thu ngân
      { wch: 14 }, // SL món
      { wch: 16 }, // Tạm tính
      { wch: 16 }, // Giảm giá
      { wch: 18 }, // Tổng tiền
      { wch: 16 }, // Phương thức
      { wch: 14 }, // Trạng thái
      { wch: 25 }  // Ghi chú
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Đơn Hàng');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Danh_Sach_Don_Hang_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/export-excel/customers - Xuất khách hàng
router.get('/customers', optionalAuth, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const customers = await db.collection('customers').find().sort({ total_spent: -1 }).toArray();

    const rows = customers.map((c, idx) => ({
      'STT': idx + 1,
      'Mã KH': c.id,
      'Họ Và Tên': c.name || '',
      'Số Điện Thoại': c.phone || '',
      'Email': c.email || '',
      'Địa Chỉ': c.address || '',
      'Hạng Thành Viên': c.fixed_tier_id || 'Tự động',
      'Tổng Chi Tiêu (VNĐ)': formatCurrencyNum(c.total_spent),
      'Số Lần Mua Hàng': formatCurrencyNum(c.visit_count),
      'Ghi Chú': c.note || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 10 },
      { wch: 25 },
      { wch: 15 },
      { wch: 22 },
      { wch: 30 },
      { wch: 16 },
      { wch: 20 },
      { wch: 16 },
      { wch: 25 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Khách Hàng');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Danh_Sach_Khach_Hang_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
