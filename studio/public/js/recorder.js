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

  start(canvasStream, audioTrack, extraAudioTrack) {
    this.chunks = [];
    this.recordedBlob = null;
    this._audioCtx = null;

    // Combine canvas video + audio (mic [+ optional screen system audio])
    const tracks = [...canvasStream.getVideoTracks()];
    const mixedAudio = this._mixAudio(audioTrack, extraAudioTrack);
    if (mixedAudio) tracks.push(mixedAudio);
    const combinedStream = new MediaStream(tracks);

    // Try MP4 first, fallback to WebM
    this.mimeType = this.getSupportedMimeType();

    try {
      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: this.mimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps
      });
    } catch (e) {
      console.warn('MediaRecorder init failed with', this.mimeType, '— falling back');
      this.mimeType = 'video/webm';
      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: this.mimeType,
        videoBitsPerSecond: 8000000
      });
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.recordedBlob = new Blob(this.chunks, { type: this.mimeType });
      this.isRecording = false;
      this.onStop?.(this.recordedBlob);
    };

    this.mediaRecorder.start(1000); // Collect data every second
    this.isRecording = true;
  },

  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch (_) {}
      this._audioCtx = null;
    }
  },

  /**
   * Возвращает один audio-track, смиксованный из микрофона + (опц.) системного
   * звука захваченного окна. Если доп. трека нет — возвращаем исходный mic track.
   */
  _mixAudio(micTrack, extraTrack) {
    if (!extraTrack) return micTrack || null;
    if (!micTrack) return extraTrack;

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._audioCtx = ctx;
      const dest = ctx.createMediaStreamDestination();

      const micSource = ctx.createMediaStreamSource(new MediaStream([micTrack]));
      micSource.connect(dest);

      const extraSource = ctx.createMediaStreamSource(new MediaStream([extraTrack]));
      extraSource.connect(dest);

      return dest.stream.getAudioTracks()[0] || micTrack;
    } catch (e) {
      console.warn('Audio mix failed, using mic only:', e);
      return micTrack;
    }
  },

  getSupportedMimeType() {
    const types = [
      'video/mp4; codecs="avc1.424028"',
      'video/mp4',
      'video/webm; codecs=vp9',
      'video/webm; codecs=vp8',
      'video/webm'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'video/webm';
  },

  isMP4() {
    return this.mimeType.startsWith('video/mp4');
  },

  async saveRecording(projectName, filename) {
    if (!this.recordedBlob) throw new Error('No recording to save');

    // Save to server
    const result = await API.saveRecording(projectName, filename, this.recordedBlob);

    // If recorded as WebM, convert to MP4
    if (!this.isMP4() && result.file) {
      try {
        const convertResult = await API.convertRecording(projectName, result.file);
        return convertResult;
      } catch (e) {
        console.warn('Conversion failed, keeping WebM:', e);
        return result;
      }
    }

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
