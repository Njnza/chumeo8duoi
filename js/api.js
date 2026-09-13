/* ============================================
   BÁN HÀNG APP - API Module
   Giao tiếp với Google Apps Script Backend
   ============================================ */

class ShopAPI {
  constructor() {
    this.baseUrl = APP_CONFIG.API_URL;
    this.cache = new Map();
    this.cacheDuration = APP_CONFIG.CACHE_DURATION;
  }

  /**
   * Core API call method
   * Uses GET with URL params for maximum compatibility with GAS
   */
  async call(action, data = {}) {
    if (!isApiConfigured()) {
      throw new Error('API chưa được cấu hình. Vui lòng cập nhật API_URL trong js/config.js');
    }

    const params = new URLSearchParams({ action });
    
    // Add data as URL parameter
    if (Object.keys(data).length > 0) {
      // For simple params, add directly
      if (typeof data === 'object' && !Array.isArray(data)) {
        // Check if data has simple key-value pairs vs complex objects
        const hasComplexValues = Object.values(data).some(v => typeof v === 'object');
        if (hasComplexValues) {
          params.append('data', JSON.stringify(data));
        } else {
          Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              params.append(key, String(value));
            }
          });
        }
      }
    }

    const url = `${this.baseUrl}?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'API trả về lỗi không xác định');
      }

      return result;
    } catch (error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Không thể kết nối đến server. Kiểm tra kết nối mạng và API URL.');
      }
      throw error;
    }
  }

  /**
   * Cached API call
   */
  async cachedCall(cacheKey, action, data = {}) {
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
      return cached.data;
    }

    const result = await this.call(action, data);
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * Clear cache
   */
  clearCache(prefix) {
    if (prefix) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // ========== PRODUCTS ==========

  async getProducts(filters = {}) {
    const cacheKey = `products_${JSON.stringify(filters)}`;
    return this.cachedCall(cacheKey, 'getProducts', filters);
  }

  async getProduct(identifier) {
    return this.call('getProduct', { sku: identifier });
  }

  async addProduct(productData) {
    const result = await this.call('addProduct', productData);
    this.clearCache('products');
    return result;
  }

  async updateProduct(productData) {
    const result = await this.call('updateProduct', productData);
    this.clearCache('products');
    return result;
  }

  async deleteProduct(id) {
    const result = await this.call('deleteProduct', { id });
    this.clearCache('products');
    return result;
  }

  // ========== ORDERS ==========

  async getOrders(filters = {}) {
    return this.call('getOrders', filters);
  }

  async getOrder(orderId) {
    return this.call('getOrder', { orderId });
  }

  async createOrder(orderData) {
    const result = await this.call('createOrder', orderData);
    this.clearCache('products'); // Stock changed
    return result;
  }

  async updateOrderStatus(orderId, status) {
    return this.call('updateOrderStatus', { orderId, status });
  }

  // ========== CATEGORIES ==========

  async getCategories() {
    return this.cachedCall('categories', 'getCategories');
  }

  async addCategory(categoryData) {
    const result = await this.call('addCategory', categoryData);
    this.clearCache('categories');
    return result;
  }

  async deleteCategory(id) {
    const result = await this.call('deleteCategory', { id });
    this.clearCache('categories');
    return result;
  }

  // ========== DASHBOARD ==========

  async getDashboard() {
    return this.cachedCall('dashboard', 'getDashboard');
  }

  // ========== HEALTH CHECK ==========

  async ping() {
    return this.call('ping');
  }
}

// Global API instance
const api = new ShopAPI();

/* ---------- Demo/Offline Mode ---------- */
/* Dữ liệu mẫu khi chưa kết nối API */

const DEMO_DATA = {
  products: [
    { ID: 'P001', SKU: 'SP-001', Name: 'Áo thun nam basic', Description: 'Áo thun cotton 100%, form regular fit', Price: 199000, SalePrice: 149000, Category: 'Thời trang', Stock: 50, ImageURL: '', Status: 'active', CreatedAt: '2024-01-15T10:00:00Z', UpdatedAt: '2024-01-15T10:00:00Z' },
    { ID: 'P002', SKU: 'SP-002', Name: 'Quần jeans slim fit', Description: 'Quần jeans co giãn, form slim fit', Price: 450000, SalePrice: 0, Category: 'Thời trang', Stock: 30, ImageURL: '', Status: 'active', CreatedAt: '2024-01-15T10:00:00Z', UpdatedAt: '2024-01-15T10:00:00Z' },
    { ID: 'P003', SKU: 'SP-003', Name: 'Tai nghe Bluetooth TWS', Description: 'Tai nghe không dây, pin 24h, chống ồn chủ động', Price: 350000, SalePrice: 299000, Category: 'Điện tử', Stock: 100, ImageURL: '', Status: 'active', CreatedAt: '2024-01-16T10:00:00Z', UpdatedAt: '2024-01-16T10:00:00Z' },
    { ID: 'P004', SKU: 'SP-004', Name: 'Bình nước inox 500ml', Description: 'Bình giữ nhiệt 24h, inox 304 an toàn', Price: 180000, SalePrice: 0, Category: 'Gia dụng', Stock: 200, ImageURL: '', Status: 'active', CreatedAt: '2024-01-17T10:00:00Z', UpdatedAt: '2024-01-17T10:00:00Z' },
    { ID: 'P005', SKU: 'SP-005', Name: 'Balo laptop 15.6 inch', Description: 'Balo chống nước, nhiều ngăn tiện dụng', Price: 520000, SalePrice: 420000, Category: 'Phụ kiện', Stock: 45, ImageURL: '', Status: 'active', CreatedAt: '2024-01-18T10:00:00Z', UpdatedAt: '2024-01-18T10:00:00Z' },
    { ID: 'P006', SKU: 'SP-006', Name: 'Áo khoác gió unisex', Description: 'Áo khoác gió nhẹ, chống nước nhẹ', Price: 320000, SalePrice: 250000, Category: 'Thời trang', Stock: 80, ImageURL: '', Status: 'active', CreatedAt: '2024-01-19T10:00:00Z', UpdatedAt: '2024-01-19T10:00:00Z' },
    { ID: 'P007', SKU: 'SP-007', Name: 'Chuột không dây Wireless', Description: 'Chuột silent click, pin AA 12 tháng', Price: 150000, SalePrice: 0, Category: 'Điện tử', Stock: 150, ImageURL: '', Status: 'active', CreatedAt: '2024-01-20T10:00:00Z', UpdatedAt: '2024-01-20T10:00:00Z' },
    { ID: 'P008', SKU: 'SP-008', Name: 'Sổ tay bìa da A5', Description: 'Sổ tay 200 trang giấy kem, bìa da PU cao cấp', Price: 95000, SalePrice: 75000, Category: 'Phụ kiện', Stock: 300, ImageURL: '', Status: 'active', CreatedAt: '2024-01-21T10:00:00Z', UpdatedAt: '2024-01-21T10:00:00Z' },
  ],

  categories: [
    { ID: 'C001', Name: 'Thời trang', Description: 'Quần áo, giày dép', Color: '#7c6aef' },
    { ID: 'C002', Name: 'Điện tử', Description: 'Thiết bị điện tử, phụ kiện', Color: '#00d4ff' },
    { ID: 'C003', Name: 'Gia dụng', Description: 'Đồ gia dụng, nhà bếp', Color: '#00e676' },
    { ID: 'C004', Name: 'Phụ kiện', Description: 'Balo, túi xách, phụ kiện', Color: '#ffab40' },
  ],

  orders: [
    { OrderID: 'ORD001', CustomerName: 'Nguyễn Văn A', CustomerPhone: '0901234567', Items: [{ productId: 'P001', name: 'Áo thun nam basic', price: 149000, quantity: 2 }, { productId: 'P003', name: 'Tai nghe Bluetooth TWS', price: 299000, quantity: 1 }], TotalAmount: 597000, Status: 'completed', PaymentMethod: 'cash', Note: '', CreatedAt: '2024-01-20T14:30:00Z' },
    { OrderID: 'ORD002', CustomerName: 'Trần Thị B', CustomerPhone: '0909876543', Items: [{ productId: 'P005', name: 'Balo laptop 15.6 inch', price: 420000, quantity: 1 }], TotalAmount: 420000, Status: 'pending', PaymentMethod: 'transfer', Note: 'Giao trước 5h chiều', CreatedAt: '2024-01-21T09:15:00Z' },
    { OrderID: 'ORD003', CustomerName: 'Lê Hoàng C', CustomerPhone: '0912345678', Items: [{ productId: 'P006', name: 'Áo khoác gió unisex', price: 250000, quantity: 3 }], TotalAmount: 750000, Status: 'shipping', PaymentMethod: 'momo', Note: '', CreatedAt: '2024-01-21T11:45:00Z' },
  ]
};

/**
 * Get data - use API if configured, otherwise use demo data
 */
async function getData(type, filters = {}) {
  if (isApiConfigured()) {
    try {
      switch (type) {
        case 'products': return await api.getProducts(filters);
        case 'categories': return await api.getCategories();
        case 'orders': return await api.getOrders(filters);
        case 'dashboard': return await api.getDashboard();
        default: throw new Error('Unknown data type: ' + type);
      }
    } catch (error) {
      console.error('API Error:', error);
      toast.error('Lỗi API', error.message);
      // Fallback to demo data
      return getFallbackData(type, filters);
    }
  } else {
    return getFallbackData(type, filters);
  }
}

function getFallbackData(type, filters = {}) {
  let data;
  switch (type) {
    case 'products':
      data = [...DEMO_DATA.products];
      if (filters.category) {
        data = data.filter(p => p.Category === filters.category);
      }
      if (filters.search) {
        const s = filters.search.toLowerCase();
        data = data.filter(p => p.Name.toLowerCase().includes(s) || p.SKU.toLowerCase().includes(s));
      }
      return { success: true, data, total: data.length };
    case 'categories':
      return { success: true, data: [...DEMO_DATA.categories] };
    case 'orders':
      data = [...DEMO_DATA.orders];
      if (filters.status) {
        data = data.filter(o => o.Status === filters.status);
      }
      return { success: true, data, total: data.length };
    case 'dashboard':
      return {
        success: true,
        data: {
          totalProducts: DEMO_DATA.products.length,
          totalOrders: DEMO_DATA.orders.length,
          totalRevenue: DEMO_DATA.orders.reduce((s, o) => s + o.TotalAmount, 0),
          todayOrders: 1,
          todayRevenue: 420000,
          lowStock: [{ ID: 'P002', Name: 'Quần jeans slim fit', Stock: 5 }],
          ordersByStatus: { completed: 1, pending: 1, shipping: 1 },
          topProducts: [
            { name: 'Áo khoác gió unisex', quantity: 3, revenue: 750000 },
            { name: 'Áo thun nam basic', quantity: 2, revenue: 298000 },
            { name: 'Tai nghe Bluetooth TWS', quantity: 1, revenue: 299000 },
          ],
          last7Days: Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return {
              date: d.toISOString().split('T')[0],
              revenue: Math.floor(Math.random() * 2000000),
              orders: Math.floor(Math.random() * 10)
            };
          }),
          recentOrders: DEMO_DATA.orders.slice(0, 5)
        }
      };
    default:
      return { success: false, data: [] };
  }
}
