# Face Fitness native iOS delivery

## Accepted scope

2026-11-17: Build a SwiftUI iOS app focused on facial movement practice and local workout history. Exclude unvalidated assessment, diagnosis, muscle activation/strength/accuracy scores, normal ranges and automated prescriptions. Prepare the submission candidate and materials. The user subsequently authorized physical-device testing, distribution signing and upload; App Review submission/public release remain outside that authorization. The user then requested audible guidance, a native face mesh and movement counting after testing build 1. Build 1 upload is held while build 2 adds these features; counts remain explicitly estimated, with no assessment/prescription claims.

- Repo: `Youngkwon-Lee/face-fitness`, base `df54f7530eccd562395c3535bf63032b1a83d016` (verified GitHub main).
- Branch: `codex/native-ios-20261117`. Native ownership: `ios/`, `docs/app-store/`, this note, README and scoped ignore rules. Preserve the web prototype and the separate anatomical-sides PR #11/worktree.
- Environment: attended MacBook, existing Xcode 27.2 / iOS 27.2 SDK. No remote service, DB, scheduler, CI routing or production mutation.
- Scratch: this Codex chat's `work/facefitness-native` directory, outside the repository.
- User-facing artifacts: this Codex chat's `outputs/facefitness-native` directory, outside the repository.

## Product and design

Primary task: select a short practice routine, follow its movement guide, save the time actually spent. Primary action on the opening screen: open the basic routine. Three consistent tabs: 운동 / 기록 / 설정. Initial decision groups: product purpose, primary routine, optional focused routines. Routine steps and settings live in drill-ins.

Use native NavigationStack, TabView, accessible controls, Dynamic Type and SF Symbols. Preserve the existing face illustrations without introducing treatment or cosmetic-outcome claims. Use semantic iOS surfaces and a restrained violet accent. No dashboard of inferred body metrics, generic decorative cards or forced account/camera permissions.

Empty history explains how to create the first record. Persistence failures stay visible and never report a successful save. Camera denial/unavailability offers illustration-only practice. First use explains camera processing and local storage before any permission request. Inactive/background scenes pause the session and stop capture; returning never automatically resumes exercise/camera. Paused/between-step time is excluded. Early finishes are stored as partial sessions, not completion.

First release uses a native camera mirror without landmark-based coaching. MediaPipe and the unvalidated web geometry are not bundled. This keeps the accepted exercise/history scope while avoiding a new interpretation/measurement claim. No images, video, landmarks, accounts, server sync, tracking, purchases or notifications. Local history is excluded from device/cloud backups; deletion is available in the app.

## Acceptance and evidence

- [x] Pure Swift clock/history tests: 8 passed on macOS, 2026-11-17 08:42 KST. Interruption, partial/full sessions, idempotent saves, corruption and deletion.
- [x] Simulator build and Release device archive. Final version 1.0.0 (1), SDK iphoneos27.2, development-signed using an existing local wildcard profile. `codesign --verify --deep --strict` passed; `get-task-allow=true`. This is not App Store distribution signing or an uploaded build.
- [x] Actual native simulator flow: onboarding → routine → pause/resume → partial save → relaunch/readback → privacy → confirmed deletion. Camera denial (phone) / unavailable (tablet) leaves practice usable.
- [x] Final iPhone 17 Pro Max simulator suite: 3/3 passed, 2026-11-17 09:09 KST, 74.974 seconds. Final iPad Pro 13-inch (M5) simulator suite: 3/3 passed, 09:06 KST, 78.965 seconds. Both include largest accessibility text and background pause/resume. VoiceOver and physical-device accessibility remain unverified.
- [x] Embedded privacy policy, published policy/support documents, metadata/review notes and submission checklist. Both immutable public URLs at commit `43908fa` returned unauthenticated GET 200 with their expected bodies on 2026-11-17.
- [ ] Real iPhone camera/permission/interruption/thermal acceptance: required, not replaceable by synthetic tests.
- [ ] App Store Connect app ID, membership/agreements, signing, public URLs and final screenshots: verify before upload/submission.

## Current status

