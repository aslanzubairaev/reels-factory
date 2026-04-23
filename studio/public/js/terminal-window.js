/*
 * Detached terminal окно — выделено из inline <script> в terminal-window.html,
 * чтобы не нарушать CSP `script-src 'self'` (без 'unsafe-inline').
 *
 * Логика та же что и в TerminalPanel/TerminalUI, но в standalone-окне:
 *   - один xterm.js поверх pty-сессии
 *   - dropdown выбора AI-CLI
 *   - voice-input bar для Wispr Flow
 *   - paste-handler для clipboard-based voice tools
 */
(async function () {
  if (typeof window.Terminal !== 'function' || !window.terminalAPI) {
    document.body.innerHTML = '<div style="padding:20px">Terminal API недоступен</div>';
    return;
  }

  const term = new window.Terminal({
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    cursorBlink: true,
    convertEol: true,
    scrollback: 5000,
    theme: { background: '#0a0a14', foreground: '#d8dee9', cursor: '#ff6b00' }
  });
  const fit = window.FitAddon?.FitAddon ? new window.FitAddon.FitAddon() : null;
  if (fit) term.loadAddon(fit);

  const host = document.getElementById('detached-terminal-host');
  term.open(host);
  fit?.fit();
  term.focus();

  let sessionId = null;
  const statusEl = document.getElementById('detached-status');
  const setStatus = (t) => { statusEl.textContent = t || ''; };

  const { backends, default: defaultId } = await window.terminalAPI.listBackends();
  const select = document.getElementById('detached-backend-select');
  backends.forEach(b => {
    const o = document.createElement('option');
    o.value = b.id; o.textContent = b.label;
    if (b.id === defaultId) o.selected = true;
    select.appendChild(o);
  });

  const spawn = async () => {
    if (sessionId) { await window.terminalAPI.kill(sessionId); sessionId = null; }
    term.clear();
    setStatus(`Запускаю ${select.value}...`);
    const res = await window.terminalAPI.spawn(select.value);
    if (res.error) { setStatus(res.error); return; }
    sessionId = res.sessionId;
    setStatus(`${res.label} — pid ${res.pid}`);
    term.write(`\x1b[36m=== ${res.label} запущен ===\x1b[0m\r\n`);
  };

  window.terminalAPI.onData(p => {
    if (p.sessionId === sessionId) term.write(p.data);
  });
  window.terminalAPI.onExit(p => {
    if (p.sessionId === sessionId) {
      term.write(`\r\n\x1b[90m[сессия завершена, код ${p.code}]\x1b[0m\r\n`);
      sessionId = null;
    }
  });

  term.onData(d => {
    if (sessionId) window.terminalAPI.write(sessionId, d);
  });

  select.addEventListener('change', spawn);
  document.getElementById('detached-restart').addEventListener('click', spawn);
  document.getElementById('detached-clear').addEventListener('click', () => term.clear());

  // Голосовой ввод: по умолчанию Wispr Flow пишет прямо в xterm (скрытая
  // xterm-textarea растянута CSS-ом до 320x24 — DOM-сканеры её видят).
  // Это нижнее поле-буфер — fallback, включается кнопкой 🎙 в header'е.
  const voiceInput = document.getElementById('detached-voice-input');
  const voiceSend = document.getElementById('detached-voice-send');
  const voiceBar = document.getElementById('detached-voice-bar');
  const voiceToggle = document.getElementById('detached-voice-toggle');

  const sendVoice = () => {
    const txt = voiceInput.value.trim();
    if (!txt) return;
    if (!sessionId) {
      term.write('\r\n\x1b[33m[нет активной сессии]\x1b[0m\r\n');
      return;
    }
    window.terminalAPI.write(sessionId, txt + '\r');
    voiceInput.value = '';
    voiceInput.style.height = '';
  };
  voiceSend.addEventListener('click', sendVoice);
  voiceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendVoice(); }
  });
  voiceInput.addEventListener('input', () => {
    voiceInput.style.height = 'auto';
    voiceInput.style.height = Math.min(90, voiceInput.scrollHeight) + 'px';
  });

  // Тоггл видимости поля-буфера. Общий localStorage-ключ с inline-панелью,
  // чтобы выбор пользователя был один для обоих окон.
  const applyVoiceBar = (visible) => {
    voiceBar.classList.toggle('hidden', !visible);
    voiceToggle.classList.toggle('is-active', visible);
    voiceToggle.title = visible
      ? 'Скрыть поле голосового ввода (Wispr Flow может писать прямо в терминал)'
      : 'Показать отдельное поле-буфер для голоса (fallback, если Wispr плохо видит xterm)';
  };
  const MIGRATION_KEY = 'terminal.voiceBarMigratedV2';
  if (!localStorage.getItem(MIGRATION_KEY)) {
    localStorage.setItem('terminal.voiceBarVisible', '0');
    localStorage.setItem(MIGRATION_KEY, '1');
  }
  const savedRaw = localStorage.getItem('terminal.voiceBarVisible');
  applyVoiceBar(savedRaw === '1');
  voiceToggle.addEventListener('click', () => {
    const next = voiceBar.classList.contains('hidden');
    applyVoiceBar(next);
    localStorage.setItem('terminal.voiceBarVisible', next ? '1' : '0');
    if (next) voiceInput.focus();
    else term.focus();
    setTimeout(() => fit?.fit(), 50);
  });

  // Инжектит абсолютный путь в PTY. Кавычки — на случай пробелов.
  // Enter не жмём: пользователь сам допишет фразу ("посмотри этот скриншот").
  const writePathToPty = (filePath) => {
    if (!sessionId || !filePath) return;
    window.terminalAPI.write(sessionId, `"${filePath}"`);
  };

  // Сохраняет File/Blob через IPC во временный файл и инжектит путь.
  // Используется для скриншотов из буфера (без file.path) и для drop-файлов,
  // у которых тоже нет path в web-контексте.
  const injectFileAsPath = async (file) => {
    if (!file || !window.terminalAPI?.savePastedImage) return;
    try {
      const buf = await file.arrayBuffer();
      const mimeExt = (file.type || '').split('/')[1];
      const nameExt = file.name ? file.name.split('.').pop() : '';
      const ext = (mimeExt || nameExt || 'png').toLowerCase();
      const res = await window.terminalAPI.savePastedImage(buf, ext);
      if (res.error) {
        term.write(`\r\n\x1b[31m[не удалось сохранить файл: ${res.error}]\x1b[0m\r\n`);
        return;
      }
      writePathToPty(res.path);
    } catch (err) {
      term.write(`\r\n\x1b[31m[ошибка вставки: ${err.message}]\x1b[0m\r\n`);
    }
  };

  // Paste: картинки → временный файл → путь в PTY. Текст — как было,
  // включая голосовой ввод Wispr Flow через скрытую xterm-textarea.
  const pasteHandler = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let imageItem = null;
    for (const item of items) {
      if (item.kind === 'file' && item.type?.startsWith('image/')) {
        imageItem = item;
        break;
      }
    }
    if (imageItem) {
      e.preventDefault();
      e.stopPropagation();
      const file = imageItem.getAsFile();
      if (file) injectFileAsPath(file);
      return;
    }
    const text = e.clipboardData?.getData('text') || '';
    if (text && sessionId) {
      e.preventDefault();
      e.stopPropagation();
      window.terminalAPI.write(sessionId, text);
    }
  };
  term.textarea?.addEventListener('paste', pasteHandler);
  host.addEventListener('paste', pasteHandler);

  // Drag-and-drop файлов на терминал — путь в PTY. file.path есть для файлов
  // с диска, для drag-внутри-браузера используется injectFileAsPath.
  const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    host.addEventListener(evt, prevent);
  });
  host.addEventListener('dragover', () => host.classList.add('terminal-drop-hover'));
  host.addEventListener('dragleave', () => host.classList.remove('terminal-drop-hover'));
  host.addEventListener('drop', async (e) => {
    host.classList.remove('terminal-drop-hover');
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    for (const file of files) {
      if (file.path) writePathToPty(file.path);
      else await injectFileAsPath(file);
    }
  });

  window.addEventListener('resize', () => {
    fit?.fit();
    if (sessionId && window.terminalAPI.resize) {
      window.terminalAPI.resize(sessionId, term.cols, term.rows);
    }
  });
  window.addEventListener('beforeunload', () => {
    if (sessionId) window.terminalAPI.kill(sessionId);
  });

  await spawn();
})();
