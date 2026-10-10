// ==================== STATE ====================
    let ws = null;
    let html5QrCode = null;
    let authQrCode = null;
    let html5QrCodeAdd = null;
    let isLiveScanning = false;
    let isAddLiveScanning = false;
    let isAddModeUnlocked = false;
    let pendingAddBarcode = '';
    const scanHistory = [];
    let currentPage = 'scan';

    // SC-02: Continuous Batch Scan state
    let isBatchMode = false;
    let batchItems = [];

    // All supported barcode formats (EAN-13, Code 128, QR, UPC, etc.) - Safe list without extension formats
    const ALL_BARCODE_FORMATS = (typeof Html5QrcodeSupportedFormats !== 'undefined') ? [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODABAR,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.DATA_MATRIX
    ] : undefined;

    // Helper to safely load a File into an HTMLImageElement using fast zero-copy ObjectURL
    function loadImageFromFile(file) {
      return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('Chưa chọn file ảnh'));
        let objUrl = '';
        try {
          objUrl = URL.createObjectURL(file);
        } catch (_) {}

        const img = new Image();
        img.onload = () => {
          if (objUrl) {
            try { URL.revokeObjectURL(objUrl); } catch (_) {}
          }
          resolve(img);
        };
        img.onerror = () => {
          if (objUrl) {
            try { URL.revokeObjectURL(objUrl); } catch (_) {}
          }
          // Fallback to FileReader if objectURL fails
          const reader = new FileReader();
          reader.onload = (e) => {
            const fallbackImg = new Image();
            fallbackImg.onload = () => resolve(fallbackImg);
            fallbackImg.onerror = () => reject(new Error('Không thể nạp dữ liệu ảnh'));
            fallbackImg.src = e.target.result;
          };
          reader.onerror = () => reject(new Error('Lỗi khi đọc file ảnh'));
          reader.readAsDataURL(file);
        };

        if (objUrl) {
          img.src = objUrl;
        } else {
          const reader = new FileReader();
          reader.onload = (e) => { img.src = e.target.result; };
          reader.onerror = () => reject(new Error('Lỗi nạp file'));
          reader.readAsDataURL(file);
        }
      });
    }

    // High-performance, robust barcode recognition pipeline with multi-barcode preprocessing & detection:
    // Step 1: Pre-detect barcode & QR regions using native BarcodeDetector.
    //         If more than 1 distinct barcode/QR is detected in frame -> abort immediately and ask user to re-scan.
    // Step 2: If exactly 1 barcode detected -> return it.
    // Step 3: ZXing multi-region candidate scanning with rotation and contrast enhancement.
    //         If multiple distinct candidate barcodes are decoded -> abort and ask user to re-scan.
    // Step 4: Html5Qrcode.scanFile isolated fallback.
    // Strict 5-second total timeout ensures UI NEVER freezes or hangs.
    // Ultra-accurate, multi-engine barcode recognition pipeline:
    // Engine 1: ZXing-C++ WebAssembly (zxing-wasm) - modern C++ core with local binarizer
    // Engine 2: Quagga2 - specialized 1D barcode edge locator
    // Engine 3: Native BarcodeDetector (Chrome/Edge Android GPU/ML Kit)
    // Engine 4: ZXing-JS / Html5Qrcode fallback
    async function robustDecodeBarcode(file, targetContainerId = null) {
      if (!file) throw new Error('Chưa chọn ảnh');

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Thời gian nhận diện quá lâu. Vui lòng chụp gần và rõ nét hơn!')), 6000);
      });

      const decodePromise = (async () => {
        // ==================== BƯỚC 1: ZXING-C++ WEB ASSEMBLY (Gold Standard từ GitHub) ====================
        if (typeof ZXingWASM !== 'undefined' && ZXingWASM.readBarcodesFromImageFile) {
          try {
            const wasmResults = await ZXingWASM.readBarcodesFromImageFile(file, {
              formats: ['EAN-13', 'EAN-8', 'Code 128', 'Code 39', 'Code 93', 'UPC-A', 'UPC-E', 'QR Code', 'Data Matrix', 'ITF'],
              tryHarder: true,
              tryRotate: true,
              tryInvert: true,
              tryDownscale: false,
              binarizer: 'LocalAverage'
            });
            if (wasmResults && wasmResults.length > 0) {
              const uniqueCodes = [...new Set(wasmResults.map(r => String(r.text || '').trim()).filter(Boolean))];
              if (uniqueCodes.length > 1) {
                console.warn('[ZXing-C++ WASM] Multiple distinct barcodes detected:', uniqueCodes);
                throw new Error(`⚠️ Phát hiện ${uniqueCodes.length} mã vạch khác nhau trong ảnh (${uniqueCodes.join(', ')}). Vui lòng đưa camera lại gần để chỉ chụp 1 mã cần quét!`);
              }
              if (uniqueCodes.length === 1) {
                console.log('[ZXing-C++ WASM] Successfully decoded single barcode:', uniqueCodes[0]);
                return uniqueCodes[0];
              }
            }
          } catch (e) {
            if (e.message && e.message.startsWith('⚠️ Phát hiện')) throw e;
            console.warn('[ZXing-C++ WASM] file decode note:', e.message);
          }
        }

        // ==================== BƯỚC 2: QUAGGA2 1D SKELETON LOCATOR ====================
        if (typeof Quagga !== 'undefined') {
          try {
            let objUrl = '';
            try { objUrl = URL.createObjectURL(file); } catch (_) {}
            if (objUrl) {
              const qCode = await new Promise((resolve) => {
                Quagga.decodeSingle({
                  src: objUrl,
                  numOfWorkers: 0,
                  inputStream: { size: 1200 },
                  decoder: { readers: ['ean_reader', 'code_128_reader', 'code_39_reader', 'upc_reader'] },
                  locate: true
                }, (res) => {
                  try { URL.revokeObjectURL(objUrl); } catch (_) {}
                  if (res && res.codeResult && res.codeResult.code) {
                    resolve(String(res.codeResult.code).trim());
                  } else {
                    resolve(null);
                  }
                });
              });
              if (qCode) {
                console.log('[Quagga2] Successfully decoded 1D barcode:', qCode);
                return qCode;
              }
            }
          } catch (qErr) {
            console.warn('[Quagga2] decode note:', qErr);
          }
        }

        // ==================== BƯỚC 3: TIỀN XỬ LÝ CANVAS & NATIVE BARCODE DETECTOR ====================
        const img = await loadImageFromFile(file);
        const w = img.naturalWidth || img.width || 800;
        const h = img.naturalHeight || img.height || 600;
        const maxDim = 1200;
        let sw = w, sh = h;
        if (w > maxDim || h > maxDim) {
          if (w > h) { sh = Math.round((h * maxDim) / w); sw = maxDim; }
          else { sw = Math.round((w * maxDim) / h); sh = maxDim; }
        }

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, sw, sh);

        // 3a. Native BarcodeDetector
        if ('BarcodeDetector' in window) {
          try {
            const formats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'upc_a', 'upc_e', 'qr_code', 'itf', 'data_matrix'];
            let detector;
            try { detector = new BarcodeDetector({ formats }); } catch (_) { detector = new BarcodeDetector(); }

            const detected = await detector.detect(canvas);
            if (detected && detected.length > 0) {
              const uniqueCodes = [...new Set(detected.map(d => String(d.rawValue || '').trim()).filter(Boolean))];
              if (uniqueCodes.length > 1) {
                throw new Error(`⚠️ Phát hiện ${uniqueCodes.length} mã vạch khác nhau trong ảnh (${uniqueCodes.join(', ')}). Vui lòng đưa camera lại gần để chỉ chụp 1 mã cần quét!`);
              }
              if (uniqueCodes.length === 1) {
                console.log('[Native BarcodeDetector] Successfully decoded:', uniqueCodes[0]);
                return uniqueCodes[0];
              }
            }
          } catch (e) {
            if (e.message && e.message.startsWith('⚠️ Phát hiện')) throw e;
          }
        }

        // 3b. ZXing-C++ WASM on High-Res Slices & Rotations
        if (typeof ZXingWASM !== 'undefined' && ZXingWASM.readBarcodesFromImageData) {
          try {
            // Rotated 90 degrees
            const rotCanvas = document.createElement('canvas');
            rotCanvas.width = sh;
            rotCanvas.height = sw;
            const rotCtx = rotCanvas.getContext('2d');
            rotCtx.translate(sh / 2, sw / 2);
            rotCtx.rotate((90 * Math.PI) / 180);
            rotCtx.drawImage(canvas, -sw / 2, -sh / 2);
            const rotData = rotCtx.getImageData(0, 0, sh, sw);
            const rotHits = await ZXingWASM.readBarcodesFromImageData(rotData, { tryHarder: true });
            if (rotHits && rotHits.length > 0 && rotHits[0].text) {
              return String(rotHits[0].text).trim();
            }

            // Center Zoom Crop (75% width, 60% height)
            const cw = Math.round(sw * 0.75);
            const ch = Math.round(sh * 0.60);
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cw;
            cropCanvas.height = ch;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(canvas, Math.round(sw * 0.125), Math.round(sh * 0.20), cw, ch, 0, 0, cw, ch);
            const cropData = cropCtx.getImageData(0, 0, cw, ch);
            const cropHits = await ZXingWASM.readBarcodesFromImageData(cropData, { tryHarder: true });
            if (cropHits && cropHits.length > 0 && cropHits[0].text) {
              return String(cropHits[0].text).trim();
            }
          } catch (_) {}
        }

        // ==================== BƯỚC 4: FALLBACK QUA HTML5QRCODE ====================
        if (typeof Html5Qrcode !== 'undefined') {
          let isolatedDiv = document.getElementById('isolatedBarcodeScanner');
          if (!isolatedDiv) {
            isolatedDiv = document.createElement('div');
            isolatedDiv.id = 'isolatedBarcodeScanner';
            isolatedDiv.style.display = 'none';
            document.body.appendChild(isolatedDiv);
          }
          let tempScanner = null;
          try {
            tempScanner = new Html5Qrcode('isolatedBarcodeScanner', { verbose: false });
            const res = await tempScanner.scanFile(file, false);
            if (res) return String(res).trim();
          } catch (_) {}
          finally {
            if (tempScanner) { try { await tempScanner.clear(); } catch (_) {} }
          }
        }

        throw new Error('Không nhận diện được mã vạch trong ảnh. Vui lòng đưa camera lại gần tem mã vạch (cách 10-15cm) và chụp rõ nét hơn!');
      })();

      return Promise.race([decodePromise, timeoutPromise]);
    }

    // ==================== WEBSOCKET ====================
    const isHttps = window.location.protocol === 'https:';
    const wsProto = isHttps ? 'wss:' : 'ws:';
    const params = new URLSearchParams(window.location.search);
    const wsHost = params.get('host') || window.location.hostname || 'localhost';
    const wsPort = params.get('port') || window.location.port || (isHttps ? '8766' : '8765');
    const wsUrl = `${wsProto}//${wsHost}:${wsPort}`;

    // iOS notice
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    if (!hasMediaDevices || !window.isSecureContext) {
      const notice = document.getElementById('httpsNotice');
      const httpsLink = document.getElementById('httpsLink');
      const nextPort = window.location.port === '8765' ? '8766' : '8766';
      httpsLink.href = `https://${window.location.hostname}:${nextPort}`;
      httpsLink.textContent = `https://${window.location.hostname}:${nextPort}`;
      notice.style.display = 'block';
    }

    let isConnectingWs = false;

    function connectWS() {
      if (isConnectingWs) return;
      if (ws && ws.readyState === WebSocket.OPEN) return;

      const statusEl = document.getElementById('wsStatus');
      statusEl.className = 'status-bar connecting';
      statusEl.innerHTML = '<span class="status-dot"></span><span>Đang kết nối với Shop Desktop...</span>';
      isConnectingWs = true;

      try {
        if (ws) {
          try { ws.close(); } catch (_) {}
        }
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          isConnectingWs = false;
          statusEl.className = 'status-bar connected';
          statusEl.innerHTML = '<span class="status-dot"></span><span>Đã kết nối với Shop Desktop</span>';
        };

        ws.onclose = () => {
          isConnectingWs = false;
          statusEl.className = 'status-bar disconnected';
          statusEl.innerHTML = '<span class="status-dot"></span><span>Mất kết nối — đang thử lại...</span>';
          setTimeout(connectWS, 2500);
        };

        ws.onerror = () => {
          isConnectingWs = false;
          statusEl.className = 'status-bar disconnected';
          statusEl.innerHTML = '<span class="status-dot"></span><span>Không thể kết nối</span>';
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
          } catch (e) {}
        };
      } catch (err) {
        isConnectingWs = false;
        console.error('WS error:', err);
      }
    }

    // Auto-reconnect when user returns to browser from camera or locks/unlocks phone
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!ws || ws.readyState !== WebSocket.OPEN) connectWS();
      }
    });
    window.addEventListener('focus', () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) connectWS();
    });

    function ensureWsConnected(timeoutMs = 2500) {
      return new Promise((resolve) => {
        if (ws && ws.readyState === WebSocket.OPEN) return resolve(true);
        connectWS();
        const start = Date.now();
        const interval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            clearInterval(interval);
            return resolve(true);
          }
          if (Date.now() - start > timeoutMs) {
            clearInterval(interval);
            return resolve(false);
          }
        }, 120);
      });
    }

    function handleServerMessage(data) {
      switch (data.type) {
        case 'ack':
          console.log('Acked:', data.code);
          break;
        case 'product_info':
          showProductInfo(data);
          break;
        case 'price_check_result':
          displayPriceCheckResult(data);
          break;
        case 'auth_result':
          handleAuthResult(data);
          break;
        case 'add_product_ack':
          if (data.success) {
            showNotification('✅ Sản phẩm đã được thêm thành công!', 'success');
            document.getElementById('addProductForm').reset();
            const previewBox = document.getElementById('phoneImgPreviewBox');
            if (previewBox) previewBox.innerHTML = '<span style="font-size:24px;">📷</span>';
            const btnSend = document.getElementById('btnSendAddPhotoToDesktop');
            if (btnSend) btnSend.style.display = 'none';
          }
          break;
        case 'product_photo_ack':
          if (data.success) {
            if (data.relativePath) {
              const imgUrlInput = document.getElementById('addImageUrl');
              if (imgUrlInput) imgUrlInput.value = data.relativePath;
            }
            const btnSend = document.getElementById('btnSendAddPhotoToDesktop');
            if (btnSend) {
              btnSend.textContent = '✅ Đã gửi';
              setTimeout(() => {
                btnSend.textContent = '📤 Gửi Desktop';
                btnSend.disabled = false;
              }, 2500);
            }
            showNotification('✅ Đã lưu ảnh: ' + (data.filename || 'Thành công'), 'success');
          }
          break;
        case 'barcode_detected':
          if (data.code) {
            const wrapId = currentPage === 'add' ? 'readerAddWrap' : currentPage === 'check' ? 'readerCheckWrap' : 'readerWrap';
            handleLiveScanSuccess(data.code, data.mode || currentPage, wrapId);
          }
          break;
        case 'welcome':
          console.log('Connected:', data.message);
          break;
      }
    }

    // ==================== PAGE SWITCHING ====================
    function switchPage(page) {
      if (isLiveScanning) stopLiveScan();
      if (isCheckLiveScanning) stopCheckLiveScan();
      if (isAddLiveScanning && typeof stopAddLiveScan === 'function') stopAddLiveScan();
      currentPage = page;
      
      // Hide all pages
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

      // Show selected page
      const pageEl = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
      if (pageEl) pageEl.classList.add('active');

      const tabEl = document.getElementById('tab' + page.charAt(0).toUpperCase() + page.slice(1));
      if (tabEl) tabEl.classList.add('active');
    }

    // ==================== AUDIO & VIBRATION (SC-02) ====================
    function playTone(type = 'success') {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        if (type === 'success') {
          // Clear crisp high chime (880Hz / A5)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
          osc.start();
          osc.stop(ctx.currentTime + 0.14);
        } else if (type === 'duplicate') {
          // Double upbeat chime (660Hz -> 880Hz) for duplicate scan increment
          const now = ctx.currentTime;
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.frequency.setValueAtTime(660, now);
          gain1.gain.setValueAtTime(0.2, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc1.start(now);
          osc1.stop(now + 0.08);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.setValueAtTime(988, now + 0.09);
          gain2.gain.setValueAtTime(0.25, now + 0.09);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
          osc2.start(now + 0.09);
          osc2.stop(now + 0.19);
        } else if (type === 'error') {
          // Low warning buzz (220Hz -> 160Hz)
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(160, now + 0.22);
          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.22);
        }
      } catch (e) {}
    }

    function playBeep() {
      playTone('success');
    }

    // ==================== SEND BARCODE ====================
    async function sendBarcode(code, format = 'BARCODE') {
      if (!code) return;

      playBeep();
      if (navigator.vibrate) navigator.vibrate(120);

      // Show result immediately on phone
      document.getElementById('resultBox').style.display = 'block';
      document.getElementById('resultCode').textContent = code;
      document.getElementById('resultTime').textContent = new Date().toLocaleTimeString('vi-VN');

      // Add to history
      scanHistory.unshift({ code, time: new Date().toLocaleTimeString('vi-VN'), productName: null });
      renderHistory();

      let wsSent = false;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'barcode', code, format }));
          wsSent = true;
        } catch (e) {
          console.warn('WS send note:', e);
        }
      }

      // If WS is not connected or fails, send immediately via HTTP POST fallback
      if (!wsSent) {
        try {
          const res = await fetch('/api/scan-barcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, format })
          });
          const data = await res.json();
          if (data && data.success) {
            showProductInfo(data);
          }
        } catch (err) {
          console.warn('HTTP barcode send error:', err);
        }
        connectWS();
      }
    }

    // ==================== PRODUCT INFO DISPLAY ====================
    function showProductInfo(data) {
      const container = document.getElementById('productInfoCard');

      if (data.found && data.product) {
        const p = data.product;
        const priceFormatted = formatPrice(p.price);
        const salePriceFormatted = p.sale_price ? formatPrice(p.sale_price) : null;
        const hasDiscount = p.sale_price && p.sale_price > 0 && p.sale_price < p.price;

        // Update history with product name
        if (scanHistory.length > 0) {
          scanHistory[0].productName = p.name;
          renderHistory();
        }

        const pImg = formatClientImageUrl(p.image_url || p.image);
        container.innerHTML = `
          <div class="product-card">
            <div class="product-card-inner">
              <div class="product-image">
                ${pImg ? `<img src="${escapeHtml(pImg)}" alt="${escapeHtml(p.name)}" onerror="this.parentElement.innerHTML='📦'">` : '📦'}
              </div>
              <div class="product-details">
                ${p.category_name ? `<div class="product-category">${escapeHtml(p.category_name)}</div>` : ''}
                <div class="product-name">${escapeHtml(p.name)}</div>
                <div class="product-price">
                  ${hasDiscount ? formatPrice(p.sale_price) : priceFormatted}
                  ${hasDiscount ? `<span class="original">${priceFormatted}</span>` : ''}
                </div>
                <div class="product-stock">📦 Tồn kho: ${p.stock || 0} ${p.unit || ''}</div>
              </div>
            </div>
            <div class="product-status-bar sent">✓ Đã gửi đến máy tính bán hàng</div>
          </div>
        `;
        container.style.display = 'block';
      } else {
        container.innerHTML = `
          <div class="product-card">
            <div class="product-card-inner">
              <div class="product-image" style="background: var(--orange-light);">❓</div>
              <div class="product-details">
                <div class="product-name">Sản phẩm chưa có trong hệ thống</div>
                <div class="product-stock">Mã: ${escapeHtml(data.barcode || '')}</div>
              </div>
            </div>
            <div class="product-status-bar not-found">⚠ Mã đã gửi — Sản phẩm chưa được thêm vào hệ thống</div>
          </div>
        `;
        container.style.display = 'block';
      }
    }

    // ==================== SCAN METHODS ====================
    function triggerPhotoCapture() {
      document.getElementById('fileInput').click();
    }

    async function handleFileSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const loadingText = document.getElementById('loadingText');
      if (loadingText) loadingText.style.display = 'block';

      try {
        const decodedText = await robustDecodeBarcode(file);
        if (loadingText) loadingText.style.display = 'none';
        await sendBarcode(decodedText, 'PHOTO_SCAN');
      } catch (err) {
        if (loadingText) loadingText.style.display = 'none';
        showNotification(err.message || 'Không nhận diện được mã vạch. Vui lòng chụp gần và rõ hơn!', 'error');
      } finally {
        if (loadingText) loadingText.style.display = 'none';
        event.target.value = '';
      }
    }

    // ==================== HYBRID QUAD-ENGINE LIVE CAMERA SYSTEM ====================
    let activeLiveScanner = null; // Current active Html5Qrcode instance
    let activeVideoTrack = null;  // Current active MediaStreamTrack for Zoom & Torch
    let isCameraTransitioning = false; // Mutex to prevent double clicks and avoid NotReadableError
    let liveAcceleratorTimer = null;
    let desktopCheckInFlight = false;
    let lastLiveScanCode = '';
    let lastLiveScanTime = 0;
    let currentZoom = 1.0;
    let torchOn = false;

    /**
     * Unified scan success handler across all modes
     */
    function handleLiveScanSuccess(code, mode, wrapId) {
      if (!code) return;
      code = String(code).trim();
      const now = Date.now();
      if (code === lastLiveScanCode && (now - lastLiveScanTime) < 2200) {
        return; // Ignore duplicate scans within 2.2s
      }
      lastLiveScanCode = code;
      lastLiveScanTime = now;

      playBeep();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

      // Flash green viewfinder box with glowing feedback
      const wrapEl = document.getElementById(wrapId);
      const vfBox = wrapEl ? wrapEl.querySelector('.viewfinder-box') : null;
      if (vfBox) {
        vfBox.style.borderColor = '#00FF7F';
        vfBox.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.45), 0 0 25px #00FF7F';
        setTimeout(() => {
          if (vfBox) {
            vfBox.style.borderColor = '';
            vfBox.style.boxShadow = '';
          }
        }, 750);
      }

      if (mode === 'add' || (!mode && currentPage === 'add')) {
        const addBarcodeEl = document.getElementById('addBarcode');
        if (addBarcodeEl) {
          addBarcodeEl.value = code;
          addBarcodeEl.style.borderColor = 'var(--green-primary)';
          addBarcodeEl.style.boxShadow = '0 0 0 3px var(--green-light)';
          setTimeout(() => {
            addBarcodeEl.style.borderColor = '';
            addBarcodeEl.style.boxShadow = '';
          }, 1500);
        }
        showNotification('✓ Đã quét mã barcode: ' + code, 'success');
        stopAddLiveScan();
      } else if (mode === 'check' || (!mode && currentPage === 'check')) {
        checkProductPrice(code);
      } else {
        // Mode scan / POS (SC-02: Support Batch Scan mode)
        if (isBatchMode) {
          handleBatchBarcode(code);
        } else {
          sendBarcode(code, 'LIVE_SCAN');
        }
      }
      triggerCooldownIndicator(1800);
    }

    /**
     * Hybrid Frame Accelerator
     * Runs in parallel with Html5Qrcode video:
     * 1. GPU Native BarcodeDetector (Chrome/Edge Android, 2-5ms)
     * 2. ZXing-C++ WASM on client (sub-10ms)
     * 3. Server-Assisted Desktop AI (WebSocket decode_frame)
     */
    function startLiveFrameAccelerator(containerId, wrapId, mode) {
      stopLiveFrameAccelerator();

      let frameCount = 0;
      const loopCanvas = document.createElement('canvas');
      const loopCtx = loopCanvas.getContext('2d', { willReadFrequently: true });

      const tick = async () => {
        if (!isLiveScanning && !isCheckLiveScanning && !isAddLiveScanning) return;

        const video = document.querySelector('#' + containerId + ' video');
        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          liveAcceleratorTimer = setTimeout(tick, 100);
          return;
        }

        frameCount++;
        try {
          const vw = video.videoWidth;
          const vh = video.videoHeight;

          // Scale to max 640px for speed while maintaining high barcode contrast
          const scale = Math.min(1.0, 640 / Math.max(vw, vh));
          const targetW = Math.round(vw * scale);
          const targetH = Math.round(vh * scale);

          loopCanvas.width = targetW;
          loopCanvas.height = targetH;
          loopCtx.drawImage(video, 0, 0, targetW, targetH);

          let foundCode = null;

          // Engine 1: Native GPU BarcodeDetector (Chrome/Edge Android, 2-5ms)
          if ('BarcodeDetector' in window) {
            try {
              if (!window._liveNativeDetector) {
                window._liveNativeDetector = new BarcodeDetector({
                  formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf']
                });
              }
              const results = await window._liveNativeDetector.detect(loopCanvas);
              if (results && results.length > 0 && results[0].rawValue) {
                foundCode = String(results[0].rawValue).trim();
              }
            } catch (_) {}
          }

          // Engine 2: ZXing-C++ WASM on client (sub-10ms)
          if (!foundCode && typeof ZXingWASM !== 'undefined' && ZXingWASM.readBarcodesFromImageData) {
            try {
              const imgData = loopCtx.getImageData(0, 0, targetW, targetH);
              const wasmRes = await ZXingWASM.readBarcodesFromImageData(imgData, {
                formats: ['EAN-13', 'EAN-8', 'Code 128', 'Code 39', 'UPC-A', 'UPC-E', 'QR Code'],
                tryHarder: frameCount % 3 === 0,
                maxNumberOfSymbols: 1
              });
              if (wasmRes && wasmRes.length > 0 && wasmRes[0].text) {
                foundCode = String(wasmRes[0].text).trim();
              }
            } catch (_) {}
          }

          if (foundCode) {
            handleLiveScanSuccess(foundCode, mode, wrapId);
          }

          // Engine 3: Server-Assisted Desktop AI (WebSocket decode_frame)
          // Desktop PC uses multi-core CPU and native zxing-wasm to decode in ~5ms
          if (!foundCode && ws && ws.readyState === WebSocket.OPEN && !desktopCheckInFlight && (frameCount % 2 === 0)) {
            desktopCheckInFlight = true;
            try {
              const frameJpeg = loopCanvas.toDataURL('image/jpeg', 0.65);
              ws.send(JSON.stringify({
                type: 'decode_frame',
                image: frameJpeg,
                mode: mode
              }));
            } catch (_) {}
            setTimeout(() => { desktopCheckInFlight = false; }, 260);
          }
        } catch (e) {
          console.warn('[LiveFrameAccelerator] error:', e);
        }

        if (isLiveScanning || isCheckLiveScanning || isAddLiveScanning) {
          liveAcceleratorTimer = setTimeout(tick, 120);
        }
      };

      liveAcceleratorTimer = setTimeout(tick, 150);
    }

    function stopLiveFrameAccelerator() {
      if (liveAcceleratorTimer) {
        clearTimeout(liveAcceleratorTimer);
        liveAcceleratorTimer = null;
      }
      desktopCheckInFlight = false;
    }

    /**
     * Setup Zoom and Torch on the viewfinder overlay
     */
    function setupViewfinderControls(wrapId, track) {
      const wrapEl = document.getElementById(wrapId);
      if (!wrapEl || !track) return;

      const zoomBtn = wrapEl.querySelector('.vf-zoom-btn');
      const torchBtn = wrapEl.querySelector('.vf-torch-btn');
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};

      currentZoom = 1.0;
      torchOn = false;

      if (zoomBtn) {
        if (capabilities.zoom && capabilities.zoom.max > 1) {
          zoomBtn.style.display = 'inline-flex';
          zoomBtn.textContent = '🔍 Zoom 2x';
          zoomBtn.classList.remove('active');
          zoomBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
              const maxZ = Math.min(capabilities.zoom.max || 3, 3.0);
              currentZoom = currentZoom >= 2.0 ? 1.0 : Math.min(2.0, maxZ);
              await track.applyConstraints({ advanced: [{ zoom: currentZoom }] });
              zoomBtn.textContent = currentZoom > 1.0 ? `🔍 Zoom ${currentZoom.toFixed(1)}x` : '🔍 Zoom 2x';
              zoomBtn.classList.toggle('active', currentZoom > 1.0);
              if (navigator.vibrate) navigator.vibrate(40);
            } catch (err) {
              console.warn('Zoom error:', err);
            }
          };
        } else {
          zoomBtn.style.display = 'none';
        }
      }

      if (torchBtn) {
        if (capabilities.torch) {
          torchBtn.style.display = 'inline-flex';
          torchBtn.textContent = '💡 Bật Flash';
          torchBtn.classList.remove('active');
          torchBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
              torchOn = !torchOn;
              await track.applyConstraints({ advanced: [{ torch: torchOn }] });
              torchBtn.textContent = torchOn ? '💡 Tắt Flash' : '💡 Bật Flash';
              torchBtn.classList.toggle('active', torchOn);
              if (navigator.vibrate) navigator.vibrate(40);
            } catch (err) {
              console.warn('Torch error:', err);
            }
          };
        } else {
          torchBtn.style.display = 'none';
        }
      }
    }

    // ==================== POS SCAN TAB CONTROLS ====================
    async function toggleLiveScan() {
      if (isCameraTransitioning) return;

      if (isLiveScanning) {
        await stopLiveScan();
        return;
      }

      if (!hasMediaDevices) {
        const httpsUrl = `https://${window.location.hostname}:8766`;
        if (confirm('Safari trên iPhone yêu cầu HTTPS để quay video camera.\n\nMở link HTTPS ngay?')) {
          window.location.href = httpsUrl;
        }
        return;
      }

      // Stop any other active live scan
      if (isCheckLiveScanning) await stopCheckLiveScan();
      if (isAddLiveScanning) await stopAddLiveScan();

      isCameraTransitioning = true;
      const btnLive = document.getElementById('btnLive');
      if (btnLive) {
        btnLive.textContent = '⏳ Đang mở camera...';
        btnLive.disabled = true;
      }

      const readerWrap = document.getElementById('readerWrap');
      const readerEl = document.getElementById('reader');
      if (readerWrap) readerWrap.style.display = 'block';
      if (readerEl) readerEl.style.display = 'block';

      try {
        if (!activeLiveScanner) {
          activeLiveScanner = new Html5Qrcode('reader', {
            formatsToSupport: ALL_BARCODE_FORMATS,
            verbose: false
          });
        }

        await activeLiveScanner.start(
          { facingMode: 'environment' },
          { fps: 15 },
          (code) => { handleLiveScanSuccess(code, 'scan', 'readerWrap'); },
          () => {}
        );

        isLiveScanning = true;

        // Get video track for Zoom & Torch
        const video = document.querySelector('#reader video');
        if (video && video.srcObject) {
          activeVideoTrack = video.srcObject.getVideoTracks()[0];
          setupViewfinderControls('readerWrap', activeVideoTrack);
        }

        // Start hybrid quad-engine accelerator
        startLiveFrameAccelerator('reader', 'readerWrap', 'scan');

        if (btnLive) {
          btnLive.textContent = '⏹ Dừng quay video';
          btnLive.className = 'btn btn-danger';
          btnLive.disabled = false;
        }
      } catch (err) {
        console.error('toggleLiveScan error:', err);
        showNotification('Không thể mở camera: ' + (err.message || err), 'error');
        await stopLiveScan();
      } finally {
        isCameraTransitioning = false;
      }
    }

    async function stopLiveScan() {
      stopLiveFrameAccelerator();

      if (torchOn && activeVideoTrack) {
        try { activeVideoTrack.applyConstraints({ advanced: [{ torch: false }] }); } catch (_) {}
        torchOn = false;
      }

      if (activeLiveScanner && activeLiveScanner.isScanning) {
        try { await activeLiveScanner.stop(); } catch (_) {}
        try { await activeLiveScanner.clear(); } catch (_) {}
      }
      activeLiveScanner = null;
      activeVideoTrack = null;
      isLiveScanning = false;

      const readerWrap = document.getElementById('readerWrap');
      if (readerWrap) readerWrap.style.display = 'none';
      const readerEl = document.getElementById('reader');
      if (readerEl) {
        readerEl.style.display = 'none';
        readerEl.innerHTML = '';
      }

      const btnLive = document.getElementById('btnLive');
      if (btnLive) {
        btnLive.textContent = '🎥 Quét liên tục (Live Camera)';
        btnLive.className = 'btn btn-secondary';
        btnLive.disabled = false;
      }

      // Mandatory cooling delay for mobile OS hardware release
      await new Promise(r => setTimeout(r, 350));
    }

    // Manual send
    function handleManualSend(e) {
      e.preventDefault();
      const input = document.getElementById('manualCodeInput');
      const code = input.value.trim();
      if (!code) return;
      sendBarcode(code, 'MANUAL');
      input.value = '';
    }

    // ==================== ADD MODE AUTH ====================
    function startAddAuth() {
      document.getElementById('authFileInput').click();
    }

    async function handleAuthFileSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const loadingText = document.getElementById('authLoadingText');
      const resultDiv = document.getElementById('authResult');
      loadingText.style.display = 'block';
      resultDiv.style.display = 'none';

      try {
        if (!authQrCode) {
          // Create a temporary hidden div for QR scanning
          let tempDiv = document.getElementById('authReader');
          if (!tempDiv) {
            tempDiv = document.createElement('div');
            tempDiv.id = 'authReader';
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);
          }
          authQrCode = new Html5Qrcode('authReader');
        }

        const decodedText = await authQrCode.scanFile(file, true);
        loadingText.style.display = 'none';

        // Parse the QR data
        try {
          const qrData = JSON.parse(decodedText);
          if (qrData.type === 'shoppro_add_auth' && qrData.token) {
            // Send token to server for verification
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'auth_add', token: qrData.token }));
              resultDiv.innerHTML = '<div style="color: var(--blue-primary); font-weight: 600;">⏳ Đang xác thực...</div>';
              resultDiv.style.display = 'block';
            } else {
              resultDiv.innerHTML = '<div style="color: var(--red-primary); font-weight: 600;">❌ Chưa kết nối với Desktop</div>';
              resultDiv.style.display = 'block';
            }
          } else {
            resultDiv.innerHTML = '<div style="color: var(--red-primary); font-weight: 600;">❌ Đây không phải mã xác thực Shop</div>';
            resultDiv.style.display = 'block';
          }
        } catch (parseErr) {
          resultDiv.innerHTML = '<div style="color: var(--red-primary); font-weight: 600;">❌ Mã QR không hợp lệ. Vui lòng quét mã từ ứng dụng Desktop.</div>';
          resultDiv.style.display = 'block';
        }
      } catch (err) {
        loadingText.style.display = 'none';
        resultDiv.innerHTML = '<div style="color: var(--red-primary); font-weight: 600;">❌ Không nhận diện được mã QR. Chụp lại gần hơn.</div>';
        resultDiv.style.display = 'block';
      } finally {
        event.target.value = '';
      }
    }

    function handleAuthResult(data) {
      const resultDiv = document.getElementById('authResult');
      
      if (data.success) {
        isAddModeUnlocked = true;
        playBeep();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        // Show form, hide auth
        document.getElementById('addAuthRequired').style.display = 'none';
        document.getElementById('addFormContainer').style.display = 'block';

        if (pendingAddBarcode) {
          const addBarcodeEl = document.getElementById('addBarcode');
          if (addBarcodeEl) {
            addBarcodeEl.value = pendingAddBarcode;
            addBarcodeEl.style.borderColor = 'var(--green-primary)';
            addBarcodeEl.style.boxShadow = '0 0 0 3px var(--green-light)';
            setTimeout(() => {
              addBarcodeEl.style.borderColor = '';
              addBarcodeEl.style.boxShadow = '';
            }, 1500);
          }
          pendingAddBarcode = '';
        }

        showNotification('🔓 ' + data.message, 'success');
      } else {
        resultDiv.innerHTML = `<div style="color: var(--red-primary); font-weight: 600;">❌ ${data.message}</div>`;
        resultDiv.style.display = 'block';
      }
    }

    // ==================== ADD PRODUCT SCAN ====================
    function triggerAddPhotoCapture() {
      document.getElementById('addScanFileInput').click();
    }

    async function handleAddScanFile(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const loading = document.getElementById('addScanLoading');
      if (loading) loading.style.display = 'block';

      try {
        const decodedText = await robustDecodeBarcode(file);
        if (loading) loading.style.display = 'none';
        const addBarcodeEl = document.getElementById('addBarcode');
        if (addBarcodeEl) {
          addBarcodeEl.value = decodedText;
          addBarcodeEl.style.borderColor = 'var(--green-primary)';
          addBarcodeEl.style.boxShadow = '0 0 0 3px var(--green-light)';
          setTimeout(() => {
            addBarcodeEl.style.borderColor = '';
            addBarcodeEl.style.boxShadow = '';
          }, 1500);
        }
        playBeep();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        showNotification('📸 Đã nhận diện Barcode: ' + decodedText, 'success');
      } catch (err) {
        if (loading) loading.style.display = 'none';
        showNotification(err.message || 'Không nhận diện được mã vạch. Chụp rõ tem mã hoặc dùng Quét trực tiếp!', 'error');
      } finally {
        if (loading) loading.style.display = 'none';
        event.target.value = '';
      }
    }

    async function toggleAddLiveScan() {
      if (isCameraTransitioning) return;

      if (isAddLiveScanning) {
        await stopAddLiveScan();
        return;
      }

      if (!hasMediaDevices) {
        const httpsUrl = `https://${window.location.hostname}:8766`;
        if (confirm('Safari trên iPhone yêu cầu HTTPS để quay video camera.\n\nMở link HTTPS ngay?')) {
          window.location.href = httpsUrl;
        }
        return;
      }

      // Stop any other active live scan
      if (isLiveScanning) await stopLiveScan();
      if (isCheckLiveScanning) await stopCheckLiveScan();

      isCameraTransitioning = true;
      const btnLive = document.getElementById('btnAddLive');
      if (btnLive) {
        btnLive.textContent = '⏳ Mở...';
        btnLive.disabled = true;
      }

      const readerAddWrap = document.getElementById('readerAddWrap');
      const readerEl = document.getElementById('readerAdd');
      if (readerAddWrap) readerAddWrap.style.display = 'block';
      if (readerEl) readerEl.style.display = 'block';

      try {
        if (!activeLiveScanner) {
          activeLiveScanner = new Html5Qrcode('readerAdd', {
            formatsToSupport: ALL_BARCODE_FORMATS,
            verbose: false
          });
        }

        await activeLiveScanner.start(
          { facingMode: 'environment' },
          { fps: 15 },
          (code) => { handleLiveScanSuccess(code, 'add', 'readerAddWrap'); },
          () => {}
        );

        isAddLiveScanning = true;

        // Get video track for Zoom & Torch
        const video = document.querySelector('#readerAdd video');
        if (video && video.srcObject) {
          activeVideoTrack = video.srcObject.getVideoTracks()[0];
          setupViewfinderControls('readerAddWrap', activeVideoTrack);
        }

        // Start hybrid quad-engine accelerator
        startLiveFrameAccelerator('readerAdd', 'readerAddWrap', 'add');

        if (btnLive) {
          btnLive.textContent = '⏹ Dừng camera';
          btnLive.className = 'btn btn-danger btn-sm';
          btnLive.disabled = false;
        }
      } catch (err) {
        console.error('toggleAddLiveScan error:', err);
        showNotification('Không thể mở camera: ' + (err.message || err), 'error');
        await stopAddLiveScan();
      } finally {
        isCameraTransitioning = false;
      }
    }

    async function stopAddLiveScan() {
      stopLiveFrameAccelerator();

      if (torchOn && activeVideoTrack) {
        try { activeVideoTrack.applyConstraints({ advanced: [{ torch: false }] }); } catch (_) {}
        torchOn = false;
      }

      if (activeLiveScanner && activeLiveScanner.isScanning) {
        try { await activeLiveScanner.stop(); } catch (_) {}
        try { await activeLiveScanner.clear(); } catch (_) {}
      }
      activeLiveScanner = null;
      activeVideoTrack = null;
      isAddLiveScanning = false;

      const readerAddWrap = document.getElementById('readerAddWrap');
      if (readerAddWrap) readerAddWrap.style.display = 'none';
      const readerEl = document.getElementById('readerAdd');
      if (readerEl) {
        readerEl.style.display = 'none';
        readerEl.innerHTML = '';
      }

      const btnLive = document.getElementById('btnAddLive');
      if (btnLive) {
        btnLive.textContent = '🎥 Quét trực tiếp';
        btnLive.className = 'btn btn-secondary btn-sm';
        btnLive.disabled = false;
      }

      // Mandatory cooling delay for mobile OS hardware release
      await new Promise(r => setTimeout(r, 350));
    }

    // Helper to send photo with automatic WebSocket + HTTP fallback
    async function sendPhotoToDesktop(base64Data, onSuccess, onError) {
      if (!base64Data) {
        if (onError) onError('Chưa có dữ liệu ảnh');
        return;
      }

      // 1. Try WebSocket first (instant)
      try {
        const connected = await ensureWsConnected(2000);
        if (connected && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'send_product_photo',
            image: base64Data,
            timestamp: Date.now()
          }));
          if (onSuccess) onSuccess('WS');
          return;
        }
      } catch (wsErr) {
        console.warn('WS send note, falling back to HTTP:', wsErr);
      }

      // 2. HTTP POST fallback (resilient to mobile camera tab suspension)
      try {
        const res = await fetch('/api/upload-product-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data, timestamp: Date.now() })
        });
        const json = await res.json();
        if (json && json.success) {
          if (onSuccess) onSuccess('HTTP', json.filename, json.relativePath);
        } else {
          throw new Error(json.error || 'Server không lưu được ảnh');
        }
      } catch (httpErr) {
        console.error('Photo upload failed:', httpErr);
        if (onError) onError('Không thể gửi ảnh sang máy tính. Hãy kiểm tra lại WiFi!');
      }
    }

    function handlePhoneProductPhoto(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const previewBox = document.getElementById('phoneImgPreviewBox');
      if (previewBox) previewBox.innerHTML = '<span style="font-size:20px;">⏳</span>';

      let objUrl = '';
      try { objUrl = URL.createObjectURL(file); } catch (_) {}

      const img = new Image();
      img.onload = function() {
        if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (_) {} }
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800;
        if (width > height && width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64Data = canvas.toDataURL('image/jpeg', 0.85);
        if (previewBox) {
          previewBox.innerHTML = `<img src="${base64Data}" style="width:100%; height:100%; object-fit:cover;">`;
        }
        const imgUrlInput = document.getElementById('addImageUrl');
        if (imgUrlInput) imgUrlInput.value = base64Data;
        const btnSend = document.getElementById('btnSendAddPhotoToDesktop');
        if (btnSend) {
          btnSend.style.display = 'inline-block';
          btnSend.textContent = '📤 Gửi Desktop';
          btnSend.disabled = false;
        }

        playBeep();
        if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
        showNotification('📸 Đã chụp ảnh sản phẩm! Bấm "Thêm sản phẩm" để lưu.', 'success');

        // Auto extract barcode from high-res original photo
        tryExtractBarcodeFromProductPhoto(img, file);
      };
      img.onerror = function() {
        if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (_) {} }
        if (previewBox) previewBox.innerHTML = '<span style="font-size:24px;">📷</span>';
        showNotification('Lỗi nạp ảnh!', 'error');
      };

      if (objUrl) {
        img.src = objUrl;
      } else {
        const reader = new FileReader();
        reader.onload = function(e) { img.src = e.target.result; };
        reader.onerror = function() { img.onerror(); };
        reader.readAsDataURL(file);
      }
    }

    // Send photo of product directly from camera to Desktop
    function handleSendDirectProductPhoto(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const sendingEl = document.getElementById('directPhotoSending');
      const previewEl = document.getElementById('directPhotoPreview');
      const thumbEl = document.getElementById('directPhotoThumb');
      if (sendingEl) {
        sendingEl.textContent = '⏳ Đang lưu & gửi ảnh sang máy tính...';
        sendingEl.style.display = 'block';
      }

      let objUrl = '';
      try { objUrl = URL.createObjectURL(file); } catch (_) {}

      const img = new Image();
      img.onload = function() {
        if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (_) {} }
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800;
        if (width > height && width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64Data = canvas.toDataURL('image/jpeg', 0.85);

        sendPhotoToDesktop(
          base64Data,
          (proto, filename) => {
            if (sendingEl) sendingEl.style.display = 'none';
            if (thumbEl) thumbEl.src = base64Data;
            if (previewEl) previewEl.style.display = 'flex';
            playBeep();
            if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
            showNotification('✅ Đã gửi & lưu ảnh vào uploads/products/ trên máy tính!', 'success');
          },
          (err) => {
            if (sendingEl) sendingEl.style.display = 'none';
            showNotification(err, 'error');
          }
        );

        // Auto extract barcode from high-res photo if on add page
        tryExtractBarcodeFromProductPhoto(img, file);
      };
      img.onerror = function() {
        if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (_) {} }
        if (sendingEl) sendingEl.style.display = 'none';
        showNotification('Lỗi nạp ảnh!', 'error');
      };

      if (objUrl) {
        img.src = objUrl;
      } else {
        const reader = new FileReader();
        reader.onload = function(e) { img.src = e.target.result; };
        reader.onerror = function() { img.onerror(); };
        reader.readAsDataURL(file);
      }
      event.target.value = '';
    }

    // ==================== AUTO EXTRACT BARCODE FROM HIGH-RES PHOTO ====================
    async function tryExtractBarcodeFromProductPhoto(img, file) {
      const statusEl = document.getElementById('autoBarcodeStatus');
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:var(--blue-primary); font-weight:600;">🔍 Đang tự động quét mã vạch từ ảnh sản phẩm...</span>';
        statusEl.style.display = 'block';
      }

      try {
        let detectedCode = null;

        // Strategy 1: ZXing-C++ WebAssembly (zxing-wasm) directly on file
        if (file && typeof ZXingWASM !== 'undefined' && ZXingWASM.readBarcodesFromImageFile) {
          try {
            const wasmHits = await ZXingWASM.readBarcodesFromImageFile(file, {
              formats: ['EAN-13', 'EAN-8', 'Code 128', 'Code 39', 'Code 93', 'UPC-A', 'UPC-E', 'QR Code', 'Data Matrix', 'ITF'],
              tryHarder: true,
              tryRotate: true,
              tryInvert: true,
              binarizer: 'LocalAverage'
            });
            if (wasmHits && wasmHits.length > 0 && wasmHits[0].text) {
              detectedCode = String(wasmHits[0].text).trim();
              console.log('[AutoBarcode] ZXingWASM matched:', detectedCode);
            }
          } catch (wErr) {
            console.warn('[AutoBarcode] ZXingWASM note:', wErr.message);
          }
        }

        // Strategy 2: Quagga2 1D Barcode locator
        if (!detectedCode && file && typeof Quagga !== 'undefined') {
          try {
            let objUrl = '';
            try { objUrl = URL.createObjectURL(file); } catch (_) {}
            if (objUrl) {
              const qCode = await new Promise((resolve) => {
                Quagga.decodeSingle({
                  src: objUrl,
                  numOfWorkers: 0,
                  inputStream: { size: 1600 },
                  decoder: { readers: ['ean_reader', 'code_128_reader', 'code_39_reader', 'upc_reader'] },
                  locate: true
                }, (res) => {
                  try { URL.revokeObjectURL(objUrl); } catch (_) {}
                  if (res && res.codeResult && res.codeResult.code) {
                    resolve(String(res.codeResult.code).trim());
                  } else {
                    resolve(null);
                  }
                });
              });
              if (qCode) {
                detectedCode = qCode;
                console.log('[AutoBarcode] Quagga2 matched:', detectedCode);
              }
            }
          } catch (qErr) {
            console.warn('[AutoBarcode] Quagga2 note:', qErr);
          }
        }

        // Strategy 3: Native BarcodeDetector directly on high-resolution image element
        if (!detectedCode && 'BarcodeDetector' in window) {
          try {
            const formats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'upc_a', 'upc_e', 'qr_code', 'itf', 'data_matrix'];
            let detector;
            try { detector = new BarcodeDetector({ formats }); } catch (_) { detector = new BarcodeDetector(); }

            let results = await detector.detect(img);
            if (results && results.length > 0) {
              const codes = [...new Set(results.map(r => String(r.rawValue || '').trim()).filter(Boolean))];
              if (codes.length > 0) detectedCode = codes[0];
            }

            // High-res canvas scan if not yet detected directly
            if (!detectedCode) {
              const nw = img.naturalWidth || img.width;
              const nh = img.naturalHeight || img.height;
              const maxD = 2048;
              let hw = nw, hh = nh;
              if (nw > maxD || nh > maxD) {
                if (nw > nh) { hh = Math.round((nh * maxD) / nw); hw = maxD; }
                else { hw = Math.round((nw * maxD) / nh); hh = maxD; }
              }
              const hiCanvas = document.createElement('canvas');
              hiCanvas.width = hw;
              hiCanvas.height = hh;
              const hctx = hiCanvas.getContext('2d');
              hctx.drawImage(img, 0, 0, hw, hh);

              results = await detector.detect(hiCanvas);
              if (results && results.length > 0) {
                const codes = [...new Set(results.map(r => String(r.rawValue || '').trim()).filter(Boolean))];
                if (codes.length > 0) detectedCode = codes[0];
              }
            }
          } catch (detErr) {
            console.log('[AutoBarcode] BarcodeDetector note:', detErr.message);
          }
        }

        // Strategy 4: Digital Zoom slices (Bottom 60%, Center 75%, Bottom-Right 65%, Top 60%) using ZXingWASM
        if (!detectedCode && typeof ZXingWASM !== 'undefined' && ZXingWASM.readBarcodesFromImageData) {
          try {
            const nw = img.naturalWidth || img.width;
            const nh = img.naturalHeight || img.height;
            const slices = [
              { x: 0, y: Math.round(nh * 0.35), w: nw, h: Math.round(nh * 0.65) },
              { x: Math.round(nw * 0.1), y: Math.round(nh * 0.15), w: Math.round(nw * 0.8), h: Math.round(nh * 0.7) },
              { x: Math.round(nw * 0.25), y: Math.round(nh * 0.35), w: Math.round(nw * 0.75), h: Math.round(nh * 0.65) },
              { x: 0, y: 0, w: nw, h: Math.round(nh * 0.65) }
            ];

            for (const sl of slices) {
              const slCanvas = document.createElement('canvas');
              const scale = Math.min(1.0, 1200 / Math.max(sl.w, sl.h));
              slCanvas.width = Math.max(100, Math.round(sl.w * scale));
              slCanvas.height = Math.max(100, Math.round(sl.h * scale));
              const slCtx = slCanvas.getContext('2d');
              slCtx.drawImage(img, sl.x, sl.y, sl.w, sl.h, 0, 0, slCanvas.width, slCanvas.height);
              const imgData = slCtx.getImageData(0, 0, slCanvas.width, slCanvas.height);

              const hits = await ZXingWASM.readBarcodesFromImageData(imgData, {
                formats: ['EAN-13', 'EAN-8', 'Code 128', 'Code 39', 'UPC-A', 'UPC-E', 'QR Code'],
                tryHarder: true,
                tryRotate: true,
                binarizer: 'LocalAverage'
              });
              if (hits && hits.length > 0 && hits[0].text) {
                detectedCode = String(hits[0].text).trim();
                break;
              }
            }
          } catch (cropErr) {
            console.warn('[AutoBarcode] Crop WASM note:', cropErr);
          }
        }

        // Strategy 5: Html5Qrcode isolated scanFile on raw file fallback
        if (!detectedCode && file && typeof Html5Qrcode !== 'undefined') {
          try {
            let tempDiv = document.getElementById('isolatedBarcodeScanner');
            if (!tempDiv) {
              tempDiv = document.createElement('div');
              tempDiv.id = 'isolatedBarcodeScanner';
              tempDiv.style.display = 'none';
              document.body.appendChild(tempDiv);
            }
            let scanner = new Html5Qrcode('isolatedBarcodeScanner', { verbose: false });
            const res = await scanner.scanFile(file, false);
            if (res) detectedCode = String(res).trim();
            await scanner.clear();
          } catch (_) {}
        }

        // Result handling
        if (detectedCode) {
          const barcodeInput = document.getElementById('addBarcode');
          if (barcodeInput) {
            barcodeInput.value = detectedCode;
            barcodeInput.style.borderColor = 'var(--green-primary)';
            barcodeInput.style.boxShadow = '0 0 0 4px var(--green-light)';
            setTimeout(() => {
              barcodeInput.style.borderColor = '';
              barcodeInput.style.boxShadow = '';
            }, 3000);
          }
          playBeep();
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          showNotification(`🎉 Đã tự động nhận diện Barcode: ${detectedCode} từ ảnh sản phẩm!`, 'success');
          if (statusEl) {
            statusEl.innerHTML = `
              <div style="display:flex; align-items:center; gap:6px; color:var(--green-dark); font-weight:700;">
                <span>✓ Đã tự động điền Barcode:</span>
                <span style="background:var(--green-primary); color:white; padding:2px 8px; border-radius:12px; font-family:monospace; font-size:0.85rem;">${escapeHtml(detectedCode)}</span>
              </div>
            `;
            statusEl.style.display = 'block';
          }
        } else {
          if (statusEl) {
            statusEl.innerHTML = '<span style="color:var(--text-muted);">💡 Không tìm thấy tem mã vạch trong ảnh bao bì này. (Nếu cần quét mã, bấm <strong>"📸 Chụp ảnh quét mã"</strong> đưa sát 10-15cm hoặc dùng <strong>"🎥 Quét trực tiếp"</strong>).</span>';
            statusEl.style.display = 'block';
            setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 6000);
          }
        }
      } catch (err) {
        console.warn('[AutoBarcode] Note:', err);
        if (statusEl) statusEl.style.display = 'none';
      }
    }

    function sendAddPhotoToDesktop() {
      const imgUrlInput = document.getElementById('addImageUrl');
      const base64Data = imgUrlInput ? imgUrlInput.value.trim() : '';
      if (!base64Data) {
        showNotification('Chưa có ảnh. Vui lòng bấm "Chụp ảnh sản phẩm" trước!', 'warning');
        return;
      }
      const btnSend = document.getElementById('btnSendAddPhotoToDesktop');
      if (btnSend) {
        btnSend.disabled = true;
        btnSend.textContent = '⏳ Đang gửi...';
      }
      sendPhotoToDesktop(
        base64Data,
        (proto, filename, relPath) => {
          playBeep();
          if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
          if (relPath && imgUrlInput) {
            imgUrlInput.value = relPath;
          }
          if (btnSend) {
            btnSend.textContent = '✅ Đã gửi';
            setTimeout(() => {
              btnSend.textContent = '📤 Gửi Desktop';
              btnSend.disabled = false;
            }, 2500);
          }
          showNotification('✅ Đã gửi & lưu ảnh vào uploads/products/ trên máy tính!', 'success');
        },
        (err) => {
          if (btnSend) {
            btnSend.textContent = '📤 Gửi Desktop';
            btnSend.disabled = false;
          }
          showNotification(err, 'error');
        }
      );
    }

    // ==================== SUBMIT ADD PRODUCT ====================
    async function submitAddProduct(event) {
      event.preventDefault();

      const imgVal = document.getElementById('addImageUrl').value.trim();
      const product = {
        barcode: document.getElementById('addBarcode').value.trim(),
        name: document.getElementById('addName').value.trim(),
        price: parseFloat(document.getElementById('addPrice').value) || 0,
        stock: parseInt(document.getElementById('addStock').value) || 0,
        category: document.getElementById('addCategory').value,
        unit: document.getElementById('addUnit').value,
        image_url: imgVal,
        image: imgVal
      };

      if (!product.barcode || !product.name || product.price <= 0) {
        showNotification('Vui lòng nhập đầy đủ: mã barcode, tên và giá sản phẩm!', 'error');
        return;
      }

      const btn = document.getElementById('btnSubmitAdd');
      const prevBtnText = btn.innerHTML;
      btn.innerHTML = '⏳ Đang gửi sản phẩm...';
      btn.disabled = true;

      try {
        let sent = false;

        // 1. Try WebSocket if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'add_product', product }));
            sent = true;
          } catch (wsErr) {
            console.warn('WS add_product send note:', wsErr);
          }
        }

        // 2. Dual-transport fallback via HTTP POST (resilient to tab suspension)
        if (!sent) {
          const res = await fetch('/api/add-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product })
          });
          const json = await res.json();
          if (json && json.success) {
            sent = true;
          } else {
            throw new Error(json.error || 'Lỗi từ máy chủ Desktop');
          }
        }

        if (sent) {
          playBeep();
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          showNotification('✅ Đã thêm sản phẩm thành công lên Desktop!', 'success');
          document.getElementById('addProductForm').reset();
          const previewBox = document.getElementById('phoneImgPreviewBox');
          if (previewBox) previewBox.innerHTML = '<span style="font-size:24px;">📷</span>';
          const btnSend = document.getElementById('btnSendAddPhotoToDesktop');
          if (btnSend) btnSend.style.display = 'none';
        }
      } catch (err) {
        console.error('Submit product error:', err);
        showNotification('❌ Không thể gửi sản phẩm: ' + (err.message || 'Kiểm tra lại WiFi'), 'error');
      } finally {
        btn.innerHTML = prevBtnText;
        btn.disabled = false;
      }
    }

    // ==================== HISTORY ====================
    function renderHistory() {
      const listEl = document.getElementById('historyList');
      if (scanHistory.length === 0) {
        listEl.innerHTML = '<div class="empty-state">Chưa có mã quét nào</div>';
        return;
      }
      listEl.innerHTML = scanHistory.slice(0, 20).map(h => `
        <div class="history-item">
          <div>
            <div class="hi-code">${escapeHtml(h.code)}</div>
            ${h.productName ? `<div class="hi-product-name">${escapeHtml(h.productName)}</div>` : ''}
            <div class="hi-time">${h.time}</div>
          </div>
          <span class="badge-sent">✓ Đã gửi</span>
        </div>
      `).join('');
    }

    // ==================== PRICE CHECKER SYSTEM ====================
    let html5QrCodeCheck = null;
    let isCheckLiveScanning = false;
    let recentPriceChecks = [];

    function triggerCheckPhotoCapture() {
      document.getElementById('fileInputCheck').click();
    }

    async function handleCheckFileSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const loadingText = document.getElementById('loadingTextCheck');
      if (loadingText) loadingText.style.display = 'block';

      try {
        const decodedText = await robustDecodeBarcode(file);
        if (loadingText) loadingText.style.display = 'none';
        checkProductPrice(decodedText);
      } catch (err) {
        if (loadingText) loadingText.style.display = 'none';
        showNotification(err.message || 'Không nhận diện được mã vạch. Vui lòng chụp gần và rõ hơn!', 'error');
      } finally {
        if (loadingText) loadingText.style.display = 'none';
        event.target.value = '';
      }
    }

    let lastCheckLiveCode = '';
    let lastCheckLiveTime = 0;

    async function toggleCheckLiveScan() {
      if (isCameraTransitioning) return;

      if (isCheckLiveScanning) {
        await stopCheckLiveScan();
        return;
      }

      if (!hasMediaDevices) {
        const httpsUrl = `https://${window.location.hostname}:8766`;
        if (confirm('Safari trên iPhone yêu cầu HTTPS để quay video camera.\n\nMở link HTTPS ngay?')) {
          window.location.href = httpsUrl;
        }
        return;
      }

      // Stop any other active live scan
      if (isLiveScanning) await stopLiveScan();
      if (isAddLiveScanning) await stopAddLiveScan();

      isCameraTransitioning = true;
      const btnLive = document.getElementById('btnLiveCheck');
      if (btnLive) {
        btnLive.textContent = '⏳ Đang mở camera...';
        btnLive.disabled = true;
      }

      const readerCheckWrap = document.getElementById('readerCheckWrap');
      const readerEl = document.getElementById('readerCheck');
      if (readerCheckWrap) readerCheckWrap.style.display = 'block';
      if (readerEl) readerEl.style.display = 'block';

      try {
        if (!activeLiveScanner) {
          activeLiveScanner = new Html5Qrcode('readerCheck', {
            formatsToSupport: ALL_BARCODE_FORMATS,
            verbose: false
          });
        }

        await activeLiveScanner.start(
          { facingMode: 'environment' },
          { fps: 15 },
          (code) => { handleLiveScanSuccess(code, 'check', 'readerCheckWrap'); },
          () => {}
        );

        isCheckLiveScanning = true;

        // Get video track for Zoom & Torch
        const video = document.querySelector('#readerCheck video');
        if (video && video.srcObject) {
          activeVideoTrack = video.srcObject.getVideoTracks()[0];
          setupViewfinderControls('readerCheckWrap', activeVideoTrack);
        }

        // Start hybrid quad-engine accelerator
        startLiveFrameAccelerator('readerCheck', 'readerCheckWrap', 'check');

        if (btnLive) {
          btnLive.textContent = '⏹ Dừng quay video';
          btnLive.className = 'btn btn-danger';
          btnLive.disabled = false;
        }
      } catch (err) {
        console.error('toggleCheckLiveScan error:', err);
        showNotification('Không thể mở camera: ' + (err.message || err), 'error');
        await stopCheckLiveScan();
      } finally {
        isCameraTransitioning = false;
      }
    }

    async function stopCheckLiveScan() {
      stopLiveFrameAccelerator();

      if (torchOn && activeVideoTrack) {
        try { activeVideoTrack.applyConstraints({ advanced: [{ torch: false }] }); } catch (_) {}
        torchOn = false;
      }

      if (activeLiveScanner && activeLiveScanner.isScanning) {
        try { await activeLiveScanner.stop(); } catch (_) {}
        try { await activeLiveScanner.clear(); } catch (_) {}
      }
      activeLiveScanner = null;
      activeVideoTrack = null;
      isCheckLiveScanning = false;

      const readerCheckWrap = document.getElementById('readerCheckWrap');
      if (readerCheckWrap) readerCheckWrap.style.display = 'none';
      const readerEl = document.getElementById('readerCheck');
      if (readerEl) {
        readerEl.style.display = 'none';
        readerEl.innerHTML = '';
      }

      const btnLive = document.getElementById('btnLiveCheck');
      if (btnLive) {
        btnLive.textContent = '🎥 Quét liên tục';
        btnLive.className = 'btn btn-secondary';
        btnLive.disabled = false;
      }

      // Mandatory cooling delay for mobile OS hardware release
      await new Promise(r => setTimeout(r, 350));
    }

    function handleManualPriceCheck(e) {
      e.preventDefault();
      const input = document.getElementById('manualCheckInput');
      const code = input ? input.value.trim() : '';
      if (!code) return;
      checkProductPrice(code);
      if (input) input.blur();
    }

    function checkProductPrice(code) {
      if (!code) return;
      playBeep();
      if (navigator.vibrate) navigator.vibrate(100);

      const container = document.getElementById('priceResultContainer');
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align:center; padding:24px;">
            <div class="loading-text">🔍 Đang tra cứu thông tin sản phẩm: <strong>${escapeHtml(code)}</strong>...</div>
          </div>
        `;
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // 1. Send via WebSocket if connected
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'check_price', code }));
      }

      // 2. Fetch HTTP API as reliable fallback/instant lookup
      fetch(`/api/check-price?code=${encodeURIComponent(code)}`)
        .then(res => res.json())
        .then(data => {
          if (data) displayPriceCheckResult(data);
        })
        .catch(err => {
          console.log('HTTP price check fallback err:', err);
        });
    }

    function displayPriceCheckResult(data) {
      const container = document.getElementById('priceResultContainer');
      if (!container) return;

      if (data.found && data.product) {
        const p = data.product;
        const isOutOfStock = p.stock <= 0;
        const now = new Date();
        const expDate = p.expiry_date ? new Date(p.expiry_date) : null;
        const isExpired = expDate && expDate < now;
        const isExpiringSoon = expDate && !isExpired && (expDate - now) < 30 * 24 * 3600 * 1000;

        const pImg = formatClientImageUrl(p.image || p.image_url);

        container.innerHTML = `
          <div class="price-card">
            <div class="price-card-header">
              ${pImg ? `<img src="${escapeHtml(pImg)}" class="price-card-img" alt="${escapeHtml(p.name)}" onerror="this.parentElement.innerHTML='<div class=\\'price-card-img\\'>📦</div>'">` : `<div class="price-card-img">📦</div>`}
              <div class="price-card-title-box">
                <div class="price-card-name">${escapeHtml(p.name)}</div>
                <div class="price-card-meta">
                  <span>ĐVT: <strong>${escapeHtml(p.unit || 'cái')}</strong></span>
                  ${p.category_name ? `<span>• ${escapeHtml(p.category_name)}</span>` : ''}
                </div>
                <div style="margin-top:6px;">
                  <span class="stock-badge ${isOutOfStock ? 'out-of-stock' : 'in-stock'}">
                    ${isOutOfStock ? '🔴 Hết hàng' : `🟢 Tồn kho: ${p.stock} ${escapeHtml(p.unit || 'cái')}`}
                  </span>
                </div>
              </div>
            </div>

            <!-- Big Price Display -->
            <div class="price-highlight-box">
              <div class="price-label-sub">GIÁ BÁN HIỆN TẠI</div>
              <div class="price-amount-big">${formatPrice(p.price)}</div>
              ${p.sale_price && p.sale_price > 0 && p.sale_price < p.price ? `
                <div style="font-size:0.75rem; color:var(--text-muted); text-decoration:line-through; margin-top:2px;">
                  Giá gốc: ${formatPrice(p.sale_price)}
                </div>
              ` : ''}
            </div>

            <!-- Details Grid -->
            <div class="price-details-grid">
              <div class="price-detail-item">
                <div class="pdi-label">MÃ VẠCH (BARCODE)</div>
                <div class="pdi-val" style="font-family:monospace; font-size:0.8rem; user-select:all;">
                  ${escapeHtml(p.barcode || '—')}
                </div>
              </div>
              <div class="price-detail-item">
                <div class="pdi-label">HẠN SỬ DỤNG (HSD)</div>
                <div class="pdi-val" style="font-size:0.8rem; color:${isExpired ? 'var(--red-primary)' : isExpiringSoon ? 'var(--orange-primary)' : 'inherit'};">
                  ${p.expiry_date ? `${p.expiry_date} ${isExpired ? '⚠️ Đã hết hạn' : isExpiringSoon ? '⏰ Sắp hết' : '✓ Còn hạn'}` : 'Không áp dụng'}
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex; gap:10px; margin-top:4px;">
              <button type="button" class="btn btn-secondary" onclick="resetPriceCheck()" style="flex:1;">
                🔄 Quét tiếp
              </button>
              <button type="button" class="btn btn-primary" onclick="sendToPosCart('${escapeHtml(p.barcode)}', '${escapeHtml(p.name)}')" style="flex:1.3;">
                🛒 Thêm vào POS
              </button>
            </div>
          </div>
        `;
        container.style.display = 'block';

        addRecentPriceCheck(p);
      } else {
        const queryText = data.query || data.code || '';
        container.innerHTML = `
          <div class="card" style="text-align:center; padding:22px; animation:slideUp 0.2s ease;">
            <div style="font-size:2.4rem; margin-bottom:8px;">🔍</div>
            <div style="font-size:1rem; font-weight:700; color:var(--text-dark); margin-bottom:4px;">Không tìm thấy hàng hóa</div>
            <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:14px;">
              Mã/Tên: <strong style="color:var(--text-dark);">${escapeHtml(queryText)}</strong> chưa có trong hệ thống cửa hàng.
            </div>
            <div style="display:flex; gap:10px; justify-content:center;">
              <button type="button" class="btn btn-secondary" onclick="resetPriceCheck()">
                🔄 Tra mã khác
              </button>
              <button type="button" class="btn btn-success" onclick="goToAddProductWithBarcode('${escapeHtml(queryText)}')">
                ➕ Thêm mới SP này
              </button>
            </div>
          </div>
        `;
        container.style.display = 'block';
      }
    }

    function resetPriceCheck() {
      const container = document.getElementById('priceResultContainer');
      const input = document.getElementById('manualCheckInput');
      if (container) container.style.display = 'none';
      if (input) {
        input.value = '';
        input.focus();
      }
    }

    function sendToPosCart(barcode, name) {
      if (!barcode) return;
      sendBarcode(barcode, 'PRICE_CHECK_ADD');
      showNotification(`✓ Đã đưa "${name || barcode}" vào giỏ hàng POS!`, 'success');
    }

    function goToAddProductWithBarcode(barcode) {
      pendingAddBarcode = barcode;
      switchPage('add');
      const addInput = document.getElementById('addBarcode');
      if (addInput) {
        addInput.value = barcode;
        addInput.focus();
      }
    }

    function addRecentPriceCheck(p) {
      recentPriceChecks = recentPriceChecks.filter(item => item.id !== p.id);
      recentPriceChecks.unshift({
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        price: p.price,
        stock: p.stock,
        unit: p.unit,
        time: new Date().toLocaleTimeString('vi-VN')
      });
      if (recentPriceChecks.length > 5) recentPriceChecks.pop();
      renderRecentPriceChecks();
    }

    function renderRecentPriceChecks() {
      const card = document.getElementById('recentChecksCard');
      const list = document.getElementById('recentChecksList');
      if (!card || !list) return;

      if (recentPriceChecks.length === 0) {
        card.style.display = 'none';
        return;
      }

      card.style.display = 'block';
      list.innerHTML = recentPriceChecks.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:var(--bg-main); border-radius:8px; font-size:0.82rem; cursor:pointer;" onclick="checkProductPrice('${escapeHtml(item.barcode)}')">
          <div style="min-width:0; flex:1;">
            <div style="font-weight:700; color:var(--text-dark); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.name)}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(item.barcode)} • ${item.time}</div>
          </div>
          <div style="text-align:right; margin-left:12px; flex-shrink:0;">
            <div style="font-weight:800; color:var(--blue-primary);">${formatPrice(item.price)}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Kho: ${item.stock} ${item.unit || ''}</div>
          </div>
        </div>
      `).join('');
    }

    // ==================== NOTIFICATIONS ====================
    function showNotification(message, type = 'info') {
      // Simple inline notification
      const colors = {
        success: { bg: 'var(--green-light)', color: 'var(--green-dark)', border: 'rgba(0,184,148,0.3)' },
        error: { bg: 'var(--red-light)', color: 'var(--red-primary)', border: 'rgba(238,90,36,0.3)' },
        info: { bg: 'var(--blue-light)', color: 'var(--blue-primary)', border: 'rgba(0,102,204,0.3)' }
      };
      const c = colors[type] || colors.info;

      const notif = document.createElement('div');
      notif.style.cssText = `
        position: fixed; top: 80px; left: 16px; right: 16px; z-index: 999;
        padding: 12px 16px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;
        background: ${c.bg}; color: ${c.color}; border: 1px solid ${c.border};
        animation: slideUp 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        text-align: center; max-width: 480px; margin: 0 auto;
      `;
      notif.textContent = message;
      document.body.appendChild(notif);

      setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.3s';
        setTimeout(() => notif.remove(), 300);
      }, 3000);
    }

    // ==================== UTILS ====================
    function formatPrice(amount) {
      if (!amount && amount !== 0) return '0₫';
      return new Intl.NumberFormat('vi-VN', { style: 'decimal', maximumFractionDigits: 0 }).format(amount) + '₫';
    }

    function formatClientImageUrl(img) {
      if (!img || typeof img !== 'string') return '';
      img = img.trim();
      if (!img) return '';
      if (img.startsWith('data:') || img.startsWith('blob:') || img.startsWith('http://') || img.startsWith('https://')) {
        return img;
      }
      let clean = img.replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^(\.[\/\\])+/, '');
      return clean.startsWith('/') ? clean : '/' + clean;
    }

    function escapeHtml(text) {
      if (!text) return '';
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    // ==================== BATCH SCAN & COOLDOWN (SC-02) ====================
    function toggleBatchMode(enabled) {
      isBatchMode = Boolean(enabled);
      const card = document.getElementById('batchSwitchCard');
      const badge = document.getElementById('batchBadge');
      const chk = document.getElementById('chkBatchMode');
      if (chk) chk.checked = isBatchMode;

      if (card) {
        if (isBatchMode) card.classList.add('active');
        else card.classList.remove('active');
      }
      if (badge) {
        badge.textContent = isBatchMode ? 'BẬT' : 'TẮT';
        badge.style.background = isBatchMode ? '#10b981' : '#e0f2fe';
        badge.style.color = isBatchMode ? '#ffffff' : '#0369a1';
      }

      updateBatchUI();
      if (isBatchMode) {
        showNotification('📦 Đã bật chế độ Gom Hàng (Batch Scan). Quét liên tục nhiều món!', 'info');
      }
    }

    function triggerCooldownIndicator(durationMs = 1800) {
      const barWrap = document.getElementById('cooldownBarWrap');
      const barFill = document.getElementById('cooldownBarFill');
      if (!barWrap || !barFill) return;

      barWrap.style.display = 'block';
      barFill.style.transition = 'none';
      barFill.style.width = '100%';

      void barFill.offsetWidth; // force reflow

      barFill.style.transition = `width ${durationMs}ms linear`;
      barFill.style.width = '0%';

      setTimeout(() => {
        if (barWrap) barWrap.style.display = 'none';
      }, durationMs);
    }

    function showBatchToast(msg) {
      const badge = document.getElementById('batchToastBadge');
      if (!badge) return;
      badge.textContent = msg;
      badge.style.display = 'block';
      clearTimeout(badge._timer);
      badge._timer = setTimeout(() => {
        badge.style.display = 'none';
      }, 1400);
    }

    async function handleBatchBarcode(code) {
      if (!code) return;

      const existing = batchItems.find(item => item.code === code);
      if (existing) {
        existing.quantity++;
        playTone('duplicate');
        if (navigator.vibrate) navigator.vibrate([70, 40, 70]);
        showBatchToast(`+1 ${existing.name || code} (x${existing.quantity})`);
      } else {
        let name = `Sản phẩm (${code.slice(-4)})`;
        let price = 0;

        try {
          const res = await fetch('/api/check-price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          const data = await res.json();
          if (data && data.found && data.product) {
            name = data.product.name;
            price = data.product.sale_price || data.product.price || 0;
          }
        } catch (_) {}

        batchItems.push({
          code,
          name,
          price,
          quantity: 1,
          timestamp: Date.now()
        });
        playTone('success');
        if (navigator.vibrate) navigator.vibrate(100);
        showBatchToast(`+1 Đã gom: ${name}`);
      }

      updateBatchUI();
    }

    function updateBatchUI() {
      const totalCount = batchItems.reduce((s, i) => s + (i.quantity || 1), 0);
      const totalMoney = batchItems.reduce((s, i) => s + ((i.quantity || 1) * (i.price || 0)), 0);

      const floatBar = document.getElementById('batchFloatingBar');
      const countEl = document.getElementById('batchBarCount');
      const totalEl = document.getElementById('batchBarTotal');
      const drawerBadge = document.getElementById('drawerItemCountBadge');
      const drawerMoney = document.getElementById('drawerTotalMoney');

      if (countEl) countEl.textContent = `📦 Đã gom: ${totalCount} món`;
      if (totalEl) totalEl.textContent = `Tổng: ${formatPrice(totalMoney)}`;
      if (drawerBadge) drawerBadge.textContent = `${totalCount} sản phẩm`;
      if (drawerMoney) drawerMoney.textContent = formatPrice(totalMoney);

      if (floatBar) {
        if (isBatchMode || batchItems.length > 0) {
          floatBar.style.display = 'flex';
        } else {
          floatBar.style.display = 'none';
        }
      }

      renderBatchDrawerItems();
    }

    function renderBatchDrawerItems() {
      const listEl = document.getElementById('batchDrawerList');
      if (!listEl) return;

      if (batchItems.length === 0) {
        listEl.innerHTML = '<div class="empty-state">Chưa có sản phẩm nào trong đợt quét này</div>';
        return;
      }

      listEl.innerHTML = batchItems.map((item, idx) => `
        <div class="batch-drawer-item">
          <div class="batch-item-info">
            <div class="batch-item-name">${escapeHtml(item.name)}</div>
            <div class="batch-item-meta">${escapeHtml(item.code)} • ${item.price > 0 ? formatPrice(item.price) : 'Chưa có giá'}</div>
          </div>
          <div class="batch-item-controls">
            <button type="button" class="batch-qty-btn" onclick="updateBatchItemQty(${idx}, -1)">−</button>
            <span class="batch-qty-val">${item.quantity}</span>
            <button type="button" class="batch-qty-btn" onclick="updateBatchItemQty(${idx}, 1)">+</button>
            <button type="button" class="batch-btn-del" onclick="removeBatchItem(${idx})" title="Xóa món">🗑️</button>
          </div>
        </div>
      `).join('');
    }

    function openBatchDrawer() {
      const drawer = document.getElementById('batchDrawerOverlay');
      if (drawer) {
        renderBatchDrawerItems();
        drawer.style.display = 'flex';
      }
    }

    function closeBatchDrawer() {
      const drawer = document.getElementById('batchDrawerOverlay');
      if (drawer) drawer.style.display = 'none';
    }

    function updateBatchItemQty(index, delta) {
      if (!batchItems[index]) return;
      batchItems[index].quantity += delta;
      if (batchItems[index].quantity <= 0) {
        batchItems.splice(index, 1);
      }
      updateBatchUI();
    }

    function removeBatchItem(index) {
      if (batchItems[index]) {
        batchItems.splice(index, 1);
        updateBatchUI();
      }
    }

    function clearBatchItems() {
      if (batchItems.length === 0) return;
      if (confirm('Xóa toàn bộ các sản phẩm đã gom trong đợt này?')) {
        batchItems = [];
        updateBatchUI();
        closeBatchDrawer();
      }
    }

    async function sendBatchToPos() {
      if (batchItems.length === 0) {
        showNotification('Chưa có sản phẩm nào để gửi!', 'error');
        return;
      }

      const count = batchItems.reduce((s, i) => s + (i.quantity || 1), 0);
      let sent = false;

      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'batch_barcodes',
            items: batchItems
          }));
          sent = true;
        } catch (_) {}
      }

      if (!sent) {
        try {
          const res = await fetch('/api/batch-scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: batchItems })
          });
          const data = await res.json();
          if (data && data.success) sent = true;
        } catch (e) {
          console.warn('Batch send HTTP error:', e);
        }
      }

      if (sent) {
        playTone('success');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        showNotification(`🚀 Đã gửi thành công ${count} sản phẩm vào giỏ hàng POS!`, 'success');
        batchItems = [];
        updateBatchUI();
        closeBatchDrawer();
      } else {
        playTone('error');
        showNotification('Lỗi kết nối khi gửi về POS. Vui lòng kiểm tra WiFi!', 'error');
      }
    }

    // ==================== PWA INSTALL & SERVICE WORKER (SC-01) ====================
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          console.log('[PWA] Service Worker registered with scope:', reg.scope);
        }).catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
      });
    }

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.style.display = 'flex';
    });

    function installPwaApp() {
      if (!deferredPrompt) {
        showNotification('Ứng dụng đã sẵn sàng hoặc hãy dùng "Thêm vào MH chính" trên trình duyệt', 'info');
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          const banner = document.getElementById('pwaInstallBanner');
          if (banner) banner.style.display = 'none';
        }
        deferredPrompt = null;
      });
    }

    // Export global handlers for HTML inline attributes
    window.toggleBatchMode = toggleBatchMode;
    window.openBatchDrawer = openBatchDrawer;
    window.closeBatchDrawer = closeBatchDrawer;
    window.updateBatchItemQty = updateBatchItemQty;
    window.removeBatchItem = removeBatchItem;
    window.clearBatchItems = clearBatchItems;
    window.sendBatchToPos = sendBatchToPos;
    window.installPwaApp = installPwaApp;
    window.playTone = playTone;

    // ==================== INIT ====================
    connectWS();