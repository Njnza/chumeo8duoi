/* ============================================
   ADMIN - Dashboard & Management Logic
   ============================================ */

// State
let adminProducts = [];
let adminOrders = [];
let adminCategories = [];
let editingProduct = null;

/**
 * Initialize admin page
 */
async function initAdmin() {
  if (!isApiConfigured()) {
    document.getElementById('adminApiNotice').classList.remove('hidden');
  }
  
  // Load dashboard by default
  switchTab('dashboard');
}

/**
 * Switch between admin tabs
 */
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tabName}`);
  });
  
  // Load data for the tab
  switch (tabName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'products':
      loadAdminProducts();
      break;
    case 'orders':
      loadAdminOrders();
      break;
    case 'categories':
      loadAdminCategories();
      break;
  }
}

// ========== DASHBOARD ==========

async function loadDashboard() {
  try {
    const result = await getData('dashboard');
    if (result.success && result.data) {
      renderDashboard(result.data);
    }
  } catch (e) {
    console.error('Dashboard error:', e);
  }
}

function renderDashboard(data) {
  // Stats
  document.getElementById('dashTotalProducts').textContent = data.totalProducts || 0;
  document.getElementById('dashTotalOrders').textContent = data.totalOrders || 0;
  document.getElementById('dashTotalRevenue').textContent = formatCurrency(data.totalRevenue || 0);
  document.getElementById('dashTodayRevenue').textContent = formatCurrency(data.todayRevenue || 0);
  
  // Revenue chart (simple bar chart)
  renderRevenueChart(data.last7Days || []);
  
  // Top products
  renderTopProducts(data.topProducts || []);
  
  // Low stock
  renderLowStock(data.lowStock || []);
  
  // Recent orders
  renderRecentOrders(data.recentOrders || []);
}

function renderRevenueChart(days) {
  const container = document.getElementById('revenueChart');
  if (days.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">Chưa có dữ liệu</p>';
    return;
  }
  
  const maxRevenue = Math.max(...days.map(d => d.revenue), 1);
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  
  container.innerHTML = `
    <div style="display:flex; align-items:flex-end; gap:8px; height:180px; padding-top:var(--space-md);">
      ${days.map(day => {
        const height = Math.max(4, (day.revenue / maxRevenue) * 100);
        const date = new Date(day.date);
        const dayName = dayNames[date.getDay()];
        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
        return `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
            <div style="font-size:0.7rem; color:var(--text-muted);">${formatCurrency(day.revenue).replace('₫','')}</div>
            <div style="width:100%; height:${height}%; background:var(--gradient-accent); border-radius:6px 6px 0 0; min-height:4px; transition: height 0.5s var(--ease); position:relative;" title="${formatCurrency(day.revenue)}">
            </div>
            <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:500;">${dayName}</div>
            <div style="font-size:0.65rem; color:var(--text-muted);">${dateStr}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTopProducts(products) {
  const container = document.getElementById('topProducts');
  if (products.length === 0) {
    container.innerHTML = '<p class="text-muted">Chưa có dữ liệu</p>';
    return;
  }
  
  container.innerHTML = products.map((p, i) => `
    <div class="flex items-center gap-md" style="padding:var(--space-sm) 0; ${i < products.length - 1 ? 'border-bottom:1px solid var(--glass-border);' : ''}">
      <div style="width:28px; height:28px; border-radius:50%; background:var(--gradient-primary); display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700; flex-shrink:0;">${i + 1}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:0.85rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.name)}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Đã bán: ${p.quantity}</div>
      </div>
      <div style="font-size:0.85rem; font-weight:600; color:var(--accent);">${formatCurrency(p.revenue)}</div>
    </div>
  `).join('');
}

function renderLowStock(products) {
  const container = document.getElementById('lowStockList');
  if (products.length === 0) {
    container.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">✅ Tất cả sản phẩm đều đủ hàng</p>';
    return;
  }
  
  container.innerHTML = products.map(p => `
    <div class="flex items-center justify-between" style="padding:var(--space-xs) 0;">
      <span style="font-size:0.85rem;">${escapeHtml(p.Name)}</span>
      <span class="badge badge-danger">${p.Stock} sản phẩm</span>
    </div>
  `).join('');
}

function renderRecentOrders(orders) {
  const container = document.getElementById('recentOrdersList');
  if (orders.length === 0) {
    container.innerHTML = '<p class="text-muted">Chưa có đơn hàng</p>';
    return;
  }
  
  container.innerHTML = orders.map(order => {
    const status = APP_CONFIG.ORDER_STATUSES[order.Status] || { label: order.Status, color: 'info' };
    return `
      <div class="flex items-center gap-md" style="padding:var(--space-sm) 0; border-bottom:1px solid var(--glass-border);">
        <div style="flex:1;">
          <div style="font-size:0.85rem; font-weight:600;">#${order.OrderID}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(order.CustomerName || 'Khách vãng lai')} • ${formatDate(order.CreatedAt)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.85rem; font-weight:600; color:var(--accent);">${formatCurrency(order.TotalAmount)}</div>
          <span class="badge badge-${status.color}">${status.label}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ========== PRODUCTS MANAGEMENT ==========

async function loadAdminProducts() {
  const container = document.getElementById('productsTableBody');
  container.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:var(--space-2xl);"><div class="loading-spinner" style="margin:0 auto;"></div></td></tr>';
  
  try {
    const result = await getData('products');
    if (result.success) {
      adminProducts = result.data;
      renderProductsTable();
    }
  } catch (e) {
    container.innerHTML = `<tr><td colspan="8" class="text-center text-danger" style="padding:var(--space-2xl);">Lỗi: ${e.message}</td></tr>`;
  }
  
  // Load categories for the form
  try {
    const catResult = await getData('categories');
    if (catResult.success) {
      adminCategories = catResult.data;
      updateProductFormCategories();
    }
  } catch (e) {}
}

function renderProductsTable() {
  const container = document.getElementById('productsTableBody');
  
  if (adminProducts.length === 0) {
    container.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:var(--space-2xl);"><div class="empty-icon" style="font-size:2rem;">📦</div><p class="text-muted mt-sm">Chưa có sản phẩm</p></td></tr>`;
    return;
  }
  
  container.innerHTML = adminProducts.map(p => {
    const hasDiscount = p.SalePrice && p.SalePrice > 0 && p.SalePrice < p.Price;
    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:var(--space-sm);">
            <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;overflow:hidden;">
              ${p.ImageURL ? `<img src="${escapeHtml(p.ImageURL)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='📦'">` : '📦'}
            </div>
            <div>
              <div style="font-weight:600;font-size:0.85rem;">${escapeHtml(p.Name)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(p.SKU)}</div>
            </div>
          </div>
        </td>
        <td><span class="badge badge-primary">${escapeHtml(p.Category || '—')}</span></td>
        <td>
          <div style="font-weight:600;">${formatCurrency(hasDiscount ? p.SalePrice : p.Price)}</div>
          ${hasDiscount ? `<div style="font-size:0.75rem;color:var(--text-muted);text-decoration:line-through;">${formatCurrency(p.Price)}</div>` : ''}
        </td>
        <td>
          <span class="badge ${Number(p.Stock) < 10 ? 'badge-danger' : 'badge-success'}">${p.Stock || 0}</span>
        </td>
        <td><span class="badge badge-${p.Status === 'active' ? 'success' : 'warning'}">${p.Status === 'active' ? 'Hoạt động' : 'Ẩn'}</span></td>
        <td style="font-size:0.8rem;color:var(--text-muted);">${formatDateShort(p.CreatedAt)}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" onclick="editProduct('${p.ID}')" title="Sửa">
              <i data-lucide="edit-2" style="width:15px;height:15px;"></i>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="confirmDeleteProduct('${p.ID}', '${escapeHtml(p.Name)}')" title="Xóa" style="color:var(--danger);">
              <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

function updateProductFormCategories() {
  const select = document.getElementById('editProdCategory');
  if (!select) return;
  const defaultOpt = select.options[0];
  select.innerHTML = '';
  select.appendChild(defaultOpt);
  adminCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.Name;
    opt.textContent = cat.Name;
    select.appendChild(opt);
  });
}

function openAddProduct() {
  editingProduct = null;
  document.getElementById('productModalTitle').textContent = 'Thêm Sản Phẩm Mới';
  document.getElementById('editProductForm').reset();
  document.getElementById('editProdId').value = '';
  openModal('productModal');
}

function editProduct(id) {
  const product = adminProducts.find(p => p.ID === id);
  if (!product) return;
  
  editingProduct = product;
  document.getElementById('productModalTitle').textContent = 'Sửa Sản Phẩm';
  document.getElementById('editProdId').value = product.ID;
  document.getElementById('editProdSku').value = product.SKU || '';
  document.getElementById('editProdName').value = product.Name || '';
  document.getElementById('editProdDescription').value = product.Description || '';
  document.getElementById('editProdPrice').value = product.Price || '';
  document.getElementById('editProdSalePrice').value = product.SalePrice || '';
  document.getElementById('editProdCategory').value = product.Category || '';
  document.getElementById('editProdStock').value = product.Stock || '';
  document.getElementById('editProdImageUrl').value = product.ImageURL || '';
  document.getElementById('editProdStatus').value = product.Status || 'active';
  
  openModal('productModal');
}

async function saveProduct(event) {
  event.preventDefault();
  
  const btnSave = document.getElementById('btnSaveProduct');
  btnSave.disabled = true;
  btnSave.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;border-width:2px;"></div> Đang lưu...';
  
  const productData = {
    SKU: document.getElementById('editProdSku').value.trim(),
    Name: document.getElementById('editProdName').value.trim(),
    Description: document.getElementById('editProdDescription').value.trim(),
    Price: Number(document.getElementById('editProdPrice').value),
    SalePrice: Number(document.getElementById('editProdSalePrice').value) || 0,
    Category: document.getElementById('editProdCategory').value,
    Stock: Number(document.getElementById('editProdStock').value) || 0,
    ImageURL: document.getElementById('editProdImageUrl').value.trim(),
    Status: document.getElementById('editProdStatus').value
  };
  
  if (!productData.SKU || !productData.Name || !productData.Price) {
    toast.error('Thiếu thông tin', 'Vui lòng điền SKU, Tên và Giá bán');
    btnSave.disabled = false;
    btnSave.innerHTML = '<i data-lucide="save"></i> Lưu';
    lucide.createIcons();
    return;
  }
  
  try {
    let result;
    const existingId = document.getElementById('editProdId').value;
    
    if (isApiConfigured()) {
      if (existingId) {
        productData.ID = existingId;
        result = await api.updateProduct(productData);
      } else {
        result = await api.addProduct(productData);
      }
    } else {
      await new Promise(r => setTimeout(r, 800));
      if (existingId) {
        const idx = adminProducts.findIndex(p => p.ID === existingId);
        if (idx >= 0) {
          adminProducts[idx] = { ...adminProducts[idx], ...productData };
        }
      } else {
        productData.ID = 'P' + String(adminProducts.length + 1).padStart(3, '0');
        productData.CreatedAt = new Date().toISOString();
        productData.UpdatedAt = new Date().toISOString();
        adminProducts.push(productData);
      }
      result = { success: true, message: `[Demo] Đã ${existingId ? 'cập nhật' : 'thêm'}: ${productData.Name}` };
    }
    
    if (result.success) {
      toast.success('Thành công', result.message);
      closeModal('productModal');
      loadAdminProducts();
    } else {
      toast.error('Lỗi', result.error);
    }
  } catch (error) {
    toast.error('Lỗi', error.message);
  }
  
  btnSave.disabled = false;
  btnSave.innerHTML = '<i data-lucide="save"></i> Lưu';
  lucide.createIcons();
}

function confirmDeleteProduct(id, name) {
  if (confirm(`Bạn có chắc muốn xóa sản phẩm "${name}"?`)) {
    deleteProductById(id);
  }
}

async function deleteProductById(id) {
  try {
    let result;
    if (isApiConfigured()) {
      result = await api.deleteProduct(id);
    } else {
      adminProducts = adminProducts.filter(p => p.ID !== id);
      result = { success: true, message: '[Demo] Đã xóa sản phẩm' };
    }
    
    if (result.success) {
      toast.success('Đã xóa', result.message);
      renderProductsTable();
    }
  } catch (error) {
    toast.error('Lỗi', error.message);
  }
}

// ========== ORDERS MANAGEMENT ==========

async function loadAdminOrders() {
  const container = document.getElementById('ordersTableBody');
  container.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:var(--space-2xl);"><div class="loading-spinner" style="margin:0 auto;"></div></td></tr>';
  
  try {
    const result = await getData('orders');
    if (result.success) {
      adminOrders = result.data;
      renderOrdersTable();
    }
  } catch (e) {
    container.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${e.message}</td></tr>`;
  }
}

function renderOrdersTable() {
  const container = document.getElementById('ordersTableBody');
  
  if (adminOrders.length === 0) {
    container.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:var(--space-2xl);"><p class="text-muted">Chưa có đơn hàng</p></td></tr>`;
    return;
  }
  
  container.innerHTML = adminOrders.map(order => {
    const status = APP_CONFIG.ORDER_STATUSES[order.Status] || { label: order.Status, color: 'info' };
    const payment = APP_CONFIG.PAYMENT_METHODS[order.PaymentMethod] || order.PaymentMethod;
    const items = Array.isArray(order.Items) ? order.Items : [];
    
    return `
      <tr>
        <td><strong style="color:var(--accent);">#${order.OrderID}</strong></td>
        <td>
          <div style="font-weight:600;font-size:0.85rem;">${escapeHtml(order.CustomerName || 'Khách vãng lai')}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(order.CustomerPhone || '—')}</div>
        </td>
        <td>
          <div style="font-size:0.8rem;">
            ${items.slice(0, 2).map(item => `${escapeHtml(item.name)} ×${item.quantity}`).join('<br>')}
            ${items.length > 2 ? `<br><span class="text-muted">+${items.length - 2} sản phẩm khác</span>` : ''}
          </div>
        </td>
        <td><strong>${formatCurrency(order.TotalAmount)}</strong></td>
        <td>
          <select class="form-control" style="padding:4px 8px;font-size:0.8rem;width:auto;" onchange="changeOrderStatus('${order.OrderID}', this.value)">
            ${Object.entries(APP_CONFIG.ORDER_STATUSES).map(([key, val]) => 
              `<option value="${key}" ${order.Status === key ? 'selected' : ''}>${val.label}</option>`
            ).join('')}
          </select>
        </td>
        <td style="font-size:0.8rem;">${payment}</td>
        <td style="font-size:0.8rem;color:var(--text-muted);">${formatDate(order.CreatedAt)}</td>
      </tr>
    `;
  }).join('');
}

async function changeOrderStatus(orderId, status) {
  try {
    let result;
    if (isApiConfigured()) {
      result = await api.updateOrderStatus(orderId, status);
    } else {
      const order = adminOrders.find(o => o.OrderID === orderId);
      if (order) order.Status = status;
      result = { success: true, message: `[Demo] Cập nhật trạng thái #${orderId}` };
    }
    
    if (result.success) {
      toast.success('Đã cập nhật', result.message);
    }
  } catch (error) {
    toast.error('Lỗi', error.message);
    loadAdminOrders();
  }
}

// ========== CATEGORIES MANAGEMENT ==========

async function loadAdminCategories() {
  const container = document.getElementById('categoriesTableBody');
  container.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:var(--space-2xl);"><div class="loading-spinner" style="margin:0 auto;"></div></td></tr>';
  
  try {
    const result = await getData('categories');
    if (result.success) {
      adminCategories = result.data;
      renderCategoriesTable();
    }
  } catch (e) {
    container.innerHTML = `<tr><td colspan="4" class="text-center text-danger">${e.message}</td></tr>`;
  }
}

function renderCategoriesTable() {
  const container = document.getElementById('categoriesTableBody');
  
  if (adminCategories.length === 0) {
    container.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:var(--space-2xl);"><p class="text-muted">Chưa có danh mục</p></td></tr>`;
    return;
  }
  
  container.innerHTML = adminCategories.map(cat => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:var(--space-sm);">
          <div style="width:16px;height:16px;border-radius:4px;background:${cat.Color || 'var(--primary)'};flex-shrink:0;"></div>
          <strong>${escapeHtml(cat.Name)}</strong>
        </div>
      </td>
      <td style="color:var(--text-secondary);font-size:0.85rem;">${escapeHtml(cat.Description || '—')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:var(--space-sm);">
          <div style="width:24px;height:24px;border-radius:4px;background:${cat.Color || '#7c6aef'};"></div>
          <span style="font-size:0.8rem;color:var(--text-muted);">${cat.Color || '#7c6aef'}</span>
        </div>
      </td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="confirmDeleteCategory('${cat.ID}', '${escapeHtml(cat.Name)}')" style="color:var(--danger);">
          <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
        </button>
      </td>
    </tr>
  `).join('');
  
  lucide.createIcons();
}

async function addNewCategory(event) {
  event.preventDefault();
  
  const name = document.getElementById('newCatName').value.trim();
  const desc = document.getElementById('newCatDesc').value.trim();
  const color = document.getElementById('newCatColor').value;
  
  if (!name) {
    toast.error('Thiếu thông tin', 'Vui lòng nhập tên danh mục');
    return;
  }
  
  try {
    let result;
    if (isApiConfigured()) {
      result = await api.addCategory({ Name: name, Description: desc, Color: color });
    } else {
      adminCategories.push({ ID: 'C' + (adminCategories.length + 1), Name: name, Description: desc, Color: color });
      result = { success: true, message: `[Demo] Đã thêm danh mục: ${name}` };
    }
    
    if (result.success) {
      toast.success('Thành công', result.message);
      document.getElementById('addCategoryForm').reset();
      loadAdminCategories();
    } else {
      toast.error('Lỗi', result.error);
    }
  } catch (error) {
    toast.error('Lỗi', error.message);
  }
}

function confirmDeleteCategory(id, name) {
  if (confirm(`Bạn có chắc muốn xóa danh mục "${name}"?`)) {
    deleteCategoryById(id);
  }
}

async function deleteCategoryById(id) {
  try {
    let result;
    if (isApiConfigured()) {
      result = await api.deleteCategory(id);
    } else {
      adminCategories = adminCategories.filter(c => c.ID !== id);
      result = { success: true, message: '[Demo] Đã xóa danh mục' };
    }
    
    if (result.success) {
      toast.success('Đã xóa', result.message);
      renderCategoriesTable();
    }
  } catch (error) {
    toast.error('Lỗi', error.message);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', initAdmin);
