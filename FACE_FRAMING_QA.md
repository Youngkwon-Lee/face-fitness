# Face framing and feedback change

This change removes screen-position confounding with a fixed-reference, aspect-correct 2D similarity alignment before legacy feature calculation. It compensates translation, uniform image scale and modest in-plane roll while preserving the original reference image coordinate units. Raw rendering still follows the camera landmarks.

## Limits

- This is not a validated head-pose estimator, full 3D correction, muscle-activation measurement, or clinical-accuracy guarantee.
- The first accepted frame establishes the reference. Its absolute yaw/pitch frontality is NOT established automatically. The user must begin with an eye-level, frontal camera setup and neutral expression.
- Pose/scale/bounds limits are engineering heuristics. Eye-closure or mouth/brow shape is not used as a pose gate. Missing eye depth disables only the optional depth-drift check.
- A changed setup requires the explicit `정면 기준 다시 맞춤` button. No reference geometry, landmarks or images are added to persistent/cloud records by this module.

## Fail-closed behavior

Missing geometry code prevents a media request. Rejected or missing-face frames do not enter the measurement buffer. Active/incomplete assessments are invalidated; active workouts are stopped without saving a completion. A watchdog independent of incoming frame/inference completion expires readiness after 700 ms (checked every 200 ms); completion paths also recheck freshness. Stale live indicators and coach state are cleared and alignment guidance is shown. Pending sequential-start timers are cancelled and generation-guarded, including idle preparation gaps; recovery alone does not restart a stopped workout. Completed stored history is not deleted. Reframing clears only in-memory measurement state and requires a fresh baseline.

Feedback comparisons require a finite positive threshold and signed positive movement. In particular, zero or negative mouth-corner displacement cannot trigger the old negative-threshold always-on warning. The forehead HUD now describes movement, not a verified compensation diagnosis.

The generated character remains in offline guidance and icons but is hidden over active live video.

## Verification

- Pure synthetic geometry cases: translation/scale/roll invariance, retained relative expression motion, geometry/bounds/pose drift rejection, eye closure, reference immutability, invalid thresholds.
- Host synthetic cases: no-media missing-module guard, normalized analysis, incomplete-assessment/workout invalidation, no record/image/cloud writes on rejection, explicit reset, and live-overlay CSS.
- Full current synthetic suite: 398 passing tests on the local Node runtime. CI on Node 22 and Preview verification are required for the published branch.
- Real-face angle comparison, completed assessment and authenticated cloud/RLS behavior are not established by these synthetic tests. No real-face media was used as a test fixture or added to this change.
