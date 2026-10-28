/* Public-page camera readiness helpers, without any recording or image export. */
(function attachCameraReadiness(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FaceCameraReadiness = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCameraReadiness() {
  function waitForMetadata(video, timeoutMs=8000, timers) {
    if (!video || typeof video.addEventListener !== 'function') {
      return Promise.reject(new Error('Invalid video element'));
    }
    if (video.readyState >= 1) return Promise.resolve();
    const clock = timers || { start: setTimeout, stop: clearTimeout };
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clock.stop(timer);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      const onLoaded = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Camera video metadata error')); };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
      timer = clock.start(() => { cleanup(); reject(new Error('Camera video metadata timeout')); }, timeoutMs);
      if (video.readyState >= 1) onLoaded();
    });
  }
  const ERROR_STEPS = Object.freeze(['get-user-media','video-metadata','video-playback','prepare-ui','facemesh-init']);
  const SAFE_ERROR_CODES = Object.freeze({
    NotAllowedError: 'permission-denied',
    NotFoundError: 'device-not-found',
    NotReadableError: 'device-not-readable',
    AbortError: 'device-aborted',
    OverconstrainedError: 'constraints-unavailable',
    SecurityError: 'security-restriction',
    NotSupportedError: 'playback-not-supported',
    TimeoutError: 'timeout'
  });
  // Stable, non-identifying diagnostics: never expose raw error.message,
  // device names, IDs, images or face landmark coordinates.
  function classifyStartError(error, step) {
    const safeStep = ERROR_STEPS.includes(step) ? step : 'unknown';
    const name = typeof error?.name === 'string' ? error.name : '';
    let code = Object.prototype.hasOwnProperty.call(SAFE_ERROR_CODES, name)
      ? SAFE_ERROR_CODES[name] : 'startup-failed';
    // Categorize unrecognized metadata exceptions without leaking messages.
    // Only these two exact strings come from waitForMetadata.
    if (safeStep === 'video-metadata') {
      if (name === 'Error') {
        code = error.message === 'Camera video metadata timeout'
          ? 'metadata-timeout'
          : error.message === 'Camera video metadata error'
            ? 'metadata-error' : 'metadata-unclassified';
      } else if (name === 'TypeError') {
        code = 'metadata-type-error';
      } else if (name === 'InvalidStateError') {
        code = 'metadata-invalid-state';
      } else if (code === 'startup-failed') {
        code = 'metadata-unclassified';
      }
    } else if (safeStep === 'facemesh-init' && name === 'Error') {
      code = 'model-init-failed';
    }
    return Object.freeze({code, step:safeStep});
  }
  // Only categorical stream state; never read or expose labels, IDs or frames.
  function inspectCameraState(video, stream) {
    let trackState = stream ? 'unknown' : 'none';
    if (stream && typeof stream.getVideoTracks === 'function') {
      try {
        const tracks = stream.getVideoTracks();
        if (Array.isArray(tracks)) {
          trackState = tracks.length === 0 ? 'none'
            : tracks.some(t => t && t.readyState === 'live') ? 'live'
            : tracks.every(t => t && t.readyState === 'ended') ? 'ended' : 'unknown';
        }
      } catch (_) { trackState = 'unknown'; }
    }
    const readyState = video && Number.isInteger(video.readyState) &&
      video.readyState >= 0 && video.readyState <= 4
      ? String(video.readyState) : 'unknown';
    return Object.freeze({
      stream: stream ? 'acquired' : 'none',
      track: trackState,
      videoReadyState: readyState
    });
  }
  function safeStatusFromError(error) {
    switch (error && error.name) {
      case 'NotAllowedError': return '카메라 접근 권한이 거부됐습니다. 브라우저 사이트 권한과 macOS 카메라 접근을 확인하세요.';
      case 'NotFoundError': return '카메라가 인식되지 않습니다. 카메라 연결 상태를 확인해 주세요.';
      case 'NotReadableError': return '카메라 장치를 열 수 없습니다. 다른 앱 점유 또는 macOS 카메라 접근 설정을 확인하세요.';
      case 'OverconstrainedError': return '요청한 영상 조건에 맞는 카메라가 없습니다.';
      case 'AbortError': return '카메라 시작이 중단됐습니다. 기기 연결을 확인하세요.';
      default: return '카메라 준비에 실패했습니다. 권한과 연결을 확인한 후 다시 시도해 주세요.';
    }
  }
  return { waitForMetadata, safeStatusFromError, classifyStartError, inspectCameraState };
});
