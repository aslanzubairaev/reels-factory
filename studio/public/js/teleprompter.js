/**
 * Teleprompter module — displays script text
 * v2: badges, display prompt, hide prompt for face_only
 * v3: background type selector + category selector for html_slide
 */
const Teleprompter = {
  textElement: null,
  partInfoElement: null,
  layoutBadgeElement: null,
  timingBadgeElement: null,
  typeBadgeElement: null,
  promptElement: null,
  promptSection: null,

  ensureTypeSelector() {
    if (!this.promptSection) return null;
    let wrapper = this.promptSection.querySelector('.bg-type-selector');
    if (wrapper) return wrapper;

    wrapper = document.createElement('div');
    wrapper.className = 'bg-type-selector';
    wrapper.innerHTML = `
      <label class="bg-type-label">Тип фона</label>
      <select class="bg-type-select">
        <option value="none">Нет (face only)</option>
        <option value="photo">AI-фото</option>
        <option value="video">AI-видео</option>
        <option value="html_slide">HTML-слайд</option>
        <option value="screen">Экран (live)</option>
      </select>
      <div class="bg-category-row hidden">
        <label class="bg-type-label">Шаблон</label>
        <select class="bg-category-select">
          <option value="text_slide">Текстовый слайд</option>
          <option value="infographic">Инфографика</option>
          <option value="comparison">Сравнение</option>
          <option value="mockup">Дашборд</option>
        </select>
      </div>
      <div class="bg-screen-row hidden">
        <button class="btn btn-secondary btn-sm bg-screen-btn" type="button">
          📺 Выбрать окно для захвата
        </button>
        <label class="bg-screen-audio">
          <input type="checkbox" class="bg-screen-audio-toggle" />
          <span>с системным звуком</span>
        </label>
        <div class="bg-screen-pan-controls">
          <div class="bg-screen-pan-hint">Перетащи мышью в превью ← → / колесо = zoom</div>
          <div class="bg-screen-pan-btns">
            <button class="btn btn-secondary btn-xs bg-screen-zoom-out" type="button">−</button>
            <span class="bg-screen-zoom-label">100%</span>
            <button class="btn btn-secondary btn-xs bg-screen-zoom-in" type="button">+</button>
            <button class="btn btn-secondary btn-xs bg-screen-reset" type="button">Сброс</button>
          </div>
        </div>
        <div class="bg-screen-status"></div>
      </div>
    `;
    this.promptSection.insertBefore(wrapper, this.promptSection.firstChild);

    const typeSelect = wrapper.querySelector('.bg-type-select');
    const catSelect = wrapper.querySelector('.bg-category-select');
    const screenBtn = wrapper.querySelector('.bg-screen-btn');
    const screenAudio = wrapper.querySelector('.bg-screen-audio-toggle');
    const screenStatus = wrapper.querySelector('.bg-screen-status');

    typeSelect.addEventListener('change', () => {
      const newType = typeSelect.value;
      const newCat = newType === 'html_slide' ? catSelect.value : undefined;
      if (typeof App !== 'undefined' && App.changeBackgroundType) {
        App.changeBackgroundType(newType, newCat);
      }
    });
    catSelect.addEventListener('change', () => {
      if (typeSelect.value === 'html_slide' && typeof App !== 'undefined' && App.changeBackgroundType) {
        App.changeBackgroundType('html_slide', catSelect.value);
      }
    });

    if (screenBtn) {
      screenBtn.addEventListener('click', async () => {
        if (typeof ScreenCapture === 'undefined') return;
        ScreenCapture.setSystemAudio(!!screenAudio?.checked);
        screenStatus.textContent = 'Запрашиваю доступ...';
        try {
          await ScreenCapture.ensure();
          if (typeof App !== 'undefined' && App.onScreenStreamChanged) {
            App.onScreenStreamChanged();
          }
        } catch (e) {
          screenStatus.textContent = 'Отменено или ошибка: ' + (e.message || e);
        }
      });
    }
    if (screenAudio) {
      screenAudio.addEventListener('change', () => {
        if (typeof ScreenCapture === 'undefined') return;
        ScreenCapture.setSystemAudio(!!screenAudio.checked);
        // If stream is already active, need to re-capture to change audio.
        if (ScreenCapture.isActive()) {
          ScreenCapture.stop();
          screenStatus.textContent = 'Настройка звука изменена — нажми «Выбрать окно» ещё раз.';
        }
      });
    }

    // Live status sync (so the button reflects active/inactive state)
    if (typeof ScreenCapture !== 'undefined') {
      ScreenCapture.onChange((stream) => {
        if (stream && stream.active) {
          screenStatus.textContent = '✓ Экран захвачен — можно начинать запись';
          screenBtn.textContent = '🔄 Выбрать другое окно';
        } else {
          screenStatus.textContent = '';
          screenBtn.textContent = '📺 Выбрать окно для захвата';
        }
      });
    }

    // === Pan / Zoom controls ===
    const zoomLabel = wrapper.querySelector('.bg-screen-zoom-label');
    const zoomInBtn = wrapper.querySelector('.bg-screen-zoom-in');
    const zoomOutBtn = wrapper.querySelector('.bg-screen-zoom-out');
    const resetBtn = wrapper.querySelector('.bg-screen-reset');

    const updateZoomLabel = () => {
      if (!zoomLabel || typeof ScreenPan === 'undefined') return;
      zoomLabel.textContent = `${Math.round(ScreenPan.scale * 100)}%`;
    };
    if (typeof ScreenPan !== 'undefined') {
      ScreenPan.onChange(updateZoomLabel);
      updateZoomLabel();
    }
    zoomInBtn?.addEventListener('click', () => { ScreenPan?.zoomBy(1.2); });
    zoomOutBtn?.addEventListener('click', () => { ScreenPan?.zoomBy(1 / 1.2); });
    resetBtn?.addEventListener('click', () => { ScreenPan?.reset(); });

    // Drag + wheel на phone-frame (активируется только для type=screen).
    this._installPanInteractions();

    return wrapper;
  },

  _installPanInteractions() {
    if (this._panInstalled) return;
    this._panInstalled = true;

    const phone = document.getElementById('phone-frame');
    if (!phone || typeof ScreenPan === 'undefined') return;

    const isActive = () => {
      const part = App?.state?.project?.parts?.[App?.state?.currentPart];
      return part && part.background_type === 'screen';
    };

    let dragging = false;
    let lastX = 0, lastY = 0;

    phone.addEventListener('mousedown', (e) => {
      if (!isActive()) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      phone.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      // Переводим движение мыши в долю видимой области.
      // При scale=1 видна вся высота; движение на ширину phone-frame (~340px) ≈ вся ширина.
      const rect = phone.getBoundingClientRect();
      // Движение влияет на offset в обратную сторону (перетаскиваем контент).
      const panDx = -(dx / rect.width) / ScreenPan.scale;
      const panDy = -(dy / rect.height) / ScreenPan.scale;
      ScreenPan.panBy(panDx, panDy);
    });

    window.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        phone.style.cursor = '';
      }
    });

    phone.addEventListener('wheel', (e) => {
      if (!isActive()) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? (1 / 1.1) : 1.1;
      ScreenPan.zoomBy(delta);
    }, { passive: false });
  },

  show(part, totalParts) {
    if (this.textElement) {
      this.textElement.textContent = part.text;
    }

    if (this.partInfoElement) {
      this.partInfoElement.textContent = `Часть ${part.part_number} / ${totalParts}`;
    }

    if (this.layoutBadgeElement) {
      this.layoutBadgeElement.textContent = part.layout.toUpperCase();
    }

    if (this.timingBadgeElement) {
      this.timingBadgeElement.textContent = `${part.timing_seconds} СЕК`;
    }

    if (this.typeBadgeElement) {
      if (part.custom_file) {
        this.typeBadgeElement.textContent = 'CUSTOM';
        this.typeBadgeElement.className = 'badge badge-custom';
      } else {
        this.typeBadgeElement.textContent = (part.background_type || 'none').toUpperCase();
        this.typeBadgeElement.className = 'badge badge-type';
      }
    }

    // Prompt section is always visible now (contains the type selector).
    if (this.promptSection) {
      this.promptSection.classList.remove('hidden');
    }

    // Inject / sync the type selector
    const typeWrapper = this.ensureTypeSelector();
    if (typeWrapper) {
      const typeSelect = typeWrapper.querySelector('.bg-type-select');
      const catRow = typeWrapper.querySelector('.bg-category-row');
      const catSelect = typeWrapper.querySelector('.bg-category-select');
      const screenRow = typeWrapper.querySelector('.bg-screen-row');
      typeSelect.value = part.background_type || 'none';
      catSelect.value = part.background_category || 'text_slide';
      catRow.classList.toggle('hidden', part.background_type !== 'html_slide');
      if (screenRow) screenRow.classList.toggle('hidden', part.background_type !== 'screen');
    }

    // Remove previous slide editor if any
    const oldEditor = this.promptSection?.querySelector('.slide-editor');
    if (oldEditor) oldEditor.remove();

    const genBtn = document.getElementById('generate-btn');

    if (this.promptElement) {
      if (part.background_type === 'none') {
        this.promptElement.style.display = 'none';
        if (genBtn) genBtn.style.display = 'none';
      } else if (part.background_type === 'html_slide') {
        this.promptElement.style.display = 'none';
        if (genBtn) genBtn.style.display = 'none';
        if (this.promptSection && typeof HtmlSlides !== 'undefined') {
          const editor = HtmlSlides.createEditor(part, (newData) => {
            if (typeof App !== 'undefined') App.regenerateSlide(newData);
          });
          this.promptSection.appendChild(editor);
        }
      } else if (part.background_type === 'screen') {
        // Live screen capture — prompt/generate button не нужны.
        this.promptElement.style.display = 'none';
        if (genBtn) genBtn.style.display = 'none';
      } else {
        // photo / video
        this.promptElement.style.display = '';
        if (genBtn) genBtn.style.display = '';
        const displayPrompt = typeof Translate !== 'undefined'
          ? Translate.getDisplayPrompt(part)
          : (part.background_prompt_display || part.background_prompt || '');
        this.promptElement.value = displayPrompt;
        this.promptElement.disabled = false;
      }
    }
  }
};
