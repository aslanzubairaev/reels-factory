/*
 * Electron main process — обёртка над Studio.
 *
 * При старте:
 *   1. Запускает Express-сервер Studio (studio/server.js) в отдельном child process.
 *   2. Ждёт пока localhost:3000 отзовётся.
 *   3. Создаёт окно с видом на http://localhost:3000.
 *
 * При выходе (закрытие окна или приложения):
 *   — Убивает дочерний сервер.
 *   — Приложение закрывается полностью.
 */

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, session, desktopCapturer, webContents } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

// Recording is rendered by a canvas in the Studio window. If Chromium throttles
// an occluded/background window, the saved video freezes while the demo window
// is active, so keep renderer timers/RAF alive during recording.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// node-pty с prebuilt бинарниками. Нужен для интерактивных TTY-приложений
// (claude, codex, cmd.exe с prompt) — они проверяют isatty и отказываются
// работать через обычный pipe.
let pty = null;
try {
  pty = require('@lydell/node-pty');
} catch (e) {
  console.warn('node-pty не загрузился:', e.message);
}

const PORT = process.env.PORT || 3000;
const STUDIO_URL = `http://localhost:${PORT}`;
const SERVER_SCRIPT = path.join(__dirname, '..', 'studio', 'server.js');
const BACKENDS_CONFIG = path.join(__dirname, 'ai-backends.json');

let serverProcess = null;
let mainWindow = null;
const studioWindows = new Set();
const screenGuideOverlays = new Map();

// === Терминал-сессии ===
// Держим мапу { sessionId → { proc, backendId } }. Renderer отличает события по sessionId.
const terminalSessions = new Map();
let nextSessionId = 1;

function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Сервер Studio не запустился за ${timeoutMs}ms`));
      } else {
        setTimeout(poll, 250);
      }
    };
    poll();
  });
}

function probeStudioServer(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (body.length < 4096) body += chunk;
      });
      res.on('end', () => {
        resolve(Boolean(res.statusCode && res.statusCode < 500 && /Reels Factory/i.test(body)));
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

// Проверяет, свободен ли порт. Резолвится в true/false.
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, '127.0.0.1');
  });
}

// Находит PID процесса, слушающего порт на Windows.
// Возвращает число PID или null.
function findPidOnPort(port) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('netstat', ['-ano'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        // Ищем строку вида:  TCP    0.0.0.0:3000           ...   LISTENING       12345
        if (!/LISTENING/.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const local = parts[1] || '';
        if (!local.endsWith(`:${port}`)) continue;
        const pid = parseInt(parts[parts.length - 1], 10);
        if (Number.isFinite(pid)) return resolve(pid);
      }
      resolve(null);
    });
  });
}

// Возвращает путь исполняемого файла процесса по PID (Windows). null если не найден.
function getProcessPath(pid) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`],
      { windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        const p = (stdout || '').trim();
        resolve(p || null);
      }
    );
  });
}

function killPid(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
    } else {
      try { process.kill(pid, 'SIGKILL'); } catch (_) {}
      resolve();
    }
  });
}

