/**
 * Teleprompter module — displays script text
 * v2: shows background_prompt_display (user language)
 */
const Teleprompter = {
  textElement: null,
  partInfoElement: null,
  timingElement: null,
  layoutBadgeElement: null,
  promptElement: null,

  show(part, totalParts) {
    if (this.textElement) {
      this.textElement.textContent = part.text;
    }

    if (this.partInfoElement) {
      this.partInfoElement.textContent = `Часть ${part.part_number} / ${totalParts}`;
    }

    if (this.timingElement) {
      this.timingElement.textContent = `${part.timing_seconds} сек`;
    }

    if (this.layoutBadgeElement) {
      const labels = {
        'face_only': 'Face Only',
        'full_background': 'Full Background',
        'partial_background': 'Partial Background'
      };
      this.layoutBadgeElement.textContent = labels[part.layout] || part.layout;
      this.layoutBadgeElement.className = `layout-badge layout-${part.layout}`;
    }

    if (this.promptElement) {
      if (part.background_type === 'none') {
        this.promptElement.value = '';
        this.promptElement.disabled = true;
        this.promptElement.placeholder = 'No background for face_only';
      } else {
        // v2: Show display prompt (user language) if available
        const displayPrompt = Translate.getDisplayPrompt(part);
        this.promptElement.value = displayPrompt;
        this.promptElement.disabled = false;
        this.promptElement.placeholder = 'Background generation prompt...';
      }
    }
  }
};
