const { getDatabase, getNextId } = require('./db');

/**
 * Ghi nhận Audit Log (Nhật ký hoạt động hệ thống tài chính / nghiệp vụ)
 * @param {Object} params
 * @param {string} params.action - Mã hành động (ORDER_CREATE, ORDER_CANCEL, PRODUCT_UPDATE, ...)
 * @param {string} params.entity - Đối tượng (orders, products, users, shifts, settings, ...)
 * @param {string|number} params.entity_id - ID đối tượng
 * @param {Object} [params.user] - Thông tin người thực hiện ({ id, username, name, role })
 * @param {string} [params.description] - Mô tả chi tiết hành động bằng tiếng Việt
 * @param {Object} [params.details] - Dữ liệu chi tiết trước/sau thay đổi
 * @param {Object} [params.req] - Express request object để lấy IP và User-Agent
 */
async function logAudit({ action, entity, entity_id, user, description, details, req }) {
  try {
    const db = await getDatabase();
    const nextId = await getNextId(db, 'audit_logs');

    let clientIp = '127.0.0.1';
    let userAgent = '';
    if (req) {
      clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                 req.headers['x-real-ip'] ||
                 req.socket?.remoteAddress || '127.0.0.1';
      userAgent = req.headers['user-agent'] || '';
    }

    const logEntry = {
      id: nextId,
      action: action || 'UNKNOWN_ACTION',
      entity: entity || 'general',
      entity_id: entity_id !== undefined ? String(entity_id) : '',
      user_id: user?.id || null,
      username: user?.username || 'system',
      user_name: user?.name || 'Hệ thống',
      user_role: user?.role || 'system',
      description: description || '',
      details: details || null,
      ip_address: clientIp,
      user_agent: userAgent,
      created_at: new Date()
    };

    await db.collection('audit_logs').insertOne(logEntry);
    return logEntry;
  } catch (err) {
    console.error('[AuditLog] Lỗi khi ghi nhật ký hoạt động:', err.message);
    return null;
  }
}

module.exports = {
  logAudit
};