// Если порт занят НАШИМ собственным стейл-electron от прошлого запуска — убиваем.
// Если занят кем-то другим — кидаем понятную ошибку, не трогаем чужой процесс.
async function ensurePortFree(port) {
  if (await isPortFree(port)) return;

  const pid = await findPidOnPort(port);
  if (!pid || pid === process.pid) {
    throw new Error(`Порт ${port} занят, но процесс не определён. Освободи порт вручную.`);
  }

  const procPath = await getProcessPath(pid);
  const projectRoot = path.resolve(__dirname, '..').toLowerCase();
  const isOurs = procPath && procPath.toLowerCase().startsWith(projectRoot) &&
    /electron\.exe$/i.test(procPath);

  if (!isOurs) {
    throw new Error(
      `Порт ${port} занят процессом PID ${pid}` +
      (procPath ? ` (${procPath})` : '') +
      `.\nЭто не Reels Factory — освободи порт вручную или измени PORT в .env.`
    );
  }

  console.warn(`[startup] Порт ${port} занят стейл-процессом Reels Factory (PID ${pid}). Убиваю.`);
  await killPid(pid);

  // Ждём до 5 сек пока ОС реально освободит сокет (TIME_WAIT может задержать)
  for (let i = 0; i < 20; i++) {
    if (await isPortFree(port)) return;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Порт ${port} не освободился после убийства стейл-процесса PID ${pid}.`);
}

function startServer() {
  if (serverProcess) return Promise.resolve();

  serverProcess = spawn(process.execPath, [SERVER_SCRIPT], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  serverProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[studio] ${chunk}`);
  });
  serverProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[studio:err] ${chunk}`);
  });
  serverProcess.on('exit', (code) => {
    console.log(`[studio] server exited with code ${code}`);
    serverProcess = null;
    // Если сервер упал раньше окна — закрываем всё.
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('Сервер Studio упал', `Код выхода: ${code}. Приложение будет закрыто.`);
      app.quit();
    }
  });

  return waitForServer(STUDIO_URL);
}

function stopServer() {
  if (!serverProcess) return;
  try {
    if (process.platform === 'win32') {
      // taskkill — единственный надёжный способ убить дерево на Windows
      spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F'], { windowsHide: true });
    } else {
      serverProcess.kill('SIGTERM');
      setTimeout(() => serverProcess && serverProcess.kill('SIGKILL'), 3000);
    }
  } catch (e) {
    console.warn('Не удалось остановить сервер:', e);
  }
  serverProcess = null;
}

function getScreenGuideHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
    .frame {
      position: absolute;
      inset: 0;
      border: 2px solid rgba(255, 107, 0, 0.95);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.72), 0 0 0 1px rgba(0,0,0,0.55);
      box-sizing: border-box;
      font-family: Inter, Segoe UI, Arial, sans-serif;
    }
    .fit .frame { border-color: rgba(255,255,255,0.9); }
    .label, .hint {
      position: absolute;
      left: 8px;
      padding: 4px 7px;
      border-radius: 4px;
      background: rgba(10,10,20,0.86);
      color: white;
      white-space: nowrap;
      user-select: none;
    }
    .label { top: 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; }
    .hint { bottom: 8px; font-size: 11px; opacity: 0.82; }
    .zone { position: absolute; border: 1px dashed rgba(255,255,255,0.55); background: rgba(255,107,0,0.08); box-sizing: border-box; }
    .zone-top { left: 0; top: 0; width: 100%; height: 7.8125%; }
    .zone-right { right: 0; top: 39.0625%; width: 15%; height: 39.0625%; }
    .zone-bottom { left: 0; bottom: 0; width: 100%; height: 19.7917%; }
  </style>
</head>
<body>
  <div class="frame">
    <div class="zone zone-top"></div>
    <div class="zone zone-right"></div>
    <div class="zone zone-bottom"></div>
    <div class="label">PHONE FRAME</div>
    <div class="hint">Alt+click center / Alt+drag move / Alt+S safe zoom</div>
  </div>
</body>
</html>`;
}

