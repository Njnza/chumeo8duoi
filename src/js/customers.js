/* ============================================
   ShopPro Desktop - Customers Module
   ============================================ */

(() => {
  let customers = [];
  let memberTiers = [];
  let editingCustomer = null;

  function render() {
    return `
      <div class="page-header">
        <h1>👥 Quản Lý Khách Hàng</h1>
        <div class="page-header-actions">
          <button class="btn btn-outline btn-sm" onclick="pageModules.customers.refresh()">
            ${ICONS.refresh} Làm mới
          </button>
          <button class="btn btn-primary" onclick="pageModules.customers.openAdd()">
            ${ICONS.plus} Thêm Khách Hàng
          </button>
        </div>
      </div>

      <div class="toolbar">
        <div class="toolbar-search">
          ${ICONS.search}
          <input type="text" placeholder="Tìm theo tên, SĐT..." oninput="pageModules.customers.onSearch(this.value)">
        </div>
      </div>

      <div class="page-content">
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Hạng thành viên</th>
                <th>Số điện thoại</th>
                <th>Email</th>
                <th>Địa chỉ</th>
                <th>Tổng chi tiêu</th>
                <th>Số lần mua</th>
                <th style="width:100px;">Thao tác</th>
              </tr>
            </thead>
            <tbody id="customersTableBody">
              <tr><td colspan="8" class="text-center text-muted" style="padding:40px;">Đang tải...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function init() {
    try {
      memberTiers = await api.getMemberTiers();
    } catch (_) {}
    await loadCustomers();
  }

  function getCustomerTier(cust) {
    if (!memberTiers || memberTiers.length === 0) {
      return { id: 'bronze', name: 'Đồng', badge: '🥉', discount_percent: 0, color: '#cd7f32', mode: 'auto' };
    }
    if (!cust) return { ...memberTiers[0], mode: 'auto' };

    // 1. Chế độ cố định / thủ công
    if (cust.tier_mode === 'manual' && cust.fixed_tier_id) {
      const fixed = memberTiers.find(t => t.id === cust.fixed_tier_id);
      if (fixed) return { ...fixed, mode: 'manual' };
    }

    // 2. Chế độ tự động theo chi tiêu
    let tiers = memberTiers;
    let hasCustomThresholds = false;
    if (cust.custom_tiers_json) {
      try {
        const customMap = typeof cust.custom_tiers_json === 'string'
          ? JSON.parse(cust.custom_tiers_json)
          : cust.custom_tiers_json;
        if (customMap && typeof customMap === 'object' && Object.keys(customMap).length > 0) {
          hasCustomThresholds = true;
          tiers = memberTiers.map(t => ({
            ...t,
            min_spent: customMap[t.id] !== undefined ? (parseFloat(customMap[t.id]) || 0) : (t.min_spent || 0)
          }));
        }
      } catch (_) {}
    }

    const spent = cust.total_spent || 0;
    const sorted = [...tiers].sort((a, b) => (b.min_spent || 0) - (a.min_spent || 0));
    const matched = sorted.find(t => spent >= (t.min_spent || 0)) || memberTiers[0];
    return { ...matched, mode: hasCustomThresholds ? 'custom_auto' : 'auto' };
  }

  function formatNumber(amount) {
    if (!amount && amount !== 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(amount);
  }

  async function loadCustomers() {
    try {
      const filters = {};
      if (searchQuery) filters.search = searchQuery;
      [customers, memberTiers] = await Promise.all([
        api.getCustomers(filters),
        api.getMemberTiers()
      ]);
      renderTable();
    } catch (err) {
      showToast('error', 'Lỗi tải khách hàng', err.message);
    }
  }

  let searchQuery = '';

  function renderTable() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    if (customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:40px;">
        ${searchQuery ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng nào'}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = customers.map(c => {
      const tier = getCustomerTier(c);
      let modeBadge = '';
      if (tier.mode === 'manual') {
        modeBadge = `<span class="badge" style="font-size:10px; padding:2px 6px; background:var(--bg-tertiary); color:var(--text-secondary); border:1px solid var(--border-color);" title="Hạng cố định được chỉ định thủ công">📌 Cố định</span>`;
      } else if (tier.mode === 'custom_auto') {
        modeBadge = `<span class="badge" style="font-size:10px; padding:2px 6px; background:var(--accent-light); color:var(--accent); border:1px solid var(--accent);" title="Tự động theo ngưỡng chi tiêu riêng của khách">⚙️ Ngưỡng riêng</span>`;
      } else {
        modeBadge = `<span class="badge" style="font-size:10px; padding:2px 6px; background:var(--bg-tertiary); color:var(--text-muted); border:1px solid var(--border-color);" title="Tự động theo ngưỡng chi tiêu chuẩn hệ thống">🔄 Theo chi tiêu</span>`;
      }

      return `
        <tr>
          <td>
            <div class="flex items-center gap-md">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;color:var(--accent);font-weight:700;flex-shrink:0;">
                ${(c.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div class="fw-600">${escapeHtml(c.name)}</div>
                ${c.note ? `<div class="text-muted" style="font-size:11px;">${escapeHtml(c.note).substring(0, 40)}</div>` : ''}
              </div>
            </div>
          </td>
          <td>
            <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
              <span class="badge" style="background:${tier.color || '#cd7f32'}22; color:${tier.color || '#cd7f32'}; font-weight:700; border:1px solid ${tier.color || '#cd7f32'}44;">
                ${tier.badge || '⭐'} ${escapeHtml(tier.name)} ${tier.discount_percent > 0 ? `(-${tier.discount_percent}%)` : ''}
              </span>
              ${modeBadge}
            </div>
          </td>
          <td class="fw-600">${escapeHtml(c.phone || '—')}</td>
          <td class="text-secondary">${escapeHtml(c.email || '—')}</td>
          <td class="text-secondary" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.address || '—')}</td>
          <td class="fw-700 text-cyan">${formatCurrency(c.total_spent || 0)}</td>
          <td>${c.visit_count || 0} lần</td>
          <td>
            <div class="flex gap-sm">
              <button class="btn btn-ghost btn-icon sm" onclick="pageModules.customers.openEdit(${c.id})" title="Sửa">${ICONS.edit}</button>
              <button class="btn btn-ghost btn-icon sm" onclick="pageModules.customers.deleteCustomer(${c.id})" title="Xóa" style="color:var(--danger);">${ICONS.trash}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function openAdd() {
    editingCustomer = null;
    try {
      if (!memberTiers || memberTiers.length === 0) {
        memberTiers = await api.getMemberTiers();
      }
    } catch (_) {}
    showCustomerModal('Thêm Khách Hàng');
  }

  async function openEdit(id) {
    try {
      if (!memberTiers || memberTiers.length === 0) {
        memberTiers = await api.getMemberTiers();
      }
      editingCustomer = await api.getCustomer(id);
      if (!editingCustomer) {
        showToast('error', 'Không tìm thấy thông tin khách hàng');
        return;
      }
      showCustomerModal('Sửa Thông Tin Khách Hàng');
    } catch (err) {
      console.error('Error in openEdit:', err);
      showToast('error', 'Lỗi mở sửa khách hàng', err.message);
    }
  }

  function showCustomerModal(title) {
    const c = editingCustomer || {};
    const tierMode = c.tier_mode || 'auto';
    const isAuto = tierMode === 'auto';

    // Parse custom thresholds
    let customThresholds = {};
    let hasCustomThresholds = false;
    if (c.custom_tiers_json) {
      try {
        const parsed = typeof c.custom_tiers_json === 'string'
          ? JSON.parse(c.custom_tiers_json)
          : c.custom_tiers_json;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          customThresholds = parsed;
          hasCustomThresholds = true;
        }
      } catch (_) {}
    }

    showModal(`
      <div class="modal" style="min-width:540px; max-width:620px;">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">${ICONS.x}</button>
        </div>
        <div class="modal-body" style="max-height: calc(85vh - 120px); overflow-y: auto; padding: 20px;">
          <!-- Basic info -->
          <div class="form-group">
            <label class="form-label">TÊN KHÁCH HÀNG *</label>
            <input type="text" class="form-control" id="custName" value="${escapeHtml(c.name || '')}" required placeholder="Ví dụ: Nguyễn Văn A">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">SỐ ĐIỆN THOẠI</label>
              <input type="tel" class="form-control" id="custPhone" value="${escapeHtml(c.phone || '')}" placeholder="0901234567">
            </div>
            <div class="form-group">
              <label class="form-label">EMAIL</label>
              <input type="email" class="form-control" id="custEmail" value="${escapeHtml(c.email || '')}" placeholder="khachhang@email.com">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">ĐỊA CHỈ</label>
            <input type="text" class="form-control" id="custAddress" value="${escapeHtml(c.address || '')}" placeholder="Địa chỉ giao hàng / nhà riêng">
          </div>
          <div class="form-group">
            <label class="form-label">GHI CHÚ</label>
            <textarea class="form-control" id="custNote" rows="2" placeholder="Ghi chú về khách hàng...">${escapeHtml(c.note || '')}</textarea>
          </div>

          <!-- Divider -->
          <div style="margin: 18px 0 14px 0; border-top: 1px dashed var(--border-color);"></div>

          <!-- Member Tier Configuration Section -->
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 12px; display:flex; align-items:center; gap:8px;">
            <span>👑 Cấu Hình Hạng Thành Viên & Chiết Khấu</span>
          </div>

          <!-- Switch 2 chế độ -->
          <div class="form-group" style="margin-bottom:14px;">
            <label class="form-label">CHẾ ĐỘ XÁC ĐỊNH HẠNG THÀNH VIÊN</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px;">
              <label id="lblTierModeAuto" style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px 12px; border:2px solid ${isAuto ? 'var(--accent)' : 'var(--border-color)'}; border-radius:8px; background:${isAuto ? 'var(--accent-light)' : 'var(--bg-tertiary)'}; transition:all 0.2s;">
                <input type="radio" name="custTierMode" value="auto" ${isAuto ? 'checked' : ''} onchange="pageModules.customers.onTierModeChange('auto')" style="margin-top:2px;">
                <div>
                  <div style="font-weight:700; font-size:13px; color:var(--text-primary);">🔄 Theo chi tiêu tích lũy</div>
                  <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Tự động xếp hạng theo tổng tiền khách đã mua hàng</div>
                </div>
              </label>

              <label id="lblTierModeManual" style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px 12px; border:2px solid ${!isAuto ? 'var(--accent)' : 'var(--border-color)'}; border-radius:8px; background:${!isAuto ? 'var(--accent-light)' : 'var(--bg-tertiary)'}; transition:all 0.2s;">
                <input type="radio" name="custTierMode" value="manual" ${!isAuto ? 'checked' : ''} onchange="pageModules.customers.onTierModeChange('manual')" style="margin-top:2px;">
                <div>
                  <div style="font-weight:700; font-size:13px; color:var(--text-primary);">📌 Cố định / Thủ công</div>
                  <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Chỉ định trực tiếp một hạng cố định, không theo chi tiêu</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Section: Manual Tier Selection -->
          <div id="custManualTierSection" style="${!isAuto ? 'display:block;' : 'display:none;'}">
            <div class="form-group" style="background:var(--bg-surface); border:1px solid var(--border-color); padding:14px; border-radius:8px;">
              <label class="form-label" style="margin-bottom:6px;">CHỌN HẠNG THÀNH VIÊN GÁN CỐ ĐỊNH</label>
              <select class="form-control" id="custFixedTierId" style="font-size:13px; font-weight:600;">
                ${memberTiers.map(t => `
                  <option value="${t.id}" ${c.fixed_tier_id === t.id ? 'selected' : ''}>
                    ${t.badge || '⭐'} ${t.name} — Chiết khấu ưu đãi: ${t.discount_percent}%
                  </option>
                `).join('')}
              </select>
              <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">
                💡 Khách hàng này sẽ luôn được hưởng mức chiết khấu của hạng trên mỗi khi thanh toán tại POS, bất kể tổng tiền tích lũy là bao nhiêu.
              </div>
            </div>
          </div>

          <!-- Section: Auto Tier by Spending -->
          <div id="custAutoTierSection" style="${isAuto ? 'display:block;' : 'display:none;'}">
            <div style="background:var(--bg-surface); border:1px solid var(--border-color); padding:14px; border-radius:8px;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px; margin:0; user-select:none;">
                  <input type="checkbox" id="custUseCustomThresholds" ${hasCustomThresholds ? 'checked' : ''} onchange="pageModules.customers.onToggleCustomThresholds(this.checked)">
                  <span>⚙️ Tùy chỉnh ngưỡng chi tiêu riêng cho khách này</span>
                </label>
                <button type="button" class="btn btn-ghost btn-sm" id="btnResetThresholds" style="${hasCustomThresholds ? 'display:inline-flex;' : 'display:none;'} font-size:11px; padding:2px 8px;" onclick="pageModules.customers.resetCustomThresholds()">
                  ↺ Ngưỡng chuẩn
                </button>
              </div>

              <!-- Custom Thresholds Grid -->
              <div id="custCustomThresholdsContainer" style="${hasCustomThresholds ? 'display:block;' : 'display:none;'} margin-top:12px;">
                <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">
                  Nhập số tiền chi tiêu tối thiểu (VNĐ) để khách hàng này đạt từng hạng:
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${memberTiers.map(t => {
                    const defaultMin = t.min_spent || 0;
                    const curMin = customThresholds[t.id] !== undefined ? customThresholds[t.id] : defaultMin;
                    return `
                      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-tertiary); padding:8px 12px; border-radius:6px; border:1px solid var(--border-color);">
                        <div style="display:flex; align-items:center; gap:8px; min-width:140px;">
                          <span style="font-size:16px;">${t.badge || '⭐'}</span>
                          <div>
                            <div style="font-weight:600; font-size:13px;">${escapeHtml(t.name)}</div>
                            <div style="font-size:11px; color:var(--text-muted);">Giảm ${t.discount_percent}% (Chuẩn: ${formatNumber(defaultMin)}₫)</div>
                          </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <input type="number" class="form-control form-control-sm cust-threshold-input" 
                                 id="custThreshold_${t.id}"
                                 data-tier-id="${t.id}" 
                                 data-default-min="${defaultMin}"
                                 value="${curMin}" 
                                 min="0" step="100000" 
                                 style="width:140px; text-align:right; font-weight:600;">
                          <span style="font-size:12px; color:var(--text-muted);">₫</span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Default Thresholds Notice -->
              <div id="custDefaultThresholdsHint" style="${!hasCustomThresholds ? 'display:block;' : 'display:none;'} font-size:12px; color:var(--text-muted); margin-top:4px; line-height:1.5;">
                ℹ️ Đang dùng ngưỡng chi tiêu chuẩn toàn hệ thống: <br>
                ${memberTiers.map(t => `<strong>${t.badge || ''} ${escapeHtml(t.name)}:</strong> từ ${formatNumber(t.min_spent || 0)}₫ (giảm ${t.discount_percent}%)`).join(' &bull; ')}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          <button class="btn btn-primary" onclick="pageModules.customers.save()">💾 Lưu Thông Tin</button>
        </div>
      </div>
    `);
  }

  function onTierModeChange(mode) {
    const manualSec = document.getElementById('custManualTierSection');
    const autoSec = document.getElementById('custAutoTierSection');
    const lblAuto = document.getElementById('lblTierModeAuto');
    const lblManual = document.getElementById('lblTierModeManual');

    if (mode === 'manual') {
      if (manualSec) manualSec.style.display = 'block';
      if (autoSec) autoSec.style.display = 'none';
      if (lblAuto) {
        lblAuto.style.borderColor = 'var(--border-color)';
        lblAuto.style.background = 'var(--bg-tertiary)';
      }
      if (lblManual) {
        lblManual.style.borderColor = 'var(--accent)';
        lblManual.style.background = 'var(--accent-light)';
      }
    } else {
      if (manualSec) manualSec.style.display = 'none';
      if (autoSec) autoSec.style.display = 'block';
      if (lblAuto) {
        lblAuto.style.borderColor = 'var(--accent)';
        lblAuto.style.background = 'var(--accent-light)';
      }
      if (lblManual) {
        lblManual.style.borderColor = 'var(--border-color)';
        lblManual.style.background = 'var(--bg-tertiary)';
      }
    }
  }

  function onToggleCustomThresholds(checked) {
    const container = document.getElementById('custCustomThresholdsContainer');
    const hint = document.getElementById('custDefaultThresholdsHint');
    const btnReset = document.getElementById('btnResetThresholds');

    if (container) container.style.display = checked ? 'block' : 'none';
    if (hint) hint.style.display = !checked ? 'block' : 'none';
    if (btnReset) btnReset.style.display = checked ? 'inline-flex' : 'none';
  }

  function resetCustomThresholds() {
    const inputs = document.querySelectorAll('.cust-threshold-input');
    inputs.forEach(inp => {
      inp.value = inp.getAttribute('data-default-min') || '0';
    });
    showToast('info', 'Đã đặt lại', 'Đã gán lại các mức chi tiêu theo ngưỡng chuẩn');
  }

  async function save() {
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const address = document.getElementById('custAddress').value.trim();
    const note = document.getElementById('custNote').value.trim();

    if (!name) { showToast('warning', 'Nhập tên khách hàng'); return; }

    const tierModeRadio = document.querySelector('input[name="custTierMode"]:checked');
    const tier_mode = tierModeRadio ? tierModeRadio.value : 'auto';

    let fixed_tier_id = '';
    let custom_tiers_json = '';

    if (tier_mode === 'manual') {
      fixed_tier_id = document.getElementById('custFixedTierId')?.value || '';
      custom_tiers_json = '';
    } else {
      fixed_tier_id = '';
      const useCustom = document.getElementById('custUseCustomThresholds')?.checked;
      if (useCustom) {
        const customMap = {};
        const inputs = document.querySelectorAll('.cust-threshold-input');
        inputs.forEach(inp => {
          const tid = inp.getAttribute('data-tier-id');
          if (tid) {
            customMap[tid] = parseFloat(inp.value) || 0;
          }
        });
        custom_tiers_json = JSON.stringify(customMap);
      } else {
        custom_tiers_json = '';
      }
    }

    const data = {
      name,
      phone,
      email,
      address,
      note,
      tier_mode,
      fixed_tier_id,
      custom_tiers_json
    };

    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, data);
        showToast('success', 'Đã cập nhật', data.name);
      } else {
        await api.addCustomer(data);
        showToast('success', 'Đã thêm', data.name);
      }
      closeModal();
      await loadCustomers();
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  async function deleteCustomer(id) {
    const c = customers.find(x => x.id === id);
    if (!confirm(`Xóa khách hàng "${c?.name}"?`)) return;

    try {
      await api.deleteCustomer(id);
      showToast('success', 'Đã xóa');
      await loadCustomers();
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  const onSearch = debounce((v) => { searchQuery = v; loadCustomers(); }, 300);
  async function refresh() { await loadCustomers(); }

  registerPage('customers', {
    render, init, openAdd, openEdit, save, deleteCustomer, onSearch, refresh,
    onTierModeChange, onToggleCustomThresholds, resetCustomThresholds
  });
})();
