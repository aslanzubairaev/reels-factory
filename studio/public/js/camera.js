/**
 * Camera module — manages camera and microphone streams
 */
const Camera = {
  stream: null,
  videoElement: null,
  currentDevices: { video: null, audio: null },

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

  async start(videoDeviceId, audioDeviceId, quality) {
    const constraints = {
      video: {
        deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
        width: { ideal: quality === '1080p' ? 1920 : 1280 },
        height: { ideal: quality === '1080p' ? 1080 : 720 },
        frameRate: { ideal: 30 }
      },
      audio: {
        deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true
      }
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    if (this.videoElement) {
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
    }

    return this.stream;
  },

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  },

  getVideoTrack() {
    return this.stream?.getVideoTracks()[0] || null;
  },

  getAudioTrack() {
    return this.stream?.getAudioTracks()[0] || null;
  }
};
