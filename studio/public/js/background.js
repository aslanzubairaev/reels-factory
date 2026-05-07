/**
 * Background module — loading and displaying backgrounds
 * Priority: custom/ > backgrounds/ > slides/ > screen capture
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
    if (!part || part.layout === 'face_only') {
      return null;
    }

    // 1. Custom user-uploaded file (highest priority)
    if (part.custom_file) {
      const url = API.getCustomUrl(projectName, part.custom_file);
      return { url, type: part.custom_type || 'photo', source: 'custom' };
    }
    // 2. AI-generated background
    if (part.background_file) {
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
    // 4. User-selected browser display capture window.
    if (part.background_type === 'screen_capture') {
      return {
        url: null,
        type: 'screen_capture',
        source: 'screen_capture',
        projectName,
        label: part.screen_capture_label || 'Shared window'
      };
    }
    return null;
  },

  async preloadAll(script, projectName, options = {}) {
    const bustSuffix = options.bust ? `v=${Date.now()}` : '';
    const withBust = (url) => {
      if (!url || !bustSuffix) return url;
      return url + (url.includes('?') ? '&' : '?') + bustSuffix;
    };
    const previousAssets = this.assets || {};
    const reusedScreenCaptureAssets = new Set();
    this.assets = {};
    const promises = [];
    const total = script.parts.filter(p => this.resolveAsset(p, projectName)).length;
    let loaded = 0;

    for (const part of script.parts) {
      const resolved = this.resolveAsset(part, projectName);
      if (!resolved) continue;

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
          video.src = withBust(resolved.url);
        });
        promises.push(p);
      } else if (resolved.type === 'screen_capture') {
        const previousAsset = previousAssets[part.part_number];
        if (
          previousAsset?.type === 'screen_capture' &&
          previousAsset.connected &&
          previousAsset.projectName === projectName
        ) {
          this.assets[part.part_number] = previousAsset;
          reusedScreenCaptureAssets.add(previousAsset);
        } else {
          this.assets[part.part_number] = this.createScreenCaptureAsset(part.part_number, resolved);
        }
        loaded++;
        this.onProgress?.(loaded, total);
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
          img.src = withBust(resolved.url);
        });
        promises.push(p);
      }
    }

    await Promise.all(promises);

    for (const asset of Object.values(previousAssets)) {
      if (asset?.type === 'screen_capture' && !reusedScreenCaptureAssets.has(asset)) {
        this.stopStream(asset.stream);
      }
    }
  },

  createScreenCaptureAsset(partNumber, resolved) {
    return {
      type: 'screen_capture',
      element: null,
      url: null,
      source: resolved.source,
      label: resolved.label || 'Shared window',
      projectName: resolved.projectName || null,
      stream: null,
      connected: false,
      lastError: null,
      partNumber
    };
  },

  getMediaDevices() {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      return navigator.mediaDevices;
    }
    if (typeof window !== 'undefined' && window.navigator?.mediaDevices) {
      return window.navigator.mediaDevices;
    }
    return null;
  },

  isLoopbackHost(hostname) {
    if (!hostname) return false;
    const normalized = String(hostname).toLowerCase();
    return normalized === 'localhost' ||
      normalized === '::1' ||
      normalized === '[::1]' ||
      /^127(?:\.\d{1,3}){3}$/.test(normalized);
  },

  isScreenCaptureAllowedOrigin(locationLike, isSecureContext = null) {
    if (isSecureContext === true) {
      return true;
    }

    if (!locationLike) {
      return true;
    }

    const protocol = locationLike.protocol || '';
    const hostname = locationLike.hostname || '';

    return protocol === 'https:' || (protocol === 'http:' && this.isLoopbackHost(hostname));
  },

  getScreenCaptureContextIssue(options = {}) {
    const runtimeWindow = options.window || (typeof window !== 'undefined' ? window : null);
    const runtimeDocument = options.document || (typeof document !== 'undefined' ? document : null);
    const runtimeLocation = options.location || runtimeWindow?.location || null;
    const isSecureContext = Object.prototype.hasOwnProperty.call(options, 'isSecureContext')
      ? options.isSecureContext
      : runtimeWindow?.isSecureContext;

    if (!this.isScreenCaptureAllowedOrigin(runtimeLocation, isSecureContext)) {
      return 'Screen capture is blocked because the studio is not running in a secure browser context. Open the studio on the Mac at http://localhost:3000 or http://127.0.0.1:3000, not through a LAN IP such as http://192.168.x.x:3000.';
    }

    if (runtimeDocument?.visibilityState === 'hidden') {
      return 'Screen capture requires the studio tab to be visible and focused.';
    }

    return null;
  },

  explainScreenCaptureFailure(error) {
    const message = error?.message || '';
    const name = error?.name || '';
    const wasBlocked = name === 'NotAllowedError' ||
      /not allowed|permission|denied|disallowed/i.test(message);

    if (wasBlocked) {
      return new Error('Screen capture was blocked by the browser or macOS. Open the studio on the Mac at http://localhost:3000, not through a LAN IP; allow Screen & System Audio Recording for this browser in macOS Privacy & Security; restart the browser if macOS asks; then choose the window to share.');
    }

    return error instanceof Error ? error : new Error(message || 'Screen capture failed');
  },

  getScreenCaptureVideoConstraints(options = {}) {
    return {
      displaySurface: options.displaySurface || 'window',
      frameRate: { ideal: options.frameRate || 60, max: options.maxFrameRate || 60 },
      width: { ideal: options.width || 2160, max: options.maxWidth || 3840 },
      height: { ideal: options.height || 3840, max: options.maxHeight || 3840 },
      resizeMode: options.resizeMode || 'none'
    };
  },

  async applyScreenCaptureTrackConstraints(tracks, constraints) {
    for (const track of tracks) {
      if (typeof track.applyConstraints !== 'function') {
        continue;
      }

      try {
        await track.applyConstraints(constraints);
      } catch (error) {
        console.warn('Could not force high-resolution screen capture constraints:', error);
      }
    }
  },

  getScreenCaptureTrackSettings(track) {
    const settings = track?.getSettings?.() || {};
    return {
      width: settings.width || 0,
      height: settings.height || 0,
      frameRate: settings.frameRate || 0,
      displaySurface: settings.displaySurface || '',
      resizeMode: settings.resizeMode || ''
    };
  },

  async connectScreenCapture(partNumber, options = {}) {
    const contextIssue = this.getScreenCaptureContextIssue(options);
    if (contextIssue) {
      throw new Error(contextIssue);
    }

    const mediaDevices = options.mediaDevices || this.getMediaDevices();
    if (!mediaDevices?.getDisplayMedia) {
      throw new Error('Screen capture is not supported in this browser. Use a desktop browser that supports window sharing.');
    }

    let stream;
    const videoConstraints = this.getScreenCaptureVideoConstraints(options);
    try {
      stream = await mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: false
      });
    } catch (error) {
      throw this.explainScreenCaptureFailure(error);
    }

    const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
    if (!tracks.length) {
      this.stopStream(stream);
      throw new Error('No video track was provided by the selected screen source.');
    }

    await this.applyScreenCaptureTrackConstraints(tracks, videoConstraints);

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        reject(new Error('Screen capture preview could not start'));
      };

      video.onloadedmetadata = finish;
      video.oncanplay = finish;
      video.onerror = fail;

      const playPromise = video.play?.();
      if (playPromise?.then) {
        playPromise.then(finish).catch(reject);
      }
    });

    const existing = this.assets[partNumber];
    if (existing?.stream) {
      this.stopScreenCapture(partNumber);
    }

    const asset = {
      ...(existing || {}),
      type: 'screen_capture',
      element: video,
      url: null,
      source: 'screen_capture',
      label: existing?.label || options.label || 'Shared window',
      projectName: options.projectName || existing?.projectName || null,
      stream,
      connected: true,
      lastError: null,
      captureSettings: this.getScreenCaptureTrackSettings(tracks[0]),
      partNumber
    };

    console.info(
      `Screen capture connected: ${asset.captureSettings.width}x${asset.captureSettings.height}` +
      ` @ ${asset.captureSettings.frameRate || 'unknown'}fps` +
      `${asset.captureSettings.resizeMode ? `, resizeMode=${asset.captureSettings.resizeMode}` : ''}`
    );
    if (asset.captureSettings.resizeMode && asset.captureSettings.resizeMode !== 'none') {
      console.warn('Screen capture is being resized by the browser/OS before preview. This can make the preview image blurry.');
    }

    const markDisconnected = () => {
      asset.connected = false;
      asset.lastError = new Error('Screen capture source ended');
    };

    for (const track of tracks) {
      track.addEventListener?.('ended', markDisconnected, { once: true });
    }

    this.assets[partNumber] = asset;
    return asset;
  },

  stopStream(stream) {
    if (!stream?.getTracks) return;
    for (const track of stream.getTracks()) {
      track.stop?.();
    }
  },

  stopScreenCapture(partNumber) {
    const asset = this.assets[partNumber];
    if (!asset || asset.type !== 'screen_capture') {
      return;
    }

    this.stopStream(asset.stream);
    asset.stream = null;
    asset.element = null;
    asset.connected = false;
  },

  stopAllScreenCaptures() {
    for (const partNumber of Object.keys(this.assets)) {
      this.stopScreenCapture(partNumber);
    }
  },

  isScreenCaptureConnected(partNumber) {
    const asset = this.assets[partNumber];
    return !!(asset && asset.type === 'screen_capture' && asset.connected && asset.element);
  },

  show(partNumber) {
    if (!this.container) return;

    // Pause previous video
    if (this.currentPart && this.assets[this.currentPart]?.type === 'video') {
      this.assets[this.currentPart].element.pause();
    }

    this.currentPart = partNumber;
    this.container.innerHTML = '';
    this._stopScreenRAF();

    // Отписка от прошлых изменений ScreenPan
    if (this._screenPanUnsub) {
      try { this._screenPanUnsub(); } catch (_) {}
      this._screenPanUnsub = null;
    }

    const asset = this.assets[partNumber];
    if (!asset) {
      this.container.style.background = '#1a1a2e';
      return;
    }

    this.container.style.background = 'none';

    if (asset.type === 'photo') {
      if (typeof ScreenPan !== 'undefined') ScreenPan.setMode('contain');
      const img = asset.element.cloneNode();
      img.className = 'bg-media';
      this.container.appendChild(img);
      this._bindScreenPanToMedia(img);
    } else if (asset.type === 'video') {
      if (typeof ScreenPan !== 'undefined') ScreenPan.setMode('contain');
      asset.element.className = 'bg-media';
      this.container.appendChild(asset.element);
      asset.element.currentTime = 0;
      asset.element.play().catch(() => {});
      this._bindScreenPanToMedia(asset.element);
    } else if (asset.type === 'screen_capture') {
      if (!asset.element || !asset.connected) {
        this.container.style.background = '#1a1a2e';
        return;
      }
      if (typeof ScreenPan !== 'undefined') ScreenPan.setMode('cover');
      // Рисуем через canvas+RAF с учётом ScreenPan (cover-fit + zoom/pan).
      this._mountScreenCanvas(asset);
    }
  },

  _bindScreenPanToMedia(el) {
    if (typeof ScreenPan === 'undefined') return;
    ScreenPan._applyToMedia(el);
    this._screenPanUnsub = ScreenPan.onChange(() => {
      ScreenPan._applyToMedia(el);
    });
  },

  _screenCanvas: null,
  _screenRAF: null,
  _screenAsset: null,

  _mountScreenCanvas(asset) {
    this._screenAsset = asset;
    if (!this._screenCanvas) {
      const c = document.createElement('canvas');
      c.className = 'bg-media';
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
      const asset = this._screenAsset;
      if (!canvas || !asset || !asset.element) return;
      const video = asset.element;
      if (video.readyState < 2) return;
      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      const pan = (typeof ScreenPan !== 'undefined')
        ? (ScreenPan.mode === 'contain'
            ? ScreenPan.computeContainRect(vw, vh, canvas.width, canvas.height)
            : ScreenPan.computeCrop(vw, vh, canvas.width, canvas.height))
        : null;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      try {
        if (pan && typeof pan.sx === 'number') {
          ctx.drawImage(video, pan.sx, pan.sy, pan.sw, pan.sh, 0, 0, canvas.width, canvas.height);
        } else if (pan) {
          ctx.drawImage(video, 0, 0, vw, vh, pan.dx, pan.dy, pan.dw, pan.dh);
        } else {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      } catch (_) {}
    };
    this._screenRAF = requestAnimationFrame(draw);
  },

  _stopScreenRAF() {
    if (this._screenRAF) {
      cancelAnimationFrame(this._screenRAF);
      this._screenRAF = null;
    }
  },

  onProgress: null
};

if (typeof module === 'object' && module.exports) {
  module.exports = Background;
}
