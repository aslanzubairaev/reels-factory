/*
 * Screen capture helper — обёртка над navigator.mediaDevices.getDisplayMedia().
 *
 * Идея: один live MediaStream на всю сессию Studio. Первый запрос показывает
 * системный picker (окно/вкладка/экран). Stream кэшируется и отдаётся всем
 * частям типа background_type=screen. При остановке или onended — чистим.
 *
 * Поддерживает опцию "с системным звуком": если включено, в MediaStream попадёт
 * дополнительный audio-track с захваченной вкладки/окна.
 */
const ScreenCapture = {
  _stream: null,
  _pending: null,
  _withSystemAudio: false,
  _listeners: new Set(),

  /** Вернёт текущий кэшированный stream или null. */
  getStream() {
    return this._stream;
  },

  isActive() {
    return !!(this._stream && this._stream.active);
  },

  setSystemAudio(on) {
    this._withSystemAudio = !!on;
  },

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  },

  _notify() {
    for (const cb of this._listeners) {
      try { cb(this._stream); } catch (_) { /* ignore */ }
    }
  },

  /**
   * Получить stream (или использовать закэшированный). Возвращает MediaStream.
   * Может бросить исключение если пользователь отказал.
   */
  async ensure() {
    if (this._stream && this._stream.active) return this._stream;
    if (this._pending) return this._pending;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Браузер не поддерживает захват экрана (getDisplayMedia).');
    }

    const constraints = {
      video: {
        frameRate: { ideal: 30, max: 60 },
        // Ask for a 9:16-ish region, but user's picker dictates final res.
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: this._withSystemAudio
    };

    this._pending = navigator.mediaDevices.getDisplayMedia(constraints)
      .then(stream => {
        this._stream = stream;
        this._pending = null;
        // If user stops sharing via the browser UI, clean up.
        stream.getVideoTracks().forEach(t => {
          t.onended = () => this.stop();
        });
        this._notify();
        return stream;
      })
      .catch(err => {
        this._pending = null;
        throw err;
      });

    return this._pending;
  },

  stop() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      this._stream = null;
      this._notify();
    }
  }
};
