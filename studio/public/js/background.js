/**
 * Background module — loading and displaying backgrounds
 * Priority: custom/ > backgrounds/ > slides/
 */
const Background = {
  assets: {},       // { partNumber: { type, element, url } }
  container: null,
  currentPart: null,

  /**
   * Determine the best URL and type for a part's background.
   * Priority: custom_file > background_file > slide_file
   */
  resolveAsset(part, projectName) {
    // 1. Custom user-uploaded file (highest priority)
    if (part.custom_file) {
      const url = API.getCustomUrl(projectName, part.custom_file);
      return { url, type: part.custom_type || 'photo', source: 'custom' };
    }
    // 2. AI-generated background
    if (part.background_file) {
      const url = API.getAssetUrl(projectName, part.background_file);
      const type = part.background_type === 'video' ? 'video' : 'photo';
      return { url, type, source: 'background' };
    }
    // 3. HTML slide
    if (part.background_type === 'html_slide') {
      const slideFile = part.slide_file || `part_${part.part_number}_slide.png`;
      const url = HtmlSlides.getSlideUrl(projectName, slideFile);
      return { url, type: 'photo', source: 'slide' };
    }
    return null;
  },

  async preloadAll(script, projectName) {
    const promises = [];
    const total = script.parts.filter(p => p.background_type !== 'none' && this.resolveAsset(p, projectName)).length;
    let loaded = 0;

    for (const part of script.parts) {
      if (part.background_type === 'none') continue;

      const resolved = this.resolveAsset(part, projectName);
      if (!resolved) continue;

      if (resolved.type === 'video') {
        const p = new Promise((resolve) => {
          const video = document.createElement('video');
          video.loop = true;
          video.muted = true;
          video.playsInline = true;
          video.preload = 'auto';
          video.oncanplaythrough = () => {
            this.assets[part.part_number] = { type: 'video', element: video, url: resolved.url, source: resolved.source };
            loaded++;
            this.onProgress?.(loaded, total);
            resolve();
          };
          video.onerror = () => {
            console.warn(`Failed to load video for part ${part.part_number}`);
            resolve();
          };
          video.src = resolved.url;
        });
        promises.push(p);
      } else {
        const p = new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            this.assets[part.part_number] = { type: 'photo', element: img, url: resolved.url, source: resolved.source };
            loaded++;
            this.onProgress?.(loaded, total);
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to load bg for part ${part.part_number}`);
            resolve();
          };
          img.src = resolved.url;
        });
        promises.push(p);
      }
    }

    await Promise.all(promises);
  },

  show(partNumber) {
    if (!this.container) return;

    // Pause previous video
    if (this.currentPart && this.assets[this.currentPart]?.type === 'video') {
      this.assets[this.currentPart].element.pause();
    }

    this.currentPart = partNumber;
    this.container.innerHTML = '';

    const asset = this.assets[partNumber];
    if (!asset) {
      this.container.style.background = '#1a1a2e';
      return;
    }

    this.container.style.background = 'none';

    if (asset.type === 'photo') {
      const img = asset.element.cloneNode();
      img.className = 'bg-media';
      this.container.appendChild(img);
    } else if (asset.type === 'video') {
      asset.element.className = 'bg-media';
      this.container.appendChild(asset.element);
      asset.element.currentTime = 0;
      asset.element.play().catch(() => {});
    }
  },

  onProgress: null
};
