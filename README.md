# ShopPro Desktop — Phần Mềm Bán Hàng POS 🛒

Ứng dụng quản lý bán hàng chuyên nghiệp cho Windows, xây dựng trên Electron + SQLite.

## Tính năng chính

- 🏪 **POS Bán Hàng & VietQR** — Quầy thu ngân đa hóa đơn, mã VietQR động tự sinh kèm số tiền chính xác, chiết khấu hạng thành viên tự động
- 💼 **Quản Lý Ca Làm Việc (Shifts)** — Mở ca, nhập tiền đầu ca, theo dõi doanh thu tiền mặt, chốt ca và tự động tính chênh lệch thừa/thiếu
- 💵 **Sổ Quỹ Thu Chi (Cash Flow)** — Ghi nhận các khoản thu/chi tiền mặt ngoài bán hàng (mặt bằng, điện nước, nhập lẻ...)
- 🤖 **Trợ Lý AI & Phân Tích ABC** — Tự động phân loại hàng hóa A/B/C theo định luật Pareto 80/20, dự báo ngày hết hàng, gợi ý xả hàng tồn đọng
- 🌙 **Chế Độ Sáng / Tối (Light & Dark Mode)** — Chuyển đổi nhanh 1 chạm trên thanh tiêu đề, bảo vệ mắt ca đêm
- 📱 **Scanner Từ Điện Thoại** — Quét barcode WiFi/LAN, chụp ảnh hàng hóa từ điện thoại nạp ngay vào Desktop
- 📦 **Quản Lý Sản Phẩm & Kho** — Quản lý giá vốn, hạn sử dụng, cảnh báo sắp hết hàng, import/export Excel tốc độ cao
- 📋 **Đơn Hàng & Đổi Trả** — Đổi trả từng phần hoặc toàn bộ, hoàn tồn kho tự động, in phiếu nhiệt
- 👥 **Khách Hàng & Loyalty** — 4 hạng thành viên Đồng / Bạc / Vàng / Kim Cương, tích điểm tự động
- 📊 **Báo Cáo & Lợi Nhuận Gộp** — Báo cáo doanh thu thuần, COGS giá vốn, khung giờ cao điểm, xuất file Excel/PDF
- 🔐 **Bảo Mật Bằng Mã PIN & Scrypt** — Phân quyền Chủ Shop & Nhân viên, khóa màn hình bảo vệ dữ liệu

## Cài đặt & Chạy

```bash
# Cài dependencies
npm install

# Chạy ứng dụng
npm start

# Chạy chế độ dev
npm run dev

# Chạy bộ 31 unit tests
npm test
```

## Kiến trúc dự án

```
├── main.js              # Electron main process & IPC handlers
├── preload.js           # Context isolation secure bridge
├── database/
│   ├── db.js            # Database layer (better-sqlite3 Native + WAL)
│   └── schema.sql       # Database schema & migrations
├── server/
│   ├── scanner-server.js   # WebSocket + HTTPS server (per-machine cert)
│   ├── scanner-client.*    # Mobile scanner PWA / web app
│   └── libs/               # Barcode libraries (html5-qrcode, quagga, zxing)
├── services/
│   ├── logger.js        # File-based logging system
│   ├── updater.js       # Auto-update manager
│   └── plugin-manager.js # Plugin ecosystem
├── src/
│   ├── index.html       # Single Page Application Shell
│   ├── css/app.css      # Core styles & Light/Dark theme variables
│   └── js/              # POS, Products, Orders, Customers, Reports, Settings
├── plugins/             # External hardware & scale plugins
└── uploads/             # Product images
```

## Database

SQLite local (better-sqlite3 native binding + WAL mode) — hiệu năng vượt trội gấp 5-10 lần, dữ liệu lưu an toàn tại `%APPDATA%/shoppro-desktop/shoppro.db`.

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Desktop Framework | Electron 33.x |
| Database Engine | better-sqlite3 (Native WAL mode) |
| Real-time Comm | WebSocket Server (ws) |
| Phone Scanner | html5-qrcode + Quagga2 + BarcodeDetector |
| Barcode Engine | zxing-wasm multi-format |
| Biểu đồ & Analytics | Chart.js 4.x + Thuật toán ABC Pareto |
| Excel Processing | SheetJS (xlsx) |
| QR Code & VietQR | qrcode + chuẩn NAPAS/EMVCo |

## License

MIT
