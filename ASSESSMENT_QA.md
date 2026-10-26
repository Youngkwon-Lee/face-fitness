# Assessment safety QA (unvalidated engineering gates)

This branch is independent of Draft PRs #1–#3. No production rollout is authorized.

## Explicit mode

Use `?assessmentQA=1` on a separately reviewed Preview/offline fixture. This
immutable page mode blocks app camera/FaceMesh processing, snapshots, authentication
initialization/login, history reads, localStorage writes and cloud entrypoints.
It does **not** generate synthetic inputs in the real app. Camera/assessment start
remain unavailable without the independent synthetic VM fixture. Static CDN assets
can still load; this flag is not a browser/network sandbox or a malicious-script
security boundary. A missing/malformed safety helper also blocks app IO.

Outside QA mode, a complete valid assessment retains the existing snapshot and
local/cloud save behavior. Do not run a real assessment without separate informed
consent. Cloud schema, RLS and actual write/readback are not validated here.

## Fail-closed data completeness

- Phase 1 requires a finite calibrated baseline, then >=20 finite unique-time
  aggregate samples. Every dynamic task must also pass the sample gate.
- Sample timestamps must be strictly increasing, recent, and span at least half
  the task duration; gaps over 1 second are rejected. Countdown frames do not count.
- Evidence expires after 120 seconds from the actual last baseline sample, not
  a delayed UI callback; Phase 2 needs enough remaining time for all its tasks.
- Recalibrating the baseline invalidates prior static evidence. Missing tasks,
  skipped tasks, stale callbacks and invalid values cannot produce final output or
  assessment saves. Restart/failure clears prior score-driven recommendations.
- The 20-sample, gap, temporal-coverage and expiry values are conservative
  engineering gates, **not clinically validated measurement reliability**.
- QA result bodies are explicitly synthetic; no normality/diagnosis or exercise
  prescriptions are generated in that mode. Existing non-QA scoring/content are
  unchanged and unvalidated.

## Reproduce without real IO

`node --test tests/assessment-*.test.cjs`

The complete host inline script is loaded in Node VM with fake DOM, clock, SDK and
in-memory storage. No real face/landmarks, patient, account, camera or database is
used. Mock storage writes are permitted only in normal-mode compatibility tests.
The same five assertions in `assessment-regressions.test.cjs` fail against pinned
original main 8502323087eb75cf9a364d8c9c368f9262d5fa06. To compare, export its
index.html to a temporary file and set `FACE_ASSESSMENT_HOST_SOURCE` to that path
when running only that regression file. Do not use this override in normal CI.

GitHub Actions uses read-only permissions and Node 22, with PR/push tests only.
No deployment/release command is present. Vercel branch Preview may be automatic;
Preview readiness is not evidence of test-CI or clinical success.
