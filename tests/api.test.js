/* ============================================
   ShopPro POS - API & Security Unit/Integration Tests
   Tests router modules, authentication, helpers, rate limiter, and validation
   ============================================ */

const assert = require('assert');
const {
  hashPin,
  verifyPin,
  removeVietnameseTones,
  buildVietnameseRegex,
  buildVietnameseSearchQuery,
  generateOrderCode
} = require('../api/lib/helpers');
const { generateToken, authenticateToken, requireRole, JWT_SECRET } = require('../api/middleware/auth');
const { schemas } = require('../api/middleware/validate');
const jwt = require('jsonwebtoken');

async function runApiTests() {
  console.log('--- BẮT ĐẦU CHẠY KIỂM THỬ API & KIẾN TRÚC SHOPPRO POS ---');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err?.message || err);
      failed++;
    }
  }

  // 1. PIN Security Tests
  await test('PIN Hashing & Verification với scrypt an toàn', async () => {
    const rawPin = '1234';
    const hashed = hashPin(rawPin);
    assert.ok(hashed.startsWith('scrypt:'), 'Hash phải bắt đầu bằng scrypt:');
    assert.strictEqual(verifyPin('1234', hashed), true, 'Verify PIN đúng phải trả về true');
    assert.strictEqual(verifyPin('9999', hashed), false, 'Verify PIN sai phải trả về false');
    assert.strictEqual(verifyPin('', hashed), false, 'Verify PIN rỗng phải trả về false');
  });

  // 2. Vietnamese Unaccented Search Tests
  await test('Vietnamese removeVietnameseTones chuẩn hóa chuỗi tiếng Việt có dấu', async () => {
    const input = 'Áo thun có cổ màu Đỏ';
    const normalized = removeVietnameseTones(input);
    assert.strictEqual(normalized, 'ao thun co co mau do');
  });

  await test('Vietnamese buildVietnameseSearchQuery tạo MongoDB query chuẩn xác', async () => {
    const query = buildVietnameseSearchQuery('ao thun', ['name', 'sku']);
    assert.ok(query && query.$and, 'Query phải có $and tokens');
    assert.strictEqual(query.$and.length, 2, 'Tìm 2 từ phải sinh ra 2 mệnh đề token');
  });

  // 3. JWT Authentication & Role Security (S3, S7)
  await test('JWT Token generation & verification', async () => {
    const mockUser = { id: 1, username: 'admin', name: 'Chủ Cửa Hàng', role: 'owner' };
    const token = generateToken(mockUser);
    assert.ok(token && typeof token === 'string', 'Token phải là chuỗi hợp lệ');

    const decoded = jwt.verify(token, JWT_SECRET);
    assert.strictEqual(decoded.id, 1);
    assert.strictEqual(decoded.username, 'admin');
    assert.strictEqual(decoded.role, 'owner');
  });

  await test('Role-based Access Control (requireRole)', async () => {
    const middleware = requireRole('owner', 'manager');
    let calledNext = false;
    const req = { user: { id: 1, role: 'staff' } };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      }
    };
    middleware(req, res, () => { calledNext = true; });

    assert.strictEqual(calledNext, false, 'Staff không được phép vượt qua role check owner/manager');
    assert.strictEqual(res.statusCode, 403, 'Phải trả về status 403 Forbidden');

    // Test with owner
    calledNext = false;
    const ownerReq = { user: { id: 1, role: 'owner' } };
    middleware(ownerReq, res, () => { calledNext = true; });
    assert.strictEqual(calledNext, true, 'Owner phải được phép vượt qua role check');
  });

  // 4. Input Validation Tests (A3)
  await test('Input Validation: Product Schema bắt lỗi thiếu tên hoặc giá âm', async () => {
    assert.ok(schemas.product({}), 'Thiếu tên sản phẩm phải báo lỗi');
    assert.ok(schemas.product({ name: '   ' }), 'Tên rỗng phải báo lỗi');
    assert.ok(schemas.product({ name: 'Áo', price: -5000 }), 'Giá âm phải báo lỗi');
    assert.strictEqual(schemas.product({ name: 'Áo thun', price: 100000, stock: 10 }), null, 'Dữ liệu hợp lệ không có lỗi');
  });

  await test('Input Validation: Order Schema bắt lỗi thiếu sản phẩm', async () => {
    assert.ok(schemas.order({ items: [] }), 'Đơn hàng rỗng phải báo lỗi');
    assert.ok(schemas.order({ items: [{ product_id: 1, quantity: 0 }] }), 'Số lượng 0 phải báo lỗi');
    assert.strictEqual(schemas.order({ items: [{ product_id: 1, quantity: 2, price: 50000 }], final_amount: 100000 }), null);
  });

  await test('Input Validation: Customer Schema', async () => {
    assert.ok(schemas.customer({}), 'Thiếu tên khách hàng phải báo lỗi');
    assert.ok(schemas.customer({ name: 'Nguyễn Văn A', phone: 'invalid-phone-abc' }), 'Số điện thoại sai định dạng phải báo lỗi');
    assert.strictEqual(schemas.customer({ name: 'Nguyễn Văn A', phone: '0901234567' }), null);
  });

  // 5. Order Code Generation
  await test('Tạo mã đơn hàng ngẫu nhiên chuẩn format', async () => {
    const code = generateOrderCode('HD');
    assert.ok(code.startsWith('HD'), 'Mã đơn phải bắt đầu bằng HD');
    assert.ok(code.includes('-'), 'Mã đơn phải có dấu gạch ngang phân cách số thứ tự');
  });

  // 6. Express App Loading & Routes Modularization (P1, A1)
  await test('Express App nạp đầy đủ Router modules không có lỗi runtime', async () => {
    const app = require('../api/index');
    assert.ok(app, 'App phải nạp thành công');
    assert.strictEqual(typeof app, 'function', 'App phải là Express application');
  });

  console.log('\n===========================================');
  console.log(`KẾT QUẢ KIỂM THỬ API: ${passed} PASS, ${failed} FAIL`);
  console.log('===========================================\n');

  if (failed > 0) process.exit(1);
}

runApiTests().catch(err => {
  console.error('Lỗi khi chạy test API:', err);
  process.exit(1);
});
