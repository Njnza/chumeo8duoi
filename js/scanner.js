/* ============================================
   SCANNER - QR/Barcode Scanner Logic
   ============================================ */

let html5QrCode = null;
let isScanning = false;
let lastScannedCode = '';

/**
 * Initialize the scanner page
 */
function initScanner() {
  loadCategories();
  
  // Check if html5-qrcode is loaded
  if (typeof Html5Qrcode === 'undefined') {
    document.getElementById('scannerStatus').innerHTML = `
      <div class="toast error" style="position:static; pointer-events:auto;">
        <div class="toast-icon"><i data-lucide="alert-triangle"></i></div>
        <div class="toast-content">
          <div class="toast-title">Thư viện QR chưa tải</div>
          <div class="toast-message">Kiểm tra kết nối mạng và thử lại</div>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  html5QrCode = new Html5Qrcode('qr-reader');
}

/**
 * Start scanning
 */
async function startScanning() {
  if (isScanning) return;

  const config = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.ITF,
    ]
  };

  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      onScanSuccess,
      onScanFailure
    );
    
    isScanning = true;
    document.getElementById('btnStart').classList.add('hidden');
    document.getElementById('btnStop').classList.remove('hidden');
    document.getElementById('scannerStatus').innerHTML = `
      <div class="badge badge-success"><i data-lucide="radio" style="width:14px;height:14px;"></i> Đang quét...</div>
    `;
    lucide.createIcons();
    toast.info('Camera đã bật', 'Hướng camera vào mã QR hoặc Barcode');
  } catch (err) {
    console.error('Camera error:', err);
    toast.error('Lỗi camera', 'Không thể truy cập camera. Kiểm tra quyền truy cập.');
    
    document.getElementById('scannerStatus').innerHTML = `
      <div class="badge badge-danger">Không thể bật camera</div>
      <p class="text-muted mt-sm" style="font-size:0.8rem;">Hãy cấp quyền camera cho trình duyệt và thử lại.</p>
    `;
  }
}

/**
 * Stop scanning
 */
async function stopScanning() {
  if (!isScanning) return;
  
  try {
    await html5QrCode.stop();
    isScanning = false;
    document.getElementById('btnStart').classList.remove('hidden');
    document.getElementById('btnStop').classList.add('hidden');
    document.getElementById('scannerStatus').innerHTML = `
      <div class="badge badge-info">Camera đã tắt</div>
    `;
  } catch (err) {
    console.error('Stop error:', err);
  }
}

/**
 * On successful QR/Barcode scan
 */
function onScanSuccess(decodedText, decodedResult) {
  // Prevent duplicate scans
  if (decodedText === lastScannedCode) return;
  lastScannedCode = decodedText;
  
  // Vibrate on mobile
  if (navigator.vibrate) {
    navigator.vibrate(200);
  }
  
  // Play beep sound
  playBeep();
  
  // Show scanned result
  const resultDiv = document.getElementById('scanResult');
  resultDiv.classList.remove('hidden');
  document.getElementById('scannedValue').textContent = decodedText;
  document.getElementById('scanFormat').textContent = decodedResult.result.format?.formatName || 'Unknown';
  
  // Try to parse as JSON (for QR codes with product data)
  let productData = null;
  try {
    productData = JSON.parse(decodedText);
  } catch (e) {
    // Not JSON, treat as SKU/barcode
  }
  
  // Fill form
  const form = document.getElementById('productForm');
  form.classList.remove('hidden');
  
  if (productData && typeof productData === 'object') {
    // QR code contains JSON product data
    document.getElementById('prodSku').value = productData.sku || productData.SKU || decodedText;
    document.getElementById('prodName').value = productData.name || productData.Name || '';
    document.getElementById('prodDescription').value = productData.description || productData.Description || '';
    document.getElementById('prodPrice').value = productData.price || productData.Price || '';
    document.getElementById('prodSalePrice').value = productData.salePrice || productData.SalePrice || '';
    document.getElementById('prodCategory').value = productData.category || productData.Category || '';
    document.getElementById('prodStock').value = productData.stock || productData.Stock || '';
    document.getElementById('prodImageUrl').value = productData.imageUrl || productData.ImageURL || '';
    
    toast.success('Dữ liệu đã nhận', 'Thông tin sản phẩm từ QR code đã được điền tự động');
  } else {
    // Simple barcode/SKU
    document.getElementById('prodSku').value = decodedText;
    // Clear other fields
    document.getElementById('prodName').value = '';
    document.getElementById('prodDescription').value = '';
    document.getElementById('prodPrice').value = '';
    document.getElementById('prodSalePrice').value = '';
    document.getElementById('prodCategory').value = '';
    document.getElementById('prodStock').value = '';
    document.getElementById('prodImageUrl').value = '';
    
    toast.info('Mã đã quét', `Mã: ${decodedText}. Vui lòng nhập thêm thông tin sản phẩm.`);
    
    // Try to look up existing product
    lookupProduct(decodedText);
  }
  
  // Scroll to form
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  // Reset duplicate detection after 3 seconds
  setTimeout(() => { lastScannedCode = ''; }, 3000);
}

function onScanFailure(error) {
  // Silence - this fires continuously when no code is detected
}

/**
 * Look up existing product by SKU
 */
async function lookupProduct(sku) {
  try {
    let result;
    if (isApiConfigured()) {
      result = await api.getProduct(sku);
    } else {
      const product = DEMO_DATA.products.find(p => p.SKU === sku || p.ID === sku);
      result = product ? { success: true, data: product } : { success: false };
    }
    
    if (result.success && result.data) {
      const p = result.data;
      document.getElementById('prodName').value = p.Name || '';
      document.getElementById('prodDescription').value = p.Description || '';
      document.getElementById('prodPrice').value = p.Price || '';
      document.getElementById('prodSalePrice').value = p.SalePrice || '';
      document.getElementById('prodCategory').value = p.Category || '';
      document.getElementById('prodStock').value = p.Stock || '';
      document.getElementById('prodImageUrl').value = p.ImageURL || '';
      
      // Mark as existing product
      document.getElementById('prodId').value = p.ID;
      document.getElementById('formTitle').textContent = '✏️ Cập Nhật Sản Phẩm';
      document.getElementById('btnSubmit').innerHTML = '<i data-lucide="save"></i> Cập Nhật';
      lucide.createIcons();
      
      toast.info('Sản phẩm đã tồn tại', `${p.Name} - Bạn có thể cập nhật thông tin.`);
    }
  } catch (e) {
    // Product not found, that's okay
  }
}

/**
 * Submit product to Google Sheets
 */
async function submitProduct(event) {
  event.preventDefault();
  
  const submitBtn = document.getElementById('btnSubmit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;border-width:2px;"></div> Đang xử lý...';
  
  const productData = {
    SKU: document.getElementById('prodSku').value.trim(),
    Name: document.getElementById('prodName').value.trim(),
    Description: document.getElementById('prodDescription').value.trim(),
    Price: document.getElementById('prodPrice').value,
    SalePrice: document.getElementById('prodSalePrice').value || 0,
    Category: document.getElementById('prodCategory').value,
    Stock: document.getElementById('prodStock').value || 0,
    ImageURL: document.getElementById('prodImageUrl').value.trim(),
    Status: 'active'
  };
  
  // Validation
  if (!productData.SKU) {
    toast.error('Thiếu thông tin', 'Vui lòng nhập mã SKU');
    resetSubmitBtn();
    return;
  }
  if (!productData.Name) {
    toast.error('Thiếu thông tin', 'Vui lòng nhập tên sản phẩm');
    resetSubmitBtn();
    return;
  }
  if (!productData.Price || productData.Price <= 0) {
    toast.error('Thiếu thông tin', 'Vui lòng nhập giá bán hợp lệ');
    resetSubmitBtn();
    return;
  }
  
  try {
    let result;
    const existingId = document.getElementById('prodId').value;
    
    if (isApiConfigured()) {
      if (existingId) {
        productData.ID = existingId;
        result = await api.updateProduct(productData);
      } else {
        result = await api.addProduct(productData);
      }
    } else {
      // Demo mode - simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));
      result = { success: true, message: `[Demo] Đã ${existingId ? 'cập nhật' : 'thêm'} sản phẩm: ${productData.Name}` };
    }
    
    if (result.success) {
      toast.success('Thành công! 🎉', result.message);
      
      // Add to history
      addToHistory(productData, existingId ? 'update' : 'add');
      
      // Reset form for next scan
      resetForm();
    } else {
      toast.error('Lỗi', result.error || 'Không thể lưu sản phẩm');
    }
  } catch (error) {
    toast.error('Lỗi kết nối', error.message);
  }
  
  resetSubmitBtn();
}

function resetSubmitBtn() {
  const submitBtn = document.getElementById('btnSubmit');
  submitBtn.disabled = false;
  submitBtn.innerHTML = '<i data-lucide="upload-cloud"></i> Đẩy Lên Google Sheets';
  lucide.createIcons();
}

function resetForm() {
  document.getElementById('productFormElement').reset();
  document.getElementById('prodId').value = '';
  document.getElementById('formTitle').textContent = '📦 Thông Tin Sản Phẩm';
  resetSubmitBtn();
}

/**
 * Manual SKU entry
 */
function manualEntry() {
  document.getElementById('scanResult').classList.add('hidden');
  document.getElementById('productForm').classList.remove('hidden');
  resetForm();
  document.getElementById('prodSku').focus();
  toast.info('Nhập thủ công', 'Bạn có thể nhập mã sản phẩm thủ công');
}

/**
 * Add to scan history
 */
function addToHistory(product, action) {
  const historyList = document.getElementById('historyList');
  const emptyState = document.getElementById('historyEmpty');
  
  if (emptyState) emptyState.classList.add('hidden');
  
  const item = document.createElement('div');
  item.className = 'cart-item animate-fadeIn';
  item.innerHTML = `
    <div class="cart-item-image">📦</div>
    <div class="cart-item-details">
      <div class="cart-item-name">${escapeHtml(product.Name)}</div>
      <div class="cart-item-price">${formatCurrency(product.Price)}</div>
      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
        SKU: ${escapeHtml(product.SKU)} | ${action === 'update' ? 'Cập nhật' : 'Thêm mới'}
      </div>
    </div>
    <span class="badge badge-${action === 'update' ? 'warning' : 'success'}">${action === 'update' ? 'Sửa' : 'Mới'}</span>
  `;
  
  historyList.insertBefore(item, historyList.firstChild);
}

/**
 * Load categories for the form dropdown
 */
async function loadCategories() {
  try {
    const result = await getData('categories');
    if (result.success && result.data) {
      const select = document.getElementById('prodCategory');
      // Keep the first empty option
      const defaultOption = select.options[0];
      select.innerHTML = '';
      select.appendChild(defaultOption);
      
      result.data.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.Name;
        option.textContent = cat.Name;
        select.appendChild(option);
      });
    }
  } catch (e) {
    console.log('Categories load error:', e);
  }
}

/**
 * Play beep sound on successful scan
 */
function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.value = 1200;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    // Audio not supported, ignore
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initScanner);
