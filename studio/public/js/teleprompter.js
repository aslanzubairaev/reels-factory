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

  show(part, totalParts) {
    if (this.textElement) {
      this.textElement.textContent = part.text;
    }

    if (this.partInfoElement) {
      this.partInfoElement.textContent = `Часть ${part.part_number} / ${totalParts}`;
    }

    // Badges
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

    // Prompt section — hide for face_only, show slide editor for html_slide
    if (this.promptSection) {
      if (part.background_type === 'none') {
        this.promptSection.classList.add('hidden');
      } else {
        this.promptSection.classList.remove('hidden');
      }
    }

    // Remove previous slide editor if any
    const oldEditor = this.promptSection?.querySelector('.slide-editor');
    if (oldEditor) oldEditor.remove();

    if (this.promptElement) {
      if (part.background_type === 'none') {
        this.promptElement.value = '';
        this.promptElement.disabled = true;
        this.promptElement.style.display = '';
      } else if (part.background_type === 'html_slide') {
        // Hide prompt textarea, show slide data editor
        this.promptElement.style.display = 'none';
        // Hide generate button for slides
        const genBtn = document.getElementById('generate-btn');
        if (genBtn) genBtn.style.display = 'none';
        // Create slide editor
        if (this.promptSection && typeof HtmlSlides !== 'undefined') {
          const editor = HtmlSlides.createEditor(part, (newData) => {
            // Trigger regeneration via App
            if (typeof App !== 'undefined') App.regenerateSlide(newData);
          });
          this.promptSection.appendChild(editor);
        }
      } else {
        this.promptElement.style.display = '';
        const genBtn = document.getElementById('generate-btn');
        if (genBtn) genBtn.style.display = '';
        const displayPrompt = Translate.getDisplayPrompt(part);
        this.promptElement.value = displayPrompt;
        this.promptElement.disabled = false;
      }
    }
  }
};
