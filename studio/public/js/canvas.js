/**
 * Canvas module — composites camera + background for recording
 * v2: zoom via cropping (W-012), camera shapes via Canvas clip (W-013), mirror toggle (W-018)
 */
const Canvas = {
  canvas: null,
  ctx: null,
  width: 1080,
  height: 1920,
  animationId: null,
  currentLayout: 'face_only',
  cameraVideo: null,
  zoom: 1.0,          // 1.0x - 3.0x (W-012)
  cameraShape: 'rounded-rect', // 'circle' | 'rounded-rect' | 'oval' (W-013)
  mirrorRecording: false,       // W-018: false = non-mirrored for recording

  init(canvasElement, cameraVideoElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.cameraVideo = cameraVideoElement;
  },

  setQuality(quality) {
    if (quality === '720p') {
      this.width = 720;
      this.height = 1280;
    } else {
      this.width = 1080;
      this.height = 1920;
    }
    if (this.canvas) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
  },

  startRendering() {
    const render = () => {
      this.drawFrame();
      this.animationId = requestAnimationFrame(render);
    };
    render();
  },

  stopRendering() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  },

  drawFrame() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    this.drawBackground(ctx, w, h);
    this.drawCamera(ctx, w, h);
  },

  drawBackground(ctx, w, h) {
    const part = App.state.project?.parts[App.state.currentPart];
    if (!part) return;

    const asset = Background.assets[part.part_number];
    if (!asset || part.layout === 'face_only') return;

    try {
      ctx.drawImage(asset.element, 0, 0, w, h);
    } catch (e) {}
  },

  drawCamera(ctx, w, h) {
    if (!this.cameraVideo || this.cameraVideo.readyState < 2) return;

    const layout = this.currentLayout;
    let dx, dy, dw, dh;

    if (layout === 'face_only') {
      dx = 0; dy = 0; dw = w; dh = h;
    } else if (layout === 'full_background') {
      dw = Math.round(w * 0.25);
      dh = Math.round(dw * 4 / 3);
      dx = w - dw - Math.round(w * 0.04);
      dy = h - dh - Math.round(h * 0.03);
    } else if (layout === 'partial_background') {
      dw = Math.round(w * 0.55);
      dh = Math.round(dw * 4 / 3);
      dx = Math.round((w - dw) / 2);
      dy = h - dh - Math.round(h * 0.05);
    } else {
      return;
    }

    const vw = this.cameraVideo.videoWidth;
    const vh = this.cameraVideo.videoHeight;
    if (!vw || !vh) return;

    // Calculate source rect with zoom cropping (W-012)
    const zoom = this.zoom;
    const cropW = vw / zoom;
    const cropH = vh / zoom;
    const sx = (vw - cropW) / 2;
    const sy = (vh - cropH) / 2;

    // Aspect-fit the cropped region into destination
    const srcRatio = cropW / cropH;
    const dstRatio = dw / dh;
    let finalSx, finalSy, finalSw, finalSh;
    if (srcRatio > dstRatio) {
      finalSh = cropH;
      finalSw = cropH * dstRatio;
      finalSx = sx + (cropW - finalSw) / 2;
      finalSy = sy;
    } else {
      finalSw = cropW;
      finalSh = cropW / dstRatio;
      finalSx = sx;
      finalSy = sy + (cropH - finalSh) / 2;
    }

    ctx.save();

    // Apply camera shape clip (W-013)
    if (layout !== 'face_only') {
      this.applyShapeClip(ctx, dx, dy, dw, dh);
    }

    // Mirror handling (W-018)
    if (this.mirrorRecording) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.cameraVideo, finalSx, finalSy, finalSw, finalSh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(this.cameraVideo, finalSx, finalSy, finalSw, finalSh, dx, dy, dw, dh);
    }

    ctx.restore();

    // Draw shape border for non-fullscreen
    if (layout !== 'face_only') {
      this.drawShapeBorder(ctx, dx, dy, dw, dh);
    }
  },

  /**
   * Apply clip path based on camera shape (W-013)
   */
  applyShapeClip(ctx, x, y, w, h) {
    ctx.beginPath();
    if (this.cameraShape === 'circle') {
      const r = Math.min(w, h) / 2;
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    } else if (this.cameraShape === 'oval') {
      const rx = w / 2;
      const ry = h / 2;
      ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2);
    } else {
      // rounded-rect
      const r = Math.min(w, h) * 0.1;
      ctx.roundRect(x, y, w, h, r);
    }
    ctx.clip();
  },

  /**
   * Draw border around camera shape
   */
  drawShapeBorder(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (this.cameraShape === 'circle') {
      const r = Math.min(w, h) / 2;
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    } else if (this.cameraShape === 'oval') {
      const rx = w / 2;
      const ry = h / 2;
      ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2);
    } else {
      const r = Math.min(w, h) * 0.1;
      ctx.roundRect(x, y, w, h, r);
    }
    ctx.stroke();
    ctx.restore();
  },

  setLayout(layout) {
    this.currentLayout = layout;
  },

  setZoom(value) {
    this.zoom = Math.max(1.0, Math.min(3.0, value));
  },

  setShape(shape) {
    this.cameraShape = shape;
  },

  setMirror(mirror) {
    this.mirrorRecording = mirror;
  },

  getStream(fps = 30) {
    return this.canvas.captureStream(fps);
  }
};
