# Face Fitness Android

Native Kotlin + Jetpack Compose port of the shipping SwiftUI iOS app (`ios/`). Same scope: three guided facial-movement routines, an optional front-camera mirror with an on-device face mesh and estimated expression-cycle counts, Korean spoken cues and device-local workout history. No accounts, network access, analytics, assessment or scores. The root HTML/JavaScript web prototype is not part of this app.

## iOS → Android mapping

| iOS | Android |
|---|---|
| `FaceFitnessCore` (catalog, `PracticeClock`, `MovementCounter`, `HistoryFile`) | `core/` — line-for-line port, same thresholds and copy; iOS unit cases ported to JUnit |
| ARKit `ARFaceAnchor.blendShapes` | MediaPipe Face Landmarker (`tasks-vision` 0.10.33), bundled `face_landmarker.task` (float16 v1, SHA-256 `64184e22…bc9ff`). Same ARKit blend-shape names: browInnerUp, browOuterUp L/R, eyeBlink L/R, mouthSmile L/R, mouthPucker, mouthFunnel, jawOpen |
| SceneKit mesh | Compose `Canvas` drawing the 478-landmark tessellation over the CameraX preview |
| `AVSpeechSynthesizer` ko-KR, 0.85 rate | `TextToSpeech` `Locale.KOREAN`, 0.85 rate, transient ducking audio focus |
| Application Support JSON, excluded from backup | `filesDir/FaceFitness/history.json` (atomic rename), `allowBackup=false` and data-extraction rules exclude cloud backup and device transfer |
| ARKit unsupported device → mirror only | Landmarker cannot start → mirror only |

The manifest declares only `CAMERA` (optional hardware). There is no `INTERNET` permission.

## Build

Requirements: JDK 17 and Android SDK Platform 36. On the shared Mac the Homebrew JDK is `/opt/homebrew/opt/openjdk@17`.

```bash
cd android
./gradlew :app:testDebugUnitTest :app:assembleDebug
./gradlew :app:installDebug   # running emulator or USB device
./gradlew :app:bundleRelease  # unsigned Play bundle; sign with the upload key
```

Application ID `kr.co.kinelo.facefitness` matches the iOS bundle ID and cannot change after the first Play upload. minSdk 28, targetSdk 36. All bundled native libraries are 16 KB page-aligned.

## Verification status (2026-11-20)

- 13/13 JVM unit tests pass (`MovementCounterTest`, `PracticeTest`, ported from the iOS suite). They are synthetic and do not establish real counting accuracy.
- Debug build installed and exercised on an API 35 arm64 emulator: welcome → routine → timed step → partial finish → save → history readback, and the camera-denied fallback. Release bundle builds with R8.
- **Not verified:** face mesh and repetition counting. On the Apple M4 Pro host the arm64 emulator advertises SVE2/SME that it cannot execute, so MediaPipe's XNNPack kernels crash with SIGILL in the emulator before the first result. The M4 has SME but no non-streaming SVE, so this is most likely an emulator CPU-feature defect rather than an app bug, but it is unproven until checked on a physical Android phone before release (mesh follows the face, counts change, camera stops on Home and does not restart by itself).
