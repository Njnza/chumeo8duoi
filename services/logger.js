/* ============================================
   ShopPro Desktop - Logging & Error Tracking
   Rotating file logger with structured format
   ============================================ */

const fs = require('fs');
const path = require('path');

class AppLogger {
  constructor(options = {}) {
    this.logsDir = options.logsDir || path.join(process.cwd(), 'logs');
    this.maxAgeDays = options.maxAgeDays || 14;
    this.currentDateStr = '';
    this.currentLogFile = '';
    this._ensureDir();
    this._rotate();
  }

  _ensureDir() {
    if (!fs.existsSync(this.logsDir)) {
      try {
        fs.mkdirSync(this.logsDir, { recursive: true });
      } catch (err) {
        console.error('[Logger] Could not create logs directory:', err);
      }
    }
  }

  _getTodayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  _rotate() {
    const today = this._getTodayStr();
    if (today !== this.currentDateStr) {
      this.currentDateStr = today;
      this.currentLogFile = path.join(this.logsDir, `shoppro-${today}.log`);
      this._cleanOldLogs();
    }
  }

  _cleanOldLogs() {
    try {
      const files = fs.readdirSync(this.logsDir);
      const now = Date.now();
      const maxAgeMs = this.maxAgeDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file.startsWith('shoppro-') && file.endsWith('.log')) {
          const filePath = path.join(this.logsDir, file);
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (_) {}
  }

  _write(level, context, message, extra = null) {
    this._rotate();
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    const ctxStr = context ? `[${context}]` : '[App]';
    let line = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] ${ctxStr} ${message}`;
    if (extra) {
      if (extra instanceof Error) {
        line += `\n  Stack: ${extra.stack || extra.message}`;
      } else if (typeof extra === 'object') {
        try {
          line += `\n  Data: ${JSON.stringify(extra)}`;
        } catch (_) {
          line += `\n  Data: [Object]`;
        }
      } else {
        line += `\n  Details: ${extra}`;
      }
    }
    line += '\n';

    // Output to console in development
    if (level === 'ERROR') {
      console.error(line.trim());
    } else if (level === 'WARN') {
      console.warn(line.trim());
    } else {
      console.log(line.trim());
    }

    try {
      this._ensureDir();
      fs.appendFileSync(this.currentLogFile, line, 'utf-8');
    } catch (err) {
      console.error('[Logger] Failed to write log file:', err);
    }
  }

  info(message, context = 'App', extra = null) {
    this._write('INFO', context, message, extra);
  }

  warn(message, context = 'App', extra = null) {
    this._write('WARN', context, message, extra);
  }

  error(message, context = 'App', extra = null) {
    this._write('ERROR', context, message, extra);
  }

  debug(message, context = 'App', extra = null) {
    this._write('DEBUG', context, message, extra);
  }

  getRecentLogs(limitLines = 150) {
    this._rotate();
    if (!fs.existsSync(this.currentLogFile)) {
      return [];
    }
    try {
      const content = fs.readFileSync(this.currentLogFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      return lines.slice(-limitLines);
    } catch (err) {
      return [`[Lỗi khi đọc nhật ký: ${err.message}]`];
    }
  }

  getLogFolderPath() {
    return this.logsDir;
  }

  getCurrentLogFilePath() {
    this._rotate();
    return this.currentLogFile;
  }

  clearTodayLog() {
    this._rotate();
    if (fs.existsSync(this.currentLogFile)) {
      fs.writeFileSync(this.currentLogFile, '', 'utf-8');
    }
    return true;
  }
}

module.exports = AppLogger;
