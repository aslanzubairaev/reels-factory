/**
 * Teleprompter module — показывает текст сценария.
 * Пишет текст в: панель справа (textElement) и overlay поверх превью (если включён).
 */
const Teleprompter = {
  textElement: null,

  show(part /* totalParts — не нужен */) {
    if (this.textElement) {
      this.textElement.textContent = part.text;
    }
    const overlayText = document.getElementById('preview-teleprompter-overlay-text');
    if (overlayText) overlayText.textContent = part.text;
  }
};
