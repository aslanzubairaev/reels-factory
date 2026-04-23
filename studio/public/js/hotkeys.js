/**
 * Hotkeys module — клавиатурные хоткеи с поддержкой модификаторов.
 *
 * Формат ключа: 'Ctrl+s', 'Shift+G', 'Ctrl+Shift+F', 'Escape', 'ArrowLeft'.
 * Регистр для одиночной буквы не важен — при матчинге ключ нижне-регистрится.
 * Специальные ключи (Escape, ArrowLeft, ArrowRight, ' ') — как есть.
 *
 * Хоткеи не срабатывают внутри input / textarea / select или когда
 * contenteditable-элемент в фокусе. Для описания хоткея — второй параметр
 * bind(description, handler), используется help-оверлей.
 */
const Hotkeys = {
  handlers: {},
  descriptions: {},
  enabled: true,

  init() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const target = e.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;

      const key = this._eventToKey(e);
      if (!key) return;

      const handler = this.handlers[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    });
  },

  _eventToKey(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    let k = e.key;
    if (!k) return null;
    if (k === ' ') k = 'Space';
    // Для букв приводим к нижнему регистру (но сохраняем Shift-модификатор,
    // чтобы 'Ctrl+Shift+S' отличалось от 'Ctrl+S').
    if (k.length === 1 && /[a-zA-Z]/.test(k)) {
      k = k.toLowerCase();
    }
    parts.push(k);
    return parts.join('+');
  },

  _normalizeKey(keyStr) {
    const parts = keyStr.split('+').map(s => s.trim());
    const last = parts.pop();
    const mods = new Set(parts.map(p => p === 'Cmd' ? 'Ctrl' : p));
    const ordered = [];
    if (mods.has('Ctrl')) ordered.push('Ctrl');
    if (mods.has('Alt')) ordered.push('Alt');
    if (mods.has('Shift')) ordered.push('Shift');
    let lastNorm = last;
    if (lastNorm && lastNorm.length === 1 && /[a-zA-Z]/.test(lastNorm)) {
      lastNorm = lastNorm.toLowerCase();
    }
    ordered.push(lastNorm);
    return ordered.join('+');
  },

  bind(key, handlerOrDescription, maybeHandler) {
    const norm = this._normalizeKey(key);
    if (typeof handlerOrDescription === 'string') {
      this.descriptions[norm] = handlerOrDescription;
      this.handlers[norm] = maybeHandler;
    } else {
      this.handlers[norm] = handlerOrDescription;
    }
  },

  unbind(key) {
    const norm = this._normalizeKey(key);
    delete this.handlers[norm];
    delete this.descriptions[norm];
  },

  disable() { this.enabled = false; },
  enable() { this.enabled = true; },

  listDescribed() {
    return Object.entries(this.descriptions)
      .map(([key, description]) => ({ key, description }));
  }
};
