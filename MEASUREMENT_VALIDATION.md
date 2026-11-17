# Anatomical sides and measurement validation

## What changed

Measurement definition: `anatomical-movement-v2.1-pose-hold`. L/R always means the subject's own anatomical left/right. The preview is mirrored for familiarity; CSS never flips inference input. The canonical topology is [MediaPipe FaceMesh connections](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/face_mesh_connections.py): left eye 263/362 and eyebrow 296/334; right eye 33/133 and eyebrow 66/105. Mouth corners 291/61, cheek 345/116 and upper-lip distances 328–267/94–37 follow those respective sides.

The eye monitor displays `clamp((neutral EAR - current EAR) / neutral EAR, 0, 1) * 100`. Neutral/opening is zero, decreasing eye aperture increases the value. This is NOT an orbicularis EMG measurement. A zero, missing or invalid baseline is unavailable, not a measured zero. Remaining bars retain session-peak/fixed-floor scaling and must not be used to compare people or days.

The assessment screen now has **반복 측정용 원시 변화량**. Signed brow/corner displacement is divided by the baseline, aspect-correct outer-eye distance (33 to 263), independent of session peaks. Positive means up. EAR keeps the existing normalized-image-coordinate definition, not a newly calibrated clinical measure. The readout adds no persistence or network traffic. Use `?demo=1` for no-persistence QA; normal assessment mode retains its existing image/history behavior.

## Head-angle safety hold (v2.1)

A live exploratory check of the first candidate exposed angle-to-expression mixing: the user reported that head orientation changed the movement display, and some changing-pose samples remained eligible. That candidate is NOT accepted for accuracy or production. No personal images, landmarks or measured participant values are included in this repository.

The projection is still **2D similarity alignment, not full 3D pose correction**. Instead of claiming to correct yaw/pitch, the updated candidate conservatively rejects a relative nose-position change over 0.04 outer-eye distances, outer-eye depth-difference change over 0.08, or nose-to-eye depth change over 0.02. These are unvalidated engineering proxy limits, **not degrees or clinical bounds**. The first reference remains user-established and does not verify absolute frontality. Smaller rotations, inference bias and expression-induced changes may still affect readings or cause rejection; these require real-face testing.

The live host now requires outer-eye and nose depth values rather than silently skipping depth checks. Missing depth, relative angle drift or stale tracking clears values on both monitors and blocks measurement. The generic geometry helper can still perform explicitly depth-optional 2D projection for non-live use. A relative nose-depth proxy adds pitch rejection even when 2D nose position barely changes. Reference schema 2 is in-memory only.

Current candidate definition is distinct from the initial v2 candidate, so the history reader does not connect different definitions. This change does not rewrite old records, estimate absolute head angles, certify facial movements or establish a clinical accuracy percentage. The updated candidate remains Draft pending real-device retesting. The pre-merge synthetic suite had 435 passing tests, including six-degree *invented 3D rotations*, missing-depth and both-monitor clearing checks; this does not establish a six-degree real-world cutoff.

## Storage compatibility

