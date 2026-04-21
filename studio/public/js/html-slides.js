/**
 * HTML Slides module — handles html_slide background type
 * Generates slides via server API, displays as PNG on canvas
 */
const HtmlSlides = {

  /**
   * Generate an HTML slide PNG via the server
   * @param {string} project - project name
   * @param {number} partNumber - part number
   * @param {string} template - template name (infographic, comparison, text-slide, mockup)
   * @param {object} slideData - data for the template
   * @returns {Promise<{file, path}>}
   */
  async generate(project, partNumber, template, slideData) {
    const res = await fetch(`${API.baseUrl}/api/generate-slide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project,
        part_number: partNumber,
        template: template.replace('_', '-'),
        slide_data: slideData
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Slide generation failed');
    }
    return res.json();
  },

  /**
   * Get the asset URL for a slide
   */
  getSlideUrl(project, filename) {
    return `${API.baseUrl}/api/assets/${encodeURIComponent(project)}/slides/${encodeURIComponent(filename)}`;
  },

  /**
   * Check if a part uses HTML slide
   */
  isHtmlSlide(part) {
    return part && part.background_type === 'html_slide';
  },

  /**
   * Create the slide data editor UI for the right panel
   * @param {object} part - the script part
   * @param {function} onRegenerate - callback when user clicks regenerate
   * @returns {HTMLElement}
   */
  createEditor(part, onRegenerate) {
    const container = document.createElement('div');
    container.className = 'slide-editor';

    // Category badge
    const category = part.background_category || 'unknown';
    const categoryBadge = document.createElement('div');
    categoryBadge.className = 'slide-category-badge';
    categoryBadge.textContent = category.replace('_', ' ').toUpperCase();
    container.appendChild(categoryBadge);

    // Claim display
    if (part.claim) {
      const claimEl = document.createElement('div');
      claimEl.className = 'slide-claim';
      claimEl.textContent = 'Claim: ' + part.claim;
      container.appendChild(claimEl);
    }

    // Editable JSON data
    const dataLabel = document.createElement('label');
    dataLabel.textContent = 'Данные слайда';
    dataLabel.className = 'slide-data-label';
    container.appendChild(dataLabel);

    const textarea = document.createElement('textarea');
    textarea.className = 'slide-data-textarea';
    textarea.value = JSON.stringify(part.slide_data || {}, null, 2);
    textarea.rows = 8;
    container.appendChild(textarea);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'slide-btn-row';

    const regenBtn = document.createElement('button');
    regenBtn.className = 'btn btn-secondary btn-sm';
    regenBtn.textContent = 'Перегенерировать';
    regenBtn.addEventListener('click', () => {
      try {
        const newData = JSON.parse(textarea.value);
        part.slide_data = newData;
        if (onRegenerate) onRegenerate(newData);
      } catch (e) {
        const useAi = confirm(
          'В поле «Данные слайда» ждётся JSON, а не свободный текст.\n\n' +
          'Хочешь, AI сам заполнит данные по тексту твоей фразы?'
        );
        if (useAi && typeof App !== 'undefined' && App.aiFillSlideData) {
          App.aiFillSlideData();
        }
      }
    });
    btnRow.appendChild(regenBtn);

    const aiBtn = document.createElement('button');
    aiBtn.className = 'btn btn-secondary btn-sm';
    aiBtn.textContent = 'AI по тексту';
    aiBtn.title = 'Заполнить данные слайда на основе текста части';
    aiBtn.addEventListener('click', () => {
      if (typeof App !== 'undefined' && App.aiFillSlideData) App.aiFillSlideData();
    });
    btnRow.appendChild(aiBtn);
    container.appendChild(btnRow);

    return container;
  }
};
