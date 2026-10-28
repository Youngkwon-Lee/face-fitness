# Face Fitness camera startup error diagnostics

This Draft branch is based on PR #6 and does not authorize production
deployment, clinical assessment, biometric recording or user-data storage.

## Known observations from 2026-10-27/28 Mac / Aside diagnosis

- The exact PR #6 Preview site permission was independently verified as
  granted. A read-only browser check confirmed secure context, available
  getUserMedia and enumerateDevices APIs, and two labeled video inputs.
- macOS lists the built-in MacBook Pro camera and an iPhone Continuity Camera.
- The previous consented camera-start attempt displayed cameraStage=error,
  after which there were zero live tracks, 0x0 video, no FaceMesh initialization
  and no callback increments.
- The pre-change app hid the actual error name and failure stage. The prior
  attempt therefore cannot be classified as an OS-level denial, unavailable
  camera, occupied device, metadata timeout, video playback or model failure.
- On PR #7's exact Preview the operator separately granted site permission.
  The Aside observation showed `video-metadata / startup-failed` and no active
  tracks or FaceMesh callbacks; crucially, **the UI was already in an error/retry
  state before the observation click**. Thus this is NOT proof of a clean
  first-start failure, nor evidence that the generic code identifies an exact
  exception. The observation tab was closed without saving images or results.

## New privacy-safe troubleshooting contract

During any separately consented start attempt, the camera button publishes
categorical, session-only DOM attributes. The user-facing hint shows the
failure stage and code:

- data-camera-failure-step: get-user-media, video-metadata, video-playback,
  prepare-ui, facemesh-init, or unknown.
- data-camera-failure-code: permission-denied, device-not-found,
  device-not-readable, device-aborted, constraints-unavailable,
  security-restriction, playback-not-supported, timeout,
  metadata-timeout, metadata-error, metadata-type-error,
  metadata-invalid-state, metadata-unclassified, model-init-failed,
  startup-failed, or readiness-module-missing (when the helper did not load).

Additional safe attributes, read from the camera button (not exported), are:

- `data-camera-attempt-count`: `0` or `1` for the current page load.
- `data-camera-retry-blocked`: `true` or `false`.
- `data-camera-stream-state`: `none` or `acquired` (last safe
  snapshot **before** any cleanup, not a current active-track guarantee).
- `data-camera-track-at-metadata`: `live`, `ended`, `none`, or `unknown`
  before the metadata wait; `data-camera-track-state` is refreshed on
  failure before stopping tracks.
- `data-camera-video-ready-at-metadata` and
  `data-camera-video-ready-state`: integer `0`–`4` or `unknown`, from the
  primary video element's standard readyState property.

The diagnostic branch permits one camera start per page load; an already
errored, initializing or completed session does not silently retry. The
disabled button requires fresh page initialization and separately authorized
operator action for another start. This is a **diagnostic safeguard**, not a
final product retry policy.

These are categorical engineering codes. They do NOT contain raw device IDs,
device names, coordinates, screenshots, video, error messages, stack traces,
health data, or clinical outcomes. No telemetry, network request, localStorage,
image snapshot or consent change is added by this patch.

## Interpreting a failure

- get-user-media / permission-denied even with site permission granted:
  check macOS System Settings > Privacy & Security > Camera for Aside and
  confirm permission is granted to the correct application.
- get-user-media / device-not-readable: check whether another camera app has
  an active capture session, the default camera is reachable, and whether the
  iPhone Continuity Camera is disconnected or competing with the built-in
  camera. Do not assume another app is certainly the cause.
- video-metadata / metadata-timeout: a stream was obtained, but the video
  element did not become ready in the expected period. Check the video event
  and device track lifecycle.
- video-metadata / metadata-type-error, metadata-invalid-state, or
  metadata-unclassified: the diagnostic guard saw an exception category that
  did not match the helper's timeout/event errors. This narrows triage but
  does **not** establish a device or browser root cause. Compare the safe
  pre-wait and pre-cleanup track/readyState categories without raw exceptions.
- video-playback / permission-denied: inspect browser playback restrictions
  separately from site device permission.
- facemesh-init / model-init-failed: inspect FaceMesh SDK loading and init
  after video is ready. The modified code clears failed initialization state
  so a subsequent authorized attempt can retry.

## Safe verification

    node --test tests/camera-readiness.test.cjs
    node --test tests/*.test.cjs tests/*.test.mjs movement-coach.test.mjs exercise-cloud.test.mjs

The regression tests use synthetic DOM/media/SDK mocks with no real camera.

Actual device test remains a **separate consented operator step**: require
correct Preview origin (new code means a new Preview origin), site permission
granted, the operator alone in the camera field of view, and **preflight
`cameraStage=idle`, `cameraAttemptCount=0`** before any click.
If the preflight state is already `error`, stop without clicking.
Inspect only sanitized permission/stage/code and the bounded state attributes
above. Immediately stop all tracks and close the temporary test tab. Do not run Phase 1/2,
record a face image, use account credentials or write local/cloud history.
A successful start is not proof of biomechanical or clinical validity.
