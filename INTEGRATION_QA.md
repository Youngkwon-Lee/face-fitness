# Face Fitness integration, 2026-10-27

Status: isolated integration branch for Draft review only. No main merge
or production promotion has been approved or performed.

## Changes composed

- PR #2: exercise selection and stable filter keys
- Stacked PR #3: SVG movement coach, persistence/readback status and account isolation
- PR #1: bounded camera startup, diagnostics and failed-track cleanup
- PR #5: strict assessment sample/time/phase gates, callback freshness, no-IO QA mode

All four PR head commits were merged in a dedicated worktree. The two textual
index.html conflict regions were manually composed: frameLoop() and
renderProgressGraph().

A further semantic conflict was found in PR #3 app-improvements.js:
its window.loadFM override replaced the FaceMesh onResults callback
registered by PR #5. That replacement did not update PR #5's
faceResultSequence/timestamp/epoch; it would cause the strict callback
check to reject otherwise valid frames. The integration preserves only PR #5's
result callback and derives the coach's monotonic freshness from
faceResultSequence observed by the wrapped frame loop. A failed send() is
caught and tracking is stopped without preserving stale observations.

History integration preserves PR #3's FaceHistoryView.read() account filtering
while retaining PR #5's assessmentIOBlocked() gate. PR #3 overrides of
exercise save, cloud context/sync, history rendering, and raw local history
access explicitly fail closed in synthetic QA or missing-policy mode. The
integrated coach is not a provider of clinical accuracy or EMG measurements.

## Synthetic testing

Run on the integration branch:

    node --test tests/*.test.cjs tests/*.test.mjs movement-coach.test.mjs exercise-cloud.test.mjs

Tests use only mock camera callbacks and invented scalar features. The
integration-specific tests verify:

1. Exactly one FaceMesh callback registration and successful count increment.
2. Missing, doubled or rejected callbacks stop tracking and block assessment.
3. The SVG coach consumes only verified frame results.
4. In QA mode, PR #3's override functions cannot access localStorage or cloud.
5. Missing safety module also fails closed.
6. Both script load order and source syntax.

No real patient, image, face landmark data, auth, user history, or external
storage is used. A GitHub Actions job runs these synthetic tests independently.

## Open release gates

- On PR #5's separate Preview origin, camera permission was last observed as
  prompt, so live callback ordering is not yet confirmed on a device.
  Browser/OS permission must be explicitly granted by a consenting test user.
- Full composed integration needs an isolated Preview UI smoke (QA-only mode);
  without a specifically approved camera run, do not touch Phase 1/2 or save.
- The SDK may have browser-specific callback scheduling. The strict 1:1 check
  still requires real operator/device verification; an unsafe callback sequence
  must fail closed, not silently score.
- Clinical scoring, biometric privacy, schema/RLS and authenticated cloud
  readback are all unverified and separately gated.
- Reconciliation is not a review or approval of each original PR in isolation.
  Do not automatically merge the individual branches or deploy from Draft.
