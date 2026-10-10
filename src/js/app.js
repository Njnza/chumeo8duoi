/* ============================================
   Shop Desktop - App Core (Router, Utils)
   ============================================ */

// ==================== UTILS ====================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

// ==================== DYNAMIC THEME SYSTEM ====================
function hexToRgb(hex) {
  hex = (hex || '#364e68').replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function adjustBrightness(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + percent / 100;
  const newR = Math.min(255, Math.max(0, Math.round(r * factor)));
  const newG = Math.min(255, Math.max(0, Math.round(g * factor)));
  const newB = Math.min(255, Math.max(0, Math.round(b * factor)));
  return `#${((1 << 24) + (newR << 16) + (newG << 8) + newB).toString(16).slice(1)}`;
}

function applyThemeColor(hexColor, saveToDb = false) {
  if (!hexColor || !/^#[0-9a-fA-F]{6}$/i.test(hexColor)) return;
  const { r, g, b } = hexToRgb(hexColor);
  const hoverColor = adjustBrightness(hexColor, -14);
  const darkColor = adjustBrightness(hexColor, -28);
  const cyanColor = adjustBrightness(hexColor, 22);

  const root = document.documentElement;
  root.style.setProperty('--accent', hexColor);
  root.style.setProperty('--accent-hover', hoverColor);
  root.style.setProperty('--accent-dark', darkColor);
  root.style.setProperty('--accent-light', `rgba(${r}, ${g}, ${b}, 0.12)`);
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.25)`);
  root.style.setProperty('--cyan', cyanColor);
  root.style.setProperty('--cyan-light', `rgba(${r}, ${g}, ${b}, 0.15)`);
  root.style.setProperty('--info', hexColor);
  root.style.setProperty('--info-bg', `rgba(${r}, ${g}, ${b}, 0.12)`);
  root.style.setProperty('--shadow-glow', `0 0 16px rgba(${r}, ${g}, ${b}, 0.2)`);
  root.style.setProperty('--titlebar-bg', hexColor);
  root.style.setProperty('--sidebar-bg', hexColor);
  root.style.setProperty('--sidebar-active-bg', darkColor);

  localStorage.setItem('shoppro_theme_color', hexColor);

  if (saveToDb && window.api && typeof window.api.setSetting === 'function') {
    window.api.setSetting('theme_color', hexColor).catch(err => console.error('Failed to save theme color:', err));
  }
}

function getCurrentThemeColor() {
  return localStorage.getItem('shoppro_theme_color') || '#364e68';
}

window.applyThemeColor = applyThemeColor;
window.getCurrentThemeColor = getCurrentThemeColor;

// Apply saved theme color immediately to prevent flash of wrong colors
const _initSavedTheme = localStorage.getItem('shoppro_theme_color') || '#364e68';
applyThemeColor(_initSavedTheme, false);

async function initThemeFromDb() {
  try {
    if (window.api && typeof window.api.getSetting === 'function') {
      const dbColor = await window.api.getSetting('theme_color');
      if (dbColor && /^#[0-9a-fA-F]{6}$/i.test(dbColor)) {
        applyThemeColor(dbColor, false);
      }
      const dbThemeMode = await window.api.getSetting('theme_mode');
      if (dbThemeMode) {
        applyThemeMode(dbThemeMode, false);
      }
    }
  } catch (err) {
    console.error('Error loading theme from DB:', err);
  }
}

// ==================== LIGHT / DARK MODE SYSTEM (E1) ====================
function getThemeMode() {
  return localStorage.getItem('shoppro_theme_mode') || 'light';
}

function applyThemeMode(mode, saveToDb = false) {
  const root = document.documentElement;
  const isDark = mode === 'dark';
  root.setAttribute('data-theme-mode', isDark ? 'dark' : 'light');

  const iconEl = document.getElementById('themeModeIcon');
  if (iconEl) {
    iconEl.textContent = isDark ? '☀️' : '🌙';
  }
  const btnEl = document.getElementById('themeModeToggleBtn');
  if (btnEl) {
    btnEl.title = isDark ? 'Chuyển sang chế độ Sáng (Light Mode)' : 'Chuyển sang chế độ Tối (Dark Mode)';
  }

  localStorage.setItem('shoppro_theme_mode', isDark ? 'dark' : 'light');
  if (saveToDb && window.api && typeof window.api.setSetting === 'function') {
    window.api.setSetting('theme_mode', isDark ? 'dark' : 'light').catch(() => {});
  }
}

function toggleThemeMode() {
  const current = getThemeMode();
  const next = current === 'dark' ? 'light' : 'dark';
  applyThemeMode(next, true);
  if (typeof showToast === 'function') {
    showToast('info', next === 'dark' ? 'Chế độ Tối' : 'Chế độ Sáng', next === 'dark' ? 'Đã kích hoạt Dark Mode' : 'Đã kích hoạt Light Mode');
  }
}

window.getThemeMode = getThemeMode;
window.applyThemeMode = applyThemeMode;
window.toggleThemeMode = toggleThemeMode;

// Apply immediately
applyThemeMode(getThemeMode(), false);

// ==================== STATE ====================
let currentPage = 'pos';
const pageModules = {};

// ==================== ROUTER ====================
function _doNavigateTo(pageName) {
  // Remove active from all nav items
  document.querySelectorAll('.nav-link, .sidebar-item').forEach(item => {
    item.classList.remove('active');
  });

  // Set active on matching top nav or sidebar
  document.querySelectorAll(`.nav-link[data-page="${pageName}"], .sidebar-item[data-page="${pageName}"]`).forEach(item => {
    item.classList.add('active');
  });

  currentPage = pageName;

  // Render page
  const content = document.getElementById('contentArea');
  content.innerHTML = '';

  const pageDiv = document.createElement('div');
  pageDiv.className = 'page active';
  pageDiv.id = `page-${pageName}`;

  // Call page render function
  if (pageModules[pageName] && typeof pageModules[pageName].render === 'function') {
    pageDiv.innerHTML = pageModules[pageName].render();
    content.appendChild(pageDiv);

    // Call init after DOM is ready
    if (typeof pageModules[pageName].init === 'function') {
      setTimeout(() => pageModules[pageName].init(), 0);
    }
  } else {
    pageDiv.innerHTML = `<div class="empty-state"><h3>Module "${pageName}" chưa sẵn sàng</h3></div>`;
    content.appendChild(pageDiv);
  }
}

function navigateTo(pageName) {
  if (currentUser && currentUser.role === 'staff' && (pageName === 'reports' || pageName === 'settings')) {
    promptOwnerPin(`Truy cập ${pageName === 'reports' ? 'Báo Cáo Doanh Thu & Lợi Nhuận' : 'Cài Đặt Hệ Thống'}`).then(ok => {
      if (ok) {
        _doNavigateTo(pageName);
      } else {
        showToast('warning', 'Quyền hạn bị giới hạn', 'Chức năng này chỉ dành riêng cho Chủ Cửa Hàng');
      }
    });
    return;
  }
  _doNavigateTo(pageName);
}

function registerPage(name, module) {
  pageModules[name] = module;
}

// ==================== USER & AUTH STATE ====================
let currentUser = null;

function getCurrentUser() {
  if (currentUser) return currentUser;
  try {
    const saved = sessionStorage.getItem('shoppro_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      return currentUser;
    }
  } catch (_) {}
  return null;
}
window.getCurrentUser = getCurrentUser;

async function initCurrentUser() {
  try {
    const saved = sessionStorage.getItem('shoppro_user');
    if (saved) {
      currentUser = JSON.parse(saved);
    } else {
      const users = await api.getUsers();
      if (Array.isArray(users) && users.length > 0) {
        currentUser = users.find(u => u.role === 'owner') || users[0];
        sessionStorage.setItem('shoppro_user', JSON.stringify(currentUser));
      }
    }
  } catch (err) {
    console.error('Init user error:', err);
  }
  updateUserUI();
}

function updateUserUI() {
  if (!currentUser) return;
  const avatarEl = document.getElementById('userAvatarIcon');
  const nameEl = document.getElementById('userNameLabel');
  const udhName = document.getElementById('udhName');
  const udhRole = document.getElementById('udhRole');

  const isOwner = currentUser.role === 'owner';
  if (avatarEl) avatarEl.textContent = isOwner ? '👑' : '🧑‍💼';
  if (nameEl) nameEl.innerHTML = `Xin chào, <strong>${escapeHtml(currentUser.name)} ▾</strong>`;
  if (udhName) udhName.textContent = currentUser.name;
  if (udhRole) {
    udhRole.innerHTML = isOwner 
      ? '<span class="badge badge-success">👑 Chủ Cửa Hàng</span>' 
      : '<span class="badge badge-default" style="background:#e0f2fe; color:#0369a1;">🧑‍💼 Thu Ngân</span>';
  }

  // Hide or show Owner-only tabs (Reports, Settings)
  document.querySelectorAll('.nav-link[data-page="reports"], .sidebar-item[data-page="reports"]').forEach(el => {
    el.style.display = isOwner ? '' : 'none';
  });
  document.querySelectorAll('.nav-link[data-page="settings"], .sidebar-item[data-page="settings"]').forEach(el => {
    el.style.display = isOwner ? '' : 'none';
  });

  // If currently on a forbidden page, go to pos
  if (!isOwner && (currentPage === 'reports' || currentPage === 'settings')) {
    _doNavigateTo('pos');
  }

  // If products page is currently open, re-render to apply staff restrictions
  if (currentPage === 'products' && pageModules.products && typeof pageModules.products.refresh === 'function') {
    pageModules.products.refresh();
  }
}

function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('userDropdownMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function closeUserMenu() {
  const menu = document.getElementById('userDropdownMenu');
  if (menu) menu.style.display = 'none';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#userProfileBadge') && !e.target.closest('#userDropdownMenu')) {
    closeUserMenu();
  }
});

// Lock Screen Logic
let currentLockPin = '';
function lockScreen() {
  closeUserMenu();
  const overlay = document.getElementById('lockScreenOverlay');
  const userSub = document.getElementById('lockUserName');
  const pinInput = document.getElementById('lockPinInput');
  if (overlay) overlay.style.display = 'flex';
  if (userSub && currentUser) {
    userSub.textContent = `Tài khoản: ${currentUser.name} (${currentUser.role === 'owner' ? 'Chủ Shop' : 'Thu Ngân'})`;
  }
  currentLockPin = '';
  if (pinInput) pinInput.value = '';
}

function appendLockPin(digit) {
  if (currentLockPin.length >= 6) return;
  currentLockPin += digit;
  const pinInput = document.getElementById('lockPinInput');
  if (pinInput) pinInput.value = '•'.repeat(currentLockPin.length);
  if (currentLockPin.length >= 4) {
    submitUnlock();
  }
}

function clearLockPin() {
  currentLockPin = '';
  const pinInput = document.getElementById('lockPinInput');
  if (pinInput) pinInput.value = '';
}

async function submitUnlock() {
  if (!currentLockPin) return;
  try {
    const ok = currentUser && currentUser.pin === currentLockPin;
    if (ok) {
      document.getElementById('lockScreenOverlay').style.display = 'none';
      currentLockPin = '';
      showToast('success', 'Mở khóa thành công', `Chào mừng trở lại, ${currentUser.name}`);
    } else {
      const isOwnerPin = await api.verifyOwnerPin(currentLockPin);
      if (isOwnerPin) {
        document.getElementById('lockScreenOverlay').style.display = 'none';
        currentLockPin = '';
        showToast('success', 'Mở khóa bằng mã Chủ Shop');
      } else {
        showToast('error', 'Mã PIN sai', 'Vui lòng nhập lại mã PIN');
        clearLockPin();
      }
    }
  } catch (err) {
    showToast('error', 'Lỗi', err.message);
    clearLockPin();
  }
}

// Switch user modal
async function openSwitchUserModal(fromLock = false) {
  closeUserMenu();
  try {
    const users = await api.getUsers();
    showModal(`
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h3>🔄 Đổi Ca / Chọn Tài Khoản</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">
            Chọn tài khoản nhân viên để chuyển ca:
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
            ${users.map(u => `
              <div class="card" style="padding:10px 14px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; border: 1.5px solid ${currentUser && currentUser.id === u.id ? 'var(--accent)' : 'var(--border)'}; background:${currentUser && currentUser.id === u.id ? 'var(--accent-light)' : 'var(--bg-card)'};" onclick="promptUserPinLogin(${u.id}, '${escapeHtml(u.name)}', '${u.role}')">
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:24px;">${u.role === 'owner' ? '👑' : '🧑‍💼'}</span>
                  <div>
                    <div style="font-weight:700; font-size:14px;">${escapeHtml(u.name)}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(u.username)} · ${u.role === 'owner' ? 'Chủ Shop' : 'Thu Ngân'}</div>
                  </div>
                </div>
                <div>
                  <span class="badge ${u.role === 'owner' ? 'badge-success' : 'badge-default'}">
                    ${u.role === 'owner' ? 'Chủ Shop' : 'Thu Ngân'}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
        </div>
      </div>
    `);
  } catch (err) {
    showToast('error', 'Lỗi tải danh sách người dùng', err.message);
  }
}

function promptUserPinLogin(userId, userName, role) {
  showModal(`
    <div class="modal" style="max-width:340px; text-align:center;">
      <div class="modal-header">
        <h3>🔑 Nhập PIN Đăng Nhập</h3>
        <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="padding: 16px 20px;">
        <div style="font-size:32px; margin-bottom:6px;">${role === 'owner' ? '👑' : '🧑‍💼'}</div>
        <div style="font-weight:700; font-size:16px;">${escapeHtml(userName)}</div>
        <div class="text-muted" style="font-size:12px; margin-bottom:16px;">Nhập mã PIN để vào ca làm việc</div>

        <input type="password" id="txtSwitchPin" maxlength="6" class="form-control" style="font-size:24px; text-align:center; letter-spacing:8px; height:46px;" placeholder="••••" autofocus onkeydown="if(event.key==='Enter') submitSwitchPin(${userId})">
      </div>
      <div class="modal-footer" style="justify-content:center; gap:10px;">
        <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
        <button class="btn btn-primary" onclick="submitSwitchPin(${userId})">Xác nhận</button>
      </div>
    </div>
  `);
  setTimeout(() => {
    const input = document.getElementById('txtSwitchPin');
    if (input) input.focus();
  }, 100);
}

async function submitSwitchPin(userId) {
  const pinInput = document.getElementById('txtSwitchPin');
  const pin = pinInput?.value?.trim();
  if (!pin) {
    showToast('warning', 'Chưa nhập mã PIN');
    return;
  }
  try {
    const user = await api.getUserById(userId);
    if (!user || user.pin !== pin) {
      showToast('error', 'Mã PIN không đúng');
      if (pinInput) { pinInput.value = ''; pinInput.focus(); }
      return;
    }
    currentUser = user;
    sessionStorage.setItem('shoppro_user', JSON.stringify(currentUser));
    updateUserUI();
    closeModal();
    const lockOverlay = document.getElementById('lockScreenOverlay');
    if (lockOverlay) lockOverlay.style.display = 'none';
    showToast('success', 'Đổi ca thành công', `Chào mừng ${user.name} (${user.role === 'owner' ? 'Chủ Shop' : 'Thu Ngân'})`);
    if (currentPage === 'pos' && pageModules.pos && pageModules.pos.init) {
      pageModules.pos.init();
    }
  } catch (err) {
    showToast('error', 'Lỗi xác thực', err.message);
  }
}

// Prompt owner PIN for high-privilege actions
function promptOwnerPin(purpose = 'Thực hiện thao tác này') {
  return new Promise((resolve) => {
    if (currentUser && currentUser.role === 'owner') {
      resolve(true);
      return;
    }

    showModal(`
      <div class="modal" style="max-width:340px; text-align:center;">
        <div class="modal-header">
          <h3>👑 Quyền Chủ Cửa Hàng</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal();">✕</button>
        </div>
        <div class="modal-body" style="padding:16px 20px;">
          <div style="font-size:32px; margin-bottom:6px;">🔒</div>
          <div style="font-weight:700; font-size:14px; margin-bottom:4px;">Yêu cầu xác thực Chủ Shop</div>
          <div class="text-secondary" style="font-size:12px; margin-bottom:14px;">${escapeHtml(purpose)}</div>

          <input type="password" id="txtOwnerPinPrompt" maxlength="6" class="form-control" style="font-size:24px; text-align:center; letter-spacing:8px; height:46px;" placeholder="••••" autofocus>
        </div>
        <div class="modal-footer" style="justify-content:center; gap:10px;">
          <button class="btn btn-outline" id="btnCancelOwnerPin">Hủy</button>
          <button class="btn btn-primary" id="btnConfirmOwnerPin">Xác thực</button>
        </div>
      </div>
    `);

    setTimeout(() => {
      const input = document.getElementById('txtOwnerPinPrompt');
      if (input) input.focus();
    }, 100);

    const handleConfirm = async () => {
      const pin = document.getElementById('txtOwnerPinPrompt')?.value?.trim();
      if (!pin) {
        showToast('warning', 'Vui lòng nhập mã PIN');
        return;
      }
      try {
        const ok = await api.verifyOwnerPin(pin);
        if (ok) {
          closeModal();
          showToast('success', 'Xác thực thành công');
          resolve(true);
        } else {
          showToast('error', 'Mã PIN Chủ Shop không chính xác');
        }
      } catch (err) {
        showToast('error', 'Lỗi xác thực', err.message);
      }
    };

    document.getElementById('btnConfirmOwnerPin')?.addEventListener('click', handleConfirm);
    document.getElementById('txtOwnerPinPrompt')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleConfirm();
    });
    document.getElementById('btnCancelOwnerPin')?.addEventListener('click', () => {
      closeModal();
      resolve(false);
    });
  });
}

