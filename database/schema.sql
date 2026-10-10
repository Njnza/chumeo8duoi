-- ShopPro Desktop - Database Schema
-- SQLite3

-- ========== CATEGORIES ==========
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#7c6aef',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ========== PRODUCTS ==========
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category_id INTEGER,
  price REAL NOT NULL DEFAULT 0,
  sale_price REAL DEFAULT 0,
  cost_price REAL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  unit TEXT DEFAULT 'cái',
  image TEXT DEFAULT '',
  expiry_date TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- ========== CUSTOMERS ==========
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  note TEXT DEFAULT '',
  tier_mode TEXT DEFAULT 'auto',
  fixed_tier_id TEXT DEFAULT '',
  custom_tiers_json TEXT DEFAULT '',
  total_spent REAL DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ========== ORDERS ==========
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  customer_id INTEGER,
  subtotal REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  amount_paid REAL DEFAULT 0,
  change_amount REAL DEFAULT 0,
  user_id INTEGER,
  staff_name TEXT DEFAULT '',
  shift_id INTEGER,
  status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'pending', 'cancelled', 'returned')),
  note TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

-- ========== ORDER ITEMS ==========
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  product_sku TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  discount REAL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  returned_quantity INTEGER DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ========== ORDER RETURNS (Đổi Trả Hàng) ==========
CREATE TABLE IF NOT EXISTS order_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_code TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL,
  order_code TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT DEFAULT '',
  refund_amount REAL DEFAULT 0,
  reason TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_returns_code ON order_returns(return_code);
CREATE INDEX IF NOT EXISTS idx_returns_order ON order_returns(order_id);

CREATE TABLE IF NOT EXISTS order_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  order_item_id INTEGER,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  product_sku TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  refund_subtotal REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (return_id) REFERENCES order_returns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON order_return_items(return_id);

-- ========== USERS (Nhân Viên & Chủ Shop) ==========
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('owner', 'staff')),
  pin TEXT NOT NULL DEFAULT '0000',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_pin ON users(pin);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ========== SETTINGS ==========
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

-- ========== SEED DEFAULT DATA ==========

-- Default users
INSERT OR IGNORE INTO users (username, name, role, pin, phone, status) VALUES
  ('admin', 'Chủ Cửa Hàng', 'owner', '1234', '0900000001', 'active'),
  ('thungan', 'Thu Ngân Ca 1', 'staff', '0000', '0900000002', 'active');

-- Default categories
INSERT OR IGNORE INTO categories (name, description, color, sort_order) VALUES
  ('Thời trang', 'Quần áo, giày dép, phụ kiện thời trang', '#7c6aef', 1),
  ('Điện tử', 'Thiết bị điện tử, linh kiện, phụ kiện', '#00d4ff', 2),
  ('Gia dụng', 'Đồ gia dụng, nhà bếp, nội thất', '#00e676', 3),
  ('Thực phẩm', 'Thực phẩm, đồ uống, bánh kẹo', '#ff6b6b', 4),
  ('Phụ kiện', 'Balo, túi xách, phụ kiện khác', '#ffab40', 5);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('shop_name', 'ShopPro'),
  ('shop_address', ''),
  ('shop_phone', ''),
  ('shop_email', ''),
  ('tax_enabled', 'false'),
  ('tax_rate', '10'),
  ('currency', 'VND'),
  ('receipt_width', '80'),
  ('receipt_footer', 'Cảm ơn quý khách!'),
  ('scanner_port', '8765'),
  ('order_prefix', 'HD'),
  ('auto_print', 'false'),
  ('member_tiers', '[{"id":"bronze","name":"Đồng","min_spent":0,"discount_percent":0,"color":"#cd7f32","badge":"🥉"},{"id":"silver","name":"Bạc","min_spent":2000000,"discount_percent":5,"color":"#c0c0c0","badge":"🥈"},{"id":"gold","name":"Vàng","min_spent":5000000,"discount_percent":10,"color":"#ffd700","badge":"🥇"},{"id":"diamond","name":"Kim Cương","min_spent":10000000,"discount_percent":15,"color":"#00d4ff","badge":"💎"}]');

