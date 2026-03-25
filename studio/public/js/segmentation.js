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
  maskCanvas: null,    // separate canvas for mask (never shares with result)
  maskCtx: null,
  videoCanvas: null,   // separate canvas for video frame
  videoCtx: null,
  blurRadius: 8,

  async init() {
    if (this.loading || this.ready) return;
    this.loading = true;

    try {
      this.resultCanvas = document.createElement('canvas');
      this.resultCtx = this.resultCanvas.getContext('2d');
      this.maskCanvas = document.createElement('canvas');
      this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
      this.videoCanvas = document.createElement('canvas');
      this.videoCtx = this.videoCanvas.getContext('2d');

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
      this.videoCanvas.width = width;
      this.videoCanvas.height = height;
    }

    try {
      const result = this.model.segmentForVideo(video, performance.now());
      if (!result || !result.categoryMask) return null;

      const mask = result.categoryMask.getAsUint8Array();
      const mw = result.categoryMask.width;
      const mh = result.categoryMask.height;

      // Step 1: Build mask image at mask native resolution
      // Key: person = alpha 255, background = alpha 0
      if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) {
        this.maskCanvas.width = mw;
        this.maskCanvas.height = mh;
      }
      const maskImageData = this.maskCtx.createImageData(mw, mh);
      const md = maskImageData.data;
      for (let i = 0; i < mask.length; i++) {
        const idx = i * 4;
        md[idx] = 255;
        md[idx + 1] = 255;
        md[idx + 2] = 255;
        md[idx + 3] = mask[i] === 0 ? 255 : 0; // person=opaque, bg=transparent
      }
      this.maskCtx.putImageData(maskImageData, 0, 0);

      // Step 2: Draw video to separate videoCanvas
      this.videoCtx.drawImage(video, 0, 0, width, height);

      // Step 3: On resultCanvas — draw mask (scaled + blurred for soft edges)
      this.resultCtx.clearRect(0, 0, width, height);
      this.resultCtx.globalCompositeOperation = 'source-over';
      if (this.blurRadius > 0) {
        this.resultCtx.filter = `blur(${this.blurRadius}px)`;
      }
      this.resultCtx.drawImage(this.maskCanvas, 0, 0, mw, mh, 0, 0, width, height);
      this.resultCtx.filter = 'none';

      // Step 4: Draw video — source-in keeps video only where mask alpha > 0
      this.resultCtx.globalCompositeOperation = 'source-in';
      this.resultCtx.drawImage(this.videoCanvas, 0, 0);
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
