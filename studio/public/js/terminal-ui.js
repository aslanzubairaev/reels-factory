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

      // Кнопки позиции (снизу / справа / отдельное окно)
      this.rootEl.querySelectorAll('.terminal-pos-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const pos = btn.dataset.pos;
          if (pos === 'detach') this.detach();
          else this.setPosition(pos);
        });
      });

      // Drag-handle resize
      this._installResizeHandle();

      // Голосовой ввод (Wispr Flow / любой voice-to-text): по умолчанию
      // диктовать нужно ПРЯМО в xterm — скрытая xterm-textarea принимает
      // system input от Wispr Flow. Отдельное поле-буфер — опциональный
      // fallback, включается кнопкой 🎙 в header'е.
      this._installVoiceBar();
      this._installVoiceToggle();
    },

    _installVoiceBar() {
      const input = document.getElementById('terminal-voice-input');
      const sendBtn = document.getElementById('terminal-voice-send');
      if (!input || !sendBtn) return;

      const send = () => {
        const text = input.value.trim();
        if (!text) return;
        const panel = window.TerminalPanel;
        if (!panel?.sessionId || !window.terminalAPI) {
          panel?.term?.write('\r\n\x1b[33m[нет активной сессии — выбери backend и нажми ↻]\x1b[0m\r\n');
          return;
        }
        // Отправляем как будто пользователь напечатал + Enter
        window.terminalAPI.write(panel.sessionId, text + '\r');
        input.value = '';
        input.style.height = '';
      };

      sendBtn.addEventListener('click', send);
      input.addEventListener('keydown', (e) => {
        // Enter отправляет, Shift+Enter — перенос строки
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
      // Авто-рост высоты textarea при диктовке длинного текста
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(90, input.scrollHeight) + 'px';
      });
    },

    // Toggle видимости голосового поля. Persist в localStorage —
    // если пользователь его включил, при следующем открытии терминала
    // поле останется видимым.
    _installVoiceToggle() {
      const toggleBtn = this.rootEl.querySelector('.terminal-voice-toggle');
      const bar = document.getElementById('terminal-voice-bar');
      if (!toggleBtn || !bar) return;

      const apply = (visible) => {
        bar.classList.toggle('hidden', !visible);
        toggleBtn.classList.toggle('is-active', visible);
        toggleBtn.title = visible
          ? 'Скрыть поле голосового ввода (Wispr Flow может писать прямо в терминал)'
          : 'Показать отдельное поле-буфер для голоса (fallback, если Wispr плохо видит xterm)';
      };

      // По умолчанию поле СКРЫТО — Wispr Flow пишет прямо в xterm (скрытая
      // xterm-textarea растянута CSS до 320x24, DOM-сканеры её видят).
      // Одноразовая миграция v2: старые пользователи, у кого поле было '1',
      // получают сброс на скрытое состояние, дальше их выбор уважается.
      const MIGRATION_KEY = 'terminal.voiceBarMigratedV2';
      if (!localStorage.getItem(MIGRATION_KEY)) {
        localStorage.setItem('terminal.voiceBarVisible', '0');
        localStorage.setItem(MIGRATION_KEY, '1');
      }
      const savedRaw = localStorage.getItem('terminal.voiceBarVisible');
      const saved = savedRaw === null ? false : savedRaw === '1';
      apply(saved);

      toggleBtn.addEventListener('click', () => {
        const next = bar.classList.contains('hidden');
        apply(next);
        localStorage.setItem('terminal.voiceBarVisible', next ? '1' : '0');
        // При включении поля — фокус в textarea, при скрытии — обратно в xterm,
        // чтобы Wispr Flow диктовал в основной терминал.
        if (next) document.getElementById('terminal-voice-input')?.focus();
        else window.TerminalPanel?.term?.focus();
        // Перефитить терминал (высота изменилась)
        setTimeout(() => window.TerminalPanel?.fit(), 50);
      });
    },

    _installResizeHandle() {
      const handle = document.getElementById('terminal-resize-handle');
      if (!handle || !this.rootEl) return;
      let dragging = false, startPos = 0, startSize = 0;

      handle.addEventListener('mousedown', (e) => {
        dragging = true;
        const isRight = this.rootEl.classList.contains('terminal-pos-right');
        startPos = isRight ? e.clientX : e.clientY;
        const rect = this.rootEl.getBoundingClientRect();
        startSize = isRight ? rect.width : rect.height;
        document.body.style.cursor = isRight ? 'ew-resize' : 'ns-resize';
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging || !this.rootEl) return;
        const isRight = this.rootEl.classList.contains('terminal-pos-right');
        const delta = isRight ? (startPos - e.clientX) : (startPos - e.clientY);
        const max = isRight ? window.innerWidth * 0.85 : window.innerHeight * 0.85;
        const newSize = Math.max(200, Math.min(max, startSize + delta));
        if (isRight) this.rootEl.style.width = `${newSize}px`;
        else this.rootEl.style.height = `${newSize}px`;
        window.TerminalPanel?.fit();
      });
      window.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; document.body.style.cursor = ''; }
      });
    },

    setPosition(pos) {
      if (!this.rootEl) return;
      this.rootEl.classList.remove('terminal-pos-bottom', 'terminal-pos-right');
      this.rootEl.classList.add(`terminal-pos-${pos}`);
      this.rootEl.style.width = '';
      this.rootEl.style.height = '';
      setTimeout(() => window.TerminalPanel?.fit(), 60);
    },

    async detach() {
      if (window.terminalAPI?.openDetached) {
        try {
          await window.terminalAPI.openDetached();
          this.close();
          return;
        } catch (_) { /* fallback */ }
      }
      const url = window.location.origin + '/terminal-window.html';
      window.open(url, 'reels-terminal', 'width=900,height=600');
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
