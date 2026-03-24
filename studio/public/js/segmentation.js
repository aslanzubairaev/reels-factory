/**
 * Segmentation module — AI background removal using MediaPipe
 * Removes real background, keeps only person silhouette
 * Uses Canvas compositing + GPU blur for performance (no per-pixel loops)
 */
const Segmentation = {
  enabled: false,
  model: null,
  loading: false,
  ready: false,
  resultCanvas: null,
  resultCtx: null,
  maskCanvas: null,
  maskCtx: null,
  blurRadius: 4, // px — soft edge quality

  // Cap processing resolution for performance
  maxProcessWidth: 640,
  maxProcessHeight: 480,

  async init() {
    if (this.loading || this.ready) return;
    this.loading = true;

    try {
      this.resultCanvas = document.createElement('canvas');
      this.resultCtx = this.resultCanvas.getContext('2d');
      this.maskCanvas = document.createElement('canvas');
      this.maskCtx = this.maskCanvas.getContext('2d');

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
   * Uses Canvas compositing instead of per-pixel loop for speed
   */
  processFrame(video, width, height) {
    if (!this.ready || !this.model || !this.enabled) return null;
    if (video.readyState < 2) return null;

    // Cap resolution for performance
    let pw = width;
    let ph = height;
    if (pw > this.maxProcessWidth || ph > this.maxProcessHeight) {
      const scale = Math.min(this.maxProcessWidth / pw, this.maxProcessHeight / ph);
      pw = Math.round(pw * scale);
      ph = Math.round(ph * scale);
    }

    if (this.resultCanvas.width !== pw || this.resultCanvas.height !== ph) {
      this.resultCanvas.width = pw;
      this.resultCanvas.height = ph;
      this.maskCanvas.width = pw;
      this.maskCanvas.height = ph;
    }

    try {
      const result = this.model.segmentForVideo(video, performance.now());
      if (!result || !result.categoryMask) return null;

      const mask = result.categoryMask.getAsUint8Array();
      const mw = result.categoryMask.width;
      const mh = result.categoryMask.height;

      // Step 1: Draw mask as white (person) on black (background)
      const maskImageData = this.maskCtx.createImageData(mw, mh);
      const md = maskImageData.data;
      for (let i = 0; i < mask.length; i++) {
        const val = mask[i] === 0 ? 255 : 0; // person = white
        const idx = i * 4;
        md[idx] = val;
        md[idx + 1] = val;
        md[idx + 2] = val;
        md[idx + 3] = 255;
      }
      this.maskCtx.putImageData(maskImageData, 0, 0);

      // Step 2: Apply GPU-accelerated blur for soft edges
      if (this.blurRadius > 0) {
        this.maskCtx.save();
        this.maskCtx.filter = `blur(${this.blurRadius}px)`;
        this.maskCtx.drawImage(this.maskCanvas, 0, 0, mw, mh, 0, 0, pw, ph);
        this.maskCtx.restore();
      } else {
        // Just scale mask to process resolution
        this.maskCtx.drawImage(this.maskCanvas, 0, 0, mw, mh, 0, 0, pw, ph);
      }

      // Step 3: Draw video frame
      this.resultCtx.clearRect(0, 0, pw, ph);
      this.resultCtx.drawImage(video, 0, 0, pw, ph);

      // Step 4: Apply mask via compositing — keeps only person pixels
      this.resultCtx.globalCompositeOperation = 'destination-in';
      this.resultCtx.drawImage(this.maskCanvas, 0, 0);
      this.resultCtx.globalCompositeOperation = 'source-over';

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