function openChangePinModal() {
  closeUserMenu();
  if (!currentUser) return;
  showModal(`
    <div class="modal" style="max-width:360px;">
      <div class="modal-header">
        <h3>🔑 Đổi Mã PIN Cá Nhân</h3>
        <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group mb-md">
          <label class="form-label">MÃ PIN HIỆN TẠI</label>
          <input type="password" class="form-control" id="txtCurrentPin" maxlength="6" placeholder="••••">
        </div>
        <div class="form-group mb-md">
          <label class="form-label">MÃ PIN MỚI (4 - 6 số)</label>
          <input type="password" class="form-control" id="txtNewPin" maxlength="6" placeholder="••••">
        </div>
        <div class="form-group mb-md">
          <label class="form-label">XÁC NHẬN MÃ PIN MỚI</label>
          <input type="password" class="form-control" id="txtConfirmPin" maxlength="6" placeholder="••••">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="submitChangePin()">Lưu PIN Mới</button>
      </div>
    </div>
  `);
}

async function submitChangePin() {
  const currentPin = document.getElementById('txtCurrentPin')?.value?.trim();
  const newPin = document.getElementById('txtNewPin')?.value?.trim();
  const confirmPin = document.getElementById('txtConfirmPin')?.value?.trim();

  if (!currentPin || !newPin || !confirmPin) {
    showToast('warning', 'Vui lòng điền đầy đủ thông tin');
    return;
  }
  if (currentPin !== currentUser.pin) {
    showToast('error', 'Mã PIN hiện tại không đúng');
    return;
  }
  if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
    showToast('warning', 'Mã PIN mới phải gồm 4 đến 6 chữ số');
    return;
  }
  if (newPin !== confirmPin) {
    showToast('warning', 'Mã PIN xác nhận không khớp');
    return;
  }

  try {
    await api.updateUser(currentUser.id, { pin: newPin });
    currentUser.pin = newPin;
    sessionStorage.setItem('shoppro_user', JSON.stringify(currentUser));
    closeModal();
    showToast('success', 'Đổi mã PIN thành công');
  } catch (err) {
    showToast('error', 'Lỗi đổi PIN', err.message);
  }
}

