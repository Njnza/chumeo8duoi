/* ============================================
   ShopPro Desktop - Plugins Renderer Bridge
   ============================================ */

(() => {
  let pluginsList = [];

  async function loadPlugins() {
    if (window.api && window.api.plugins) {
      try {
        pluginsList = await window.api.plugins.getAll();
      } catch (e) {
        console.warn('[Plugins] Error loading plugins:', e);
      }
    }
    return pluginsList;
  }

  function getLoadedPlugins() {
    return pluginsList;
  }

  async function togglePlugin(id, enable) {
    if (window.api && window.api.plugins) {
      const res = await window.api.plugins.toggle(id, enable);
      await loadPlugins();
      return res;
    }
    return { success: false };
  }

  async function openPluginsFolder() {
    if (window.api && window.api.plugins) {
      return await window.api.plugins.openFolder();
    }
  }

  window.pluginBridge = {
    loadPlugins,
    getLoadedPlugins,
    togglePlugin,
    openPluginsFolder
  };

  // Auto-load on startup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPlugins);
  } else {
    loadPlugins();
  }
})();
