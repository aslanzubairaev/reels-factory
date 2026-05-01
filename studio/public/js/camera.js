/**
 * Camera module — manages camera and microphone streams.
 * Дополнительно держит AudioContext и AnalyserNode для level meter —
 * через getAudioLevel() можно получить текущий пик (0..1) и RMS (0..1).
 */
const Camera = {
  stream: null,
  videoElement: null,
  currentDevices: { video: null, audio: null },

  // Audio meter
  _audioCtx: null,
  _analyser: null,
  _audioSource: null,
  _meterBuffer: null,

  async enumerateDevices() {
    // Request permissions first to get device labels
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch (e) {
      console.warn('Could not get initial permissions:', e);
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      cameras: devices.filter(d => d.kind === 'videoinput'),
      microphones: devices.filter(d => d.kind === 'audioinput')
    };
  },

  // rawAudio=true отключает echo/noise/autoGain — нужно для качественных
  // микрофонов (петличка, USB), у которых обработка Chrome портит звук
  // («пещерный» эффект, обрезка высоких). Для встроенного мика ноутбука
  // оставляй обработку включённой (rawAudio=false, по умолчанию).
  async start(videoDeviceId, audioDeviceId, quality, rawAudio = false) {
    const audioConstraints = {
      deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined
    };
    if (rawAudio) {
      audioConstraints.echoCancellation = false;
      audioConstraints.noiseSuppression = false;
      audioConstraints.autoGainControl = false;
    } else {
      audioConstraints.echoCancellation = true;
      audioConstraints.noiseSuppression = true;
    }

    const constraints = {
      video: {
        deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
        width: { ideal: quality === '1080p' ? 1920 : 1280 },
        height: { ideal: quality === '1080p' ? 1080 : 720 },
        frameRate: { ideal: 60, max: 60 }
      },
      audio: audioConstraints
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    if (this.videoElement) {
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
    }

    this._setupAudioMeter(this.stream);

    return this.stream;
  },

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this._teardownAudioMeter();
  },

  // Подготавливает анализатор аудио: берёт аудио-трек из stream и строит граф
  // source → analyser (FFT 1024). Безопасно вызывать повторно — старый контекст
  // будет закрыт.
  _setupAudioMeter(stream) {
    this._teardownAudioMeter();
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this._audioCtx = new AudioCtx();
      const audioOnlyStream = new MediaStream([audioTrack]);
      this._audioSource = this._audioCtx.createMediaStreamSource(audioOnlyStream);
      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 1024;
      this._analyser.smoothingTimeConstant = 0.3;
      this._meterBuffer = new Float32Array(this._analyser.fftSize);
      this._audioSource.connect(this._analyser);
    } catch (e) {
      console.warn('Audio meter init failed:', e);
      this._teardownAudioMeter();
    }
  },

  _teardownAudioMeter() {
    try { this._audioSource?.disconnect(); } catch (e) {}
    try { this._audioCtx?.close(); } catch (e) {}
    this._audioSource = null;
    this._analyser = null;
    this._meterBuffer = null;
    this._audioCtx = null;
  },

  // Возвращает текущий уровень звука: { rms, peak } в диапазоне 0..1.
  // Если анализатор не готов — возвращает { rms: 0, peak: 0 }.
  getAudioLevel() {
    if (!this._analyser || !this._meterBuffer) return { rms: 0, peak: 0 };
    this._analyser.getFloatTimeDomainData(this._meterBuffer);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this._meterBuffer.length; i++) {
      const v = this._meterBuffer[i];
      sum += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sum / this._meterBuffer.length);
    return { rms, peak };
  },

  getVideoTrack() {
    return this.stream?.getVideoTracks()[0] || null;
  },

  getAudioTrack() {
    return this.stream?.getAudioTracks()[0] || null;
  }
};
