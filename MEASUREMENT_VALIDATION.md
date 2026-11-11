# Anatomical sides and measurement validation

## What changed

Measurement definition: `anatomical-movement-v2`. L/R always means the subject's own anatomical left/right. The preview is mirrored for familiarity; CSS never flips inference input. The canonical topology is [MediaPipe FaceMesh connections](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/face_mesh_connections.py): left eye 263/362 and eyebrow 296/334; right eye 33/133 and eyebrow 66/105. Mouth corners 291/61, cheek 345/116 and upper-lip distances 328–267/94–37 follow those respective sides.

The eye monitor displays `clamp((neutral EAR - current EAR) / neutral EAR, 0, 1) * 100`. Neutral/opening is zero, decreasing eye aperture increases the value. This is NOT an orbicularis EMG measurement. A zero, missing or invalid baseline is unavailable, not a measured zero. Remaining bars retain session-peak/fixed-floor scaling and must not be used to compare people or days.

The assessment screen now has **반복 측정용 원시 변화량**. Signed brow/corner displacement is divided by the baseline, aspect-correct outer-eye distance (33 to 263), independent of session peaks. Positive means up. EAR keeps the existing normalized-image-coordinate definition, not a newly calibrated clinical measure. The readout adds no persistence or network traffic. Use `?demo=1` for no-persistence QA; normal assessment mode retains its existing image/history behavior.

## Storage compatibility

- New local and modern cloud assessments have `measurement_features.schema_version = 2` plus `measurement_definition` including version, anatomical convention, units and `clinical_validated: false`.
- Existing records are **not rewritten or automatically swapped**. They are displayed as old/unconfirmed definitions. Trends and before/after comparisons include v2 records only.
- The legacy `ff_assess_sessions` table has no evidenced version column. New assessments stay saved locally if this fallback would be required; the badge explains that server measurement-version support is needed. No database migration is performed.
- Existing experimental scalar workout scores are NOT validated or redefined here. The historical score used image-left, previously mislabeled L; anatomical R preserves that physical calculation. Coach-supported exercises already suppress the legacy quality score. Live form display elsewhere now observes both sides. Do not interpret workout scores as accuracy or mix them with normalized displacement.

## Automated checks (synthetic only)

Run from the repository root:

```sh
node --test tests/*.test.cjs tests/*.test.mjs movement-coach.test.mjs exercise-cloud.test.mjs
```

Independently labelled fixtures exercise left/right brow, mouth corner, cheek and eyelid movement; both monitor instances; coach semantics; eye closure at 0/25/50/75/100%; image translation/scale/roll and five repeated trials; missing/invalid inputs; stale readout clearing; metadata; old/new comparison isolation; and blocking unversioned legacy cloud writes. Synthetic model output is not real-camera accuracy evidence.

## Real-device protocol, not yet performed for v2

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
