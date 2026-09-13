/* ============================================
   BÁN HÀNG APP - Configuration
   ============================================ */

const APP_CONFIG = {
  // =============================================
  // ⚠️ THAY ĐỔI URL NÀY SAU KHI DEPLOY GOOGLE APPS SCRIPT
  // Hướng dẫn: Mở file apps-script/Code.gs, copy code vào
  // Google Apps Script, Deploy > New deployment > Web App
  // Copy URL và paste vào đây
  // =============================================
  API_URL: 'YOUR_GOOGLE_APPS_SCRIPT_DEPLOYMENT_URL_HERE',

  APP_NAME: 'ShopPro',
  APP_VERSION: '1.0.0',
  CURRENCY: 'VND',
  CURRENCY_LOCALE: 'vi-VN',

  // Số sản phẩm mỗi trang
  PRODUCTS_PER_PAGE: 20,

  // Thời gian cache (ms)
  CACHE_DURATION: 5 * 60 * 1000, // 5 phút

  // Thời gian toast hiển thị (ms)
  TOAST_DURATION: 4000,

  // Hình ảnh placeholder khi sản phẩm không có ảnh
  PLACEHOLDER_IMAGE: 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#16163a"/>
      <text x="100" y="100" font-family="sans-serif" font-size="50" fill="#6666aa" text-anchor="middle" dominant-baseline="central">📦</text>
    </svg>
  `),

  // Trạng thái đơn hàng
  ORDER_STATUSES: {
    pending: { label: 'Chờ xử lý', color: 'warning' },
    confirmed: { label: 'Đã xác nhận', color: 'info' },
    shipping: { label: 'Đang giao', color: 'accent' },
    completed: { label: 'Hoàn thành', color: 'success' },
    cancelled: { label: 'Đã hủy', color: 'danger' }
  },

  // Phương thức thanh toán
  PAYMENT_METHODS: {
    cash: 'Tiền mặt',
    transfer: 'Chuyển khoản',
    momo: 'MoMo',
    zalopay: 'ZaloPay'
  }
};

/* ---------- Utility Functions ---------- */

/**
 * Format số tiền theo VNĐ
 */
function formatCurrency(amount) {
  if (!amount && amount !== 0) return '0₫';
  return new Intl.NumberFormat(APP_CONFIG.CURRENCY_LOCALE, {
    style: 'decimal',
    maximumFractionDigits: 0
  }).format(amount) + '₫';
}

/**
 * Tạo ID ngẫu nhiên
 */
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * Format ngày tháng
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * Format ngày ngắn
 */
function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

/**
 * Debounce function
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Truncate text
 */
function truncateText(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength) + '...';
}

/**
 * Toast notification system
 */
class ToastManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    if (document.querySelector('.toast-container')) {
      this.container = document.querySelector('.toast-container');
      return;
    }
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  show(type, title, message = '', duration = APP_CONFIG.TOAST_DURATION) {
    const icons = {
      success: '<i data-lucide="check-circle"></i>',
      error: '<i data-lucide="x-circle"></i>',
      warning: '<i data-lucide="alert-triangle"></i>',
      info: '<i data-lucide="info"></i>'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">
        <i data-lucide="x" style="width:16px;height:16px;"></i>
      </button>
    `;

    this.container.appendChild(toast);

    // Initialize lucide icons in the toast
    if (window.lucide) {
      lucide.createIcons({ nodes: [toast] });
    }

    // Auto remove
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);

    return toast;
  }

  success(title, message) { return this.show('success', title, message); }
  error(title, message) { return this.show('error', title, message); }
  warning(title, message) { return this.show('warning', title, message); }
  info(title, message) { return this.show('info', title, message); }
}

// Global toast instance
const toast = new ToastManager();

/**
 * Modal helper
 */
function openModal(modalId) {
  const backdrop = document.getElementById(modalId + '-backdrop');
  const modal = document.getElementById(modalId);
  if (backdrop) backdrop.classList.add('active');
  if (modal) modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const backdrop = document.getElementById(modalId + '-backdrop');
  const modal = document.getElementById(modalId);
  if (backdrop) backdrop.classList.remove('active');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * Check if API URL is configured
 */
function isApiConfigured() {
  return APP_CONFIG.API_URL && 
         APP_CONFIG.API_URL !== 'https://script.google.com/macros/s/AKfycbwUKyQuCoyZDfF-Vk-HJxXW-3N2Y3qlHhUC6IkWyRUFt86-n7ltoCbrOGXtfw0FoiwV/exec';
}

/**
 * Show setup instructions if API not configured
 */
function showSetupRequired() {
  return `
    <div class="empty-state">
      <div class="empty-icon">⚙️</div>
      <h3>Cấu hình API cần thiết</h3>
      <p>Bạn cần triển khai Google Apps Script và cập nhật URL API trong file <code>js/config.js</code></p>
      <div style="text-align: left; max-width: 500px; margin: 0 auto;">
        <div class="card" style="margin-top: var(--space-md);">
          <h4 style="margin-bottom: var(--space-md); color: var(--accent);">Hướng dẫn nhanh:</h4>
          <ol style="padding-left: 20px; color: var(--text-secondary); line-height: 2;">
            <li>Mở <a href="https://script.google.com" target="_blank">Google Apps Script</a></li>
            <li>Tạo project mới, copy code từ <code>apps-script/Code.gs</code></li>
            <li>Deploy → New deployment → Web App</li>
            <li>Chọn "Anyone" cho Who has access</li>
            <li>Copy URL và paste vào <code>js/config.js</code></li>
          </ol>
        </div>
      </div>
    </div>
  `;
}