// ==================== CLOCK ====================
function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}

// ==================== TOAST ====================
function showToast(type, title, message = '', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==================== MODAL ====================
function showModal(content, options = {}) {
  const overlay = document.getElementById('modalOverlay');
  const container = document.getElementById('modalContainer');

  container.innerHTML = content;
  overlay.classList.add('active');
  container.classList.add('active');

  if (options.width) {
    container.querySelector('.modal').style.minWidth = options.width;
    container.querySelector('.modal').style.maxWidth = options.width;
  }
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  const container = document.getElementById('modalContainer');
  overlay.classList.remove('active');
  container.classList.remove('active');
}

// ==================== FORMAT HELPERS ====================
function formatProductImageUrl(img) {
  if (!img || typeof img !== 'string') return '';
  img = img.trim();
  if (!img) return '';

  // Data URLs, blobs, or external HTTP/HTTPS URLs
  if (img.startsWith('data:') || img.startsWith('blob:') || img.startsWith('http://') || img.startsWith('https://')) {
    return img;
  }

  // File protocol
  if (img.startsWith('file://')) {
    return img;
  }

  // Normalize backslashes to forward slashes
  let normalized = img.replace(/\\/g, '/');

  // Strip leading redundant dots or slashes
  if (normalized.startsWith('../')) {
    return normalized;
  }
  if (normalized.startsWith('./')) {
    normalized = normalized.substring(2);
  }

  // If starts with /uploads/ or uploads/
  if (normalized.startsWith('/uploads/')) {
    return '..' + normalized; // '../uploads/...'
  }
  if (normalized.startsWith('uploads/')) {
    return '../' + normalized; // '../uploads/...'
  }

  // Windows absolute path like C:/ or D:/
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return 'file:///' + normalized;
  }

  // Relative path fallback (e.g. products/xxx.jpg)
  return '../' + normalized.replace(/^\/+/, '');
}
window.formatProductImageUrl = formatProductImageUrl;

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '0₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'decimal',
    maximumFractionDigits: 0
  }).format(amount) + '₫';
}
window.formatCurrency = formatCurrency;

