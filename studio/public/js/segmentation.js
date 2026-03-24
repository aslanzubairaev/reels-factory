/**
 * Segmentation module — AI background removal using MediaPipe
 * Uses Canvas compositing + GPU blur for performance (no per-pixel loops)
 */
const Segmentation = {
  enabled: false,
  model: null,
  loading: false,
  ready: false,
  resultCanvas: null,
  resultCtx: null,
  rawMaskCanvas: null,
  rawMaskCtx: null,
  blurRadius: 4,

  maxProcessWidth: 640,
  maxProcessHeight: 480,

  async init() {
    if (this.loading || this.ready) return;
    this.loading = true;

    try {
      this.resultCanvas = document.createElement('canvas');
      this.resultCtx = this.resultCanvas.getContext('2d');
      this.rawMaskCanvas = document.createElement('canvas');
      this.rawMaskCtx = this.rawMaskCanvas.getContext('2d');

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
    }

    try {
      const result = this.model.segmentForVideo(video, performance.now());
      if (!result || !result.categoryMask) return null;

      const mask = result.categoryMask.getAsUint8Array();
      const mw = result.categoryMask.width;
      const mh = result.categoryMask.height;

      // Step 1: Write raw mask at its native resolution
      if (this.rawMaskCanvas.width !== mw || this.rawMaskCanvas.height !== mh) {
        this.rawMaskCanvas.width = mw;
        this.rawMaskCanvas.height = mh;
      }
      const maskImageData = this.rawMaskCtx.createImageData(mw, mh);
      const md = maskImageData.data;
      for (let i = 0; i < mask.length; i++) {
        const val = mask[i] === 0 ? 255 : 0;
        const idx = i * 4;
        md[idx] = val;
        md[idx + 1] = val;
        md[idx + 2] = val;
        md[idx + 3] = 255;
      }
      this.rawMaskCtx.putImageData(maskImageData, 0, 0);

      // Step 2: Draw video frame to result
      this.resultCtx.clearRect(0, 0, pw, ph);
      this.resultCtx.globalCompositeOperation = 'source-over';
      this.resultCtx.drawImage(video, 0, 0, pw, ph);

      // Step 3: Apply mask with blur (soft edges) via compositing
      this.resultCtx.globalCompositeOperation = 'destination-in';
      if (this.blurRadius > 0) {
        this.resultCtx.filter = `blur(${this.blurRadius}px)`;
      }
      this.resultCtx.drawImage(this.rawMaskCanvas, 0, 0, mw, mh, 0, 0, pw, ph);
      this.resultCtx.filter = 'none';
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
