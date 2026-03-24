/**
 * App module — main studio logic v2
 * v2: camera shapes, zoom, mirror, dark/light theme, prompt display language
 */
const App = {
  state: {
    screen: 'settings',
    project: null,
    projectName: '',
    currentPart: 0,
    quality: '1080p',
    generating: false,
    recordingMode: 'continuous',
    isRecording: false,
    partTimer: 0,
    partTimerInterval: null,
    recordingDone: false,
    autoAdvance: true,
    cameraShape: 'rounded-rect',
    zoom: 1.0,
    camSize: 1.0,
    camPosition: 'center', // 'left' | 'center' | 'right'
    transition: 'fade',    // 'fade' | 'slide' | 'zoom' | 'cut'
    mirrored: true,  // Preview = mirrored by default (W-018)
    darkTheme: true
  },

  elements: {},

  async init() {
    this.cacheElements();
    this.bindEvents();
    Hotkeys.init();
    await this.loadProjects();
    await this.loadDevices();
  },

  cacheElements() {
    this.elements = {
      settingsScreen: document.getElementById('settings-screen'),
      previewScreen: document.getElementById('preview-screen'),
      recordingScreen: document.getElementById('recording-screen'),
      reviewScreen: document.getElementById('review-screen'),
      loadingOverlay: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),

      projectSelect: document.getElementById('project-select'),
      cameraSelect: document.getElementById('camera-select'),
      micSelect: document.getElementById('mic-select'),
      qualitySelect: document.getElementById('quality-select'),
      cameraShapeSelect: document.getElementById('camera-shape-select'),
      themeToggle: document.getElementById('theme-toggle'),
      enterBtn: document.getElementById('enter-studio-btn'),

      phoneFrame: document.getElementById('phone-frame'),
      bgContainer: document.getElementById('bg-container'),
      cameraWindow: document.getElementById('camera-window'),
      cameraVideo: document.getElementById('camera-video'),
      cameraResize: document.getElementById('camera-resize-handle'),
      zoomSlider: document.getElementById('zoom-slider'),
      zoomValue: document.getElementById('zoom-value'),
      mirrorBtn: document.getElementById('mirror-btn'),

      partInfo: document.getElementById('part-info'),
      layoutBadge: document.getElementById('layout-badge'),
      teleprompterText: document.getElementById('teleprompter-text'),
      timingInfo: document.getElementById('timing-info'),
      bgPrompt: document.getElementById('bg-prompt'),
      generateBtn: document.getElementById('generate-btn'),
      cancelGenerateBtn: document.getElementById('cancel-generate-btn'),
      prevBtn: document.getElementById('prev-btn'),
      nextBtn: document.getElementById('next-btn'),
      recordBtn: document.getElementById('start-recording-btn'),

      recordingCanvas: document.getElementById('recording-canvas'),
      recTeleprompter: document.getElementById('rec-teleprompter'),
      recPartInfo: document.getElementById('rec-part-info'),
      recTimer: document.getElementById('rec-timer'),
      recCountdown: document.getElementById('rec-countdown'),
      recNextPreview: document.getElementById('rec-next-preview'),
      recModeSelect: document.getElementById('rec-mode-select'),
      recStartBtn: document.getElementById('rec-start-btn'),
      recStopBtn: document.getElementById('rec-stop-btn'),
      recRerecordBtn: document.getElementById('rec-rerecord-btn'),
      recPrevBtn: document.getElementById('rec-prev-btn'),
      recNextBtn: document.getElementById('rec-next-btn'),
      recBackBtn: document.getElementById('rec-back-btn'),
      recIndicator: document.getElementById('rec-indicator'),

      reviewVideo: document.getElementById('review-video'),
      reviewPlayBtn: document.getElementById('review-play-btn'),
      reviewSaveBtn: document.getElementById('review-save-btn'),
      reviewRedoBtn: document.getElementById('review-redo-btn')
    };
  },

  bindEvents() {
    this.elements.enterBtn?.addEventListener('click', () => this.enterStudio());
    this.elements.prevBtn?.addEventListener('click', () => this.prevSlide());
    this.elements.nextBtn?.addEventListener('click', () => this.nextSlide());
    this.elements.generateBtn?.addEventListener('click', () => this.generateBackground());
    this.elements.cancelGenerateBtn?.addEventListener('click', () => this.cancelGeneration());
    this.elements.recordBtn?.addEventListener('click', () => this.switchToRecording());

    // v2: Camera size slider
    document.getElementById('cam-size-slider')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('cam-size-value').textContent = `${val.toFixed(1)}x`;
      this.state.camSize = val;
      this.applyCamSize();
    });

    // v2: Zoom slider
    this.elements.zoomSlider?.addEventListener('input', (e) => {
      this.state.zoom = parseFloat(e.target.value);
      this.elements.zoomValue.textContent = `${this.state.zoom.toFixed(1)}x`;
      Canvas.setZoom(this.state.zoom);
      // Also update preview camera via CSS transform for visual feedback
      this.updatePreviewZoom();
    });

    // v2: Camera position buttons
    document.querySelectorAll('.cam-pos-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.camPosition = btn.dataset.pos;
        document.querySelectorAll('.cam-pos-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyCamPosition();
      });
    });

    // v2: Mirror button
    this.elements.mirrorBtn?.addEventListener('click', () => this.toggleMirror());

    // v2: Background mode toggle
    document.getElementById('bg-mode-btn')?.addEventListener('click', () => this.toggleBgMode());

    // v2: Transition selector
    document.getElementById('transition-select')?.addEventListener('change', (e) => {
      this.state.transition = e.target.value;
    });

    // v2: Camera shape (now inside studio)
    this.elements.cameraShapeSelect?.addEventListener('change', (e) => {
      this.state.cameraShape = e.target.value;
      this.updateCameraShape();
    });

    // v2: Theme button (now inside studio)
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      this.state.darkTheme = !this.state.darkTheme;
      this.setTheme(this.state.darkTheme ? 'dark' : 'light');
      const btn = document.getElementById('theme-toggle-btn');
      btn.textContent = this.state.darkTheme ? '🌙 Тёмная' : '☀️ Светлая';
    });

    // v2: Autoscroll speed slider (W-016)
    const scrollSpeed = document.getElementById('scroll-speed');
    scrollSpeed?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('scroll-speed-value').textContent = val === 0 ? 'Выкл' : `${val}x`;
    });

    // v2: Scroll pause button
    document.getElementById('scroll-pause-btn')?.addEventListener('click', () => {
      this.autoscrollPaused = !this.autoscrollPaused;
      document.getElementById('scroll-pause-btn').textContent = this.autoscrollPaused ? 'Продолжить' : 'Пауза';
    });

    // v2: Mirror toggle for recording (W-018)
    document.getElementById('rec-mirror-toggle')?.addEventListener('change', (e) => {
      Canvas.setMirror(e.target.checked);
    });

    // Recording buttons
    this.elements.recStartBtn?.addEventListener('click', () => this.startRecording());
    this.elements.recStopBtn?.addEventListener('click', () => this.stopRecording());
    this.elements.recRerecordBtn?.addEventListener('click', () => this.rerecord());
    this.elements.recPrevBtn?.addEventListener('click', () => this.prevSlide());
    this.elements.recNextBtn?.addEventListener('click', () => this.nextSlide());
    this.elements.recBackBtn?.addEventListener('click', () => this.switchToPreview());
    document.getElementById('rec-save-direct-btn')?.addEventListener('click', () => this.saveRecording());
    document.getElementById('rec-preview-btn')?.addEventListener('click', () => this.toggleRecPreview());

    // Navigation arrows in recording — manual advance resets timer
    document.getElementById('rec-prev-btn-nav')?.addEventListener('click', () => {
      this.prevSlide();
      if (this.state.isRecording) {
        this.stopPartTimer();
        this.stopAutoscroll();
        this.startPartTimer();
        this.startAutoscroll();
      }
    });
    document.getElementById('rec-next-btn-nav')?.addEventListener('click', () => {
      this.nextSlide();
      if (this.state.isRecording) {
        this.stopPartTimer();
        this.stopAutoscroll();
        this.startPartTimer();
        this.startAutoscroll();
      }
    });

    // Auto-advance toggle
    document.getElementById('auto-advance-btn')?.addEventListener('click', () => {
      this.state.autoAdvance = !this.state.autoAdvance;
      this.updateAutoAdvanceBtn();
    });

    // Review buttons
    this.elements.reviewPlayBtn?.addEventListener('click', () => this.playReview());
    this.elements.reviewSaveBtn?.addEventListener('click', () => this.saveRecording());
    this.elements.reviewRedoBtn?.addEventListener('click', () => this.switchToRecording());

    // Hotkeys
    Hotkeys.bind('ArrowLeft', () => {
      if (this.state.screen === 'preview' || this.state.screen === 'recording') this.prevSlide();
    });
    Hotkeys.bind('ArrowRight', () => {
      if (this.state.screen === 'preview' || this.state.screen === 'recording') this.nextSlide();
    });
    Hotkeys.bind('Escape', () => {
      if (this.state.screen === 'recording') this.switchToPreview();
      if (this.state.screen === 'review') this.switchToRecording();
    });
    Hotkeys.bind(' ', () => {
      if (this.state.screen === 'recording') {
        if (this.state.isRecording) this.stopRecording();
        else this.startRecording();
      }
    });
    Hotkeys.bind('r', () => {
      if (this.state.screen === 'recording') this.rerecord();
    });
    Hotkeys.bind('R', () => {
      if (this.state.screen === 'recording') this.rerecord();
    });

    this.initCameraResize();
  },

  // === Settings ===

  async loadProjects() {
    try {
      const data = await API.getProjects();
      const select = this.elements.projectSelect;
      select.innerHTML = '<option value="">-- Выберите проект --</option>';
      data.projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = `${p.name} (${p.parts_count} parts, ${p.total_duration}s)`;
        select.appendChild(opt);
      });
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  },

  async loadDevices() {
    try {
      const { cameras, microphones } = await Camera.enumerateDevices();
      const camSelect = this.elements.cameraSelect;
      camSelect.innerHTML = '';
      cameras.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${camSelect.options.length + 1}`;
        camSelect.appendChild(opt);
      });
      const micSelect = this.elements.micSelect;
      micSelect.innerHTML = '';
      microphones.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Microphone ${micSelect.options.length + 1}`;
        micSelect.appendChild(opt);
      });
    } catch (e) {
      console.error('Failed to enumerate devices:', e);
    }
  },

  async enterStudio() {
    const projectName = this.elements.projectSelect.value;
    if (!projectName) return alert('Выберите проект');

    this.state.projectName = projectName;
    this.state.quality = this.elements.qualitySelect.value;
    this.state.cameraShape = this.elements.cameraShapeSelect?.value || 'rounded-rect';

    this.elements.settingsScreen.classList.add('hidden');
    this.elements.loadingOverlay.classList.remove('hidden');
    this.elements.loadingText.textContent = 'Загрузка проекта...';

    try {
      this.state.project = await API.getProject(projectName);

      this.elements.loadingText.textContent = 'Запуск камеры...';
      Camera.videoElement = this.elements.cameraVideo;
      await Camera.start(
        this.elements.cameraSelect.value,
        this.elements.micSelect.value,
        this.state.quality
      );

      this.elements.loadingText.textContent = 'Загрузка фонов...';
      Background.container = this.elements.bgContainer;
      Background.onProgress = (loaded, total) => {
        this.elements.loadingText.textContent = `Загрузка фонов... ${loaded}/${total}`;
      };
      await Background.preloadAll(this.state.project, projectName);

      Teleprompter.textElement = this.elements.teleprompterText;
      Teleprompter.partInfoElement = this.elements.partInfo;
      Teleprompter.layoutBadgeElement = document.getElementById('layout-badge');
      Teleprompter.timingBadgeElement = document.getElementById('timing-badge');
      Teleprompter.typeBadgeElement = document.getElementById('type-badge');
      Teleprompter.promptElement = this.elements.bgPrompt;
      Teleprompter.promptSection = this.elements.bgPrompt?.closest('.panel-section');

      // Apply camera shape and position (default center)
      this.updateCameraShape();
      this.state.camPosition = 'center';
      this.applyCamPosition();

      this.state.currentPart = 0;
      this.showCurrentSlide();

      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.previewScreen.classList.remove('hidden');
      this.state.screen = 'preview';

    } catch (e) {
      console.error('Failed to enter studio:', e);
      alert('Ошибка: ' + e.message);
      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.settingsScreen.classList.remove('hidden');
    }
  },

  // === Preview ===

  showCurrentSlide() {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;

    // Always show background if available
    if (part.background_type !== 'none') {
      Background.show(part.part_number);
    } else {
      Background.show(null);
    }

    // Apply transition animation in Preview
    this.playTransition();

    // Hide size/position only on face_only without bgRemoval
    const hideControls = part.layout === 'face_only' && !this.bgRemoval;
    const sizeSlider = document.getElementById('cam-size-slider')?.closest('.camera-controls-row');
    const posRow = document.getElementById('cam-position-row');
    if (sizeSlider) sizeSlider.style.display = hideControls ? 'none' : 'flex';
    if (posRow) posRow.style.display = hideControls ? 'none' : 'flex';

    // Hide zoom and shape select in bgRemoval mode (not relevant)
    const zoomRow = document.getElementById('zoom-slider')?.closest('.camera-controls-row');
    const shapeSelect = document.getElementById('camera-shape-select');
    if (zoomRow) zoomRow.style.display = this.bgRemoval ? 'none' : 'flex';
    if (shapeSelect) shapeSelect.style.display = this.bgRemoval ? 'none' : '';
    Teleprompter.show(part, this.state.project.parts.length);
    this.updateCameraLayout(part.layout);
    Canvas.setLayout(part.layout);
    if (this.state.screen === 'recording') {
      Canvas.triggerTransition();
    }

    if (this.elements.prevBtn) {
      this.elements.prevBtn.disabled = this.state.currentPart === 0;
      this.elements.nextBtn.disabled = this.state.currentPart === this.state.project.parts.length - 1;
    }

    if (this.state.screen === 'recording') {
      this.updateRecordingUI();
    }
  },

  updateCameraLayout(layout) {
    const cam = this.elements.cameraWindow;
    if (!cam) return;

    // If bgRemoval is on, completely hide camera window
    if (this.bgRemoval) {
      cam.style.display = 'none';
      return;
    }

    cam.style.display = '';
    cam.className = 'camera-window';
    cam.classList.add(`layout-${layout}`);
    cam.classList.add(`shape-${this.state.cameraShape}`);
    cam.classList.add(`cam-pos-${this.state.camPosition}`);
  },

  updateCameraShape() {
    const cam = this.elements.cameraWindow;
    if (!cam) return;
    cam.classList.remove('shape-circle', 'shape-rounded-rect', 'shape-oval');
    cam.classList.add(`shape-${this.state.cameraShape}`);
    Canvas.setShape(this.state.cameraShape);
  },

  updatePreviewZoom() {
    // W-012: For preview, use CSS object-position to simulate zoom
    // Canvas handles actual zoom for recording
    const video = this.elements.cameraVideo;
    if (!video) return;
    const z = this.state.zoom;
    video.style.transform = `scale(${z})`;
    video.style.transformOrigin = 'center center';
  },

  toggleMirror() {
    this.state.mirrored = !this.state.mirrored;
    const video = this.elements.cameraVideo;
    if (video) {
      video.style.transform = this.state.mirrored
        ? `scaleX(-1) scale(${this.state.zoom})`
        : `scale(${this.state.zoom})`;
    }
    this.elements.mirrorBtn?.classList.toggle('active', this.state.mirrored);
    // W-018: Canvas recording mirror is separate
    // By default recording is non-mirrored, preview is mirrored
  },

  prevSlide() {
    if (this.state.currentPart > 0) {
      this.state.currentPart--;
      this.showCurrentSlide();
    }
  },

  nextSlide() {
    if (this.state.currentPart < this.state.project.parts.length - 1) {
      this.state.currentPart++;
      this.showCurrentSlide();
    }
  },

  // === Theme (W-017) ===

  setTheme(theme) {
    this.state.darkTheme = theme === 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-dark').disabled = theme !== 'dark';
    document.getElementById('theme-light').disabled = theme !== 'light';
    // W-017: Canvas does NOT depend on theme
  },

  // === Transitions ===

  playTransition() {
    const container = document.getElementById('bg-container');
    if (!container || this.state.transition === 'cut') return;

    // Remove old animation
    container.classList.remove('transition-fade', 'transition-slide', 'transition-zoom');

    // Force reflow to restart animation
    void container.offsetWidth;

    // Add new animation
    container.classList.add(`transition-${this.state.transition}`);

    // Also animate the camera window
    const cam = this.elements.cameraWindow;
    if (cam) {
      cam.style.animation = 'none';
      void cam.offsetWidth;
      if (this.state.transition === 'fade') {
        cam.style.animation = 'fadeIn 0.4s ease-in-out';
      }
    }
  },

  // === Auto-Advance ===

  disableAutoAdvance() {
    this.state.autoAdvance = false;
    this.updateAutoAdvanceBtn();
  },

  updateAutoAdvanceBtn() {
    const btn = document.getElementById('auto-advance-btn');
    if (!btn) return;
    if (this.state.autoAdvance) {
      btn.textContent = 'Авто: ВКЛ';
      btn.classList.add('auto-advance-active');
    } else {
      btn.textContent = 'Авто: ВЫКЛ';
      btn.classList.remove('auto-advance-active');
    }
  },

  // === Camera Position ===

  applyCamPosition() {
    const cam = this.elements.cameraWindow;
    if (!cam) return;
    cam.classList.remove('cam-pos-left', 'cam-pos-center', 'cam-pos-right');
    cam.classList.add(`cam-pos-${this.state.camPosition}`);
    Canvas.setCamPosition(this.state.camPosition);
  },

  // === Camera Size ===

  applyCamSize() {
    const cam = this.elements.cameraWindow;
    if (!cam) return;
    cam.style.setProperty('--cam-scale', this.state.camSize);
  },

  // === Background Mode Toggle ===

  bgRemoval: false,

  previewSegInterval: null,

  async toggleBgMode() {
    this.bgRemoval = !this.bgRemoval;
    const btn = document.getElementById('bg-mode-btn');
    const segCanvas = document.getElementById('preview-segmentation-canvas');
    const camWindow = this.elements.cameraWindow;

    if (this.bgRemoval) {
      btn.textContent = 'Загрузка AI...';
      Segmentation.setEnabled(true);
      if (!Segmentation.ready) {
        await Segmentation.init();
      }
      btn.textContent = 'Без фона';
      btn.classList.add('no-bg');
      Canvas.setBgRemoval(true);

      // Hide camera window, show segmentation canvas
      if (camWindow) camWindow.classList.add('hidden');
      if (segCanvas) {
        segCanvas.classList.remove('hidden');
        this.startPreviewSegmentation(segCanvas);
      }
    } else {
      btn.textContent = 'С фоном';
      btn.classList.remove('no-bg');
      Segmentation.setEnabled(false);
      Canvas.setBgRemoval(false);

      // Show camera window, hide segmentation canvas
      if (camWindow) camWindow.style.display = '';
      if (segCanvas) segCanvas.classList.add('hidden');
      this.stopPreviewSegmentation();
    }
    this.showCurrentSlide();
  },

  startPreviewSegmentation(canvas) {
    this.stopPreviewSegmentation();
    const video = this.elements.cameraVideo;
    const ctx = canvas.getContext('2d');

    // Match phone frame size
    canvas.width = 340;
    canvas.height = 604;

    const render = () => {
      if (!this.bgRemoval || this.state.screen !== 'preview') return;

      const w = canvas.width;
      const h = canvas.height;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      // Process at video native resolution for quality
      const segResult = Segmentation.processFrame(video, vw, vh);
      ctx.clearRect(0, 0, w, h);

      const source = segResult || video;

      // Draw at bottom, full width, height controlled by size slider
      const size = this.state.camSize;
      const dw = w; // always full width — no side borders
      const dh = Math.round(h * 0.5 * size);
      const dy = h - dh;
      const shift = Math.round(w * 0.2);
      const pos = this.state.camPosition;
      let dx = pos === 'left' ? -shift : pos === 'right' ? shift : 0;

      // Cover crop to match destination region (dw x dh)
      const srcRatio = vw / vh;
      const dstRatio = dw / dh;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (srcRatio > dstRatio) {
        sw = vh * dstRatio;
        sx = (vw - sw) / 2;
      } else {
        sh = vw / dstRatio;
        sy = (vh - sh) / 2;
      }

      ctx.save();
      if (this.state.mirrored) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        dx = -dx;
      }
      ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();

      this.previewSegInterval = requestAnimationFrame(render);
    };
    render();
  },

  stopPreviewSegmentation() {
    if (this.previewSegInterval) {
      cancelAnimationFrame(this.previewSegInterval);
      this.previewSegInterval = null;
    }
  },

  // === Background Generation ===

  async generateBackground() {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part || part.background_type === 'none') return;

    const prompt = this.elements.bgPrompt.value.trim();
    if (!prompt) return alert('Введите промпт');

    this.state.generating = true;
    this.elements.generateBtn.classList.add('hidden');
    this.elements.cancelGenerateBtn.classList.remove('hidden');
    const spinner = document.getElementById('generate-spinner');
    spinner?.classList.remove('hidden');

    try {
      const result = await API.generate({
        project: this.state.projectName,
        part_number: part.part_number,
        prompt: prompt,
        type: part.background_type,
        duration: part.timing_seconds
      });

      if (result.file) {
        part.background_file = result.file;
        await Background.preloadAll(this.state.project, this.state.projectName);
        Background.show(part.part_number);
      }
    } catch (e) {
      alert('Ошибка генерации: ' + e.message);
    } finally {
      this.state.generating = false;
      this.elements.generateBtn.classList.remove('hidden');
      this.elements.cancelGenerateBtn.classList.add('hidden');
      spinner?.classList.add('hidden');
    }
  },

  cancelGeneration() {
    this.state.generating = false;
    this.elements.generateBtn.classList.remove('hidden');
    this.elements.cancelGenerateBtn.classList.add('hidden');
    document.getElementById('generate-spinner')?.classList.add('hidden');
  },

  // === Camera Resize ===

  initCameraResize() {
    const handle = this.elements.cameraResize;
    const cam = this.elements.cameraWindow;
    if (!handle || !cam) return;

    let startX, startW;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = cam.offsetWidth;
      const onMove = (e) => {
        const newW = Math.max(80, Math.min(startW + (e.clientX - startX), 400));
        cam.style.width = newW + 'px';
        cam.style.height = (newW * 4 / 3) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  // === Recording ===

  switchToRecording() {
    this.state.screen = 'recording';
    this.elements.previewScreen.classList.add('hidden');
    this.elements.reviewScreen?.classList.add('hidden');
    this.elements.recordingScreen.classList.remove('hidden');

    Canvas.init(this.elements.recordingCanvas, this.elements.cameraVideo);
    Canvas.setQuality(this.state.quality);
    Canvas.setLayout(this.state.project.parts[this.state.currentPart].layout);
    Canvas.setZoom(this.state.zoom);
    Canvas.setCamSize(this.state.camSize);
    Canvas.setShape(this.state.cameraShape);
    Canvas.setCamPosition(this.state.camPosition);
    Canvas.setTransition(this.state.transition);
    Canvas.setBgRemoval(this.bgRemoval);
    // W-018: recording is non-mirrored by default
    Canvas.setMirror(false);
    Canvas.startRendering();

    this.state.recordingDone = false;
    this.updateRecordingUI();
  },

  switchToPreview() {
    if (this.state.isRecording) this.stopRecording();
    Canvas.stopRendering();

    this.state.screen = 'preview';
    this.elements.recordingScreen.classList.add('hidden');
    this.elements.previewScreen.classList.remove('hidden');
    this.showCurrentSlide();
  },

  updateRecordingUI() {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;

    if (this.elements.recTeleprompter) this.elements.recTeleprompter.textContent = part.text;
    if (this.elements.recPartInfo) {
      this.elements.recPartInfo.textContent = `Часть ${part.part_number} / ${this.state.project.parts.length}`;
    }

    // Status
    const statusDot = document.getElementById('rec-status-dot');
    const statusText = document.getElementById('rec-status-text');
    if (statusDot) statusDot.classList.toggle('recording', this.state.isRecording);
    if (statusText) statusText.textContent = this.state.isRecording ? 'ЗАПИСЬ' : 'ГОТОВ';

    // Badges
    const layoutBadge = document.getElementById('rec-layout-badge');
    const timingBadge = document.getElementById('rec-timing-badge');
    if (layoutBadge) layoutBadge.textContent = part.layout.toUpperCase();
    if (timingBadge) timingBadge.textContent = `${part.timing_seconds} СЕК`;

    // Slide label in nav
    const slideLabel = document.getElementById('rec-slide-label');
    if (slideLabel) slideLabel.textContent = `Часть ${part.part_number} / ${this.state.project.parts.length}`;

    this.updateNextPreview();

    // Button visibility by state
    const btnsReady = document.getElementById('rec-btns-ready');
    const btnsRecording = document.getElementById('rec-btns-recording');
    const btnsDone = document.getElementById('rec-btns-done');
    const progressSection = document.getElementById('rec-progress-section');

    if (this.state.isRecording) {
      btnsReady?.classList.add('hidden');
      btnsRecording?.classList.remove('hidden');
      btnsDone?.classList.add('hidden');
      progressSection?.classList.remove('hidden');
    } else if (this.state.recordingDone) {
      btnsReady?.classList.add('hidden');
      btnsRecording?.classList.add('hidden');
      btnsDone?.classList.remove('hidden');
      progressSection?.classList.remove('hidden');
    } else {
      btnsReady?.classList.remove('hidden');
      btnsRecording?.classList.add('hidden');
      btnsDone?.classList.add('hidden');
      progressSection?.classList.add('hidden');
    }
  },

  updateNextPreview() {
    const nextIdx = this.state.currentPart + 1;
    const el = this.elements.recNextPreview;
    if (!el) return;
    if (nextIdx >= this.state.project.parts.length) {
      el.innerHTML = '<span class="next-label">Последняя часть</span>';
      return;
    }
    const next = this.state.project.parts[nextIdx];
    el.innerHTML = `<span class="next-label">Далее:</span><span class="next-text">${next.text.substring(0, 50)}...</span>`;
  },

  async startRecording() {
    if (this.state.isRecording) return;
    await this.doCountdown();

    this.state.isRecording = true;
    this.state.recordingDone = false;
    this.state.recordingMode = 'continuous';

    const canvasStream = Canvas.getStream(30);
    const audioTrack = Camera.getAudioTrack();

    Recorder.onStop = () => {
      // Stay in recording screen, show done buttons
      this.updateRecordingUI();
    };

    Recorder.start(canvasStream, audioTrack);
    this.updateRecordingUI();
    this.startPartTimer();
    this.startAutoscroll();
  },

  stopRecording() {
    if (!this.state.isRecording) return;
    this.state.isRecording = false;
    this.state.recordingDone = true;
    this.stopPartTimer();
    this.stopAutoscroll();
    Recorder.stop();
    this.updateRecordingUI();
  },

  // v2: Autoscroll (W-016)
  autoscrollInterval: null,
  autoscrollPaused: false,

  startAutoscroll() {
    this.stopAutoscroll();
    const container = document.getElementById('rec-teleprompter-scroll');
    const speedSlider = document.getElementById('scroll-speed');
    if (!container || !speedSlider) return;

    const speed = parseFloat(speedSlider.value);
    if (speed === 0) return; // Autoscroll off

    // W-016: Only scroll if text doesn't fit
    if (container.scrollHeight <= container.clientHeight) return;

    container.scrollTop = 0;
    this.autoscrollPaused = false;

    this.autoscrollInterval = setInterval(() => {
      if (this.autoscrollPaused) return;
      container.scrollTop += speed;
    }, 50);
  },

  stopAutoscroll() {
    if (this.autoscrollInterval) {
      clearInterval(this.autoscrollInterval);
      this.autoscrollInterval = null;
    }
    // W-016: Reset scroll on slide change
    const container = document.getElementById('rec-teleprompter-scroll');
    if (container) container.scrollTop = 0;
  },

  rerecord() {
    if (this.state.isRecording) {
      this.state.isRecording = false;
      this.stopPartTimer();
      this.stopAutoscroll();
      Recorder.stop();
    }
    this.state.recordingDone = false;
    // Hide preview video if showing
    const prevVideo = document.getElementById('rec-preview-video');
    if (prevVideo) { prevVideo.pause(); prevVideo.classList.add('hidden'); prevVideo.src = ''; }
    const prevBtn = document.getElementById('rec-preview-btn');
    if (prevBtn) prevBtn.textContent = 'Просмотр';
    this.updateRecordingUI();
    setTimeout(() => this.startRecording(), 300);
  },

  async doCountdown() {
    const el = this.elements.recCountdown;
    if (!el) return;
    el.classList.remove('hidden');
    for (let i = 3; i >= 1; i--) {
      el.textContent = i;
      await new Promise(r => setTimeout(r, 1000));
    }
    el.textContent = '';
    el.classList.add('hidden');
  },

  startPartTimer() {
    // Clear any existing timer first
    this.stopPartTimer();

    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;

    // Reset to full duration of THIS slide
    this.state.partTimer = part.timing_seconds;
    this.updateTimerDisplay();
    this.state.partTimerInterval = setInterval(() => {
      this.state.partTimer--;
      this.updateTimerDisplay();
      if (this.state.partTimer <= 0) {
        this.stopPartTimer();
        if (this.state.autoAdvance && this.state.currentPart < this.state.project.parts.length - 1) {
          // Auto-advance to next slide
          this.state.currentPart++;
          this.showCurrentSlide();
          this.startPartTimer();
          this.startAutoscroll();
        } else if (this.state.currentPart >= this.state.project.parts.length - 1) {
          // Last slide — auto stop
          this.stopRecording();
        }
        // If auto off and not last — just stop timer, keep recording
      }
    }, 1000);
  },

  stopPartTimer() {
    if (this.state.partTimerInterval) {
      clearInterval(this.state.partTimerInterval);
      this.state.partTimerInterval = null;
    }
  },

  updateTimerDisplay() {
    const t = this.state.partTimer;
    const min = String(Math.floor(t / 60)).padStart(2, '0');
    const sec = String(t % 60).padStart(2, '0');
    if (this.elements.recTimer) this.elements.recTimer.textContent = `${min}:${sec}`;

    // Progress bar
    const part = this.state.project?.parts[this.state.currentPart];
    if (part) {
      const total = part.timing_seconds;
      const elapsed = total - t;
      const pct = Math.min(100, (elapsed / total) * 100);
      const bar = document.getElementById('rec-progress-bar');
      const text = document.getElementById('rec-progress-text');
      if (bar) bar.style.width = `${pct}%`;
      if (text) text.textContent = `${elapsed} / ${total} сек`;
    }
  },

  // === Preview Recording ===

  toggleRecPreview() {
    const video = document.getElementById('rec-preview-video');
    const btn = document.getElementById('rec-preview-btn');
    if (!video || !Recorder.recordedBlob) return;

    if (video.classList.contains('hidden')) {
      // Show preview
      video.src = URL.createObjectURL(Recorder.recordedBlob);
      video.classList.remove('hidden');
      video.play();
      btn.textContent = 'Скрыть';
    } else {
      // Hide preview
      video.pause();
      video.classList.add('hidden');
      video.src = '';
      btn.textContent = 'Просмотр';
    }
  },

  // === Review ===

  showReview(blob) {
    this.state.screen = 'review';
    Canvas.stopRendering();
    this.elements.recordingScreen.classList.add('hidden');
    this.elements.reviewScreen.classList.remove('hidden');
    this.elements.reviewVideo.src = URL.createObjectURL(blob);
  },

  playReview() {
    this.elements.reviewVideo.play();
  },

  async saveRecording() {
    const mode = this.state.recordingMode;
    const part = this.state.project.parts[this.state.currentPart];
    const filename = (mode === 'per_part' && part) ? `recording_part_${part.part_number}` : 'recording_full';

    this.elements.reviewSaveBtn.disabled = true;
    this.elements.reviewSaveBtn.textContent = 'Сохранение...';

    try {
      const result = await Recorder.saveRecording(this.state.projectName, filename);
      alert(`Сохранено: ${result.file}`);
      this.switchToRecording();
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    } finally {
      this.elements.reviewSaveBtn.disabled = false;
      this.elements.reviewSaveBtn.textContent = 'Сохранить';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
