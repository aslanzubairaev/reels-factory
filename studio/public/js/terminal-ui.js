/*
 * TerminalUI — контроллер выдвижной панели терминала.
 *
 * - Находит кнопку [data-action="toggle-terminal"] и панель #terminal-panel
 * - Открытие: если сессии нет, показывает выбор backend (claude/codex/shell),
 *   после выбора вызывает window.terminalAPI.spawn(id) и передаёт сессию в
 *   TerminalPanel.
 * - Закрытие: убивает сессию и скрывает панель.
 */
(function () {
  const TerminalUI = {
    rootEl: null,
    termHost: null,
    statusEl: null,
    backendSelect: null,
    isOpen: false,
    backends: [],

    async init() {
      this.rootEl = document.getElementById('terminal-panel');
      if (!this.rootEl) return;

      this.termHost = this.rootEl.querySelector('.terminal-host');
      this.statusEl = this.rootEl.querySelector('.terminal-status');
      this.backendSelect = this.rootEl.querySelector('.terminal-backend-select');

      // Load backends
      if (window.terminalAPI) {
        try {
          const list = await window.terminalAPI.listBackends();
          this.backends = list.backends || [];
          this._populateBackendSelect(list);
        } catch (e) {
          console.warn('Не удалось загрузить backends:', e);
        }
      } else {
        this._setStatus('Терминал работает только в Electron-окне (не через браузер).', true);
      }

      // Buttons
      const closeBtn = this.rootEl.querySelector('.terminal-close');
      const restartBtn = this.rootEl.querySelector('.terminal-restart');
      const clearBtn = this.rootEl.querySelector('.terminal-clear');

      closeBtn?.addEventListener('click', () => this.close());
      restartBtn?.addEventListener('click', () => this.restart());
      clearBtn?.addEventListener('click', () => window.TerminalPanel?.clear());

      this.backendSelect?.addEventListener('change', () => this.restart());

      // External toggle buttons
      document.querySelectorAll('[data-action="toggle-terminal"]').forEach(btn => {
        btn.addEventListener('click', () => this.toggle());
      });

      // Hotkey: Ctrl+` toggle
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === '`') {
          e.preventDefault();
          this.toggle();
        }
      });

      // Ресайз → fit
      window.addEventListener('resize', () => {
        if (this.isOpen) window.TerminalPanel?.fit();
      });
    },

    _populateBackendSelect(list) {
      if (!this.backendSelect) return;
      this.backendSelect.innerHTML = '';
      for (const b of list.backends || []) {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.label;
        if (b.id === list.default) opt.selected = true;
        this.backendSelect.appendChild(opt);
      }
    },

    _setStatus(text, isError = false) {
      if (!this.statusEl) return;
      this.statusEl.textContent = text || '';
      this.statusEl.classList.toggle('terminal-status-error', !!isError);
    },

    async toggle() {
      if (this.isOpen) this.close();
      else await this.open();
    },

    async open() {
      if (!this.rootEl) return;
      this.rootEl.classList.remove('hidden');
      this.isOpen = true;

      // Инициализируем xterm
      if (window.TerminalPanel && this.termHost) {
        window.TerminalPanel.mount(this.termHost);
        // Пересчитать размеры и сфокусироваться после анимации
        setTimeout(() => {
          window.TerminalPanel.fit();
          window.TerminalPanel.term?.focus();
        }, 250);
      }

      // Если нет активной сессии — запускаем default backend
      if (window.TerminalPanel && !window.TerminalPanel.sessionId) {
        await this._spawnSelected();
      }
      window.TerminalPanel?.term?.focus();
    },

    async close() {
      if (!this.rootEl) return;
      await window.TerminalPanel?.killSession();
      this.rootEl.classList.add('hidden');
      this.isOpen = false;
    },

    async restart() {
      if (!window.TerminalPanel) return;
      await window.TerminalPanel.killSession();
      window.TerminalPanel.clear();
      await this._spawnSelected();
    },

    async _spawnSelected() {
      if (!window.terminalAPI) return;
      const backendId = this.backendSelect?.value || 'shell';
      this._setStatus(`Запускаю ${backendId}...`);

      try {
        const result = await window.terminalAPI.spawn(backendId);
        if (result.error) {
          this._setStatus(result.error, true);
          window.TerminalPanel?.term?.write(`\r\n\x1b[31m${result.error}\x1b[0m\r\n`);
          return;
        }
        window.TerminalPanel?.attachSession(result.sessionId, result.label);
        this._setStatus(`${result.label} — pid ${result.pid}`);
      } catch (e) {
        this._setStatus('Ошибка: ' + (e.message || e), true);
      }
    }
  };

  window.TerminalUI = TerminalUI;
  document.addEventListener('DOMContentLoaded', () => TerminalUI.init());
})();
