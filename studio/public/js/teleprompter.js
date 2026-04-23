/**
 * Teleprompter module — displays script text
 * v2: badges, display prompt, hide prompt for face_only
 */
const Teleprompter = {
  textElement: null,
  partInfoElement: null,
  layoutBadgeElement: null,
  timingBadgeElement: null,
  typeBadgeElement: null,
  promptElement: null,
  promptSection: null,
  titleElement: null,
  noteElement: null,

  show(part, totalParts) {
    const uploadBtn = document.getElementById('upload-bg-btn');
    const removeBtn = document.getElementById('remove-custom-btn');

    if (this.textElement) {
      this.textElement.textContent = part.text;
    }
    // Overlay-режим телепромптера (если выбран сверху/центр)
    const overlayText = document.getElementById('preview-teleprompter-overlay-text');
    if (overlayText) overlayText.textContent = part.text;

    if (this.partInfoElement) {
      this.partInfoElement.textContent = `Этап ${part.part_number} / ${totalParts}`;
    }

    // Badges
    if (this.layoutBadgeElement) {
      this.layoutBadgeElement.textContent = part.layout === 'face_only' ? 'Только лицо' : 'С фоном';
    }

    if (this.typeBadgeElement) {
      if (part.custom_file) {
        this.typeBadgeElement.textContent = part.custom_type === 'video' ? 'Видео' : 'Фото';
        this.typeBadgeElement.className = 'badge badge-custom';
      } else {
        const typeLabels = {
          none: 'Без фона',
          photo: 'Фото',
          video: 'Видео',
          html_slide: 'Слайд',
          screen_capture: 'Окно'
        };
        this.typeBadgeElement.textContent = typeLabels[part.background_type || 'none'] || 'Фото';
        this.typeBadgeElement.className = 'badge badge-type';
      }
    }

    if (this.titleElement) {
      this.titleElement.textContent = 'Медиа этапа';
    }

    if (this.noteElement) {
      if (part.layout === 'face_only') {
        this.noteElement.textContent = 'В режиме "Только лицо" фон не используется.';
      } else if (part.custom_file) {
        const typeLabel = part.custom_type === 'video' ? 'Видео' : 'Изображение';
        this.noteElement.textContent = `${typeLabel} загружено: ${part.custom_file}`;
      } else if (part.background_type === 'screen_capture') {
        this.noteElement.textContent = 'Окно экрана: подключите окно перед записью.';
      } else if (part.background_type === 'html_slide' && part.slide_file) {
        this.noteElement.textContent = `Используется HTML-слайд проекта: ${part.slide_file}`;
      } else if (part.background_file) {
        this.noteElement.textContent = `Используется медиа проекта: ${part.background_file}`;
      } else {
        this.noteElement.textContent = 'Загрузите изображение или видео для этого этапа.';
      }
      this.noteElement.classList.remove('hidden');
    }

    if (uploadBtn) {
      uploadBtn.disabled = part.layout === 'face_only';
    }
    if (removeBtn) {
      removeBtn.classList.toggle('hidden', !part.custom_file);
      removeBtn.disabled = part.layout === 'face_only';
    }
  }
};
