/* ============================================
   ShopPro Desktop - Settings Module
   ============================================ */

(() => {
  let settings = {};

  function render() {
    return `
      <div class="page-header">
        <h1>⚙️ Cài Đặt</h1>
        <div class="page-header-actions">
          <button class="btn btn-primary" onclick="pageModules.settings.saveAll()">
            💾 Lưu Cài Đặt
          </button>
        </div>
      </div>

      <div class="page-content">
        <div class="grid grid-2 gap-xl">
          <!-- Left column -->
          <div>
            <!-- Theme Color Section -->
            <div class="settings-section">
              <div class="flex justify-between items-center mb-sm">
                <h3>🎨 Giao Diện & Màu Sắc Hệ Thống</h3>
                <button type="button" class="btn btn-outline btn-sm" onclick="pageModules.settings.resetDefaultTheme()" title="Khôi phục màu mặc định">
                  ↺ Mặc định
                </button>
              </div>
              <p class="text-secondary mb-md" style="font-size:12.5px;">
                Tùy chọn bảng màu phong cách hoặc chọn mã màu riêng. Toàn bộ ứng dụng (thanh bên, tiêu đề, nút thanh toán, tab hóa đơn...) sẽ đổi màu tức thì.
              </p>

              <!-- Theme Mode Toggle -->
              <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label" style="margin-bottom:8px;">CHẾ ĐỘ HIỂN THỊ (GIAO DIỆN SÁNG / TỐI)</label>
                <div style="display:flex; gap:10px;">
                  <button type="button" class="btn btn-sm ${typeof getThemeMode === 'function' && getThemeMode() === 'light' ? 'btn-primary' : 'btn-outline'}" id="btnThemeModeLight" onclick="pageModules.settings.setMode('light')">
                    ☀️ Chế độ Sáng
                  </button>
                  <button type="button" class="btn btn-sm ${typeof getThemeMode === 'function' && getThemeMode() === 'dark' ? 'btn-primary' : 'btn-outline'}" id="btnThemeModeDark" onclick="pageModules.settings.setMode('dark')">
                    🌙 Chế độ Tối (Dark Mode)
                  </button>
                </div>
              </div>

              <!-- Color Swatches Grid -->
              <label class="form-label" style="margin-bottom:8px;">BẢNG MÀU PHỔ BIẾN</label>
              <div class="theme-palettes-grid" id="themePalettesGrid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; margin-bottom:14px;">
                <!-- Rendered dynamically -->
              </div>

              <!-- Custom Color Input -->
              <div class="form-group" style="margin-top:10px;">
                <label class="form-label">TÙY CHỈNH MÃ MÀU RIÊNG (CUSTOM COLOR)</label>
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="color" id="sThemeColorPicker" value="#364e68" style="width:48px; height:36px; border:1px solid var(--border); border-radius:6px; cursor:pointer; padding:2px; background:var(--bg-card);" oninput="pageModules.settings.onCustomColorInput(this.value)">
                  <input type="text" class="form-control" id="sThemeColorHex" maxlength="7" placeholder="#364e68" style="width:110px; font-family:monospace; font-weight:700; text-transform:uppercase;" onchange="pageModules.settings.onHexInputChange(this.value)">
                  <span class="text-secondary" style="font-size:12px;" id="themeColorStatus">Đang dùng: <strong>#364e68</strong></span>
                </div>
              </div>
            </div>

            <!-- Shop Info -->
            <div class="settings-section">
              <h3>🏪 Thông Tin Cửa Hàng</h3>
              <div class="form-group">
                <label class="form-label">TÊN CỬA HÀNG</label>
                <input type="text" class="form-control" id="sShopName" placeholder="Shop">
              </div>
              <div class="form-group">
                <label class="form-label">ĐỊA CHỈ</label>
                <input type="text" class="form-control" id="sShopAddress" placeholder="123 Đường ABC, Quận XYZ">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">SỐ ĐIỆN THOẠI</label>
                  <input type="tel" class="form-control" id="sShopPhone" placeholder="0901234567">
                </div>
                <div class="form-group">
                  <label class="form-label">EMAIL</label>
                  <input type="email" class="form-control" id="sShopEmail" placeholder="shop@email.com">
                </div>
              </div>
            </div>

            <!-- Tax -->
            <div class="settings-section">
              <h3>💰 Thuế & Giá</h3>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">BẬT THUẾ VAT</label>
                  <select class="form-control" id="sTaxEnabled">
                    <option value="false">Không</option>
                    <option value="true">Có</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">THUẾ SUẤT (%)</label>
                  <input type="number" class="form-control" id="sTaxRate" min="0" max="100" placeholder="10">
                </div>
              </div>
            </div>

            <!-- Orders -->
            <div class="settings-section">
              <h3>📋 Đơn Hàng</h3>
              <div class="form-group">
                <label class="form-label">TIỀN TỐ MÃ ĐƠN HÀNG</label>
                <input type="text" class="form-control" id="sOrderPrefix" placeholder="HD" style="max-width:120px;">
                <div class="form-help">VD: HD → HD260914-0001</div>
              </div>
            </div>

            <!-- Bank & VietQR -->
            <div class="settings-section">
              <div class="flex justify-between items-center mb-sm">
                <h3>🏦 Tài Khoản Ngân Hàng & Mã QR Thanh Toán</h3>
                <span class="badge badge-info" style="font-size:11px;">NAPAS 247</span>
              </div>
              <p class="text-secondary mb-md" style="font-size:12px;">
                Tải lên ảnh mã QR chuyển khoản hoặc cài đặt số tài khoản. Khi thu ngân bấm "Mã VietQR" tại POS, khách chỉ cần quét mã này là thanh toán được ngay!
              </p>

              <!-- QR Image Upload Box -->
              <div class="form-group mb-md" style="background:var(--bg-secondary); padding:14px; border-radius:10px; border:1px solid var(--border);">
                <label class="form-label" style="margin-bottom:8px; font-weight:700;">📸 ẢNH MÃ QR NGÂN HÀNG (QUÉT CHUYỂN KHOẢN)</label>
                <div style="display:flex; gap:16px; align-items:center;">
                  <div id="bankQrPreviewContainer" style="width:110px; height:140px; border:2px dashed var(--border); border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden; background:var(--bg-card); position:relative; flex-shrink:0;">
                    <img id="bankQrPreview" src="images/bank_qr.png" alt="Mã QR" style="width:100%; height:100%; object-fit:contain; display:block;" onerror="this.style.display='none'; const ph = document.getElementById('bankQrPlaceholder'); if(ph) ph.style.display='flex';">
                    <div id="bankQrPlaceholder" style="display:none; flex-direction:column; align-items:center; color:var(--text-secondary); font-size:11px; text-align:center; padding:6px;">
                      <span style="font-size:24px;">📱</span>
                      <span>Chưa có ảnh QR</span>
                    </div>
                  </div>
                  <div style="flex:1;">
                    <input type="file" id="sBankQrFileInput" accept="image/*" style="display:none;" onchange="pageModules.settings && pageModules.settings.onBankQrFileSelected(event)">
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                      <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('sBankQrFileInput').click()">
                        📁 Chọn ảnh mã QR từ máy tính
                      </button>
                      <button type="button" class="btn btn-outline btn-sm text-danger" id="btnRemoveBankQr" onclick="pageModules.settings && pageModules.settings.removeBankQrImage()">
                        🗑️ Xóa ảnh QR
                      </button>
                    </div>
                    <div class="text-secondary" style="font-size:11.5px; line-height:1.4;">
                      Khuyên dùng: Chọn ảnh chụp màn hình mã QR từ app ngân hàng (TPBank, Vietcombank, MB...). Hệ thống sẽ hiển thị mã này tại màn hình thanh toán POS.
                    </div>
                  </div>
                </div>
                <input type="hidden" id="sBankQrImage" value="images/bank_qr.png">
              </div>

              <!-- Bank details -->
              <div class="form-group mb-md">
                <label class="form-label">NGÂN HÀNG THỤ HƯỞNG</label>
                <select class="form-control" id="sBankBin">
                  <option value="">-- Chưa kích hoạt VietQR --</option>
                  <option value="970423">TPBank (Tiên Phong)</option>
                  <option value="970436">Vietcombank (VCB)</option>
                  <option value="970422">MBBank (Quân Đội)</option>
                  <option value="970407">Techcombank (TCB)</option>
                  <option value="970416">ACB (Á Châu)</option>
                  <option value="970418">BIDV (Đầu Tư & Phát Triển)</option>
                  <option value="970415">VietinBank (Công Thương)</option>
                  <option value="970454">VPBank (Việt Nam Thịnh Vượng)</option>
                  <option value="970405">Agribank (Nông Nghiệp)</option>
                  <option value="970403">Sacombank</option>
                  <option value="970441">VIB (Quốc Tế)</option>
                  <option value="546034">Cake by VPBank</option>
                  <option value="963388">Timo by BVBank</option>
                  <option value="970448">OCB (Phương Đông)</option>
                  <option value="970432">VPBank / VPB</option>
                  <option value="970437">HDBank</option>
                  <option value="970428">Nam A Bank</option>
                  <option value="970443">SHB (Sài Gòn - Hà Nội)</option>
                  <option value="970431">Eximbank</option>
                  <option value="970429">SCB (Sài Gòn)</option>
                </select>
              </div>
              <div class="form-row mb-md">
                <div class="form-group">
                  <label class="form-label">SỐ TÀI KHOẢN (STK)</label>
                  <input type="text" class="form-control" id="sBankAccountNo" placeholder="VD: 03793104801">
                </div>
                <div class="form-group">
                  <label class="form-label">TÊN CHỦ TÀI KHOẢN (IN HOA)</label>
                  <input type="text" class="form-control" id="sBankAccountName" placeholder="VD: TA TRUNG HIEU" style="text-transform:uppercase;">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">CÚ PHÁP NỘI DUNG CHUYỂN KHOẢN</label>
                <input type="text" class="form-control" id="sBankTemplate" placeholder="HD {code}" value="HD {code}">
                <div class="form-help">{code} sẽ tự động điền mã hóa đơn thanh toán</div>
              </div>
            </div>
          </div>

          <!-- Right column -->
          <div>
            <!-- Receipt -->
            <div class="settings-section">
              <h3>🖨️ Hóa Đơn</h3>
              <div class="form-group">
                <label class="form-label">ĐỘ RỘNG GIẤY (mm)</label>
                <select class="form-control" id="sReceiptWidth">
                  <option value="58">58mm (K57)</option>
                  <option value="80">80mm (K80)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">CHÂN TRANG HÓA ĐƠN</label>
                <input type="text" class="form-control" id="sReceiptFooter" placeholder="Cảm ơn quý khách!">
              </div>
              <div class="form-group">
                <label class="form-label">TỰ ĐỘNG IN SAU BÁN</label>
                <select class="form-control" id="sAutoPrint">
                  <option value="false">Không</option>
                  <option value="true">Có</option>
                </select>
              </div>
            </div>

            <!-- Scanner -->
            <div class="settings-section">
              <h3>📱 Scanner (Quét mã từ điện thoại)</h3>
              <div class="form-group">
                <label class="form-label">CỔNG WEBSOCKET</label>
                <input type="number" class="form-control" id="sScannerPort" placeholder="8765" style="max-width:120px;">
                <div class="form-help">Cần khởi động lại app nếu thay đổi</div>
              </div>
              <div class="card" style="margin-top:var(--space-lg); padding:var(--space-lg);">
                <div class="flex items-center gap-md mb-md">
                  <span id="ssScannerDot" class="status-dot offline"></span>
                  <span id="ssScannerInfo" class="text-secondary" style="font-size:13px;">Đang kiểm tra...</span>
                </div>
                <div id="ssScannerUrl" class="text-muted" style="font-size:12px;"></div>
                <div class="mt-md text-muted" style="font-size:12px;">
                  <strong>Hướng dẫn kết nối:</strong>
                  <ol style="padding-left:16px; margin-top:4px; line-height:1.8;">
                    <li>Đảm bảo điện thoại và máy tính cùng mạng WiFi</li>
                    <li>Mở trình duyệt trên điện thoại</li>
                    <li>Nhập URL hiển thị bên trên</li>
                    <li>Nhấn "Bắt đầu quét" trên điện thoại</li>
                  </ol>
                </div>
              </div>
            </div>

            <!-- Backup -->
            <div class="settings-section">
              <h3>💾 Sao Lưu & Phục Hồi</h3>
              <div class="flex gap-md">
                <button class="btn btn-outline" onclick="pageModules.settings.doBackup()" style="flex:1;">
                  ${ICONS.download} Sao lưu
                </button>
                <button class="btn btn-warning" onclick="pageModules.settings.doRestore()" style="flex:1;">
                  ${ICONS.upload} Phục hồi
                </button>
              </div>
              <div class="form-help mt-md">Sao lưu toàn bộ database (sản phẩm, đơn hàng, khách hàng...)</div>
            </div>

            <!-- Auto-Update (MOI-06) -->
            <div class="settings-section">
              <div class="flex justify-between items-center mb-sm">
                <h3>🔄 Cập Nhật Phần Mềm (Auto-Update)</h3>
                <span class="badge badge-info" style="font-size:11px;">v2.0.0</span>
              </div>
              <p class="text-secondary mb-md" style="font-size:12px;">
                Kiểm tra các phiên bản phát hành mới để nhận các tính năng và bản vá bảo mật mới nhất.
              </p>
              <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px;">
                <div>
                  <div style="font-weight:700; font-size:13px;">Phiên bản hiện tại: <span class="text-primary">v2.0.0</span></div>
                  <div class="text-secondary" style="font-size:11px;">Kiểm tra tự động khi khởi động</div>
                </div>
                <button type="button" class="btn btn-outline btn-sm" onclick="openUpdateModal(true)">
                  🔍 Kiểm Tra Ngay
                </button>
              </div>
            </div>

            <!-- Logging & Diagnostics (MOI-07) -->
            <div class="settings-section">
              <div class="flex justify-between items-center mb-sm">
                <h3>📋 Nhật Ký Lỗi & Chẩn Đoán (Logging)</h3>
                <div class="flex gap-xs">
                  <button type="button" class="btn btn-ghost btn-sm" onclick="pageModules.settings.loadRecentLogs()" title="Làm mới log">🔄</button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="pageModules.settings.openLogFolder()">📂 Mở thư mục</button>
                </div>
              </div>
              <p class="text-secondary mb-sm" style="font-size:12px;">
                Nhật ký xoay vòng tự động hàng ngày ghi nhận cảnh báo và lỗi giúp hỗ trợ kỹ thuật từ xa.
              </p>
              <div class="log-terminal" id="settingsLogTerminal">Đang tải nhật ký...</div>
              <div class="flex justify-between items-center mt-sm">
                <span class="text-secondary" style="font-size:11px;">Tự động lưu tại: userData/logs</span>
                <button type="button" class="btn btn-ghost btn-sm text-danger" onclick="pageModules.settings.clearTodayLog()" style="font-size:11px;">🗑️ Xóa log hôm nay</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Plugin System (MOI-09) -->
        <div class="settings-section mt-xl">
          <div class="flex justify-between items-center mb-md">
            <div>
              <h3>🔌 Hệ Sinh Thái Plugin & Thiết Bị Ngoại Vi</h3>
              <p class="text-secondary" style="font-size:12px; margin-top:2px;">
                Bật/Tắt các plugin mở rộng kết nối phần cứng (cân điện tử, màn hình phụ khách hàng...)
              </p>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="pageModules.settings.openPluginsFolder()">
              📂 Thư Mục Plugins
            </button>
          </div>
          <div class="plugins-grid" id="settingsPluginsGrid">
            <div class="text-center text-muted" style="padding:20px;">Đang tải danh sách plugin...</div>
          </div>
        </div>

        <!-- Member Tiers settings -->
        <div class="settings-section mt-xl">
          <div class="flex justify-between items-center mb-md">
            <h3>⭐ Cài Đặt Hạng Thành Viên & Chiết Khấu (%)</h3>
            <button class="btn btn-outline btn-sm" onclick="pageModules.settings.addTierRow()">
              + Thêm Hạng
            </button>
          </div>
          <p class="text-secondary mb-md" style="font-size:13px;">
            Hệ thống sẽ tự động xác định hạng của khách hàng dựa trên tổng tiền chi tiêu và áp dụng mức giảm giá % tương ứng tại màn hình POS.
          </p>
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:100px;">Biểu tượng</th>
                  <th>Tên hạng</th>
                  <th>Chi tiêu tối thiểu (VNĐ)</th>
                  <th>Giảm giá (%)</th>
                  <th>Màu sắc</th>
                  <th style="width:70px;">Thao tác</th>
                </tr>
              </thead>
              <tbody id="memberTiersTableBody">
                <tr><td colspan="6" class="text-center text-muted" style="padding:20px;">Đang tải...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Keyboard shortcuts -->
        <div class="settings-section mt-xl">
          <h3>⌨️ Phím Tắt</h3>
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead><tr><th>Phím</th><th>Chức năng</th></tr></thead>
              <tbody>
                <tr><td><span class="kbd">F1</span></td><td>Chuyển sang Bán Hàng (POS)</td></tr>
                <tr><td><span class="kbd">F2</span></td><td>Chuyển sang Sản Phẩm</td></tr>
                <tr><td><span class="kbd">F3</span></td><td>Chuyển sang Đơn Hàng</td></tr>
                <tr><td><span class="kbd">F4</span></td><td>Chuyển sang Khách Hàng</td></tr>
                <tr><td><span class="kbd">F5</span></td><td>Chuyển sang Báo Cáo</td></tr>
                <tr><td><span class="kbd">F9</span></td><td>Thanh toán đơn hàng (POS)</td></tr>
                <tr><td><span class="kbd">F12</span></td><td>Thanh toán & In hóa đơn (POS)</td></tr>
                <tr><td><span class="kbd">Esc</span></td><td>Đóng popup / modal</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Users Management Section -->
        <div class="settings-section mt-xl">
          <div class="flex justify-between items-center mb-md">
            <h3>👥 Quản Lý Tài Khoản Nhân Viên & Phân Quyền</h3>
            <button class="btn btn-primary btn-sm" onclick="pageModules.settings.openAddUserModal()">
              ➕ Thêm Nhân Viên
            </button>
          </div>
          <div class="text-secondary mb-md" style="font-size:12px;">
            Quản lý tài khoản đăng nhập, vai trò (Chủ Cửa Hàng / Thu Ngân) và mã PIN chuyển ca nhanh tại quầy thu ngân.
          </div>
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:40px;"></th>
                  <th>Họ và tên</th>
                  <th>Tài khoản</th>
                  <th>Vai trò</th>
                  <th>Mã PIN</th>
                  <th>Số điện thoại</th>
                  <th>Trạng thái</th>
                  <th style="width:100px;">Thao tác</th>
                </tr>
              </thead>
              <tbody id="usersTableBody">
                <tr><td colspan="8" class="text-center text-muted" style="padding:20px;">Đang tải danh sách nhân viên...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- App info -->
        <div class="settings-section mt-xl">
          <h3>ℹ️ Thông Tin Ứng Dụng</h3>
          <div class="flex gap-xl text-secondary" style="font-size:13px;">
            <div>Phiên bản: <strong>Shop Desktop v2.2</strong></div>
            <div>Database: <strong>SQLite (better-sqlite3 Native)</strong></div>
            <div>Framework: <strong>Electron</strong></div>
          </div>
        </div>
      </div>
    `;
  }

  const THEME_PRESETS = [
    { id: 'slate', name: 'Slate Navy', desc: 'Mặc định hiện đại', hex: '#364e68' },
    { id: 'retail', name: 'Ocean Blue', desc: 'Xanh bán lẻ KiotViet', hex: '#0088cc' },
    { id: 'sapphire', name: 'Royal Sapphire', desc: 'Xanh dương hoàng gia', hex: '#2563eb' },
    { id: 'emerald', name: 'Emerald Green', desc: 'Xanh ngọc lục bảo', hex: '#059669' },
    { id: 'indigo', name: 'Midnight Indigo', desc: 'Tím chàm sang trọng', hex: '#4f46e5' },
    { id: 'burgundy', name: 'Wine Burgundy', desc: 'Đỏ rượu vang', hex: '#881337' },
    { id: 'warm', name: 'Warm Coffee', desc: 'Nâu cafe ấm áp', hex: '#593c28' },
    { id: 'obsidian', name: 'Dark Obsidian', desc: 'Xám than tối giản', hex: '#1e293b' }
  ];

  function renderThemePalettes(currentHex) {
    const grid = document.getElementById('themePalettesGrid');
    if (!grid) return;
    const cur = (currentHex || (typeof getCurrentThemeColor === 'function' ? getCurrentThemeColor() : '#364e68')).toLowerCase();

    grid.innerHTML = THEME_PRESETS.map(preset => {
      const isActive = preset.hex.toLowerCase() === cur;
      return `
        <div class="theme-palette-card ${isActive ? 'active' : ''}" 
             onclick="pageModules.settings.selectThemePreset('${preset.hex}')" 
             title="${preset.name} (${preset.hex})">
          <span class="theme-color-preview" style="background:${preset.hex};"></span>
          <div class="theme-palette-info">
            <span class="theme-palette-name">${preset.name}</span>
            <span class="theme-palette-hex">${preset.hex}</span>
          </div>
          ${isActive ? '<span class="theme-palette-active-check">✓</span>' : ''}
        </div>
      `;
    }).join('');

    const picker = document.getElementById('sThemeColorPicker');
    const hexInput = document.getElementById('sThemeColorHex');
    const statusText = document.getElementById('themeColorStatus');
    if (picker) picker.value = cur;
    if (hexInput) hexInput.value = cur.toUpperCase();
    if (statusText) statusText.innerHTML = `Đang dùng: <strong style="color:var(--accent);">${cur.toUpperCase()}</strong>`;
  }

  function selectThemePreset(hex) {
    if (typeof applyThemeColor === 'function') {
      applyThemeColor(hex, true);
    }
    renderThemePalettes(hex);
    showToast('success', 'Đã đổi màu giao diện', `Màu đang áp dụng: ${hex.toUpperCase()}`);
  }

  function onCustomColorInput(hex) {
    if (typeof applyThemeColor === 'function') {
      applyThemeColor(hex, true);
    }
    renderThemePalettes(hex);
  }

  function onHexInputChange(val) {
    let hex = (val || '').trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9a-fA-F]{6}$/i.test(hex)) {
      if (typeof applyThemeColor === 'function') {
        applyThemeColor(hex, true);
      }
      renderThemePalettes(hex);
      showToast('success', 'Đã đổi màu giao diện', `Màu đang áp dụng: ${hex.toUpperCase()}`);
    } else {
      showToast('warning', 'Mã màu không hợp lệ', 'Vui lòng nhập định dạng #RRGGBB (ví dụ: #364E68)');
      const cur = typeof getCurrentThemeColor === 'function' ? getCurrentThemeColor() : '#364e68';
      const hexInput = document.getElementById('sThemeColorHex');
      if (hexInput) hexInput.value = cur.toUpperCase();
    }
  }

  function resetDefaultTheme() {
    selectThemePreset('#364e68');
  }

  function setMode(mode) {
    if (typeof applyThemeMode === 'function') {
      applyThemeMode(mode, true);
    }
  }

  let memberTiers = [];

  async function init() {
    try {
      settings = await api.getAllSettings();
      fillForm();
      renderThemePalettes(settings.theme_color);
      await loadScannerInfo();
      await loadMemberTiers();
      await loadUsersList();
      await loadRecentLogs();
      await renderPluginsList();
    } catch (err) {
      showToast('error', 'Lỗi tải cài đặt', err.message);
    }
  }

  async function loadMemberTiers() {
    try {
      memberTiers = await api.getMemberTiers();
      if (!Array.isArray(memberTiers) || memberTiers.length === 0) {
        memberTiers = [
          { id: 'bronze', name: 'Đồng', min_spent: 0, discount_percent: 0, color: '#cd7f32', badge: '🥉' },
          { id: 'silver', name: 'Bạc', min_spent: 2000000, discount_percent: 5, color: '#c0c0c0', badge: '🥈' },
          { id: 'gold', name: 'Vàng', min_spent: 5000000, discount_percent: 10, color: '#ffd700', badge: '🥇' },
          { id: 'diamond', name: 'Kim Cương', min_spent: 10000000, discount_percent: 15, color: '#00d4ff', badge: '💎' }
        ];
      }
      renderMemberTiers();
    } catch (err) {
      console.error('Error loading member tiers:', err);
    }
  }

  function renderMemberTiers() {
    const tbody = document.getElementById('memberTiersTableBody');
    if (!tbody) return;

    tbody.innerHTML = memberTiers.map((tier, idx) => `
      <tr>
        <td>
          <input type="text" class="form-control" value="${escapeHtml(tier.badge || '⭐')}" 
                 id="tierBadge_${idx}" style="text-align:center; width:60px;">
        </td>
        <td>
          <input type="text" class="form-control" value="${escapeHtml(tier.name || '')}" 
                 id="tierName_${idx}" placeholder="Tên hạng">
        </td>
        <td>
          <input type="number" class="form-control" value="${tier.min_spent || 0}" 
                 id="tierMinSpent_${idx}" min="0" step="100000">
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" class="form-control" value="${tier.discount_percent || 0}" 
                   id="tierDiscount_${idx}" min="0" max="100" style="width:80px;">
            <span>%</span>
          </div>
        </td>
        <td>
          <input type="color" class="form-control" value="${tier.color || '#cd7f32'}" 
                 id="tierColor_${idx}" style="width:48px; padding:2px; height:36px; cursor:pointer;">
        </td>
        <td>
          <button class="btn btn-ghost btn-icon sm" onclick="pageModules.settings.removeTierRow(${idx})" title="Xóa hạng" style="color:var(--danger);">
            ${ICONS.trash}
          </button>
        </td>
      </tr>
    `).join('');
  }

  function addTierRow() {
    memberTiers.push({
      id: 'tier_' + Date.now(),
      name: 'Hạng mới',
      min_spent: 1000000,
      discount_percent: 5,
      color: '#a855f7',
      badge: '⭐'
    });
    renderMemberTiers();
  }

  function removeTierRow(idx) {
    if (memberTiers.length <= 1) {
      showToast('warning', 'Cảnh báo', 'Cần giữ ít nhất 1 hạng thành viên');
      return;
    }
    memberTiers.splice(idx, 1);
    renderMemberTiers();
  }

  function fillForm() {
    setValue('sShopName', settings.shop_name);
    setValue('sShopAddress', settings.shop_address);
    setValue('sShopPhone', settings.shop_phone);
    setValue('sShopEmail', settings.shop_email);
    setValue('sTaxEnabled', settings.tax_enabled);
    setValue('sTaxRate', settings.tax_rate);
    setValue('sOrderPrefix', settings.order_prefix);
    setValue('sBankBin', settings.bank_bin || '970423');
    setValue('sBankAccountNo', settings.bank_account_no || '03793104801');
    setValue('sBankAccountName', settings.bank_account_name || 'TA TRUNG HIEU');
    setValue('sBankTemplate', settings.bank_template || 'HD {code}');
    setValue('sReceiptWidth', settings.receipt_width);
    setValue('sReceiptFooter', settings.receipt_footer);
    setValue('sAutoPrint', settings.auto_print);
    setValue('sScannerPort', settings.scanner_port);

    const qrImg = settings.bank_qr_image || 'images/bank_qr.png';
    setValue('sBankQrImage', qrImg);
    updateBankQrPreview(qrImg);
  }

  function updateBankQrPreview(src) {
    const preview = document.getElementById('bankQrPreview');
    const placeholder = document.getElementById('bankQrPlaceholder');
    const hidden = document.getElementById('sBankQrImage');
    if (src) {
      if (preview) { preview.src = src; preview.style.display = 'block'; }
      if (placeholder) placeholder.style.display = 'none';
      if (hidden) hidden.value = src;
    } else {
      if (preview) { preview.src = ''; preview.style.display = 'none'; }
      if (placeholder) placeholder.style.display = 'flex';
      if (hidden) hidden.value = '';
    }
  }

  function removeBankQrImage() {
    updateBankQrPreview('');
    showToast('info', 'Đã xóa ảnh QR', 'Hãy nhấn Lưu Cài Đặt để cập nhật');
  }

  function onBankQrFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('warning', 'Không hợp lệ', 'Vui lòng chọn tệp hình ảnh');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const maxDim = 640;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        updateBankQrPreview(compressedDataUrl);
        showToast('success', 'Đã nạp ảnh mã QR', 'Ảnh đã sẵn sàng. Nhấn "Lưu Cài Đặt" để hoàn tất!');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) {
      el.value = value;
    }
  }

  function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  async function saveAll() {
    try {
      const pairs = {
        shop_name: getValue('sShopName'),
        shop_address: getValue('sShopAddress'),
        shop_phone: getValue('sShopPhone'),
        shop_email: getValue('sShopEmail'),
        tax_enabled: getValue('sTaxEnabled'),
        tax_rate: getValue('sTaxRate'),
        order_prefix: getValue('sOrderPrefix'),
        bank_bin: getValue('sBankBin'),
        bank_account_no: getValue('sBankAccountNo'),
        bank_account_name: getValue('sBankAccountName').toUpperCase(),
        bank_template: getValue('sBankTemplate') || 'HD {code}',
        bank_qr_image: getValue('sBankQrImage') || 'images/bank_qr.png',
        receipt_width: getValue('sReceiptWidth'),
        receipt_footer: getValue('sReceiptFooter'),
        auto_print: getValue('sAutoPrint'),
        scanner_port: getValue('sScannerPort'),
        theme_color: getValue('sThemeColorHex') || (typeof getCurrentThemeColor === 'function' ? getCurrentThemeColor() : '#364e68')
      };

      for (const [key, value] of Object.entries(pairs)) {
        await api.setSetting(key, value);
      }

      // Collect member tiers from table
      const updatedTiers = memberTiers.map((t, idx) => {
        const badge = document.getElementById(`tierBadge_${idx}`)?.value.trim() || t.badge || '⭐';
        const name = document.getElementById(`tierName_${idx}`)?.value.trim() || t.name;
        const min_spent = parseFloat(document.getElementById(`tierMinSpent_${idx}`)?.value) || 0;
        const discount_percent = parseFloat(document.getElementById(`tierDiscount_${idx}`)?.value) || 0;
        const color = document.getElementById(`tierColor_${idx}`)?.value || t.color || '#cd7f32';
        return { ...t, badge, name, min_spent, discount_percent, color };
      });

      // Sort tiers ascending by min_spent
      updatedTiers.sort((a, b) => a.min_spent - b.min_spent);
      memberTiers = updatedTiers;
      await api.saveMemberTiers(updatedTiers);
      renderMemberTiers();

      showToast('success', 'Đã lưu cài đặt và hạng thành viên');
    } catch (err) {
      showToast('error', 'Lỗi lưu', err.message);
    }
  }

  async function loadScannerInfo() {
    try {
      const info = await api.getScannerInfo();
      const dotEl = document.getElementById('ssScannerDot');
      const infoEl = document.getElementById('ssScannerInfo');
      const urlEl = document.getElementById('ssScannerUrl');

      if (info && info.running) {
        if (dotEl) dotEl.className = 'status-dot online';
        if (infoEl) infoEl.textContent = `Server đang chạy — ${info.connectedClients} thiết bị kết nối`;
        if (urlEl) urlEl.innerHTML = `
          <strong>URL cho điện thoại:</strong><br>
          <code style="color:var(--cyan); font-size:14px; user-select:all;">http://${info.ip}:${info.port}/?host=${info.ip}&port=${info.port}</code>
        `;
      } else {
        if (dotEl) dotEl.className = 'status-dot offline';
        if (infoEl) infoEl.textContent = 'Server chưa khởi động';
      }
    } catch (err) {
      console.error('Scanner info error:', err);
    }
  }

  async function doBackup() {
    try {
      const result = await api.backup();
      if (result.success) {
        showToast('success', 'Sao lưu thành công', result.path);
      } else if (result.error) {
        showToast('error', 'Lỗi sao lưu', result.error);
      }
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  async function doRestore() {
    if (!confirm('⚠️ Phục hồi sẽ thay thế TOÀN BỘ dữ liệu hiện tại.\n\nBạn có chắc chắn muốn tiếp tục?')) return;

    try {
      const result = await api.restore();
      if (result.success) {
        showToast('success', 'Phục hồi thành công', 'Dữ liệu đã được khôi phục. Trang sẽ tự tải lại.');
        setTimeout(() => window.location.reload(), 1500);
      } else if (result.error) {
        showToast('error', 'Lỗi phục hồi', result.error);
      }
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  // ==================== USER MANAGEMENT ====================
  let usersList = [];

  async function loadUsersList() {
    try {
      usersList = await api.getUsers();
      renderUsersTable();
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!Array.isArray(usersList) || usersList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:20px;">Chưa có tài khoản nào</td></tr>`;
      return;
    }

    tbody.innerHTML = usersList.map(u => `
      <tr>
        <td style="font-size:20px; text-align:center;">${u.role === 'owner' ? '👑' : '🧑‍💼'}</td>
        <td class="fw-600">${escapeHtml(u.name)}</td>
        <td><code>${escapeHtml(u.username)}</code></td>
        <td>
          <span class="badge ${u.role === 'owner' ? 'badge-success' : 'badge-default'}">
            ${u.role === 'owner' ? 'Chủ Shop (Toàn quyền)' : 'Thu Ngân (Bán hàng)'}
          </span>
        </td>
        <td>
          <span style="font-family:monospace; letter-spacing:2px; font-weight:700;">${escapeHtml(u.pin)}</span>
        </td>
        <td class="text-secondary">${escapeHtml(u.phone || '—')}</td>
        <td>
          <span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">
            ${u.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}
          </span>
        </td>
        <td>
          <div class="flex gap-sm">
            <button class="btn btn-ghost btn-icon sm" onclick="pageModules.settings.openEditUserModal(${u.id})" title="Chỉnh sửa">${ICONS.edit}</button>
            ${u.role !== 'owner' || usersList.filter(x => x.role === 'owner').length > 1 ? `
              <button class="btn btn-ghost btn-icon sm" onclick="pageModules.settings.deleteUserAccount(${u.id})" title="Xóa tài khoản" style="color:var(--danger);">${ICONS.trash}</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  function openAddUserModal() {
    showModal(`
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h3>➕ Thêm Tài Khoản Nhân Viên</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group mb-md">
            <label class="form-label">HỌ VÀ TÊN *</label>
            <input type="text" class="form-control" id="uName" placeholder="VD: Nguyễn Văn A" required>
          </div>
          <div class="form-group mb-md">
            <label class="form-label">TÊN ĐĂNG NHẬP (USERNAME) *</label>
            <input type="text" class="form-control" id="uUsername" placeholder="VD: thungan2" required>
          </div>
          <div class="form-row mb-md">
            <div class="form-group">
              <label class="form-label">VAI TRÒ</label>
              <select class="form-control" id="uRole">
                <option value="staff">🧑‍💼 Nhân Viên Thu Ngân</option>
                <option value="owner">👑 Chủ Cửa Hàng (Admin)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">MÃ PIN (4 - 6 SỐ) *</label>
              <input type="text" class="form-control" id="uPin" maxlength="6" placeholder="VD: 1234" value="0000">
            </div>
          </div>
          <div class="form-row mb-md">
            <div class="form-group">
              <label class="form-label">SỐ ĐIỆN THOẠI</label>
              <input type="tel" class="form-control" id="uPhone" placeholder="0901234567">
            </div>
            <div class="form-group">
              <label class="form-label">TRẠNG THÁI</label>
              <select class="form-control" id="uStatus">
                <option value="active">Hoạt động</option>
                <option value="inactive">Tạm khóa</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          <button class="btn btn-primary" onclick="pageModules.settings.saveUserForm()">Lưu Nhân Viên</button>
        </div>
      </div>
    `);
  }

  async function openEditUserModal(id) {
    const user = usersList.find(u => u.id === id);
    if (!user) return;

    showModal(`
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h3>✏️ Sửa Tài Khoản: ${escapeHtml(user.name)}</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group mb-md">
            <label class="form-label">HỌ VÀ TÊN *</label>
            <input type="text" class="form-control" id="uName" value="${escapeHtml(user.name)}" required>
          </div>
          <div class="form-group mb-md">
            <label class="form-label">TÊN ĐĂNG NHẬP *</label>
            <input type="text" class="form-control" id="uUsername" value="${escapeHtml(user.username)}" required>
          </div>
          <div class="form-row mb-md">
            <div class="form-group">
              <label class="form-label">VAI TRÒ</label>
              <select class="form-control" id="uRole">
                <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>🧑‍💼 Nhân Viên Thu Ngân</option>
                <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>👑 Chủ Cửa Hàng (Admin)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">MÃ PIN MỚI (4 - 6 SỐ)</label>
              <input type="password" class="form-control" id="uPin" maxlength="6" placeholder="Để trống nếu giữ nguyên">
            </div>
          </div>
          <div class="form-row mb-md">
            <div class="form-group">
              <label class="form-label">SỐ ĐIỆN THOẠI</label>
              <input type="tel" class="form-control" id="uPhone" value="${escapeHtml(user.phone || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">TRẠNG THÁI</label>
              <select class="form-control" id="uStatus">
                <option value="active" ${user.status === 'active' ? 'selected' : ''}>Hoạt động</option>
                <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Tạm khóa</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          <button class="btn btn-primary" onclick="pageModules.settings.saveUserForm(${user.id})">Cập Nhật</button>
        </div>
      </div>
    `);
  }

  async function saveUserForm(id = null) {
    const name = document.getElementById('uName')?.value?.trim();
    const username = document.getElementById('uUsername')?.value?.trim();
    const role = document.getElementById('uRole')?.value;
    const pin = document.getElementById('uPin')?.value?.trim();
    const phone = document.getElementById('uPhone')?.value?.trim();
    const status = document.getElementById('uStatus')?.value;

    if (!name || !username) {
      showToast('warning', 'Vui lòng điền đủ họ tên và tên đăng nhập');
      return;
    }
    if (!id && !pin) {
      showToast('warning', 'Vui lòng nhập mã PIN khi tạo tài khoản mới');
      return;
    }
    if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
      showToast('warning', 'Mã PIN phải từ 4 đến 6 chữ số');
      return;
    }

    try {
      if (id) {
        const updateData = { name, username, role, phone, status };
        if (pin) updateData.pin = pin;
        await api.updateUser(id, updateData);
        showToast('success', 'Đã cập nhật nhân viên', name);
        if (currentUser && currentUser.id === id) {
          currentUser = { ...currentUser, name, username, role, phone, status };
          sessionStorage.setItem('shoppro_user', JSON.stringify(currentUser));
          if (localStorage.getItem('shoppro_user_remembered')) {
            localStorage.setItem('shoppro_user_remembered', JSON.stringify(currentUser));
          }
          updateUserUI();
        }
      } else {
        await api.createUser({ name, username, role, pin: pin || '0000', phone, status });
        showToast('success', 'Đã thêm nhân viên mới', name);
      }
      closeModal();
      await loadUsersList();
    } catch (err) {
      showToast('error', 'Lỗi lưu nhân viên', err.message);
    }
  }

  async function deleteUserAccount(id) {
    const user = usersList.find(u => u.id === id);
    if (!user) return;
    if (currentUser && currentUser.id === id) {
      showToast('warning', 'Không thể xóa', 'Bạn không thể xóa tài khoản đang đăng nhập');
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${user.name}" (${user.username})?`)) return;

    try {
      await api.deleteUser(id);
      showToast('success', 'Đã xóa tài khoản', user.name);
      await loadUsersList();
    } catch (err) {
      showToast('error', 'Lỗi xóa tài khoản', err.message);
    }
  }

  async function loadRecentLogs() {
    const terminal = document.getElementById('settingsLogTerminal');
    if (!terminal || !window.api || !window.api.log) return;

    try {
      const lines = await window.api.log.getRecent(100);
      if (!lines || lines.length === 0) {
        terminal.innerHTML = '<span class="text-muted">Chưa có nhật ký nào trong ngày hôm nay.</span>';
        return;
      }
      terminal.innerHTML = lines.map(line => {
        let cls = 'log-line-info';
        if (line.includes('[ERROR]')) cls = 'log-line-error';
        else if (line.includes('[WARN ]')) cls = 'log-line-warn';
        else if (line.includes('[DEBUG]')) cls = 'log-line-debug';
        return `<div class="${cls}">${escapeHtml(line)}</div>`;
      }).join('');
      terminal.scrollTop = terminal.scrollHeight;
    } catch (e) {
      terminal.innerHTML = `<span class="log-line-error">Lỗi đọc log: ${escapeHtml(e.message)}</span>`;
    }
  }

  async function openLogFolder() {
    if (window.api && window.api.log) {
      await window.api.log.openFolder();
    }
  }

  async function clearTodayLog() {
    if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ nội dung file log ngày hôm nay?')) return;
    if (window.api && window.api.log) {
      await window.api.log.clearToday();
      showToast('success', 'Đã dọn dẹp nhật ký log hôm nay');
      await loadRecentLogs();
    }
  }

  async function renderPluginsList() {
    const container = document.getElementById('settingsPluginsGrid');
    if (!container || !window.pluginBridge) return;

    try {
      const list = await window.pluginBridge.loadPlugins();
      if (!list || list.length === 0) {
        container.innerHTML = '<div class="text-center text-muted" style="padding:20px;">Không tìm thấy plugin nào trong thư mục plugins/</div>';
        return;
      }

      container.innerHTML = list.map(p => `
        <div class="plugin-card ${p.enabled ? 'active' : ''}">
          <div class="plugin-card-left">
            <div class="plugin-icon-box">${p.icon || '🔌'}</div>
            <div class="plugin-card-meta">
              <div class="plugin-card-title">
                <span>${escapeHtml(p.name)}</span>
                <span class="plugin-version-badge">v${escapeHtml(p.version)}</span>
                <span class="text-muted" style="font-size:11px; font-weight:normal;">bởi ${escapeHtml(p.author)}</span>
              </div>
              <div class="plugin-card-desc">${escapeHtml(p.description)}</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${p.enabled ? 'checked' : ''} onchange="pageModules.settings.onTogglePlugin('${p.id}', this)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<div class="text-danger" style="padding:10px;">Lỗi tải danh sách plugin: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function onTogglePlugin(id, chk) {
    try {
      const res = await window.pluginBridge.togglePlugin(id, chk.checked);
      if (res.success) {
        showToast('success', chk.checked ? 'Đã kích hoạt plugin' : 'Đã tắt plugin');
        await renderPluginsList();
      } else {
        showToast('error', 'Không thể đổi trạng thái', res.error);
        chk.checked = !chk.checked;
      }
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
      chk.checked = !chk.checked;
    }
  }

  async function openPluginsFolder() {
    if (window.pluginBridge) {
      await window.pluginBridge.openPluginsFolder();
    }
  }

  registerPage('settings', {
    render, init, saveAll, doBackup, doRestore, addTierRow, removeTierRow,
    loadUsersList, openAddUserModal, openEditUserModal, saveUserForm, deleteUserAccount,
    renderThemePalettes, selectThemePreset, onCustomColorInput, onHexInputChange, resetDefaultTheme, setMode,
    loadRecentLogs, openLogFolder, clearTodayLog, renderPluginsList, onTogglePlugin, openPluginsFolder,
    onBankQrFileSelected, removeBankQrImage, updateBankQrPreview
  });
})();
