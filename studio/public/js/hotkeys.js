/**
 * Hotkeys module — keyboard shortcuts
 */
const Hotkeys = {
  handlers: {},
  enabled: true,

  init() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      const key = e.key;
      if (this.handlers[key]) {
        e.preventDefault();
        this.handlers[key]();
      }
    });
  },

  bind(key, handler) {
    this.handlers[key] = handler;
  },

  unbind(key) {
    delete this.handlers[key];
  },

  disable() {
    this.enabled = false;
  },

  enable() {
    this.enabled = true;
  }
};
