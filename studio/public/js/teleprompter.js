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
      this.typeBadgeElement.textContent = (part.background_type || 'none').toUpperCase();
    }

    // Prompt — hide entire section for face_only
    if (this.promptSection) {
      if (part.background_type === 'none') {
        this.promptSection.classList.add('hidden');
      } else {
        this.promptSection.classList.remove('hidden');
      }
    }

    if (this.promptElement) {
      if (part.background_type === 'none') {
        this.promptElement.value = '';
        this.promptElement.disabled = true;
      } else {
        const displayPrompt = Translate.getDisplayPrompt(part);
        this.promptElement.value = displayPrompt;
        this.promptElement.disabled = false;
      }
    }
  }
};
