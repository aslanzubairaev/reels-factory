/**
 * Recorder module — MediaRecorder for video recording
 */
const Recorder = {
  mediaRecorder: null,
  chunks: [],
  recordedBlob: null,
  isRecording: false,
  mimeType: '',
  mode: 'continuous',  // 'continuous' | 'per_part'
  partRecordings: {},   // { partNumber: Blob }

  start(canvasStream, audioTrack, options = {}) {
    if (typeof MediaRecorder !== 'function') {
      throw new Error('MediaRecorder is not supported in this browser');
    }

    if (!canvasStream || typeof canvasStream.getVideoTracks !== 'function') {
      throw new Error('Recording stream is unavailable');
    }

    this.chunks = [];
    this.recordedBlob = null;

    // Combine canvas video + microphone audio
    const tracks = [...canvasStream.getVideoTracks()];
    if (!tracks.length) {
      throw new Error('Recording canvas did not produce a video track');
    }
    if (audioTrack) {
      tracks.push(audioTrack);
    }
    const combinedStream = new MediaStream(tracks);
    const recorderOptions = {
      videoBitsPerSecond: this.getVideoBitrate(tracks[0], options),
      audioBitsPerSecond: this.getAudioBitrate(options),
      timesliceMs: this.getTimeslice(options)
    };
    const { recorder, mimeType } = this.createStartedMediaRecorder(combinedStream, !!audioTrack, recorderOptions);

    this.mediaRecorder = recorder;
    this.mimeType = mimeType;
    this.isRecording = true;
  },

  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  },

  pause() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
    this.requestData();
    this.mediaRecorder.pause();
    this.isRecording = false;
  },

  resume() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') return;
    this.mediaRecorder.resume();
    this.isRecording = true;
  },

  hasActiveSession() {
    return !!this.mediaRecorder && this.mediaRecorder.state !== 'inactive';
  },

  hasCapturedData() {
    return this.hasActiveSession() || !!this.recordedBlob || this.chunks.length > 0;
  },

  requestData() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      return false;
    }

    if (typeof this.mediaRecorder.requestData !== 'function') {
      return false;
    }

    try {
      this.mediaRecorder.requestData();
      return true;
    } catch (e) {
      console.warn('Failed to flush MediaRecorder data:', e);
      return false;
    }
  },

  getVideoBitrate(videoTrack, options = {}) {
    if (Number.isFinite(options.videoBitsPerSecond) && options.videoBitsPerSecond > 0) {
      return options.videoBitsPerSecond;
    }

    const settings = videoTrack?.getSettings?.() || {};
    const pixels = (settings.width || 0) * (settings.height || 0);
    if (pixels && pixels <= 1280 * 720) {
      return 20000000;
    }
    if (pixels && pixels <= 1920 * 1080) {
      return 50000000;
    }
    return 80000000;
  },

  getAudioBitrate(options = {}) {
    if (Number.isFinite(options.audioBitsPerSecond) && options.audioBitsPerSecond > 0) {
      return options.audioBitsPerSecond;
    }
    return 320000;
  },

  getTimeslice(options = {}) {
    if (Number.isFinite(options.timesliceMs) && options.timesliceMs > 0) {
      return options.timesliceMs;
    }
    return 250;
  },

  createStartedMediaRecorder(stream, hasAudio, options = {}) {
    const candidateTypes = this.getSupportedMimeTypes(hasAudio);
    let lastError = null;
    const videoBitsPerSecond = this.getVideoBitrate(null, options);
    const audioBitsPerSecond = this.getAudioBitrate(options);

    for (const mimeType of candidateTypes) {
      if (mimeType && typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(mimeType)) {
        continue;
      }

      const recorderInit = mimeType
        ? { mimeType, videoBitsPerSecond, audioBitsPerSecond }
        : { videoBitsPerSecond, audioBitsPerSecond };

      try {
        const recorder = new MediaRecorder(stream, recorderInit);
        this.attachMediaRecorderHandlers(recorder);
        recorder.start(this.getTimeslice(options));
        return {
          recorder,
          mimeType: recorder.mimeType || mimeType || 'video/webm'
        };
      } catch (e) {
        lastError = e;
        console.warn('MediaRecorder start failed with', mimeType || 'browser default', e);
      }
    }

    throw lastError || new Error('No compatible recording codec found');
  },

  attachMediaRecorderHandlers(recorder) {
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      this.recordedBlob = new Blob(this.chunks, { type: this.mimeType });
      this.isRecording = false;
      this.onStop?.(this.recordedBlob);
    };
  },

  async finalize() {
    if (this.recordedBlob) {
      return this.recordedBlob;
    }

    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      throw new Error('No recording to save');
    }

    return new Promise((resolve, reject) => {
      const previousOnStop = this.onStop;
      this.onStop = (blob) => {
        previousOnStop?.(blob);
        this.onStop = previousOnStop;
        resolve(blob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (e) {
        this.onStop = previousOnStop;
        reject(e);
      }
    });
  },

  clear() {
    this.chunks = [];
    this.recordedBlob = null;
    this.isRecording = false;
    this.mediaRecorder = null;
  },

  discard() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    this.clear();
  },

  getSupportedMimeTypes(hasAudio = false) {
    const types = hasAudio
      ? [
          'video/webm; codecs=vp9,opus',
          'video/webm; codecs=vp9',
          'video/webm; codecs=vp8,opus',
          'video/webm; codecs=vp8',
          'video/webm',
          'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
          'video/mp4; codecs="avc1.424028,mp4a.40.2"',
          'video/mp4; codecs="avc1.424028"',
          'video/mp4',
          ''
        ]
      : [
          'video/webm; codecs=vp9',
          'video/webm; codecs=vp8',
          'video/webm',
          'video/mp4; codecs="avc1.42E01E"',
          'video/mp4; codecs="avc1.424028"',
          'video/mp4',
          ''
        ];

    return [...new Set(types)];
  },

  isMP4() {
    return this.mimeType.startsWith('video/mp4');
  },

  async saveRecording(projectName, filename = '') {
    const blob = await this.finalize();
    if (!blob) throw new Error('No recording to save');

    // Save to server
    const result = await API.saveRecording(projectName, filename, blob);

    // If recorded as WebM, convert to MP4
    if (!this.isMP4() && result.file) {
      try {
        const convertResult = await API.convertRecording(projectName, result.file);
        this.clear();
        return convertResult;
      } catch (e) {
        console.warn('Conversion failed, keeping WebM:', e);
        this.clear();
        return result;
      }
    }

    this.clear();
    return result;
  },

  savePartRecording(partNumber) {
    if (this.recordedBlob) {
      this.partRecordings[partNumber] = this.recordedBlob;
    }
  },

  getPartRecording(partNumber) {
    return this.partRecordings[partNumber] || null;
  },

  // Callback when recording stops
  onStop: null
};

if (typeof module === 'object' && module.exports) {
  module.exports = Recorder;
}
