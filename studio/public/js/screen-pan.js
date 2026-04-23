/*
 * Screen Pan/Zoom — состояние позиционирования screen capture внутри 1080x1920.
 *
 * При захвате экрана ноутбука (1920x1080) в вертикальный кадр 1080x1920 по
 * умолчанию видна лишь узкая центральная полоса, остальной контент визуально
 * «сжат». Этот модуль даёт пользователю:
 *   - zoom (колесо мыши / кнопки): приближает часть, где идёт демонстрация
 *   - pan (перетаскивание мышью): сдвигает видимую область
 *   - reset: вернуть cover-fit центр
 *
 * Состояние применяется:
 *   1) к preview <canvas> в Background (real-time рендер)
 *   2) к записи через Canvas.drawBackground (тот же src-crop в выходной canvas)
 */
const ScreenPan = {
  // Масштаб: 1 = base fit (cover для screen_capture, contain для фото), больше = ближе.
  scale: 1.0,

  // Центр видимой области в нормализованных координатах исходного видео [0..1].
  offsetX: 0.5,
  offsetY: 0.5,

  // Режим базового вписывания:
  //   'cover'   — вертикальный кадр заполнен полностью, края source обрезаны (для screen_capture)
  //   'contain' — всё source видно целиком, по краям letterbox (для фото/видео)
  mode: 'cover',

  MIN_SCALE: 1.0,
  MAX_SCALE: 4.0,

  _listeners: new Set(),

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  },

  _emit() {
    for (const cb of this._listeners) {
      try { cb(this); } catch (_) {}
    }
  },

  reset() {
    this.scale = 1.0;
    this.offsetX = 0.5;
    this.offsetY = 0.5;
    this._emit();
  },

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    this._emit();
  },

  setScale(s) {
    this.scale = Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, s));
    this._emit();
  },

  zoomBy(delta) {
    this.setScale(this.scale * delta);
  },

  /** Сдвинуть центр видимой области. dx/dy — смещение в долях от TEKUSHCHEY видимой области. */
  panBy(dx, dy) {
    // Размер видимой области в [0..1]: 1/scale по "короткой" оси.
    // Конвертируем перемещение в source-координаты.
    this.offsetX = Math.max(0, Math.min(1, this.offsetX + dx));
    this.offsetY = Math.max(0, Math.min(1, this.offsetY + dy));
    this._emit();
  },

  /**
   * Вычисляет crop-параметры (sx, sy, sw, sh) для drawImage(video, ...) так,
   * чтобы вывод в dst (dstW x dstH, обычно 1080x1920) полностью покрывался
   * src после учёта scale + offset.
   */
  computeCrop(vw, vh, dstW = 1080, dstH = 1920) {
    if (!vw || !vh) return { sx: 0, sy: 0, sw: vw || 1, sh: vh || 1 };
    const srcAspect = vw / vh;
    const dstAspect = dstW / dstH;

    // Base cover area (scale=1)
    let sw, sh;
    if (srcAspect > dstAspect) {
      sh = vh;
      sw = vh * dstAspect;
    } else {
      sw = vw;
      sh = vw / dstAspect;
    }

    // Apply zoom — уменьшаем видимую область.
    sw /= this.scale;
    sh /= this.scale;

    // Центр в source-координатах
    const cx = this.offsetX * vw;
    const cy = this.offsetY * vh;

    let sx = cx - sw / 2;
    let sy = cy - sh / 2;

    // Clamp — не выходить за границы source
    sx = Math.max(0, Math.min(vw - sw, sx));
    sy = Math.max(0, Math.min(vh - sh, sy));

    return { sx, sy, sw, sh };
  },

  /**
   * Pan/zoom активен для любого фона, кроме face_only (там фона нет).
   */
  _isActive() {
    if (typeof App === 'undefined') return false;
    const part = App.state?.project?.parts?.[App.state?.currentPart];
    if (!part) return false;
    return part.layout !== 'face_only';
  },

  /**
   * Применяет текущие scale/offset к img/video как CSS-transform.
   * Работает поверх object-fit:cover и даёт пользователю pan+zoom без canvas.
   */
  _applyToMedia(el) {
    if (!el || el.tagName === 'CANVAS') return;
    el.style.objectFit = this.mode;
    const S = this.scale;
    const tx = (0.5 - this.offsetX) * 100;
    const ty = (0.5 - this.offsetY) * 100;
    el.style.transformOrigin = 'center center';
    el.style.transform = `scale(${S}) translate(${tx}%, ${ty}%)`;
    el.style.willChange = 'transform';
  },

  /**
   * Для contain-режима: возвращает dst-rect (dx,dy,dw,dh), куда нужно
   * отрисовать source целиком с учётом scale + offset.
   */
  computeContainRect(srcW, srcH, dstW = 1080, dstH = 1920) {
    if (!srcW || !srcH) return { dx: 0, dy: 0, dw: dstW, dh: dstH };
    const srcA = srcW / srcH;
    const dstA = dstW / dstH;
    let baseDw, baseDh;
    if (srcA > dstA) { baseDw = dstW; baseDh = dstW / srcA; }
    else { baseDh = dstH; baseDw = dstH * srcA; }
    const dw = baseDw * this.scale;
    const dh = baseDh * this.scale;
    const dx = dstW / 2 - dw * this.offsetX;
    const dy = dstH / 2 - dh * this.offsetY;
    return { dx, dy, dw, dh };
  },

  /** Устанавливает mouse drag + wheel на phone-frame, рисует кнопки +/-/reset. */
  setupInteractions() {
    if (this._installed) return;
    this._installed = true;

    const phone = document.getElementById('phone-frame');
    if (!phone) return;

    // === Drag ===
    let dragging = false;
    let lastX = 0, lastY = 0;
    phone.addEventListener('mousedown', (e) => {
      if (!this._isActive()) return;
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      phone.style.cursor = 'grabbing';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const rect = phone.getBoundingClientRect();
      // Перетаскиваем контент: увеличение offset в обратную сторону движения
      const panDx = -(dx / rect.width) / this.scale;
      const panDy = -(dy / rect.height) / this.scale;
      this.offsetX = Math.max(0, Math.min(1, this.offsetX + panDx));
      this.offsetY = Math.max(0, Math.min(1, this.offsetY + panDy));
      this._emit();
    });
    window.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; phone.style.cursor = ''; }
    });

    // === Wheel zoom ===
    phone.addEventListener('wheel', (e) => {
      if (!this._isActive()) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? (1 / 1.12) : 1.12;
      this.zoomBy(delta);
    }, { passive: false });

    // === Toolbar в углу phone-frame: + / - / reset / label ===
    const toolbar = document.createElement('div');
    toolbar.className = 'screen-pan-toolbar';
    toolbar.innerHTML = `
      <button type="button" class="screen-pan-btn" data-a="out" title="Отдалить">−</button>
      <span class="screen-pan-label">100%</span>
      <button type="button" class="screen-pan-btn" data-a="in" title="Приблизить">+</button>
      <button type="button" class="screen-pan-btn" data-a="reset" title="Сбросить">⟲</button>
    `;
    phone.appendChild(toolbar);

    const label = toolbar.querySelector('.screen-pan-label');
    const update = () => {
      label.textContent = `${Math.round(this.scale * 100)}%`;
      toolbar.style.display = this._isActive() ? 'flex' : 'none';
    };
    this.onChange(update);
    update();

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.screen-pan-btn');
      if (!btn) return;
      const a = btn.dataset.a;
      if (a === 'in') this.zoomBy(1.2);
      else if (a === 'out') this.zoomBy(1 / 1.2);
      else if (a === 'reset') this.reset();
    });

    // Периодически проверяем активность (например, при смене этапа)
    setInterval(update, 400);
  }
};

// Автоустановка после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ScreenPan.setupInteractions());
} else {
  ScreenPan.setupInteractions();
}