-- Sample products
INSERT OR IGNORE INTO products (sku, barcode, name, description, category_id, price, sale_price, cost_price, stock, unit, image) VALUES
  ('SP-001', '8936082031001', 'Áo thun nam basic', 'Áo thun cotton 100%, form regular fit', 1, 199000, 149000, 95000, 50, 'cái', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=60'),
  ('SP-002', '8936082031002', 'Quần jeans slim fit', 'Quần jeans co giãn, form slim fit', 1, 450000, 0, 220000, 30, 'cái', 'https://images.unsplash.com/photo-1542272604-780c96856592?w=300&auto=format&fit=crop&q=60'),
  ('SP-003', '8936082031003', 'Tai nghe Bluetooth TWS', 'Tai nghe không dây, pin 24h, chống ồn', 2, 350000, 299000, 150000, 100, 'cái', 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=300&auto=format&fit=crop&q=60'),
  ('SP-004', '8936082031004', 'Bình nước inox 500ml', 'Bình giữ nhiệt 24h, inox 304', 3, 180000, 0, 85000, 200, 'cái', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=300&auto=format&fit=crop&q=60'),
  ('SP-005', '8936082031005', 'Balo laptop 15.6 inch', 'Balo chống nước, nhiều ngăn', 5, 520000, 420000, 250000, 45, 'cái', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&auto=format&fit=crop&q=60'),
  ('SP-006', '8936082031006', 'Áo khoác gió unisex', 'Áo khoác gió nhẹ, chống nước', 1, 320000, 250000, 155000, 80, 'cái', 'https://images.unsplash.com/photo-1544441893-675973e31985?w=300&auto=format&fit=crop&q=60'),
  ('SP-007', '8936082031007', 'Chuột không dây', 'Chuột silent click, pin AA 12 tháng', 2, 150000, 0, 65000, 150, 'cái', 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=300&auto=format&fit=crop&q=60'),
  ('SP-008', '8936082031008', 'Sổ tay bìa da A5', 'Sổ 200 trang giấy kem, bìa da PU', 5, 95000, 75000, 40000, 300, 'cuốn', 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop&q=60'),
  ('SP-101', '8936082031101', 'Cải chíp sạch', 'Rau cải chíp tươi ngon VietGAP', 4, 3200, 0, 2000, 120, '100g', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&auto=format&fit=crop&q=60'),
  ('SP-102', '8936082031102', 'Cải bó xôi Đà Lạt', 'Cải bó xôi hữu cơ 100g', 4, 3200, 0, 2000, 95, '100g', 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=300&auto=format&fit=crop&q=60'),
  ('SP-103', '8936082031103', 'Lá kim vụn dầu oliu', 'Rong biển lá kim ăn liền', 4, 56000, 0, 38000, 60, '1 Hộp', 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=300&auto=format&fit=crop&q=60'),
  ('SP-104', '8936082031104', 'Lá kim cuộn gimbab', 'Rong biển cuộn cơm Hàn Quốc', 4, 32000, 0, 21000, 80, '1 Gói', 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=300&auto=format&fit=crop&q=60'),
  ('SP-105', '8936082031105', 'Nấm Hyogi đông lạnh', 'Nấm hương tươi đông lạnh', 4, 80000, 0, 52000, 45, '1 Gói', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=60'),
  ('SP-106', '8936082031106', 'Nước Latte vị đào 250ml', 'Nước uống hoa quả đóng chai', 4, 11000, 0, 7500, 150, '1 Chai', 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=300&auto=format&fit=crop&q=60'),
  ('SP-107', '8936082031107', 'Nước cam Mandarine 250ml', 'Nước cam ép tươi nguyên chất', 4, 18000, 0, 11000, 110, '1 Chai', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=300&auto=format&fit=crop&q=60'),
  ('SP-108', '8936082031108', 'Bánh socola Hershey''s', 'Bánh quy sô cô la thơm giòn', 4, 68000, 0, 45000, 75, '1 Hộp', 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=300&auto=format&fit=crop&q=60'),
  ('SP-109', '8936082031109', 'Bánh que sô-cô-la Pepero', 'Bánh que phủ socola hạnh nhân', 4, 18000, 0, 12000, 90, '1 Hộp', 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?w=300&auto=format&fit=crop&q=60'),
  ('SP-110', '8936082031110', 'Socola Lindt Swiss Thụy Sĩ', 'Socola viên cao cấp Lindt Thụy Sĩ', 4, 199000, 0, 135000, 35, '1 Hộp', 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300&auto=format&fit=crop&q=60'),
  ('SP-111', '8936082031111', 'Bánh Socola Oreo hộp tròn', 'Bánh quy kẹp kem socola', 4, 25000, 0, 16000, 140, '1 Gói', 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=300&auto=format&fit=crop&q=60');

-- ========== SHIFTS (Quản Lý Ca Làm Việc) ==========
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  staff_name TEXT DEFAULT '',
  start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_time DATETIME,
  initial_cash REAL DEFAULT 0,
  expected_cash REAL DEFAULT 0,
  actual_cash REAL DEFAULT 0,
  difference REAL DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  note TEXT DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_start ON shifts(start_time);

-- ========== CASH FLOW (Sổ Quỹ Thu Chi Tiền Mặt) ==========
CREATE TABLE IF NOT EXISTS cash_flow (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  user_id INTEGER,
  staff_name TEXT DEFAULT '',
  shift_id INTEGER,
  note TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_type ON cash_flow(type);
CREATE INDEX IF NOT EXISTS idx_cash_flow_created ON cash_flow(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_flow_shift ON cash_flow(shift_id);