function getOrCreateScreenGuideOverlay(ownerWindow) {
  const ownerId = ownerWindow.id;
  const existing = screenGuideOverlays.get(ownerId);
  if (existing && !existing.isDestroyed()) return existing;

  const overlay = new BrowserWindow({
    parent: ownerWindow,
    width: 300,
    height: 500,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getScreenGuideHtml())}`);

  screenGuideOverlays.set(ownerId, overlay);
  ownerWindow.on('minimize', () => {
    if (!overlay.isDestroyed()) overlay.hide();
  });
  ownerWindow.once('closed', () => {
    screenGuideOverlays.delete(ownerId);
    if (!overlay.isDestroyed()) overlay.destroy();
  });
  overlay.on('closed', () => screenGuideOverlays.delete(ownerId));
  return overlay;
}

function updateScreenGuideOverlay(event, payload = {}) {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWindow || ownerWindow.isDestroyed()) return;

  if (!payload.enabled) {
    for (const [id, overlay] of screenGuideOverlays) {
      screenGuideOverlays.delete(id);
      if (!overlay.isDestroyed()) overlay.destroy();
    }
    return;
  }

  if (!ownerWindow.isFocused() || ownerWindow.isMinimized()) return;

  const rect = payload.rect || {};
  const width = Math.max(80, Math.round(rect.width || 0));
  const height = Math.max(120, Math.round(rect.height || 0));
  if (!width || !height) return;

  const content = ownerWindow.getContentBounds();
  const bounds = {
    x: Math.round(content.x + (rect.x || 0)),
    y: Math.round(content.y + (rect.y || 0)),
    width,
    height
  };

  const overlay = getOrCreateScreenGuideOverlay(ownerWindow);
  overlay.setBounds(bounds, false);
  overlay.webContents.executeJavaScript(
    `document.body.classList.toggle('fit', ${payload.fitMode ? 'true' : 'false'});`,
    true
  ).catch(() => {});
  if (!overlay.isVisible()) overlay.showInactive();
}

function createWindow(options = {}) {
  const win = new BrowserWindow({
    width: options.width || 1400,
    height: options.height || 900,
    minWidth: 1100,
    minHeight: 720,
    title: options.title || 'Reels Factory Studio',
    backgroundColor: '#0a0a14',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // разрешаем запрос media (camera, microphone, display) в loopback-контексте
      webSecurity: true,
      backgroundThrottling: false
    }
  });
  studioWindows.add(win);
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = win;

  // Минимальное меню: только Reload / DevTools / Quit.
  const menuTemplate = [
    {
      label: 'Studio',
      submenu: [
        {
          label: 'Новое окно Studio',
          accelerator: 'CommandOrControl+N',
          click: () => createWindow({
            title: 'Reels Factory Studio - Demo',
            width: 1200,
            height: 820
          })
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'quit', label: 'Выйти' }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  win.webContents.on('page-title-updated', (event) => {
    if (options.title) event.preventDefault();
  });
  win.loadURL(STUDIO_URL);

  // Логируем ошибки renderer в main-лог (без авто-открытия DevTools).
  // Открыть DevTools можно вручную через меню Studio → Toggle Developer Tools
  // или горячую клавишу F12 / Ctrl+Shift+I.
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level === 3) {
      console.error(`[renderer:ERROR] ${message} (${sourceId}:${line})`);
    } else if (level === 2) {
      console.warn(`[renderer:WARN] ${message}`);
    }
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] render-process-gone:', details);
  });

  // Внешние ссылки — в системный браузер, а не в окне приложения.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(STUDIO_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.on('closed', () => {
    studioWindows.delete(win);
    if (mainWindow === win) mainWindow = [...studioWindows][0] || null;
  });

  return win;
}

// === Загрузка AI-backends конфига ===
function loadBackendsConfig() {
  try {
    const raw = fs.readFileSync(BACKENDS_CONFIG, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Не удалось загрузить ai-backends.json:', e.message);
    return { backends: {}, default: null, order: [] };
  }
}

function resolveCommand(backendId, config) {
  const entry = config.backends?.[backendId];
  if (!entry) return null;
  const platform = process.platform; // 'win32' | 'darwin' | 'linux'
  const cmd = entry.command?.[platform] || entry.command?.linux || null;
  if (!cmd) return null;
  return { command: cmd, args: entry.args || [], label: entry.label, hint: entry.install_hint };
}

// На Windows .lnk может пробросить обрезанный PATH. Восстанавливаем типичные директории,
// куда ставятся npm global binaries (claude.cmd, codex.cmd и т.д.).
function buildChildEnv() {
  const env = { ...process.env };
  if (process.platform === 'win32') {
    const extras = [
      path.join(process.env.APPDATA || '', 'npm'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'npm'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'Scripts'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'Scripts'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python314', 'Scripts')
    ].filter(Boolean);
    const currentPath = env.PATH || env.Path || '';
    const parts = new Set(currentPath.split(';').map(p => p.trim()).filter(Boolean));
    for (const extra of extras) parts.add(extra);
    env.PATH = [...parts].join(';');
  }
  return env;
}

// Папка для временных вставленных картинок. Создаётся лениво.
// Путь: %TEMP%\reels-factory-pastes (Windows) или /tmp/reels-factory-pastes.
// Файлы живут между сессиями (OS очистит при перезагрузке / очистке tmp).
function getPasteTempDir() {
  const dir = path.join(os.tmpdir(), 'reels-factory-pastes');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn('Не удалось создать temp-папку для вставленных картинок:', e.message);
  }
  return dir;
}

// Whitelist расширений. Всё остальное (svg, exe и т.д.) отвергаем —
// картинки должны быть бинарными растрами.
const ALLOWED_PASTE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);

// === IPC: сохранить вставленное изображение и вернуть путь ===
// Renderer шлёт сюда ArrayBuffer и расширение. Мы пишем байты в temp-файл
// и отдаём абсолютный путь обратно — renderer инжектит его в PTY.
ipcMain.handle('terminal:save-pasted-image', (_event, buffer, ext) => {
  try {
    const cleanExt = String(ext || 'png').toLowerCase().replace(/^\./, '');
    if (!ALLOWED_PASTE_EXT.has(cleanExt)) {
      return { error: `Неподдерживаемое расширение: ${cleanExt}` };
    }
    const bytes = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(new Uint8Array(buffer));
    if (!bytes.length) return { error: 'Пустой буфер' };
    if (bytes.length > 50 * 1024 * 1024) {
      return { error: 'Картинка больше 50MB — откажусь сохранять' };
    }

    const dir = getPasteTempDir();
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const filename = `paste-${ts}-${rand}.${cleanExt}`;
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, bytes);
    return { path: fullPath };
  } catch (e) {
    return { error: e.message };
  }
});

// === IPC: список backends ===
ipcMain.on('screen-guide:update', updateScreenGuideOverlay);

ipcMain.handle('terminal:list-backends', () => {
  const config = loadBackendsConfig();
  const result = [];
  const order = config.order && config.order.length ? config.order : Object.keys(config.backends);
  for (const id of order) {
    const entry = config.backends[id];
    if (!entry) continue;
    result.push({
      id,
      label: entry.label,
      description: entry.description,
      isDefault: id === config.default
    });
  }
  return { backends: result, default: config.default };
});

// === IPC: запуск процесса через PTY ===
ipcMain.handle('terminal:spawn', (event, backendId) => {
  if (!pty) {
    return { error: 'node-pty не загружен — переустанови пакет @lydell/node-pty' };
  }

  const config = loadBackendsConfig();
  const resolved = resolveCommand(backendId, config);
  if (!resolved) {
    return { error: `Backend "${backendId}" не найден в ai-backends.json` };
  }

  const cwd = path.join(__dirname, '..');
  const sessionId = String(nextSessionId++);

  // На Windows node-pty ConPTY не умеет искать бинарники по PATH — ему нужен абсолютный
  // путь. cmd.exe/powershell.exe лежат в System32 (известно), а claude.cmd / codex.cmd
  // в %APPDATA%\npm — ConPTY их не находит. Выход: оборачиваем в `cmd.exe /c <cmd>`.
  // Для backend id="shell" сохраняем прямой запуск — это уже интерактивный cmd.exe.
  let finalCommand = resolved.command;
  let finalArgs = resolved.args;
  if (process.platform === 'win32' && backendId !== 'shell') {
    finalCommand = 'cmd.exe';
    finalArgs = ['/c', resolved.command, ...resolved.args];
  }

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(finalCommand, finalArgs, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd,
      env: buildChildEnv(),
      // На Windows будет ConPTY (современный), на Unix — openpty.
      useConpty: process.platform === 'win32'
    });
  } catch (e) {
    return {
      error: `Не удалось запустить ${resolved.label}: ${e.message}` +
        (resolved.hint ? `\n\nПодсказка: установи через "${resolved.hint}"` : '')
    };
  }

  terminalSessions.set(sessionId, { proc: ptyProcess, backendId });

  const sendToSender = (channel, payload) => {
    const contents = event.sender;
    if (contents && !contents.isDestroyed()) contents.send(channel, payload);
  };

  ptyProcess.onData((data) => {
    sendToSender('terminal:data', { sessionId, stream: 'stdout', data });
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    sendToSender('terminal:exit', { sessionId, code: exitCode, signal: signal || null });
    terminalSessions.delete(sessionId);
  });

  return {
    sessionId,
    command: resolved.command,
    label: resolved.label,
    pid: ptyProcess.pid
  };
});

// === IPC: отправка ввода в PTY ===
ipcMain.handle('terminal:write', (_event, sessionId, data) => {
  const session = terminalSessions.get(String(sessionId));
  if (!session) return { error: 'Сессия не найдена' };
  try {
    session.proc.write(data);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// === IPC: resize PTY (когда меняется размер панели) ===
ipcMain.handle('terminal:resize', (_event, sessionId, cols, rows) => {
  const session = terminalSessions.get(String(sessionId));
  if (!session) return { ok: false };
  try {
    session.proc.resize(Math.max(1, cols | 0), Math.max(1, rows | 0));
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// === IPC: убийство сессии ===
ipcMain.handle('terminal:kill', (_event, sessionId) => {
  const session = terminalSessions.get(String(sessionId));
  if (!session) return { ok: true };
  try {
    session.proc.kill();
  } catch (e) {
    console.warn('Не удалось убить сессию:', e.message);
  }
  terminalSessions.delete(String(sessionId));
  return { ok: true };
});

// Отдельное окно с terminal-view (без остального UI Studio)
let detachedTerminalWindow = null;
ipcMain.handle('terminal:open-detached', () => {
  if (detachedTerminalWindow && !detachedTerminalWindow.isDestroyed()) {
    detachedTerminalWindow.focus();
    return { ok: true };
  }
  detachedTerminalWindow = new BrowserWindow({
    width: 900,
    height: 600,
    title: 'Reels Factory — Terminal',
    backgroundColor: '#0a0a14',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  detachedTerminalWindow.loadURL(`${STUDIO_URL}/terminal-window.html`);
  detachedTerminalWindow.on('closed', () => { detachedTerminalWindow = null; });
  return { ok: true };
});

// Убить все сессии при выходе
function killAllTerminalSessions() {
  for (const [sessionId, session] of terminalSessions) {
    try { session.proc.kill(); } catch (_) {}
  }
  terminalSessions.clear();
}

app.whenReady().then(async () => {
  try {
    if (await isPortFree(PORT)) {
      await startServer();
    } else if (await probeStudioServer(STUDIO_URL)) {
      console.log(`[startup] Reusing existing Studio server at ${STUDIO_URL}`);
    } else {
      await ensurePortFree(PORT);
      await startServer();
    }
  } catch (e) {
    dialog.showErrorBox('Не удалось запустить Studio', e.message);
    app.quit();
    return;
  }

  // Кастомный picker экрана: main просит renderer показать модалку со списком
  // источников. Renderer возвращает выбранный id. Надёжнее, чем useSystemPicker
  // (тот работает не на всех версиях Windows).
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 200 }
      });
      if (!sources.length) {
        callback({});
        return;
      }

      // Сериализуем с thumbnail как dataURL
      const payload = sources.map(s => ({
        id: s.id,
        name: s.name,
        display_id: s.display_id,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnailDataUrl: s.thumbnail?.toDataURL?.() || null
      }));

      const requesterContents = request.frame ? webContents.fromFrame(request.frame) : null;
      const pickerWindow = requesterContents
        ? BrowserWindow.fromWebContents(requesterContents)
        : (BrowserWindow.getFocusedWindow() || mainWindow);

      if (!pickerWindow || pickerWindow.isDestroyed()) {
        callback({ video: sources[0] });
        return;
      }

      // Показываем picker в renderer и ждём выбора
      const pickedId = await pickerWindow.webContents.executeJavaScript(
        `window.__pickScreenSource(${JSON.stringify(payload)})`
      );
      if (!pickedId) {
        // Отмена
        callback({});
        return;
      }
      const chosen = sources.find(s => s.id === pickedId) || sources[0];
      callback({ video: chosen });
    } catch (err) {
      console.error('[main] display-media handler error:', err);
      callback({});
    }
  });

  createWindow();

  app.on('activate', () => {
    // macOS: если окон нет, пересоздаём. На Windows/Linux не триггерится.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killAllTerminalSessions();
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { killAllTerminalSessions(); stopServer(); });
app.on('will-quit', () => { killAllTerminalSessions(); stopServer(); });
