/**
 * Segmentation module — AI background removal using MediaPipe
 * Removes real background, keeps only person silhouette
 */
const Segmentation = {
  enabled: false,
  model: null,
  loading: false,
  ready: false,
  resultCanvas: null,
  resultCtx: null,
  featherRadius: 3,

  async init() {
    if (this.loading || this.ready) return;
    this.loading = true;

    try {
      this.resultCanvas = document.createElement('canvas');
      this.resultCtx = this.resultCanvas.getContext('2d', { willReadFrequently: true });

      const { ImageSegmenter, FilesetResolver } = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest'
      );

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.model = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true
      });

      this.ready = true;
      this.loading = false;
      console.log('MediaPipe loaded');
    } catch (e) {
      console.error('MediaPipe failed:', e);
      this.loading = false;
    }
  },

  /**
   * Process frame — returns canvas with person only (transparent bg)
   */
  processFrame(video, width, height) {
    if (!this.ready || !this.model || !this.enabled) return null;
    if (video.readyState < 2) return null;

    // Cap at 480p for performance — same quality from MediaPipe
    let pw = width;
    let ph = height;
    const maxW = 640, maxH = 480;
    if (pw > maxW || ph > maxH) {
      const s = Math.min(maxW / pw, maxH / ph);
      pw = Math.round(pw * s);
      ph = Math.round(ph * s);
    }

    if (this.resultCanvas.width !== pw || this.resultCanvas.height !== ph) {
      this.resultCanvas.width = pw;
      this.resultCanvas.height = ph;
    }

    try {
      const result = this.model.segmentForVideo(video, performance.now());
      if (!result || !result.categoryMask) return null;

      const mask = result.categoryMask.getAsUint8Array();
      const mw = result.categoryMask.width;
      const mh = result.categoryMask.height;

      // Draw camera to canvas at reduced resolution
      this.resultCtx.drawImage(video, 0, 0, pw, ph);
      const imageData = this.resultCtx.getImageData(0, 0, pw, ph);
      const px = imageData.data;

      // Apply mask — feathering only on edge pixels for speed
      const r = this.featherRadius;
      for (let y = 0; y < ph; y++) {
        const my = Math.floor(y * mh / ph);
        for (let x = 0; x < pw; x++) {
          const mx = Math.floor(x * mw / pw);
          const idx = (y * pw + x) * 4;
          const isPerson = mask[my * mw + mx] === 0;

          // Check if this is an edge pixel (neighbor differs)
          let isEdge = false;
          if (r > 0) {
            const left = mx > 0 ? mask[my * mw + mx - 1] : mask[my * mw + mx];
            const right = mx < mw - 1 ? mask[my * mw + mx + 1] : mask[my * mw + mx];
            const up = my > 0 ? mask[(my - 1) * mw + mx] : mask[my * mw + mx];
            const down = my < mh - 1 ? mask[(my + 1) * mw + mx] : mask[my * mw + mx];
            const center = mask[my * mw + mx];
            isEdge = (left !== center || right !== center || up !== center || down !== center);
          }

          if (!isEdge) {
            px[idx + 3] = isPerson ? 255 : 0;
          } else {
            // Soft edge — sample small neighborhood
            let personCount = 0;
            let total = 0;
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const sx = mx + dx;
                const sy = my + dy;
                if (sx >= 0 && sx < mw && sy >= 0 && sy < mh) {
                  if (mask[sy * mw + sx] === 0) personCount++;
                  total++;
                }
              }
            }
            px[idx + 3] = Math.round((personCount / total) * 255);
          }
        }
      }

      this.resultCtx.putImageData(imageData, 0, 0);
      result.categoryMask.close();
      return this.resultCanvas;
    } catch (e) {
      return null;
    }
  },

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled && !this.ready && !this.loading) {
      this.init();
    }
  }
};
