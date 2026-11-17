# Face Fitness native iOS delivery

## Accepted scope and ownership

2026-11-17: SwiftUI facial movement practice and device-local history, with no unvalidated assessment, diagnosis, normal ranges, muscle activation/strength/accuracy scores or prescriptions. The user authorized physical iPhone testing, distribution signing and upload. After testing the first mirror-only build, the user requested audible guidance, a face mesh and movement counting. Build 2 adds those features with explicitly estimated counts. App Review submission and public release are not authorized by this upload request.

- Repository: Youngkwon-Lee/face-fitness. Main verified at df54f7530eccd562395c3535bf63032b1a83d016 at the final upload/push boundary.
- Branch: codex/native-ios-20261117; Draft PR https://github.com/Youngkwon-Lee/face-fitness/pull/13.
- Production app source: 03d676f51583b476cbce4d8495aefc89ef74b8f2. Subsequent changes are submission/evidence documentation and an XCTest-only voice preference/comment; native archive inputs are unchanged.
- Native ownership: ios/, docs/app-store/, README and this note. Existing web files and the separate anatomical-sides PR #11/worktree were preserved.
- Attended MacBook, pinned Xcode 27.2 / iOS 27.2 SDK; iOS/iPadOS 17+. No CI routing, DB, scheduler, Mission Control admission or other app mutation.
- Reused scratch: this chat's work/facefitness-native. Deliverables/evidence: this chat's outputs/facefitness-native.

## Product and data contract

Three tabs: 운동 / 기록 / 설정. Three routines and five comfortable movements, selectable instruction time, deliberate next-step start, pause and partial finish. Native speech is on by default, with a visible switch, replay and sound check; audio-session transitions use a serial queue away from the UI thread. No background audio mode.

Camera is optional and off until explicitly enabled. Supported devices use ARKit/SceneKit for a live face wireframe and transient blend-shape signals. Unsupported devices use an AVFoundation mirror. Denied/unavailable camera leaves illustration-based practice usable. No face identity matching, raw image/video/depth/mesh/coefficient persistence, logging, transmission or photo/microphone access.

Counts are an unvalidated engineering estimate of expression/relaxation cycles during running guidance. A settled relaxed state, expression and return are required. Natural blinks can count; vowel identities are not recognized. Face loss, anchor changes, stale/invalid samples and pause break pending cycles. Counts do not determine timer completion or assess correct exercise, strength or health. The UI cautions against enlarging movement to increase counts.

Workout time excludes pauses and between-step rest. Date, routine/movement names, time, timer-completed steps and optional per-movement count totals are saved atomically with iOS file protection, excluded from backups. Old records without counts remain readable. Saves are idempotent; unreadable/future-version files are preserved. Individual/all deletion is available. No account, cloud, WebView, MediaPipe, analytics or network SDK.

Inactive/background stops camera and speech and pauses practice; explicit restart is required. Permission-dialog handling retains only the first explicit camera request. Face processing policy is disclosed before enabling, in onboarding, the embedded policy and the public policy.

## Verified candidate and tests

- Final candidate: 1.0.0 (2), kr.co.kinelo.facefitness, iPhone/iPad, SDK iphoneos27.2.
- Core: 13/13 passed on macOS at 2026-11-17 10:20:52 KST. Five cycle/noise/loss/stale/persistence cases plus eight clock/history cases. These synthetic tests do not establish real repetition accuracy.
- Final iPhone 17 Pro Max simulator: 3/3 passed, 76.226 seconds. Background/large text, camera fallback and save/relaunch/readback/delete. Final result has no runtime warnings.
- iPad Pro 13-inch (M5): camera fallback and save/relaunch/delete passed in the first final-candidate run. The background case initially failed because XCTest waited about 30 seconds for spoken-cue idleness before delivering Home, after the step had ended. It passed in a separate targeted run with the test-only voice preference disabled. No application pause assertion was weakened. Retain both the initial failure and targeted pass; do not describe the initial suite as a clean 3/3 pass.
- Initial phone permission test timed out before the native prompt was answered. The final harness explicitly waits for and denies the system camera alert; the failed run is not acceptance evidence.
- Release archive succeeded. App Store IPA strict signature, exact team/bundle/version/profile, get-task-allow=false, no device list, and archive/export Mach-O UUID match were verified. Final IPA SHA256: 3d5c010e9bf089e67aa342ff4c1216fd9119c7def0cc1d4e9d50d08e6c9298f2.

## iPhone authentication and remaining physical acceptance

The local recovery helper only read legacy PHONE_REMOTE credential/port names, while iPhoneUse 0.23.0 uses IPHONE_USE names. Add current-name support with legacy fallback, retaining exact daemon executable/owner checks, loopback-only transport and secret-free output. The helper bridge supports both environment conventions. Current accessibility trees omit an optional accessibility flag, so compact output now retains semantic controls without renumbering. Eight offline helper tests passed. Before/after files and rollback backups are retained in output evidence. No credential, native trust, browser security or Auto-Lock setting was changed.

