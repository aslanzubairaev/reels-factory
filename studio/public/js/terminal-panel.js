/*
 * TerminalPanel — обёртка над xterm.js.
 *
 * Создаёт экземпляр терминала внутри контейнера, связывает его с текущей
 * сессией (backendId), принимает поток stdout/stderr из main.process и
 * отправляет пользовательский ввод обратно через window.terminalAPI.
 *
 * Сам по себе НЕ запускает процесс — это делает window.terminalAPI.spawn()
 * из TerminalUI.
 */
(function () {
  if (typeof window.Terminal !== 'function') {
    console.warn('xterm.js не загружен — terminal-panel не активируется');
    return;
  }

  const THEME_DARK = {
    background: '#0a0a14',
    foreground: '#d8dee9',
    cursor: '#ff6b00',
    selectionBackground: '#3b4252',
    black:   '#1a1a2e',
    red:     '#ff5555',
    green:   '#50fa7b',
    yellow:  '#f1fa8c',
    blue:    '#8be9fd',
    magenta: '#ff79c6',
    cyan:    '#8be9fd',
    white:   '#f8f8f2',
    brightBlack:   '#6272a4',
    brightRed:     '#ff6e6e',
    brightGreen:   '#69ff94',
    brightYellow:  '#ffffa5',
    brightBlue:    '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan:    '#a4ffff',
    brightWhite:   '#ffffff'
  };

  const TerminalPanel = {
    term: null,
    fitAddon: null,
    sessionId: null,
    backendLabel: null,
    unsubData: null,
    unsubExit: null,

    mount(container) {
      if (this.term) return this.term;

      this.term = new window.Terminal({
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        theme: THEME_DARK,
        cursorBlink: true,
        convertEol: true,
        scrollback: 5000,
        allowProposedApi: true
      });

      if (window.FitAddon && window.FitAddon.FitAddon) {
        this.fitAddon = new window.FitAddon.FitAddon();
        this.term.loadAddon(this.fitAddon);
      }
      if (window.WebLinksAddon && window.WebLinksAddon.WebLinksAddon) {
        this.term.loadAddon(new window.WebLinksAddon.WebLinksAddon());
      }

      this.term.open(container);
      this.fitAddon?.fit();
      this.term.focus();

      // Клик по контейнеру → фокус на terminal (чтобы принимал ввод)
      container.addEventListener('click', () => this.term?.focus());

      // Голосовой ввод (Wispr Flow и подобные): перехват paste → в pty.
      if (this.term.textarea) {
        this.term.textarea.addEventListener('paste', (e) => {
          const text = e.clipboardData?.getData('text') || '';
          if (text && this.sessionId && window.terminalAPI) {
            e.preventDefault();
            e.stopPropagation();
            window.terminalAPI.write(this.sessionId, text);
          }
        });
      }

      // Пользовательский ввод → stdin процесса
      this.term.onData((data) => {
        if (this.sessionId && window.terminalAPI) {
          window.terminalAPI.write(this.sessionId, data);
        } else if (this.term) {
          // Нет активной сессии — показываем подсказку при вводе
          this.term.write('\r\n\x1b[33m[нет активной сессии — выбери backend и нажми ↻ чтобы перезапустить]\x1b[0m\r\n');
        }
      });

      // Поток от main → экран
      if (window.terminalAPI) {
        this.unsubData = window.terminalAPI.onData((payload) => {
          if (!this.term) return;
          if (payload.sessionId !== this.sessionId) return;
          this.term.write(payload.data);
        });
        this.unsubExit = window.terminalAPI.onExit((payload) => {
          if (payload.sessionId !== this.sessionId) return;
          const code = payload.code == null ? '?' : payload.code;
          this.term.write(`\r\n\x1b[90m[сессия завершена, код ${code}]\x1b[0m\r\n`);
          this.sessionId = null;
        });
      }

      return this.term;
    },

    /** Подписать панель на новую сессию (после spawn в main). */
    attachSession(sessionId, backendLabel) {
      this.sessionId = String(sessionId);
      this.backendLabel = backendLabel || null;
      if (this.term) {
        this.term.write(`\x1b[36m=== ${backendLabel || 'Terminal'} запущен ===\x1b[0m\r\n`);
      }
    },

    async killSession() {
      if (!this.sessionId || !window.terminalAPI) return;
      const id = this.sessionId;
      this.sessionId = null;
      try {
        await window.terminalAPI.kill(id);
      } catch (e) {
        console.warn('kill error:', e);
      }
    },

    clear() {
      this.term?.clear();
    },

    fit() {
      try {
        this.fitAddon?.fit();
        // Сообщим PTY о новых размерах
        if (this.sessionId && this.term && window.terminalAPI?.resize) {
          window.terminalAPI.resize(this.sessionId, this.term.cols, this.term.rows);
        }
      } catch (_) {}
    },

    dispose() {
      this.unsubData?.();
      this.unsubExit?.();
      this.term?.dispose();
      this.term = null;
    }
  };

  window.TerminalPanel = TerminalPanel;
})();
