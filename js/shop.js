/* ============================================
   SHOP - Point of Sale Logic
   ============================================ */

// State
let shopProducts = [];
let shopCategories = [];
let cart = [];
let currentFilter = '';
let currentSearch = '';

/**
 * Initialize shop page
 */
async function initShop() {
  if (!isApiConfigured()) {
    document.getElementById('apiNotice').classList.remove('hidden');
  }
  
  await Promise.all([
    loadShopCategories(),
    loadShopProducts()
  ]);
}

/**
 * Load categories
 */
async function loadShopCategories() {
  try {
    const result = await getData('categories');
    if (result.success) {
      shopCategories = result.data;
      renderCategoryFilters();
    }
  } catch (e) {
    console.error('Categories error:', e);
  }
}

/**
 * Load products
 */
async function loadShopProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = '<div class="text-center w-full" style="grid-column:1/-1;padding:var(--space-2xl);"><div class="loading-spinner" style="margin:0 auto;"></div><p class="text-muted mt-md">Đang tải sản phẩm...</p></div>';
  
  try {
    const filters = {};
    if (currentFilter) filters.category = currentFilter;
    if (currentSearch) filters.search = currentSearch;
    
    const result = await getData('products', filters);
    if (result.success) {
      shopProducts = result.data.filter(p => p.Status === 'active');
      renderProducts();
    }
  } catch (e) {
    console.error('Products error:', e);
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">⚠️</div><h3>Không thể tải sản phẩm</h3><p>${e.message}</p></div>`;
  }
}

/**
 * Render category filter chips
 */
function renderCategoryFilters() {
  const container = document.getElementById('categoryFilters');
  container.innerHTML = `<button class="filter-chip ${!currentFilter ? 'active' : ''}" onclick="filterByCategory('')">Tất cả</button>`;
  
  shopCategories.forEach(cat => {
    container.innerHTML += `<button class="filter-chip ${currentFilter === cat.Name ? 'active' : ''}" onclick="filterByCategory('${escapeHtml(cat.Name)}')">${escapeHtml(cat.Name)}</button>`;
  });
}

/**
 * Filter products by category
 */
function filterByCategory(category) {
  currentFilter = category;
  renderCategoryFilters();
  loadShopProducts();
}

/**
 * Search products
 */
const searchProducts = debounce((value) => {
  currentSearch = value;
  loadShopProducts();
}, 400);

/**
 * Render product grid
 */
