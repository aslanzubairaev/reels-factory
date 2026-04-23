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

  // Голосовой ввод: диктуешь в textarea, Enter → в pty активной сессии
  const voiceInput = document.getElementById('detached-voice-input');
  const voiceSend = document.getElementById('detached-voice-send');
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

  // Paste-handler на xterm textarea — для clipboard-based voice tools
  if (term.textarea) {
    term.textarea.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') || '';
      if (text && sessionId) {
        e.preventDefault();
        e.stopPropagation();
        window.terminalAPI.write(sessionId, text);
      }
    });
  }

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
