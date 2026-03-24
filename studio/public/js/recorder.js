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

  start(canvasStream, audioTrack) {
    this.chunks = [];
    this.recordedBlob = null;

    // Combine canvas video + microphone audio
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioTrack) {
      tracks.push(audioTrack);
    }
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
