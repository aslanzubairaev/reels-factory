/**
 * Background module — loading and displaying backgrounds
 * Priority: custom/ > backgrounds/ > slides/
 */
const Background = {
  assets: {},       // { partNumber: { type, element, url } }
  container: null,
  currentPart: null,

  /**
   * Determine the best URL and type for a part's background.
   * Priority: custom_file > background_file > slide_file
   */
  resolveAsset(part, projectName) {
    // 1. Custom user-uploaded file (highest priority, applies to any non-none type)
    if (part.custom_file) {
      const url = API.getCustomUrl(projectName, part.custom_file);
      return { url, type: part.custom_type || 'photo', source: 'custom' };
    }
    // 2. AI-generated background — only when the declared type is photo/video.
    if ((part.background_type === 'photo' || part.background_type === 'video') && part.background_file) {
      const url = API.getAssetUrl(projectName, part.background_file);
      const type = part.background_type === 'video' ? 'video' : 'photo';
      return { url, type, source: 'background' };
    }
    // 3. HTML slide
    if (part.background_type === 'html_slide') {
      const slideFile = part.slide_file || `part_${part.part_number}_slide.png`;
      const url = HtmlSlides.getSlideUrl(projectName, slideFile);
      return { url, type: 'photo', source: 'slide' };
    }
    // 4. Live screen capture — no URL, handled via getStream() from ScreenCapture.
    if (part.background_type === 'screen') {
      return { url: null, type: 'screen', source: 'screen' };
    }
    return null;
  },

  async preloadAll(script, projectName) {
    const promises = [];
    const total = script.parts.filter(p => p.background_type !== 'none' && this.resolveAsset(p, projectName)).length;
    let loaded = 0;
    // Cache-busting stamp: forces the browser to refetch after file has been regenerated/swapped on disk.
    const stamp = Date.now();
    this.assets = {};

    for (const part of script.parts) {
      if (part.background_type === 'none') continue;

      const resolved = this.resolveAsset(part, projectName);
      if (!resolved) continue;

      // Screen capture: one shared <video> element across all parts with type=screen.
      if (resolved.type === 'screen') {
        const video = this._ensureScreenVideo();
        this.assets[part.part_number] = { type: 'screen', element: video, source: 'screen' };
        loaded++;
        this.onProgress?.(loaded, total);
        continue;
      }

      const sep = resolved.url.includes('?') ? '&' : '?';
      resolved.url = `${resolved.url}${sep}v=${stamp}`;

      if (resolved.type === 'video') {
        const p = new Promise((resolve) => {
          const video = document.createElement('video');
          video.loop = true;
          video.muted = true;
          video.playsInline = true;
          video.preload = 'auto';
          video.oncanplaythrough = () => {
            this.assets[part.part_number] = { type: 'video', element: video, url: resolved.url, source: resolved.source };
            loaded++;
            this.onProgress?.(loaded, total);
            resolve();
          };
          video.onerror = () => {
            console.warn(`Failed to load video for part ${part.part_number}`);
            resolve();
          };
          video.src = resolved.url;
        });
        promises.push(p);
      } else {
        const p = new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            this.assets[part.part_number] = { type: 'photo', element: img, url: resolved.url, source: resolved.source };
            loaded++;
            this.onProgress?.(loaded, total);
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to load bg for part ${part.part_number}`);
            resolve();
          };
          img.src = resolved.url;
        });
        promises.push(p);
      }
    }

    await Promise.all(promises);
  },

  show(partNumber) {
    if (!this.container) return;

    // Pause previous video
    if (this.currentPart && this.assets[this.currentPart]?.type === 'video') {
      this.assets[this.currentPart].element.pause();
    }

    this.currentPart = partNumber;
    this.container.innerHTML = '';

    const asset = this.assets[partNumber];
    if (!asset) {
      this.container.style.background = '#1a1a2e';
      return;
    }

    this.container.style.background = 'none';

    if (asset.type === 'photo') {
      const img = asset.element.cloneNode();
      img.className = 'bg-media';
      this.container.appendChild(img);
    } else if (asset.type === 'screen') {
      const stream = (typeof ScreenCapture !== 'undefined') ? ScreenCapture.getStream() : null;
      const video = this._ensureScreenVideo();
      if (stream && stream.active) {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
        // Для screen используем canvas-рендер с pan/zoom (object-fit не справляется).
        this._mountScreenCanvas();
      } else {
        this._stopScreenRAF();
        this.container.style.background = '#1a1a2e';
        const hint = document.createElement('div');
        hint.className = 'bg-screen-placeholder';
        hint.textContent = 'Нажми «Выбрать окно» в правой панели, чтобы начать захват экрана.';
        this.container.appendChild(hint);
      }
    } else if (asset.type === 'video') {
      asset.element.className = 'bg-media';
      this.container.appendChild(asset.element);
      asset.element.currentTime = 0;
      asset.element.play().catch(() => {});
    }
  },

  onProgress: null,

  _screenVideo: null,

  _ensureScreenVideo() {
    if (!this._screenVideo) {
      const v = document.createElement('video');
      v.autoplay = true;
      v.muted = true;
      v.playsInline = true;
      this._screenVideo = v;
    }
    return this._screenVideo;
  },

  /** Вызывается когда ScreenCapture stream получен/изменён. */
  updateScreenStream() {
    const stream = (typeof ScreenCapture !== 'undefined') ? ScreenCapture.getStream() : null;
    const video = this._ensureScreenVideo();
    if (stream && stream.active) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
    } else {
      video.srcObject = null;
      this._stopScreenRAF();
    }
  },

  _screenCanvas: null,
  _screenRAF: null,

  _mountScreenCanvas() {
    if (!this._screenCanvas) {
      const c = document.createElement('canvas');
      c.className = 'bg-media';
      // Canvas высокого разрешения — потом CSS растянет на 100% phone-frame.
      c.width = 1080;
      c.height = 1920;
      this._screenCanvas = c;
    }
    this.container.appendChild(this._screenCanvas);
    this._startScreenRAF();
  },

  _startScreenRAF() {
    if (this._screenRAF) return;
    const draw = () => {
      this._screenRAF = requestAnimationFrame(draw);
      const canvas = this._screenCanvas;
      if (!canvas) return;
      const video = this._ensureScreenVideo();
      if (!video || video.readyState < 2) return;
      const ctx = canvas.getContext('2d');
      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;
      const pan = (typeof ScreenPan !== 'undefined') ? ScreenPan.computeCrop(vw, vh, canvas.width, canvas.height)
                                                      : { sx: 0, sy: 0, sw: vw, sh: vh };
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      try {
        ctx.drawImage(video, pan.sx, pan.sy, pan.sw, pan.sh, 0, 0, canvas.width, canvas.height);
      } catch (_) { /* frame not ready */ }
    };
    this._screenRAF = requestAnimationFrame(draw);
  },

  _stopScreenRAF() {
    if (this._screenRAF) {
      cancelAnimationFrame(this._screenRAF);
      this._screenRAF = null;
    }
  },

  /** Публичный доступ для Canvas.drawBackground при записи. */
  getScreenSource() {
    const video = this._screenVideo;
    if (video && video.readyState >= 2 && video.srcObject) return video;
    return null;
  }
};
