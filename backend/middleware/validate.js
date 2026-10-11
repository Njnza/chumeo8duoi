/**
 * Lightweight, robust input validation middleware
 */

function validate(schemaFn) {
  return (req, res, next) => {
    try {
      const error = schemaFn(req.body, req);
      if (error) {
        return res.status(400).json({ error, code: 'VALIDATION_ERROR' });
      }
      next();
    } catch (err) {
      res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    }
  };
}

// Schemas
const schemas = {
  product: (body) => {
    if (!body || typeof body !== 'object') return 'Dữ liệu sản phẩm không hợp lệ';
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return 'Tên sản phẩm là bắt buộc và không được để trống';
    }
    if (body.price !== undefined && (isNaN(Number(body.price)) || Number(body.price) < 0)) {
      return 'Giá bán phải là số không âm';
    }
    if (body.cost_price !== undefined && (isNaN(Number(body.cost_price)) || Number(body.cost_price) < 0)) {
      return 'Giá vốn phải là số không âm';
    }
    if (body.stock !== undefined && isNaN(Number(body.stock))) {
      return 'Tồn kho phải là số hợp lệ';
    }
    return null;
  },

  category: (body) => {
    if (!body || typeof body !== 'object') return 'Dữ liệu danh mục không hợp lệ';
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return 'Tên danh mục là bắt buộc và không được để trống';
    }
    return null;
  },

  customer: (body) => {
    if (!body || typeof body !== 'object') return 'Dữ liệu khách hàng không hợp lệ';
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return 'Tên khách hàng là bắt buộc và không được để trống';
    }
    if (body.phone && !/^[0-9+\s-]{7,15}$/.test(String(body.phone).trim())) {
      return 'Số điện thoại không đúng định dạng';
    }
    return null;
  },

  order: (body) => {
    if (!body || typeof body !== 'object') return 'Dữ liệu đơn hàng không hợp lệ';
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return 'Đơn hàng phải có ít nhất 1 sản phẩm';
    }
    for (const item of body.items) {
      if (!item.product_id && !item.id) return 'Sản phẩm trong đơn hàng thiếu ID';
      if (!item.quantity || Number(item.quantity) <= 0) return 'Số lượng sản phẩm phải lớn hơn 0';
      if (item.price === undefined || Number(item.price) < 0) return 'Giá sản phẩm không hợp lệ';
    }
    if (body.final_amount !== undefined && (isNaN(Number(body.final_amount)) || Number(body.final_amount) < 0)) {
      return 'Tổng tiền thanh toán không hợp lệ';
    }
    return null;
  },

  user: (body, req) => {
    if (!body || typeof body !== 'object') return 'Dữ liệu người dùng không hợp lệ';
    const isUpdate = req && req.method === 'PUT';
    if (!isUpdate && (!body.username || typeof body.username !== 'string' || !body.username.trim())) {
      return 'Tên đăng nhập là bắt buộc';
    }
    if (!isUpdate && (!body.name || typeof body.name !== 'string' || !body.name.trim())) {
      return 'Họ tên người dùng là bắt buộc';
    }
    if (body.role && !['owner', 'manager', 'staff'].includes(body.role)) {
      return 'Vai trò người dùng phải là owner, manager hoặc staff';
    }
    return null;
  },

  cashFlow: (body) => {
    if (!body || typeof body !== 'object') return 'Dữ liệu thu/chi không hợp lệ';
    if (!['income', 'expense'].includes(body.type)) {
      return 'Loại phiếu phải là thu (income) hoặc chi (expense)';
    }
    if (!body.amount || isNaN(Number(body.amount)) || Number(body.amount) <= 0) {
      return 'Số tiền phải lớn hơn 0';
    }
    if (!body.category || typeof body.category !== 'string' || !body.category.trim()) {
      return 'Hạng mục thu/chi là bắt buộc';
    }
    return null;
  }
};

module.exports = {
  validate,
  schemas
};
