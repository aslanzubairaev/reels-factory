/*
 * Screen-picker модалка. Main-процесс вызывает window.__pickScreenSource(sources)
 * когда пользователь инициирует screen capture. Показываем сетку с thumbnail,
 * пользователь кликает на нужное окно/экран, мы возвращаем id.
 *
 * sources: [{ id, name, kind: 'screen'|'window', thumbnailDataUrl }]
 * Возвращает: string id или null (если отмена).
 */
(function () {
  window.__pickScreenSource = function (sources) {
    return new Promise((resolve) => {
      // Удаляем старую модалку если была
      document.querySelectorAll('.screen-picker-overlay').forEach(el => el.remove());

      const overlay = document.createElement('div');
      overlay.className = 'screen-picker-overlay';

      const screens = sources.filter(s => s.kind === 'screen');
      const windows = sources.filter(s => s.kind === 'window');

      const renderGroup = (title, items) => {
        if (!items.length) return '';
        const cards = items.map(s => `
          <button type="button" class="screen-picker-card" data-id="${escapeAttr(s.id)}">
            ${s.thumbnailDataUrl
              ? `<img class="screen-picker-thumb" src="${s.thumbnailDataUrl}" alt="">`
              : '<div class="screen-picker-thumb screen-picker-thumb-empty">Нет превью</div>'}
            <div class="screen-picker-name">${escapeHtml(s.name || '(без имени)')}</div>
          </button>
        `).join('');
        return `
          <div class="screen-picker-group">
            <div class="screen-picker-group-title">${title}</div>
            <div class="screen-picker-grid">${cards}</div>
          </div>
        `;
      };

      overlay.innerHTML = `
        <div class="screen-picker-card-outer">
          <div class="screen-picker-header">
            <div class="screen-picker-title">📺 Выбери источник захвата</div>
            <button type="button" class="screen-picker-close" data-action="cancel">✕</button>
          </div>
          <div class="screen-picker-body">
            ${renderGroup('Экраны целиком', screens)}
            ${renderGroup('Окна приложений', windows)}
          </div>
          <div class="screen-picker-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-action="cancel">Отмена</button>
          </div>
        </div>
      `;

      const finish = (id) => {
        overlay.remove();
        resolve(id);
      };

      overlay.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (target.classList.contains('screen-picker-overlay')) { finish(null); return; }
        if (target.dataset?.action === 'cancel' || target.closest('[data-action="cancel"]')) {
          finish(null);
          return;
        }
        const card = target.closest('.screen-picker-card');
        if (card) {
          finish(card.getAttribute('data-id'));
        }
      });

      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          finish(null);
        }
      });

      document.body.appendChild(overlay);
    });
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
