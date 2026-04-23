/**
 * App module — main studio logic
 */
const App = {
  cameraDragSuppressUntil: 0,
  builderAutosaveDelay: 1200,
  builderAutosaveTimer: null,
  builderSavePromise: null,
  studioPreferencesSaveDelay: 600,
  studioPreferencesSaveTimer: null,
  recordingElapsedInterval: null,
  previewCanvasRendering: false,

  state: {
    screen: 'settings',
    project: null,
    projectName: '',
    builderProject: null,
    builderProjectName: '',
    builderMeta: null,
    builderSelectedPartIndex: 0,
    builderDirty: false,
    builderValidationOutput: '',
    builderSlideDrafts: {},
    builderDeletedPartUndo: null,
    studioPreferences: null,
    recordingElapsedMs: 0,
    recordingSegmentStartedAt: null,
    recordingStatusMessage: '',
    currentPart: 0,
    quality: '1080p',
    recordingMode: 'continuous',
    recordingPhase: 'idle',
    isRecording: false,
    partTimer: 0,
    partTimerInterval: null,
    recordingDone: false,
    autoAdvance: true,
    autoStop: true,
    cameraShape: 'rounded-rect',
    camSize: 1.0,
    cameraPlacement: { x: 0.5, y: 0.9 },
    transition: 'fade',    // 'fade' | 'slide' | 'zoom' | 'cut'
    scriptEditorOpen: false,
    scriptEditorSource: 'preview',
    scriptEditorDraft: '',
    scriptEditorSaving: false,
    scriptEditorStatus: '',
    scriptEditorStatusTone: '',
    clickAnim: 'pulse', // 'none' | 'pulse' | 'rings'
    darkTheme: true
  },

  elements: {},

  async init() {
    this.cacheElements();
    this.bindEvents();
    Hotkeys.init();
    this.clearBuilder();
    await this.loadProjects();
    await this.loadDevices();
  },

  applyRecordingPhase(phase) {
    const nextState = RecordingState.getFlagsForPhase(phase);
    this.state.recordingPhase = nextState.recordingPhase;
    this.state.isRecording = nextState.isRecording;
    this.state.recordingDone = nextState.recordingDone;
    return nextState;
  },

  transitionRecordingPhase(event) {
    const nextState = RecordingState.transitionState(this.state.recordingPhase, event);
    this.state.recordingPhase = nextState.recordingPhase;
    this.state.isRecording = nextState.isRecording;
    this.state.recordingDone = nextState.recordingDone;
    return nextState;
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
      projectList: document.getElementById('project-list'),
      newProjectBtn: document.getElementById('new-project-btn'),
      backToProjectsBtn: document.getElementById('back-to-projects-btn'),
      builderPanel: document.getElementById('builder-panel'),
      builderProjectTitle: document.getElementById('builder-project-title'),
      builderProjectMeta: document.getElementById('builder-project-meta'),
      builderStatus: document.getElementById('builder-status'),
      builderAddPartBtn: document.getElementById('builder-add-part-btn'),
      builderSaveBtn: document.getElementById('builder-save-btn'),
      builderValidateBtn: document.getElementById('builder-validate-btn'),
      builderPartsList: document.getElementById('builder-parts-list'),
      builderEditorEmpty: document.getElementById('builder-editor-empty'),
      builderEditorFields: document.getElementById('builder-editor-fields'),
      builderSelectedPartLabel: document.getElementById('builder-selected-part-label'),
      builderDeletePartBtn: document.getElementById('builder-delete-part-btn'),
      builderTextInput: document.getElementById('builder-text-input'),
      builderTimingInput: document.getElementById('builder-timing-input'),
      builderLayoutSelect: document.getElementById('builder-layout-select'),
      builderBgTypeGroup: document.getElementById('builder-bg-type-group'),
      builderBgTypeSelect: document.getElementById('builder-bg-type-select'),
      builderMediaGroup: document.getElementById('builder-media-group'),
      builderMediaStatus: document.getElementById('builder-media-status'),
      builderUploadBtn: document.getElementById('builder-upload-btn'),
      builderRemoveUploadBtn: document.getElementById('builder-remove-upload-btn'),
      builderUploadInput: document.getElementById('builder-upload-input'),
      builderUseScreenCaptureBtn: document.getElementById('builder-use-screen-capture-btn'),
      builderConnectScreenCaptureBtn: document.getElementById('builder-connect-screen-capture-btn'),
      builderPromptGroup: document.getElementById('builder-prompt-group'),
      builderPromptInput: document.getElementById('builder-prompt-input'),
      builderClaimGroup: document.getElementById('builder-claim-group'),
      builderClaimInput: document.getElementById('builder-claim-input'),
      builderVisualProofGroup: document.getElementById('builder-visual-proof-group'),
      builderVisualProofInput: document.getElementById('builder-visual-proof-input'),
      builderSlideCategoryGroup: document.getElementById('builder-slide-category-group'),
      builderSlideCategorySelect: document.getElementById('builder-slide-category-select'),
      builderSlideDataGroup: document.getElementById('builder-slide-data-group'),
      builderSlideDataInput: document.getElementById('builder-slide-data-input'),
      builderValidationOutput: document.getElementById('builder-validation-output'),
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

      partInfo: document.getElementById('part-info'),
      layoutBadge: document.getElementById('layout-badge'),
      teleprompterText: document.getElementById('teleprompter-text'),
      editScriptBtn: document.getElementById('edit-script-btn'),
      teleprompterEditor: document.getElementById('teleprompter-editor'),
      teleprompterEditorInput: document.getElementById('teleprompter-editor-input'),
      teleprompterEditorSave: document.getElementById('teleprompter-editor-save'),
      teleprompterEditorCancel: document.getElementById('teleprompter-editor-cancel'),
      teleprompterEditorStatus: document.getElementById('teleprompter-editor-status'),
      teleprompterEditHint: document.getElementById('teleprompter-edit-hint'),
      timingInfo: document.getElementById('timing-info'),
      bgPrompt: document.getElementById('bg-prompt'),
      bgPanelTitle: document.getElementById('bg-panel-title'),
      bgPanelNote: document.getElementById('bg-panel-note'),
      previewPartRail: document.getElementById('preview-part-rail'),
      exitStudioBtn: document.getElementById('exit-studio-btn'),
      prevBtn: document.getElementById('prev-btn'),
      nextBtn: document.getElementById('next-btn'),
      recordBtn: document.getElementById('start-recording-btn'),
      previewRecordingDot: document.getElementById('preview-recording-dot'),
      previewRecordingStatus: document.getElementById('preview-recording-status'),
      previewRecordingHint: document.getElementById('preview-recording-hint'),
      previewRecordingTimer: document.getElementById('preview-recording-timer'),
      previewRecordingReadiness: document.getElementById('preview-recording-readiness'),
      previewRecordingReadinessText: document.getElementById('preview-recording-readiness-text'),
      previewConnectScreenBtn: document.getElementById('preview-connect-screen-btn'),
      previewSaveBtn: document.getElementById('save-recording-btn'),
      previewDiscardBtn: document.getElementById('discard-recording-btn'),

      recordingCanvas: document.getElementById('recording-canvas'),
      recTeleprompter: document.getElementById('rec-teleprompter'),
      recEditScriptBtn: document.getElementById('rec-edit-script-btn'),
      recTeleprompterEditor: document.getElementById('rec-teleprompter-editor'),
      recTeleprompterEditorInput: document.getElementById('rec-teleprompter-editor-input'),
      recTeleprompterEditorSave: document.getElementById('rec-teleprompter-editor-save'),
      recTeleprompterEditorCancel: document.getElementById('rec-teleprompter-editor-cancel'),
      recTeleprompterEditorStatus: document.getElementById('rec-teleprompter-editor-status'),
      recTeleprompterEditHint: document.getElementById('rec-teleprompter-edit-hint'),
      recPartInfo: document.getElementById('rec-part-info'),
      recTimer: document.getElementById('rec-timer'),
      recCountdown: document.getElementById('rec-countdown'),
      recNextPreview: document.getElementById('rec-next-preview'),
      recordingPartRail: document.getElementById('recording-part-rail'),
      recModeSelect: document.getElementById('rec-mode-select'),
      recStartBtn: document.getElementById('rec-start-btn'),
      recStopBtn: document.getElementById('rec-stop-btn'),
      recRerecordBtn: document.getElementById('rec-rerecord-btn'),
      recPrevBtn: document.getElementById('rec-prev-btn'),
      recNextBtn: document.getElementById('rec-next-btn'),
      recBackBtn: document.getElementById('rec-back-btn'),
      recIndicator: document.getElementById('rec-indicator'),

      reviewVideo: document.getElementById('review-video'),
      reviewBackBtn: document.getElementById('review-back-btn'),
      reviewPlayBtn: document.getElementById('review-play-btn'),
      reviewSaveBtn: document.getElementById('review-save-btn'),
      reviewRedoBtn: document.getElementById('review-redo-btn')
    };
  },

  bindEvents() {
    this.elements.enterBtn?.addEventListener('click', () => this.enterStudio());
    this.elements.newProjectBtn?.addEventListener('click', () => this.createProjectDraft());

    // Боковая панель-телепромптер: toggle через кнопку "Спрятать текст".
    const bindSidePanelToggle = (btnId, panelId) => {
      const btn = document.getElementById(btnId);
      const panel = document.getElementById(panelId);
      btn?.addEventListener('click', () => {
        if (!panel) return;
        const isHidden = panel.classList.toggle('teleprompter-side-collapsed');
        btn.textContent = isHidden ? '👁 Показать' : '🚫 Спрятать';
      });
    };
    bindSidePanelToggle('preview-teleprompter-side-toggle', 'preview-teleprompter-side');
    bindSidePanelToggle('rec-teleprompter-side-toggle', 'rec-teleprompter-side');

    // Safe zones Instagram: глобальный toggle через body class.
    // Overlay виден ТОЛЬКО на превью (не попадает в canvas-запись — мы добавляем
    // его после canvas в DOM, запись идёт с canvas).
    const bindSafeZonesToggle = (btnId) => {
      const btn = document.getElementById(btnId);
      btn?.addEventListener('click', () => {
        const on = document.body.classList.toggle('show-safe-zones');
        document.querySelectorAll('.safe-zones-toggle-btn').forEach(b => {
          b.classList.toggle('active', on);
        });
      });
    };
    bindSafeZonesToggle('safe-zones-toggle');
    bindSafeZonesToggle('rec-safe-zones-toggle');

    // File browser (правая панель): обновить список + открыть папку в Проводнике
    document.getElementById('output-refresh-btn')?.addEventListener('click', () => this.refreshOutputFiles());
    document.getElementById('output-open-folder-btn')?.addEventListener('click', async () => {
      if (!this.state.projectName) return alert('Сначала выбери проект');
      try { await API.revealProjectOutput(this.state.projectName); }
      catch (e) { alert('Ошибка: ' + e.message); }
    });

    // Позиция телепромптера: справа / overlay-top / overlay-center
    const posSelect = document.getElementById('teleprompter-position-select');
    posSelect?.addEventListener('change', () => this.setTeleprompterPosition(posSelect.value));

    // Зеркало камеры: влияет и на DOM video preview, и на canvas записи.
    const mirrorInput = document.getElementById('mirror-toggle-input');
    const cameraVideoEl = this.elements.cameraVideo;
    const applyMirror = (on) => {
      Canvas.mirrorRecording = !!on;
      if (cameraVideoEl) {
        cameraVideoEl.style.transform = on ? 'scaleX(-1)' : '';
      }
    };
    mirrorInput?.addEventListener('change', (e) => applyMirror(e.target.checked));
    // По умолчанию selfie-эффект включён (как в вебках):
    if (mirrorInput) {
      mirrorInput.checked = true;
      applyMirror(true);
    }
    this.elements.backToProjectsBtn?.addEventListener('click', () => this.returnToProjectPicker());
    this.elements.projectSelect?.addEventListener('change', () => this.handleProjectSelectionChange());
    this.elements.builderAddPartBtn?.addEventListener('click', () => this.addBuilderPart());
    this.elements.builderSaveBtn?.addEventListener('click', () => this.saveBuilderProject());
    this.elements.builderValidateBtn?.addEventListener('click', () => this.validateBuilderProject());
    this.elements.builderDeletePartBtn?.addEventListener('click', () => this.deleteSelectedBuilderPart());
    this.elements.builderTextInput?.addEventListener('input', (e) => this.updateSelectedBuilderPart('text', e.target.value));
    this.elements.builderLayoutSelect?.addEventListener('change', (e) => this.updateSelectedBuilderPart('layout', e.target.value));
    this.elements.builderUploadBtn?.addEventListener('click', () => this.elements.builderUploadInput?.click());
    this.elements.builderUploadInput?.addEventListener('change', (e) => {
      if (e.target.files[0]) this.uploadBuilderBackground(e.target.files[0]);
      e.target.value = '';
    });
    this.elements.builderUseScreenCaptureBtn?.addEventListener('click', () => this.useBuilderScreenCapture());
    this.elements.builderConnectScreenCaptureBtn?.addEventListener('click', () => this.connectBuilderScreenCapture());
    this.elements.builderRemoveUploadBtn?.addEventListener('click', () => this.removeBuilderBackground());
    this.elements.prevBtn?.addEventListener('click', () => this.prevSlide());
    this.elements.nextBtn?.addEventListener('click', () => this.nextSlide());
    this.elements.exitStudioBtn?.addEventListener('click', () => this.exitStudioToSettings());
    this.elements.recordBtn?.addEventListener('click', () => this.togglePreviewRecording());
    this.elements.previewConnectScreenBtn?.addEventListener('click', () => this.connectMissingScreenCapture());
    this.elements.previewSaveBtn?.addEventListener('click', () => this.saveRecording());
    this.elements.previewDiscardBtn?.addEventListener('click', () => this.discardCurrentTake());
    this.elements.editScriptBtn?.addEventListener('click', () => this.openScriptEditor('preview'));
    this.elements.teleprompterText?.addEventListener('click', () => this.openScriptEditor('preview'));
    this.elements.teleprompterEditorInput?.addEventListener('input', (e) => this.updateScriptEditorDraft(e.target.value));
    this.elements.teleprompterEditorInput?.addEventListener('keydown', (e) => this.handleScriptEditorKeydown(e));
    this.elements.teleprompterEditorSave?.addEventListener('click', () => this.saveInlineScriptEdit());
    this.elements.teleprompterEditorCancel?.addEventListener('click', () => this.closeScriptEditor());
    this.elements.recEditScriptBtn?.addEventListener('click', () => this.openScriptEditor('recording'));
    this.elements.recTeleprompter?.addEventListener('click', () => this.openScriptEditor('recording'));
    this.elements.recTeleprompterEditorInput?.addEventListener('input', (e) => this.updateScriptEditorDraft(e.target.value));
    this.elements.recTeleprompterEditorInput?.addEventListener('keydown', (e) => this.handleScriptEditorKeydown(e));
    this.elements.recTeleprompterEditorSave?.addEventListener('click', () => this.saveInlineScriptEdit());
    this.elements.recTeleprompterEditorCancel?.addEventListener('click', () => this.closeScriptEditor());

    // Upload custom background
    document.getElementById('upload-bg-btn')?.addEventListener('click', () => {
      document.getElementById('upload-bg-input')?.click();
    });
    document.getElementById('upload-bg-input')?.addEventListener('change', (e) => {
      if (e.target.files[0]) this.uploadCustomBackground(e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('remove-custom-btn')?.addEventListener('click', () => this.removeCustomBackground());
    document.getElementById('connect-screen-capture-btn')?.addEventListener('click', () => this.connectCurrentScreenCapture());

    // Drag-and-drop on phone frame
    const phoneFrame = document.getElementById('phone-frame');
    if (phoneFrame) {
      phoneFrame.addEventListener('dragover', (e) => { e.preventDefault(); phoneFrame.classList.add('drag-over'); });
      phoneFrame.addEventListener('dragleave', () => phoneFrame.classList.remove('drag-over'));
      phoneFrame.addEventListener('drop', (e) => {
        e.preventDefault();
        phoneFrame.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
          this.uploadCustomBackground(file);
        }
      });
    }

    // v2: Camera size slider
    document.getElementById('cam-size-slider')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('cam-size-value').textContent = `${val.toFixed(1)}x`;
      this.state.camSize = val;
      this.applyCamSize();
      this.scheduleStudioPreferencesSave();
    });

    // v2: Background mode toggle
    document.getElementById('bg-mode-btn')?.addEventListener('click', () => this.toggleBgMode());
    document.getElementById('no-camera-btn')?.addEventListener('click', () => this.toggleNoCamera());

    // Click animation select
    document.getElementById('click-anim-select')?.addEventListener('change', (e) => {
      this.state.clickAnim = e.target.value;
      this.scheduleStudioPreferencesSave();
    });

    // Click animation on phone frame (preview) and canvas wrapper (recording)
    document.getElementById('phone-frame')?.addEventListener('click', (e) => this.handleClickAnim(e));
    document.querySelector('.rec-canvas-wrapper')?.addEventListener('click', (e) => this.handleClickAnim(e));

    // v2: Transition selector
    document.getElementById('transition-select')?.addEventListener('change', (e) => {
      this.state.transition = e.target.value;
      Canvas.setTransition(this.state.transition);
      this.scheduleStudioPreferencesSave();
    });

    // v2: Camera shape (now inside studio)
    this.elements.cameraShapeSelect?.addEventListener('change', (e) => {
      this.state.cameraShape = e.target.value;
      this.updateCameraShape();
      this.scheduleStudioPreferencesSave();
    });

    // v2: Theme button (now inside studio)
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      this.state.darkTheme = !this.state.darkTheme;
      this.setTheme(this.state.darkTheme ? 'dark' : 'light');
      const btn = document.getElementById('theme-toggle-btn');
      btn.textContent = this.state.darkTheme ? 'Тёмная тема' : 'Светлая тема';
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

    // Recording buttons
    this.elements.recStartBtn?.addEventListener('click', () => this.startRecording());
    this.elements.recStopBtn?.addEventListener('click', () => this.stopRecording());
    this.elements.recRerecordBtn?.addEventListener('click', () => this.rerecord());
    this.elements.recPrevBtn?.addEventListener('click', () => this.prevSlide());
    this.elements.recNextBtn?.addEventListener('click', () => this.nextSlide());
    this.elements.recBackBtn?.addEventListener('click', () => this.switchToPreview());
    document.getElementById('rec-save-direct-btn')?.addEventListener('click', () => this.saveRecording());
    document.getElementById('rec-preview-btn')?.addEventListener('click', () => this.toggleRecPreview());

    document.getElementById('rec-prev-btn-nav')?.addEventListener('click', () => this.prevSlide());
    document.getElementById('rec-next-btn-nav')?.addEventListener('click', () => this.nextSlide());

    // Review buttons
    this.elements.reviewBackBtn?.addEventListener('click', () => this.exitStudioToSettings());
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
      if (this.state.scriptEditorOpen) {
        this.closeScriptEditor();
        return;
      }
      if (this.state.screen === 'recording') this.switchToPreview();
      if (this.state.screen === 'review') this.switchToRecording();
    });
    Hotkeys.bind(' ', () => {
      if (this.state.screen === 'preview') {
        this.togglePreviewRecording();
      } else if (this.state.screen === 'recording') {
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
    this.initCameraDrag();
    window.addEventListener('resize', () => {
      if (this.state.screen === 'preview') {
        this.syncCameraWindowPlacement();
      }
    });
  },

  // === Settings ===

  async loadProjects(selectedProjectName = null) {
    try {
      const data = await API.getProjects();
      const select = this.elements.projectSelect;
      const preferredProject = selectedProjectName || this.state.builderProjectName || select?.value || '';
      if (select) {
        select.innerHTML = '<option value="">-- Выберите проект --</option>';
      }
      data.projects.forEach(p => {
        if (!select) return;
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
      });

      if (select && preferredProject && data.projects.some(p => p.name === preferredProject)) {
        select.value = preferredProject;
      }

      this.renderProjectLibrary(data.projects, preferredProject);
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  },

  renderProjectLibrary(projects = [], selectedProjectName = '') {
    const list = this.elements.projectList;
    if (!list) return;

    list.innerHTML = '';

    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'project-list-empty';
      empty.textContent = 'Проектов пока нет. Создайте первый проект.';
      list.appendChild(empty);
      return;
    }

    projects.forEach((project) => {
      const item = document.createElement('div');
      item.className = 'project-card';
      if (project.name === selectedProjectName) {
        item.classList.add('active');
      }

      const updated = project.updated_at
        ? new Date(project.updated_at).toLocaleDateString('ru-RU')
        : 'без даты';
      const partCount = project.parts_count || 0;

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'project-card-open';
      openBtn.innerHTML = `
        <span class="project-card-title">${this.escapeHtml(project.name)}</span>
        <span class="project-card-meta">${partCount} этапов • ${this.getBuilderStatusLabel(project.status)} • ${updated}</span>
      `;
      openBtn.addEventListener('click', () => this.openProjectFromLibrary(project.name));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'project-card-delete';
      delBtn.title = 'Удалить проект';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await window.confirm(`Удалить проект «${project.name}»? Все файлы проекта будут удалены без возможности восстановления.`);
        if (!ok) return;
        try {
          await API.deleteProject(project.name);
          await this.loadProjects();
          // Если был открыт builder с этим проектом — очищаем
          if (this.state.builderProjectName === project.name) {
            this.clearBuilder('Проект удалён');
            this.state.builderProjectName = null;
          }
        } catch (err) {
          alert('Ошибка удаления: ' + err.message);
        }
      });

      item.appendChild(openBtn);
      item.appendChild(delBtn);
      list.appendChild(item);
    });
  },

  async openProjectFromLibrary(projectName) {
    if (!projectName) return;
    if (this.elements.projectSelect) {
      this.elements.projectSelect.value = projectName;
    }
    await this.loadBuilderProject(projectName);
  },

  async createProjectDraft() {
    const displayName = await window.prompt('Название проекта');
    if (displayName === null || displayName === undefined) return;

    const trimmedName = String(displayName).trim();
    if (!trimmedName) {
      return alert('Введите название проекта');
    }

    const button = this.elements.newProjectBtn;
    if (button) {
      button.disabled = true;
      button.textContent = 'Создание...';
    }

    try {
      const result = await API.createProject({
        display_name: trimmedName,
        language: 'ru',
        source_mode: 'studio'
      });

      await this.loadProjects(result.name);
      if (this.elements.projectSelect) {
        this.elements.projectSelect.value = result.name;
      }
      await this.loadBuilderProject(result.name);
      this.setBuilderStatus(`Проект ${result.name} создан`, 'success');
    } catch (e) {
      alert('Ошибка создания проекта: ' + e.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Новый проект';
      }
    }
  },

  clearBuilder(message = 'Выберите проект, чтобы редактировать этапы') {
    this.clearBuilderAutosave();
    this.state.builderProject = null;
    this.state.builderProjectName = '';
    this.state.builderMeta = null;
    this.state.builderSelectedPartIndex = 0;
    this.state.builderDirty = false;
    this.state.builderValidationOutput = '';
    this.state.builderSlideDrafts = {};
    this.state.builderDeletedPartUndo = null;
    this.renderBuilder();
    this.setBuilderStatus(message);
  },

  updateSettingsMode() {
    const hasProject = !!this.state.builderProject;

    this.elements.settingsScreen?.classList.toggle('is-builder-open', hasProject);
    document.getElementById('project-library')?.classList.toggle('hidden', hasProject);
    this.elements.builderPanel?.classList.toggle('hidden', !hasProject);
    this.elements.backToProjectsBtn?.classList.toggle('hidden', !hasProject);

    if (this.elements.enterBtn) {
      this.elements.enterBtn.disabled = !hasProject;
    }
  },

  async returnToProjectPicker() {
    const currentProjectName = this.state.builderProjectName || '';
    if (!currentProjectName) {
      if (this.elements.projectSelect) this.elements.projectSelect.value = '';
      this.clearBuilder('Выберите проект или создайте новый');
      await this.loadProjects();
      return;
    }

    if (this.state.builderDirty) {
      const saved = await this.saveBuilderProject({ quiet: true, reloadList: false });
      if (!saved) return;
    }

    if (this.elements.projectSelect) {
      this.elements.projectSelect.value = '';
    }
    this.clearBuilder('Выберите проект или создайте новый');
    await this.loadProjects();
  },

  async handleProjectSelectionChange() {
    const nextProjectName = this.elements.projectSelect.value;
    const currentProjectName = this.state.builderProjectName || '';

    if (nextProjectName === currentProjectName) {
      return;
    }

    if (currentProjectName && this.state.builderDirty) {
      const saved = await this.saveBuilderProject({ quiet: true, reloadList: false });
      if (!saved) {
        this.elements.projectSelect.value = currentProjectName;
        return;
      }
    }

    if (!nextProjectName) {
      this.clearBuilder();
      return;
    }

    await this.loadBuilderProject(nextProjectName);
  },

  async loadBuilderProject(projectName) {
    try {
      this.clearBuilderAutosave();
      const project = await API.getProject(projectName);
      const meta = project.meta || null;

      delete project.meta;

      this.state.builderProject = project;
      this.state.builderProjectName = project.name || projectName;
      this.state.builderMeta = meta;
      this.state.builderSelectedPartIndex = 0;
      this.state.builderDirty = false;
      this.state.builderValidationOutput = '';
      this.state.builderSlideDrafts = {};
      this.state.builderDeletedPartUndo = null;

      if (this.elements.projectSelect) {
        this.elements.projectSelect.value = this.state.builderProjectName;
      }
      this.renderBuilder();
      this.setBuilderStatus(`Проект ${projectName} загружен`, 'success');
    } catch (e) {
      console.error('Failed to load builder project:', e);
      this.clearBuilder();
      alert('Ошибка загрузки проекта: ' + e.message);
    }
  },

  renderBuilder() {
    const project = this.state.builderProject;
    const listEl = this.elements.builderPartsList;
    const editorEmpty = this.elements.builderEditorEmpty;
    const editorFields = this.elements.builderEditorFields;

    this.updateSettingsMode();

    if (!project) {
      if (this.elements.builderProjectTitle) this.elements.builderProjectTitle.textContent = 'Конструктор проекта';
      if (this.elements.builderProjectMeta) this.elements.builderProjectMeta.textContent = 'Выберите существующий проект или создайте новый';
      if (listEl) listEl.innerHTML = '';
      if (editorEmpty) editorEmpty.classList.remove('hidden');
      if (editorFields) editorFields.classList.add('hidden');
      this.refreshBuilderHeader();
      this.updateBuilderButtons();
      return;
    }

    this.recalculateBuilderProject();
    this.refreshBuilderHeader();
    this.renderBuilderPartsList();
    this.renderSelectedBuilderPart();
  },

  refreshBuilderHeader() {
    const project = this.state.builderProject;
    const titleEl = this.elements.builderProjectTitle;
    const metaEl = this.elements.builderProjectMeta;
    const validationOutput = this.elements.builderValidationOutput;

    if (!project) {
      if (validationOutput) {
        validationOutput.textContent = '';
        validationOutput.classList.add('hidden');
      }
      this.updateBuilderButtons();
      return;
    }

    if (titleEl) titleEl.textContent = project.project_name;
    if (metaEl) {
      const modeLabel = this.state.builderMeta?.source_mode === 'studio' ? 'studio' : 'classic';
      const statusLabel = this.getBuilderStatusLabel(this.state.builderMeta?.status || 'draft');
      const dirtyLabel = this.state.builderDirty ? ' • несохраненные изменения' : '';
      metaEl.textContent = `${project.parts.length} этапов • ${modeLabel} • ${statusLabel}${dirtyLabel}`;
    }

    if (validationOutput) {
      validationOutput.textContent = this.state.builderValidationOutput || '';
      validationOutput.classList.toggle('hidden', !this.state.builderValidationOutput);
    }

    this.updateBuilderButtons();
  },

  renderBuilderPartsList() {
    const listEl = this.elements.builderPartsList;
    const project = this.state.builderProject;
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!project?.parts?.length) {
      const empty = document.createElement('div');
      empty.className = 'builder-empty';
      empty.textContent = 'В проекте пока нет этапов. Нажмите "Добавить этап".';
      listEl.appendChild(empty);
      return;
    }

    project.parts.forEach((part, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'builder-part-item';
      if (index === this.state.builderSelectedPartIndex) {
        item.classList.add('active');
      }

      const previewText = (part.text || '').trim() || 'Пустой текст';
      item.innerHTML = `
        <div class="builder-part-top">
          <span class="builder-part-number">Этап ${part.part_number}</span>
          <span class="builder-part-type">${this.getBuilderBackgroundTypeLabel(this.getEffectivePartBackgroundType(part))}</span>
        </div>
        <div class="builder-part-text">${this.escapeHtml(previewText)}</div>
        <div class="builder-part-meta">${this.getBuilderLayoutLabel(part.layout)} • ${this.getBuilderMediaSummary(part)}</div>
      `;

      item.addEventListener('click', () => {
        this.state.builderSelectedPartIndex = index;
        this.renderSelectedBuilderPart();
        this.renderBuilderPartsList();
      });

      listEl.appendChild(item);
    });
  },

  renderSelectedBuilderPart() {
    const part = this.getSelectedBuilderPart();
    const editorEmpty = this.elements.builderEditorEmpty;
    const editorFields = this.elements.builderEditorFields;

    if (!part) {
      editorEmpty?.classList.remove('hidden');
      editorFields?.classList.add('hidden');
      return;
    }

    editorEmpty?.classList.add('hidden');
    editorFields?.classList.remove('hidden');
    this.populateBuilderEditor(part);
  },

  populateBuilderEditor(part) {
    if (!part) return;

    if (this.elements.builderSelectedPartLabel) {
      this.elements.builderSelectedPartLabel.textContent = `Этап ${part.part_number}`;
    }

    if (this.elements.builderTextInput) this.elements.builderTextInput.value = part.text || '';
    if (this.elements.builderLayoutSelect) this.elements.builderLayoutSelect.value = part.layout || 'face_only';
    this.updateBuilderMediaState(part);

    if (this.elements.builderDeletePartBtn) {
      this.elements.builderDeletePartBtn.disabled = (this.state.builderProject?.parts?.length || 0) <= 1;
    }
  },

  getBuilderLayoutLabel(layout) {
    const labels = {
      full_background: 'С фоном',
      face_only: 'Только лицо'
    };
    return labels[layout] || 'С фоном';
  },

  getBuilderBackgroundTypeLabel(type) {
    const labels = {
      none: 'Без фона',
      photo: 'Фото',
      video: 'Видео',
      html_slide: 'HTML',
      screen_capture: 'Окно экрана'
    };
    return labels[type] || type || 'Без фона';
  },

  getEffectivePartBackgroundType(part) {
    if (!part || part.layout === 'face_only') return 'none';
    if (part.background_type === 'screen_capture') return 'screen_capture';
    if (part.custom_type) return part.custom_type;
    if (part.background_type === 'html_slide' && part.slide_file) return 'html_slide';
    if (part.background_file) {
      return /\.(mp4|webm|mov)$/i.test(part.background_file) ? 'video' : 'photo';
    }
    return part.background_type || 'none';
  },

  getBuilderMediaSummary(part) {
    if (!part || part.layout === 'face_only') {
      return 'без фона';
    }
    if (part.background_type === 'screen_capture') {
      return 'окно экрана';
    }
    if (part.custom_file) {
      return part.custom_type === 'video' ? 'видео загружено' : 'изображение загружено';
    }
    if (part.background_type === 'html_slide' && part.slide_file) {
      return 'слайд проекта';
    }
    if (part.background_file) {
      return 'медиа проекта';
    }
    return 'медиа не загружено';
  },

  inferPersistedBackgroundType(part) {
    if (!part || part.layout === 'face_only') {
      return 'none';
    }
    if (part.background_type === 'screen_capture') {
      return 'screen_capture';
    }
    if (part.custom_type) {
      return part.custom_type;
    }
    if (part.background_type === 'html_slide' && part.slide_file) {
      return 'html_slide';
    }
    if (part.background_file) {
      return /\.(mp4|webm|mov)$/i.test(part.background_file) ? 'video' : 'photo';
    }
    return 'none';
  },

  getResolvedLayout(part) {
    return part?.layout === 'face_only' ? 'face_only' : 'full_background';
  },

  updateBuilderMediaState(part) {
    const mediaStatus = this.elements.builderMediaStatus;
    const uploadBtn = this.elements.builderUploadBtn;
    const removeBtn = this.elements.builderRemoveUploadBtn;
    const screenCaptureBtn = this.elements.builderUseScreenCaptureBtn;
    const connectScreenBtn = this.elements.builderConnectScreenCaptureBtn;
    if (!part) return;

    if (part.layout === 'face_only') {
      if (mediaStatus) {
        mediaStatus.textContent = 'Фон не нужен для режима "Только лицо".';
      }
      if (uploadBtn) uploadBtn.disabled = true;
      if (screenCaptureBtn) {
        screenCaptureBtn.disabled = true;
        screenCaptureBtn.classList.remove('is-active');
      }
      if (connectScreenBtn) {
        connectScreenBtn.disabled = true;
        connectScreenBtn.classList.add('hidden');
      }
      if (removeBtn) removeBtn.classList.add('hidden');
      return;
    }

    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = part.custom_file ? 'Заменить медиа' : 'Изображение / видео';
    }
    if (screenCaptureBtn) {
      screenCaptureBtn.disabled = false;
      screenCaptureBtn.classList.toggle('hidden', part.background_type === 'screen_capture');
      screenCaptureBtn.classList.remove('is-active');
    }
    if (connectScreenBtn) {
      const isScreenCapture = part.background_type === 'screen_capture';
      connectScreenBtn.disabled = !isScreenCapture;
      connectScreenBtn.classList.toggle('hidden', !isScreenCapture);
      connectScreenBtn.textContent = Background.isScreenCaptureConnected(part.part_number)
        ? 'Перевыбрать окно'
        : 'Подключить окно';
    }
    if (removeBtn) {
      removeBtn.classList.toggle('hidden', !part.custom_file && !part.background_url && part.background_type !== 'screen_capture');
    }

    if (!mediaStatus) return;

    if (part.background_type === 'screen_capture') {
      mediaStatus.textContent = Background.isScreenCaptureConnected(part.part_number)
        ? 'Окно экрана подключено.'
        : 'Окно экрана выбрано, но еще не подключено.';
      return;
    }

    if (part.custom_file) {
      const typeLabel = part.custom_type === 'video' ? 'Видео' : 'Изображение';
      mediaStatus.textContent = `${typeLabel}: ${part.custom_file}`;
      return;
    }

    if (part.background_type === 'html_slide' && part.slide_file) {
      mediaStatus.textContent = `HTML-слайд проекта: ${part.slide_file}`;
      return;
    }

    if (part.background_file) {
      mediaStatus.textContent = `Медиа проекта: ${part.background_file}`;
      return;
    }

    mediaStatus.textContent = 'Выберите источник: изображение/видео или окно экрана.';
  },

  updateBuilderButtons() {
    const hasProject = !!this.state.builderProject;
    if (this.elements.builderAddPartBtn) this.elements.builderAddPartBtn.disabled = !hasProject;
    if (this.elements.builderSaveBtn) this.elements.builderSaveBtn.disabled = !hasProject;
    if (this.elements.builderValidateBtn) this.elements.builderValidateBtn.disabled = !hasProject;
  },

  getBuilderStatusLabel(status) {
    const statusMap = {
      draft: 'черновик',
      ready: 'готов',
      recorded: 'записан'
    };
    return statusMap[status] || status || 'черновик';
  },

  setBuilderStatus(message, tone = '') {
    const el = this.elements.builderStatus;
    if (!el) return;
    el.textContent = message;
    el.className = 'builder-status';
    if (tone) {
      el.classList.add(`is-${tone}`);
    }
  },

  setBuilderUndoStatus(part) {
    const el = this.elements.builderStatus;
    if (!el || !part) return;

    el.className = 'builder-status is-warning builder-status-with-action';
    el.textContent = '';

    const message = document.createElement('span');
    message.textContent = `Этап ${part.part_number} удален. Можно отменить до смены проекта или входа в студию.`;

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'btn btn-secondary btn-sm builder-undo-btn';
    undoBtn.textContent = 'Отменить';
    undoBtn.addEventListener('click', () => this.undoDeletedBuilderPart());

    el.appendChild(message);
    el.appendChild(undoBtn);
  },

  clearBuilderAutosave() {
    if (!this.builderAutosaveTimer) return;
    window.clearTimeout(this.builderAutosaveTimer);
    this.builderAutosaveTimer = null;
  },

  scheduleBuilderAutosave() {
    if (!this.state.builderProject || !this.state.builderProjectName || !this.state.builderDirty) {
      return;
    }

    this.clearBuilderAutosave();
    this.builderAutosaveTimer = window.setTimeout(() => {
      this.builderAutosaveTimer = null;
      if (!this.state.builderDirty || !this.state.builderProjectName) {
        return;
      }
      this.saveBuilderProject({ quiet: true, autosave: true, reloadList: false });
    }, this.builderAutosaveDelay);
  },

  makeBuilderPartId() {
    if (window.crypto?.randomUUID) {
      return `part-${window.crypto.randomUUID()}`;
    }
    return `part-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  },

  createBuilderPart() {
    return {
      part_id: this.makeBuilderPartId(),
      part_number: (this.state.builderProject?.parts?.length || 0) + 1,
      text: '',
      layout: 'full_background',
      timing_seconds: 0,
      background_type: 'none',
      background_url: '',
      screen_capture_label: '',
      background_prompt: '',
      claim: '',
      visual_proof: '',
      background_category: '',
      slide_data: {}
    };
  },

  recalculateBuilderProject() {
    const project = this.state.builderProject;
    if (!project) return;

    project.parts = (project.parts || []).map((part, index) => ({
      ...part,
      part_number: index + 1,
      timing_seconds: 0
    }));
    project.total_duration_seconds = 0;
  },

  getSelectedBuilderPart() {
    const project = this.state.builderProject;
    if (!project?.parts?.length) return null;

    if (this.state.builderSelectedPartIndex >= project.parts.length) {
      this.state.builderSelectedPartIndex = project.parts.length - 1;
    }
    if (this.state.builderSelectedPartIndex < 0) {
      this.state.builderSelectedPartIndex = 0;
    }

    return project.parts[this.state.builderSelectedPartIndex] || null;
  },

  markBuilderDirty(message = 'Есть несохраненные изменения', options = {}) {
    const { autosave = true } = options;
    this.state.builderDirty = true;
    this.state.builderValidationOutput = '';
    const statusMessage = message
      ? `${message}. Черновик сохранится автоматически.`
      : 'Черновик сохранится автоматически.';
    this.setBuilderStatus(statusMessage, 'warning');
    this.refreshBuilderHeader();
    if (autosave) {
      this.scheduleBuilderAutosave();
    } else {
      this.clearBuilderAutosave();
    }
  },

  updateSelectedBuilderPart(field, value) {
    const part = this.getSelectedBuilderPart();
    if (!part) return;

    if (field === 'layout') {
      part.layout = value;
      if (value === 'face_only') {
        part.background_type = 'none';
        part.background_url = '';
        part.screen_capture_label = '';
        part.background_prompt = '';
      } else if (part.custom_type) {
        part.background_type = part.custom_type;
      } else if (part.screen_capture_label) {
        part.background_type = 'screen_capture';
      }
    } else {
      part[field] = value;
    }

    this.recalculateBuilderProject();
    this.renderBuilderPartsList();
    this.markBuilderDirty();

    if (field === 'layout') {
      this.renderSelectedBuilderPart();
    }
  },

  getBuilderSlideDataText(part) {
    if (!part) return '';
    if (Object.prototype.hasOwnProperty.call(this.state.builderSlideDrafts, part.part_id)) {
      return this.state.builderSlideDrafts[part.part_id];
    }
    if (!part.slide_data || typeof part.slide_data !== 'object') {
      return '';
    }
    return JSON.stringify(part.slide_data, null, 2);
  },

  isCurrentSlideDataValid() {
    const part = this.getSelectedBuilderPart();
    if (!part || part.background_type !== 'html_slide') return true;
    const rawValue = this.getBuilderSlideDataText(part).trim();
    if (!rawValue) return false;

    try {
      JSON.parse(rawValue);
      return true;
    } catch (e) {
      return false;
    }
  },

  updateBuilderSlideData(rawValue) {
    const part = this.getSelectedBuilderPart();
    if (!part) return;

    this.state.builderSlideDrafts[part.part_id] = rawValue;

    if (this.elements.builderSlideDataInput) {
      this.elements.builderSlideDataInput.classList.toggle('invalid', rawValue.trim() !== '' && !this.isCurrentSlideDataValid());
    }

    if (rawValue.trim() !== '') {
      try {
        part.slide_data = JSON.parse(rawValue);
      } catch (e) {
        // Keep the last valid object in memory; invalid JSON is handled on save/validate.
      }
    } else {
      part.slide_data = {};
    }

    this.markBuilderDirty();
  },

  useBuilderScreenCapture() {
    const part = this.getSelectedBuilderPart();
    if (!part) return;

    if (part.layout === 'face_only') {
      alert('Для режима "Только лицо" фон не используется.');
      return;
    }

    part.background_type = 'screen_capture';
    part.screen_capture_label = 'Окно экрана';
    part.background_url = '';
    part.custom_file = null;
    part.custom_type = null;
    this.renderBuilder();
    this.markBuilderDirty('Окно экрана выбрано как фон');
  },

  async connectBuilderScreenCapture() {
    const part = this.getSelectedBuilderPart();
    if (!part) return;

    if (part.layout === 'face_only') {
      alert('Для режима "Только лицо" фон не используется.');
      return;
    }

    if (part.background_type !== 'screen_capture') {
      this.useBuilderScreenCapture();
    }

    try {
      await Background.connectScreenCapture(part.part_number, {
        projectName: this.state.builderProjectName,
        label: part.screen_capture_label || 'Окно экрана'
      });
      this.updateBuilderMediaState(part);
      this.setBuilderStatus('Окно подключено. Держите выбранное окно открытым перед записью.', 'success');
    } catch (error) {
      alert('Не удалось подключить окно: ' + error.message);
    }
  },

  async connectCurrentScreenCapture() {
    const part = this.state.project?.parts?.[this.state.currentPart];
    if (!part || part.background_type !== 'screen_capture') {
      return;
    }

    try {
      await Background.connectScreenCapture(part.part_number, {
        projectName: this.state.projectName,
        label: part.screen_capture_label || 'Окно экрана'
      });
      this.showCurrentSlide();
      this.updateCustomBtn();
      this.updatePreviewRecordingUI();
    } catch (error) {
      alert('Не удалось подключить окно: ' + error.message);
    }
  },

  async uploadBuilderBackground(file) {
    const part = this.getSelectedBuilderPart();
    if (!this.state.builderProject || !part) return;

    if (part.layout === 'face_only') {
      return alert('Для режима "Только лицо" фон не используется.');
    }

    try {
      const builderProjectName = this.state.builderProjectName;
      if (!builderProjectName) {
        throw new Error('Project folder is not resolved');
      }
      const result = await API.uploadBackground(builderProjectName, part.part_number, file);
      part.custom_file = result.file;
      part.custom_type = result.type;
      part.background_url = '';
      part.screen_capture_label = '';
      part.background_type = result.type;
      Background.stopScreenCapture(part.part_number);
      this.renderBuilder();
      this.markBuilderDirty('Медиа загружено');
    } catch (e) {
      alert('Ошибка загрузки медиа: ' + e.message);
    }
  },

  async removeBuilderBackground() {
    const project = this.state.builderProject;
    const part = this.getSelectedBuilderPart();
    if (!project || !part || (!part.custom_file && part.background_type !== 'screen_capture')) return;

    if (part.background_type === 'screen_capture' && !part.custom_file) {
      Background.stopScreenCapture(part.part_number);
      part.screen_capture_label = '';
      part.background_type = 'none';
      this.renderBuilder();
      this.markBuilderDirty('Окно экрана удалено');
      return;
    }

    try {
      const builderProjectName = this.state.builderProjectName;
      if (!builderProjectName) {
        throw new Error('Project folder is not resolved');
      }
      await API.deleteCustomBackground(builderProjectName, part.part_number);
      part.custom_file = null;
      part.custom_type = null;
      part.background_type = this.inferPersistedBackgroundType(part);
      this.renderBuilder();
      this.markBuilderDirty('Медиа удалено');
    } catch (e) {
      alert('Ошибка удаления медиа: ' + e.message);
    }
  },

  addBuilderPart() {
    const project = this.state.builderProject;
    if (!project) return;

    project.parts = project.parts || [];
    project.parts.push(this.createBuilderPart());
    this.state.builderSelectedPartIndex = project.parts.length - 1;
    this.recalculateBuilderProject();
    this.renderBuilder();
    this.markBuilderDirty('Новый этап добавлен');
  },

  deleteSelectedBuilderPart() {
    const project = this.state.builderProject;
    const part = this.getSelectedBuilderPart();
    if (!project || !part) return;

    if (project.parts.length <= 1) {
      alert('В проекте должен остаться хотя бы один этап');
      return;
    }

    const previewText = (part.text || '').trim();
    const confirmed = window.confirm(
      `Удалить этап ${part.part_number}${previewText ? `: "${previewText.slice(0, 80)}"` : ''}?\n\nЭто действие можно будет отменить до сохранения.`
    );
    if (!confirmed) return;

    const deleteIndex = this.state.builderSelectedPartIndex;
    this.state.builderDeletedPartUndo = {
      part: JSON.parse(JSON.stringify(part)),
      index: deleteIndex,
      slideDraft: Object.prototype.hasOwnProperty.call(this.state.builderSlideDrafts, part.part_id)
        ? this.state.builderSlideDrafts[part.part_id]
        : undefined
    };

    delete this.state.builderSlideDrafts[part.part_id];
    project.parts.splice(deleteIndex, 1);
    this.state.builderSelectedPartIndex = Math.max(0, deleteIndex - 1);
    this.recalculateBuilderProject();
    this.renderBuilder();
    this.markBuilderDirty('Этап удален', { autosave: false });
    this.setBuilderUndoStatus(this.state.builderDeletedPartUndo.part);
  },

  undoDeletedBuilderPart() {
    const project = this.state.builderProject;
    const undo = this.state.builderDeletedPartUndo;
    if (!project || !undo?.part) return;

    const insertAt = Math.min(Math.max(undo.index, 0), project.parts.length);
    project.parts.splice(insertAt, 0, undo.part);
    this.state.builderSelectedPartIndex = insertAt;

    if (undo.slideDraft !== undefined) {
      this.state.builderSlideDrafts[undo.part.part_id] = undo.slideDraft;
    }

    this.state.builderDeletedPartUndo = null;
    this.recalculateBuilderProject();
    this.renderBuilder();
    this.markBuilderDirty('Удаление этапа отменено');
  },

  buildBuilderScriptPayload() {
    const project = this.state.builderProject;
    if (!project) {
      throw new Error('Сначала выберите проект');
    }

    const payload = JSON.parse(JSON.stringify(project));
    delete payload.meta;

    payload.parts = (payload.parts || []).map(part => {
      const cleanPart = { ...part };
      delete cleanPart.custom_file;
      delete cleanPart.custom_type;
      delete cleanPart.background_file;
      delete cleanPart.slide_file;

      if (cleanPart.layout === 'face_only') {
        cleanPart.background_type = 'none';
      } else {
        cleanPart.background_type = this.inferPersistedBackgroundType(part);
      }

      cleanPart.background_url = '';

      if (cleanPart.background_type !== 'screen_capture') {
        cleanPart.screen_capture_label = '';
      } else if (!cleanPart.screen_capture_label) {
        cleanPart.screen_capture_label = 'Окно экрана';
      }

      cleanPart.timing_seconds = 0;
      cleanPart.background_prompt = '';
      cleanPart.claim = '';
      cleanPart.visual_proof = '';

      return cleanPart;
    });

    return payload;
  },

  async saveBuilderProject({ quiet = false, reloadList = true, autosave = false } = {}) {
    if (!this.state.builderProject) return false;
    if (autosave && !this.state.builderDirty) return true;
    if (this.builderSavePromise) return this.builderSavePromise;

    this.clearBuilderAutosave();

    let payload;
    try {
      payload = this.buildBuilderScriptPayload();
    } catch (e) {
      this.setBuilderStatus(e.message, 'error');
      if (!quiet && !autosave) {
        alert(e.message);
      }
      return false;
    }

    if (autosave) {
      this.setBuilderStatus('Сохранение черновика...', 'warning');
    } else if (this.elements.builderSaveBtn) {
      this.elements.builderSaveBtn.disabled = true;
      this.elements.builderSaveBtn.textContent = 'Сохранение...';
    }

    this.builderSavePromise = (async () => {
      const builderProjectName = this.state.builderProjectName;
      if (!builderProjectName) {
        throw new Error('Project folder is not resolved');
      }

      const result = await API.saveProjectScript(builderProjectName, payload, {
        status: 'draft',
        source_mode: this.state.builderMeta?.source_mode || 'studio'
      });

      const refreshedProject = await API.getProject(builderProjectName);
      const refreshedMeta = refreshedProject.meta || result.meta;
      delete refreshedProject.meta;

      this.state.builderProject = refreshedProject;
      this.state.builderProjectName = refreshedProject.name || builderProjectName;
      this.state.builderMeta = refreshedMeta;
      this.state.builderDirty = false;
      this.state.builderValidationOutput = '';
      this.state.builderSlideDrafts = {};
      this.state.builderDeletedPartUndo = null;

      if (reloadList) {
        await this.loadProjects(this.state.builderProjectName);
      }

      this.renderBuilder();
      if (autosave) {
        this.setBuilderStatus('Черновик сохранен', 'success');
      } else if (!quiet) {
        this.setBuilderStatus('Проект сохранен', 'success');
      }
      return true;
    })()
      .catch((e) => {
        const message = autosave
          ? `Автосохранение не удалось: ${e.message}`
          : `Ошибка сохранения: ${e.message}`;
        this.setBuilderStatus(message, 'error');
        if (!quiet && !autosave) {
          alert('Ошибка сохранения проекта: ' + e.message);
        }
        return false;
      })
      .finally(() => {
        this.builderSavePromise = null;
        if (this.elements.builderSaveBtn) {
          this.elements.builderSaveBtn.disabled = false;
          this.elements.builderSaveBtn.textContent = 'Сохранить сейчас';
        }
      });

    return this.builderSavePromise;
  },

  renderStudioPartRail() {
    const parts = this.state.project?.parts || [];
    const rails = [this.elements.previewPartRail, this.elements.recordingPartRail];

    rails.forEach((rail) => {
      if (!rail) return;
      rail.innerHTML = '';

      if (!parts.length) {
        const empty = document.createElement('div');
        empty.className = 'studio-part-rail-empty';
        empty.textContent = 'Этапы появятся здесь после загрузки проекта.';
        rail.appendChild(empty);
        return;
      }

      parts.forEach((part, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'studio-part-item';
        if (index === this.state.currentPart) {
          item.classList.add('active');
        }

        const previewText = (part.text || '').trim() || 'Пустой текст';
        const meta = `${this.getBuilderLayoutLabel(this.getResolvedLayout(part))} • ${this.getBuilderMediaSummary(part)}`;

        item.innerHTML = `
          <span class="studio-part-index">Этап ${part.part_number}</span>
          <span class="studio-part-title">${this.escapeHtml(meta)}</span>
          <span class="studio-part-text">${this.escapeHtml(previewText)}</span>
        `;

        item.addEventListener('click', () => this.goToPart(index));
        rail.appendChild(item);
      });

      rail.querySelector('.studio-part-item.active')?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
    });
  },

  goToPart(index) {
    const parts = this.state.project?.parts || [];
    if (this.state.scriptEditorSaving || index < 0 || index >= parts.length || index === this.state.currentPart) {
      return;
    }

    if (this.state.scriptEditorOpen) {
      this.closeScriptEditor();
    }

    this.state.currentPart = index;
    if (typeof ScreenPan !== 'undefined') ScreenPan.reset();
    this.showCurrentSlide();

    if (this.state.isRecording) {
      this.stopAutoscroll();
      this.startAutoscroll();
    }
  },

  async validateBuilderProject() {
    const projectName = this.state.builderProjectName;
    if (!projectName) return;

    const saved = await this.saveBuilderProject({ quiet: true });
    if (!saved) return;

    if (this.elements.builderValidateBtn) {
      this.elements.builderValidateBtn.disabled = true;
      this.elements.builderValidateBtn.textContent = 'Проверка...';
    }

    try {
      const result = await API.validateProject(projectName);
      this.state.builderMeta = result.meta;
      this.state.builderValidationOutput = result.output || '';
      await this.loadProjects(projectName);
      this.renderBuilder();

      if (result.valid) {
        this.setBuilderStatus('Валидация пройдена. Проект готов к записи.', 'success');
      } else {
        this.setBuilderStatus('Валидация не пройдена. Исправьте ошибки ниже.', 'error');
      }
    } catch (e) {
      this.setBuilderStatus(`Ошибка валидации: ${e.message}`, 'error');
      alert('Ошибка валидации: ' + e.message);
    } finally {
      if (this.elements.builderValidateBtn) {
        this.elements.builderValidateBtn.disabled = false;
        this.elements.builderValidateBtn.textContent = 'Проверить';
      }
    }
  },

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  },

  renderScriptEditor() {
    const isPreview = this.state.scriptEditorOpen && this.state.scriptEditorSource === 'preview';
    const isRecording = this.state.scriptEditorOpen && this.state.scriptEditorSource === 'recording';
    const isSaving = this.state.scriptEditorSaving;
    const hasStatus = !!this.state.scriptEditorStatus;

    this.elements.teleprompterText?.classList.toggle('hidden', isPreview);
    this.elements.teleprompterEditHint?.classList.toggle('hidden', isPreview);
    this.elements.teleprompterEditor?.classList.toggle('hidden', !isPreview);
    this.elements.recTeleprompter?.classList.toggle('hidden', isRecording);
    this.elements.recTeleprompterEditHint?.classList.toggle('hidden', isRecording);
    this.elements.recTeleprompterEditor?.classList.toggle('hidden', !isRecording);

    if (this.elements.teleprompterEditorInput && this.elements.teleprompterEditorInput.value !== this.state.scriptEditorDraft) {
      this.elements.teleprompterEditorInput.value = this.state.scriptEditorDraft;
    }
    if (this.elements.recTeleprompterEditorInput && this.elements.recTeleprompterEditorInput.value !== this.state.scriptEditorDraft) {
      this.elements.recTeleprompterEditorInput.value = this.state.scriptEditorDraft;
    }

    if (this.elements.editScriptBtn) this.elements.editScriptBtn.disabled = isSaving;
    if (this.elements.recEditScriptBtn) this.elements.recEditScriptBtn.disabled = isSaving;
    if (this.elements.teleprompterEditorSave) {
      this.elements.teleprompterEditorSave.disabled = isSaving;
      this.elements.teleprompterEditorSave.textContent = isSaving ? 'Сохранение...' : 'Сохранить текст';
    }
    if (this.elements.recTeleprompterEditorSave) {
      this.elements.recTeleprompterEditorSave.disabled = isSaving;
      this.elements.recTeleprompterEditorSave.textContent = isSaving ? 'Сохранение...' : 'Сохранить текст';
    }
    if (this.elements.teleprompterEditorCancel) this.elements.teleprompterEditorCancel.disabled = isSaving;
    if (this.elements.recTeleprompterEditorCancel) this.elements.recTeleprompterEditorCancel.disabled = isSaving;

    [this.elements.teleprompterEditorStatus, this.elements.recTeleprompterEditorStatus].forEach((el) => {
      if (!el) return;
      el.textContent = this.state.scriptEditorStatus;
      el.className = 'teleprompter-editor-status';
      el.classList.toggle('hidden', !hasStatus);
      if (hasStatus && this.state.scriptEditorStatusTone) {
        el.classList.add(`is-${this.state.scriptEditorStatusTone}`);
      }
    });
  },

  openScriptEditor(source = 'preview') {
    if (!this.state.project?.parts?.length) return;
    if (this.state.isRecording) {
      alert('Сначала остановите запись, затем редактируйте текст.');
      return;
    }

    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;

    this.state.scriptEditorOpen = true;
    this.state.scriptEditorSource = source;
    this.state.scriptEditorDraft = part.text || '';
    this.state.scriptEditorStatus = '';
    this.state.scriptEditorStatusTone = '';
    this.renderScriptEditor();

    requestAnimationFrame(() => {
      const input = source === 'recording'
        ? this.elements.recTeleprompterEditorInput
        : this.elements.teleprompterEditorInput;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  },

  closeScriptEditor() {
    if (this.state.scriptEditorSaving) return;
    this.state.scriptEditorOpen = false;
    this.state.scriptEditorStatus = '';
    this.state.scriptEditorStatusTone = '';
    this.renderScriptEditor();
  },

  updateScriptEditorDraft(value) {
    this.state.scriptEditorDraft = value;
    if (this.elements.teleprompterEditorInput && this.elements.teleprompterEditorInput.value !== value) {
      this.elements.teleprompterEditorInput.value = value;
    }
    if (this.elements.recTeleprompterEditorInput && this.elements.recTeleprompterEditorInput.value !== value) {
      this.elements.recTeleprompterEditorInput.value = value;
    }
  },

  handleScriptEditorKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      this.saveInlineScriptEdit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeScriptEditor();
    }
  },

  buildStudioScriptPayload() {
    const project = this.state.project;
    if (!project) {
      throw new Error('Project is not loaded');
    }

    const payload = JSON.parse(JSON.stringify(project));
    delete payload.meta;
    delete payload.name;
    payload.parts = (payload.parts || []).map((part) => {
      const cleanPart = { ...part };
      delete cleanPart.custom_file;
      delete cleanPart.custom_type;
      delete cleanPart.background_file;
      delete cleanPart.slide_file;
      return cleanPart;
    });
    return payload;
  },

  async saveInlineScriptEdit() {
    if (!this.state.projectName || !this.state.project?.parts?.length) return;
    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;

    this.state.scriptEditorSaving = true;
    this.state.scriptEditorStatus = '';
    this.state.scriptEditorStatusTone = '';
    this.renderScriptEditor();

    const nextText = this.state.scriptEditorDraft;
    part.text = nextText;

    if (this.state.builderProjectName === this.state.projectName && this.state.builderProject?.parts?.[this.state.currentPart]) {
      this.state.builderProject.parts[this.state.currentPart].text = nextText;
    }

    Teleprompter.show(part, this.state.project.parts.length);
    this.updateRecordingUI();

    try {
      const payload = this.buildStudioScriptPayload();
      const result = await API.saveProjectScript(this.state.projectName, payload, {
        status: this.state.builderMeta?.status || 'draft',
        source_mode: this.state.builderMeta?.source_mode || 'studio'
      });

      this.state.builderMeta = result.meta || this.state.builderMeta;
      this.state.scriptEditorSaving = false;
      this.state.scriptEditorStatus = 'Текст сохранен';
      this.state.scriptEditorStatusTone = 'success';
      this.renderScriptEditor();
      this.closeScriptEditor();
    } catch (e) {
      this.state.scriptEditorSaving = false;
      this.state.scriptEditorStatus = `Ошибка сохранения: ${e.message}`;
      this.state.scriptEditorStatusTone = 'error';
      this.renderScriptEditor();
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

    if (this.state.builderProjectName === projectName && this.state.builderDirty) {
      const saved = await this.saveBuilderProject({ quiet: true });
      if (!saved) {
        return;
      }
    }

    if (this.state.builderProjectName === projectName && !(this.state.builderProject.parts || []).length) {
      return alert('Добавьте хотя бы один этап перед входом в студию');
    }

    this.state.projectName = projectName;
    this.state.quality = this.elements.qualitySelect.value;
    this.state.cameraShape = this.elements.cameraShapeSelect?.value || 'rounded-rect';
    this.state.recordingStatusMessage = '';
    this.applyRecordingPhase(RecordingState.PHASES.IDLE);
    this.resetRecordingElapsed();
    Recorder.discard();
    // Обновляем file-browser сразу при входе в проект
    this.refreshOutputFiles();

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
      await this.loadStudioPreferences(projectName);

      Teleprompter.textElement = this.elements.teleprompterText;
      Teleprompter.partInfoElement = null;
      Teleprompter.layoutBadgeElement = null;
      Teleprompter.timingBadgeElement = null;
      Teleprompter.typeBadgeElement = null;
      Teleprompter.promptElement = null;
      Teleprompter.promptSection = null;
      Teleprompter.titleElement = null;
      Teleprompter.noteElement = null;

      // Apply persisted camera settings before the first frame renders.
      this.preparePreviewRecordingCanvas();
      this.updateCameraShape();
      this.applyCamSize();

      this.state.currentPart = 0;
      this.showCurrentSlide();
      this.updatePreviewRecordingUI();

      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.previewScreen.classList.remove('hidden');
      this.state.screen = 'preview';
      requestAnimationFrame(() => this.syncCameraWindowPlacement());

    } catch (e) {
      console.error('Failed to enter studio:', e);
      alert('Ошибка: ' + e.message);
      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.settingsScreen.classList.remove('hidden');
    }
  },

  hasScreenCaptureParts() {
    return !!this.state.project?.parts?.some((part) => part.background_type === 'screen_capture');
  },

  getRecordingFps() {
    return 60;
  },

  getRecordingBitrate() {
    if (this.state.quality === '720p') {
      return this.hasScreenCaptureParts() ? 60000000 : 20000000;
    }
    return this.hasScreenCaptureParts() ? 120000000 : 50000000;
  },

  getDefaultStudioPreferences() {
    return {
      camera_shape: 'rounded-rect',
      transition: 'fade',
      click_animation: 'pulse',
      cam_size: 1,
      camera_placement: this.getDefaultCameraPlacement()
    };
  },

  normalizeStudioPreferences(preferences = {}) {
    const defaults = this.getDefaultStudioPreferences();
    const validShapes = new Set(['rounded-rect', 'circle']);
    const validTransitions = new Set(['fade', 'slide', 'zoom', 'cut']);
    const validClickAnimations = new Set(['none', 'pulse', 'rings', 'spark', 'target', 'glow']);
    const placement = preferences.camera_placement || {};
    const camSize = Number(preferences.cam_size);
    const placementX = Number(placement.x);
    const placementY = Number(placement.y);

    return {
      camera_shape: validShapes.has(preferences.camera_shape) ? preferences.camera_shape : defaults.camera_shape,
      transition: validTransitions.has(preferences.transition) ? preferences.transition : defaults.transition,
      click_animation: validClickAnimations.has(preferences.click_animation) ? preferences.click_animation : defaults.click_animation,
      cam_size: Number.isFinite(camSize) ? this.clamp(camSize, 0.5, 1.8) : defaults.cam_size,
      camera_placement: {
        x: Number.isFinite(placementX) ? this.clamp(placementX, 0, 1) : defaults.camera_placement.x,
        y: Number.isFinite(placementY) ? this.clamp(placementY, 0, 1) : defaults.camera_placement.y
      }
    };
  },

  getCurrentStudioPreferences() {
    return this.normalizeStudioPreferences({
      camera_shape: this.state.cameraShape,
      transition: this.state.transition,
      click_animation: this.state.clickAnim,
      cam_size: this.state.camSize,
      camera_placement: this.state.cameraPlacement
    });
  },

  applyStudioPreferences(preferences = {}) {
    const normalized = this.normalizeStudioPreferences(preferences);
    this.state.studioPreferences = normalized;
    this.state.cameraShape = normalized.camera_shape;
    this.state.transition = normalized.transition;
    this.state.clickAnim = normalized.click_animation;
    this.state.camSize = normalized.cam_size;
    this.state.cameraPlacement = { ...normalized.camera_placement };

    const sizeSlider = document.getElementById('cam-size-slider');
    const sizeValue = document.getElementById('cam-size-value');
    const transitionSelect = document.getElementById('transition-select');
    const clickAnimSelect = document.getElementById('click-anim-select');

    if (sizeSlider) sizeSlider.value = String(normalized.cam_size);
    if (sizeValue) sizeValue.textContent = `${normalized.cam_size.toFixed(1)}x`;
    if (this.elements.cameraShapeSelect) this.elements.cameraShapeSelect.value = normalized.camera_shape;
    if (transitionSelect) transitionSelect.value = normalized.transition;
    if (clickAnimSelect) clickAnimSelect.value = normalized.click_animation;

    Canvas.setTransition(normalized.transition);
    Canvas.setCamSize(normalized.cam_size);
    Canvas.setShape(normalized.camera_shape);
    Canvas.setCameraPlacement(normalized.camera_placement);
  },

  async loadStudioPreferences(projectName) {
    try {
      const result = await API.getProjectPreferences(projectName);
      this.applyStudioPreferences(result.preferences);
    } catch (e) {
      console.warn('Failed to load studio preferences:', e);
      this.applyStudioPreferences(this.getDefaultStudioPreferences());
    }
  },

  scheduleStudioPreferencesSave() {
    if (!this.state.projectName) return;
    window.clearTimeout(this.studioPreferencesSaveTimer);
    this.studioPreferencesSaveTimer = window.setTimeout(() => {
      this.studioPreferencesSaveTimer = null;
      this.saveStudioPreferences();
    }, this.studioPreferencesSaveDelay);
  },

  async saveStudioPreferences() {
    if (!this.state.projectName) return false;
    window.clearTimeout(this.studioPreferencesSaveTimer);
    this.studioPreferencesSaveTimer = null;

    try {
      const preferences = this.getCurrentStudioPreferences();
      const result = await API.saveProjectPreferences(this.state.projectName, preferences);
      this.state.studioPreferences = result.preferences || preferences;
      return true;
    } catch (e) {
      console.warn('Failed to save studio preferences:', e);
      return false;
    }
  },

  getMissingScreenCapturePart() {
    const currentPart = this.state.project?.parts?.[this.state.currentPart];
    if (
      currentPart?.background_type === 'screen_capture' &&
      !Background.isScreenCaptureConnected(currentPart.part_number)
    ) {
      return currentPart;
    }

    return this.state.project?.parts?.find((part) =>
      part.background_type === 'screen_capture' &&
      !Background.isScreenCaptureConnected(part.part_number)
    ) || null;
  },

  focusMissingScreenCapturePart(part) {
    if (!part || !this.state.project?.parts?.length) return;
    const index = this.state.project.parts.findIndex((candidate) => candidate.part_number === part.part_number);
    if (index >= 0 && index !== this.state.currentPart) {
      this.state.currentPart = index;
      this.showCurrentSlide();
    } else {
      this.updatePreviewRecordingUI();
    }
  },

  async connectMissingScreenCapture() {
    const missingPart = this.getMissingScreenCapturePart();
    if (!missingPart) return;
    this.focusMissingScreenCapturePart(missingPart);
    await this.connectCurrentScreenCapture();
  },

  preparePreviewRecordingCanvas(startRendering = false, targetFps = 30) {
    if (!this.elements.recordingCanvas) return;

    Canvas.init(this.elements.recordingCanvas, this.elements.cameraVideo);
    Canvas.setQuality(this.state.quality);
    Canvas.setLayout(this.getResolvedLayout(this.state.project?.parts?.[this.state.currentPart]));
    Canvas.setCamSize(this.state.camSize);
    Canvas.setShape(this.state.cameraShape);
    Canvas.setCameraPlacement(this.state.cameraPlacement);
    Canvas.setTransition(this.state.transition);
    Canvas.setBgRemoval(this.bgRemoval);
    Canvas.setNoCamera(this.noCamera);

    if (startRendering && !this.previewCanvasRendering) {
      Canvas.startRendering(targetFps);
      this.previewCanvasRendering = true;
    }
  },

  formatRecordingElapsed(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const min = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const sec = String(totalSeconds % 60).padStart(2, '0');
    return `${min}:${sec}`;
  },

  getRecordingElapsedMs() {
    if (!this.state.recordingSegmentStartedAt) {
      return this.state.recordingElapsedMs;
    }
    return this.state.recordingElapsedMs + (Date.now() - this.state.recordingSegmentStartedAt);
  },

  updateRecordingElapsedDisplay() {
    const value = this.formatRecordingElapsed(this.getRecordingElapsedMs());
    if (this.elements.previewRecordingTimer) {
      this.elements.previewRecordingTimer.textContent = value;
    }
    if (this.elements.previewRecordingHint && !this.state.recordingDone) {
      this.elements.previewRecordingHint.textContent = value;
    }
  },

  startRecordingElapsed({ reset = false } = {}) {
    if (reset) {
      this.state.recordingElapsedMs = 0;
    }
    this.state.recordingSegmentStartedAt = Date.now();
    window.clearInterval(this.recordingElapsedInterval);
    this.recordingElapsedInterval = window.setInterval(() => this.updateRecordingElapsedDisplay(), 500);
    this.updateRecordingElapsedDisplay();
  },

  pauseRecordingElapsed() {
    if (this.state.recordingSegmentStartedAt) {
      this.state.recordingElapsedMs = this.getRecordingElapsedMs();
      this.state.recordingSegmentStartedAt = null;
    }
    window.clearInterval(this.recordingElapsedInterval);
    this.recordingElapsedInterval = null;
    this.updateRecordingElapsedDisplay();
  },

  resetRecordingElapsed() {
    window.clearInterval(this.recordingElapsedInterval);
    this.recordingElapsedInterval = null;
    this.state.recordingElapsedMs = 0;
    this.state.recordingSegmentStartedAt = null;
    this.updateRecordingElapsedDisplay();
  },

  updatePreviewRecordingUI() {
    const isRecording = this.state.isRecording;
    const hasSession = Recorder.hasCapturedData();
    const hasPendingTake = hasSession && this.state.recordingDone;
    const missingCapturePart = this.getMissingScreenCapturePart();
    const statusEl = this.elements.previewRecordingStatus;
    const hintEl = this.elements.previewRecordingHint;
    const dotEl = this.elements.previewRecordingDot;
    const recordBtn = this.elements.recordBtn;
    const readinessEl = this.elements.previewRecordingReadiness;
    const readinessText = this.elements.previewRecordingReadinessText;
    const connectBtn = this.elements.previewConnectScreenBtn;
    const saveBtn = this.elements.previewSaveBtn;
    const discardBtn = this.elements.previewDiscardBtn;

    if (statusEl) {
      statusEl.textContent = isRecording
        ? 'REC'
        : hasPendingTake
          ? 'Фрагмент готов'
          : missingCapturePart
            ? 'Окно не подключено'
            : this.state.recordingStatusMessage || 'Готово';
    }

    if (hintEl) {
      hintEl.textContent = hasPendingTake
        ? 'Сохранить или игнорировать?'
        : this.formatRecordingElapsed(this.getRecordingElapsedMs());
    }

    if (dotEl) {
      dotEl.classList.toggle('active', isRecording);
    }

    if (recordBtn) {
      recordBtn.textContent = isRecording ? 'Стоп' : 'REC';
      recordBtn.classList.toggle('is-stop', isRecording);
      recordBtn.disabled = (!!missingCapturePart && !isRecording) || hasPendingTake;
    }

    if (readinessEl) {
      readinessEl.classList.toggle('hidden', !missingCapturePart && !hasPendingTake);
    }

    if (readinessText) {
      if (hasPendingTake) {
        readinessText.textContent = 'Этот фрагмент пока не сохранён. Выберите действие перед новой записью.';
      } else if (missingCapturePart) {
        readinessText.textContent = `Этап ${missingCapturePart.part_number}: окно экрана не подключено.`;
      }
    }

    if (connectBtn) {
      connectBtn.classList.toggle('hidden', !missingCapturePart);
      connectBtn.disabled = !missingCapturePart || isRecording;
    }

    if (saveBtn) {
      saveBtn.disabled = !hasPendingTake;
      saveBtn.classList.toggle('hidden', !hasPendingTake);
    }

    if (discardBtn) {
      discardBtn.disabled = !hasPendingTake;
      discardBtn.classList.toggle('hidden', !hasPendingTake);
    }

    this.updateRecordingElapsedDisplay();
  },

  async togglePreviewRecording() {
    if (this.state.screen !== 'preview' || !this.state.projectName) return;

    if (this.state.scriptEditorOpen) {
      this.closeScriptEditor();
    }

    if (this.state.isRecording) {
      await this.stopRecording();
      return;
    }

    await this.startRecording();
  },

  async exitStudioToSettings() {
    await this.saveStudioPreferences();

    if (Recorder.hasActiveSession() || Recorder.hasCapturedData()) {
      this.applyRecordingPhase(RecordingState.PHASES.IDLE);
      this.stopPartTimer();
      this.resetRecordingElapsed();
      this.stopAutoscroll();
      Recorder.discard();
      this.updatePreviewRecordingUI();
    }

    Canvas.stopRendering();
    this.previewCanvasRendering = false;
    Background.show(null);
    Background.stopAllScreenCaptures();
    this.stopPreviewSegmentation();
    Camera.stop();

    const recPreviewVideo = document.getElementById('rec-preview-video');
    if (recPreviewVideo) {
      recPreviewVideo.pause();
      recPreviewVideo.classList.add('hidden');
      recPreviewVideo.src = '';
    }

    if (this.elements.reviewVideo) {
      this.elements.reviewVideo.pause();
      this.elements.reviewVideo.removeAttribute('src');
      this.elements.reviewVideo.load();
    }

    this.elements.loadingOverlay.classList.add('hidden');
    this.elements.previewScreen.classList.add('hidden');
    this.elements.recordingScreen.classList.add('hidden');
    this.elements.reviewScreen?.classList.add('hidden');
    this.elements.settingsScreen.classList.remove('hidden');
    this.state.screen = 'settings';

    if (this.state.projectName) {
      this.elements.projectSelect.value = this.state.projectName;
      try {
        await this.loadBuilderProject(this.state.projectName);
      } catch (e) {
        console.error('Failed to refresh builder project after studio exit:', e);
      }
    }
  },

  // === Preview ===

  showCurrentSlide() {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;
    const resolvedLayout = this.getResolvedLayout(part);

    // Always show background if available
    if (Background.resolveAsset(part, this.state.projectName)) {
      Background.show(part.part_number);
    } else {
      Background.show(null);
    }

    // Update custom background button visibility
    this.updateCustomBtn();

    // Apply transition animation in Preview
    this.playTransition();

    // Hide camera controls that do not apply on face_only
    const hideControls = resolvedLayout === 'face_only';
    const sizeSlider = document.getElementById('cam-size-slider')?.closest('.camera-controls-row');
    const dragHintRow = document.querySelector('.camera-control-note')?.closest('.camera-controls-row');
    if (sizeSlider) sizeSlider.style.display = hideControls ? 'none' : 'flex';
    if (dragHintRow) dragHintRow.style.display = hideControls ? 'none' : 'flex';

    const bgRemovalActive = this.bgRemoval && resolvedLayout !== 'face_only';
    const shapeRow = document.getElementById('camera-shape-select')?.closest('.camera-controls-row');
    if (shapeRow) shapeRow.style.display = (hideControls || bgRemovalActive) ? 'none' : 'flex';
    Teleprompter.show(part, this.state.project.parts.length);
    this.renderScriptEditor();
    this.updateCameraLayout(resolvedLayout);
    Canvas.setLayout(resolvedLayout);
    Canvas.setCameraPlacement(this.state.cameraPlacement);
    if (this.state.isRecording) {
      Canvas.triggerTransition();
    } else if (this.state.screen === 'recording') {
      Canvas.triggerTransition();
    }

    if (this.elements.prevBtn) {
      this.elements.prevBtn.disabled = this.state.currentPart === 0;
      this.elements.nextBtn.disabled = this.state.currentPart === this.state.project.parts.length - 1;
    }

    this.renderStudioPartRail();
    this.updatePreviewRecordingUI();

    if (this.state.screen === 'recording') {
      this.updateRecordingUI();
    }
  },

  updateCameraLayout(layout) {
    const cam = this.elements.cameraWindow;
    if (!cam) return;

    const segCanvas = document.getElementById('preview-segmentation-canvas');

    // No camera mode — hide everything
    if (this.noCamera) {
      cam.style.display = 'none';
      if (segCanvas) segCanvas.classList.add('hidden');
      this.stopPreviewSegmentation();
      return;
    }

    // bgRemoval + face_only = normal camera (no segmentation)
    // bgRemoval + background = segmentation on, camera hidden
    if (this.bgRemoval && layout !== 'face_only') {
      cam.style.display = 'none';
      if (segCanvas) {
        segCanvas.classList.remove('hidden');
        this.startPreviewSegmentation(segCanvas);
      }
    } else {
      if (this.bgRemoval && layout === 'face_only') {
        if (segCanvas) segCanvas.classList.add('hidden');
        this.stopPreviewSegmentation();
      }
      cam.style.display = '';
    }
    cam.className = 'camera-window';
    cam.classList.add(`layout-${layout}`);
    cam.classList.add(`shape-${this.state.cameraShape}`);
    cam.classList.toggle('is-draggable', layout !== 'face_only' && !this.bgRemoval);
    this.applyCamSize();
    this.syncCameraWindowPlacement();
  },

  updateCameraShape() {
    const cam = this.elements.cameraWindow;
    if (!cam) return;
    cam.classList.remove('shape-circle', 'shape-rounded-rect', 'shape-oval');
    cam.classList.add(`shape-${this.state.cameraShape}`);
    Canvas.setShape(this.state.cameraShape);
    this.syncCameraWindowPlacement();
  },

  prevSlide() {
    this.goToPart(this.state.currentPart - 1);
  },

  nextSlide() {
    this.goToPart(this.state.currentPart + 1);
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

  updateRecModeButtons() {
    const contBtn = document.getElementById('rec-mode-continuous-btn');
    const partBtn = document.getElementById('rec-mode-perpart-btn');
    if (contBtn) {
      contBtn.classList.toggle('rec-mode-active', this.state.recordingMode === 'continuous');
    }
    if (partBtn) {
      partBtn.classList.toggle('rec-mode-active', this.state.recordingMode === 'per_part');
    }
  },

  updateAutoAdvanceBtn() {
    const btn = document.getElementById('auto-advance-btn');
    if (!btn) return;
    if (this.state.autoAdvance) {
      btn.textContent = 'Авто: ВКЛ';
      btn.classList.add('rec-mode-active');
    } else {
      btn.textContent = 'Авто: ВЫКЛ';
      btn.classList.remove('rec-mode-active');
    }
  },

  updateAutoStopBtn() {
    const btn = document.getElementById('auto-stop-btn');
    if (!btn) return;
    if (this.state.autoStop) {
      btn.textContent = 'Авто: ВКЛ';
      btn.classList.add('rec-mode-active');
    } else {
      btn.textContent = 'Авто: ВЫКЛ';
      btn.classList.remove('rec-mode-active');
    }
  },

  // === Click Animation ===

  handleClickAnim(e) {
    if (this.state.clickAnim === 'none') return;
    if (performance.now() < this.cameraDragSuppressUntil) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const anim = this.state.clickAnim;
    if (anim === 'pulse') {
      this.createPulseAnim(container, x, y);
    } else if (anim === 'rings') {
      this.createRingsAnim(container, x, y);
    } else if (anim === 'spark') {
      this.createSparkAnim(container, x, y);
    } else if (anim === 'target') {
      this.createTargetAnim(container, x, y);
    } else if (anim === 'glow') {
      this.createGlowAnim(container, x, y);
    }

    // Also draw on recording canvas if recording
    if (this.state.isRecording) {
      const scaleX = Canvas.width / rect.width;
      const scaleY = Canvas.height / rect.height;
      Canvas.addClickAnim(x * scaleX, y * scaleY, this.state.clickAnim);
    }
  },

  createPulseAnim(container, x, y) {
    const el = document.createElement('div');
    el.className = 'click-anim-pulse';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    container.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  },

  createRingsAnim(container, x, y) {
    for (let i = 0; i < 2; i++) {
      const el = document.createElement('div');
      el.className = 'click-anim-ring';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.animationDelay = (i * 150) + 'ms';
      container.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }
  },

  createSparkAnim(container, x, y) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = 25 + Math.random() * 15;
      const el = document.createElement('div');
      el.className = 'click-anim-spark';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
      el.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
      el.style.animation = 'none';
      container.appendChild(el);
      // Animate via JS for custom direction
      const startTime = performance.now();
      const animate = () => {
        const p = (performance.now() - startTime) / 500;
        if (p >= 1) { el.remove(); return; }
        el.style.left = (x + Math.cos(angle) * dist * p) + 'px';
        el.style.top = (y + Math.sin(angle) * dist * p) + 'px';
        el.style.opacity = 1 - p;
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  },

  createTargetAnim(container, x, y) {
    const el = document.createElement('div');
    el.className = 'click-anim-target';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    container.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  },

  createGlowAnim(container, x, y) {
    const el = document.createElement('div');
    el.className = 'click-anim-glow';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    container.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  },

  // === Camera Placement ===

  clamp(value, min, max) {
    if (max <= min) return min;
    return Math.min(Math.max(value, min), max);
  },

  getDefaultCameraPlacement() {
    return { x: 0.5, y: 0.9 };
  },

  resetCameraPlacement() {
    this.state.cameraPlacement = this.getDefaultCameraPlacement();
    Canvas.setCameraPlacement(this.state.cameraPlacement);
    this.syncCameraWindowPlacement();
  },

  syncCameraWindowPlacement() {
    const cam = this.elements.cameraWindow;
    const frame = this.elements.phoneFrame;
    if (!cam || !frame) return;

    const part = this.state.project?.parts?.[this.state.currentPart];
    if (this.getResolvedLayout(part) === 'face_only') {
      cam.style.left = '';
      cam.style.top = '';
      cam.style.right = '';
      cam.style.bottom = '';
      return;
    }

    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    const camWidth = cam.offsetWidth;
    const camHeight = cam.offsetHeight;
    if (!frameWidth || !frameHeight || !camWidth || !camHeight) return;

    const maxLeft = Math.max(0, frameWidth - camWidth);
    const maxTop = Math.max(0, frameHeight - camHeight);
    const left = this.clamp((this.state.cameraPlacement.x * frameWidth) - (camWidth / 2), 0, maxLeft);
    const top = this.clamp((this.state.cameraPlacement.y * frameHeight) - (camHeight / 2), 0, maxTop);

    cam.style.left = `${left}px`;
    cam.style.top = `${top}px`;
    cam.style.right = 'auto';
    cam.style.bottom = 'auto';
  },

  // === Camera Size ===

  applyCamSize() {
    const cam = this.elements.cameraWindow;
    if (!cam) return;
    cam.style.setProperty('--cam-scale', this.state.camSize);
    Canvas.setCamSize(this.state.camSize);
    this.syncCameraWindowPlacement();
  },

  initCameraDrag() {
    const cam = this.elements.cameraWindow;
    const frame = this.elements.phoneFrame;
    if (!cam || !frame) return;

    let dragState = null;

    cam.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const part = this.state.project?.parts?.[this.state.currentPart];
      if (this.state.screen !== 'preview' || this.getResolvedLayout(part) === 'face_only' || this.noCamera || this.bgRemoval) {
        return;
      }

      const frameRect = frame.getBoundingClientRect();
      const camRect = cam.getBoundingClientRect();
      dragState = {
        offsetX: e.clientX - camRect.left,
        offsetY: e.clientY - camRect.top,
        frameRect,
        moved: false
      };

      cam.classList.add('is-dragging');
      e.preventDefault();
      e.stopPropagation();

      const onMove = (moveEvent) => {
        if (!dragState) return;
        dragState.moved = true;

        const maxLeft = Math.max(0, dragState.frameRect.width - cam.offsetWidth);
        const maxTop = Math.max(0, dragState.frameRect.height - cam.offsetHeight);
        const left = this.clamp(moveEvent.clientX - dragState.frameRect.left - dragState.offsetX, 0, maxLeft);
        const top = this.clamp(moveEvent.clientY - dragState.frameRect.top - dragState.offsetY, 0, maxTop);

        cam.style.left = `${left}px`;
        cam.style.top = `${top}px`;
        cam.style.right = 'auto';
        cam.style.bottom = 'auto';

        this.state.cameraPlacement = {
          x: (left + (cam.offsetWidth / 2)) / dragState.frameRect.width,
          y: (top + (cam.offsetHeight / 2)) / dragState.frameRect.height
        };
        Canvas.setCameraPlacement(this.state.cameraPlacement);
      };

      const onUp = () => {
        if (dragState?.moved) {
          this.cameraDragSuppressUntil = performance.now() + 250;
          this.scheduleStudioPreferencesSave();
        }
        dragState = null;
        cam.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  // === No Camera Mode (background only) ===

  noCamera: false,

  toggleNoCamera() {
    this.noCamera = !this.noCamera;
    Canvas.setNoCamera(this.noCamera);
    const btn = document.getElementById('no-camera-btn');
    const cam = this.elements.cameraWindow;
    const segCanvas = document.getElementById('preview-segmentation-canvas');

    if (this.noCamera) {
      btn.textContent = 'С камерой';
      btn.classList.add('no-bg');
      if (cam) cam.style.display = 'none';
      if (segCanvas) segCanvas.classList.add('hidden');
      this.stopPreviewSegmentation();
    } else {
      btn.textContent = 'Без меня';
      btn.classList.remove('no-bg');
      this.showCurrentSlide();
    }
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

      const layout = this.getResolvedLayout(this.state.project?.parts[this.state.currentPart]);
      let dw;
      let dh;
      let dy;
      let dx;
      if (layout === 'face_only') {
        dw = w;
        dh = h;
        dy = 0;
        dx = 0;
      } else {
        const size = this.state.camSize;
        dw = w;
        dh = Math.round(h * 0.5 * size);
        dx = 0;
        const maxTop = Math.max(0, h - dh);
        dy = this.clamp((this.state.cameraPlacement.y * h) - (dh / 2), 0, maxTop);
      }

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

      ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);

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

  async regenerateSlide(slideData) {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part || part.background_type !== 'html_slide') return;

    const spinner = document.getElementById('generate-spinner');
    spinner?.classList.remove('hidden');

    try {
      const template = part.background_category || 'text_slide';
      const result = await HtmlSlides.generate(
        this.state.projectName,
        part.part_number,
        template,
        slideData || part.slide_data
      );

      if (result.file) {
        part.slide_file = result.file;
        await Background.preloadAll(this.state.project, this.state.projectName);
        Background.show(part.part_number);
      }
    } catch (e) {
      alert('Ошибка генерации слайда: ' + e.message);
    } finally {
      spinner?.classList.add('hidden');
    }
  },

  async uploadCustomBackground(file) {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;
    if (part.layout === 'face_only') {
      return alert('Для режима "Только лицо" фон не используется.');
    }

    const spinner = document.getElementById('generate-spinner');
    spinner?.classList.remove('hidden');

    try {
      const result = await API.uploadBackground(
        this.state.projectName,
        part.part_number,
        file
      );

      if (result.file) {
        part.custom_file = result.file;
        part.custom_type = result.type;
        part.background_url = '';
        part.screen_capture_label = '';
        part.background_type = result.type;
        Background.stopScreenCapture(part.part_number);
        await Background.preloadAll(this.state.project, this.state.projectName, { bust: true });
        Background.show(part.part_number);
        this.updateCustomBtn();
        this.showCurrentSlide();
      }
    } catch (e) {
      alert('Ошибка загрузки: ' + e.message);
    } finally {
      spinner?.classList.add('hidden');
    }
  },

  async removeCustomBackground() {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part || !part.custom_file) return;

    try {
      await API.deleteCustomBackground(this.state.projectName, part.part_number);
      part.custom_file = null;
      part.custom_type = null;
      part.background_type = this.inferPersistedBackgroundType(part);
      await Background.preloadAll(this.state.project, this.state.projectName, { bust: true });
      this.showCurrentSlide();
    } catch (e) {
      alert('Ошибка удаления: ' + e.message);
    }
  },

  updateCustomBtn() {
    const part = this.state.project?.parts[this.state.currentPart];
    const removeBtn = document.getElementById('remove-custom-btn');
    const connectScreenBtn = document.getElementById('connect-screen-capture-btn');
    if (removeBtn) {
      if (part?.custom_file) {
        removeBtn.classList.remove('hidden');
      } else {
        removeBtn.classList.add('hidden');
      }
    }
    if (connectScreenBtn) {
      const isScreenCapture = part?.layout !== 'face_only' && part?.background_type === 'screen_capture';
      connectScreenBtn.classList.toggle('hidden', !isScreenCapture);
      connectScreenBtn.textContent = Background.isScreenCaptureConnected(part?.part_number)
        ? 'Перевыбрать окно'
        : 'Подключить окно';
    }
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
    if (this.state.scriptEditorOpen) {
      this.closeScriptEditor();
    }
    this.state.screen = 'recording';
    this.elements.previewScreen.classList.add('hidden');
    this.elements.reviewScreen?.classList.add('hidden');
    this.elements.recordingScreen.classList.remove('hidden');

    const recordingFps = this.getRecordingFps();
    this.preparePreviewRecordingCanvas(true, recordingFps);
    if (this.state.recordingPhase === RecordingState.PHASES.STOPPED) {
      this.applyRecordingPhase(RecordingState.PHASES.IDLE);
    }
    this.updateRecordingUI();
  },

  switchToPreview() {
    if (this.state.isRecording) this.stopRecording();
    if (this.state.scriptEditorOpen) {
      this.closeScriptEditor();
    }
    Canvas.stopRendering();
    this.previewCanvasRendering = false;
    this.stopPreviewSegmentation();

    this.state.screen = 'preview';
    this.elements.recordingScreen.classList.add('hidden');
    this.elements.previewScreen.classList.remove('hidden');

    // Restore camera window visibility
    const cam = this.elements.cameraWindow;
    if (cam) cam.style.display = '';

    this.showCurrentSlide();
  },

  updateRecordingUI() {
    const part = this.state.project.parts[this.state.currentPart];
    if (!part) return;

    if (this.elements.recTeleprompter) this.elements.recTeleprompter.textContent = part.text;
    this.renderScriptEditor();
    this.renderStudioPartRail();
    if (this.elements.recPartInfo) {
      this.elements.recPartInfo.textContent = `Этап ${part.part_number} / ${this.state.project.parts.length}`;
    }

    // Status
    const statusDot = document.getElementById('rec-status-dot');
    const statusText = document.getElementById('rec-status-text');
    if (statusDot) statusDot.classList.toggle('recording', this.state.isRecording);
    if (statusText) statusText.textContent = this.state.isRecording ? 'ЗАПИСЬ' : 'ГОТОВ';

    // Badges
    const layoutBadge = document.getElementById('rec-layout-badge');
    if (layoutBadge) layoutBadge.textContent = part.layout === 'face_only' ? 'Только лицо' : 'С фоном';

    // Slide label in nav
    const slideLabel = document.getElementById('rec-slide-label');
    if (slideLabel) slideLabel.textContent = `Этап ${part.part_number} / ${this.state.project.parts.length}`;

    this.updateNextPreview();

    // Button visibility by state
    const btnsReady = document.getElementById('rec-btns-ready');
    const btnsRecording = document.getElementById('rec-btns-recording');
    const btnsDone = document.getElementById('rec-btns-done');

    if (this.state.isRecording) {
      btnsReady?.classList.add('hidden');
      btnsRecording?.classList.remove('hidden');
      btnsDone?.classList.add('hidden');
    } else if (this.state.recordingDone) {
      btnsReady?.classList.add('hidden');
      btnsRecording?.classList.add('hidden');
      btnsDone?.classList.remove('hidden');
    } else {
      btnsReady?.classList.remove('hidden');
      btnsRecording?.classList.add('hidden');
      btnsDone?.classList.add('hidden');
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
    if (Recorder.hasCapturedData()) {
      this.updatePreviewRecordingUI();
      alert('Сначала сохраните или проигнорируйте текущий фрагмент.');
      return;
    }

    const missingCapturePart = this.getMissingScreenCapturePart();
    if (missingCapturePart) {
      this.focusMissingScreenCapturePart(missingCapturePart);
      return;
    }
    const recordingFps = this.getRecordingFps();
    this.preparePreviewRecordingCanvas(true, recordingFps);
    Recorder.onStop = () => {
      this.pauseRecordingElapsed();
      this.transitionRecordingPhase(RecordingState.EVENTS.STOP_COMPLETE);
      this.updatePreviewRecordingUI();
      this.updateRecordingUI();
    };

    try {
      this.state.recordingStatusMessage = '';
      const canvasStream = Canvas.getStream(recordingFps);
      const audioTrack = Camera.getAudioTrack();
      Recorder.start(canvasStream, audioTrack, {
        videoBitsPerSecond: this.getRecordingBitrate(),
        timesliceMs: 1000
      });
      this.transitionRecordingPhase(RecordingState.EVENTS.START);
      this.startRecordingElapsed({ reset: true });
    } catch (e) {
      console.error('Failed to start recording:', e);
      Canvas.stopRendering();
      this.previewCanvasRendering = false;
      this.updatePreviewRecordingUI();
      this.updateRecordingUI();
      alert('Не удалось начать запись: ' + e.message);
      return;
    }

    this.updatePreviewRecordingUI();
    this.updateRecordingUI();
  },

  async stopRecording() {
    if (!this.state.isRecording) return;
    this.transitionRecordingPhase(RecordingState.EVENTS.PAUSE);
    this.pauseRecordingElapsed();
    try {
      await Recorder.finalize();
    } catch (e) {
      console.error('Failed to stop recording:', e);
      alert('Не удалось остановить запись: ' + e.message);
    } finally {
      Canvas.stopRendering();
      this.previewCanvasRendering = false;
      this.updatePreviewRecordingUI();
      this.updateRecordingUI();
    }
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
    this.discardCurrentTake();
    // Hide preview video if showing
    const prevVideo = document.getElementById('rec-preview-video');
    if (prevVideo) { prevVideo.pause(); prevVideo.classList.add('hidden'); prevVideo.src = ''; }
    const prevBtn = document.getElementById('rec-preview-btn');
    if (prevBtn) prevBtn.textContent = 'Просмотр';
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
        if (this.state.recordingMode === 'per_part') {
          // Per-slide mode: never advance, auto-stop if enabled
          if (this.state.autoStop) this.stopRecording();
        } else if (this.state.currentPart < this.state.project.parts.length - 1) {
          // Continuous, not last slide: advance if auto-advance on
          if (this.state.autoAdvance) {
            this.state.currentPart++;
            this.showCurrentSlide();
            this.startPartTimer();
            this.startAutoscroll();
          }
        } else {
          // Continuous, last slide: auto-stop if enabled
          if (this.state.autoStop) this.stopRecording();
        }
        // Otherwise keep recording until manual stop
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

  setTeleprompterPosition(pos) {
    this.state.teleprompterPosition = pos;
    const side = document.getElementById('preview-teleprompter-side');
    const overlay = document.getElementById('preview-teleprompter-overlay');
    if (!side || !overlay) return;

    // Боковая панель остаётся видимой всегда — чтобы dropdown «Позиция» был доступен.
    // В overlay-режиме скрываем только текстовое содержимое (через CSS flag).
    side.classList.remove('hidden');
    side.classList.toggle('teleprompter-overlay-mode', pos !== 'right');

    if (pos === 'right') {
      overlay.classList.add('hidden');
      overlay.classList.remove('teleprompter-overlay-top', 'teleprompter-overlay-center');
    } else {
      overlay.classList.remove('hidden');
      overlay.classList.toggle('teleprompter-overlay-top', pos === 'overlay-top');
      overlay.classList.toggle('teleprompter-overlay-center', pos === 'overlay-center');
      // Синхронизировать текст
      const part = this.state.project?.parts?.[this.state.currentPart];
      const textEl = document.getElementById('preview-teleprompter-overlay-text');
      if (part && textEl) textEl.textContent = part.text || '';
    }

    // Сохраняем текущее значение в dropdown (чтоб не сбросилось)
    const sel = document.getElementById('teleprompter-position-select');
    if (sel && sel.value !== pos) sel.value = pos;
  },

  async refreshOutputFiles() {
    const listEl = document.getElementById('output-files-list');
    if (!listEl) return;
    if (!this.state.projectName) {
      listEl.innerHTML = '<div class="output-files-empty">Выбери проект чтобы увидеть файлы</div>';
      return;
    }
    try {
      const data = await API.getProjectOutput(this.state.projectName);
      const files = data.files || [];
      if (!files.length) {
        listEl.innerHTML = '<div class="output-files-empty">Пока нет файлов. После записи и /finish тут появятся видео, обложка, подпись.</div>';
        return;
      }
      listEl.innerHTML = '';
      for (const f of files) {
        const row = document.createElement('div');
        row.className = `output-file output-file-${f.kind}`;
        const url = API.getOutputFileUrl(this.state.projectName, f.name);
        const sizeKb = f.size ? Math.round(f.size / 1024) : 0;
        const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} МБ` : `${sizeKb} КБ`;
        const icon = {
          video: '🎬', image: '🖼', text: '📝', json: '🧾', other: '📄'
        }[f.kind] || '📄';

        row.innerHTML = `
          <div class="output-file-row">
            <span class="output-file-icon">${icon}</span>
            <span class="output-file-name" title="${this.escapeHtml(f.name)}">${this.escapeHtml(f.name)}</span>
            <span class="output-file-size">${sizeStr}</span>
          </div>
          <div class="output-file-preview"></div>
          <div class="output-file-actions">
            <a class="btn btn-secondary btn-sm" href="${url}" target="_blank" rel="noreferrer">Открыть</a>
            <a class="btn btn-secondary btn-sm" href="${url}" download="${this.escapeHtml(f.name)}">Скачать</a>
          </div>
        `;

        const preview = row.querySelector('.output-file-preview');
        if (f.kind === 'video') {
          preview.innerHTML = `<video src="${url}" controls preload="metadata" class="output-file-video"></video>`;
        } else if (f.kind === 'image') {
          preview.innerHTML = `<img src="${url}" class="output-file-image" alt="">`;
        } else if (f.kind === 'text') {
          const p = document.createElement('pre');
          p.className = 'output-file-text';
          p.textContent = 'Загрузка...';
          preview.appendChild(p);
          fetch(url).then(r => r.text()).then(t => {
            p.textContent = t.slice(0, 600) + (t.length > 600 ? '\n…' : '');
          }).catch(() => { p.textContent = '[не удалось загрузить]'; });
        }

        listEl.appendChild(row);
      }
    } catch (e) {
      listEl.innerHTML = `<div class="output-files-empty">Ошибка: ${this.escapeHtml(e.message)}</div>`;
    }
  },

  async saveRecording() {
    if (!Recorder.hasCapturedData()) {
      return alert('Сначала запишите хотя бы один фрагмент.');
    }

    const saveButtons = [
      { element: this.elements.previewSaveBtn, idleText: 'Сохранить' },
      { element: this.elements.reviewSaveBtn, idleText: 'Сохранить' }
    ].filter(({ element }) => !!element);

    saveButtons.forEach(({ element }) => {
      element.disabled = true;
      element.textContent = 'Сохранение...';
    });

    try {
      if (this.state.isRecording) {
        await this.stopRecording();
      }
      this.pauseRecordingElapsed();
      const result = await Recorder.saveRecording(this.state.projectName);
      this.state.recordingStatusMessage = `Сохранено: ${result.file}`;

      // Обновляем file-browser чтобы записанное видео сразу появилось в списке
      this.refreshOutputFiles();

      // Показываем полный путь, чтобы пользователь мог найти файл
      const fullPath = `projects/${this.state.projectName}/output/${result.file || 'recording_full.mp4'}`;
      setTimeout(() => {
        alert(`✓ Видео сохранено:\n\n${fullPath}\n\nПолный путь: C:\\dev\\Reels-Factory\\${fullPath.replaceAll('/', '\\')}\n\nФайл теперь виден в панели «📁 Готовые файлы» справа.`);
      }, 100);
      this.transitionRecordingPhase(RecordingState.EVENTS.SAVE_SUCCESS);
      this.resetRecordingElapsed();
      Canvas.stopRendering();
      this.previewCanvasRendering = false;
      this.updatePreviewRecordingUI();
      if (this.state.screen === 'recording') {
        this.updateRecordingUI();
      }
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    } finally {
      if (!this.state.isRecording && !Recorder.hasActiveSession()) {
        Canvas.stopRendering();
        this.previewCanvasRendering = false;
      }
      saveButtons.forEach(({ element, idleText }) => {
        element.disabled = !Recorder.hasCapturedData();
        element.textContent = idleText;
      });
    }
  },

  discardCurrentTake() {
    Recorder.discard();
    this.transitionRecordingPhase(RecordingState.EVENTS.DISCARD);
    this.state.recordingStatusMessage = 'Фрагмент проигнорирован';
    this.resetRecordingElapsed();
    Canvas.stopRendering();
    this.previewCanvasRendering = false;
    this.updatePreviewRecordingUI();
    if (this.state.screen === 'recording') {
      this.updateRecordingUI();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