Implementation and local simulator checks are complete. Final candidate contains no root web assets or remote dependencies. App Store Connect remained at its login screen on the final read; app registration, current membership/agreements and distribution provisioning remain unverified. A native request for the user to log in was left pending; no upload, review submission, legal acceptance or public release occurred.

Physical iPhone 12 Pro / iOS 27.0.1 was connected and had developer mode enabled. The supported iphone-use `/agent/status` request returned HTTP 401, so owner/drivable state could not be established. No phone UI was driven, app installed, native trust changed, face/video recorded or real-camera acceptance claimed. Restore the existing iphone-use authentication or perform the exact-candidate manual device checks before submission.

Initial iPad harness attempts stalled around OS permission handling and assumed a phone-style tab container. These runs were canceled and are not successful evidence. The final harness checks the supported camera fallback states, uses platform-independent tab locators and bounds each case to 90 seconds. Final suites above passed; unrelated web synthetic suites were not rerun because web inputs did not change.

Evidence/output root is the user-facing output directory above: final archive verification JSON, source package, App Store drafts, screenshots and passing test logs. Raw simulator screenshots are separate from selected store screenshots. Simulator-created history is QA timer activity, not clinical or physical-exercise evidence.

## Closeout

Draft PR: https://github.com/Youngkwon-Lee/face-fitness/pull/13. The unmerged native branch is intentionally retained for review and device/account follow-up. Both task-created simulators were shut down, deleted and read back as absent. Pre-existing simulators and the separate web worktree were preserved. Task-owned derived-data/core-build caches, detailed physical-device metadata and the superseded archive were removed; final source/archive, screenshot artifacts and passing xcresult/log evidence were retained.

## Build 2 follow-up — in progress

- Authenticated iPhoneUse 0.23.0 recovered by reading current IPHONE_USE credential/port names, preserving legacy compatibility and the verified LaunchAgent owner/executable. No credential or native trust/security settings changed. Eight offline helper checks passed. One supervisor reconnect plus human unlock produced drivable/actionable status and successful actual-app actions.
- Build 1 installed on the consenting iPhone 12 Pro / iOS 27.0.1 and its AVCapture mirror reached active state. User confirmed the image was acceptable, then requested mesh, counting and sound. No camera-on screenshot or face recording was saved.
- ASC authenticated account verified existing admin team key and signing identities. Registered exact bundle ID (resource 4S4Z8427W6, seed ZJZ9ZD3PCU) and new app Face Fitness: 얼굴 운동 (6835675533, Korean, SKU facefitness-ios-001). App creation warned user-access settings could not save but explicitly confirmed creation with all-user access; API readback confirmed the exact new app. Do not retry creation. Existing apps were untouched.
- Local distribution identity SHA1 6EB75DDCAE35535B589F128AEF5DC46F695518B0 matches ASC certificate LRR4USXZB7, expires 2027-08-10. The newer certificate has no matching local signing identity; do not use or revoke it. No upload or review submission has occurred.
- Build 2 adds ARKit face mesh and ephemeral blend shapes, explicitly estimated expression/relaxation counts, optional per-movement count totals in local history, default-on native spoken guidance with replay/voice controls. No raw face data persistence or networking. Policy/support/review notes must be republished for this changed processing before upload. Device/runtime acceptance remains pending for build 2.

- Build 2 core tests: 13/13 passed (5 cycle/persistence cases + existing 8 clock/history cases). First UI run passed background/large-text and save/relaunch/delete, but camera fallback timed out while the first permission dialog remained pending; that failed case is not acceptance evidence. Harness now explicitly waits for and denies the native camera alert. Runtime warning from synchronous audio-session activation was addressed by a serial background audio queue; final candidate checks are pending.
- First build 2 archive/export and server validation succeeded, then audio lifecycle/queue handling was refined. Those initial artifacts are superseded and must not be uploaded. Final candidate is still build 2, with no prior uploaded build number.
- The physical install attempt failed with CoreDevice 3002 / remote connection interrupted. Status now confirms not_connected (not an authentication failure); one supervisor reconnect is waiting for the device to return. Human USB connection/unlock requested. Do not send repeated reconnects or reinstall until fresh device presence/version readback.
