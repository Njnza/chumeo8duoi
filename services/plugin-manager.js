/* ============================================
   ShopPro Desktop - Plugin System Manager
   Extensible architecture with lifecycle hooks
   ============================================ */

const fs = require('fs');
const path = require('path');

class PluginManager {
  constructor(options = {}) {
    this.pluginsDir = options.pluginsDir || path.join(process.cwd(), 'plugins');
    this.db = options.db || null;
    this.logger = options.logger || console;
    this.plugins = new Map(); // id -> { manifest, instance, enabled, path }
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.pluginsDir)) {
      try {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
      } catch (err) {
        this.logger.error(`Could not create plugins dir: ${err.message}`, 'PluginManager');
      }
    }
  }

  async init(appContext = {}) {
    this.appContext = appContext;
    this._ensureDir();
    await this.discoverAndLoad();
  }

  async discoverAndLoad() {
    try {
      const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

      // Load persisted enabled states from DB if available
      let enabledMap = {};
      if (this.db && typeof this.db.getSetting === 'function') {
        try {
          const raw = this.db.getSetting('plugins_state');
          if (raw) enabledMap = JSON.parse(raw);
        } catch (_) {}
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pDir = path.join(this.pluginsDir, entry.name);
          const manifestPath = path.join(pDir, 'plugin.json');
          const scriptPath = path.join(pDir, 'index.js');

          if (fs.existsSync(manifestPath) && fs.existsSync(scriptPath)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
              const id = manifest.id || entry.name;

              // Default enabled is true unless explicitly disabled in DB
              const isEnabled = enabledMap[id] !== undefined ? Boolean(enabledMap[id]) : (manifest.enabled !== false);

              // Require the plugin code
              delete require.cache[require.resolve(scriptPath)];
              const PluginClassOrObj = require(scriptPath);
              const instance = typeof PluginClassOrObj === 'function' ? new PluginClassOrObj() : PluginClassOrObj;

              this.plugins.set(id, {
                id,
                manifest,
                instance,
                enabled: isEnabled,
                path: pDir
              });

              if (isEnabled && typeof instance.onInit === 'function') {
                try {
                  instance.onInit(this.appContext);
                  this.logger.info(`Plugin [${manifest.name || id}] v${manifest.version || '1.0'} initialized`, 'PluginManager');
                } catch (initErr) {
                  this.logger.error(`Plugin [${id}] onInit error: ${initErr.message}`, 'PluginManager', initErr);
                }
              }
            } catch (err) {
              this.logger.error(`Failed to load plugin in ${entry.name}: ${err.message}`, 'PluginManager', err);
            }
          }
        }
      }
    } catch (err) {
      this.logger.error(`Error scanning plugins: ${err.message}`, 'PluginManager', err);
    }
  }

  getPlugins() {
    const list = [];
    for (const [id, item] of this.plugins.entries()) {
      list.push({
        id,
        name: item.manifest.name || id,
        version: item.manifest.version || '1.0.0',
        author: item.manifest.author || 'Tác giả',
        description: item.manifest.description || '',
        icon: item.manifest.icon || '🔌',
        enabled: item.enabled,
        hooks: item.manifest.hooks || []
      });
    }
    return list;
  }

  togglePlugin(id, enable) {
    const item = this.plugins.get(id);
    if (!item) return { success: false, error: 'Không tìm thấy plugin' };

    const shouldEnable = Boolean(enable);
    if (item.enabled === shouldEnable) {
      return { success: true, enabled: item.enabled };
    }

    item.enabled = shouldEnable;
    if (shouldEnable) {
      if (typeof item.instance.onInit === 'function') {
        try {
          item.instance.onInit(this.appContext);
        } catch (e) {
          this.logger.error(`Plugin ${id} onInit error: ${e.message}`, 'PluginManager');
        }
      }
    } else {
      if (typeof item.instance.onDestroy === 'function') {
        try {
          item.instance.onDestroy();
        } catch (e) {
          this.logger.error(`Plugin ${id} onDestroy error: ${e.message}`, 'PluginManager');
        }
      }
    }

    // Persist state
    this._persistState();
    return { success: true, enabled: item.enabled };
  }

  _persistState() {
    if (this.db && typeof this.db.setSetting === 'function') {
      const stateObj = {};
      for (const [id, item] of this.plugins.entries()) {
        stateObj[id] = item.enabled;
      }
      try {
        this.db.setSetting('plugins_state', JSON.stringify(stateObj));
      } catch (_) {}
    }
  }

  emitHook(hookName, ...args) {
    const results = [];
    for (const [id, item] of this.plugins.entries()) {
      if (item.enabled && item.instance && typeof item.instance[hookName] === 'function') {
        try {
          const res = item.instance[hookName](...args);
          results.push({ pluginId: id, result: res });
        } catch (err) {
          this.logger.error(`Error in plugin [${id}] hook ${hookName}: ${err.message}`, 'PluginManager', err);
        }
      }
    }
    return results;
  }

  getPluginsFolderPath() {
    return this.pluginsDir;
  }
}

module.exports = PluginManager;
