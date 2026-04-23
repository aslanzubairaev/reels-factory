/**
 * Takes module — менеджер дублей (записанных фрагментов) текущего этапа.
 *
 * Раньше при нажатии «Перезаписать» предыдущий дубль просто терялся.
 * Теперь он архивируется сюда: пользователь видит список всех попыток,
 * может сравнить, пометить любой как ⭐ «лучший» и сохранить именно его.
 *
 * Все дубли живут только в памяти браузера. При выходе из студии / смене
 * проекта вызывается clear() — дубли не утекают в другие проекты.
 */
const Takes = {
  // Map<partNumber, Take[]>. Take: { id, blob, durationMs, timestamp, isBest, thumbnail, objectUrl }
  _byPart: new Map(),
  _idCounter: 1,

  /**
   * Добавляет дубль для этапа. Возвращает объект take.
   * Миниатюру берём из первого кадра blob через offscreen video → canvas.
   */
  async add(partNumber, blob, durationMs) {
    if (!blob || !(blob instanceof Blob)) return null;

    const id = `take-${this._idCounter++}`;
    const objectUrl = URL.createObjectURL(blob);
    let thumbnail = '';
    try {
      thumbnail = await this._extractThumbnail(objectUrl);
    } catch (e) {
      console.warn('Не удалось сделать превью дубля:', e);
    }

    const take = {
      id,
      partNumber,
      blob,
      objectUrl,
      thumbnail,
      durationMs: durationMs || 0,
      timestamp: Date.now(),
      isBest: false
    };

    const list = this._byPart.get(partNumber) || [];
    list.push(take);
    this._byPart.set(partNumber, list);
    return take;
  },

  list(partNumber) {
    return this._byPart.get(partNumber) || [];
  },

  hasAny(partNumber) {
    return (this._byPart.get(partNumber) || []).length > 0;
  },

  /**
   * Помечает take как «лучший». Предыдущий best в этом этапе — сбрасывается
   * (только один best на этап). Повторный клик — снимает отметку.
   */
  toggleBest(partNumber, takeId) {
    const list = this._byPart.get(partNumber);
    if (!list) return;
    const target = list.find(t => t.id === takeId);
    if (!target) return;
    const wasBest = target.isBest;
    list.forEach(t => { t.isBest = false; });
    target.isBest = !wasBest;
  },

  remove(partNumber, takeId) {
    const list = this._byPart.get(partNumber);
    if (!list) return;
    const idx = list.findIndex(t => t.id === takeId);
    if (idx < 0) return;
    const [removed] = list.splice(idx, 1);
    try { URL.revokeObjectURL(removed.objectUrl); } catch (e) {}
    if (list.length === 0) {
      this._byPart.delete(partNumber);
    }
  },

  /**
   * Возвращает blob для сохранения: сначала best, иначе последний дубль.
   * Если ничего нет — null.
   */
  getBestOrLatest(partNumber) {
    const list = this._byPart.get(partNumber);
    if (!list || !list.length) return null;
    return list.find(t => t.isBest) || list[list.length - 1];
  },

  /**
   * Очищает все дубли (при выходе из студии / смене проекта).
   */
  clear() {
    for (const list of this._byPart.values()) {
      list.forEach(t => {
        try { URL.revokeObjectURL(t.objectUrl); } catch (e) {}
      });
    }
    this._byPart.clear();
    this._idCounter = 1;
  },

  /**
   * Достаёт превью-кадр из blob: грузим в скрытый video, ждём loadeddata,
   * переводим currentTime на 0.2s (чтобы поймать устоявшийся кадр, а не чёрный
   * первый фрейм), рисуем в canvas, возвращаем dataURL.
   */
  _extractThumbnail(objectUrl) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      video.src = objectUrl;

      const cleanup = () => {
        video.src = '';
      };

      video.addEventListener('loadeddata', () => {
        try {
          const targetTime = Math.min(0.2, (video.duration || 1) * 0.1);
          video.currentTime = targetTime;
        } catch (e) {
          cleanup();
          reject(e);
        }
      }, { once: true });

      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 160;
          const vw = video.videoWidth || 160;
          const vh = video.videoHeight || 90;
          const scale = maxDim / Math.max(vw, vh);
          canvas.width = Math.max(1, Math.round(vw * scale));
          canvas.height = Math.max(1, Math.round(vh * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          cleanup();
          resolve(dataUrl);
        } catch (e) {
          cleanup();
          reject(e);
        }
      }, { once: true });

      video.addEventListener('error', () => {
        cleanup();
        reject(new Error('Не удалось прочитать видео для превью'));
      }, { once: true });
    });
  },

  formatDuration(ms) {
    if (!ms || !Number.isFinite(ms)) return '—';
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
};

if (typeof module === 'object' && module.exports) {
  module.exports = Takes;
}
