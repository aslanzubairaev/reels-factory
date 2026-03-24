/**
 * Background module — loading and displaying backgrounds
 */
const Background = {
  assets: {},       // { partNumber: { type, element, url } }
  container: null,
  currentPart: null,

  async preloadAll(script, projectName) {
    const promises = [];
    const total = script.parts.filter(p => p.background_type !== 'none' && p.background_file).length;
    let loaded = 0;

    for (const part of script.parts) {
      if (part.background_type === 'none' || !part.background_file) continue;

      const url = API.getAssetUrl(projectName, part.background_file);

      if (part.background_type === 'photo') {
        const p = new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            this.assets[part.part_number] = { type: 'photo', element: img, url };
            loaded++;
            this.onProgress?.(loaded, total);
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to load bg for part ${part.part_number}`);
            resolve(); // Don't block on failed loads
          };
          img.src = url;
        });
        promises.push(p);
      } else if (part.background_type === 'video') {
        const p = new Promise((resolve) => {
          const video = document.createElement('video');
          video.loop = true;
          video.muted = true;
          video.playsInline = true;
          video.preload = 'auto';
          video.oncanplaythrough = () => {
            this.assets[part.part_number] = { type: 'video', element: video, url };
            loaded++;
            this.onProgress?.(loaded, total);
            resolve();
          };
          video.onerror = () => {
            console.warn(`Failed to load video bg for part ${part.part_number}`);
            resolve();
          };
          video.src = url;
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
      // No background — solid dark
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

  // Callback for preload progress
  onProgress: null
};
