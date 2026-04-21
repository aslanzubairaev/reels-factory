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
  camSize: 1.0,       // camera window size multiplier
  camPosition: 'center', // 'left' | 'center' | 'right'
  bgRemoval: false,      // AI background removal mode
  noCamera: false,       // background only, no camera
  cameraShape: 'rounded-rect', // 'circle' | 'rounded-rect' | 'oval' (W-013)
  mirrorRecording: false,       // W-018: false = non-mirrored for recording
  clickAnims: [],              // active click animations
  transition: 'fade',
  transitionProgress: 1,       // 0 = start, 1 = done
  transitionDuration: 400,     // ms
  transitionStartTime: 0,

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

    // Update transition progress
    if (this.transitionProgress < 1) {
      const elapsed = performance.now() - this.transitionStartTime;
      this.transitionProgress = Math.min(1, elapsed / this.transitionDuration);
    }

    ctx.save();

    // Apply transition effect
    if (this.transitionProgress < 1 && this.transition !== 'cut') {
      const p = this.transitionProgress;
      if (this.transition === 'fade') {
        ctx.globalAlpha = p;
      } else if (this.transition === 'slide') {
        ctx.translate(w * (1 - p), 0);
      } else if (this.transition === 'zoom') {
        const scale = 1 + 0.3 * (1 - p);
        ctx.globalAlpha = p;
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-w / 2, -h / 2);
      }
    }

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    if (this.noCamera) {
      // No camera mode: only background
      this.drawBackground(ctx, w, h);
    } else if (this.bgRemoval && this.currentLayout !== 'face_only') {
      // BG removal mode: full screen background + person silhouette on top
      this.drawBackground(ctx, w, h);
      this.drawPersonSilhouette(ctx, w, h);
    } else {
      // Normal mode (or face_only with bgRemoval): background + camera
      this.drawBackground(ctx, w, h);
      this.drawCamera(ctx, w, h);
    }

    // Draw click animations on top
    this.drawClickAnims(ctx);

    ctx.restore();
  },

  /**
   * Draw person silhouette (AI background removed) on full screen
   */
  drawPersonSilhouette(ctx, w, h) {
    if (!this.cameraVideo || this.cameraVideo.readyState < 2) return;

    const vw = this.cameraVideo.videoWidth;
    const vh = this.cameraVideo.videoHeight;
    if (!vw || !vh) return;

    // Process at native video resolution
    const segResult = Segmentation.processFrame(this.cameraVideo, vw, vh);
    const source = segResult || this.cameraVideo;

    // face_only = full screen, otherwise bottom half with size control
    let dw, dh, dy, dx;
    if (this.currentLayout === 'face_only') {
      dw = w;
      dh = h;
      dy = 0;
      dx = 0;
    } else {
      const s = this.camSize;
      dw = w;
      dh = Math.round(h * 0.5 * s);
      // Instagram safe zone: silhouette above description zone
      dy = h - dh - Math.round(h * 0.12);
      const shift = Math.round(w * 0.2);
      dx = this.camPosition === 'left' ? -shift : this.camPosition === 'right' ? shift : 0;
    }

    // Cover crop to match destination region (dw x dh)
    const srcRatio = vw / vh;
    const dstRatio = dw / dh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (srcRatio > dstRatio) {
      sw = vh * dstRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / dstRatio;
      sy = (vh - sh) / 2;
    }

    ctx.save();
    if (this.mirrorRecording) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      dx = -dx;
    }
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  },

  triggerTransition() {
    if (this.transition === 'cut') return;
    this.transitionProgress = 0;
    this.transitionStartTime = performance.now();
  },

  drawBackground(ctx, w, h) {
    const part = App.state.project?.parts[App.state.currentPart];
    if (!part) return;

    const asset = Background.assets[part.part_number];
    if (!asset || part.layout === 'face_only') return;

    try {
      // Screen capture: apply pan/zoom crop to source before drawing.
      if (asset.type === 'screen') {
        const video = Background.getScreenSource ? Background.getScreenSource() : null;
        if (!video) return;
        const vw = video.videoWidth || 1920;
        const vh = video.videoHeight || 1080;
        const pan = (typeof ScreenPan !== 'undefined')
          ? ScreenPan.computeCrop(vw, vh, w, h)
          : { sx: 0, sy: 0, sw: vw, sh: vh };
        ctx.drawImage(video, pan.sx, pan.sy, pan.sw, pan.sh, 0, 0, w, h);
        return;
      }
      ctx.drawImage(asset.element, 0, 0, w, h);
    } catch (e) {
      console.warn('drawBackground failed for part', part.part_number, e);
    }
  },

  drawCamera(ctx, w, h) {
    if (!this.cameraVideo || this.cameraVideo.readyState < 2) return;

    const layout = this.currentLayout;
    const vw = this.cameraVideo.videoWidth;
    const vh = this.cameraVideo.videoHeight;
    if (!vw || !vh) return;

    if (layout === 'face_only') {
      // Full screen cover crop
      const zoom = this.zoom;
      const cropW = vw / zoom;
      const cropH = vh / zoom;
      const sx = (vw - cropW) / 2;
      const sy = (vh - cropH) / 2;
      const srcRatio = cropW / cropH;
      const dstRatio = w / h;
      let fSx, fSy, fSw, fSh;
      if (srcRatio > dstRatio) {
        fSh = cropH; fSw = cropH * dstRatio;
        fSx = sx + (cropW - fSw) / 2; fSy = sy;
      } else {
        fSw = cropW; fSh = cropW / dstRatio;
        fSx = sx; fSy = sy + (cropH - fSh) / 2;
      }
      ctx.save();
      if (this.mirrorRecording) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(this.cameraVideo, fSx, fSy, fSw, fSh, 0, 0, w, h);
      ctx.restore();
      return;
    }

    if (layout !== 'full_background') return;

    // full_background: small camera overlay
    let dx, dy, dw, dh;
    const s = this.camSize;
    if (this.cameraShape === 'circle') {
      const size = Math.round(w * 0.3 * s);
      dw = size; dh = size;
    } else {
      dw = Math.round(w * 0.4 * s);
      dh = Math.round(dw * 2 / 3);
    }
    // Instagram safe zone margins
    const marginLeft = Math.round(w * 0.03);
    const marginRight = Math.round(w * 0.15);
    const marginBottom = Math.round(h * 0.12);
    if (this.camPosition === 'left') {
      dx = marginLeft;
    } else if (this.camPosition === 'right') {
      dx = w - dw - marginRight;
    } else {
      dx = Math.round((w - dw) / 2);
    }
    dy = h - dh - marginBottom;

    // Zoom crop on source
    const zoom = this.zoom;
    const cropW = vw / zoom;
    const cropH = vh / zoom;
    const sx = (vw - cropW) / 2;
    const sy = (vh - cropH) / 2;

    // Aspect-cover crop into destination
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
    this.applyShapeClip(ctx, dx, dy, dw, dh);

    if (this.mirrorRecording) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.cameraVideo, finalSx, finalSy, finalSw, finalSh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(this.cameraVideo, finalSx, finalSy, finalSw, finalSh, dx, dy, dw, dh);
    }
    ctx.restore();

    this.drawShapeBorder(ctx, dx, dy, dw, dh);
  },

  /**
   * Apply clip path based on camera shape (W-013)
   */
  applyShapeClip(ctx, x, y, w, h) {
    ctx.beginPath();
    if (this.cameraShape === 'circle') {
      const r = Math.min(w, h) / 2;
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
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
    } else {
      const r = Math.min(w, h) * 0.1;
      ctx.roundRect(x, y, w, h, r);
    }
    ctx.stroke();
    ctx.restore();
  },

  setBgRemoval(enabled) {
    this.bgRemoval = enabled;
  },

  setNoCamera(enabled) {
    this.noCamera = enabled;
  },

  addClickAnim(x, y, type) {
    const durations = { pulse: 600, rings: 800, spark: 500, target: 500, glow: 700 };
    this.clickAnims.push({ x, y, type, start: performance.now(), duration: durations[type] || 600 });
  },

  drawClickAnims(ctx) {
    const now = performance.now();
    this.clickAnims = this.clickAnims.filter(a => now - a.start < a.duration);

    for (const a of this.clickAnims) {
      const p = (now - a.start) / a.duration;
      ctx.save();
      if (a.type === 'pulse') {
        const r = 20 + p * 60;
        const alpha = 1 - p;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
        ctx.lineWidth = 3 - p * 2;
        ctx.stroke();
      } else if (a.type === 'rings') {
        for (let i = 0; i < 2; i++) {
          const delay = i * 0.15;
          const rp = Math.max(0, (p - delay) / (1 - delay));
          if (rp <= 0 || rp >= 1) continue;
          const r = 10 + rp * 80;
          const alpha = 1 - rp;
          ctx.beginPath();
          ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
          ctx.lineWidth = 3 - rp * 2;
          ctx.stroke();
        }
      } else if (a.type === 'spark') {
        const count = 8;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const dist = 40 + Math.sin(i * 7) * 20;
          const sx = a.x + Math.cos(angle) * dist * p;
          const sy = a.y + Math.sin(angle) * dist * p;
          const alpha = 1 - p;
          ctx.beginPath();
          ctx.arc(sx, sy, 4 * (1 - p), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.fill();
        }
      } else if (a.type === 'target') {
        const scale = p < 0.4 ? 2 - (p / 0.4) * 1.1 : p < 0.6 ? 0.9 + ((p - 0.4) / 0.2) * 0.15 : 1.05 - ((p - 0.6) / 0.4) * 0.05;
        const alpha = p < 0.6 ? Math.min(1, p / 0.2) : 1 - (p - 0.6) / 0.4;
        const size = 50 * scale;
        const r = 4;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(a.x - size / 2, a.y - size / 2, size, size, r);
        ctx.stroke();
      } else if (a.type === 'glow') {
        const scale = 0.5 + p * 2.5;
        const alpha = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
        const r = 30 * scale;
        const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
        grad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.3})`);
        grad.addColorStop(1, `rgba(255, 255, 255, 0)`);
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.restore();
    }
  },

  setTransition(type) {
    this.transition = type;
  },

  setLayout(layout) {
    this.currentLayout = layout;
  },

  setCamPosition(pos) {
    this.camPosition = pos;
  },

  setCamSize(value) {
    this.camSize = Math.max(0.5, Math.min(2.0, value));
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
