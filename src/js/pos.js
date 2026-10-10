/* ============================================
   ShopPro Desktop - Supermarket POS Module
   KiotViet / Suno Style Multi-Invoice POS
   ============================================ */

(() => {
  // ==================== STATE ====================
  let products = [];
  let categories = [];
  let customers = [];
  let memberTiers = [];
  let selectedCategory = null;
  let activeFilter = 'all'; // 'all', 'new', 'bestseller'
  let searchQuery = '';

  let invoiceCounter = 1;
  let invoices = [
    {
      id: 1,
      name: 'Hóa đơn 1',
      cart: [],
      customerId: '',
      discount: 0,
      memberDiscountPercent: 0,
      amountPaid: '',
      paymentMethod: 'cash',
      note: '',
      activeSubTab: 'info' // 'info' | 'note'
    }
  ];
  let activeInvoiceId = 1;

  function getActiveInvoice() {
    let inv = invoices.find(i => i.id === activeInvoiceId);
    if (!inv) {
      if (invoices.length === 0) {
        inv = createNewInvoiceObj();
        invoices.push(inv);
      } else {
        inv = invoices[0];
      }
      activeInvoiceId = inv.id;
    }
    return inv;
  }

  function createNewInvoiceObj() {
    invoiceCounter++;
    return {
      id: Date.now(),
      name: `Hóa đơn ${invoiceCounter}`,
      cart: [],
      customerId: '',
      discount: 0,
      memberDiscountPercent: 0,
      amountPaid: '',
      paymentMethod: 'cash',
      note: '',
      activeSubTab: 'info'
    };
  }

  // ==================== RENDER MAIN LAYOUT ====================
  function render() {
    return `
      <div class="pos-app-wrapper">
        <!-- LEFT PANEL: Cart & Checkout -->
        <section class="pos-left-panel">
          <!-- Multi-Invoice Tabs -->
          <div class="pos-invoice-tabs" id="posInvoiceTabs">
            <!-- Tabs rendered dynamically -->
          </div>

          <!-- Cart Items Table -->
          <div class="pos-cart-table-wrapper">
            <table class="pos-cart-table">
              <thead>
                <tr>
                  <th class="col-name">Hàng hoá</th>
                  <th class="col-qty">SL</th>
                  <th class="col-price">Đơn giá</th>
                  <th class="col-total">Thành tiền</th>
                  <th class="col-action"></th>
                </tr>
              </thead>
              <tbody id="posCartTableBody">
                <!-- Cart rows rendered dynamically -->
              </tbody>
            </table>
            <div id="posCartEmpty" class="pos-cart-empty-state" style="display:none;">
              <div class="empty-icon">🛒</div>
              <p>Chưa có hàng hoá trong hoá đơn</p>
              <span class="sub">Nhấn chọn sản phẩm bên phải hoặc quét mã barcode</span>
            </div>
          </div>

          <!-- Checkout Box -->
          <div class="pos-checkout-panel">
            <!-- Checkout Header Tabs & Customer -->
            <div class="pos-checkout-top-bar">
              <div class="pos-checkout-subtabs">
                <button class="btn-subtab active" id="btnSubtabInfo" onclick="pageModules.pos.switchSubTab('info')">
                  TT hóa đơn
                </button>
                <button class="btn-subtab" id="btnSubtabNote" onclick="pageModules.pos.switchSubTab('note')">
                  Ghi chú
                </button>
              </div>
              <div class="pos-customer-input-group">
                <select id="posCustomerSelect" class="pos-customer-select" onchange="pageModules.pos.onCustomerChange(this.value)">
                  <option value="">👤 Tìm khách hàng...</option>
                </select>
                <button class="btn-quick-add-cust" onclick="pageModules.pos.quickAddCustomer()" title="Thêm khách hàng">
                  ➕
                </button>
              </div>
            </div>

            <!-- Note section (collapsible) -->
            <div id="posNoteSection" class="pos-note-section" style="display:none;">
              <textarea id="posOrderNote" class="pos-note-input" rows="2" placeholder="Nhập ghi chú cho đơn hàng này..." oninput="pageModules.pos.onNoteChange(this.value)"></textarea>
            </div>

            <!-- Payment Methods Selector -->
            <div class="pos-payment-methods">
              <button type="button" class="btn-pm active" id="btnPmCash" onclick="pageModules.pos.setPaymentMethod('cash')">
                <span class="pm-icon">💵</span>
                <span>Tiền mặt</span>
              </button>
              <button type="button" class="btn-pm" id="btnPmTransfer" onclick="pageModules.pos.setPaymentMethod('transfer')" title="Thanh toán chuyển khoản">
                <span class="pm-icon">🏦</span>
                <span>Chuyển khoản</span>
              </button>
              <button type="button" class="btn-pm" id="btnPmVietQR" onclick="pageModules.pos.openVietQRModal()" title="Mở mã QR VietQR có số tiền" style="border-color:var(--cyan); color:var(--cyan);">
                <span class="pm-icon">⚡</span>
                <span>Mã VietQR</span>
              </button>
              <button type="button" class="btn-pm" id="btnPmCard" onclick="pageModules.pos.setPaymentMethod('card')">
                <span class="pm-icon">💳</span>
                <span>Quẹt thẻ</span>
              </button>
            </div>

            <!-- Calculation Rows -->
            <div class="pos-calc-rows">
              <div class="pos-calc-row">
                <span class="label">Tiền hàng:</span>
                <span class="value" id="posSubtotal">0</span>
              </div>
              <div class="pos-calc-row">
                <span class="label">Giảm giá:</span>
                <div class="discount-input-wrapper">
                  <input type="number" id="posDiscountInput" class="pos-calc-input" value="0" min="0" placeholder="0" oninput="pageModules.pos.onDiscountChange(this.value)">
                  <span class="unit">₫</span>
                </div>
              </div>
              <div class="pos-calc-row highlight">
                <span class="label font-bold text-orange">Thanh toán:</span>
                <span class="value font-bold text-orange pos-total-val" id="posTotal">0</span>
              </div>
              <div class="pos-calc-row" id="rowAmountPaid">
                <span class="label">Khách đưa:</span>
                <div class="cash-input-wrapper" style="display:flex; flex-direction:column; align-items:flex-end; width:100%;">
                  <div style="position:relative; width:100%;">
                    <input type="number" id="posAmountPaidInput" class="pos-calc-input" placeholder="0" oninput="pageModules.pos.onAmountPaidChange(this.value)">
                    <span class="unit">₫</span>
                  </div>
                  <!-- Quick cash buttons -->
                  <div class="pos-quick-cash-row">
                    <button type="button" class="btn-cash-quick exact" onclick="pageModules.pos.setQuickCash('exact')" title="Đưa đúng số tiền">Đủ</button>
                    <button type="button" class="btn-cash-quick" onclick="pageModules.pos.setQuickCash(20000)">20k</button>
                    <button type="button" class="btn-cash-quick" onclick="pageModules.pos.setQuickCash(50000)">50k</button>
                    <button type="button" class="btn-cash-quick" onclick="pageModules.pos.setQuickCash(100000)">100k</button>
                    <button type="button" class="btn-cash-quick" onclick="pageModules.pos.setQuickCash(200000)">200k</button>
                    <button type="button" class="btn-cash-quick" onclick="pageModules.pos.setQuickCash(500000)">500k</button>
                  </div>
                </div>
              </div>
              <div class="pos-calc-row" id="rowChangeAmount">
                <span class="label">Tiền thừa:</span>
                <span class="value" id="posChangeAmount">0</span>
              </div>
            </div>

            <!-- Bottom Action Buttons -->
            <div class="pos-action-buttons">
              <button class="btn-pos btn-cancel" onclick="pageModules.pos.cancelInvoice()">
                HỦY
              </button>
              <button class="btn-pos btn-save" onclick="pageModules.pos.saveOrder(false)">
                THANH TOÁN (F9)
              </button>
              <button class="btn-pos btn-save-print" onclick="pageModules.pos.saveOrder(true)">
                THANH TOÁN & IN
              </button>
            </div>
          </div>
        </section>

        <!-- RIGHT PANEL: Product Catalog & Shortcuts -->
        <section class="pos-right-panel">
          <!-- Filter Toolbar -->
          <div class="pos-catalog-toolbar">
            <div class="category-dropdown-wrapper">
              <select id="posCategorySelect" class="pos-category-select" onchange="pageModules.pos.onCategorySelect(this.value)">
                <option value="">Tất cả danh mục</option>
              </select>
            </div>
            <div class="pos-filter-chips">
              <button class="filter-chip active" id="chipAll" onclick="pageModules.pos.setFilter('all')">Tất cả</button>
              <button class="filter-chip" id="chipNew" onclick="pageModules.pos.setFilter('new')">Hàng mới</button>
              <button class="filter-chip" id="chipBestseller" onclick="pageModules.pos.setFilter('bestseller')">Bán chạy</button>
            </div>
            <button class="btn-refresh-catalog" onclick="pageModules.pos.loadProducts()" title="Tải lại sản phẩm">
              🔄
            </button>
          </div>

          <!-- Product Grid -->
          <div class="pos-catalog-grid" id="posProductGrid">
            <!-- Product cards rendered dynamically -->
          </div>

          <!-- Bottom Shortcut Bar -->
          <div class="pos-bottom-shortcuts">
            <button class="shortcut-btn" onclick="pageModules.pos.quickAddProductPrompt()">
              <span class="key">F3</span> Thêm hàng hoá
            </button>
            <button class="shortcut-btn" onclick="pageModules.pos.focusCustomer()">
              <span class="key">F4</span> Khách hàng
            </button>
            <button class="shortcut-btn" onclick="pageModules.pos.focusDiscount()">
              <span class="key">F7</span> Giảm giá
            </button>
            <button class="shortcut-btn" onclick="pageModules.pos.focusCash()">
              <span class="key">F8</span> Thu tiền
            </button>
            <button class="shortcut-btn" onclick="pageModules.pos.addInvoice()">
              <span class="key">+</span> Tạo hóa đơn
            </button>
          </div>
        </section>
      </div>
    `;
  }

  // ==================== INIT ====================
  async function init() {
    renderInvoiceTabs();
    await loadCategories();
    await loadCustomers();
    await loadProducts();
    renderCart();
  }

  // ==================== INVOICE TABS ====================
  function renderInvoiceTabs() {
    const container = document.getElementById('posInvoiceTabs');
    if (!container) return;

    let html = invoices.map(inv => {
      const isActive = inv.id === activeInvoiceId;
      const count = inv.cart.reduce((s, i) => s + i.quantity, 0);
      return `
        <div class="invoice-tab ${isActive ? 'active' : ''}" onclick="pageModules.pos.switchInvoice(${inv.id})">
          <span class="tab-title">${escapeHtml(inv.name)} ${count > 0 ? `(${count})` : ''}</span>
          ${invoices.length > 1 ? `
            <span class="tab-close" onclick="pageModules.pos.closeInvoice(${inv.id}, event)" title="Đóng hóa đơn">✕</span>
          ` : ''}
        </div>
      `;
    }).join('');

    html += `
      <button class="btn-add-invoice" onclick="pageModules.pos.addInvoice()" title="Tạo hóa đơn mới">
        + Hóa đơn
      </button>
    `;

    container.innerHTML = html;
  }

  function addInvoice() {
    const newInv = createNewInvoiceObj();
    invoices.push(newInv);
    activeInvoiceId = newInv.id;
    renderInvoiceTabs();
    renderCart();
    showToast('info', `Đã mở ${newInv.name}`);
  }

  function switchInvoice(id) {
    activeInvoiceId = id;
    renderInvoiceTabs();
    renderCart();
  }

  function closeInvoice(id, e) {
    if (e) e.stopPropagation();
    if (invoices.length <= 1) {
      // If only 1 tab, just clear it
      cancelInvoice();
      return;
    }

    const idx = invoices.findIndex(i => i.id === id);
    if (idx !== -1) {
      invoices.splice(idx, 1);
      if (activeInvoiceId === id) {
        activeInvoiceId = invoices[Math.max(0, idx - 1)].id;
      }
      renderInvoiceTabs();
      renderCart();
    }
  }

  function cancelInvoice() {
    const inv = getActiveInvoice();
    inv.cart = [];
    inv.discount = 0;
    inv.memberDiscountPercent = 0;
    inv.amountPaid = '';
    inv.note = '';
    renderCart();
    showToast('info', 'Đã làm trống hóa đơn');
  }

  // ==================== LOAD DATA ====================
  async function loadProducts() {
    try {
      const filters = { status: 'active' };
      if (searchQuery) filters.search = searchQuery;
      if (selectedCategory) filters.category_id = selectedCategory;

      products = await api.getProducts(filters);

      // Apply client-side chips (bestseller/new)
      if (activeFilter === 'bestseller') {
        products = [...products].sort((a, b) => b.price - a.price);
      } else if (activeFilter === 'new') {
        products = [...products].sort((a, b) => b.id - a.id);
      }

      renderProducts();
    } catch (err) {
      console.error('Error loading products:', err);
      showToast('error', 'Lỗi tải sản phẩm', err.message);
    }
  }

  async function loadCategories() {
    try {
      categories = await api.getCategories();
      const select = document.getElementById('posCategorySelect');
      if (select) {
        let html = '<option value="">Tất cả danh mục</option>';
        categories.forEach(c => {
          html += `<option value="${c.id}" ${selectedCategory === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`;
        });
        select.innerHTML = html;
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  async function loadCustomers() {
    try {
      [customers, memberTiers] = await Promise.all([
        api.getCustomers({}),
        api.getMemberTiers()
      ]);
      renderCustomerSelect();
    } catch (err) {
      console.error('Error loading customers:', err);
    }
  }

  function calcCustomerTier(cust) {
    if (!cust || !memberTiers || memberTiers.length === 0) {
      return { id: 'bronze', name: 'Đồng', badge: '🥉', discount_percent: 0, color: '#cd7f32' };
    }

    if (cust.tier_mode === 'manual' && cust.fixed_tier_id) {
      const fixed = memberTiers.find(t => t.id === cust.fixed_tier_id);
      if (fixed) return fixed;
    }

    let tiers = memberTiers;
    if (cust.custom_tiers_json) {
      try {
        const customMap = typeof cust.custom_tiers_json === 'string'
          ? JSON.parse(cust.custom_tiers_json)
          : cust.custom_tiers_json;
        if (customMap && typeof customMap === 'object') {
          tiers = memberTiers.map(t => ({
            ...t,
            min_spent: customMap[t.id] !== undefined ? (parseFloat(customMap[t.id]) || 0) : (t.min_spent || 0)
          }));
        }
      } catch (_) {}
    }

    const spent = cust.total_spent || 0;
    const sorted = [...tiers].sort((a, b) => (b.min_spent || 0) - (a.min_spent || 0));
    return sorted.find(t => spent >= (t.min_spent || 0)) || memberTiers[0];
  }

  function renderCustomerSelect() {
    const select = document.getElementById('posCustomerSelect');
    if (!select) return;
    const inv = getActiveInvoice();

    let html = '<option value="">👤 Khách lẻ (Không chọn)</option>';
    customers.forEach(c => {
      const isSel = inv.customerId == c.id;
      const tier = calcCustomerTier(c);
      const discountTag = tier.discount_percent > 0 ? ` [Giảm ${tier.discount_percent}%]` : '';
      html += `<option value="${c.id}" ${isSel ? 'selected' : ''}>${tier.badge || '👤'} ${escapeHtml(c.name)}${c.phone ? ` (${c.phone})` : ''}${discountTag}</option>`;
    });
    select.innerHTML = html;
  }

  // ==================== RENDER PRODUCTS ====================
  function renderProducts() {
    const grid = document.getElementById('posProductGrid');
    if (!grid) return;

    if (products.length === 0) {
      grid.innerHTML = `
        <div class="pos-empty-catalog">
          <div style="font-size:36px; margin-bottom:8px;">📦</div>
          <p style="font-weight:600; color:var(--text-secondary);">Không tìm thấy sản phẩm nào</p>
          <span style="font-size:12px; color:var(--text-muted);">Thử tìm từ khóa khác hoặc thêm sản phẩm mới</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = products.map(p => {
      const price = p.sale_price > 0 ? p.sale_price : p.price;
      const isOutOfStock = false; // Tạm thời bỏ qua quản lý số lượng
      const isLowStock = false;
      const unit = p.unit || 'cái';

      // Check expiry status
      let expBadge = '';
      let isExpired = false;
      if (p.expiry_date) {
        const today = new Date(); today.setHours(0,0,0,0);
        const expDate = new Date(p.expiry_date); expDate.setHours(0,0,0,0);
        const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          isExpired = true;
          expBadge = `<div class="badge-out" style="background:#ef4444; top:28px;">Hết HSD</div>`;
        } else if (diffDays <= 30) {
          expBadge = `<div class="badge-out" style="background:#f59e0b; top:28px;">HSD: ${diffDays} ngày</div>`;
        }
      }

      return `
        <div class="pos-product-card ${isOutOfStock ? 'out-of-stock' : ''}"
             onclick="pageModules.pos.addToCart(${p.id})"
             title="${escapeHtml(p.name)}${p.expiry_date ? ` (HSD: ${p.expiry_date})` : ''}">
          <div class="card-image-wrap">
            ${p.image ? `
              <img src="${escapeHtml(window.formatProductImageUrl ? window.formatProductImageUrl(p.image) : p.image)}" alt="" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'fallback-img\\'>📦</div>';">
            ` : `<div class="fallback-img">📦</div>`}
            ${isOutOfStock ? `<div class="badge-out">Hết hàng</div>` : ''}
            ${expBadge}
          </div>
          <div class="card-info">
            <div class="card-title">${escapeHtml(p.name)}</div>
            <div class="card-unit">${escapeHtml(unit)}</div>
            <div class="card-price">${formatNumber(price)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ==================== CART OPERATIONS ====================
  function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (product.expiry_date) {
      const today = new Date(); today.setHours(0,0,0,0);
      const expDate = new Date(product.expiry_date); expDate.setHours(0,0,0,0);
      const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        showToast('warning', '⚠️ Sản phẩm đã hết hạn!', `${product.name} đã hết hạn vào ngày ${product.expiry_date}`);
      } else if (diffDays <= 30) {
        showToast('info', 'Lưu ý hạn sử dụng', `${product.name} sắp hết hạn (còn ${diffDays} ngày)`);
      }
    }

    const inv = getActiveInvoice();
    const existing = inv.cart.find(item => item.product_id === productId);

    if (existing) {
      /* Bỏ qua giới hạn tồn kho */
      existing.quantity++;
      const unitPrice = Math.max(0, existing.price - (existing.discount || 0));
      existing.subtotal = existing.quantity * unitPrice;
    } else {
      const price = product.sale_price > 0 ? product.sale_price : product.price;
      inv.cart.push({
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        price: price,
        discount: 0,
        quantity: 1,
        unit: product.unit || 'cái',
        subtotal: price,
        max_stock: product.stock
      });
    }

    renderInvoiceTabs();
    renderCart();
  }

  function updateQuantity(index, delta) {
    const inv = getActiveInvoice();
    const item = inv.cart[index];
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }
    /* Bỏ qua giới hạn max_stock */

    item.quantity = newQty;
    const unitPrice = Math.max(0, item.price - (item.discount || 0));
    item.subtotal = item.quantity * unitPrice;
    renderInvoiceTabs();
    renderCart();
  }

  function setQuantityDirect(index, value) {
    const inv = getActiveInvoice();
    const item = inv.cart[index];
    if (!item) return;

    let qty = parseInt(value) || 1;
    if (qty <= 0) qty = 1;
    /* Bỏ qua giới hạn max_stock */

    item.quantity = qty;
    const unitPrice = Math.max(0, item.price - (item.discount || 0));
    item.subtotal = item.quantity * unitPrice;
    renderInvoiceTabs();
    renderCart();
  }

  function removeFromCart(index) {
    const inv = getActiveInvoice();
    inv.cart.splice(index, 1);
    renderInvoiceTabs();
    renderCart();
  }

  function openItemDiscountModal(index) {
    const inv = getActiveInvoice();
    const item = inv.cart[index];
    if (!item) return;

    showModal(`
      <div class="modal" style="max-width:380px;">
        <div class="modal-header">
          <h3>🏷️ Chiết Khấu Sản Phẩm</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div style="font-weight:700; font-size:15px; margin-bottom:4px;">${escapeHtml(item.product_name)}</div>
          <div class="text-secondary" style="font-size:13px; margin-bottom:16px;">Đơn giá gốc: <strong>${formatNumber(item.price)}₫</strong></div>

          <div class="form-group mb-md">
            <label class="form-label">LOẠI GIẢM GIÁ</label>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-sm btn-primary" id="btnDiscTypeVnd" onclick="pageModules.pos.switchItemDiscType('vnd')" style="flex:1;">VNĐ (₫)</button>
              <button type="button" class="btn btn-sm btn-outline" id="btnDiscTypePct" onclick="pageModules.pos.switchItemDiscType('pct')" style="flex:1;">Phần trăm (%)</button>
            </div>
          </div>

          <div class="form-group mb-md">
            <label class="form-label" id="lblItemDiscValue">MỨC GIẢM TRÊN 1 ĐƠN VỊ (VNĐ)</label>
            <input type="number" class="form-control" id="txtItemDiscValue" value="${item.discount || 0}" min="0">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
          <button class="btn btn-primary" onclick="pageModules.pos.applyItemDiscount(${index})">Áp dụng</button>
        </div>
      </div>
    `);
    itemDiscType = 'vnd';
  }

  let itemDiscType = 'vnd';
  function switchItemDiscType(type) {
    itemDiscType = type;
    const btnVnd = document.getElementById('btnDiscTypeVnd');
    const btnPct = document.getElementById('btnDiscTypePct');
    const lbl = document.getElementById('lblItemDiscValue');
    const input = document.getElementById('txtItemDiscValue');

    if (type === 'pct') {
      btnVnd?.classList.replace('btn-primary', 'btn-outline');
      btnPct?.classList.replace('btn-outline', 'btn-primary');
      if (lbl) lbl.textContent = 'MỨC GIẢM (%)';
      if (input) { input.placeholder = '10'; input.max = 100; }
    } else {
      btnPct?.classList.replace('btn-primary', 'btn-outline');
      btnVnd?.classList.replace('btn-outline', 'btn-primary');
      if (lbl) lbl.textContent = 'MỨC GIẢM TRÊN 1 ĐƠN VỊ (VNĐ)';
      if (input) { input.placeholder = '10000'; input.removeAttribute('max'); }
    }
  }

  function applyItemDiscount(index) {
    const inv = getActiveInvoice();
    const item = inv.cart[index];
    if (!item) return;

    const val = parseFloat(document.getElementById('txtItemDiscValue')?.value) || 0;
    let discAmount = 0;

    if (itemDiscType === 'pct') {
      const pct = Math.min(100, Math.max(0, val));
      discAmount = Math.round((item.price * pct) / 100);
    } else {
      discAmount = Math.min(item.price, Math.max(0, val));
    }

    item.discount = discAmount;
    const unitPrice = Math.max(0, item.price - discAmount);
    item.subtotal = item.quantity * unitPrice;

    closeModal();
    renderCart();
    showToast('success', 'Đã cập nhật chiết khấu món', `${item.product_name}: -${formatNumber(discAmount)}₫/món`);
  }

  function renderCart() {
    const inv = getActiveInvoice();
    const tbody = document.getElementById('posCartTableBody');
    const emptyState = document.getElementById('posCartEmpty');
    if (!tbody) return;

    if (inv.cart.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      tbody.innerHTML = inv.cart.map((item, i) => `
        <tr class="cart-row">
          <td class="col-name">
            <div class="item-title">${escapeHtml(item.product_name)}</div>
            <div class="item-meta">${escapeHtml(item.product_sku || '')} ${item.unit ? `· ${escapeHtml(item.unit)}` : ''}</div>
          </td>
          <td class="col-qty">
            <div class="qty-stepper">
              <button class="step-btn" onclick="pageModules.pos.updateQuantity(${i}, -1)">−</button>
              <input type="number" class="qty-input" value="${item.quantity}" min="1" max="${item.max_stock}"
                     onchange="pageModules.pos.setQuantityDirect(${i}, this.value)">
              <button class="step-btn" onclick="pageModules.pos.updateQuantity(${i}, 1)">+</button>
            </div>
          </td>
          <td class="col-price">
            <div>${formatNumber(item.price)}</div>
            ${item.discount > 0 ? `
              <div style="font-size:11px; color:#f59e0b; cursor:pointer; font-weight:600;" onclick="pageModules.pos.openItemDiscountModal(${i})" title="Bấm để sửa chiết khấu">
                🏷️ -${formatNumber(item.discount)}
              </div>
            ` : `
              <button class="btn btn-ghost" style="font-size:10px; padding:1px 4px; color:var(--text-muted); opacity:0.8;" onclick="pageModules.pos.openItemDiscountModal(${i})" title="Chiết khấu món này">
                🏷️ Giảm
              </button>
            `}
          </td>
          <td class="col-total">${formatNumber(item.subtotal)}</td>
          <td class="col-action">
            <button class="btn-del-item" onclick="pageModules.pos.removeFromCart(${i})" title="Xóa món">
              🗑
            </button>
          </td>
        </tr>
      `).join('');
    }

    updateTotals();
  }

  // ==================== TOTALS & SUMMARY ====================
  function updateTotals() {
    const inv = getActiveInvoice();
    const subtotal = inv.cart.reduce((s, i) => s + i.subtotal, 0);

    // Auto-recalculate discount if tied to customer membership tier %
    if (inv.memberDiscountPercent > 0) {
      inv.discount = Math.round((subtotal * inv.memberDiscountPercent) / 100);
    }

    const discount = parseFloat(inv.discount) || 0;
    const total = Math.max(0, subtotal - discount);

    // Auto set amount paid to total if not explicitly set
    let amountPaid = inv.amountPaid !== '' ? parseFloat(inv.amountPaid) : total;
    if (inv.cart.length === 0) amountPaid = 0;
    const change = Math.max(0, amountPaid - total);

    const subtotalEl = document.getElementById('posSubtotal');
    const totalEl = document.getElementById('posTotal');
    const discountInput = document.getElementById('posDiscountInput');
    const amountPaidInput = document.getElementById('posAmountPaidInput');
    const changeEl = document.getElementById('posChangeAmount');

    if (subtotalEl) subtotalEl.textContent = formatNumber(subtotal);
    if (totalEl) totalEl.textContent = formatNumber(total);
    if (discountInput && document.activeElement !== discountInput) {
      discountInput.value = discount || '';
    }
    if (amountPaidInput && document.activeElement !== amountPaidInput) {
      amountPaidInput.value = inv.amountPaid !== '' ? inv.amountPaid : (total > 0 ? total : '');
    }
    if (changeEl) changeEl.textContent = formatNumber(change);

    // Sync note and customer
    const noteEl = document.getElementById('posOrderNote');
    if (noteEl && document.activeElement !== noteEl) {
      noteEl.value = inv.note || '';
    }
    const custEl = document.getElementById('posCustomerSelect');
    if (custEl) {
      custEl.value = inv.customerId || '';
    }

    // Sync payment method buttons
    const pm = inv.paymentMethod || 'cash';
    ['btnPmCash', 'btnPmTransfer', 'btnPmCard'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    if (pm === 'cash') document.getElementById('btnPmCash')?.classList.add('active');
    if (pm === 'transfer') document.getElementById('btnPmTransfer')?.classList.add('active');
    if (pm === 'card') document.getElementById('btnPmCard')?.classList.add('active');
  }

  function setPaymentMethod(method, autoOpenQr = true) {
    const inv = getActiveInvoice();
    inv.paymentMethod = method;
    if (method === 'transfer' || method === 'card') {
      const subtotal = inv.cart.reduce((s, i) => s + i.subtotal, 0);
      const discount = parseFloat(inv.discount) || 0;
      inv.amountPaid = Math.max(0, subtotal - discount);
    }
    updateTotals();
    if (method === 'transfer' && autoOpenQr && inv.cart.length > 0) {
      openVietQRModal();
    }
  }

  function setQuickCash(amount) {
    const inv = getActiveInvoice();
    const subtotal = inv.cart.reduce((s, i) => s + i.subtotal, 0);
    const discount = parseFloat(inv.discount) || 0;
    const total = Math.max(0, subtotal - discount);

    if (amount === 'exact') {
      inv.amountPaid = total;
    } else {
      inv.amountPaid = amount;
    }
    inv.paymentMethod = 'cash';
    updateTotals();
  }

  async function onBarcodeOrSearchEnter(query) {
    if (!query) return;
    const q = query.trim().toLowerCase();

    // 1. Exact barcode match in loaded products
    const byBarcode = products.find(p => p.barcode && p.barcode.toLowerCase() === q);
    if (byBarcode) {
      addToCart(byBarcode.id);
      showToast('success', 'Đã quét mã vạch', `${byBarcode.name} — ${formatCurrency(byBarcode.price)}`);
      return;
    }

    // 2. Exact SKU match
    const bySku = products.find(p => p.sku && p.sku.toLowerCase() === q);
    if (bySku) {
      addToCart(bySku.id);
      showToast('success', 'Đã thêm sản phẩm', `${bySku.name} — ${formatCurrency(bySku.price)}`);
      return;
    }

    // 3. Query API for exact barcode in DB
    try {
      const p = await api.getProductByBarcode(query.trim());
      if (p) {
        addToCart(p.id);
        showToast('success', 'Đã quét mã vạch', `${p.name} — ${formatCurrency(p.price)}`);
        return;
      }
    } catch (_) {}

    // 4. Match first product with name containing query
    const partialMatch = products.find(p => p.name.toLowerCase().includes(q));
    if (partialMatch) {
      addToCart(partialMatch.id);
      showToast('success', 'Đã thêm sản phẩm', `${partialMatch.name} — ${formatCurrency(partialMatch.price)}`);
      return;
    }

    showToast('warning', 'Không tìm thấy sản phẩm', `Không có sản phẩm nào khớp với mã "${query}"`);
  }

  function onDiscountChange(val) {
    const inv = getActiveInvoice();
    inv.discount = parseFloat(val) || 0;
    // Manual discount override clears automatic tier % scaling
    inv.memberDiscountPercent = 0;
    updateTotals();
  }

  function onAmountPaidChange(val) {
    const inv = getActiveInvoice();
    inv.amountPaid = val;
    updateTotals();
  }

  async function onCustomerChange(val) {
    const inv = getActiveInvoice();
    inv.customerId = val ? parseInt(val) : '';

    // If customer was unselected (Khách lẻ / Không chọn)
    if (!inv.customerId) {
      if (inv.memberDiscountPercent > 0 || inv.discount > 0) {
        inv.memberDiscountPercent = 0;
        inv.discount = 0;
        showToast('info', 'Khách lẻ', 'Đã hủy chiết khấu thành viên');
      }
      updateTotals();
      return;
    }

    const cust = customers.find(c => c.id === inv.customerId);
    if (!cust) {
      inv.memberDiscountPercent = 0;
      inv.discount = 0;
      updateTotals();
      return;
    }

    try {
      if (!memberTiers || memberTiers.length === 0) {
        memberTiers = await api.getMemberTiers();
      }
      const matchedTier = calcCustomerTier(cust);
      if (matchedTier && matchedTier.discount_percent > 0) {
        inv.memberDiscountPercent = matchedTier.discount_percent;
        const subtotal = inv.cart.reduce((s, i) => s + i.subtotal, 0);
        const autoDiscount = Math.round((subtotal * matchedTier.discount_percent) / 100);
        inv.discount = autoDiscount;
        const modeLabel = cust.tier_mode === 'manual' ? 'Hạng cố định' : 'Hạng chi tiêu';
        showToast('info', `Khách hàng: ${matchedTier.badge || '⭐'} ${matchedTier.name} (${modeLabel})`,
          `Áp dụng chiết khấu ${matchedTier.discount_percent}% (-${formatNumber(autoDiscount)}₫)`);
      } else {
        // Customer has NO discount (0%): reset old discount!
        if (inv.memberDiscountPercent > 0 || inv.discount > 0) {
          inv.memberDiscountPercent = 0;
          inv.discount = 0;
          showToast('info', `Khách hàng: ${cust.name}`, 'Khách hàng không có chiết khấu thành viên (0%)');
        } else {
          inv.memberDiscountPercent = 0;
        }
      }
    } catch (e) {
      console.error('Error applying member tier discount:', e);
    }

    updateTotals();
  }

  function onNoteChange(val) {
    const inv = getActiveInvoice();
    inv.note = val;
  }

  function switchSubTab(tab) {
    const inv = getActiveInvoice();
    inv.activeSubTab = tab;

    const btnInfo = document.getElementById('btnSubtabInfo');
    const btnNote = document.getElementById('btnSubtabNote');
    const noteSection = document.getElementById('posNoteSection');

    if (tab === 'note') {
      btnInfo?.classList.remove('active');
      btnNote?.classList.add('active');
      if (noteSection) noteSection.style.display = 'block';
      const noteInput = document.getElementById('posOrderNote');
      if (noteInput) noteInput.focus();
    } else {
      btnInfo?.classList.add('active');
      btnNote?.classList.remove('active');
      if (noteSection) noteSection.style.display = 'none';
    }
  }

  // ==================== CHECKOUT & ORDER SUBMISSION ====================
  async function saveOrder(printReceipt = false) {
    const inv = getActiveInvoice();
    if (inv.cart.length === 0) {
      showToast('warning', 'Hóa đơn trống', 'Vui lòng chọn sản phẩm trước khi thanh toán');
      return;
    }

    const subtotal = inv.cart.reduce((s, i) => s + i.subtotal, 0);
    const discount = parseFloat(inv.discount) || 0;
    const total = Math.max(0, subtotal - discount);
    const amountPaid = inv.amountPaid !== '' ? parseFloat(inv.amountPaid) : total;
    const change = Math.max(0, amountPaid - total);

    try {
      const staffName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : 'Thu Ngân';
      const userId = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;

      const orderPayload = {
        customer_id: inv.customerId || null,
        user_id: userId,
        staff_name: staffName,
        items: inv.cart.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku || '',
          price: item.price,
          quantity: item.quantity,
          discount: item.discount || 0,
          subtotal: item.subtotal
        })),
        subtotal: subtotal,
        discount_amount: discount,
        total: total,
        payment_method: inv.paymentMethod || 'cash',
        amount_paid: amountPaid,
        change_amount: change,
        note: inv.note || ''
      };

      const result = await api.createOrder(orderPayload);
      showToast('success', 'Thanh toán thành công!', `Mã đơn: ${result.order_code} — Tổng: ${formatCurrency(total)}`);

      // Print receipt if requested
      if (printReceipt) {
        if (pageModules.orders && typeof pageModules.orders.printOrder === 'function') {
          pageModules.orders.printOrder(result.id);
        } else {
          printInvoiceDirect(result.order_code, inv, subtotal, discount, total, amountPaid, change, staffName);
        }
      }

      // Close completed invoice tab if multiple, or reset if single
      if (invoices.length > 1) {
        const idx = invoices.findIndex(i => i.id === inv.id);
        invoices.splice(idx, 1);
        activeInvoiceId = invoices[Math.max(0, idx - 1)].id;
      } else {
        inv.cart = [];
        inv.discount = 0;
        inv.memberDiscountPercent = 0;
        inv.amountPaid = '';
        inv.note = '';
        inv.customerId = '';
      }

      renderInvoiceTabs();
      renderCart();

      // Reload products to refresh real stock count
      await loadProducts();

    } catch (err) {
      console.error('Error in saveOrder:', err);
      showToast('error', 'Lỗi thanh toán', err.message || 'Không thể tạo đơn hàng');
    }
  }

  async function printInvoiceDirect(code, inv, subtotal, discount, total, amountPaid, change, staffName = '') {
    try {
      const settings = await api.getAllSettings();
      const shopName = settings.shop_name || 'Cửa Hàng Shop';
      const shopAddress = settings.shop_address || '';
      const shopPhone = settings.shop_phone || '';
      const footer = settings.receipt_footer || 'Cảm ơn quý khách và hẹn gặp lại!';
      const pmText = inv.paymentMethod === 'transfer' ? 'Chuyển khoản / QR' : inv.paymentMethod === 'card' ? 'Quẹt thẻ' : 'Tiền mặt';

      const html = `
        <html><head><style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; width: 300px; margin: 0 auto; padding: 12px; color: #111; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #444; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 3px 0; }
          .right { text-align: right; }
        </style></head>
        <body>
          <div class="center bold" style="font-size:16px;">${shopName}</div>
          ${shopAddress ? `<div class="center" style="font-size:11px;">${shopAddress}</div>` : ''}
          ${shopPhone ? `<div class="center" style="font-size:11px;">ĐT: ${shopPhone}</div>` : ''}
          <div class="divider"></div>
          <div class="center bold">HÓA ĐƠN BÁN HÀNG</div>
          <div style="font-size:11px;">Mã HĐ: ${code}</div>
          <div style="font-size:11px;">Ngày: ${new Date().toLocaleString('vi-VN')}</div>
          ${staffName ? `<div style="font-size:11px;">Thu ngân: ${escapeHtml(staffName)}</div>` : ''}
          <div style="font-size:11px;">Hình thức: ${pmText}</div>
          <div class="divider"></div>
          <table>
            ${inv.cart.map(item => `
              <tr><td colspan="2" class="bold">${escapeHtml(item.product_name)}</td></tr>
              <tr>
                <td style="color:#555;">${item.quantity} x ${formatNumber(item.price)}</td>
                <td class="right bold">${formatNumber(item.subtotal)}₫</td>
              </tr>
            `).join('')}
          </table>
          <div class="divider"></div>
          <table>
            <tr><td>Tiền hàng:</td><td class="right">${formatNumber(subtotal)}₫</td></tr>
            ${discount > 0 ? `<tr><td>Giảm giá:</td><td class="right">-${formatNumber(discount)}₫</td></tr>` : ''}
            <tr class="bold" style="font-size:14px;"><td>THANH TOÁN:</td><td class="right">${formatNumber(total)}₫</td></tr>
            <tr><td>Khách đưa:</td><td class="right">${formatNumber(amountPaid)}₫</td></tr>
            <tr><td>Tiền thừa:</td><td class="right">${formatNumber(change)}₫</td></tr>
          </table>
          <div class="divider"></div>
          <div class="center" style="font-size:11px; margin-top:6px;">${footer}</div>
        </body></html>
      `;
      await api.printReceipt(html);
    } catch (e) {
      console.warn('Print receipt notice:', e);
    }
  }

  // ==================== SEARCH & FILTERS ====================
  const onSearch = debounce((value) => {
    searchQuery = value;
    loadProducts();
  }, 250);

  function onCategorySelect(catId) {
    selectedCategory = catId ? parseInt(catId) : null;
    loadProducts();
  }

  function setFilter(filterName) {
    activeFilter = filterName;
    ['chipAll', 'chipNew', 'chipBestseller'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    if (filterName === 'all') document.getElementById('chipAll')?.classList.add('active');
    if (filterName === 'new') document.getElementById('chipNew')?.classList.add('active');
    if (filterName === 'bestseller') document.getElementById('chipBestseller')?.classList.add('active');
    loadProducts();
  }

  // ==================== BARCODE & SHORTCUTS ====================
  async function onBarcode(code) {
    try {
      const product = await api.getProductByBarcode(code);
      if (product) {
        addToCart(product.id);
        showToast('success', 'Đã quét mã', `${product.name} — ${formatCurrency(product.price)}`);
      } else {
        promptQuickAddProduct(code);
      }
    } catch (err) {
      showToast('error', 'Lỗi quét barcode', err.message);
    }
  }

  async function onBarcodeOrSearchEnter(code) {
    code = (code || '').trim();
    if (!code) return;
    try {
      // 1. Check exact barcode match first
      const product = await api.getProductByBarcode(code);
      if (product) {
        addToCart(product.id);
        showToast('success', 'Đã quét mã', `${product.name} — ${formatCurrency(product.price)}`);
        return;
      }

      // 2. If current filtered products has exactly 1 item, add it to cart
      if (products && products.length === 1) {
        addToCart(products[0].id);
        showToast('success', 'Đã thêm sản phẩm', `${products[0].name} — ${formatCurrency(products[0].price)}`);
        searchQuery = '';
        const searchInput = document.getElementById('posSearchInput');
        if (searchInput) searchInput.value = '';
        loadProducts();
        return;
      }

      // 3. Otherwise reload products with search query
      searchQuery = code;
      await loadProducts();
      if (products.length === 1) {
        addToCart(products[0].id);
        showToast('success', 'Đã thêm sản phẩm', `${products[0].name} — ${formatCurrency(products[0].price)}`);
        searchQuery = '';
        const searchInput = document.getElementById('posSearchInput');
        if (searchInput) searchInput.value = '';
        loadProducts();
      } else if (products.length === 0) {
        promptQuickAddProduct(code);
      }
    } catch (err) {
      console.error('Barcode/Search Enter error:', err);
    }
  }

  function quickAddProductPrompt() {
    promptQuickAddProduct('');
  }

  function promptQuickAddProduct(barcode) {
    showModal(`
      <div class="modal" style="min-width: 440px;">
        <div class="modal-header">
          <h3>📦 Thêm Nhanh Sản Phẩm Mới</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">${ICONS.x}</button>
        </div>
        <form onsubmit="pageModules.pos.saveQuickProduct(event, '${escapeHtml(barcode)}')">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">MÃ BARCODE</label>
              <input type="text" class="form-control" id="qaBarcode" value="${escapeHtml(barcode || '')}" placeholder="Quét hoặc nhập barcode">
            </div>
            <div class="form-group">
              <label class="form-label">TÊN SẢN PHẨM *</label>
              <input type="text" class="form-control" id="qaProductName" required placeholder="Tên sản phẩm">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">GIÁ BÁN (VNĐ) *</label>
                <input type="number" class="form-control" id="qaProductPrice" required min="0" step="1000" placeholder="0">
              </div>
              <div class="form-group">
                <label class="form-label">SỐ LƯỢNG KHO</label>
                <input type="number" class="form-control" id="qaProductStock" value="100" min="0">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">HÌNH ẢNH (URL)</label>
              <input type="text" class="form-control" id="qaProductImage" placeholder="https://...">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Hủy</button>
            <button type="submit" class="btn btn-primary">💾 Lưu & Thêm Vào Hóa Đơn</button>
          </div>
        </form>
      </div>
    `);

    setTimeout(() => {
      document.getElementById('qaProductName')?.focus();
    }, 150);
  }

  async function saveQuickProduct(e, defaultBarcode) {
    e.preventDefault();
    const name = document.getElementById('qaProductName').value.trim();
    const barcode = document.getElementById('qaBarcode').value.trim() || defaultBarcode;
    const price = parseFloat(document.getElementById('qaProductPrice').value) || 0;
    const stock = parseInt(document.getElementById('qaProductStock').value) || 100;
    const image = document.getElementById('qaProductImage').value.trim();

    try {
      const newProd = await api.addProduct({
        name: name,
        barcode: barcode,
        sku: 'SP-' + Date.now().toString().slice(-6),
        price: price,
        stock: stock,
        unit: 'cái',
        image: image,
        status: 'active'
      });
      closeModal();
      await loadProducts();
      addToCart(newProd.id);
      showToast('success', 'Đã tạo sản phẩm mới', `${name} — Đã thêm vào hóa đơn!`);
    } catch (err) {
      showToast('error', 'Lỗi lưu sản phẩm', err.message);
    }
  }

  function quickAddCustomer() {
    showModal(`
      <div class="modal" style="min-width: 420px;">
        <div class="modal-header">
          <h3>👤 Thêm Khách Hàng Nhanh</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">${ICONS.x}</button>
        </div>
        <form onsubmit="pageModules.pos.saveQuickCustomer(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">TÊN KHÁCH HÀNG *</label>
              <input type="text" class="form-control" id="qcName" required placeholder="Nguyễn Văn A">
            </div>
            <div class="form-group">
              <label class="form-label">SỐ ĐIỆN THOẠI</label>
              <input type="tel" class="form-control" id="qcPhone" placeholder="0901234567">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Hủy</button>
            <button type="submit" class="btn btn-primary">💾 Thêm & Chọn</button>
          </div>
        </form>
      </div>
    `);

    setTimeout(() => {
      document.getElementById('qcName')?.focus();
    }, 150);
  }

  async function saveQuickCustomer(e) {
    e.preventDefault();
    const name = document.getElementById('qcName').value.trim();
    const phone = document.getElementById('qcPhone').value.trim();

    try {
      const cust = await api.addCustomer({ name, phone });
      closeModal();
      await loadCustomers();
      await onCustomerChange(cust.id);
      showToast('success', 'Đã thêm khách hàng', `${name} (${phone})`);
    } catch (err) {
      showToast('error', 'Lỗi thêm khách', err.message);
    }
  }

  function focusCustomer() {
    document.getElementById('posCustomerSelect')?.focus();
  }

  function focusDiscount() {
    const el = document.getElementById('posDiscountInput');
    if (el) { el.focus(); el.select(); }
  }

  function focusCash() {
    const el = document.getElementById('posAmountPaidInput');
    if (el) { el.focus(); el.select(); }
  }

  const BANK_NAMES = {
    '970436': 'Vietcombank',
    '970422': 'MBBank',
    '970407': 'Techcombank',
    '970416': 'ACB',
    '970418': 'BIDV',
    '970415': 'VietinBank',
    '970454': 'VPBank',
    '970423': 'TPBank',
    '970405': 'Agribank',
    '970403': 'Sacombank',
    '970441': 'VIB',
    '546034': 'Cake by VPBank',
    '963388': 'Timo by BVBank'
  };

  async function openVietQRModal() {
    const inv = getActiveInvoice();
    if (inv.cart.length === 0) {
      showToast('warning', 'Hóa đơn trống', 'Vui lòng chọn sản phẩm trước khi tạo mã QR thanh toán');
      return;
    }

    const subtotal = inv.cart.reduce((s, i) => s + i.subtotal, 0);
    const discount = parseFloat(inv.discount) || 0;
    const total = Math.max(0, subtotal - discount);

    setPaymentMethod('transfer', false);

    const bankBin = (await api.getSetting('bank_bin')) || '970423';
    const bankAccountNo = (await api.getSetting('bank_account_no')) || '03793104801';
    const bankAccountName = (await api.getSetting('bank_account_name')) || 'TA TRUNG HIEU';
    const bankTemplate = (await api.getSetting('bank_template')) || 'HD {code}';
    const bankQrImage = (await api.getSetting('bank_qr_image')) || 'images/bank_qr.png';

    if (!bankQrImage && (!bankBin || !bankAccountNo)) {
      showModal(`
        <div class="modal" style="max-width:440px; text-align:center;">
          <div class="modal-header">
            <h3>🏦 Chưa Cấu Hình QR Ngân Hàng</h3>
            <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-body" style="padding:24px 20px;">
            <div style="font-size:48px; margin-bottom:12px;">💳</div>
            <h4 style="margin-bottom:8px;">Bạn chưa thiết lập tài khoản hoặc ảnh mã QR nhận tiền</h4>
            <p class="text-secondary" style="font-size:13px; line-height:1.5; margin-bottom:20px;">
              Vui lòng vào <strong>Cài Đặt → Tài Khoản Ngân Hàng & Mã QR</strong> để chọn ảnh QR từ máy tính.
            </p>
            <button class="btn btn-primary" onclick="closeModal(); navigateTo('settings');">
              ⚙️ Đến Trang Cài Đặt Ngay
            </button>
          </div>
        </div>
      `);
      return;
    }

    const invoiceCode = inv.name.replace(/\D/g, '') || '1';
    const transferSyntax = bankTemplate.replace('{code}', `${invoiceCode}-${Date.now().toString().slice(-4)}`);
    const bankName = BANK_NAMES[bankBin] || 'TPBank (Tiên Phong)';

    const vietqrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccountNo}-compact2.png?amount=${total}&addInfo=${encodeURIComponent(transferSyntax)}&accountName=${encodeURIComponent(bankAccountName)}`;
    const displayQrUrl = bankQrImage || vietqrUrl;

    let localQrDataUrl = '';
    try {
      if (!bankQrImage) {
        localQrDataUrl = await api.generateQRCode(`https://api.vietqr.io/image/${bankBin}-${bankAccountNo}-compact2.png?amount=${total}&addInfo=${encodeURIComponent(transferSyntax)}&accountName=${encodeURIComponent(bankAccountName)}`);
      }
    } catch (_) {}

    showModal(`
      <div class="modal" style="max-width:440px; text-align:center;">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:20px;">⚡</span>
            <h3 style="margin:0;">Mã QR Chuyển Khoản Thanh Toán</h3>
          </div>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:16px 20px;">
          <!-- QR Card -->
          <div style="background:#ffffff; border-radius:12px; padding:16px; border:2px solid var(--accent); box-shadow:0 8px 24px rgba(0,0,0,0.15); margin-bottom:16px; display:flex; flex-direction:column; align-items:center;">
            <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">
              Quét mã bằng ứng dụng ngân hàng / Ví điện tử
            </div>
            <div style="max-width:280px; max-height:280px; width:100%; background:#f8fafc; border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid #e2e8f0; margin-bottom:10px;">
              <img id="vietqrImg" src="${displayQrUrl}" alt="Mã QR Chuyển Khoản" style="max-width:100%; max-height:270px; object-fit:contain;" 
                   onerror="if(this.src !== '${localQrDataUrl}' && '${localQrDataUrl}') { this.src='${localQrDataUrl}'; }">
            </div>
            <div style="font-size:24px; font-weight:800; color:#0284c7; line-height:1.2;">
              ${formatNumber(total)} ₫
            </div>
            <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
              Chuyển khoản chính xác số tiền đơn hàng
            </div>
          </div>

          <!-- Account info -->
          <div style="background:var(--bg-card); border-radius:8px; padding:12px 14px; text-align:left; font-size:13px; margin-bottom:16px; border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
              <span class="text-secondary">Ngân hàng:</span>
              <strong style="color:var(--text-primary);">${escapeHtml(bankName)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span class="text-secondary">Số tài khoản:</span>
              <div>
                <strong style="color:var(--cyan); font-family:monospace; font-size:14px;">${escapeHtml(bankAccountNo)}</strong>
                <button type="button" class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${bankAccountNo}'); showToast('success', 'Đã chép số tài khoản');" style="padding:2px 6px; font-size:11px; margin-left:4px;">📋 Chép</button>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
              <span class="text-secondary">Chủ tài khoản:</span>
              <strong style="text-transform:uppercase;">${escapeHtml(bankAccountName)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="text-secondary">Nội dung CK:</span>
              <div>
                <strong style="color:var(--orange); font-family:monospace;">${escapeHtml(transferSyntax)}</strong>
                <button type="button" class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${transferSyntax}'); showToast('success', 'Đã chép nội dung');" style="padding:2px 6px; font-size:11px; margin-left:4px;">📋 Chép</button>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-success" onclick="closeModal(); pageModules.pos.saveOrder(false);" style="width:100%; padding:12px; font-weight:700; font-size:14px;">
              ✅ Đã Nhận Tiền (Hoàn Tất Đơn)
            </button>
            <button class="btn btn-primary" onclick="closeModal(); pageModules.pos.saveOrder(true);" style="width:100%; padding:10px; font-size:13px;">
              🖨️ Đã Nhận Tiền & In Hóa Đơn
            </button>
          </div>
        </div>
      </div>
    `);
  }

  // Helper number format without symbol
  function formatNumber(num) {
    if (!num && num !== 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(Math.round(num));
  }

  // ==================== REGISTER ====================
  registerPage('pos', {
    render, init, loadProducts, addToCart, removeFromCart, updateQuantity,
    setQuantityDirect, cancelInvoice, addInvoice, switchInvoice, closeInvoice,
    onSearch, onCategorySelect, setFilter, onDiscountChange, onAmountPaidChange,
    onCustomerChange, onNoteChange, switchSubTab, saveOrder, onBarcode,
    quickAddProductPrompt, saveQuickProduct, quickAddCustomer, saveQuickCustomer,
    focusCustomer, focusDiscount, focusCash,
    openItemDiscountModal, switchItemDiscType, applyItemDiscount,
    setPaymentMethod, setQuickCash, onBarcodeOrSearchEnter, openVietQRModal
  });
})();
