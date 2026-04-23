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

      // Paste: сначала картинки (скриншот из буфера → временный файл → путь
      // инжектится в PTY), потом — обычный текст (включая голосовой ввод
      // Wispr Flow через скрытую xterm-textarea).
      this._installPasteHandler(container);

      // Drag-and-drop файлов на терминал — тот же путь, что и paste картинок:
      // файл → путь в PTY. Работает для картинок и любых других файлов,
      // которые пользователь хочет дать Claude «прочитать».
      this._installDropHandler(container);

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

    // Вешает paste-обработчик на скрытый textarea xterm и на сам контейнер.
    // Если в буфере обмена есть картинка — сохраняем её во временный файл
    // через IPC и инжектируем ПУТЬ в PTY (примерно как drag-drop в обычном
    // Claude Code: Claude сам прочитает файл через Read tool).
    // Если картинки нет — работаем как раньше: обычный текст уходит в PTY.
    _installPasteHandler(container) {
      const handler = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        // Ищем первый image-item (например image/png от скриншота)
        let imageItem = null;
        for (const item of items) {
          if (item.kind === 'file' && item.type?.startsWith('image/')) {
            imageItem = item;
            break;
          }
        }

        if (imageItem && window.terminalAPI?.savePastedImage) {
          e.preventDefault();
          e.stopPropagation();
          const file = imageItem.getAsFile();
          if (!file) return;
          this._injectFileAsPath(file);
          return;
        }

        // Fallback: обычный текст (plain paste) — отдаём в PTY как было.
        const text = e.clipboardData?.getData('text') || '';
        if (text && this.sessionId && window.terminalAPI) {
          e.preventDefault();
          e.stopPropagation();
          window.terminalAPI.write(this.sessionId, text);
        }
      };

      // xterm держит невидимый textarea для захвата клавиатуры — именно туда
      // попадают paste-события в системном буфере.
      this.term?.textarea?.addEventListener('paste', handler);
      // И на сам контейнер — на случай drag-paste или когда фокус где-то рядом.
      container.addEventListener('paste', handler);
    },

    // Drag-and-drop: файлы перетаскиваются прямо на терминал → путь в PTY.
    _installDropHandler(container) {
      const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        container.addEventListener(evt, prevent);
      });

      container.addEventListener('dragover', () => {
        container.classList.add('terminal-drop-hover');
      });
      container.addEventListener('dragleave', () => {
        container.classList.remove('terminal-drop-hover');
      });

      container.addEventListener('drop', async (e) => {
        container.classList.remove('terminal-drop-hover');
        const files = Array.from(e.dataTransfer?.files || []);
        if (!files.length) return;

        // Для файла с диска Electron даёт path напрямую — его можно сразу
        // инжектировать без копирования. Для картинок-скриншотов (без path)
        // работает тот же fallback через savePastedImage.
        for (const file of files) {
          if (file.path) {
            this._writePathToPty(file.path);
          } else {
            await this._injectFileAsPath(file);
          }
        }
      });
    },

    async _injectFileAsPath(file) {
      if (!window.terminalAPI?.savePastedImage) return;
      try {
        const buf = await file.arrayBuffer();
        // Расширение: сначала по MIME-типу, потом по имени файла, иначе png.
        const mimeExt = (file.type || '').split('/')[1];
        const nameExt = file.name ? file.name.split('.').pop() : '';
        const ext = (mimeExt || nameExt || 'png').toLowerCase();
        const result = await window.terminalAPI.savePastedImage(buf, ext);
        if (result.error) {
          this.term?.write(`\r\n\x1b[31m[не удалось сохранить файл: ${result.error}]\x1b[0m\r\n`);
          return;
        }
        this._writePathToPty(result.path);
      } catch (err) {
        this.term?.write(`\r\n\x1b[31m[ошибка вставки: ${err.message}]\x1b[0m\r\n`);
      }
    },

    // Вставляет абсолютный путь в PTY. Кавычки на случай пробелов.
    // Enter не нажимаем — пользователь сам допишет вокруг фразу
    // («посмотри этот скриншот») и отправит. Подсказку в xterm НЕ пишем,
    // потому что это собьёт PTY echo: shell уже рисует путь в своей строке.
    _writePathToPty(filePath) {
      if (!this.sessionId || !window.terminalAPI || !filePath) return;
      const quoted = `"${filePath}"`;
      window.terminalAPI.write(this.sessionId, quoted);
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
