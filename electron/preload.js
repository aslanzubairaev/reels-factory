/*
 * Preload — contextBridge API для renderer.
 *
 * Выставляет window.terminalAPI — безопасный тонкий клиент над IPC.
 * Renderer (terminal-panel.js) работает только через этот API, не имея
 * прямого доступа к Node.js / ipcRenderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioAPI', {
  updateScreenGuide: (payload) => ipcRenderer.send('screen-guide:update', payload)
});

contextBridge.exposeInMainWorld('terminalAPI', {
  // Получить список доступных AI-backends (claude/codex/aider/shell)
  listBackends: () => ipcRenderer.invoke('terminal:list-backends'),

  // Запустить новую сессию терминала для выбранного backend-id.
  // Возвращает { sessionId, command, pid } или { error }.
  spawn: (backendId) => ipcRenderer.invoke('terminal:spawn', backendId),

  // Отправить ввод (строку) в stdin процесса
  write: (sessionId, data) => ipcRenderer.invoke('terminal:write', sessionId, data),

  // Убить сессию
  kill: (sessionId) => ipcRenderer.invoke('terminal:kill', sessionId),

  // Обновить размер PTY (cols, rows)
  resize: (sessionId, cols, rows) => ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),

  // Открыть терминал в отдельном окне Electron
  openDetached: () => ipcRenderer.invoke('terminal:open-detached'),

  // Сохранить вставленное изображение во временный файл.
  // arg: ArrayBuffer (байты png/jpeg/webp/gif/bmp), ext: строка-расширение.
  // Возвращает { path } или { error }.
  savePastedImage: (arrayBuffer, ext) =>
    ipcRenderer.invoke('terminal:save-pasted-image', arrayBuffer, ext),

  // Подписка на stdout/stderr chunks — возвращает функцию-отписку
  onData: (handler) => {
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },

  // Подписка на событие «процесс завершился»
  onExit: (handler) => {
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  }
});
