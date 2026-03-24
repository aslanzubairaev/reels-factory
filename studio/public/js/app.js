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
    cameraShape: 'rounded-rect',
    zoom: 1.0,
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

    // v2: Zoom slider
    this.elements.zoomSlider?.addEventListener('input', (e) => {
      this.state.zoom = parseFloat(e.target.value);
      this.elements.zoomValue.textContent = `${this.state.zoom.toFixed(1)}x`;
      Canvas.setZoom(this.state.zoom);
      // Also update preview camera via CSS transform for visual feedback
      this.updatePreviewZoom();
    });

    // v2: Mirror button
    this.elements.mirrorBtn?.addEventListener('click', () => this.toggleMirror());

    // v2: Theme toggle
    this.elements.themeToggle?.addEventListener('change', (e) => {
      this.setTheme(e.target.checked ? 'dark' : 'light');
    });

    // v2: Autoscroll speed slider (W-016)
    const scrollSpeed = document.getElementById('scroll-speed');
    scrollSpeed?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('scroll-speed-value').textContent = val === 0 ? 'Off' : `${val}x`;
    });

    // v2: Scroll pause button
    document.getElementById('scroll-pause-btn')?.addEventListener('click', () => {
      this.autoscrollPaused = !this.autoscrollPaused;
      document.getElementById('scroll-pause-btn').textContent = this.autoscrollPaused ? 'Resume' : 'Pause';
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
      select.innerHTML = '<option value="">-- Select project --</option>';
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
    if (!projectName) return alert('Select a project');

    this.state.projectName = projectName;
    this.state.quality = this.elements.qualitySelect.value;
    this.state.cameraShape = this.elements.cameraShapeSelect?.value || 'rounded-rect';

    this.elements.settingsScreen.classList.add('hidden');
    this.elements.loadingOverlay.classList.remove('hidden');
    this.elements.loadingText.textContent = 'Loading project...';

    try {
      this.state.project = await API.getProject(projectName);

      this.elements.loadingText.textContent = 'Starting camera...';
      Camera.videoElement = this.elements.cameraVideo;
      await Camera.start(
        this.elements.cameraSelect.value,
        this.elements.micSelect.value,
        this.state.quality
      );

      this.elements.loadingText.textContent = 'Loading backgrounds...';
      Background.container = this.elements.bgContainer;
      Background.onProgress = (loaded, total) => {
        this.elements.loadingText.textContent = `Loading backgrounds... ${loaded}/${total}`;
      };
      await Background.preloadAll(this.state.project, projectName);

      Teleprompter.textElement = this.elements.teleprompterText;
      Teleprompter.partInfoElement = this.elements.partInfo;
      Teleprompter.timingElement = this.elements.timingInfo;
      Teleprompter.layoutBadgeElement = this.elements.layoutBadge;
      Teleprompter.promptElement = this.elements.bgPrompt;

      // Apply camera shape
      this.updateCameraShape();

      this.state.currentPart = 0;
      this.showCurrentSlide();

      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.previewScreen.classList.remove('hidden');
      this.state.screen = 'preview';

    } catch (e) {
      console.error('Failed to enter studio:', e);
      alert('Error: ' + e.message);
      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.settingsScreen.classList.remove('hidden');
    }
  },

  // === Preview ===

  showCurrentSlide() {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;

    Background.show(part.part_number);
    Teleprompter.show(part, this.state.project.parts.length);
    this.updateCameraLayout(part.layout);
    Canvas.setLayout(part.layout);

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
    cam.className = 'camera-window';
    cam.classList.add(`layout-${layout}`);
    cam.classList.add(`shape-${this.state.cameraShape}`);
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

  // === Background Generation ===

  async generateBackground() {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part || part.background_type === 'none') return;

    const prompt = this.elements.bgPrompt.value.trim();
    if (!prompt) return alert('Enter a prompt');

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
      alert('Generation error: ' + e.message);
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
    Canvas.setShape(this.state.cameraShape);
    // W-018: recording is non-mirrored by default
    Canvas.setMirror(false);
    Canvas.startRendering();

    this.state.recordingMode = this.elements.recModeSelect?.value || 'continuous';
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
      this.elements.recPartInfo.textContent = `Part ${part.part_number} / ${this.state.project.parts.length}`;
    }
    if (this.elements.recTimer) this.elements.recTimer.textContent = `${part.timing_seconds}s`;

    this.updateNextPreview();

    if (this.elements.recPrevBtn) this.elements.recPrevBtn.disabled = this.state.currentPart === 0;
    if (this.elements.recNextBtn) this.elements.recNextBtn.disabled = this.state.currentPart === this.state.project.parts.length - 1;
    if (this.elements.recIndicator) this.elements.recIndicator.classList.toggle('active', this.state.isRecording);
    if (this.elements.recStartBtn) this.elements.recStartBtn.classList.toggle('hidden', this.state.isRecording);
    if (this.elements.recStopBtn) this.elements.recStopBtn.classList.toggle('hidden', !this.state.isRecording);
  },

  updateNextPreview() {
    const nextIdx = this.state.currentPart + 1;
    const el = this.elements.recNextPreview;
    if (!el) return;
    if (nextIdx >= this.state.project.parts.length) {
      el.innerHTML = '<span class="next-label">Last part</span>';
      return;
    }
    const next = this.state.project.parts[nextIdx];
    el.innerHTML = `<span class="next-label">Next:</span><span class="next-text">${next.text.substring(0, 50)}...</span>`;
  },

  async startRecording() {
    if (this.state.isRecording) return;
    await this.doCountdown();

    this.state.isRecording = true;
    this.state.recordingMode = this.elements.recModeSelect?.value || 'continuous';

    const canvasStream = Canvas.getStream(30);
    const audioTrack = Camera.getAudioTrack();

    Recorder.onStop = (blob) => {
      if (this.state.recordingMode === 'per_part') {
        const part = this.state.project.parts[this.state.currentPart];
        Recorder.savePartRecording(part.part_number);
      }
      this.showReview(blob);
    };

    Recorder.start(canvasStream, audioTrack);
    this.updateRecordingUI();
    this.startPartTimer();
    this.startAutoscroll();
  },

  stopRecording() {
    if (!this.state.isRecording) return;
    this.state.isRecording = false;
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
    if (this.state.isRecording) this.stopRecording();
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
    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;
    this.state.partTimer = part.timing_seconds;
    this.updateTimerDisplay();
    this.state.partTimerInterval = setInterval(() => {
      this.state.partTimer--;
      this.updateTimerDisplay();
      if (this.state.partTimer <= 0) {
        this.stopPartTimer();
        if (this.state.recordingMode === 'per_part') this.stopRecording();
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
    if (this.elements.recTimer) this.elements.recTimer.textContent = `${this.state.partTimer}s`;
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
    this.elements.reviewSaveBtn.textContent = 'Saving...';

    try {
      const result = await Recorder.saveRecording(this.state.projectName, filename);
      alert(`Saved: ${result.file}`);
      this.switchToRecording();
    } catch (e) {
      alert('Save error: ' + e.message);
    } finally {
      this.elements.reviewSaveBtn.disabled = false;
      this.elements.reviewSaveBtn.textContent = 'Save';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
