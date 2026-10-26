# Face Fitness assessment safety — synthetic QA adapter

Status: research-only, Draft PR. Not clinically validated or approved for production deployment.

## Safety boundaries

The assessment code previously allowed a no-frame baseline to advance, produced
completion/scoring from missing dynamic measurements, and invoked photo
capture/history persistence without a separate QA/no-save mode.

- A baseline must contain at least 20 finite, valid observed scalar frames
  during the measurement window. Countdown frames are excluded.
- Each of five dynamic tasks must independently provide at least 20 such
  frames. Missing, non-finite or skipped tests abort without scores or storage.
  Active countdown and measurement timers are cleared for retry.
- Phase 2 requires valid Phase 1, and direct finish calls cannot bypass the
  complete set of six observations.
- Assessment-related snapshot/persistence functions fail closed for an
  incomplete assessment.
- Synthetic QA switch is explicit and local-only: set
  'window.__FACE_FITNESS_SYNTH_QA__ = true' BEFORE the application script,
  on file: or localhost/127.0.0.1. It blocks startCamera, captureSnapshot,
  saveSnapshot, saveAssessToHistory, and cloudSaveAssess. Query parameters
  cannot enable it, nor can the public face-fitness.vercel.app origin.

The 20-frame threshold is an engineering integrity guard, not a validated
measure of camera quality, clinical accuracy, head pose or adherence.

## Run without camera or persistence

From this PR worktree:

    node --test tests/assessment-safety.test.cjs

The adapter extracts the actual inline assessment functions into a standalone
Node VM with invented scalar inputs, fake DOM/timers and IO-denying mocks.
It uses no camera, network, patient information, image, account, raw landmarks
or saved clinical record. It is not browser E2E validation.

The local flag is NOT permission to use a full live app with patients.
Authentication and exercise cloud-sync are other app paths. Any further
browser QA needs a genuinely uncredentialed sandbox with media, network
and persistence blocked independently of the feature flag.

## Release gates

- Review composition against existing Draft PR #1 camera, #2 exercise filters,
  and #3 movement coach. They also edit index.html; no blind merges.
- Independent logic/UX review, especially incomplete, retry and timer paths.
- Separate isolated browser fixture QA, and a consented operator camera check
  without uploading or saving images.
- Independent privacy, schema/RLS, authenticated readback and clinical
  validity review. Geometric landmark values are not EMG data.
- No review completion, merge, or production release claimed here.
