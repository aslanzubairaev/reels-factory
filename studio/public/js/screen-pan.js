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
  guideEnabled: (() => {
    try { return localStorage.getItem('screenPanGuideEnabled') !== '0'; }
    catch (_) { return true; }
  })(),

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  },

  _emit() {
    for (const cb of this._listeners) {
      try { cb(this); } catch (_) {}
    }
    this._updateGuideOverlay();
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
    this._normalizeOffsets();
    this._emit();
  },

  setScale(s) {
    this.scale = Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, s));
    this._normalizeOffsets();
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
    this._normalizeOffsets();
    this._emit();
  },

  setCenter(x, y) {
    this.offsetX = Math.max(0, Math.min(1, x));
    this.offsetY = Math.max(0, Math.min(1, y));
    this._normalizeOffsets();
    this._emit();
  },

  zoomAt(delta, x, y) {
    this.offsetX = Math.max(0, Math.min(1, x));
    this.offsetY = Math.max(0, Math.min(1, y));
    this.setScale(this.scale * delta);
  },

  _getContainRenderSize(srcW, srcH, dstW = 1080, dstH = 1920) {
    const srcA = srcW / srcH;
    const dstA = dstW / dstH;
    let baseDw, baseDh;
    if (srcA > dstA) { baseDw = dstW; baseDh = dstW / srcA; }
    else { baseDh = dstH; baseDw = dstH * srcA; }
    return { dw: baseDw * this.scale, dh: baseDh * this.scale };
  },

  _clampContainOffsets(srcW, srcH, dstW = 1080, dstH = 1920, offsetX = this.offsetX, offsetY = this.offsetY) {
    const { dw, dh } = this._getContainRenderSize(srcW, srcH, dstW, dstH);
    const clampAxis = (offset, rendered, dst) => {
      if (rendered <= dst + 0.5) return 0.5;
      const min = dst / (2 * rendered);
      const max = 1 - min;
      return Math.max(min, Math.min(max, offset));
    };
    return {
      x: clampAxis(offsetX, dw, dstW),
      y: clampAxis(offsetY, dh, dstH)
    };
  },

  _normalizeOffsets() {
    if (this.mode !== 'contain') {
      this.offsetX = Math.max(0, Math.min(1, this.offsetX));
      this.offsetY = Math.max(0, Math.min(1, this.offsetY));
      return;
    }
    const sourceW = Math.max(1, window.innerWidth || 1920);
    const sourceH = Math.max(1, window.innerHeight || 1080);
    const clamped = this._clampContainOffsets(sourceW, sourceH, 1080, 1920);
    this.offsetX = clamped.x;
    this.offsetY = clamped.y;
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
    const { dw, dh } = this._getContainRenderSize(srcW, srcH, dstW, dstH);
    const clamped = this._clampContainOffsets(srcW, srcH, dstW, dstH);
    const dx = dstW / 2 - dw * clamped.x;
    const dy = dstH / 2 - dh * clamped.y;
    return { dx, dy, dw, dh };
  },

  computeContainVisibleSourceRect(srcW, srcH, dstW = 1080, dstH = 1920) {
    const r = this.computeContainRect(srcW, srcH, dstW, dstH);
    const ix1 = Math.max(0, r.dx);
    const iy1 = Math.max(0, r.dy);
    const ix2 = Math.min(dstW, r.dx + r.dw);
    const iy2 = Math.min(dstH, r.dy + r.dh);
    const iw = Math.max(1, ix2 - ix1);
    const ih = Math.max(1, iy2 - iy1);
    return {
      sx: ((ix1 - r.dx) / r.dw) * srcW,
      sy: ((iy1 - r.dy) / r.dh) * srcH,
      sw: (iw / r.dw) * srcW,
      sh: (ih / r.dh) * srcH
    };
  },

  applyControlCommand(command) {
    const step = command.fast ? 0.09 : 0.045;
    if (command.action === 'left') this.panBy(-step, 0);
    else if (command.action === 'right') this.panBy(step, 0);
    else if (command.action === 'up') this.panBy(0, -step);
    else if (command.action === 'down') this.panBy(0, step);
    else if (command.action === 'panBy') {
      const speed = command.fast ? 1.8 : 1;
      this.panBy((command.dx || 0) * speed, (command.dy || 0) * speed);
    }
    else if (command.action === 'centerAt') this.setCenter(command.x ?? this.offsetX, command.y ?? this.offsetY);
    else if (command.action === 'zoomAt') this.zoomAt(command.delta || 1, command.x ?? this.offsetX, command.y ?? this.offsetY);
    else if (command.action === 'preset') this.setCenter(command.x ?? this.offsetX, command.y ?? this.offsetY);
    else if (command.action === 'zoomIn') this.zoomBy(1.12);
    else if (command.action === 'zoomOut') this.zoomBy(1 / 1.12);
    else if (command.action === 'reset') this.reset();
    else if (command.action === 'toggleFit') {
      this.setMode(this.mode === 'contain' ? 'cover' : 'contain');
      this.reset();
    } else if (command.action === 'safeZoom') {
      this.setMode('contain');
      if (this.scale < 1.55) this.setScale(1.8);
      else if (this.scale < 2.35) this.setScale(2.7);
      else this.reset();
    } else if (command.action === 'toggleGuide') {
      this.guideEnabled = command.enabled ?? !this.guideEnabled;
      try { localStorage.setItem('screenPanGuideEnabled', this.guideEnabled ? '1' : '0'); } catch (_) {}
      this._updateGuideOverlay();
    }
  },

  _sendControlCommand(action, fast = false, extra = {}) {
    const command = {
      type: 'screen-pan-control',
      id: `${this._windowId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: this._windowId,
      action,
      fast,
      ...extra
    };
    this.applyControlCommand(command);
    try { this._channel?.postMessage(command); } catch (_) {}
  },

  _installRemoteControls() {
    if (this._remoteControlsInstalled) return;
    this._remoteControlsInstalled = true;
    this._windowId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if ('BroadcastChannel' in window) {
      this._channel = new BroadcastChannel('reels-factory-studio-controls');
      this._channel.addEventListener('message', (event) => {
        const command = event.data;
        if (!command || command.type !== 'screen-pan-control') return;
        if (command.sender === this._windowId || command.id === this._lastControlCommandId) return;
        this._lastControlCommandId = command.id;
        if (this._isActive()) this.applyControlCommand(command);
      });
    }

    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

      const key = e.key.toLowerCase();
      const code = e.code;

      if (e.altKey && !e.ctrlKey && (key === 'g' || key === 'п' || code === 'KeyG')) {
        e.preventDefault();
        this._sendControlCommand('toggleGuide', false, { enabled: !this.guideEnabled });
        return;
      }

      if (e.altKey && !e.ctrlKey && (e.key === '0' || key === 'f' || key === 'а' || code === 'KeyF')) {
        e.preventDefault();
        this._sendControlCommand('toggleFit');
        return;
      }

      if (e.altKey && !e.ctrlKey && (key === 's' || key === 'ы' || code === 'KeyS')) {
        e.preventDefault();
        this._sendControlCommand('safeZoom');
        return;
      }

      if (e.altKey && !e.ctrlKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        const xByKey = { '1': 0.18, '2': 0.5, '3': 0.82 };
        this._sendControlCommand('preset', false, { x: xByKey[e.key], y: this.offsetY });
        return;
      }

      if (!e.ctrlKey || !e.altKey) return;

      const map = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        '=': 'zoomIn',
        '+': 'zoomIn',
        '-': 'zoomOut',
        '_': 'zoomOut',
        '0': 'reset'
      };
      const action = map[e.key];
      if (!action) return;
      e.preventDefault();
      this._sendControlCommand(action, e.shiftKey);
    });

    let remoteDrag = null;
    window.addEventListener('mousedown', (e) => {
      const target = e.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (!e.altKey || e.button !== 0) return;
      remoteDrag = { x: e.clientX, y: e.clientY, moved: false };
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    }, true);

    window.addEventListener('mousemove', (e) => {
      if (!remoteDrag) return;
      const dx = e.clientX - remoteDrag.x;
      const dy = e.clientY - remoteDrag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) remoteDrag.moved = true;
      remoteDrag.x = e.clientX;
      remoteDrag.y = e.clientY;
      this._sendControlCommand('panBy', false, {
        dx: dx / Math.max(1, window.innerWidth),
        dy: dy / Math.max(1, window.innerHeight),
        fast: e.shiftKey
      });
      e.preventDefault();
    }, true);

    window.addEventListener('mouseup', (e) => {
      if (!remoteDrag) return;
      if (!remoteDrag.moved) {
        this._sendControlCommand('centerAt', false, {
          x: e.clientX / Math.max(1, window.innerWidth),
          y: e.clientY / Math.max(1, window.innerHeight)
        });
      }
      remoteDrag = null;
      document.body.style.cursor = '';
      e.preventDefault();
    }, true);

    window.addEventListener('wheel', (e) => {
      if (!e.altKey) return;
      e.preventDefault();
      this._sendControlCommand('zoomAt', false, {
        delta: e.deltaY > 0 ? (1 / 1.12) : 1.12,
        x: e.clientX / Math.max(1, window.innerWidth),
        y: e.clientY / Math.max(1, window.innerHeight)
      });
    }, { passive: false, capture: true });

    window.addEventListener('resize', () => this._updateGuideOverlay());
    window.addEventListener('scroll', () => this._updateGuideOverlay(), true);
    this._setupGuideOverlay();
  },

  _setupGuideOverlay() {
    if (window.studioAPI?.updateScreenGuide) {
      this._nativeGuideOverlay = true;
      this._updateGuideOverlay();
      this._guideUpdateTimer = setInterval(() => this._updateGuideOverlay(), 500);
      return;
    }
    if (this._guideOverlay) return;
    const overlay = document.createElement('div');
    overlay.className = 'screen-pan-guide-overlay';
    overlay.innerHTML = `
      <div class="screen-pan-guide-label">PHONE FRAME</div>
      <div class="screen-pan-guide-hint">Alt+click center / Alt+drag move / Alt+S safe zoom</div>
    `;
    document.body.appendChild(overlay);
    this._guideOverlay = overlay;
    this._updateGuideOverlay();
  },

  _updateGuideOverlay() {
    const sourceW = Math.max(1, window.innerWidth);
    const sourceH = Math.max(1, window.innerHeight);
    const rect = this.mode === 'contain'
      ? this.computeContainVisibleSourceRect(sourceW, sourceH, 1080, 1920)
      : this.computeCrop(sourceW, sourceH, 1080, 1920);

    if (this._nativeGuideOverlay) {
      window.studioAPI?.updateScreenGuide({
        enabled: this.guideEnabled,
        fitMode: this.mode === 'contain',
        rect: {
          x: rect.sx,
          y: rect.sy,
          width: rect.sw,
          height: rect.sh
        }
      });
      return;
    }

    const overlay = this._guideOverlay;
    if (!overlay) return;
    if (!this.guideEnabled) {
      overlay.classList.add('hidden');
      return;
    }

    overlay.classList.remove('hidden');
    overlay.classList.toggle('is-fit-mode', this.mode === 'contain');
    overlay.style.left = `${(rect.sx / sourceW) * 100}%`;
    overlay.style.top = `${(rect.sy / sourceH) * 100}%`;
    overlay.style.width = `${(rect.sw / sourceW) * 100}%`;
    overlay.style.height = `${(rect.sh / sourceH) * 100}%`;
  },

  /** Устанавливает mouse drag + wheel на phone-frame, рисует кнопки +/-/reset. */
  setupInteractions() {
    if (this._installed) return;
    this._installed = true;
    this._installRemoteControls();

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
