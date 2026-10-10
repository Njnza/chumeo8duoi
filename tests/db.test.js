/* ============================================
   ShopPro Desktop - Database & Business Logic Unit Tests
   Tests run in-memory using Node test runner / assert
   ============================================ */

const assert = require('assert');
const path = require('path');
const ShopDatabase = require('../database/db');

async function runTests() {
  console.log('--- BẮT ĐẦU CHẠY KIỂM THỬ SHOP DATABASE ---');
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

  const db = new ShopDatabase(':memory:');
  await db.init();

  // Test 1: Khởi tạo database và seed dữ liệu mặc định
  await test('Khởi tạo database và tạo người dùng mặc định', async () => {
    const users = db.getUsers();
    assert.strictEqual(Array.isArray(users), true);
    assert.strictEqual(users.length >= 2, true);
    const admin = users.find(u => u.username === 'admin');
    assert.ok(admin);
    assert.strictEqual(admin.role, 'owner');
    // Đảm bảo không lộ hash PIN ra ngoài getUsers()
    assert.strictEqual(admin.pin, undefined);
  });

  // Test 2: Xác thực mã PIN bảo mật (BM-01)
  await test('Xác thực mã PIN mặc định 1234 của admin (BM-01)', async () => {
    const user = db.authenticateUser('1234');
    assert.strictEqual(user.username, 'admin');
    assert.strictEqual(user.role, 'owner');
  });

  // Test 3: Báo lỗi khi nhập sai mã PIN
  await test('Từ chối khi mã PIN sai', async () => {
    assert.throws(() => {
      db.authenticateUser('9999');
    }, /Mã PIN không chính xác/);
  });

  // Test 4: verifyOwnerPin chính xác
  await test('verifyOwnerPin phân biệt đúng Owner vs Staff', async () => {
    assert.strictEqual(db.verifyOwnerPin('1234'), true);
    assert.strictEqual(db.verifyOwnerPin('0000'), false);
    assert.strictEqual(db.verifyOwnerPin('9999'), false);
  });

  // Test 5: Tạo nhân viên mới và tự động băm PIN
  let newStaffId = null;
  await test('Tạo nhân viên mới và kiểm tra băm PIN', async () => {
    const newUser = db.createUser({
      username: 'nhanvien2',
      name: 'Nguyễn Văn B',
      role: 'staff',
      pin: '5678',
      phone: '0912345678'
    });
    assert.ok(newUser.id);
    newStaffId = newUser.id;

    // Phải xác thực được bằng PIN mới 5678
    const auth = db.authenticateUser('5678');
    assert.strictEqual(auth.username, 'nhanvien2');

    // Kiểm tra trực tiếp trong DB xem PIN đã được băm scrypt chưa
    const rawInDb = db._get('SELECT pin FROM users WHERE id = ?', [newStaffId]);
    assert.ok(rawInDb.pin.startsWith('scrypt:'));
  });

  // Test 6: Cập nhật nhân viên mà không đổi PIN vẫn giữ nguyên PIN cũ
  await test('Cập nhật nhân viên không truyền PIN vẫn giữ nguyên PIN cũ', async () => {
    db.updateUser(newStaffId, { name: 'Nguyễn Văn B (Đã sửa)' });
    const auth = db.authenticateUser('5678');
    assert.strictEqual(auth.name, 'Nguyễn Văn B (Đã sửa)');
  });

  // Test 7: Thêm sản phẩm và tìm kiếm theo barcode
  let prodId = null;
  await test('Thêm sản phẩm mới và tìm theo barcode', async () => {
    const prod = db.addProduct({
      sku: 'SP001',
      barcode: '8936036010011',
      name: 'Nước Tăng Lực Sting Dâu 330ml',
      price: 12000,
      cost_price: 9000,
      stock: 50,
      unit: 'lon'
    });
    assert.ok(prod.id);
    prodId = prod.id;

    const found = db.getProductByBarcode('8936036010011');
    assert.ok(found);
    assert.strictEqual(found.name, 'Nước Tăng Lực Sting Dâu 330ml');
    assert.strictEqual(found.stock, 50);
  });

  // Test 8: BM-03 Chặn tên field bất hợp pháp trong updateProduct
  await test('BM-03 Chặn tên trường độc hại trong updateProduct', async () => {
    assert.throws(() => {
      db.updateProduct(prodId, { 'price = 0; DROP TABLE products; --': 123 });
    });
  });

  // Test 9: Tạo đơn hàng và tự động trừ tồn kho (HN-01 debounced save)
  let orderId = null;
  await test('Tạo đơn hàng POS và trừ tồn kho chính xác', async () => {
    const orderData = {
      subtotal: 24000,
      discount_amount: 0,
      total: 24000,
      payment_method: 'cash',
      amount_paid: 30000,
      change_amount: 6000,
      items: [
        {
          product_id: prodId,
          product_name: 'Nước Tăng Lực Sting Dâu 330ml',
          quantity: 2,
          price: 12000,
          subtotal: 24000
        }
      ]
    };

    const created = db.createOrder(orderData);
    assert.ok(created.id);
    orderId = created.id;

    // Kiểm tra tồn kho đã bị trừ 2 lon (50 - 2 = 48)
    const updatedProd = db.getProduct(prodId);
    assert.strictEqual(updatedProd.stock, 48);
  });

  // Test 10: Hủy đơn hàng và hoàn trả tồn kho
  await test('Hủy đơn hàng và hoàn trả tồn kho chính xác', async () => {
    db.cancelOrder(orderId);

    // Kiểm tra đơn hàng đã hủy
    const order = db.getOrder(orderId);
    assert.strictEqual(order.status, 'cancelled');

    // Kiểm tra tồn kho đã được hoàn lại 50
    const restoredProd = db.getProduct(prodId);
    assert.strictEqual(restoredProd.stock, 50);
  });

  // Test 11: Đổi trả hàng và hoàn lại tồn kho
  await test('Quy trình đổi trả hàng (Order Return) và cập nhật tồn kho', async () => {
    // Tạo đơn hàng mới để test đổi trả
    const order = db.createOrder({
      subtotal: 36000,
      total: 36000,
      payment_method: 'cash',
      items: [
        {
          product_id: prodId,
          product_name: 'Nước Tăng Lực Sting Dâu 330ml',
          quantity: 3,
          price: 12000,
          subtotal: 36000
        }
      ]
    });
    // Tồn kho giảm từ 50 xuống 47
    assert.strictEqual(db.getProduct(prodId).stock, 47);

    // Lấy item id
    const fullOrder = db.getOrder(order.id);
    const itemId = fullOrder.items[0].id;

    // Trả 1 lon
    const returnRes = db.processOrderReturn({
      order_id: order.id,
      reason: 'Khách đổi ý',
      refund_amount: 12000,
      refund_method: 'cash',
      items: [
        {
          order_item_id: itemId,
          product_id: prodId,
          quantity: 1,
          refund_price: 12000,
          condition: 'good'
        }
      ]
    });
    assert.ok(returnRes.id);

    // Tồn kho được hoàn lại 1 lon -> 48
    assert.strictEqual(db.getProduct(prodId).stock, 48);
  });

  // Test 12: Quản lý danh mục (Categories CRUD)
  let catId = null;
  await test('Quản lý danh mục sản phẩm', async () => {
    const cat = db.addCategory({ name: 'Nước Giải Khát', icon: '🥤', color: '#0066cc' });
    assert.ok(cat.id);
    catId = cat.id;

    const allCats = db.getCategories();
    assert.ok(allCats.some(c => c.id === catId));

    db.updateCategory(catId, { name: 'Đồ Uống & Nước Giải Khát' });
    const updatedCat = db.getCategories().find(c => c.id === catId);
    assert.strictEqual(updatedCat.name, 'Đồ Uống & Nước Giải Khát');
  });

  // Test 13: Thiết lập hạng thành viên (Member Tiers)
  await test('Lưu và đọc cấu hình hạng thành viên', async () => {
    const defaultTiers = db.getMemberTiers();
    assert.strictEqual(Array.isArray(defaultTiers), true);
    assert.strictEqual(defaultTiers.length >= 4, true);

    const customTiers = [
      { id: 'standard', name: 'Thành Viên', min_spent: 0, discount_percent: 0 },
      { id: 'vip', name: 'VIP Vàng', min_spent: 3000000, discount_percent: 8 }
    ];
    db.saveMemberTiers(customTiers);
    const readTiers = db.getMemberTiers();
    assert.strictEqual(readTiers.length, 2);
    assert.strictEqual(readTiers[1].name, 'VIP Vàng');
  });

  // Test 14: Tự động di chuyển (Migration) PIN dạng plaintext cũ sang scrypt
  await test('Di chuyển tự động mã PIN plaintext sang scrypt an toàn', async () => {
    // Giả lập trực tiếp một user cũ có mã PIN dạng plaintext
    db._run(`
      INSERT INTO users (username, name, role, pin, phone, status)
      VALUES ('legacy_user', 'Nhân Viên Cũ', 'staff', '4321', '0987654321', 'active')
    `);
    const legacyUser = db._get("SELECT id, pin FROM users WHERE username = 'legacy_user'");
    assert.strictEqual(legacyUser.pin, '4321');

    // Chạy lại logic migration tự động (giống như khi DB khởi động)
    const allUsers = db._all("SELECT id, pin FROM users");
    for (const u of allUsers) {
      if (u.pin && !u.pin.startsWith('scrypt:')) {
        const hashed = db._hashPin(u.pin);
        db._run("UPDATE users SET pin = ? WHERE id = ?", [hashed, u.id]);
      }
    }

    // Xác nhận trong database mã PIN đã được hash scrypt
    const migratedUser = db._get("SELECT id, pin FROM users WHERE username = 'legacy_user'");
    assert.ok(migratedUser.pin.startsWith('scrypt:'));

    // Xác thực người dùng bằng mã PIN gốc vẫn hoạt động bình thường!
    const auth = db.authenticateUser('4321');
    assert.strictEqual(auth.username, 'legacy_user');
  });

  // Test 15: db.flush() thực thi an toàn
  await test('db.flush() lưu dữ liệu an toàn', async () => {
    db.flush();
    assert.ok(true);
  });

  // Test 16: batchUpsertProducts (SP-01)
  await test('batchUpsertProducts thêm mới và cập nhật sản phẩm từ Excel thành công', async () => {
    const importItems = [
      {
        sku: 'EXCEL_01',
        barcode: '893000000001',
        name: 'Sản phẩm Excel 1',
        category_name: 'Bánh Mì',
        price: 25000,
        cost_price: 18000,
        stock: 40
      },
      {
        sku: 'EXCEL_02',
        barcode: '893000000002',
        name: 'Sản phẩm Excel 2',
        category_name: 'Đồ Uống',
        price: 15000,
        cost_price: 10000,
        stock: 80
      }
    ];

    const res1 = db.batchUpsertProducts(importItems, true);
    assert.strictEqual(res1.inserted, 2);
    assert.strictEqual(res1.updated, 0);

    // Kiểm tra danh mục mới 'Bánh Mì' đã tự động được tạo
    const p1 = db.getProductByBarcode('893000000001');
    assert.ok(p1);
    assert.strictEqual(p1.name, 'Sản phẩm Excel 1');
    assert.strictEqual(p1.category_name, 'Bánh Mì');
    assert.strictEqual(p1.price, 25000);

    // Cập nhật giá sản phẩm 1 qua batchUpsert
    const updateItems = [
      {
        barcode: '893000000001',
        name: 'Sản phẩm Excel 1 (Mới)',
        price: 28000,
        stock: 55
      }
    ];
    const res2 = db.batchUpsertProducts(updateItems, true);
    assert.strictEqual(res2.inserted, 0);
    assert.strictEqual(res2.updated, 1);

    const p1Updated = db.getProductByBarcode('893000000001');
    assert.strictEqual(p1Updated.price, 28000);
    assert.strictEqual(p1Updated.stock, 55);
  });

  // Test 17: Cấu hình tài khoản ngân hàng VietQR (POS-04)
  await test('Cấu hình và truy xuất cài đặt ngân hàng VietQR', async () => {
    db.setSetting('bank_bin', '970422');
    db.setSetting('bank_account_no', '0987654321');
    db.setSetting('bank_account_name', 'NGUYEN VAN A');
    db.setSetting('bank_template', 'HD {code}');

    assert.strictEqual(db.getSetting('bank_bin'), '970422');
    assert.strictEqual(db.getSetting('bank_account_no'), '0987654321');
    assert.strictEqual(db.getSetting('bank_account_name'), 'NGUYEN VAN A');
    assert.strictEqual(db.getSetting('bank_template'), 'HD {code}');
  });

  // Test 18: Quản lý ca làm việc & Két tiền (F1: Shift Management)
  await test('Quản lý ca làm việc: Mở ca, tính dự kiến tiền mặt trong két và chốt ca', async () => {
    // 1. Mở ca với 1.000.000đ tiền đầu ca
    const shift = db.openShift({
      userId: 1,
      staffName: 'Chủ Cửa Hàng',
      initialCash: 1000000,
      note: 'Ca sáng mở hàng'
    });
    assert.ok(shift.id);
    assert.strictEqual(shift.status, 'open');
    assert.strictEqual(shift.initial_cash, 1000000);

    // Kiểm tra không cho mở thêm ca khi ca cũ chưa đóng
    assert.throws(() => {
      db.openShift({ userId: 1, initialCash: 500000 });
    }, /chưa đóng/);

    // 2. Thêm 1 phiếu chi tiền mặt 100.000đ trong ca
    db.addCashFlow({
      type: 'expense',
      category: 'Tiền đá lạnh',
      amount: 100000,
      userId: 1,
      shiftId: shift.id,
      note: 'Mua đá'
    });

    // 3. Lấy báo cáo ca: Tiền dự kiến = 1.000.000 (đầu ca) - 100.000 (chi) = 900.000đ
    const summary = db.getShiftSummary(shift.id);
    assert.strictEqual(summary.initial_cash, 1000000);
    assert.strictEqual(summary.cash_out, 100000);
    assert.strictEqual(summary.expected_cash, 900000);

    // 4. Chốt ca với 900.000đ tiền thực tế -> Chênh lệch = 0
    const closed = db.closeShift(shift.id, {
      actualCash: 900000,
      note: 'Chốt ca đủ tiền 100%'
    });
    assert.strictEqual(closed.status, 'closed');
    assert.strictEqual(closed.actual_cash, 900000);
    assert.strictEqual(closed.difference, 0);

    // Sau khi đóng ca, getCurrentShift trả về null
    assert.strictEqual(db.getCurrentShift(1), null);
  });

  // Test 19: Sổ quỹ thu chi tiền mặt (F2: Cash Flow)
  await test('Sổ quỹ thu chi: Thêm phiếu thu/chi và tổng hợp quỹ ròng', async () => {
    db.addCashFlow({ type: 'income', category: 'Thu nợ', amount: 500000, note: 'Khách A trả nợ' });
    db.addCashFlow({ type: 'expense', category: 'Tiền điện', amount: 200000, note: 'Điện nước tháng 9' });

    const summary = db.getCashFlowSummary();
    assert.ok(summary.total_income >= 500000);
    assert.ok(summary.total_expense >= 200000);
    assert.strictEqual(summary.net_cash, summary.total_income - summary.total_expense);
  });

  // Test 20: AI Assistant & Phân tích ABC Pareto (F5: Smart Business Analytics)
  await test('Trợ lý AI: Phân tích ABC (Pareto 80/20) và dự báo tồn kho', async () => {
    const abc = db.getABCProductAnalysis();
    assert.ok(Array.isArray(abc));
    assert.ok(abc.length > 0);

    const first = abc[0];
    assert.ok(['A', 'B', 'C'].includes(first.abc_category));
    assert.ok(typeof first.cumulative_percent === 'number');
    assert.ok(typeof first.days_of_stock === 'number');
    assert.ok(typeof first.ai_recommendation === 'string' && first.ai_recommendation.length > 0);
  });

  db.close();

  console.log('\n===========================================');
  console.log(`KẾT QUẢ KIỂM THỬ: ${passed} PASS, ${failed} FAIL`);
  console.log('===========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Lỗi chạy bộ kiểm thử:', err);
  process.exit(1);
});
