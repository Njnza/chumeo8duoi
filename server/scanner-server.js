/* ============================================
   ShopPro Desktop - Scanner Server
   Hỗ trợ cả HTTP và HTTPS cho Phone Scanner
   + Token Auth cho chế độ ADD sản phẩm
   ============================================ */

const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const { EventEmitter } = require('events');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
let zxingReadBarcodes = null;
try {
  const zx = require('zxing-wasm/reader');
  zxingReadBarcodes = zx.readBarcodesFromImageFile;
} catch (e) {
  console.warn('[ScannerServer] zxing-wasm reader module note:', e.message);
}

class ScannerServer extends EventEmitter {
  constructor(port = 8765) {
    super();
    this.port = port;
    this.httpsPort = port + 1; // Mặc định 8766
    this.httpServer = null;
    this.httpsServer = null;
    this.wssHttp = null;
    this.wssHttps = null;
    this.clients = new Set();

    // Token system for ADD mode authentication
    this.addTokens = new Map(); // token -> { createdAt, expiresAt }
    this.TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 phút

    // Reference to database (set by main.js)
    this.db = null;

    // Rate limiting map: ip -> { count, resetAt }
    this.rateLimits = new Map();
  }

  setDatabase(db) {
    this.db = db;
  }

  _checkRateLimit(ip, maxPerMinute = 120) {
    const now = Date.now();
    const entry = this.rateLimits.get(ip) || { count: 0, resetAt: now + 60000 };
    if (now > entry.resetAt) {
      entry.count = 1;
      entry.resetAt = now + 60000;
    } else {
      entry.count++;
    }
    this.rateLimits.set(ip, entry);
    return entry.count <= maxPerMinute;
  }