function formatMoney(amount) {
  return formatCurrency(amount);
}
window.formatMoney = formatMoney;

function formatNumber(amount) {
  if (!amount && amount !== 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(date);
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function debounce(func, wait = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// ==================== SCANNER EVENTS ====================
function setupScannerEvents() {
  // Listen for barcode from phone scanner
  api.onBarcode((data) => {
    console.log('[Scanner] Barcode received:', data);
    const barcode = data && (typeof data === 'object' ? (data.code || data.barcode) : data);
    if (!barcode) return;

    // 1. If Desktop "Thêm Sản Phẩm Mới" or "Sửa Sản Phẩm" modal is currently open:
    const addBarcodeModalInput = document.getElementById('pBarcode');
    if (addBarcodeModalInput) {
      addBarcodeModalInput.value = barcode;
      const skuInput = document.getElementById('pSku');
      if (skuInput && !skuInput.value.trim()) {
        skuInput.value = barcode;
      }
      addBarcodeModalInput.style.borderColor = 'var(--accent)';
      addBarcodeModalInput.style.boxShadow = '0 0 0 4px var(--accent-light)';
      setTimeout(() => {
        addBarcodeModalInput.style.borderColor = '';
        addBarcodeModalInput.style.boxShadow = '';
      }, 1500);

      showToast('success', 'Đã nhận Barcode từ điện thoại!', barcode);
      return;
    }

    // 2. Otherwise route to POS
    if (currentPage !== 'pos') {
      navigateTo('pos');
    }
    setTimeout(() => {
      if (pageModules.pos && pageModules.pos.onBarcode) {
        pageModules.pos.onBarcode(barcode);
      }
    }, 50);
  });

  api.onScannerConnected((info) => {
    updateScannerStatus(true, info);
    showToast('success', 'Scanner đã kết nối', `Thiết bị: ${info.ip}`);
  });

  api.onScannerDisconnected(() => {
    updateScannerStatus(false);
  });

  // Handle add product submitted from phone scanner
  api.onAddProduct(async (data) => {
    console.log('[Scanner] Add product request from phone:', data);
    const p = data.product;
    if (!p || !p.barcode || !p.name) return;

    try {
      let catId = null;
      if (p.category) {
        const cats = await api.getCategories();
        const foundCat = cats.find(c => c.name.toLowerCase() === p.category.toLowerCase());
        if (foundCat) catId = foundCat.id;
      }

      await api.addProduct({
        sku: p.barcode,
        barcode: p.barcode,
        name: p.name,
        price: p.price || 0,
        cost_price: Math.round((p.price || 0) * 0.7),
        stock: p.stock || 10,
        category_id: catId,
        unit: p.unit || 'cái',
        image: p.image || p.image_url || '',
        status: 'active'
      });

      showToast('success', 'Đã thêm sản phẩm từ điện thoại!', `${p.name} (${p.barcode})`);
      if (pageModules.products && typeof pageModules.products.refresh === 'function') {
        pageModules.products.refresh();
      }
      if (pageModules.pos && typeof pageModules.pos.loadProducts === 'function') {
        pageModules.pos.loadProducts();
      }
    } catch (err) {
      showToast('error', 'Lỗi thêm sản phẩm từ điện thoại', err.message);
    }
  });

  // Handle product photo sent from phone camera
  if (api && typeof api.onProductPhoto === 'function') {
    api.onProductPhoto((data) => {
      console.log('[Scanner] Product photo received from phone:', data);
      if (!data || (!data.image && !data.relativePath)) return;

      const imgRef = data.relativePath || data.image;
      window.lastPhoneProductPhoto = data.image;
      window.lastPhoneProductPhotoPath = data.relativePath || '';

      // 1. If Add/Edit Product Modal is currently open:
      const pImgInput = document.getElementById('pImage');
      const pImgPreview = document.getElementById('pImagePreviewBox');
      if (pImgInput && pImgPreview) {
        pImgInput.value = imgRef;
        const displaySrc = formatProductImageUrl(data.image || imgRef);
        pImgPreview.innerHTML = `<img id="pImagePreviewImg" src="${escapeHtml(displaySrc)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='📦'">`;
        pImgPreview.style.borderColor = 'var(--accent)';
        pImgPreview.style.boxShadow = '0 0 0 4px var(--accent-light)';
        setTimeout(() => {
          pImgPreview.style.borderColor = '';
          pImgPreview.style.boxShadow = '';
        }, 1500);

        showToast('success', 'Đã lưu ảnh sản phẩm từ điện thoại!', data.relativePath ? `Đã lưu file: ${data.relativePath}` : 'Đã gán làm ảnh đại diện sản phẩm.');
        return;
      }

      // 2. If Modal is not open:
      showToast('success', 'Đã nhận ảnh từ điện thoại!', data.relativePath ? `Đã lưu vào ${data.relativePath}` : 'Ảnh đã sẵn sàng. Mở Thêm/Sửa sản phẩm để dùng.');
    });
  }

  // Click on scanner badge to open QR code modal
  const scannerStatusEl = document.getElementById('scannerStatus');
  if (scannerStatusEl) {
    scannerStatusEl.addEventListener('click', showScannerModal);
  }

  // Also handle USB barcode scanner (keyboard input)
  let barcodeBuffer = '';
  let barcodeTimeout = null;

  document.addEventListener('keydown', (e) => {
    // USB scanners typically send characters rapidly ending with Enter
    if (e.key === 'Enter' && barcodeBuffer.length > 3) {
      e.preventDefault();
      const code = barcodeBuffer.trim();
      barcodeBuffer = '';

      console.log('[USB Scanner] Barcode:', code);

      // 1. If Desktop "Thêm Sản Phẩm Mới" or "Sửa Sản Phẩm" modal is open:
      const addBarcodeModalInput = document.getElementById('pBarcode');
      if (addBarcodeModalInput) {
        addBarcodeModalInput.value = code;
        const skuInput = document.getElementById('pSku');
        if (skuInput && !skuInput.value.trim()) {
          skuInput.value = code;
        }
        addBarcodeModalInput.style.borderColor = 'var(--accent)';
        addBarcodeModalInput.style.boxShadow = '0 0 0 4px var(--accent-light)';
        setTimeout(() => {
          addBarcodeModalInput.style.borderColor = '';
          addBarcodeModalInput.style.boxShadow = '';
        }, 1500);
        showToast('success', 'Đã quét Barcode (USB)!', code);
        return;
      }

      // 2. Otherwise route to POS
      if (currentPage !== 'pos') {
        navigateTo('pos');
      }
      setTimeout(() => {
        if (pageModules.pos && pageModules.pos.onBarcode) {
          pageModules.pos.onBarcode(code);
        }
      }, 50);
      return;
    }

    // Don't capture if user is typing in an input
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

    if (!isTyping && e.key.length === 1) {
      barcodeBuffer += e.key;
      clearTimeout(barcodeTimeout);
      barcodeTimeout = setTimeout(() => { barcodeBuffer = ''; }, 100);
    }
  });
}

function updateScannerStatus(online, info = null) {
  const statusEl = document.getElementById('scannerStatus');
  if (!statusEl) return;

  const dot = statusEl.querySelector('.status-dot');
  const text = statusEl.querySelector('.status-text');

  if (online) {
    dot.className = 'status-dot online';
    text.textContent = `Scanner: Đã kết nối${info ? ` (${info.ip})` : ''}`;
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'Scanner: Chờ kết nối';
  }
}

async function showScannerModal() {
  try {
    const info = await api.getScannerInfo();
    const url = info && info.running ? `http://${info.ip}:${info.port}` : 'Server chưa chạy';
    let qrUrl = '';
    if (info && info.running && api.generateQRCode) {
      qrUrl = await api.generateQRCode(url);
    }
    if (!qrUrl && info && info.running) {
      qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    }

    const content = `
      <div class="modal" style="width: 500px; max-width: 95vw; background: var(--bg-card); border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.35);">
        <div class="modal-header">
          <h3>📱 Kết Nối Máy Quét Điện Thoại</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">${ICONS.x}</button>
        </div>
        <div class="modal-body" style="text-align: center; padding: 20px;">
          <div style="background: white; display: inline-block; padding: 12px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.12); margin-bottom: 16px;">
            ${qrUrl ? `<img src="${qrUrl}" alt="QR Code" width="180" height="180" style="display:block; border-radius:8px;">` : '<p style="color:#ef4444; font-weight:600;">Không thể tạo mã QR</p>'}
          </div>

          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
            Dùng camera điện thoại hoặc Zalo quét mã QR trên để mở trang quét barcode
          </p>

          <div style="background: var(--bg-tertiary); padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; border: 1px solid var(--border); text-align: left;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">LINK TRUY CẬP (ĐÃ CÓ CHỤP ẢNH QUÉT MÃ CHO IPHONE):</div>
            <code style="color: var(--accent); font-size: 14px; font-weight: 700; user-select: all;">${url}</code>
            ${info && info.httpsUrl ? `
              <div style="margin-top: 8px; font-size: 11px; color: var(--text-muted);">HOẶC LINK HTTPS (CHO LIVE VIDEO CAMERA LIÊN TỤC):</div>
              <code style="color: var(--accent); font-size: 13px; font-weight: 700; user-select: all;">${info.httpsUrl}</code>
            ` : ''}
          </div>

          <!-- ADD Mode Auth Section -->
          <div style="margin-top: 16px; padding: 14px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 10px; text-align: left;">
            <div style="font-size: 13px; font-weight: 700; color: #10b981; margin-bottom: 6px;">🔓 Cho phép thêm sản phẩm từ điện thoại</div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
              Tạo mã QR xác thực để cho phép điện thoại vào chế độ thêm sản phẩm mới. Mã hết hạn sau 5 phút.
            </p>
            <button class="btn btn-success" id="btnGenerateAddToken" onclick="generateAddTokenQR()" style="width: 100%;">
              🔑 Tạo mã xác thực ADD
            </button>
            <div id="addTokenQrContainer" style="display: none; margin-top: 12px; text-align: center;"></div>
          </div>

          <div style="font-size: 12px; color: var(--text-secondary); text-align: left; background: var(--accent-light); border-left: 3px solid var(--accent); padding: 10px 14px; border-radius: 4px; margin-top: 12px;">
            <strong>💡 Hướng dẫn cho iPhone (Safari):</strong><br>
            1. Đảm bảo điện thoại và máy tính kết nối <strong>cùng mạng Wi-Fi</strong>.<br>
            2. Mở link trên điện thoại ➔ Bấm nút <strong>"📸 Chụp ảnh quét mã"</strong> để chụp và quét ngay tức thì.<br>
            3. Sản phẩm sẽ tự động nhảy vào giỏ hàng POS!
          </div>
        </div>
        <div class="modal-footer" style="justify-content: flex-end;">
          <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
        </div>
      </div>
    `;

    showModal(content);
  } catch (err) {
    console.error('Error opening scanner modal:', err);
    showToast('danger', 'Lỗi', 'Không thể lấy thông tin scanner');
  }
}

/**
 * Generate ADD token QR code and display it
 */
async function generateAddTokenQR() {
  try {
    const result = await api.generateAddToken();
    if (!result || !result.token) {
      showToast('error', 'Lỗi', 'Không thể tạo mã xác thực');
      return;
    }

    const tokenData = JSON.stringify({
      type: 'shoppro_add_auth',
      token: result.token
    });

    let qrUrl = '';
    if (api.generateQRCode) {
      qrUrl = await api.generateQRCode(tokenData);
    }
    if (!qrUrl) {
      qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tokenData)}`;
    }

    const container = document.getElementById('addTokenQrContainer');
    container.style.display = 'block';
    container.innerHTML = `
      <div style="background: white; display: inline-block; padding: 10px; border-radius: 10px; box-shadow: 0 2px 12px rgba(16,185,129,0.3);">
        <img src="${qrUrl}" alt="ADD Auth QR" width="160" height="160" style="display:block; border-radius:6px; margin: 0 auto;">
      </div>
      <p style="font-size: 11.5px; color: #10b981; margin-top: 8px; font-weight: 700;">
        ✅ Mã xác thực đã tạo — Dùng điện thoại quét mã QR này
      </p>
      <p style="font-size: 11px; color: var(--text-muted);">Hết hạn sau 5 phút</p>
    `;

    const btn = document.getElementById('btnGenerateAddToken');
    if (btn) btn.textContent = '🔄 Tạo mã mới';
    
    showToast('success', 'Đã tạo mã xác thực', 'Dùng điện thoại quét mã QR để vào chế độ thêm sản phẩm');
  } catch (err) {
    console.error('Error generating add token:', err);
    showToast('error', 'Lỗi', err.message || 'Không thể tạo mã xác thực');
  }
}

// ==================== KEYBOARD SHORTCUTS ====================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (e.key === 'Escape') {
      closeModal();
      return;
    }

    if (isTyping) return;

    // F1 - POS
    if (e.key === 'F1') { e.preventDefault(); navigateTo('pos'); }
    // F2 - Focus Barcode / Search
    if (e.key === 'F2') {
      e.preventDefault();
      if (currentPage !== 'pos') navigateTo('pos');
      setTimeout(() => {
        const searchInput = document.getElementById('posSearchInput');
        if (searchInput) { searchInput.focus(); searchInput.select(); }
      }, 50);
    }
    // F3 - Quick add product
    if (e.key === 'F3') {
      e.preventDefault();
      if (currentPage === 'pos' && pageModules.pos && pageModules.pos.quickAddProductPrompt) {
        pageModules.pos.quickAddProductPrompt();
      }
    }
    // F4 - Customer search
    if (e.key === 'F4') {
      e.preventDefault();
      if (currentPage === 'pos' && pageModules.pos && pageModules.pos.focusCustomer) {
        pageModules.pos.focusCustomer();
      }
    }
    // F7 - Focus discount
    if (e.key === 'F7') {
      e.preventDefault();
      if (currentPage === 'pos' && pageModules.pos && pageModules.pos.focusDiscount) {
        pageModules.pos.focusDiscount();
      }
    }
    // F8 - Focus cash
    if (e.key === 'F8') {
      e.preventDefault();
      if (currentPage === 'pos' && pageModules.pos && pageModules.pos.focusCash) {
        pageModules.pos.focusCash();
      }
    }
    // F9 - Save order
    if (e.key === 'F9') {
      e.preventDefault();
      if (currentPage === 'pos' && pageModules.pos && pageModules.pos.saveOrder) {
        pageModules.pos.saveOrder(false);
      }
    }
    // F12 - Save & print
    if (e.key === 'F12') {
      e.preventDefault();
      if (currentPage === 'pos' && pageModules.pos && pageModules.pos.saveOrder) {
        pageModules.pos.saveOrder(true);
      }
    }
  });
}

// ==================== SVG ICONS ====================
const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
  // Start clock
  updateClock();
  setInterval(updateClock, 1000);

  // Load theme from database if exists
  await initThemeFromDb();

  // Initialize current user & permissions
  await initCurrentUser();

  // Initialize shift status badge
  await updateShiftStatusBadge();

  // Setup events
  setupScannerEvents();
  setupKeyboardShortcuts();

  // Barcode search input Enter key handler for hardware barcode scanners
  const searchInput = document.getElementById('posSearchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = searchInput.value.trim();
        if (code && pageModules.pos && typeof pageModules.pos.onBarcodeOrSearchEnter === 'function') {
          pageModules.pos.onBarcodeOrSearchEnter(code);
          searchInput.value = '';
        }
      }
    });
  }

  // Navigate to POS
  setTimeout(() => navigateTo('pos'), 100);
});

// ==================== GLOBAL ERROR LOGGING (MOI-07) ====================
window.addEventListener('error', (event) => {
  if (window.api && window.api.log) {
    window.api.log.error(event.message || 'Renderer Error', 'Renderer', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    }).catch(() => {});
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (window.api && window.api.log) {
    window.api.log.error('Unhandled Promise Rejection in Renderer', 'Renderer', {
      reason: event.reason?.message || String(event.reason)
    }).catch(() => {});
  }
});

// ==================== AUTO-UPDATE MODAL & LOGIC (MOI-06) ====================
let latestUpdateInfo = null;

if (window.api && window.api.updater) {
  window.api.updater.onUpdateAvailable((info) => {
    latestUpdateInfo = info;
    const badge = document.getElementById('updateBadgeBtn');
    if (badge) {
      badge.style.display = 'inline-flex';
      badge.textContent = `✨ v${info.latestVersion} Mới`;
    }
  });
}

async function openUpdateModal(manual = false) {
  if (manual || !latestUpdateInfo) {
    showToast('info', 'Đang kiểm tra...', 'Đang tìm kiếm bản phát hành mới');
    try {
      const info = await window.api.updater.check(true);
      latestUpdateInfo = info;
    } catch (e) {
      showToast('error', 'Lỗi kiểm tra', e.message);
      return;
    }
  }

  const info = latestUpdateInfo;
  if (!info || !info.hasUpdate) {
    showModal(`
      <div class="modal" style="max-width:440px; text-align:center;">
        <div class="modal-header">
          <h3>🔄 Cập Nhật Phần Mềm</h3>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:28px 20px;">
          <div style="font-size:48px; margin-bottom:12px;">✅</div>
          <h4 style="margin-bottom:6px;">Bạn đang dùng phiên bản mới nhất!</h4>
          <p class="text-secondary" style="font-size:13px; margin-bottom:20px;">
            Phiên bản hiện tại: <strong>v${info ? info.currentVersion : '2.0.0'}</strong>.
          </p>
          <button class="btn btn-primary" onclick="closeModal()">Đã hiểu</button>
        </div>
      </div>
    `);
    return;
  }

  showModal(`
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">✨</span>
          <h3 style="margin:0;">Phiên Bản Mới: v${info.latestVersion}</h3>
        </div>
        <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:18px 20px;">
        <div style="background:var(--accent-light); padding:10px 14px; border-radius:8px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; color:var(--text-secondary);">HIỆN TẠI → BẢN MỚI</div>
            <div style="font-weight:700; color:var(--accent);">v${info.currentVersion} → v${info.latestVersion}</div>
          </div>
          <span class="badge badge-success">${info.releaseDate || 'Mới nhất'}</span>
        </div>

        <div style="font-size:12.5px; font-weight:700; margin-bottom:8px;">🚀 Có gì mới trong bản cập nhật này:</div>
        <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:12px 14px; max-height:160px; overflow-y:auto; margin-bottom:16px; font-size:12.5px; line-height:1.6;">
          ${(info.changelog || []).map(item => `<div>• ${escapeHtml(item)}</div>`).join('')}
        </div>

        <div id="updateDownloadProgressWrap" style="display:none; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
            <span>Tiến trình tải gói cập nhật:</span>
            <strong id="updateDownloadPercentText">0%</strong>
          </div>
          <div style="height:6px; background:var(--bg-secondary); border-radius:3px; overflow:hidden;">
            <div id="updateDownloadProgressBar" style="width:0%; height:100%; background:var(--accent); transition:width 0.15s ease;"></div>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn btn-outline" onclick="closeModal()">Để sau</button>
          <button class="btn btn-primary" id="btnStartDownloadUpdate" onclick="startDownloadUpdate()">
            🚀 Tải & Cài Đặt Ngay
          </button>
        </div>
      </div>
    </div>
  `);
}
window.openUpdateModal = openUpdateModal;

async function startDownloadUpdate() {
  const btn = document.getElementById('btnStartDownloadUpdate');
  const progWrap = document.getElementById('updateDownloadProgressWrap');
  const progBar = document.getElementById('updateDownloadProgressBar');
  const progTxt = document.getElementById('updateDownloadPercentText');

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang tải...';
  }
  if (progWrap) progWrap.style.display = 'block';

  window.api.updater.onDownloadProgress((percent) => {
    if (progBar) progBar.style.width = percent + '%';
    if (progTxt) progTxt.textContent = percent + '%';
  });

  try {
    const res = await window.api.updater.simulateDownload();
    if (res.success) {
      if (btn) {
        btn.textContent = '✅ Đã tải xong!';
      }
      showToast('success', 'Tải bản cập nhật hoàn tất!', 'Khởi động lại ứng dụng để áp dụng phiên bản mới.');
      setTimeout(() => closeModal(), 1500);
    }
  } catch (err) {
    showToast('error', 'Lỗi cập nhật', err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Thử lại';
    }
  }
}

// ==================== SHIFT MANAGEMENT & CASH DRAWER (F1) ====================
let currentShift = null;

async function updateShiftStatusBadge() {
  try {
    if (!window.api || typeof window.api.getCurrentShift !== 'function') return;
    const shift = await window.api.getCurrentShift();
    currentShift = shift;

    const dot = document.getElementById('shiftStatusDot');
    const text = document.getElementById('shiftStatusText');
    if (!dot || !text) return;

    if (shift && shift.status === 'open') {
      dot.className = 'status-dot online';
      text.innerHTML = `Ca #${shift.id}: <strong>${escapeHtml(shift.staff_name || 'Bán hàng')}</strong>`;
    } else {
      dot.className = 'status-dot warning';
      text.innerHTML = `Chưa mở ca ▾`;
    }
  } catch (err) {
    console.warn('[ShiftBadge] Error fetching shift:', err.message);
  }
}
window.updateShiftStatusBadge = updateShiftStatusBadge;

async function openShiftManagerModal() {
  try {
    const shift = await window.api.getCurrentShift();
    currentShift = shift;

    if (!shift) {
      // Prompt to Open Shift
      const currentUser = getCurrentUser() || { name: 'Chủ Cửa Hàng', id: 1 };
      showModal(`
        <div class="modal" style="max-width:480px;">
          <div class="modal-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">💼</span>
              <h3 style="margin:0;">Mở Ca Bán Hàng Mới</h3>
            </div>
            <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-body" style="padding:20px;">
            <div class="alert alert-info mb-md" style="font-size:12.5px;">
              Vui lòng nhập số tiền mặt đầu ca có sẵn trong két để đối soát doanh thu chính xác khi kết thúc ca.
            </div>

            <div class="form-group mb-md">
              <label class="form-label font-bold">Nhân viên trực ca:</label>
              <input type="text" class="form-control" id="shiftStaffName" value="${escapeHtml(currentUser.name)}" readonly style="background:var(--bg-secondary);">
            </div>

            <div class="form-group mb-md">
              <label class="form-label font-bold">Tiền mặt ban đầu trong két (đầu ca):</label>
              <div style="position:relative;">
                <input type="number" class="form-control" id="shiftInitialCash" value="1000000" min="0" step="10000" style="font-size:18px; font-weight:700; color:var(--accent); padding-right:40px;">
                <span style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-weight:700; color:var(--text-muted);">₫</span>
              </div>
              <div class="text-muted mt-xs" style="font-size:11px;">Gợi ý: 500.000₫, 1.000.000₫, 2.000.000₫ tiền thối lẻ</div>
            </div>

            <div class="form-group mb-lg">
              <label class="form-label">Ghi chú ca làm việc:</label>
              <input type="text" class="form-control" id="shiftNote" placeholder="Ví dụ: Ca sáng, giao ca lúc 12h...">
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px;">
              <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
              <button class="btn btn-primary" onclick="submitOpenShift()" style="min-width:140px;">
                🚀 Bắt Đầu Mở Ca
              </button>
            </div>
          </div>
        </div>
      `);
      setTimeout(() => {
        const inp = document.getElementById('shiftInitialCash');
        if (inp) inp.select();
      }, 100);
      return;
    }

    // Shift is already Open -> Show Summary & Close Shift Option
    const summary = await window.api.getShiftSummary(shift.id);

    showModal(`
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:22px;">💼</span>
            <div>
              <h3 style="margin:0;">Chi Tiết Ca Làm Việc #${shift.id}</h3>
              <div style="font-size:11px; color:var(--text-secondary);">Bắt đầu: ${shift.start_time} • NV: <strong>${escapeHtml(shift.staff_name)}</strong></div>
            </div>
          </div>
          <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:20px;">
          <!-- Financial breakdown cards -->
          <div class="grid grid-2 gap-md mb-md">
            <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Tiền mặt đầu ca</div>
              <div style="font-size:18px; font-weight:700; color:var(--text-primary); margin-top:2px;">
                ${formatMoney(summary.initial_cash)}
              </div>
            </div>
            <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Tiền mặt bán được</div>
              <div style="font-size:18px; font-weight:700; color:var(--success); margin-top:2px;">
                +${formatMoney(summary.cash_sales)}
              </div>
            </div>
          </div>

          <div class="grid grid-2 gap-md mb-md">
            <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Thu tiền ngoài bán hàng</div>
              <div style="font-size:16px; font-weight:700; color:var(--cyan); margin-top:2px;">
                +${formatMoney(summary.cash_in)}
              </div>
            </div>
            <div style="background:var(--bg-secondary); padding:12px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Chi tiền mặt ngoài bán hàng</div>
              <div style="font-size:16px; font-weight:700; color:var(--danger); margin-top:2px;">
                -${formatMoney(summary.cash_out)}
              </div>
            </div>
          </div>

          <!-- Highlight: Expected cash -->
          <div style="background:var(--accent-light); border:1.5px solid var(--accent); padding:14px; border-radius:8px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase;">Tiền mặt dự kiến có trong két</div>
              <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">= Đầu ca + Tiền mặt bán + Thu - Chi</div>
            </div>
            <div style="font-size:22px; font-weight:800; color:var(--accent);">
              ${formatMoney(summary.expected_cash)}
            </div>
          </div>

          <!-- Extra info -->
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary); margin-bottom:16px; padding:0 4px;">
            <div>Tổng số đơn hoàn thành: <strong>${summary.orders_count}</strong></div>
            <div>Doanh thu Chuyển khoản / Thẻ: <strong>${formatMoney(summary.card_sales + summary.transfer_sales)}</strong></div>
          </div>

          <!-- Action buttons -->
          <div style="display:flex; gap:10px; margin-bottom:18px;">
            <button class="btn btn-outline flex-1" onclick="openCashFlowModal('income')">
              ➕ Thu tiền mặt
            </button>
            <button class="btn btn-outline flex-1" onclick="openCashFlowModal('expense')">
              ➖ Chi tiền mặt
            </button>
          </div>

          <!-- Closing form -->
          <div style="border-top:1px solid var(--border); padding-top:16px;">
            <h4 style="margin-bottom:10px; font-size:14px;">🔒 Kết Ca & Bàn Giao Két Tiền:</h4>
            
            <div class="form-group mb-sm">
              <label class="form-label font-bold">Tiền mặt thực tế đếm được khi kết ca:</label>
              <input type="number" class="form-control" id="shiftActualCash" 
                     value="${summary.expected_cash}" min="0" step="1000"
                     oninput="onShiftActualCashChange(${summary.expected_cash})"
                     style="font-size:18px; font-weight:700; color:var(--success);">
            </div>

            <div id="shiftDiffResult" style="font-size:12.5px; margin-bottom:14px; font-weight:600; color:var(--success);">
              Chênh lệch: 0₫ (Khớp số liệu tuyệt đối)
            </div>

            <div class="form-group mb-md">
              <label class="form-label">Ghi chú kết ca (nếu có chênh lệch hoặc bàn giao):</label>
              <input type="text" class="form-control" id="shiftCloseNote" placeholder="Ví dụ: Đã bàn giao cho ca tối 1.500.000₫...">
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px;">
              <button class="btn btn-outline" onclick="closeModal()">Đóng</button>
              <button class="btn btn-danger" onclick="submitCloseShift(${shift.id})" style="font-weight:700;">
                🔒 Chốt Ca & Đóng Két
              </button>
            </div>
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    showToast('error', 'Lỗi tải ca bán hàng', err.message);
  }
}
window.openShiftManagerModal = openShiftManagerModal;

function onShiftActualCashChange(expected) {
  const inp = document.getElementById('shiftActualCash');
  const res = document.getElementById('shiftDiffResult');
  if (!inp || !res) return;
  const val = Number(inp.value) || 0;
  const diff = val - expected;
  if (diff === 0) {
    res.style.color = 'var(--success)';
    res.textContent = 'Chênh lệch: 0₫ (Khớp số liệu tuyệt đối)';
  } else if (diff > 0) {
    res.style.color = 'var(--cyan)';
    res.textContent = `Chênh lệch: +${formatMoney(diff)} (Dư tiền trong két)`;
  } else {
    res.style.color = 'var(--danger)';
    res.textContent = `Chênh lệch: ${formatMoney(diff)} (Thiếu hụt tiền trong két)`;
  }
}
window.onShiftActualCashChange = onShiftActualCashChange;

async function submitOpenShift() {
  try {
    const staffName = document.getElementById('shiftStaffName')?.value?.trim();
    const initialCash = Number(document.getElementById('shiftInitialCash')?.value) || 0;
    const note = document.getElementById('shiftNote')?.value?.trim() || '';

    const currentUser = getCurrentUser() || { id: 1, name: 'Chủ Cửa Hàng' };
    const shift = await window.api.openShift({
      userId: currentUser.id,
      staffName: staffName || currentUser.name,
      initialCash,
      note
    });

    closeModal();
    await updateShiftStatusBadge();
    showToast('success', 'Mở ca thành công!', `Ca #${shift.id} đã sẵn sàng. Tiền đầu ca: ${formatMoney(initialCash)}`);
  } catch (err) {
    showToast('error', 'Lỗi mở ca', err.message);
  }
}
window.submitOpenShift = submitOpenShift;

async function submitCloseShift(shiftId) {
  try {
    const actualCash = Number(document.getElementById('shiftActualCash')?.value) || 0;
    const note = document.getElementById('shiftCloseNote')?.value?.trim() || '';

    const closed = await window.api.closeShift(shiftId, { actualCash, note });
    closeModal();
    await updateShiftStatusBadge();

    const diffText = closed.difference === 0 ? 'Khớp 100%' : (closed.difference > 0 ? `Dư +${formatMoney(closed.difference)}` : `Thiếu ${formatMoney(closed.difference)}`);
    showToast('success', 'Đã chốt ca làm việc!', `Ca #${shiftId} đã đóng thành công. Chênh lệch: ${diffText}`);
  } catch (err) {
    showToast('error', 'Lỗi chốt ca', err.message);
  }
}
window.submitCloseShift = submitCloseShift;

function openCashFlowModal(defaultType = 'expense') {
  const currentUser = getCurrentUser() || { id: 1, name: 'Chủ Cửa Hàng' };
  const categories = defaultType === 'income' 
    ? ['Thu nợ khách hàng', 'Thu khác', 'Rút tiền ngân hàng nhập két']
    : ['Tiền mặt bằng', 'Tiền điện nước', 'Tiền nhập hàng lẻ', 'Tiền bao bì túi đựng', 'Ăn uống nhân viên', 'Chi khác'];

  showModal(`
    <div class="modal" style="max-width:440px;">
      <div class="modal-header">
        <h3 style="margin:0;">${defaultType === 'income' ? '➕ Tạo Phiếu Thu Tiền' : '➖ Tạo Phiếu Chi Tiền'}</h3>
        <button class="btn btn-ghost btn-icon sm" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;">
        <div class="form-group mb-md">
          <label class="form-label font-bold">Loại phiếu:</label>
          <select class="form-control" id="cfType" onchange="onCfTypeChange(this.value)">
            <option value="expense" ${defaultType === 'expense' ? 'selected' : ''}>Chi tiền mặt (Expense)</option>
            <option value="income" ${defaultType === 'income' ? 'selected' : ''}>Thu tiền mặt (Income)</option>
          </select>
        </div>

        <div class="form-group mb-md">
          <label class="form-label font-bold">Danh mục thu/chi:</label>
          <input type="text" class="form-control" id="cfCategory" list="cfCategoryList" value="${categories[0]}">
          <datalist id="cfCategoryList">
            ${categories.map(c => `<option value="${c}">`).join('')}
          </datalist>
        </div>

        <div class="form-group mb-md">
          <label class="form-label font-bold">Số tiền (VNĐ):</label>
          <input type="number" class="form-control" id="cfAmount" min="1000" step="5000" placeholder="Nhập số tiền..." style="font-size:18px; font-weight:700; color:var(--accent);">
        </div>

        <div class="form-group mb-lg">
          <label class="form-label">Ghi chú / Diễn giải:</label>
          <input type="text" class="form-control" id="cfNote" placeholder="Ví dụ: Mua túi bóng, trả tiền điện tháng 9...">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn btn-outline" onclick="closeModal()">Hủy</button>
          <button class="btn btn-primary" onclick="submitCashFlow()">
            💾 Lưu Phiếu
          </button>
        </div>
      </div>
    </div>
  `);

  setTimeout(() => {
    const inp = document.getElementById('cfAmount');
    if (inp) inp.focus();
  }, 100);
}
window.openCashFlowModal = openCashFlowModal;

function onCfTypeChange(type) {
  const list = document.getElementById('cfCategoryList');
  const catInp = document.getElementById('cfCategory');
  if (!list || !catInp) return;
  const cats = type === 'income' 
    ? ['Thu nợ khách hàng', 'Thu khác', 'Rút tiền ngân hàng nhập két']
    : ['Tiền mặt bằng', 'Tiền điện nước', 'Tiền nhập hàng lẻ', 'Tiền bao bì túi đựng', 'Ăn uống nhân viên', 'Chi khác'];
  list.innerHTML = cats.map(c => `<option value="${c}">`).join('');
  catInp.value = cats[0];
}
window.onCfTypeChange = onCfTypeChange;

async function submitCashFlow() {
  try {
    const type = document.getElementById('cfType')?.value;
    const category = document.getElementById('cfCategory')?.value?.trim();
    const amount = Number(document.getElementById('cfAmount')?.value);
    const note = document.getElementById('cfNote')?.value?.trim() || '';

    if (!amount || amount <= 0) {
      showToast('warning', 'Chưa nhập số tiền', 'Vui lòng nhập số tiền hợp lệ lớn hơn 0');
      return;
    }

    const currentUser = getCurrentUser() || { id: 1, name: 'Chủ Cửa Hàng' };
    const shift = await window.api.getCurrentShift();

    await window.api.addCashFlow({
      type,
      category: category || (type === 'income' ? 'Thu khác' : 'Chi khác'),
      amount,
      userId: currentUser.id,
      staffName: currentUser.name,
      shiftId: shift ? shift.id : null,
      note
    });

    closeModal();
    showToast('success', type === 'income' ? 'Đã ghi nhận phiếu thu' : 'Đã ghi nhận phiếu chi', `${formatMoney(amount)} - ${category}`);

    // If reports page is open, refresh
    if (currentPage === 'reports' && pageModules.reports && typeof pageModules.reports.loadAll === 'function') {
      pageModules.reports.loadAll();
    }
  } catch (err) {
    showToast('error', 'Lỗi lưu phiếu thu chi', err.message);
  }
}
window.submitCashFlow = submitCashFlow;
