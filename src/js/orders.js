/* ============================================
   ShopPro Desktop - Orders Module
   ============================================ */

(() => {
  let orders = [];
  let filterStatus = '';
  let filterPayment = '';
  let searchQuery = '';
  let dateFrom = '';
  let dateTo = '';

  function cleanProductName(name) {
    if (!name) return '';
    return String(name).replace(/\ufffdo/g, 'Áo').replace(/\ufffd/g, '');
  }

  function render() {
    const today = new Date().toISOString().split('T')[0];

    return `
      <div class="page-header">
        <h1>📋 Quản Lý Đơn Hàng</h1>
        <div class="page-header-actions">
          <button class="btn btn-outline btn-sm" onclick="pageModules.orders.refresh()">
            ${ICONS.refresh} Làm mới
          </button>
          <button class="btn btn-success btn-sm" onclick="pageModules.orders.exportExcel()">
            📥 Xuất Excel
          </button>
          <button class="btn btn-warning" onclick="pageModules.orders.openReturnModal()">
            🔄 Đổi Trả Hàng
          </button>
        </div>
      </div>

      <div class="toolbar">
        <div class="toolbar-search">
          ${ICONS.search}
          <input type="text" placeholder="Tìm theo mã đơn, khách hàng..." oninput="pageModules.orders.onSearch(this.value)">
        </div>
        <select class="form-control" style="min-width:170px;" onchange="pageModules.orders.onFilterStatus(this.value)">
          <option value="">Tất cả trạng thái</option>
          <option value="completed">Hoàn thành</option>
          <option value="pending">Chờ xử lý</option>
          <option value="cancelled">Đã hủy</option>
          <option value="returned">Trả hàng</option>
        </select>
        <select class="form-control" style="min-width:170px;" onchange="pageModules.orders.onFilterPayment(this.value)">
          <option value="">Tất cả thanh toán</option>
          <option value="cash">Tiền mặt</option>
          <option value="transfer">Chuyển khoản</option>
          <option value="momo">MoMo</option>
          <option value="zalopay">ZaloPay</option>
        </select>
        <input type="date" class="form-control" style="width:150px;" value="" onchange="pageModules.orders.onDateFrom(this.value)" title="Từ ngày">
        <input type="date" class="form-control" style="width:150px;" value="${today}" onchange="pageModules.orders.onDateTo(this.value)" title="Đến ngày">
      </div>

      <div class="page-content">
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Thu ngân</th>
                <th>Tổng tiền</th>
                <th>Thanh toán</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th style="width:100px;">Thao tác</th>
              </tr>
            </thead>
            <tbody id="ordersTableBody">
              <tr><td colspan="8" class="text-center text-muted" style="padding:40px;">Đang tải...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function init() {
    dateTo = new Date().toISOString().split('T')[0];
    await loadOrders();
  }

  async function loadOrders() {
    try {
      const filters = {};
      if (filterStatus) filters.status = filterStatus;
      if (filterPayment) filters.payment_method = filterPayment;
      if (searchQuery) filters.search = searchQuery;
      if (dateFrom) filters.date_from = dateFrom + ' 00:00:00';
      if (dateTo) filters.date_to = dateTo + ' 23:59:59';

      orders = await api.getOrders(filters);
      renderTable();
    } catch (err) {
      showToast('error', 'Lỗi tải đơn hàng', err.message);
    }
  }

  const paymentLabels = {
    cash: '💵 Tiền mặt',
    transfer: '🏦 CK',
    momo: '📱 MoMo',
    zalopay: '💳 ZaloPay'
  };

  const statusLabels = {
    completed: { text: 'Hoàn thành', class: 'badge-success' },
    pending: { text: 'Chờ xử lý', class: 'badge-warning' },
    cancelled: { text: 'Đã hủy', class: 'badge-danger' },
    returned: { text: 'Trả hàng', class: 'badge-info' }
  };

  function renderTable() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:40px;">Không có đơn hàng nào</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const status = statusLabels[o.status] || statusLabels.pending;
      return `
        <tr>
          <td><span class="fw-700 text-accent">${escapeHtml(o.order_code)}</span></td>
          <td>
            <div class="fw-600">${escapeHtml(o.customer_name || 'Khách vãng lai')}</div>
            ${o.customer_phone ? `<div class="text-muted" style="font-size:11px;">${escapeHtml(o.customer_phone)}</div>` : ''}
          </td>
          <td><span class="badge badge-default" style="font-size:11px; background:#f1f5f9; color:var(--text-secondary);">👤 ${escapeHtml(o.staff_name || 'Thu Ngân')}</span></td>
          <td class="fw-700 text-cyan">${formatCurrency(o.total)}</td>
          <td><span class="badge badge-default">${paymentLabels[o.payment_method] || o.payment_method}</span></td>
          <td><span class="badge ${status.class}">${status.text}</span></td>
          <td class="text-secondary" style="font-size:12px;">${formatDate(o.created_at)}</td>
          <td>
            <div class="flex gap-sm">
              <button class="btn btn-ghost btn-icon sm" onclick="pageModules.orders.viewOrder(${o.id})" title="Xem chi tiết">${ICONS.eye}</button>
              ${o.status === 'completed' ? `
                <button class="btn btn-ghost btn-icon sm" onclick="pageModules.orders.openReturnModal(${o.id})" title="Đổi / Trả hàng" style="color:#f59e0b;">🔄</button>
                <button class="btn btn-ghost btn-icon sm" onclick="pageModules.orders.cancelOrder(${o.id})" title="Hủy đơn" style="color:var(--danger);">${ICONS.x}</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function viewOrder(id) {
    try {
      const order = await api.getOrder(id);
      if (!order) return;

      const status = statusLabels[order.status] || statusLabels.pending;

      showModal(`
        <div class="modal" style="min-width:500px;">
          <div class="modal-header">
            <h3>📋 Đơn hàng ${order.order_code}</h3>
            <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">${ICONS.x}</button>
          </div>
          <div class="modal-body">
            <div class="flex justify-between mb-lg">
              <div>
                <div class="text-muted" style="font-size:12px;">Khách hàng</div>
                <div class="fw-600">${escapeHtml(order.customer_name || 'Khách vãng lai')}</div>
                ${order.customer_phone ? `<div class="text-secondary">${order.customer_phone}</div>` : ''}
              </div>
              <div style="text-align:center;">
                <div class="text-muted" style="font-size:12px;">Thu ngân</div>
                <div class="fw-600">👤 ${escapeHtml(order.staff_name || 'Thu Ngân')}</div>
              </div>
              <div class="text-right">
                <span class="badge ${status.class}">${status.text}</span>
                <div class="text-muted mt-sm" style="font-size:11px;">${formatDate(order.created_at)}</div>
              </div>
            </div>

            <div class="data-table-wrapper mb-lg">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Đơn giá</th>
                    <th>SL</th>
                    <th>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  ${(order.items || []).map(item => `
                    <tr>
                      <td>${escapeHtml(cleanProductName(item.product_name))}</td>
                      <td>${formatCurrency(item.price)}</td>
                      <td>${item.quantity}</td>
                      <td class="fw-600">${formatCurrency(item.subtotal)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div style="padding:var(--space-lg); background:var(--bg-input); border-radius:var(--radius-md);">
              <div class="flex justify-between mb-sm"><span class="text-secondary">Tạm tính</span><span>${formatCurrency(order.subtotal)}</span></div>
              ${order.discount_amount > 0 ? `<div class="flex justify-between mb-sm text-success"><span>Giảm giá</span><span>-${formatCurrency(order.discount_amount)}</span></div>` : ''}
              <div class="flex justify-between fw-800" style="font-size:16px;padding-top:8px;border-top:1px solid var(--border);">
                <span>Tổng cộng</span><span class="text-cyan">${formatCurrency(order.total)}</span>
              </div>
              <div class="flex justify-between mt-sm text-secondary" style="font-size:12px;">
                <span>Thanh toán: ${paymentLabels[order.payment_method] || order.payment_method}</span>
                ${order.payment_method === 'cash' ? `<span>Thừa: ${formatCurrency(order.change_amount)}</span>` : ''}
              </div>
            </div>
            ${order.note ? `<div class="mt-lg text-secondary" style="font-size:12px;"><strong>Ghi chú:</strong> ${escapeHtml(order.note)}</div>` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
            <button class="btn btn-outline" onclick="pageModules.orders.exportPdfReceipt(${order.id})">
              📄 Xuất PDF
            </button>
            <button class="btn btn-primary" onclick="pageModules.orders.printOrder(${order.id})">
              ${ICONS.printer} In hóa đơn
            </button>
          </div>
        </div>
      `);
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  async function cancelOrder(id) {
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'staff') {
      const authorized = await promptOwnerPin('Hủy đơn hàng đã hoàn thành');
      if (!authorized) {
        showToast('warning', 'Yêu cầu quyền Chủ Shop', 'Cần mã PIN của Chủ Cửa Hàng để hủy đơn hàng');
        return;
      }
    }

    if (!confirm('Bạn có chắc muốn hủy đơn hàng này? Tồn kho sẽ được hoàn lại.')) return;

    try {
      await api.cancelOrder(id);
      showToast('success', 'Đã hủy đơn hàng');
      await loadOrders();
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  async function printOrder(id) {
    try {
      const order = await api.getOrder(id);
      if (!order) return;

      const settings = await api.getAllSettings();
      const shopName = settings.shop_name || 'Shop';
      const shopAddress = settings.shop_address || '';
      const shopPhone = settings.shop_phone || '';
      const footer = settings.receipt_footer || 'Cảm ơn quý khách!';

      const html = `
        <html><head><style>
          body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; }
          .right { text-align: right; }
        </style></head>
        <body>
          <div class="center bold" style="font-size:16px;">${shopName}</div>
          ${shopAddress ? `<div class="center">${shopAddress}</div>` : ''}
          ${shopPhone ? `<div class="center">ĐT: ${shopPhone}</div>` : ''}
          <div class="line"></div>
          <div class="center bold">HÓA ĐƠN BÁN HÀNG</div>
          <div>Mã: ${order.order_code}</div>
          <div>Ngày: ${formatDate(order.created_at)}</div>
          <div>KH: ${order.customer_name || 'Khách vãng lai'}</div>
          ${order.staff_name ? `<div>Thu ngân: ${escapeHtml(order.staff_name)}</div>` : ''}
          <div>Hình thức: ${paymentLabels[order.payment_method] || order.payment_method}</div>
          <div class="line"></div>
          <table>
            ${(order.items || []).map(item => `
              <tr><td colspan="2">${escapeHtml(cleanProductName(item.product_name))}</td></tr>
              <tr><td>${item.quantity} x ${new Intl.NumberFormat('vi-VN').format(item.price)}</td><td class="right">${new Intl.NumberFormat('vi-VN').format(item.subtotal)}</td></tr>
            `).join('')}
          </table>
          <div class="line"></div>
          <table>
            <tr><td>Tạm tính:</td><td class="right">${new Intl.NumberFormat('vi-VN').format(order.subtotal)}₫</td></tr>
            ${order.discount_amount > 0 ? `<tr><td>Giảm giá:</td><td class="right">-${new Intl.NumberFormat('vi-VN').format(order.discount_amount)}₫</td></tr>` : ''}
            <tr class="bold"><td>TỔNG:</td><td class="right" style="font-size:14px;">${new Intl.NumberFormat('vi-VN').format(order.total)}₫</td></tr>
          </table>
          <div class="line"></div>
          <div class="center">${footer}</div>
        </body></html>
      `;

      await api.printReceipt(html);
      showToast('info', 'Đang in hóa đơn...');
    } catch (err) {
      showToast('error', 'Lỗi in', err.message);
    }
  }

  // ==================== ORDER RETURNS (ĐỔI TRẢ HÀNG) ====================

  let currentReturnOrder = null;

  async function openReturnModal(orderId = null) {
    if (orderId) {
      try {
        currentReturnOrder = await api.getOrder(orderId);
        renderReturnModalContent();
      } catch (err) {
        showToast('error', 'Lỗi tải đơn hàng', err.message);
      }
    } else {
      currentReturnOrder = null;
      renderReturnSearchModal();
    }
  }

  function renderReturnSearchModal() {
    showModal(`
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>🔄 Đổi Trả Hàng</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p class="text-secondary mb-md">Nhập mã hóa đơn cần thực hiện trả hàng (VD: HD260918-0001):</p>
          <div style="display:flex; gap:8px;">
            <input type="text" class="form-control" id="txtReturnOrderSearch" placeholder="Nhập mã đơn hàng..." style="font-weight:600;">
            <button class="btn btn-primary" onclick="pageModules.orders.searchOrderForReturn()">Tìm Đơn</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
        </div>
      </div>
    `);
    setTimeout(() => document.getElementById('txtReturnOrderSearch')?.focus(), 150);
  }

  async function searchOrderForReturn() {
    const code = document.getElementById('txtReturnOrderSearch')?.value.trim();
    if (!code) {
      showToast('warning', 'Nhập mã đơn', 'Vui lòng nhập mã đơn hàng');
      return;
    }

    try {
      const list = await api.getOrders({ search: code });
      const found = list.find(o => o.order_code.toLowerCase() === code.toLowerCase()) || list[0];
      if (!found) {
        showToast('error', 'Không tìm thấy', `Không tìm thấy đơn hàng "${code}"`);
        return;
      }
      currentReturnOrder = await api.getOrder(found.id);
      renderReturnModalContent();
    } catch (err) {
      showToast('error', 'Lỗi tìm đơn', err.message);
    }
  }

  function renderReturnModalContent() {
    const o = currentReturnOrder;
    if (!o) return;

    const items = o.items || [];
    showModal(`
      <div class="modal" style="min-width:680px; max-width:800px;">
        <div class="modal-header">
          <h3>🔄 Đổi Trả Hàng — Đơn ${o.order_code}</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex; justify-content:space-between; background:var(--bg-input); padding:12px; border-radius:8px; margin-bottom:16px; font-size:13px;">
            <div>Khách hàng: <strong>${escapeHtml(o.customer_name || 'Khách lẻ')}</strong> ${o.customer_phone ? `(${o.customer_phone})` : ''}</div>
            <div>Ngày mua: <strong>${formatDate(o.created_at)}</strong></div>
            <div>Tổng đơn gốc: <strong class="text-cyan">${formatCurrency(o.total)}</strong></div>
          </div>

          <div class="data-table-wrapper mb-lg">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th style="width:100px;">Đơn giá</th>
                  <th style="width:70px;">Đã mua</th>
                  <th style="width:70px;">Đã trả</th>
                  <th style="width:90px;">SL Trả lại</th>
                  <th style="width:110px;">Hoàn tiền</th>
                </tr>
              </thead>
              <tbody id="returnItemsTableBody">
                ${items.map((it, idx) => {
                  const alreadyRet = it.returned_quantity || 0;
                  const maxCanReturn = Math.max(0, it.quantity - alreadyRet);
                  const effectiveUnitPrice = it.quantity > 0 ? (it.subtotal / it.quantity) : it.price;
                  return `
                    <tr>
                      <td>
                        <div class="fw-600">${escapeHtml(cleanProductName(it.product_name))}</div>
                        <div class="text-muted" style="font-size:11px;">${escapeHtml(it.product_sku || '')}</div>
                      </td>
                      <td>${formatNumber(it.price)}₫</td>
                      <td>${it.quantity}</td>
                      <td>${alreadyRet > 0 ? `<span class="badge badge-warning">${alreadyRet}</span>` : '0'}</td>
                      <td>
                        <input type="number" class="form-control text-center" id="retQty_${idx}" 
                               value="0" min="0" max="${maxCanReturn}" ${maxCanReturn === 0 ? 'disabled' : ''}
                               style="width:70px; padding:4px;"
                               oninput="pageModules.orders.recalcReturnTotal()">
                      </td>
                      <td>
                        <span class="fw-700 text-orange" id="retSubtotal_${idx}">0₫</span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="form-row mb-md">
            <div class="form-group" style="flex:1;">
              <label class="form-label">LÝ DO TRẢ HÀNG</label>
              <select class="form-control" id="retReason">
                <option value="Hàng lỗi / Hư hỏng">Hàng lỗi / Hư hỏng</option>
                <option value="Khách đổi ý / Không vừa">Khách đổi ý / Không vừa</option>
                <option value="Sản phẩm cận / hết hạn sử dụng">Sản phẩm cận / hết hạn sử dụng</option>
                <option value="Giao nhầm sản phẩm">Giao nhầm sản phẩm</option>
                <option value="Khác">Khác...</option>
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">GHI CHÚ THÊM</label>
              <input type="text" class="form-control" id="retNote" placeholder="Chi tiết lỗi hoặc thỏa thuận...">
            </div>
          </div>

          <div style="background:#fef3c7; border:1px solid #f59e0b; padding:14px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-weight:700; color:#92400e; font-size:15px;">TỔNG TIỀN HOÀN TRẢ KHÁCH:</span>
              <div style="font-size:12px; color:#b45309;">(Tồn kho của các món được trả sẽ tự động hoàn lại vào kho)</div>
            </div>
            <div id="retTotalRefund" style="font-size:22px; font-weight:800; color:#b45309;">0₫</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
          <button class="btn btn-warning" onclick="pageModules.orders.submitOrderReturn()">
            ✅ Xác Nhận Trả Hàng & Hoàn Tiền
          </button>
        </div>
      </div>
    `);
  }

  function recalcReturnTotal() {
    const o = currentReturnOrder;
    if (!o || !o.items) return;

    let grandRefund = 0;
    o.items.forEach((it, idx) => {
      const input = document.getElementById(`retQty_${idx}`);
      const subtotalEl = document.getElementById(`retSubtotal_${idx}`);
      const alreadyRet = it.returned_quantity || 0;
      const maxCanReturn = Math.max(0, it.quantity - alreadyRet);

      let qty = parseInt(input?.value) || 0;
      if (qty < 0) qty = 0;
      if (qty > maxCanReturn) {
        qty = maxCanReturn;
        if (input) input.value = qty;
      }

      const effectiveUnitPrice = it.quantity > 0 ? (it.subtotal / it.quantity) : it.price;
      const refundSubtotal = Math.round(qty * effectiveUnitPrice);
      grandRefund += refundSubtotal;

      if (subtotalEl) {
        subtotalEl.textContent = formatCurrency(refundSubtotal);
      }
    });

    const totalRefundEl = document.getElementById('retTotalRefund');
    if (totalRefundEl) {
      totalRefundEl.textContent = formatCurrency(grandRefund);
    }
  }

  async function submitOrderReturn() {
    const o = currentReturnOrder;
    if (!o) return;

    const returnItems = [];
    let grandRefund = 0;

    o.items.forEach((it, idx) => {
      const input = document.getElementById(`retQty_${idx}`);
      const qty = parseInt(input?.value) || 0;
      if (qty > 0) {
        const effectiveUnitPrice = it.quantity > 0 ? (it.subtotal / it.quantity) : it.price;
        const refundSubtotal = Math.round(qty * effectiveUnitPrice);
        grandRefund += refundSubtotal;
        returnItems.push({
          order_item_id: it.id,
          product_id: it.product_id,
          quantity: qty,
          refund_subtotal: refundSubtotal
        });
      }
    });

    if (returnItems.length === 0) {
      showToast('warning', 'Chưa chọn số lượng', 'Vui lòng nhập số lượng cần trả ít nhất 1 sản phẩm');
      return;
    }

    const reason = document.getElementById('retReason')?.value || 'Khách đổi trả hàng';
    const note = document.getElementById('retNote')?.value.trim() || '';

    if (!confirm(`Xác nhận hoàn trả ${formatCurrency(grandRefund)} cho đơn hàng ${o.order_code}?`)) return;

    try {
      const res = await api.processOrderReturn({
        order_id: o.id,
        return_items: returnItems,
        reason,
        note
      });

      showToast('success', 'Đã tạo phiếu trả hàng!', `Mã phiếu: ${res.return_code} — Hoàn trả: ${formatCurrency(res.refund_amount)}`);
      closeModal();
      await loadOrders();

      // Print return receipt confirmation
      if (confirm('Bạn có muốn in Phiếu Trả Hàng (Return Receipt) không?')) {
        printReturnReceipt(res, o, returnItems, reason);
      }
    } catch (err) {
      showToast('error', 'Lỗi xử lý trả hàng', err.message);
    }
  }

  async function printReturnReceipt(retRes, origOrder, items, reason) {
    try {
      const settings = await api.getAllSettings();
      const shopName = settings.shop_name || 'Shop';
      const shopPhone = settings.shop_phone || '';

      const html = `
        <html><head><style>
          body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; }
          .right { text-align: right; }
        </style></head>
        <body>
          <div class="center bold" style="font-size:15px;">${shopName}</div>
          ${shopPhone ? `<div class="center" style="font-size:11px;">ĐT: ${shopPhone}</div>` : ''}
          <div class="line"></div>
          <div class="center bold" style="font-size:13px;">PHIẾU TRẢ HÀNG & HOÀN TIỀN</div>
          <div style="font-size:11px;">Mã phiếu: ${retRes.return_code}</div>
          <div style="font-size:11px;">Đơn gốc: ${origOrder.order_code}</div>
          <div style="font-size:11px;">Khách hàng: ${origOrder.customer_name || 'Khách lẻ'}</div>
          <div style="font-size:11px;">Ngày trả: ${new Date().toLocaleString('vi-VN')}</div>
          <div style="font-size:11px;">Lý do: ${escapeHtml(reason)}</div>
          <div class="line"></div>
          <table>
            ${items.map(it => {
              const origIt = origOrder.items.find(x => x.id === it.order_item_id) || {};
              return `
                <tr><td colspan="2" class="bold">${origIt.product_name || 'Sản phẩm'}</td></tr>
                <tr><td>Trả: ${it.quantity} món</td><td class="right">${new Intl.NumberFormat('vi-VN').format(it.refund_subtotal)}₫</td></tr>
              `;
            }).join('')}
          </table>
          <div class="line"></div>
          <table class="bold" style="font-size:13px;">
            <tr><td>TIỀN HOÀN TRẢ:</td><td class="right">${new Intl.NumberFormat('vi-VN').format(retRes.refund_amount)}₫</td></tr>
          </table>
          <div class="line"></div>
          <div class="center" style="font-size:11px;">Hàng trả lại đã được nhập lại vào kho.<br>Cảm ơn quý khách!</div>
        </body></html>
      `;

      await api.printReceipt(html);
    } catch (e) {
      console.error('Error printing return receipt:', e);
    }
  }

  // Filters
  const onSearch = debounce((v) => { searchQuery = v; loadOrders(); }, 300);
  function onFilterStatus(v) { filterStatus = v; loadOrders(); }
  function onFilterPayment(v) { filterPayment = v; loadOrders(); }
  function onDateFrom(v) { dateFrom = v; loadOrders(); }
  function onDateTo(v) { dateTo = v; loadOrders(); }

  function exportExcel() {
    const params = {};
    if (filterStatus) params.status = filterStatus;
    if (filterPayment) params.payment_method = filterPayment;
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    if (searchQuery) params.search = searchQuery;
    if (api && typeof api.exportExcel === 'function') {
      api.exportExcel('orders', params);
      showToast('success', 'Đang tải file Excel đơn hàng...');
    } else {
      window.open(`/api/export-excel/orders?${new URLSearchParams(params).toString()}`, '_blank');
    }
  }

  async function exportPdfReceipt(id) {
    try {
      const order = await api.getOrder(id);
      if (!order) return;
      if (window.pdfExporter) {
        window.pdfExporter.exportOrderReceiptPdf(order);
        showToast('info', 'Đã khởi tạo bản in PDF hóa đơn');
      } else {
        printOrder(id);
      }
    } catch (err) {
      showToast('error', 'Lỗi xuất PDF', err.message);
    }
  }

  async function refresh() {
    await loadOrders();
  }

  registerPage('orders', {
    render, init, viewOrder, cancelOrder, printOrder, exportExcel, exportPdfReceipt,
    openReturnModal, searchOrderForReturn, recalcReturnTotal, submitOrderReturn,
    onSearch, onFilterStatus, onFilterPayment, onDateFrom, onDateTo, refresh
  });
})();