function renderProducts() {
  const grid = document.getElementById('productGrid');
  
  if (shopProducts.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">📦</div>
        <h3>Không có sản phẩm</h3>
        <p>${currentSearch || currentFilter ? 'Không tìm thấy sản phẩm phù hợp với bộ lọc' : 'Hãy thêm sản phẩm qua trang Quét Mã hoặc Quản Lý'}</p>
        ${!currentSearch && !currentFilter ? '<a href="scanner.html" class="btn btn-primary mt-md"><i data-lucide="scan-line"></i> Quét Mã Thêm SP</a>' : ''}
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  grid.innerHTML = shopProducts.map(product => {
    const hasDiscount = product.SalePrice && product.SalePrice > 0 && product.SalePrice < product.Price;
    const displayPrice = hasDiscount ? product.SalePrice : product.Price;
    const inCart = cart.find(item => item.productId === product.ID);
    const discountPercent = hasDiscount ? Math.round((1 - product.SalePrice / product.Price) * 100) : 0;
    
    return `
      <div class="product-card animate-fadeInUp" onclick="addToCart('${product.ID}')">
        <div class="product-image">
          ${product.ImageURL 
            ? `<img src="${escapeHtml(product.ImageURL)}" alt="${escapeHtml(product.Name)}" onerror="this.parentElement.innerHTML='📦'">`
            : '📦'}
          ${hasDiscount ? `<span class="product-badge badge badge-danger">-${discountPercent}%</span>` : ''}
          ${inCart ? `<span class="product-badge badge badge-primary" style="left:var(--space-sm);right:auto;">×${inCart.quantity}</span>` : ''}
        </div>
        <div class="product-info">
          <div class="product-category">${escapeHtml(product.Category || 'Chung')}</div>
          <div class="product-name">${escapeHtml(product.Name)}</div>
          <div class="product-price">
            <span class="price-current">${formatCurrency(displayPrice)}</span>
            ${hasDiscount ? `<span class="price-original">${formatCurrency(product.Price)}</span>` : ''}
          </div>
          <div class="product-stock">
            <i data-lucide="package" style="width:14px;height:14px;"></i>
            Kho: ${product.Stock || 0}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

// ========== CART ==========

/**
 * Add product to cart
 */
function addToCart(productId) {
  const product = shopProducts.find(p => p.ID === productId);
  if (!product) return;
  
  const existing = cart.find(item => item.productId === productId);
  
  if (existing) {
    if (existing.quantity >= (product.Stock || 999)) {
      toast.warning('Hết hàng', `${product.Name} đã hết hàng trong kho`);
      return;
    }
    existing.quantity++;
  } else {
    const hasDiscount = product.SalePrice && product.SalePrice > 0 && product.SalePrice < product.Price;
    cart.push({
      productId: product.ID,
      name: product.Name,
      price: hasDiscount ? product.SalePrice : product.Price,
      originalPrice: product.Price,
      imageUrl: product.ImageURL,
      quantity: 1
    });
  }
  
  renderCart();
  renderProducts(); // Re-render to show cart badges
  
  // Show cart on mobile
  if (window.innerWidth <= 768) {
    openCartSidebar();
  }
  
  // Subtle feedback
  toast.success('Đã thêm', `${product.Name} × ${(existing ? existing.quantity : 1)}`);
}

/**
 * Update item quantity
 */
function updateCartQty(productId, delta) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;
  
  item.quantity += delta;
  
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.productId !== productId);
  }
  
  renderCart();
  renderProducts();
}

/**
 * Remove item from cart
 */
function removeFromCart(productId) {
  cart = cart.filter(i => i.productId !== productId);
  renderCart();
  renderProducts();
}

/**
 * Clear entire cart
 */
function clearCart() {
  cart = [];
  renderCart();
  renderProducts();
}

/**
 * Get cart total
 */
function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

/**
 * Get cart item count
 */
function getCartCount() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Render cart sidebar
 */
function renderCart() {
  const cartItems = document.getElementById('cartItems');
  const cartCount = document.getElementById('cartCount');
  const cartTotal = document.getElementById('cartTotalValue');
  const btnCheckout = document.getElementById('btnCheckout');
  const btnClear = document.getElementById('btnClear');
  const floatingCount = document.getElementById('floatingCartCount');
  
  // Update count badges
  const count = getCartCount();
  cartCount.textContent = count;
  if (floatingCount) floatingCount.textContent = count;
  
  // Update total
  cartTotal.textContent = formatCurrency(getCartTotal());
  
  // Enable/disable buttons
  btnCheckout.disabled = cart.length === 0;
  btnClear.disabled = cart.length === 0;
  
  if (cart.length === 0) {
    cartItems.innerHTML = `
      <div class="cart-empty">
        <i data-lucide="shopping-cart" style="width:48px;height:48px;"></i>
        <p class="mt-md">Giỏ hàng trống</p>
        <p class="text-muted" style="font-size:0.8rem;">Chọn sản phẩm để thêm vào giỏ</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item animate-fadeIn">
      <div class="cart-item-image">
        ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" onerror="this.parentElement.innerHTML='📦'">` : '📦'}
      </div>
      <div class="cart-item-details">
        <div class="cart-item-name">${escapeHtml(item.name)}</div>
        <div class="cart-item-price">${formatCurrency(item.price)}</div>
        <div class="cart-item-qty">
          <button onclick="updateCartQty('${item.productId}', -1)">−</button>
          <span>${item.quantity}</span>
          <button onclick="updateCartQty('${item.productId}', 1)">+</button>
          <span style="margin-left:auto;color:var(--text-secondary);font-size:0.8rem;">${formatCurrency(item.price * item.quantity)}</span>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${item.productId}')">
        <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
      </button>
    </div>
  `).join('');
  
  lucide.createIcons();
}

/**
 * Toggle cart sidebar
 */
function toggleCartSidebar() {
  document.getElementById('cartSidebar').classList.toggle('open');
}

function openCartSidebar() {
  document.getElementById('cartSidebar').classList.add('open');
}

function closeCartSidebar() {
  document.getElementById('cartSidebar').classList.remove('open');
}

// ========== CHECKOUT ==========

/**
 * Open checkout modal
 */
function openCheckout() {
  if (cart.length === 0) {
    toast.warning('Giỏ hàng trống', 'Vui lòng thêm sản phẩm trước khi thanh toán');
    return;
  }
  
  // Fill order summary
  const summaryHtml = cart.map(item => `
    <div class="order-item">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="text-muted"> × ${item.quantity}</span>
      </div>
      <div style="font-weight:600;">${formatCurrency(item.price * item.quantity)}</div>
    </div>
  `).join('');
  
  document.getElementById('orderItems').innerHTML = summaryHtml;
  document.getElementById('orderTotalDisplay').textContent = formatCurrency(getCartTotal());
  
  openModal('checkoutModal');
}

/**
 * Submit order
 */
async function submitOrder(event) {
  event.preventDefault();
  
  const btnSubmit = document.getElementById('btnSubmitOrder');
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;border-width:2px;"></div> Đang tạo đơn...';
  
  const orderData = {
    CustomerName: document.getElementById('customerName').value.trim() || 'Khách vãng lai',
    CustomerPhone: document.getElementById('customerPhone').value.trim(),
    Items: cart.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    })),
    TotalAmount: getCartTotal(),
    PaymentMethod: document.getElementById('paymentMethod').value,
    Note: document.getElementById('orderNote').value.trim()
  };
  
  try {
    let result;
    if (isApiConfigured()) {
      result = await api.createOrder(orderData);
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000));
      result = { success: true, message: `[Demo] Đơn hàng đã được tạo thành công!`, data: { OrderID: 'ORD' + Date.now() } };
    }
    
    if (result.success) {
      toast.success('🎉 Đơn hàng đã tạo!', result.message);
      
      // Clear cart
      cart = [];
      renderCart();
      renderProducts();
      
      // Close modal
      closeModal('checkoutModal');
      closeCartSidebar();
      
      // Reset form
      document.getElementById('checkoutForm').reset();
      
      // Reload products (stock updated)
      if (isApiConfigured()) {
        api.clearCache('products');
        loadShopProducts();
      }
    } else {
      toast.error('Lỗi tạo đơn', result.error || 'Có lỗi xảy ra');
    }
  } catch (error) {
    toast.error('Lỗi kết nối', error.message);
  }
  
  btnSubmit.disabled = false;
  btnSubmit.innerHTML = '<i data-lucide="check-circle"></i> Xác Nhận Đơn Hàng';
  lucide.createIcons();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initShop();
  renderCart();
});
