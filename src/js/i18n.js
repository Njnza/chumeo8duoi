/* ============================================================
   ShopPro - Internationalization (i18n) & Multi-Currency Engine
   Supports: Vietnamese (vi) / English (en)
   Supports: VND (₫), USD ($), EUR (€), JPY (¥)
   ============================================================ */

(function () {
  const TRANSLATIONS = {
    vi: {
      'nav.pos': 'Bán Hàng',
      'nav.products': 'Hàng Hóa',
      'nav.orders': 'Đơn Hàng',
      'nav.customers': 'Khách Hàng',
      'nav.reports': 'Báo Cáo',
      'nav.settings': 'Cài Đặt',
      'nav.shifts': 'Quản Lý Ca',
      'nav.cashflow': 'Sổ Quỹ Thu Chi',
      'common.save': 'Lưu Thay Đổi',
      'common.cancel': 'Hủy Bỏ',
      'common.delete': 'Xóa',
      'common.edit': 'Chỉnh Sửa',
      'common.search': 'Tìm kiếm...',
      'common.loading': 'Đang tải dữ liệu...',
      'common.status': 'Trạng thái',
      'common.total': 'Tổng cộng',
      'common.subtotal': 'Tạm tính',
      'common.discount': 'Giảm giá',
      'common.print': 'In Hóa Đơn',
      'common.export_excel': 'Xuất Excel',
      'common.export_pdf': 'Xuất PDF',
      'common.backup': 'Sao Lưu',
      'common.restore': 'Khôi Phục',
      'pos.checkout': 'Thanh Toán',
      'pos.cart_empty': 'Giỏ hàng đang trống',
      'pos.hold_cart': 'Lưu Đơn',
      'pos.cash': 'Tiền mặt',
      'pos.card': 'Thẻ',
      'pos.transfer': 'Chuyển khoản (VietQR)',
      'settings.currency': 'Đơn vị tiền tệ',
      'settings.language': 'Ngôn ngữ hiển thị'
    },
    en: {
      'nav.pos': 'Point of Sale',
      'nav.products': 'Products',
      'nav.orders': 'Orders',
      'nav.customers': 'Customers',
      'nav.reports': 'Reports',
      'nav.settings': 'Settings',
      'nav.shifts': 'Shift Control',
      'nav.cashflow': 'Cash Flow',
      'common.save': 'Save Changes',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.search': 'Search...',
      'common.loading': 'Loading data...',
      'common.status': 'Status',
      'common.total': 'Total',
      'common.subtotal': 'Subtotal',
      'common.discount': 'Discount',
      'common.print': 'Print Receipt',
      'common.export_excel': 'Export Excel',
      'common.export_pdf': 'Export PDF',
      'common.backup': 'Backup Data',
      'common.restore': 'Restore Data',
      'pos.checkout': 'Checkout',
      'pos.cart_empty': 'Cart is empty',
      'pos.hold_cart': 'Hold Order',
      'pos.cash': 'Cash',
      'pos.card': 'Card',
      'pos.transfer': 'Bank Transfer (QR)',
      'settings.currency': 'Currency',
      'settings.language': 'Language'
    }
  };

  const CURRENCY_CONFIG = {
    VND: { symbol: '₫', position: 'after', decimals: 0, rate: 1, locale: 'vi-VN' },
    USD: { symbol: '$', position: 'before', decimals: 2, rate: 25400, locale: 'en-US' },
    EUR: { symbol: '€', position: 'before', decimals: 2, rate: 27500, locale: 'de-DE' },
    JPY: { symbol: '¥', position: 'before', decimals: 0, rate: 165, locale: 'ja-JP' }
  };

  let currentLang = localStorage.getItem('shoppro_lang') || 'vi';
  let currentCurrency = localStorage.getItem('shoppro_currency') || 'VND';

  function t(key, fallback = '') {
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.vi;
    return dict[key] || fallback || key;
  }

  function setLanguage(lang) {
    if (TRANSLATIONS[lang]) {
      currentLang = lang;
      localStorage.setItem('shoppro_lang', lang);
      document.documentElement.lang = lang;
      applyTranslations();
      window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang } }));
    }
  }

  function getLanguage() {
    return currentLang;
  }

  function setCurrency(currCode) {
    if (CURRENCY_CONFIG[currCode]) {
      currentCurrency = currCode;
      localStorage.setItem('shoppro_currency', currCode);
      window.dispatchEvent(new CustomEvent('currency-changed', { detail: { currency: currCode } }));
    }
  }

  function getCurrency() {
    return currentCurrency;
  }

  function formatMoney(amountInVnd) {
    if (amountInVnd === null || amountInVnd === undefined || isNaN(amountInVnd)) {
      amountInVnd = 0;
    }

    const cfg = CURRENCY_CONFIG[currentCurrency] || CURRENCY_CONFIG.VND;
    const converted = currentCurrency === 'VND' ? amountInVnd : (amountInVnd / cfg.rate);

    const formattedNum = new Intl.NumberFormat(cfg.locale, {
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals
    }).format(converted);

    if (cfg.position === 'before') {
      return `${cfg.symbol}${formattedNum}`;
    }
    return `${formattedNum}${cfg.symbol}`;
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = t(key, el.textContent);
      }
    });
  }

  // Expose global helpers
  window.i18n = {
    t,
    setLanguage,
    getLanguage,
    setCurrency,
    getCurrency,
    formatMoney,
    applyTranslations,
    currencies: CURRENCY_CONFIG,
    languages: [
      { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
      { code: 'en', name: 'English', flag: '🇬🇧' }
    ]
  };

  // Override / Aliased formatCurrency globally
  window.formatCurrency = formatMoney;

  document.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
  });
})();
