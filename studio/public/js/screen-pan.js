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
  // Масштаб: 1 = base cover (вся высота/ширина как cover-fit), больше = ближе.
  scale: 1.0,

  // Центр видимой области в нормализованных координатах исходного видео [0..1].
  offsetX: 0.5,
  offsetY: 0.5,

  MIN_SCALE: 0.5,
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
  }
};