  _handleHttp(req, res) {
    // CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    
    // Rate limit check for API endpoints (protect against brute-force / DDoS)
    if (parsedUrl.pathname.startsWith('/api/')) {
      const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
      if (!this._checkRateLimit(clientIp, 120)) {
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'Quá nhiều yêu cầu, vui lòng thử lại sau 1 phút' }));
      }
    }

    // API Check Price
    if (parsedUrl.pathname === '/api/check-price') {
      const code = parsedUrl.searchParams.get('code') || '';
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8'
      });
      if (!code || !this.db) {
        return res.end(JSON.stringify({ found: false, error: 'Thiếu mã hoặc DB chưa sẵn sàng' }));
      }
      const q = String(code).trim();
      let product = this.db.getProductByBarcode(q);
      if (!product) {
        const list = this.db.getProducts({ search: q, limit: 5 });
        if (list && list.length > 0) product = list[0];
      }
      if (product) {
        return res.end(JSON.stringify({
          found: true,
          product: {
            id: product.id,
            name: product.name,
            barcode: product.barcode || product.sku || '',
            price: product.price,
            sale_price: product.sale_price,
            cost_price: product.cost_price,
            category_name: product.category_name,
            stock: product.stock,
            image: product.image || '',
            unit: product.unit || 'cái',
            expiry_date: product.expiry_date || ''
          }
        }));
      } else {
        return res.end(JSON.stringify({ found: false, code: q }));
      }
    }

    // API Upload Product Photo directly over HTTP (resilient to mobile WebSocket disconnections)
    if (parsedUrl.pathname === '/api/upload-product-photo' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const saved = this.saveBase64Image(payload.image, 'product');
          this.emit('product-photo', {
            image: payload.image,
            filePath: saved ? saved.absolutePath : '',
            relativePath: saved ? saved.relativePath : '',
            url: saved ? saved.url : '',
            source: 'phone_http',
            timestamp: Date.now()
          });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            filename: saved ? saved.filename : '',
            relativePath: saved ? saved.relativePath : '',
            url: saved ? saved.url : ''
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // API Scan Barcode via HTTP (resilient fallback when phone camera tab pauses WebSocket)
    if (parsedUrl.pathname === '/api/scan-barcode' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const code = String(payload.code || '').trim();
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'Thiếu mã barcode' }));
          }

          console.log(`[Scanner HTTP] Barcode received: ${code}`);
          this.emit('barcode', {
            code,
            format: payload.format || 'unknown',
            source: 'phone_http',
            timestamp: Date.now()
          });

          // Look up product info and return directly in HTTP response
          let found = false;
          let productData = null;
          if (this.db) {
            const product = this.db.getProductByBarcode(code);
            if (product) {
              found = true;
              const rawImg = product.image || product.image_url || '';
              let normalizedImg = '';
              if (rawImg) {
                if (rawImg.startsWith('data:') || rawImg.startsWith('http')) {
                  normalizedImg = rawImg;
                } else {
                  const clean = rawImg.replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^(\.[\/\\])+/, '');
                  normalizedImg = clean.startsWith('/') ? clean : '/' + clean;
                }
              }
              productData = {
                id: product.id,
                name: product.name,
                barcode: product.barcode || product.sku || '',
                price: product.price,
                sale_price: product.sale_price,
                category_name: product.category_name,
                stock: product.stock,
                image: normalizedImg,
                image_url: normalizedImg,
                unit: product.unit
              };
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            code,
            found,
            product: productData
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // API Add Product via HTTP (resilient to WebSocket disconnects)
    if (parsedUrl.pathname === '/api/add-product' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const product = payload.product;
          if (!product || !product.barcode || !product.name) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'Thiếu thông tin sản phẩm' }));
          }

          // Save base64 image physically if provided
          const addImgVal = product.image_url || product.image;
          if (addImgVal && addImgVal.startsWith('data:')) {
            const saved = this.saveBase64Image(addImgVal, 'product');
            if (saved) {
              product.image_url = saved.relativePath;
              product.image = saved.relativePath;
            }
          } else if (addImgVal) {
            product.image_url = addImgVal;
            product.image = addImgVal;
          }

          this.emit('add-product', {
            product,
            source: 'phone_http',
            timestamp: Date.now()
          });

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            message: 'Đã thêm sản phẩm thành công!',
            product
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // API Batch Scan (SC-02 Continuous Batch)
    if (parsedUrl.pathname === '/api/batch-scan' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (Array.isArray(payload.items)) {
            for (const item of payload.items) {
              const qty = item.quantity || 1;
              for (let i = 0; i < qty; i++) {
                this.emit('barcode', {
                  code: item.code,
                  format: item.format || 'unknown',
                  source: 'phone_http_batch',
                  timestamp: Date.now()
                });
              }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, count: (payload.items || []).length }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // Serve static libraries (/libs/*)
    if (parsedUrl.pathname.startsWith('/libs/')) {
      const safePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(__dirname, safePath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = ext === '.wasm' ? 'application/wasm' : ext === '.json' ? 'application/json' : 'application/javascript; charset=utf-8';
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400'
        });
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    // Serve static uploaded photos (/uploads/*)
    const uploadsIdx = parsedUrl.pathname.indexOf('/uploads/');
    if (uploadsIdx !== -1) {
      const uploadSubPath = parsedUrl.pathname.substring(uploadsIdx);
      const safePath = path.normalize(uploadSubPath).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(__dirname, '..', safePath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400'
        });
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    // Serve separated CSS
    if (parsedUrl.pathname === '/scanner-client.css') {
      const cssPath = path.join(__dirname, 'scanner-client.css');
      if (fs.existsSync(cssPath)) {
        res.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        });
        return fs.createReadStream(cssPath).pipe(res);
      }
    }

    // Serve separated JS
    if (parsedUrl.pathname === '/scanner-client.js') {
      const jsPath = path.join(__dirname, 'scanner-client.js');
      if (fs.existsSync(jsPath)) {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        });
        return fs.createReadStream(jsPath).pipe(res);
      }
    }

    // Serve PWA Manifest (SC-01)
    if (parsedUrl.pathname === '/manifest.json') {
      const mPath = path.join(__dirname, 'manifest.json');
      if (fs.existsSync(mPath)) {
        res.writeHead(200, {
          'Content-Type': 'application/manifest+json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        });
        return fs.createReadStream(mPath).pipe(res);
      }
    }

    // Serve PWA Service Worker (SC-01)
    if (parsedUrl.pathname === '/sw.js') {
      const swPath = path.join(__dirname, 'sw.js');
      if (fs.existsSync(swPath)) {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        return fs.createReadStream(swPath).pipe(res);
      }
    }

    // Serve PWA App Icon (SC-01)
    if (parsedUrl.pathname === '/icon.svg') {
      const iconPath = path.join(__dirname, 'icon.svg');
      if (fs.existsSync(iconPath)) {
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400'
        });
        return fs.createReadStream(iconPath).pipe(res);
      }
    }

    this._serveHtml(req, res);
  }

  _serveHtml(req, res) {
    const clientPath = path.join(__dirname, 'scanner-client.html');
    if (fs.existsSync(clientPath)) {
      const content = fs.readFileSync(clientPath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Không tìm thấy trang scanner-client.html');
    }
  }

  _setupWsHandlers(wss) {
    wss.on('connection', (ws, req) => {
      this.clients.add(ws);
      const clientIp = req.socket.remoteAddress;
      console.log(`[Scanner] Phone connected from ${clientIp}`);

      this.emit('client-connected', { ip: clientIp, total: this.clients.size });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());

          switch (data.type) {
            case 'barcode':
              console.log(`[Scanner] Barcode received: ${data.code}`);
              this.emit('barcode', {
                code: data.code,
                format: data.format || 'unknown',
                source: 'phone',
                timestamp: Date.now()
              });

              // Send ack
              ws.send(JSON.stringify({ type: 'ack', code: data.code }));

              // Look up product info and send back to phone
              this._lookupAndSendProduct(ws, data.code);
              break;

            case 'batch_barcodes':
              console.log(`[Scanner] Batch barcodes received: ${data.items ? data.items.length : 0} items`);
              if (Array.isArray(data.items)) {
                for (const item of data.items) {
                  const qty = item.quantity || 1;
                  for (let i = 0; i < qty; i++) {
                    this.emit('barcode', {
                      code: item.code,
                      format: item.format || 'unknown',
                      source: 'phone_batch',
                      timestamp: Date.now()
                    });
                  }
                }
                ws.send(JSON.stringify({ type: 'batch_ack', success: true, count: data.items.length }));
              }
              break;

            case 'check_price':
              console.log(`[Scanner] Price check requested: ${data.code}`);
              this._lookupAndSendPriceCheck(ws, data.code);
              break;

            case 'auth_add':
              // Phone wants to enter ADD mode — verify token
              this._handleAuthAdd(ws, data.token);
              break;

            case 'add_product':
              // Phone submitting a new product (in ADD mode)
              const wsAddImgVal = data.product && (data.product.image_url || data.product.image);
              if (wsAddImgVal && wsAddImgVal.startsWith('data:')) {
                const saved = this.saveBase64Image(wsAddImgVal, 'product');
                if (saved) {
                  data.product.image_url = saved.relativePath;
                  data.product.image = saved.relativePath;
                }
              } else if (wsAddImgVal) {
                data.product.image_url = wsAddImgVal;
                data.product.image = wsAddImgVal;
              }
              this.emit('add-product', {
                product: data.product,
                source: 'phone',
                timestamp: Date.now()
              });
              ws.send(JSON.stringify({ type: 'add_product_ack', success: true }));
              break;

            case 'decode_frame': {
              // Server-assisted high-speed barcode decoding via Desktop CPU
              if (data.image && typeof data.image === 'string' && data.image.startsWith('data:') && zxingReadBarcodes) {
                try {
                  const base64Data = data.image.replace(/^data:image\/\w+;base64,/, '');
                  const buffer = Buffer.from(base64Data, 'base64');
                  const blob = new Blob([buffer]);
                  
                  // Pass 1: Try LocalAverage with tryHarder
                  zxingReadBarcodes(blob, {
                    formats: ['EAN-13', 'EAN-8', 'Code 128', 'Code 39', 'UPC-A', 'UPC-E', 'QR Code', 'Data Matrix', 'ITF'],
                    tryHarder: true,
                    tryRotate: true,
                    tryInvert: true,
                    binarizer: 'LocalAverage',
                    maxNumberOfSymbols: 1
                  }).then(results => {
                    if (results && results.length > 0 && results[0].text) {
                      const code = String(results[0].text).trim();
                      ws.send(JSON.stringify({
                        type: 'barcode_detected',
                        code,
                        source: 'desktop_ai',
                        mode: data.mode || 'scan'
                      }));
                    } else {
                      // Pass 2: Fallback to GlobalHistogram
                      zxingReadBarcodes(blob, {
                        tryHarder: false,
                        tryRotate: true,
                        binarizer: 'GlobalHistogram',
                        maxNumberOfSymbols: 1
                      }).then(fbResults => {
                        if (fbResults && fbResults.length > 0 && fbResults[0].text) {
                          const code = String(fbResults[0].text).trim();
                          ws.send(JSON.stringify({
                            type: 'barcode_detected',
                            code,
                            source: 'desktop_ai',
                            mode: data.mode || 'scan'
                          }));
                        }
                      }).catch(() => {});
                    }
                  }).catch(() => {});
                } catch (_) {}
              }
              break;
            }

            case 'send_product_photo': {
              // Phone sends actual product camera photo to Desktop app
              console.log('[Scanner] Product photo received from phone');
              const saved = this.saveBase64Image(data.image, 'product');
              this.emit('product-photo', {
                image: data.image,
                filePath: saved ? saved.absolutePath : '',
                relativePath: saved ? saved.relativePath : '',
                url: saved ? saved.url : '',
                source: 'phone',
                timestamp: Date.now()
              });
              ws.send(JSON.stringify({
                type: 'product_photo_ack',
                success: true,
                filename: saved ? saved.filename : '',
                relativePath: saved ? saved.relativePath : '',
                url: saved ? saved.url : ''
              }));
              break;
            }

            default:
              console.log(`[Scanner] Unknown message type: ${data.type}`);
          }
        } catch (e) {
          console.error('[Scanner] Parse error:', e.message);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[Scanner] Phone disconnected');
        this.emit('client-disconnected');
      });

      ws.on('error', (err) => {
        console.error('[Scanner] WebSocket error:', err.message);
        this.clients.delete(ws);
      });

      ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to ShopPro Scanner',
        httpsPort: this.httpsPort,
        httpPort: this.port
      }));
    });
  }

  /**
   * Look up product by barcode in DB and send info to phone
   */
  async _lookupAndSendProduct(ws, barcode) {
    try {
      if (this.db) {
        const product = this.db.getProductByBarcode(barcode);
        if (product) {
          const rawImg = product.image || product.image_url || '';
          let normalizedImg = '';
          if (rawImg) {
            if (rawImg.startsWith('data:') || rawImg.startsWith('http')) {
              normalizedImg = rawImg;
            } else {
              const clean = rawImg.replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^(\.[\/\\])+/, '');
              normalizedImg = clean.startsWith('/') ? clean : '/' + clean;
            }
          }

          ws.send(JSON.stringify({
            type: 'product_info',
            found: true,
            product: {
              id: product.id,
              name: product.name,
              barcode: product.barcode,
              price: product.price,
              sale_price: product.sale_price,
              category_name: product.category_name,
              stock: product.stock,
              image: normalizedImg,
              image_url: normalizedImg,
              unit: product.unit
            }
          }));
          return;
        }
      }
      // Product not found
      ws.send(JSON.stringify({
        type: 'product_info',
        found: false,
        barcode: barcode
      }));
    } catch (e) {
      console.error('[Scanner] Product lookup error:', e.message);
      ws.send(JSON.stringify({
        type: 'product_info',
        found: false,
        barcode: barcode,
        error: e.message
      }));
    }
  }

  /**
   * Look up product info for price checker mode (does NOT add to POS cart)
   */
  async _lookupAndSendPriceCheck(ws, query) {
    try {
      if (this.db && query) {
        const q = String(query).trim();
        let product = this.db.getProductByBarcode(q);
        if (!product) {
          const list = this.db.getProducts({ search: q, limit: 5 });
          if (list && list.length > 0) product = list[0];
        }

        if (product) {
          const rawImg = product.image || product.image_url || '';
          let normalizedImg = '';
          if (rawImg) {
            if (rawImg.startsWith('data:') || rawImg.startsWith('http')) {
              normalizedImg = rawImg;
            } else {
              const clean = rawImg.replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^(\.[\/\\])+/, '');
              normalizedImg = clean.startsWith('/') ? clean : '/' + clean;
            }
          }

          ws.send(JSON.stringify({
            type: 'price_check_result',
            found: true,
            product: {
              id: product.id,
              name: product.name,
              barcode: product.barcode || product.sku || '',
              price: product.price,
              sale_price: product.sale_price,
              cost_price: product.cost_price,
              category_name: product.category_name,
              stock: product.stock,
              image: normalizedImg,
              image_url: normalizedImg,
              unit: product.unit || 'cái',
              expiry_date: product.expiry_date || ''
            }
          }));
          return;
        }
      }

      ws.send(JSON.stringify({
        type: 'price_check_result',
        found: false,
        query: query
      }));
    } catch (e) {
      console.error('[Scanner] Price check error:', e.message);
      ws.send(JSON.stringify({
        type: 'price_check_result',
        found: false,
        query: query,
        error: e.message
      }));
    }
  }

  /**
   * Handle ADD mode authentication
   */
  _handleAuthAdd(ws, token) {
    // Clean expired tokens
    this._cleanExpiredTokens();

    const tokenData = this.addTokens.get(token);
    if (tokenData && Date.now() < tokenData.expiresAt) {
      // Valid token — grant ADD mode
      ws.send(JSON.stringify({
        type: 'auth_result',
        success: true,
        message: 'Xác thực thành công! Bạn có thể thêm sản phẩm.'
      }));
      console.log(`[Scanner] ADD mode granted via token`);

      // Remove used token (one-time use)
      this.addTokens.delete(token);
    } else {
      ws.send(JSON.stringify({
        type: 'auth_result',
        success: false,
        message: 'Mã xác thực không hợp lệ hoặc đã hết hạn. Vui lòng tạo mã mới từ PC.'
      }));
      console.log(`[Scanner] ADD mode denied — invalid/expired token`);
    }
  }

  /**
   * Generate a new ADD mode token
   */
  generateAddToken() {
    this._cleanExpiredTokens();

    const token = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    this.addTokens.set(token, {
      createdAt: now,
      expiresAt: now + this.TOKEN_EXPIRY_MS
    });

    console.log(`[Scanner] ADD token generated (expires in 5 min)`);
    return token;
  }

  /**
   * Clean up expired tokens
   */
  _cleanExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of this.addTokens.entries()) {
      if (now >= data.expiresAt) {
        this.addTokens.delete(token);
      }
    }
  }

  /**
   * Save base64 image string to uploads/products folder on disk
   */
  saveBase64Image(base64Data, prefix = 'product') {
    try {
      if (!base64Data || typeof base64Data !== 'string') return null;
      let ext = 'jpg';
      let buffer;
      const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (matches) {
        ext = matches[1].toLowerCase() === 'jpeg' ? 'jpg' : matches[1].toLowerCase();
        buffer = Buffer.from(matches[2], 'base64');
      } else if (base64Data.startsWith('data:')) {
        const commaIdx = base64Data.indexOf(',');
        buffer = Buffer.from(base64Data.substring(commaIdx + 1), 'base64');
      } else {
        buffer = Buffer.from(base64Data, 'base64');
      }

      const uploadsDir = path.join(__dirname, '..', 'uploads', 'products');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const filename = `${prefix}_${timestamp}_${randomSuffix}.${ext}`;
      const filePath = path.join(uploadsDir, filename);

      fs.writeFileSync(filePath, buffer);
      console.log(`[Scanner] Đã lưu ảnh sản phẩm vào thư mục: ${filePath} (${buffer.length} bytes)`);

      return {
        filename,
        absolutePath: filePath,
        relativePath: `uploads/products/${filename}`,
        url: `/uploads/products/${filename}`
      };
    } catch (err) {
      console.error('[Scanner] Lỗi lưu ảnh xuống đĩa:', err.message);
      return null;
    }
  }

  _ensureCertificate(certDir) {
    const keyPath = path.join(certDir, 'key.pem');
    const certPath = path.join(certDir, 'cert.pem');
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { keyPath, certPath };
    }
    try {
      if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
      const { execSync } = require('child_process');
      const ip = this.getLocalIP();
      execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/CN=${ip}" -addext "subjectAltName=IP:${ip},DNS:localhost"`, { stdio: 'ignore' });
      console.log(`[Scanner] Generated per-machine SSL certificate for IP ${ip}`);
    } catch (e) {
      console.warn('[Scanner] Per-machine cert notice:', e.message);
    }
    return { keyPath, certPath };
  }

  start() {
    try {
      // 1. Khởi động HTTP Server (port 8765)
      this.httpServer = http.createServer((req, res) => this._handleHttp(req, res));
      this.wssHttp = new WebSocketServer({ server: this.httpServer });
      this._setupWsHandlers(this.wssHttp);

      this.httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Scanner] Port ${this.port} đã được sử dụng.`);
        } else {
          console.error('[Scanner] HTTP server error:', err.message);
        }
      });

      this.httpServer.listen(this.port, '0.0.0.0', () => {
        console.log(`[Scanner] HTTP server running at http://${this.getLocalIP()}:${this.port}`);
      });

      // 2. Khởi động HTTPS Server nếu có chứng chỉ (port 8766)
      const certDir = path.join(__dirname, '..', 'certs');
      const { keyPath, certPath } = this._ensureCertificate(certDir);

      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        const sslOptions = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath)
        };

        this.httpsServer = https.createServer(sslOptions, (req, res) => this._handleHttp(req, res));
        this.wssHttps = new WebSocketServer({ server: this.httpsServer });
        this._setupWsHandlers(this.wssHttps);

        this.httpsServer.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[Scanner] HTTPS port ${this.httpsPort} đã được sử dụng.`);
          } else {
            console.error('[Scanner] HTTPS server error:', err.message);
          }
        });

        this.httpsServer.listen(this.httpsPort, '0.0.0.0', () => {
          console.log(`[Scanner] HTTPS server running at https://${this.getLocalIP()}:${this.httpsPort}`);
        });
      }
    } catch (err) {
      console.error('[Scanner] Failed to start:', err.message);
    }
  }

  stop() {
    for (const client of this.clients) {
      try { client.close(); } catch (e) {}
    }
    this.clients.clear();

    if (this.wssHttp) { this.wssHttp.close(); this.wssHttp = null; }
    if (this.wssHttps) { this.wssHttps.close(); this.wssHttps = null; }
    if (this.httpServer) { this.httpServer.close(); this.httpServer = null; }
    if (this.httpsServer) { this.httpsServer.close(); this.httpsServer = null; }

    console.log('[Scanner] Server stopped');
  }

  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  getInfo() {
    const ip = this.getLocalIP();
    return {
      port: this.port,
      httpsPort: this.httpsPort,
      ip: ip,
      url: `http://${ip}:${this.port}`,
      httpsUrl: this.httpsServer ? `https://${ip}:${this.httpsPort}` : null,
      connectedClients: this.clients.size,
      running: !!this.httpServer
    };
  }
}

module.exports = ScannerServer;
