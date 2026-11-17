# Native iOS submission preparation

## Candidate

- Project: `ios/FaceFitness.xcodeproj`; scheme: `FaceFitness`.
- Version: 1.0.0 (3); deployment: iOS/iPadOS 17+; universal iPhone/iPad.
- Registered bundle ID: `kr.co.kinelo.facefitness`, team `ZJZ9ZD3PCU`; App Store Connect app ID `6835675533`.
- SwiftUI, local Swift package, native ARKit face mesh/estimated cycle counts with AVFoundation mirror fallback; no WebView, remote SDK, MediaPipe, account, cloud DB, analytics or purchases.
- Root web prototype is retained separately and excluded from every native target.

## Local checks

Run only the checks needed for the changed candidate, with a task-owned derived-data/result directory and a dedicated simulator. Do not run xcodebuild while another workload owns the same output or simulator.

```sh
swift test --package-path ios/Packages/FaceFitnessCore --scratch-path /absolute/task-work/swift-build
xcodebuild -project ios/FaceFitness.xcodeproj -scheme FaceFitness \
  -configuration Debug -destination 'platform=iOS Simulator,id=YOUR_DEDICATED_SIMULATOR' \
  -derivedDataPath /absolute/task-work/DerivedData \
  -resultBundlePath /absolute/task-work/ui-tests.xcresult \
  -parallel-testing-enabled NO -jobs 2 CODE_SIGNING_ALLOWED=NO test
```

Core tests additionally cover cycle hysteresis, dwell time, face loss/pause/stale/invalid samples and backward-compatible count persistence. These synthetic tests do not validate real repetition accuracy. Core clock tests cover paused/background-equivalent time, step boundaries, partial records, duplicate save retries, durable deletion and preservation of unreadable/future-version histories. UI tests cover actual screens, interruption, save/relaunch/delete and large text. Synthetic evidence does not establish camera behavior on an iPhone.

## Additional real-device acceptance before App Review

The exact build 3 archive was installed on iPhone 12 Pro / iOS 27.0.1. The tester confirmed that the mesh is visible and follows the face; voice/count changes were confirmed in build 2 and their algorithms are unchanged. Returning after Home showed the camera off without automatic restart. Remaining checks below are not all completed. Do not store the tester's face/video as evidence.

- First install: onboarding precedes permissions; no camera/mic/library prompt at launch.
- Camera allow/deny/revoke: mirror orientation correct in portrait and supported iPad rotations; denial leaves practice usable. Verify camera indicator turns off after off/exit/background/interruption and never automatically restarts.
- Interrupt a running session via app switch, lock and an incoming call; time during the interruption is excluded and resume is explicit.
- Verify instruction speech, audio behavior and short/long sessions; no overheating or camera resource retention after dismissal.
- Full routine: each next step requires deliberate start; only elapsed guidance completion is reported. Partial routine saves as partial. Reopen the app and delete individual/all records.
- Dynamic Type/VoiceOver, contrast, control labels and no clipped/blocked primary action on the smallest supported phone and iPad.
- Airplane mode: bundled content and local save/read/delete work. Inspect app network behavior; no automatic connection to the old web/backend/CDNs.

## Signing / upload

The user authorized development, physical-device verification, distribution signing and upload. App Review submission and public release require a separate decision. Do not press Submit for Review, release a version, accept legal agreements, create paid services or change an existing app's identity as part of a local build.

1. In the authenticated Apple account, confirm active membership, account team, agreements, name availability and whether a matching Face Fitness app already exists. Read existing apps before creating a new record.
2. Confirm/register the matching bundle ID and assign the real team in Xcode. A local development/distribution certificate alone does not prove a matching provisioning profile or upload authority.
3. Archive the final source with the real team and intended profile. An unsigned archive is a build artifact, not an installable/submittable IPA.

```sh
xcodebuild -project ios/FaceFitness.xcodeproj -scheme FaceFitness \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath /absolute/task-work/ReleaseData \
  -archivePath /absolute/task-output/FaceFitness.xcarchive \
  DEVELOPMENT_TEAM=VERIFIED_TEAM_ID -jobs 2 archive
```

4. Validate/export using Xcode Organizer with App Store Connect distribution and the verified team. Upload only under the user's accepted upload scope. Check App Store Connect processing, export-compliance answer and exact version/build readback.
5. Before App Review submission, complete the remaining fields and obtain the user's release/submission decision on this concrete candidate.

## Submission package

- `metadata-ko.md`: Korean name/subtitle/description/keywords, category and data-label draft.
- `review-notes-en.md`: review steps, data boundaries, system/external services.
- `privacy-policy.md`, `support.md`: the public immutable URLs in `metadata-ko.md` were verified with unauthenticated GET 200 and matching content on 2026-11-17. The in-app policy is bundled. Recheck availability when entering the final App Store metadata.
- App icon: original code-drawn 1024×1024 opaque image, source `ios/render-icon.swift`; existing face guide illustrations are copied unchanged from this repository.
- iPhone and iPad screenshots must depict this final native app, not the web prototype. Do not insert fabricated records or inferred results. Simulator evidence may use a labelled QA session, separate from real-user history.
- Supply the true owner/contact, copyright, price/availability, current age-rating answers and privacy questionnaire. ‘Data Not Collected’ is the proposed answer for this no-network candidate, contingent on final behavior/SDK audit.

References checked 2026-11-17: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/), [SDK upload requirements](https://developer.apple.com/news/upcoming-requirements/), [Required reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

Current execution evidence and outstanding gates are maintained in `docs/native-ios-delivery.md`.

Current upload: 1.0.0(3), processing VALID, linked to the manual-release submission draft. Build 2 had a confirmed mesh-display defect and is superseded. App Review submission/public release have not occurred.
