/**
 * Canvas module — composites camera + background for recording
 */
const Canvas = {
  canvas: null,
  ctx: null,
  width: 1080,
  height: 1920,
  animationId: null,
  currentLayout: "face_only",
  cameraVideo: null,
  mirrorRecording: false,
  camSize: 1.0, // camera window size multiplier
  cameraPlacement: { x: 0.5, y: 0.9 },
  bgRemoval: false, // AI background removal mode
  noCamera: false, // background only, no camera
  cameraShape: "rounded-rect",
  screenCaptureFitScale: 0.9,
  clickAnims: [], // active click animations
  transition: "fade",
  transitionProgress: 1, // 0 = start, 1 = done
  transitionDuration: 400, // ms
  transitionStartTime: 0,

  init(canvasElement, cameraVideoElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext("2d");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.cameraVideo = cameraVideoElement;
    this.applyCanvasQuality();
  },

  setQuality(quality) {
    if (quality === "720p") {
      this.width = 720;
      this.height = 1280;
    } else {
      this.width = 1080;
      this.height = 1920;
    }
    if (this.canvas) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.applyCanvasQuality();
    }
  },

  startRendering(targetFps = 30) {
    const fps = this.clamp(Number(targetFps) || 30, 1, 60);
    const frameInterval = 1000 / fps;
    let lastFrameTime = 0;

    const render = (now) => {
      if (!lastFrameTime || now - lastFrameTime >= frameInterval) {
        this.drawFrame();
        lastFrameTime = now;
      }
      this.animationId = requestAnimationFrame(render);
    };
    render(performance.now());
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
    if (this.transitionProgress < 1 && this.transition !== "cut") {
      const p = this.transitionProgress;
      if (this.transition === "fade") {
        ctx.globalAlpha = p;
      } else if (this.transition === "slide") {
        ctx.translate(w * (1 - p), 0);
      } else if (this.transition === "zoom") {
        const scale = 1 + 0.3 * (1 - p);
        ctx.globalAlpha = p;
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-w / 2, -h / 2);
      }
    }

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    if (this.noCamera) {
      // No camera mode: only background
      this.drawBackground(ctx, w, h);
    } else if (this.bgRemoval && this.currentLayout !== "face_only") {
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

    const { dx, dy, dw, dh } = this.getCameraRect(w, h, { fullWidth: true });

    // Cover crop to match destination region (dw x dh)
    const srcRatio = vw / vh;
    const dstRatio = dw / dh;
    let sx = 0,
      sy = 0,
      sw = vw,
      sh = vh;
    if (srcRatio > dstRatio) {
      sw = vh * dstRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / dstRatio;
      sy = (vh - sh) / 2;
    }

    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
  },

  triggerTransition() {
    if (this.transition === "cut") return;
    this.transitionProgress = 0;
    this.transitionStartTime = performance.now();
  },

  drawBackground(ctx, w, h) {
    const part = App.state.project?.parts[App.state.currentPart];
    if (!part) return;

    const asset = Background.assets[part.part_number];
    if (!asset || part.layout === "face_only") return;

    try {
      if (asset.type === "screen_capture") {
        const video = asset.element;
        if (!video || video.readyState < 2) return;
        const vw = video.videoWidth || 1920;
        const vh = video.videoHeight || 1080;
        const pan = (typeof ScreenPan !== "undefined")
          ? ScreenPan.computeCrop(vw, vh, w, h)
          : (() => {
              const srcAspect = vw / vh;
              const dstAspect = w / h;
              let sw, sh;
              if (srcAspect > dstAspect) { sh = vh; sw = vh * dstAspect; }
              else { sw = vw; sh = vw / dstAspect; }
              return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
            })();
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(video, pan.sx, pan.sy, pan.sw, pan.sh, 0, 0, w, h);
        return;
      }

      // Photo / video: contain-режим — всё фото видно целиком + scale/pan.
      const el = asset.element;
      const srcW = el.naturalWidth || el.videoWidth || 0;
      const srcH = el.naturalHeight || el.videoHeight || 0;
      if (!srcW || !srcH) {
        ctx.drawImage(el, 0, 0, w, h);
        return;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      if (typeof ScreenPan !== "undefined" && ScreenPan.mode === "contain") {
        const r = ScreenPan.computeContainRect(srcW, srcH, w, h);
        ctx.drawImage(el, 0, 0, srcW, srcH, r.dx, r.dy, r.dw, r.dh);
      } else if (typeof ScreenPan !== "undefined") {
        const pan = ScreenPan.computeCrop(srcW, srcH, w, h);
        ctx.drawImage(el, pan.sx, pan.sy, pan.sw, pan.sh, 0, 0, w, h);
      } else {
        ctx.drawImage(el, 0, 0, w, h);
      }
    } catch (e) {}
  },

  drawCamera(ctx, w, h) {
    if (!this.cameraVideo || this.cameraVideo.readyState < 2) return;

    const layout = this.currentLayout;
    const { dx, dy, dw, dh } = this.getCameraRect(w, h);
    if (!dw || !dh) return;

    const vw = this.cameraVideo.videoWidth;
    const vh = this.cameraVideo.videoHeight;
    if (!vw || !vh) return;

    const srcRatio = vw / vh;
    const dstRatio = dw / dh;
    let finalSx, finalSy, finalSw, finalSh;
    if (srcRatio > dstRatio) {
      finalSh = vh;
      finalSw = vh * dstRatio;
      finalSx = (vw - finalSw) / 2;
      finalSy = 0;
    } else {
      finalSw = vw;
      finalSh = vw / dstRatio;
      finalSx = 0;
      finalSy = (vh - finalSh) / 2;
    }

    ctx.save();

    // Apply camera shape clip (W-013)
    if (layout !== "face_only") {
      this.applyShapeClip(ctx, dx, dy, dw, dh);
    }

    // Зеркальный режим: горизонтально отражаем камеру (как в вебке на мак/iPhone).
    if (this.mirrorRecording) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.cameraVideo,
        finalSx, finalSy, finalSw, finalSh,
        0, 0, dw, dh
      );
      ctx.restore();
      return;
    }

    ctx.drawImage(
      this.cameraVideo,
      finalSx,
      finalSy,
      finalSw,
      finalSh,
      dx,
      dy,
      dw,
      dh,
    );

    ctx.restore();

    // Draw shape border for non-fullscreen
    if (layout !== "face_only") {
      this.drawShapeBorder(ctx, dx, dy, dw, dh);
    }
  },

  /**
   * Apply clip path based on camera shape (W-013)
   */
  applyShapeClip(ctx, x, y, w, h) {
    ctx.beginPath();
    if (this.cameraShape === "circle") {
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
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (this.cameraShape === "circle") {
      const r = Math.min(w, h) / 2;
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    } else {
      const r = Math.min(w, h) * 0.1;
      ctx.roundRect(x, y, w, h, r);
    }
    ctx.stroke();
    ctx.restore();
  },

  clamp(value, min, max) {
    if (max <= min) return min;
    return Math.min(Math.max(value, min), max);
  },

  applyCanvasQuality() {
    if (!this.ctx) return;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  },

  getMediaIntrinsicSize(element) {
    return {
      width:
        element?.videoWidth || element?.naturalWidth || element?.width || 0,
      height:
        element?.videoHeight || element?.naturalHeight || element?.height || 0,
    };
  },

  getContainRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
      return { dx: 0, dy: 0, dw: targetWidth, dh: targetHeight };
    }

    const scale = Math.min(
      targetWidth / sourceWidth,
      targetHeight / sourceHeight,
    );
    const dw = Math.round(sourceWidth * scale);
    const dh = Math.round(sourceHeight * scale);
    const dx = Math.round((targetWidth - dw) / 2);
    const dy = Math.round((targetHeight - dh) / 2);
    return { dx, dy, dw, dh };
  },

  getScaledRect(rect, scale = 1) {
    const normalizedScale = this.clamp(Number(scale) || 1, 0.1, 1);
    const dw = Math.round(rect.dw * normalizedScale);
    const dh = Math.round(rect.dh * normalizedScale);
    const dx = Math.round(rect.dx + (rect.dw - dw) / 2);
    const dy = Math.round(rect.dy + (rect.dh - dh) / 2);
    return { dx, dy, dw, dh };
  },

  getCameraRect(w, h, options = {}) {
    if (this.currentLayout === "face_only") {
      return { dx: 0, dy: 0, dw: w, dh: h };
    }

    const size = this.camSize;
    let dw;
    let dh;

    if (options.fullWidth) {
      dw = w;
      dh = Math.round(h * 0.5 * size);
    } else if (this.cameraShape === "circle") {
      dw = Math.round(w * 0.3 * size);
      dh = dw;
    } else {
      dw = Math.round(w * 0.4 * size);
      dh = Math.round((dw * 2) / 3);
    }

    const centerX = (this.cameraPlacement?.x ?? 0.5) * w;
    const centerY = (this.cameraPlacement?.y ?? 0.9) * h;
    const maxLeft = Math.max(0, w - dw);
    const maxTop = Math.max(0, h - dh);
    const dx = this.clamp(Math.round(centerX - dw / 2), 0, maxLeft);
    const dy = this.clamp(Math.round(centerY - dh / 2), 0, maxTop);

    return { dx, dy, dw, dh };
  },

  setBgRemoval(enabled) {
    this.bgRemoval = enabled;
  },

  setNoCamera(enabled) {
    this.noCamera = enabled;
  },

  addClickAnim(x, y, type) {
    const durations = {
      pulse: 600,
      rings: 800,
      spark: 500,
      target: 500,
      glow: 700,
    };
    this.clickAnims.push({
      x,
      y,
      type,
      start: performance.now(),
      duration: durations[type] || 600,
    });
  },

  drawClickAnims(ctx) {
    const now = performance.now();
    this.clickAnims = this.clickAnims.filter((a) => now - a.start < a.duration);

    for (const a of this.clickAnims) {
      const p = (now - a.start) / a.duration;
      ctx.save();
      if (a.type === "pulse") {
        const r = 20 + p * 60;
        const alpha = 1 - p;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
        ctx.lineWidth = 3 - p * 2;
        ctx.stroke();
      } else if (a.type === "rings") {
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
      } else if (a.type === "spark") {
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
      } else if (a.type === "target") {
        const scale =
          p < 0.4
            ? 2 - (p / 0.4) * 1.1
            : p < 0.6
              ? 0.9 + ((p - 0.4) / 0.2) * 0.15
              : 1.05 - ((p - 0.6) / 0.4) * 0.05;
        const alpha = p < 0.6 ? Math.min(1, p / 0.2) : 1 - (p - 0.6) / 0.4;
        const size = 50 * scale;
        const r = 4;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(a.x - size / 2, a.y - size / 2, size, size, r);
        ctx.stroke();
      } else if (a.type === "glow") {
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
    this.currentLayout =
      layout === "face_only" ? "face_only" : "full_background";
  },

  setCamPosition(pos) {
    const x = pos === "left" ? 0.22 : pos === "right" ? 0.78 : 0.5;
    this.setCameraPlacement({ x, y: this.cameraPlacement?.y ?? 0.9 });
  },

  setCamSize(value) {
    this.camSize = Math.max(0.5, Math.min(2.0, value));
  },

  setShape(shape) {
    this.cameraShape = shape;
  },

  setCameraPlacement(placement) {
    const nextX = Number.isFinite(placement?.x) ? placement.x : 0.5;
    const nextY = Number.isFinite(placement?.y) ? placement.y : 0.9;
    this.cameraPlacement = {
      x: this.clamp(nextX, 0, 1),
      y: this.clamp(nextY, 0, 1),
    };
  },

  getStream(fps = 30) {
    return this.canvas.captureStream(fps);
  },
};

if (typeof module === "object" && module.exports) {
  module.exports = Canvas;
}