- New device-local assessments have `measurement_features.schema_version = 2` plus `measurement_definition` including version, anatomical convention, units and `clinical_validated: false`.
- Existing records are **not rewritten or automatically swapped**. They are displayed as old/unconfirmed definitions. Trends and before/after comparisons include current-definition records only.
- Latest main (PR #12, `df54f75`) disables assessment server persistence entirely: the previously targeted table does not exist. This merge preserves that local-only policy, performs no assessment cloud/context/RPC call and does not restore a legacy fallback. Exercise history sync remains exercise-only. No database migration is performed.
- Existing experimental scalar workout scores are NOT validated or redefined here. The historical score used image-left, previously mislabeled L; anatomical R preserves that physical calculation. Coach-supported exercises already suppress the legacy quality score. Live form display elsewhere now observes both sides. Do not interpret workout scores as accuracy or mix them with normalized displacement.

## Automated checks (synthetic only)

Run from the repository root:

```sh
node --test tests/*.test.cjs tests/*.test.mjs movement-coach.test.mjs exercise-cloud.test.mjs
```

Independently labelled fixtures exercise left/right brow, mouth corner, cheek and eyelid movement; both monitor instances; coach semantics; eye closure at 0/25/50/75/100%; image translation/scale/roll and five repeated trials; missing/invalid inputs; stale readout clearing; metadata; old/new comparison isolation; and preserving main's device-local assessment policy with zero assessment cloud/context calls. Synthetic model output is not real-camera accuracy evidence.

## Real-device protocol, full validation not yet performed

### Setup

1. Use the intended presentation phone/browser first. Open `?demo=1`, allow camera and keep this tab active. Record device, OS/browser, date, lighting, camera height/distance and measurement version, without identifying the participant.
2. Begin frontal at eye level with a relaxed expression. The first accepted reference does NOT establish true 3-D frontality automatically. Wait for the 45-frame baseline, then open the raw-change readout.
3. Point to your own left and right without occluding the eye/face to establish the side convention with an observer. Reframe if setup changed. Do not cover half the face as a substitute for moving one side: occlusion can invalidate the tracker.

### First functional run

- **Neutral:** 10 seconds relaxed. Record readout range and unexpected bar/warning events.
- **Left wink / right wink:** five trials each. Hold 3 seconds, relax 3 seconds. The correct side's raw EAR decreases and closure increases; the opposite side should remain near its own neutral. Record genuine co-movement separately, not automatically as a software error.
- **Brow raise:** five comfortable trials, 3 seconds on / 3 seconds neutral. Observe positive signed brow displacement. A unilateral trial is useful only if the participant can actually isolate that side.
- **Smile:** five comfortable trials, same timing. Observe upward corner displacement; do not assume perfect biological symmetry.
- **Pose/no-face:** move out of frame, change distance/tilt, and briefly background the page. Measurements must clear on rejection/staleness, assessment/workout must stop safely, and values must not masquerade as live data. Return to frontal, reframe deliberately if necessary.
- Repeat the sequence after a fresh baseline, then on another day/device. Change one factor (light, distance, angle) at a time. Engineering guards are not validated pose-tolerance limits.

For each trial record: task, intended anatomical side, observer-confirmed actual movement/side, baseline epoch, normalized L/R peak, neutral range, valid/total frames, latency if measurable, and rejection reason. **Do not count instructed movement as observed ground truth.** Keep consented videos, if needed for independent annotation, outside app storage with an explicit retention policy; this readout does not record videos or export a dataset.

### Outcomes and limits

- Side agreement: matched side / observer-confirmed, scorable unilateral trials. Report excluded/rejected trials separately.
- False positives: predefined neutral windows incorrectly flagged / all neutral windows. Choose the flag rule before measuring; do not tune and test on the same subjects.
- Tracking coverage: valid frames / all attempted frames, with rejection reasons. Latency requires synchronized video/events, not wall-clock impressions.
- Repeatability: within-condition normalized displacement range and standard deviation across the five trials. CV is not meaningful when the mean is near zero. Repeat after rebaselining and across sessions; a small repeatability error does not establish accuracy.
- For positional accuracy, compare to independently annotated, consented source frames, with a consistent anatomical side/coordinate convention and annotator repeatability. Report error distributions/agreement, not just correlation. Split algorithm tuning data from held-out evaluation.
- To claim muscle activation, force, clinical asymmetry or diagnosis requires a separate validity study with appropriate reference measurements (for example carefully designed sEMG with cross-talk limitations). No such claim or result follows from these tests. A pilot with a few volunteers checks workflow; it is not a clinical validation sample-size justification.

No human/device acceptance thresholds or clinical accuracy percentages are established in this change. A real-device run and independent annotations remain required before marking that validation complete.

## Latest main integration

Merged main `df54f75` (PR #12) into this candidate without restoring any assessment server write, context/RPC request or legacy-table fallback. The complete merged synthetic suite passes 436 tests; an independent read-only focused review passes 116 tests with no blockers. These checks do not clear the real-face head-angle hold. The candidate remains Draft until the updated live behavior is retested.

## Experimental head-local metric mode, not accepted for release

The resumed real-camera check confirmed that a held head turn clears values and disables starts, but the user then reported blocking while frontal. The v2.1 guard is therefore **not accepted** for production. A single raw nose-depth difference is not an adequate replacement for pose/expression separation. No private participant media, landmarks or numeric results are published here.

An isolated alternative is available only with `?demo=1&metricQA=1` (both the demo isolation and the opt-in flag are required). Normal/persistent mode is unchanged. This candidate enables the existing MediaPipe `enableFaceGeometry` output, with `refineLandmarks:false` to avoid refined/iris landmark-count ambiguity. A camera-free probe using the repository's synthetic face artwork confirmed the exact CDN runtime produces 468 landmarks, one VERTEX_PT mesh with 2340 floats, and a 4x4 column-major pose matrix. This checks SDK compatibility, not real-face accuracy.

Contract: [FaceMesh types](https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/index.d.ts), [official geometry pipeline](https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/libs/geometry_pipeline.cc), and [FaceGeometry proto](https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/protos/face_geometry.proto). The runtime mesh XYZ has already been transformed back to face-local/canonical alignment. It must **not** be inverse-transformed a second time. The separate matrix describes uniform scale, rotation and translation from canonical to runtime pose.

The adapter validates vertex type/stride/count/finiteness and matrix layout/shape/finiteness/uniform scale/orthogonality/positive determinant. It accepts 468–478 vertices, analyzes the common first468 and requires exactly one raw face and one geometry entry. Missing or malformed geometry clears output; there is no silent fallback to screen-space measurements. Raw image bounds, size and in-plane roll are still checked. Drawing remains on the original raw landmarks; both numeric measurement and coach consume only the corrected analysis points.

Head-local XYZ is centered and normalized by the outer-eye distance, then mapped to a fixed reference image scale for compatibility with the experimental display units. Positive movement and anatomical sides remain explicit. The separate pose matrix quaternion provides an **estimated relative rotation** guard at20 degrees; this is an engineering parameter, not a real-world or clinical20-degree guarantee. During the45-frame neutral baseline, sign-equivalent quaternions are averaged rather than locking orientation to the first frame alone. Reframing clears all in-memory geometry/reference state.

Definition is `anatomical-movement-v3-metric-face`; it is not compared with v2.1 records. This experimental mode is demo-only, so it does not create persistent assessment records. Its displays, existing scores and model outputs are still unvalidated proxies, not EMG, force, normality, diagnosis or proof that pitch/yaw have no residual influence. The old strict path is retained only for comparison while the whole PR remains Draft.

Tests cover row/column matrix layouts, scale/translation removal, malformed/reflected/sheared transforms, invalid vertex buffers, no double inverse, accepted-pose movement invariance, retained unilateral expression, old raw nose-depth jitter not vetoing valid metric geometry, large relative-rotation rejection, no fallback, demo-only activation, shared coach analysis data and reframing. Full synthetic suite:464 passing at implementation time. Real neutral/turn/return, wink/brow/smile and intended-phone retesting remain required before changing the default or releasing.
