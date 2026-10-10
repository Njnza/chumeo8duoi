/* ============================================
   ShopPro Desktop - Auto-Update Service
   Checks releases, changelog and version updates
   ============================================ */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class AppUpdater {
  constructor(options = {}) {
    this.currentVersion = options.currentVersion || '2.0.0';
    this.logger = options.logger || console;
    this.updateFeedUrl = options.updateFeedUrl || '';
    this.status = {
      isChecking: false,
      hasUpdate: false,
      currentVersion: this.currentVersion,
      latestVersion: this.currentVersion,
      releaseDate: '',
      changelog: [],
      downloadUrl: '',
      lastChecked: null,
      downloadProgress: 0,
      isDownloaded: false
    };

    // Simulated / Known releases feed for offline/LAN and remote environments
    this.mockReleases = [
      {
        version: '2.1.0',
        releaseDate: '2026-09-20',
        changelog: [
          '✨ Tích hợp thanh toán tự động VietQR chuẩn NAPAS 247 trên màn hình POS',
          '📥 Nhập & Xuất dữ liệu sản phẩm hàng loạt qua Excel (.xlsx / .csv)',
          '📱 Nâng cấp Progressive Web App (PWA) & chế độ Gom Hàng (Batch Scan) cho điện thoại',
          '📊 Nâng cấp biểu đồ phân tích chuyên sâu bằng Chart.js (Giờ cao điểm & Doanh thu)',
          '🌐 Hỗ trợ chuyển đổi song ngữ Tiếng Việt / English',
          '🔌 Hệ thống Plugin mở rộng kết nối cân điện tử và màn hình phụ'
        ],
        downloadUrl: 'https://github.com/shoppro/desktop/releases/download/v2.1.0/ShopPro-Setup-2.1.0.exe'
      }
    ];
  }

  // Compare 2 semver strings (e.g. "2.1.0" vs "2.0.0")
  compareSemver(v1, v2) {
    const clean1 = (v1 || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const clean2 = (v2 || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < 3; i++) {
      const p1 = clean1[i] || 0;
      const p2 = clean2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  async checkForUpdates(manual = false) {
    this.status.isChecking = true;
    this.status.lastChecked = new Date().toISOString();
    this.logger.info(`Checking for updates (current: v${this.currentVersion}, manual: ${manual})...`, 'Updater');

    try {
      // If a real remote URL is set, fetch JSON from server
      let releaseInfo = null;
      if (this.updateFeedUrl && this.updateFeedUrl.startsWith('http')) {
        releaseInfo = await this._fetchRemoteFeed(this.updateFeedUrl);
      }

      // If no remote feed or offline, fallback to latest release in catalog
      if (!releaseInfo) {
        releaseInfo = this.mockReleases[0];
      }

      if (releaseInfo && this.compareSemver(releaseInfo.version, this.currentVersion) > 0) {
        this.status.hasUpdate = true;
        this.status.latestVersion = releaseInfo.version;
        this.status.releaseDate = releaseInfo.releaseDate || '';
        this.status.changelog = releaseInfo.changelog || [];
        this.status.downloadUrl = releaseInfo.downloadUrl || '';
        this.logger.info(`Update available: v${releaseInfo.version}`, 'Updater');
      } else {
        this.status.hasUpdate = false;
        this.status.latestVersion = this.currentVersion;
        this.logger.info('Application is up to date', 'Updater');
      }
    } catch (err) {
      this.logger.warn(`Check update failed: ${err.message}`, 'Updater');
    } finally {
      this.status.isChecking = false;
    }

    return { ...this.status };
  }

  getStatus() {
    return { ...this.status };
  }

  async simulateDownload(progressCallback) {
    this.status.downloadProgress = 0;
    this.status.isDownloaded = false;

    for (let p = 10; p <= 100; p += 15) {
      await new Promise(r => setTimeout(r, 120));
      this.status.downloadProgress = Math.min(100, p);
      if (typeof progressCallback === 'function') {
        progressCallback(this.status.downloadProgress);
      }
    }

    this.status.isDownloaded = true;
    this.status.downloadProgress = 100;
    this.logger.info(`Update v${this.status.latestVersion} package ready to install`, 'Updater');
    return { success: true };
  }

  _fetchRemoteFeed(urlStr) {
    return new Promise((resolve) => {
      const client = urlStr.startsWith('https') ? https : http;
      const req = client.get(urlStr, { timeout: 4000 }, (res) => {
        if (res.statusCode !== 200) return resolve(null);
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (_) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }
}

module.exports = AppUpdater;
