/* ============================================
   ShopPro Desktop - Products Module
   ============================================ */

(() => {
  let products = [];
  let categories = [];
  let editingProduct = null;

  function render() {
    const isOwner = !currentUser || currentUser.role === 'owner';

    return `
      <div class="page-header">
        <h1>📦 Quản Lý Sản Phẩm</h1>
        <div class="page-header-actions">
          <button class="btn btn-outline btn-sm" onclick="pageModules.products.refresh()">
            ${ICONS.refresh} Làm mới
          </button>
          <button class="btn btn-outline btn-sm" onclick="pageModules.products.exportExcel()" title="Xuất toàn bộ danh sách sản phẩm ra file Excel">
            📤 Xuất Excel
          </button>
          ${isOwner ? `
            <button class="btn btn-outline btn-sm" onclick="pageModules.products.openImportModal()" title="Nhập danh sách sản phẩm từ file Excel">
              📥 Nhập Excel
            </button>
            <button class="btn btn-primary" onclick="pageModules.products.openAdd()">
              ${ICONS.plus} Thêm Sản Phẩm
            </button>
          ` : `
            <div class="badge badge-default" style="padding:6px 12px; font-size:12px;">🧑‍💼 Chế độ tra cứu thu ngân (Xem & Quét)</div>
          `}
        </div>
      </div>

      <div class="toolbar">
        <div class="toolbar-search">
          ${ICONS.search}
          <input type="text" placeholder="Tìm sản phẩm..." oninput="pageModules.products.onSearch(this.value)" id="productSearchInput">
        </div>
        <select class="form-control" style="min-width:180px;" id="productCatFilter" onchange="pageModules.products.onFilterCategory(this.value)">
          <option value="">Tất cả danh mục</option>
        </select>
        <select class="form-control" style="min-width:170px;" onchange="pageModules.products.onFilterStatus(this.value)">
          <option value="">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="inactive">Ẩn</option>
        </select>
        <select class="form-control" style="min-width:175px;" onchange="pageModules.products.onFilterExpiry(this.value)">
          <option value="">Tất cả HSD</option>
          <option value="expiring_soon">🟡 Sắp hết hạn (<= 30 ngày)</option>
          <option value="expired">🔴 Đã hết hạn</option>
        </select>
      </div>

      <div class="page-content">
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>SKU / Barcode</th>
                <th>Danh mục</th>
                <th>Giá bán</th>
                ${isOwner ? '<th>Giá vốn</th>' : ''}
                <th>Tồn kho</th>
                <th>Hạn sử dụng</th>
                <th>Trạng thái</th>
                ${isOwner ? '<th style="width:100px;">Thao tác</th>' : ''}
              </tr>
            </thead>
            <tbody id="productsTableBody">
              <tr><td colspan="${isOwner ? 9 : 7}" class="text-center text-muted" style="padding:40px;">Đang tải...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Categories section -->
        <div class="mt-xl">
          <div class="flex justify-between items-center mb-lg">
            <h2 style="font-size:16px; font-weight:700;">📁 Danh Mục</h2>
            ${isOwner ? `
              <button class="btn btn-outline btn-sm" onclick="pageModules.products.openAddCategory()">
                ${ICONS.plus} Thêm Danh Mục
              </button>
            ` : ''}
          </div>
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Màu</th>
                  <th>Tên</th>
                  <th>Mô tả</th>
                  ${isOwner ? '<th style="width:80px;">Thao tác</th>' : ''}
                </tr>
              </thead>
              <tbody id="categoriesTableBody">
                <tr><td colspan="${isOwner ? 4 : 3}" class="text-center text-muted" style="padding:20px;">Đang tải...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  async function init() {
    await loadCategories();
    await loadProducts();
  }

  let searchQuery = '';
  let filterCategory = '';
  let filterStatus = '';
  let filterExpiry = '';

  async function loadCategories() {
    try {
      categories = await api.getCategories();
      renderCategoryFilter();
      renderCategoriesTable();
    } catch (err) {
      console.error('Lỗi tải danh mục:', err);
      showToast('error', 'Lỗi tải danh mục', err.message);
    }
  }

  async function loadProducts() {
    try {
      const filters = {};
      if (searchQuery) filters.search = searchQuery;
      if (filterCategory) filters.category_id = parseInt(filterCategory);
      if (filterStatus) filters.status = filterStatus;
      if (filterExpiry) filters.expiry_filter = filterExpiry;

      products = await api.getProducts(filters);
      renderTable();
    } catch (err) {
      showToast('error', 'Lỗi tải sản phẩm', err.message);
    }
  }

  function getExpiryBadge(dateStr) {
    if (!dateStr) return '<span class="text-muted">—</span>';
    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const expDate = new Date(dateStr);
      expDate.setHours(0,0,0,0);
      const diffTime = expDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return `<span class="badge badge-danger" title="Đã hết hạn vào ${dateStr}">🔴 Quá ${Math.abs(diffDays)} ngày</span>`;
      } else if (diffDays <= 30) {
        return `<span class="badge badge-warning" title="HSD: ${dateStr}">🟡 Còn ${diffDays} ngày</span>`;
      } else {
        return `<span class="badge badge-success" title="HSD: ${dateStr}">🟢 ${dateStr}</span>`;
      }
    } catch (_) {
      return `<span class="text-muted">${escapeHtml(dateStr)}</span>`;
    }
  }

  function renderTable() {
    const isOwner = !currentUser || currentUser.role === 'owner';
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${isOwner ? 9 : 7}" class="text-center text-muted" style="padding:40px;">Không có sản phẩm nào</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => {
      const displayPrice = p.sale_price > 0 ? p.sale_price : p.price;
      const isLow = p.stock <= (p.min_stock || 5);

      return `
        <tr>
          <td>
            <div class="flex items-center gap-md">
              <div style="width:36px;height:36px;border-radius:6px;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
                ${p.image ? `<img src="${escapeHtml(window.formatProductImageUrl ? window.formatProductImageUrl(p.image) : p.image)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.parentElement.innerHTML='📦'">` : '📦'}
              </div>
              <div>
                <div class="fw-600">${escapeHtml(p.name)}</div>
                <div class="text-muted" style="font-size:11px;">${escapeHtml(p.description || '').substring(0, 50)}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="fw-600">${escapeHtml(p.sku)}</div>
            <div class="text-muted" style="font-size:11px;">${escapeHtml(p.barcode || '—')}</div>
          </td>
          <td>
            ${p.category_name ? `<span class="badge badge-accent">${escapeHtml(p.category_name)}</span>` : '<span class="text-muted">—</span>'}
          </td>
          <td>
            <div class="fw-700 text-cyan">${formatCurrency(displayPrice)}</div>
            ${p.sale_price > 0 && p.sale_price < p.price ? `<div class="text-muted" style="text-decoration:line-through;font-size:11px;">${formatCurrency(p.price)}</div>` : ''}
          </td>
          ${isOwner ? `<td class="text-muted">${formatCurrency(p.cost_price || 0)}</td>` : ''}
          <td>
            <span class="${isLow && p.stock > 0 ? 'text-warning fw-600' : p.stock <= 0 ? 'text-danger fw-600' : ''}">${p.stock}</span>
            <span class="text-muted"> ${escapeHtml(p.unit || '')}</span>
          </td>
          <td>${getExpiryBadge(p.expiry_date)}</td>
          <td>
            <span class="badge ${p.status === 'active' ? 'badge-success' : 'badge-default'}">
              ${p.status === 'active' ? 'Hoạt động' : 'Ẩn'}
            </span>
          </td>
          ${isOwner ? `
            <td>
              <div class="flex gap-sm">
                <button class="btn btn-ghost btn-icon sm" onclick="pageModules.products.openEdit(${p.id})" title="Sửa">${ICONS.edit}</button>
                <button class="btn btn-ghost btn-icon sm" onclick="pageModules.products.deleteProduct(${p.id})" title="Xóa" style="color:var(--danger);">${ICONS.trash}</button>
              </div>
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');
  }

  function renderCategoryFilter() {
    const select = document.getElementById('productCatFilter');
    if (!select) return;
    let html = '<option value="">Tất cả danh mục</option>';
    html += categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    select.innerHTML = html;
  }

  function renderCategoriesTable() {
    const isOwner = !currentUser || currentUser.role === 'owner';
    const tbody = document.getElementById('categoriesTableBody');
    if (!tbody) return;

    if (categories.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${isOwner ? 4 : 3}" class="text-center text-muted" style="padding:20px;">Chưa có danh mục</td></tr>`;
      return;
    }

    tbody.innerHTML = categories.map(c => `
      <tr>
        <td><div style="width:20px;height:20px;border-radius:4px;background:${c.color};"></div></td>
        <td class="fw-600">${escapeHtml(c.name)}</td>
        <td class="text-secondary">${escapeHtml(c.description || '—')}</td>
        ${isOwner ? `
          <td>
            <button class="btn btn-ghost btn-icon sm" onclick="pageModules.products.deleteCategory(${c.id})" title="Xóa" style="color:var(--danger);">${ICONS.trash}</button>
          </td>
        ` : ''}
      </tr>
    `).join('');
  }

  // ==================== PRODUCT CRUD ====================
  function openAdd() {
    if (currentUser && currentUser.role === 'staff') {
      showToast('warning', 'Quyền hạn bị giới hạn', 'Chỉ Chủ Shop mới có quyền thêm sản phẩm mới');
      return;
    }
    editingProduct = null;
    showProductModal('Thêm Sản Phẩm Mới');
  }

  async function openEdit(id) {
    if (currentUser && currentUser.role === 'staff') {
      showToast('warning', 'Quyền hạn bị giới hạn', 'Chỉ Chủ Shop mới có quyền sửa sản phẩm');
      return;
    }
    try {
      editingProduct = await api.getProduct(id);
      showProductModal('Sửa Sản Phẩm');
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  function showProductModal(title) {
    const p = editingProduct || {};
    const catOptions = categories.map(c =>
      `<option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('');

    showModal(`
      <div class="modal" style="min-width:560px;">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">${ICONS.x}</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">MÃ SKU *</label>
              <input type="text" class="form-control" id="pSku" value="${escapeHtml(p.sku || '')}" placeholder="VD: SP001" required>
            </div>
            <div class="form-group">
              <label class="form-label flex justify-between" style="align-items:center;">
                <span>BARCODE (MÃ VẠCH)</span>
                <div style="display:flex; gap:6px; align-items:center;">
                  <button type="button" class="btn btn-outline btn-sm" onclick="pageModules.products.scanBarcodeFromPcImage()" style="font-size:11px; padding:2px 8px; height:24px; display:inline-flex; align-items:center; gap:4px; font-weight:600; color:var(--primary); cursor:pointer;" title="Chọn tệp ảnh tem mã vạch từ máy tính để tự động trích xuất">
                    🖼️ Quét từ ảnh máy tính
                  </button>
                  <span class="text-muted" style="font-weight:normal; font-size:11px;">📱 ĐT / USB</span>
                </div>
              </label>
              <div style="position:relative;" ondragover="event.preventDefault()" ondrop="pageModules.products.handleBarcodeDrop(event)">
                <input type="text" class="form-control" id="pBarcode" value="${escapeHtml(p.barcode || '')}" placeholder="Bắn máy quét, gõ mã, hoặc kéo thả ảnh vào đây..." style="padding-right:64px;">
                <div style="position:absolute; right:6px; top:50%; transform:translateY(-50%); display:flex; align-items:center; gap:2px;">
                  <button type="button" class="btn btn-ghost btn-sm" onclick="pageModules.products.scanBarcodeFromPcImage()" style="padding:2px 6px; font-size:13px; height:26px; border-radius:4px;" title="Chọn ảnh mã vạch từ máy tính">
                    📁
                  </button>
                  <span style="font-size:14px; opacity:0.6; pointer-events:none;" title="Tự động nhận diện khi quét qua điện thoại, ảnh máy tính hoặc máy quét">⚡</span>
                </div>
              </div>
              <input type="file" id="pBarcodeFileInput" accept="image/*" style="display:none;" onchange="pageModules.products.onBarcodeFileSelected(this)">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">TÊN SẢN PHẨM *</label>
            <input type="text" class="form-control" id="pName" value="${escapeHtml(p.name || '')}" required>
          </div>
          <div class="form-group">
            <label class="form-label">MÔ TẢ</label>
            <textarea class="form-control" id="pDesc" rows="2">${escapeHtml(p.description || '')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">GIÁ BÁN (VNĐ) *</label>
              <input type="number" class="form-control" id="pPrice" value="${p.price || 0}" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">GIÁ KHUYẾN MÃI</label>
              <input type="number" class="form-control" id="pSalePrice" value="${p.sale_price || 0}" min="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">GIÁ VỐN</label>
              <input type="number" class="form-control" id="pCostPrice" value="${p.cost_price || 0}" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">DANH MỤC</label>
              <select class="form-control" id="pCategory">
                <option value="">-- Chọn --</option>
                ${catOptions}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">TỒN KHO</label>
              <input type="number" class="form-control" id="pStock" value="${p.stock || 0}" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">ĐƠN VỊ</label>
              <input type="text" class="form-control" id="pUnit" value="${escapeHtml(p.unit || 'cái')}" placeholder="cái, hộp, kg...">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">TỒN KHO TỐI THIỂU</label>
              <input type="number" class="form-control" id="pMinStock" value="${p.min_stock || 5}" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">HẠN SỬ DỤNG (EXPIRY DATE)</label>
              <input type="date" class="form-control" id="pExpiryDate" value="${escapeHtml(p.expiry_date || '')}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">TRẠNG THÁI</label>
              <select class="form-control" id="pStatus">
                <option value="active" ${p.status === 'active' || !p.status ? 'selected' : ''}>Hoạt động</option>
                <option value="inactive" ${p.status === 'inactive' ? 'selected' : ''}>Ẩn</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label flex justify-between" style="align-items:center; margin-bottom:6px;">
              <span style="font-weight:700;">HÌNH ẢNH SẢN PHẨM</span>
              <span class="text-muted" style="font-weight:normal; font-size:11px;">📱 Hỗ trợ chụp từ camera điện thoại</span>
            </label>
            <div style="display:flex; gap:12px; align-items:flex-start; background:var(--bg-tertiary); padding:10px; border-radius:var(--radius-lg); border:1px solid var(--border);">
              <div id="pImagePreviewBox" style="width:76px; height:76px; border-radius:6px; border:1px solid var(--border-strong); background:var(--bg-card); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; box-shadow:var(--shadow-sm);">
                ${p.image ? `<img id="pImagePreviewImg" src="${escapeHtml(window.formatProductImageUrl ? window.formatProductImageUrl(p.image) : p.image)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='📦'">` : '<span style="font-size:28px; opacity:0.6;">📦</span>'}
              </div>
              <div style="flex:1; min-width:0;">
                <input type="text" class="form-control" id="pImage" value="${escapeHtml(p.image || '')}" placeholder="Dán URL ảnh hoặc chọn tệp ảnh từ máy tính..." oninput="pageModules.products.onImageUrlInput(this.value)" style="margin-bottom:6px; font-size:12.5px; padding:7px 10px;">
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                  <label class="btn btn-primary btn-sm" style="cursor:pointer; margin:0; font-size:11.5px; padding:5px 10px; display:inline-flex; align-items:center; gap:4px;">
                    📁 Chọn từ máy
                    <input type="file" id="pImageFileInput" accept="image/*" style="display:none;" onchange="pageModules.products.onImageFileSelect(this)">
                  </label>
                  <button type="button" class="btn btn-outline btn-sm" onclick="pageModules.products.applyLastPhonePhoto()" style="font-size:11.5px; padding:5px 8px;" title="Áp dụng ảnh sản phẩm vừa gửi từ camera điện thoại">
                    📱 Ảnh từ ĐT
                  </button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="if (api && api.openUploadsFolder) api.openUploadsFolder()" style="font-size:11.5px; padding:5px 8px;" title="Mở thư mục lưu trữ ảnh sản phẩm trên máy tính">
                    📂 Mở thư mục
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="pageModules.products.clearImage()" style="font-size:11.5px; padding:5px 6px; color:var(--danger);" title="Xóa ảnh hiện tại">✕ Bỏ ảnh</button>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:5px;">💡 Tự động nén và lưu ảnh vào thư mục <strong>uploads/products/</strong>. Hỗ trợ JPG, PNG, WebP.</div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          <button class="btn btn-primary" onclick="pageModules.products.saveProduct()">💾 Lưu</button>
        </div>
      </div>
    `);
  }

  function applyLastPhonePhoto() {
    if (!window.lastPhoneProductPhoto) {
      showToast('info', 'Chưa có ảnh từ điện thoại', 'Hãy mở điện thoại ➔ Bấm "Chụp ảnh sản phẩm gửi ngay"');
      return;
    }
    const imgInput = document.getElementById('pImage');
    if (imgInput) imgInput.value = window.lastPhoneProductPhotoPath || window.lastPhoneProductPhoto;
    const box = document.getElementById('pImagePreviewBox');
    if (box) {
      const lastPhotoSrc = window.formatProductImageUrl ? window.formatProductImageUrl(window.lastPhoneProductPhoto || window.lastPhoneProductPhotoPath) : window.lastPhoneProductPhoto;
      box.innerHTML = `<img id="pImagePreviewImg" src="${escapeHtml(lastPhotoSrc)}" style="width:100%;height:100%;object-fit:cover;">`;
      box.style.borderColor = 'var(--accent)';
      box.style.boxShadow = '0 0 0 4px var(--accent-light)';
      setTimeout(() => {
        box.style.borderColor = '';
        box.style.boxShadow = '';
      }, 1200);
    }
    showToast('success', 'Đã áp dụng ảnh chụp từ điện thoại!', window.lastPhoneProductPhotoPath ? `File: ${window.lastPhoneProductPhotoPath}` : '');
  }

  function onImageUrlInput(url) {
    const box = document.getElementById('pImagePreviewBox');
    if (!box) return;
    if (url && url.trim()) {
      const displaySrc = window.formatProductImageUrl ? window.formatProductImageUrl(url.trim()) : url.trim();
      box.innerHTML = `<img src="${escapeHtml(displaySrc)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='⚠️'">`;
    } else {
      box.innerHTML = '<span style="font-size:26px;">📦</span>';
    }
  }

  function onImageFileSelect(input) {
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const imgInput = document.getElementById('pImage');
        const box = document.getElementById('pImagePreviewBox');

        // 1. Cập nhật xem trước ngay lập tức
        if (box) {
          box.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
          box.style.borderColor = 'var(--primary)';
        }

        // 2. Lưu file vật lý vào uploads/products/ để tránh lưu chuỗi base64 khổng lồ vào database
        let savedPath = '';
        if (window.api && window.api.saveProductImage) {
          try {
            const res = await window.api.saveProductImage(file.path || dataUrl);
            if (res && res.success && res.relativePath) {
              savedPath = res.relativePath;
            }
          } catch (err) {
            console.warn('Lưu ảnh thất bại:', err);
          }
        }

        if (imgInput) {
          imgInput.value = savedPath || dataUrl;
          imgInput.style.borderColor = 'var(--primary)';
          setTimeout(() => { imgInput.style.borderColor = ''; }, 1500);
        }

        showToast('success', 'Đã chọn ảnh sản phẩm', file.name || 'Lưu thành công');

        // 3. Tự động thử trích xuất barcode từ ảnh sản phẩm vừa chọn trên máy tính
        const barcodeInput = document.getElementById('pBarcode');
        if (barcodeInput && !barcodeInput.value.trim() && window.api && window.api.decodeBarcodeFromImage) {
          try {
            const decodeRes = await window.api.decodeBarcodeFromImage(dataUrl);
            if (decodeRes && decodeRes.success && decodeRes.code) {
              barcodeInput.value = decodeRes.code;
              barcodeInput.style.borderColor = 'var(--primary)';
              barcodeInput.style.boxShadow = '0 0 0 4px rgba(0, 184, 148, 0.35)';
              setTimeout(() => {
                barcodeInput.style.borderColor = '';
                barcodeInput.style.boxShadow = '';
              }, 2500);
              showToast('success', 'Tự động trích xuất Barcode!', `Đã tìm thấy mã: ${decodeRes.code} từ ảnh sản phẩm vừa chọn.`);
            }
          } catch (_) {}
        }
      };
      reader.readAsDataURL(file);
    }
  }

  // Quét mã vạch từ tệp ảnh trên máy tính thông qua hộp thoại chọn tệp
  async function scanBarcodeFromPcImage() {
    if (window.api && window.api.pickAndDecodeBarcode) {
      try {
        const res = await window.api.pickAndDecodeBarcode();
        if (!res || res.canceled) return;

        if (res.success && res.code) {
          const barcodeInput = document.getElementById('pBarcode');
          if (barcodeInput) {
            barcodeInput.value = res.code;
            barcodeInput.focus();
            barcodeInput.style.borderColor = 'var(--primary)';
            barcodeInput.style.boxShadow = '0 0 0 4px rgba(0, 184, 148, 0.4)';
            setTimeout(() => {
              barcodeInput.style.borderColor = '';
              barcodeInput.style.boxShadow = '';
            }, 3000);
          }
          showToast('success', 'Đã nhận diện mã vạch!', `Mã: ${res.code} (${res.format || '1D/2D'})`);
        } else {
          showToast('warning', 'Không tìm thấy mã vạch', res.error || 'Ảnh không rõ nét hoặc không có tem mã vạch. Vui lòng chọn ảnh chụp gần tem.');
        }
      } catch (err) {
        showToast('error', 'Lỗi quét ảnh', err.message || 'Không thể đọc tệp ảnh');
      }
    } else {
      const fallbackInput = document.getElementById('pBarcodeFileInput');
      if (fallbackInput) fallbackInput.click();
    }
  }

  // Xử lý khi chọn file qua fallback input
  function onBarcodeFileSelected(input) {
    if (input.files && input.files[0]) {
      scanBarcodeFromFileObject(input.files[0]);
      input.value = '';
    }
  }

  // Xử lý kéo thả tệp ảnh vào ô Barcode
  function handleBarcodeDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      const file = dt.files[0];
      if (file.type && file.type.startsWith('image/')) {
        scanBarcodeFromFileObject(file);
      } else {
        showToast('warning', 'Không phải file ảnh', 'Vui lòng kéo thả tệp hình ảnh (jpg, png, webp...)');
      }
    }
  }

  // Helper đọc và giải mã file object
  function scanBarcodeFromFileObject(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      if (window.api && window.api.decodeBarcodeFromImage) {
        try {
          showToast('info', 'Đang quét ảnh...', 'Đang nhận diện tem mã vạch từ tệp ảnh máy tính');
          const res = await window.api.decodeBarcodeFromImage(dataUrl);
          if (res && res.success && res.code) {
            const barcodeInput = document.getElementById('pBarcode');
            if (barcodeInput) {
              barcodeInput.value = res.code;
              barcodeInput.focus();
              barcodeInput.style.borderColor = 'var(--primary)';
              barcodeInput.style.boxShadow = '0 0 0 4px rgba(0, 184, 148, 0.4)';
              setTimeout(() => {
                barcodeInput.style.borderColor = '';
                barcodeInput.style.boxShadow = '';
              }, 3000);
            }
            showToast('success', 'Đã nhận diện mã vạch!', `Mã: ${res.code}`);
          } else {
            showToast('warning', 'Không tìm thấy mã vạch', res.error || 'Ảnh không chứa mã vạch rõ nét.');
          }
        } catch (err) {
          showToast('error', 'Lỗi giải mã ảnh', err.message);
        }
      }
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    const imgInput = document.getElementById('pImage');
    if (imgInput) imgInput.value = '';
    const box = document.getElementById('pImagePreviewBox');
    if (box) box.innerHTML = '<span style="font-size:26px;">📦</span>';
  }

  async function saveProduct() {
    const data = {
      sku: document.getElementById('pSku').value.trim(),
      barcode: document.getElementById('pBarcode').value.trim(),
      name: document.getElementById('pName').value.trim(),
      description: document.getElementById('pDesc').value.trim(),
      price: parseFloat(document.getElementById('pPrice').value) || 0,
      sale_price: parseFloat(document.getElementById('pSalePrice').value) || 0,
      cost_price: parseFloat(document.getElementById('pCostPrice').value) || 0,
      category_id: parseInt(document.getElementById('pCategory').value) || null,
      stock: parseInt(document.getElementById('pStock').value) || 0,
      min_stock: parseInt(document.getElementById('pMinStock').value) || 5,
      expiry_date: document.getElementById('pExpiryDate') ? document.getElementById('pExpiryDate').value.trim() : '',
      unit: document.getElementById('pUnit').value.trim() || 'cái',
      status: document.getElementById('pStatus').value,
      image: document.getElementById('pImage').value.trim()
    };

    if (!data.sku || !data.name) {
      showToast('warning', 'Thiếu thông tin', 'Vui lòng nhập mã SKU và tên sản phẩm');
      return;
    }

    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, data);
        showToast('success', 'Đã cập nhật', data.name);
      } else {
        await api.addProduct(data);
        showToast('success', 'Đã thêm', data.name);
      }
      closeModal();
      await loadProducts();
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  async function deleteProduct(id) {
    if (currentUser && currentUser.role === 'staff') {
      showToast('warning', 'Quyền hạn bị giới hạn', 'Chỉ Chủ Shop mới có quyền xóa sản phẩm');
      return;
    }
    const product = products.find(p => p.id === id);
    if (!product) return;

    if (!confirm(`Xóa sản phẩm "${product.name}"?`)) return;

    try {
      await api.deleteProduct(id);
      showToast('success', 'Đã xóa', product.name);
      await loadProducts();
    } catch (err) {
      showToast('error', 'Lỗi xóa', err.message);
    }
  }

  // ==================== CATEGORY CRUD ====================
  function openAddCategory() {
    if (currentUser && currentUser.role === 'staff') {
      showToast('warning', 'Quyền hạn bị giới hạn', 'Chỉ Chủ Shop mới có quyền thêm danh mục');
      return;
    }
    showModal(`
      <div class="modal" style="min-width:400px;">
        <div class="modal-header">
          <h3>Thêm Danh Mục</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">${ICONS.x}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">TÊN DANH MỤC *</label>
            <input type="text" class="form-control" id="catName" placeholder="VD: Thực phẩm">
          </div>
          <div class="form-group">
            <label class="form-label">MÔ TẢ</label>
            <input type="text" class="form-control" id="catDesc" placeholder="Mô tả ngắn">
          </div>
          <div class="form-group">
            <label class="form-label">MÀU SẮC</label>
            <input type="color" id="catColor" value="#364e68" style="width:50px;height:36px;border:none;cursor:pointer;">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          <button class="btn btn-primary" onclick="pageModules.products.saveCategory()">💾 Lưu</button>
        </div>
      </div>
    `);
  }

  async function saveCategory() {
    const name = document.getElementById('catName').value.trim();
    if (!name) { showToast('warning', 'Nhập tên danh mục'); return; }

    try {
      await api.addCategory({
        name,
        description: document.getElementById('catDesc').value.trim(),
        color: document.getElementById('catColor').value
      });
      closeModal();
      showToast('success', 'Đã thêm danh mục', name);
      await loadCategories();
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  async function deleteCategory(id) {
    if (!confirm('Xóa danh mục này?')) return;
    try {
      await api.deleteCategory(id);
      showToast('success', 'Đã xóa danh mục');
      await loadCategories();
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  // ==================== FILTERS ====================
  const onSearch = debounce((value) => { searchQuery = value; loadProducts(); }, 300);
  function onFilterCategory(value) { filterCategory = value; loadProducts(); }
  function onFilterStatus(value) { filterStatus = value; loadProducts(); }
  function onFilterExpiry(value) { filterExpiry = value; loadProducts(); }

  async function refresh() { await loadCategories(); await loadProducts(); }

  // ==================== EXCEL IMPORT / EXPORT (SP-01) ====================
  async function exportExcel() {
    try {
      showToast('info', 'Đang chuẩn bị...', 'Vui lòng chọn vị trí lưu tệp Excel');
      const res = await api.exportProductsExcel();
      if (res.canceled) return;
      if (res.success) {
        showToast('success', 'Xuất Excel thành công', `Đã xuất ${res.count} sản phẩm.`);
      } else {
        showToast('error', 'Lỗi xuất Excel', res.error || 'Thao tác không thành công');
      }
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  async function downloadTemplate() {
    try {
      const res = await api.downloadProductTemplate();
      if (res.canceled) return;
      if (res.success) {
        showToast('success', 'Đã tải file mẫu', 'Mở file mẫu để điền dữ liệu rồi nhấn Chọn File.');
      }
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  let importDataState = null;

  function openImportModal() {
    importDataState = null;
    renderImportModal();
  }

  function renderImportModal() {
    const hasData = importDataState && importDataState.parsedRows && importDataState.parsedRows.length > 0;
    const count = hasData ? importDataState.parsedRows.length : 0;
    const errors = importDataState ? (importDataState.errors || []) : [];

    showModal(`
      <div class="modal" style="max-width:760px; width:95vw;">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:22px;">📥</span>
            <h3 style="margin:0;">Nhập Sản Phẩm Hàng Loạt Từ Excel / CSV</h3>
          </div>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>

        <div class="modal-body" style="padding:20px;">
          <!-- Step 1 / Template banner -->
          <div style="background:var(--bg-secondary); border-radius:10px; padding:16px; margin-bottom:18px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <div style="font-weight:700; margin-bottom:4px; font-size:14px;">1. Tải mẫu Excel chuẩn</div>
              <div class="text-secondary" style="font-size:12px;">Mẫu chuẩn đã tạo sẵn các cột (SKU, Barcode, Tên SP, Danh mục, Giá bán, Tồn kho...)</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="pageModules.products.downloadTemplate()" style="white-space:nowrap;">
              📄 Tải File Mẫu Chuẩn (.xlsx)
            </button>
          </div>

          <!-- Step 2: Select file -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:700; font-size:14px;">2. Chọn tệp bảng tính</div>
              <div class="text-secondary" style="font-size:12px;">Hỗ trợ tệp .xlsx, .xls, .csv</div>
            </div>
            <button class="btn btn-primary" onclick="pageModules.products.selectExcelFile()">
              📂 Chọn Tệp Excel / CSV...
            </button>
          </div>

          ${importDataState ? `
            <div style="background:var(--bg-card); border-radius:8px; padding:12px 14px; margin-bottom:16px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-weight:600; font-size:13px; color:var(--cyan);">📄 ${escapeHtml(importDataState.fileName)}</div>
                <div class="text-secondary" style="font-size:11px;">Tổng ${importDataState.totalRows} dòng | Hợp lệ: <strong>${count}</strong> sản phẩm | Bỏ qua: <strong>${errors.length}</strong> dòng</div>
              </div>
              <span class="badge ${count > 0 ? 'badge-success' : 'badge-danger'}">${count > 0 ? `Sẵn sàng (${count})` : 'Không có SP hợp lệ'}</span>
            </div>

            ${errors.length > 0 ? `
              <div style="background:rgba(239, 68, 68, 0.1); border-left:3px solid var(--danger); padding:8px 12px; border-radius:4px; font-size:11px; color:var(--danger); max-height:80px; overflow-y:auto; margin-bottom:14px;">
                <strong>Ghi chú kiểm tra:</strong>
                ${errors.map(e => `<div>• ${escapeHtml(e)}</div>`).join('')}
              </div>
            ` : ''}

            <!-- Preview Table -->
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; font-weight:700; margin-bottom:6px; color:var(--text-secondary);">
                Xem trước ${Math.min(5, count)} sản phẩm đầu tiên:
              </div>
              <div class="data-table-wrapper" style="max-height:180px; overflow-y:auto; border:1px solid var(--border); border-radius:6px;">
                <table class="data-table" style="font-size:12px;">
                  <thead>
                    <tr>
                      <th>Tên Sản Phẩm</th>
                      <th>Mã SKU / Barcode</th>
                      <th>Danh Mục</th>
                      <th>Giá Bán</th>
                      <th>Tồn Kho</th>
                      <th>ĐVT</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${importDataState.parsedRows.slice(0, 5).map(p => `
                      <tr>
                        <td><strong>${escapeHtml(p.name)}</strong></td>
                        <td><span style="font-family:monospace;">${escapeHtml(p.barcode || p.sku || '—')}</span></td>
                        <td>${escapeHtml(p.category_name || 'Mặc định')}</td>
                        <td class="text-success font-bold">${formatNumber(p.price)}₫</td>
                        <td>${p.stock}</td>
                        <td>${escapeHtml(p.unit || 'cái')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Options -->
            <div style="margin-bottom:18px; padding:10px 14px; background:var(--bg-secondary); border-radius:8px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; user-select:none;">
                <input type="checkbox" id="updateExistingCheckbox" checked style="width:16px; height:16px; accent-color:var(--accent);">
                <span>Cập nhật giá bán, tồn kho nếu sản phẩm đã tồn tại (trùng Barcode hoặc SKU)</span>
              </label>
            </div>
          ` : `
            <div style="text-align:center; padding:32px; border:2px dashed var(--border); border-radius:10px; margin-bottom:14px; color:var(--text-secondary);">
              <div style="font-size:36px; margin-bottom:8px;">📊</div>
              <div>Bấm nút <strong>"Chọn Tệp Excel / CSV..."</strong> ở trên để tải danh sách sản phẩm</div>
            </div>
          `}

          <!-- Footer actions -->
          <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border); padding-top:16px;">
            <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
            ${hasData ? `
              <button class="btn btn-success" id="btnConfirmImport" onclick="pageModules.products.confirmImport()">
                💾 Xác Nhận Nhập ${count} Sản Phẩm Vào Hệ Thống
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `);
  }

  async function selectExcelFile() {
    try {
      const res = await api.parseProductsExcelFile();
      if (res.canceled) return;
      if (!res.success) {
        showToast('error', 'Lỗi đọc file', res.error || 'Không thể đọc dữ liệu file');
        return;
      }
      importDataState = res;
      renderImportModal();
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
    }
  }

  async function confirmImport() {
    if (!importDataState || !importDataState.parsedRows || importDataState.parsedRows.length === 0) return;
    const updateExisting = document.getElementById('updateExistingCheckbox')?.checked ?? true;
    const btn = document.getElementById('btnConfirmImport');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Đang lưu dữ liệu...';
    }

    try {
      const res = await api.batchSaveProducts(importDataState.parsedRows, updateExisting);
      if (res.success) {
        closeModal();
        showToast('success', 'Nhập thành công!', `Đã thêm mới ${res.inserted} và cập nhật ${res.updated} sản phẩm.`);
        await loadCategories();
        await loadProducts();
      } else {
        showToast('error', 'Lỗi lưu', res.error || 'Không thể lưu sản phẩm');
        if (btn) {
          btn.disabled = false;
          btn.textContent = '💾 Thử lại';
        }
      }
    } catch (err) {
      showToast('error', 'Lỗi', err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 Thử lại';
      }
    }
  }

  // ==================== REGISTER ====================
  registerPage('products', {
    render, init, openAdd, openEdit, saveProduct, deleteProduct,
    openAddCategory, saveCategory, deleteCategory,
    onSearch, onFilterCategory, onFilterStatus, onFilterExpiry, refresh,
    onImageUrlInput, onImageFileSelect, clearImage, applyLastPhonePhoto,
    scanBarcodeFromPcImage, onBarcodeFileSelected, handleBarcodeDrop,
    exportExcel, downloadTemplate, openImportModal, selectExcelFile, confirmImport
  });
})();
