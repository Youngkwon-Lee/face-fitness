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
  function safeStatusFromError(error) {
    switch (error && error.name) {
      case 'NotAllowedError': return '카메라 권한이 필요합니다. 브라우저의 허용 버튼을 눌러 주세요.';
      case 'NotFoundError': return '카메라가 인식되지 않습니다. 카메라 연결 상태를 확인해 주세요.';
      case 'NotReadableError': return '카메라를 다른 앱이 사용 중입니다. 다른 카메라 앱을 종료해 주세요.';
      default: return '카메라 준비에 실패했습니다. 권한과 연결을 확인한 후 다시 시도해 주세요.';
    }
  }
  return { waitForMetadata, safeStatusFromError };
});
