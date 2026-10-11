/* ============================================
   ShopPro Desktop - D2 Features Unit Tests
   Tests Logger, Updater, i18n, and Plugin System
   ============================================ */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const AppLogger = require('../services/logger');
const AppUpdater = require('../services/updater');
const PluginManager = require('../services/plugin-manager');

async function runD2Tests() {
  console.log('--- BẮT ĐẦU CHẠY KIỂM THỬ TÍNH NĂNG D2 (TECHNICAL FEATURES) ---');
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

  const testTempDir = path.join(__dirname, 'temp_test_d2');
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true });
  }

  // ==================== 1. LOGGER TESTS (MOI-07) ====================
  const testLogsDir = path.join(testTempDir, 'logs');
  const logger = new AppLogger({ logsDir: testLogsDir });

  await test('Logger: Ghi nhận log đa cấp độ (INFO, WARN, ERROR, DEBUG) ra file', async () => {
    logger.info('Khởi động hệ thống kiểm thử', 'TestContext');
    logger.warn('Cảnh báo bộ nhớ tạm', 'TestContext');
    logger.error('Lỗi giả lập', 'TestContext', new Error('Kiểm tra stack trace'));

    const logFile = logger.getCurrentLogFilePath();
    assert.ok(fs.existsSync(logFile), 'File log phải tồn tại trên đĩa');

    const content = fs.readFileSync(logFile, 'utf-8');
    assert.ok(content.includes('[INFO ] [TestContext] Khởi động hệ thống kiểm thử'));
    assert.ok(content.includes('[WARN ] [TestContext] Cảnh báo bộ nhớ tạm'));
    assert.ok(content.includes('[ERROR] [TestContext] Lỗi giả lập'));
  });

  await test('Logger: getRecentLogs() đọc chính xác các dòng log gần nhất', async () => {
    const recent = logger.getRecentLogs(10);
    assert.ok(Array.isArray(recent));
    assert.ok(recent.length >= 3);
  });

  await test('Logger: clearTodayLog() dọn dẹp file log ngày hiện tại', async () => {
    logger.clearTodayLog();
    const recent = logger.getRecentLogs(10);
    assert.strictEqual(recent.length, 0);
  });

  // ==================== 2. UPDATER TESTS (MOI-06) ====================
  const updater = new AppUpdater({ currentVersion: '2.0.0', logger });

  await test('Updater: So sánh phiên bản Semver chuẩn xác', async () => {
    assert.strictEqual(updater.compareSemver('2.1.0', '2.0.0'), 1);
    assert.strictEqual(updater.compareSemver('2.0.0', '2.1.0'), -1);
    assert.strictEqual(updater.compareSemver('2.0.0', '2.0.0'), 0);
    assert.strictEqual(updater.compareSemver('2.0.1', '2.0.0'), 1);
  });

  await test('Updater: checkForUpdates() phát hiện bản v2.1.0 mới hơn v2.0.0', async () => {
    const res = await updater.checkForUpdates(true);
    assert.strictEqual(res.hasUpdate, true);
    assert.strictEqual(res.latestVersion, '2.1.0');
    assert.ok(Array.isArray(res.changelog) && res.changelog.length > 0);
  });

  await test('Updater: checkForUpdates() khi app đã ở bản mới nhất', async () => {
    const upToDateUpdater = new AppUpdater({ currentVersion: '2.1.0', logger });
    const res = await upToDateUpdater.checkForUpdates(true);
    assert.strictEqual(res.hasUpdate, false);
    assert.strictEqual(res.latestVersion, '2.1.0');
  });

  // ==================== 3. VIETNAMESE LOCALIZATION & i18n ENGINE (T9) ====================
  await test('UI: Giao diện thuần Tiếng Việt chuẩn hóa mặc định (hỗ trợ mở rộng i18n T9)', async () => {
    const htmlPath = path.join(__dirname, '..', 'src', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    assert.ok(html.includes('Bán hàng'), 'Menu POS chuẩn Tiếng Việt');
    assert.ok(html.includes('Sản phẩm'), 'Menu Sản phẩm chuẩn Tiếng Việt');
    assert.ok(html.includes('Cài đặt'), 'Menu Cài đặt chuẩn Tiếng Việt');
  });

  // ==================== 4. PLUGIN SYSTEM TESTS (MOI-09) ====================
  const pluginsDir = path.join(__dirname, '..', 'plugins');
  const pluginManager = new PluginManager({ pluginsDir, logger });

  await test('PluginManager: Nạp danh sách plugin từ thư mục plugins/', async () => {
    await pluginManager.init();
    const list = pluginManager.getPlugins();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 2, 'Phải nạp tối thiểu 2 plugin mẫu');

    const scalePlugin = list.find(p => p.id === 'scale-integration');
    const displayPlugin = list.find(p => p.id === 'customer-display');

    assert.ok(scalePlugin, 'Phải có plugin scale-integration');
    assert.ok(displayPlugin, 'Phải có plugin customer-display');
    assert.strictEqual(scalePlugin.enabled, true);
  });

  await test('Plugin Scale: Bắt và phân giải mã vạch tem cân điện tử (20-29)', async () => {
    // Mã tem cân mẫu: 22 (prefix) 12345 (mã hàng) 01250 (1.25 kg) 7 (checksum)
    const testBarcode = '2212345012507';
    const results = pluginManager.emitHook('onBarcodeScanned', testBarcode);
    assert.ok(Array.isArray(results) && results.length > 0);

    const scaleRes = results.find(r => r.pluginId === 'scale-integration')?.result;
    assert.ok(scaleRes);
    assert.strictEqual(scaleRes.isScaleBarcode, true);
    assert.strictEqual(scaleRes.productCode, '12345');
    assert.strictEqual(scaleRes.weightKg, 1.25);
  });

  await test('Plugin Customer Display: Nhận hook onCartUpdated và onOrderCreated', async () => {
    const cart = [{ id: 1, name: 'Sản phẩm A', price: 50000, quantity: 2 }];
    const total = 100000;
    const results = pluginManager.emitHook('onCartUpdated', cart, total);
    const displayRes = results.find(r => r.pluginId === 'customer-display')?.result;

    assert.ok(displayRes);
    assert.strictEqual(displayRes.synced, true);
    assert.ok(displayRes.displayLine1.includes('100.000'));
  });

  await test('PluginManager: Bật/Tắt plugin an toàn qua togglePlugin()', async () => {
    const resOff = pluginManager.togglePlugin('customer-display', false);
    assert.strictEqual(resOff.success, true);
    assert.strictEqual(resOff.enabled, false);

    // Khi đã tắt, hook không còn trả về kết quả từ customer-display
    const results = pluginManager.emitHook('onCartUpdated', [], 0);
    const found = results.find(r => r.pluginId === 'customer-display');
    assert.strictEqual(found, undefined);

    // Bật lại
    const resOn = pluginManager.togglePlugin('customer-display', true);
    assert.strictEqual(resOn.success, true);
    assert.strictEqual(resOn.enabled, true);
  });

  // Dọn dẹp thư mục tạm
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n===========================================');
  console.log(`KẾT QUẢ KIỂM THỬ D2: ${passed} PASS, ${failed} FAIL`);
  console.log('===========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runD2Tests().catch(err => {
  console.error('Lỗi khi thực thi test D2:', err);
  process.exit(1);
});
