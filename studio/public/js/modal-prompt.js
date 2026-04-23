/*
 * Override window.prompt / window.confirm для Electron.
 * В Electron нативные prompt/confirm не работают (возвращают null без показа).
 * Замена: inline-модалка через DOM — промис с вводом.
 */
(function () {
  function createModal(message, defaultValue = '', isConfirm = false) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-prompt-overlay';
      overlay.innerHTML = `
        <div class="modal-prompt-card">
          <div class="modal-prompt-message"></div>
          ${isConfirm ? '' : '<input type="text" class="modal-prompt-input" />'}
          <div class="modal-prompt-buttons">
            <button type="button" class="btn btn-secondary btn-sm" data-action="cancel">Отмена</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="ok">OK</button>
          </div>
        </div>
      `;
      overlay.querySelector('.modal-prompt-message').textContent = String(message || '');

      const input = overlay.querySelector('.modal-prompt-input');
      if (input) input.value = defaultValue == null ? '' : String(defaultValue);

      const finish = (value) => {
        overlay.remove();
        resolve(value);
      };

      overlay.querySelector('[data-action="ok"]').addEventListener('click', () => {
        if (isConfirm) finish(true);
        else finish(input ? input.value : '');
      });
      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        finish(isConfirm ? false : null);
      });
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') finish(isConfirm ? false : null);
        if (e.key === 'Enter' && input) {
          e.preventDefault();
          finish(input.value);
        }
      });

      document.body.appendChild(overlay);
      setTimeout(() => (input ? input : overlay.querySelector('[data-action="ok"]')).focus(), 0);
    });
  }

  // Большинство кода наставника использует синхронный window.prompt(...).
  // Мы не можем сделать его синхронным в браузере, но можем возвращать Promise —
  // `await` работает, а старый код с `if (value === null) return` сломается молча.
  // Все callers мы обновляем на `await`.
  window.prompt = (msg, def) => createModal(msg, def, false);
  window.confirm = (msg) => createModal(msg, '', true);
})();