One supported supervisor reconnect and human unlock produced authenticated drivable/actionable status and successful app installation, launch, element reads and actions. Build 1 mirror reached actual capture-active state on iPhone 12 Pro / iOS 27.0.1; the user reported the image was acceptable and requested mesh, counts and sound. No camera-on screenshot or face recording was saved.

Build 2 installation failed with CoreDevice 3002 / remote connection interrupted. Fresh status confirmed that the phone itself was absent (not_connected), not HTTP 401. One reconnect is waiting for USB/same-Wi-Fi presence; repeated reconnects were not sent. Human USB connection and unlock were requested. Do not claim build 2 is installed or its mesh, audible sound or counter is verified on hardware. After reconnection, read installed version/state before retrying installation, then test actual mesh alignment, audible cues, complete movement cycles, pause/lost-face behavior, background camera shutdown, save/relaunch and deletion of only task-created records.

VoiceOver, permission revocation, a real incoming call/lock, long-session heat/battery and offline/network inspection remain unverified. The first mirror image check and simulator tests do not cover those gates.

## App Store Connect readback

- Exact new app: Face Fitness: 얼굴 운동, Apple ID 6835675533, Korean, SKU facefitness-ios-001.
- Registered explicit bundle resource 4S4Z8427W6; seed/team ZJZ9ZD3PCU. App creation warned that user-access settings could not save, but explicitly confirmed creation with all-user access; API readback confirmed the exact record. Creation was not retried. Other apps were untouched.
- Existing local Apple Distribution identity matches certificate LRR4USXZB7 (SHA1 6EB75DDCAE35535B589F128AEF5DC46F695518B0), expires 2027-08-10. Exact App Store profile TRS7675BH7 / c2befe53-bef8-47ff-93f3-01b37c093e1c was created and installed. Existing credentials/certificates were not replaced or revoked.
- Apple server validation passed. Upload succeeded, delivery/build ID 88917cc7-63de-4fdd-ba2f-c3e3f645b29d; App Store Connect API and altool both read back version 1.0.0, build 2, processing/import state VALID, non-exempt encryption=false. Upload timestamp: 2026-11-17 12:54:34 KST. A missing resumable-state-file message preceded uploader success; final VALID readback, not that intermediate message, establishes success. No duplicate upload was attempted.
- Build 2 is linked to version 1.0.0's submission draft. State remains PREPARE_FOR_SUBMISSION and releaseType MANUAL. No App Review submission, public release, legal acceptance or tester invitation occurred.
- Name/subtitle, Korean description/keywords/promotion, copyright, Health & Fitness category and current privacy/support URLs are saved and read back.
- Policy/support at immutable source commit 03d676f returned anonymous HTTP 200 with the changed ARKit policy/support content. See docs/app-store/metadata-ko.md.
- iPhone 6.9-inch 1320x2868 and iPad 13-inch 2064x2752 opaque home screenshots were uploaded; both asset states COMPLETE with matching source checksums. They depict the unchanged actual home view; they are not fabricated mesh/count captures. Camera-on screenshots were not taken.
- Review contact, age/privacy questionnaires, price/availability and any account-owner/legal obligations remain for the submission decision. Do not claim the app is approved or fully ready for App Review while physical acceptance and required fields remain.

## Retention and next action

Retain the Draft branch/PR and final source, development archive, distribution IPA, signing/processing readbacks, test results and local-helper rollback backups. Do not delete unpublished work or the existing credentials/provisioning/daemon. Task-created simulator IDs are A77D1FC5-39DC-4289-9BFE-1EF2F8EB8FEB and 922A1697-E687-40F4-8B07-355DBF276ADF; shut down/delete only these after tests. Dispose of task-only build caches, superseded candidate copies and expired signed-upload reservations after preserving deliverables. Keep the existing phone supervisor lifecycle; release only this task's owner lease when yielding.

Next dependent action is the pending human iPhone reconnect. Independent implementation/signing/upload and draft metadata preparation have been completed; do not repeat successful builds/uploads merely to check status.

## Build 3 mesh follow-up — in progress

The iPhone was rediscovered and one supported reconnect reached ready/drivable. Installed the final build 2 development archive successfully (an earlier partial build-2 installation could not prove the final binary revision). User now confirms audible speech and repetition counting work, but reports no visible mesh. This is a known build-2 rendering defect; its VALID processing state is not evidence of a correct mesh.

The preview was attached only after ARSession began delivering frames. Build 3 configures an explicit Metal SceneKit scene with continuous rendering and attaches it before running the face-tracking session, preserving the first face-anchor creation event. The preview is mounted during the requesting state; capture still starts only after camera authorization. Camera-off/background privacy behavior and counter/speech algorithms are unchanged. Build 3 archive and physical mesh verification are in progress; no new App Review submission is authorized.
