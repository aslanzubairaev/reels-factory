(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.RecordingState = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PHASES = {
    IDLE: 'idle',
    RECORDING: 'recording',
    PAUSED: 'paused',
    STOPPED: 'stopped'
  };

  const EVENTS = {
    START: 'start',
    RESUME: 'resume',
    PAUSE: 'pause',
    STOP_COMPLETE: 'stop_complete',
    DISCARD: 'discard',
    SAVE_SUCCESS: 'save_success'
  };

  function normalizePhase(phase) {
    return Object.values(PHASES).includes(phase) ? phase : PHASES.IDLE;
  }

  function getFlagsForPhase(phase) {
    const normalized = normalizePhase(phase);
    return {
      recordingPhase: normalized,
      isRecording: normalized === PHASES.RECORDING,
      recordingDone: normalized === PHASES.STOPPED
    };
  }

  function transitionPhase(currentPhase, event) {
    const phase = normalizePhase(currentPhase);

    switch (event) {
      case EVENTS.START:
        return PHASES.RECORDING;
      case EVENTS.RESUME:
        return phase === PHASES.PAUSED ? PHASES.RECORDING : phase;
      case EVENTS.PAUSE:
        return phase === PHASES.RECORDING ? PHASES.PAUSED : phase;
      case EVENTS.STOP_COMPLETE:
        return phase === PHASES.RECORDING || phase === PHASES.PAUSED
          ? PHASES.STOPPED
          : phase;
      case EVENTS.DISCARD:
      case EVENTS.SAVE_SUCCESS:
        return PHASES.IDLE;
      default:
        return phase;
    }
  }

  function transitionState(currentPhase, event) {
    return getFlagsForPhase(transitionPhase(currentPhase, event));
  }

  return {
    EVENTS,
    PHASES,
    getFlagsForPhase,
    transitionPhase,
    transitionState
  };
}));
