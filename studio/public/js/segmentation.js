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
  featherRadius: 5,

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

    if (this.resultCanvas.width !== width || this.resultCanvas.height !== height) {
      this.resultCanvas.width = width;
      this.resultCanvas.height = height;
    }

    try {
      const result = this.model.segmentForVideo(video, performance.now());
      if (!result || !result.categoryMask) return null;

      const mask = result.categoryMask.getAsUint8Array();
      const mw = result.categoryMask.width;
      const mh = result.categoryMask.height;

      // Draw camera to canvas
      this.resultCtx.drawImage(video, 0, 0, width, height);
      const imageData = this.resultCtx.getImageData(0, 0, width, height);
      const px = imageData.data;

      // Apply mask with feathering
      const r = this.featherRadius;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const mx = Math.floor(x * mw / width);
          const my = Math.floor(y * mh / height);
          const idx = (y * width + x) * 4;

          if (r <= 0) {
            // Hard edge
            px[idx + 3] = mask[my * mw + mx] === 0 ? 255 : 0;
          } else {
            // Soft edge — sample neighborhood
            let personCount = 0;
            let total = 0;
            const step = Math.max(1, Math.floor(r / 2));
            for (let dy = -r; dy <= r; dy += step) {
              for (let dx = -r; dx <= r; dx += step) {
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
