# Face Fitness

The shipping candidate is the **native SwiftUI iOS app** in [`ios/`](ios/). It provides guided facial movement practice, an optional front-camera mirror with ARKit face mesh/estimated expression-cycle counts, Korean spoken guidance and device-local workout history. It contains no assessment, diagnosis, prescription, activation/strength/accuracy scores, accounts, cloud sync or analytics.

The root HTML/JavaScript files are a separate legacy web prototype. They are **not bundled in the iOS app**. Their unvalidated metrics, auth, storage and demo behavior must not be described as features of the iOS candidate. The anatomical-sides web PR remains independently owned.

## Native development

- Xcode with the current App Store SDK requirements; iOS/iPadOS 17 or later.
- Open `ios/FaceFitness.xcodeproj` and select the `FaceFitness` scheme.
- No external package download is required. `FaceFitnessCore` is a local Swift package.
- The committed Xcode project can be opened directly; if changing `ios/project.yml`, regenerate it with the existing `xcodegen generate` command inside `ios/`.
- Unit tests: `swift test --package-path ios/Packages/FaceFitnessCore` (use a task-owned scratch path on shared hosts).
- UI tests: `FaceFitnessUITests` in the Xcode scheme, using a dedicated simulator.

Submission materials and remaining gates: [`docs/app-store/submission.md`](docs/app-store/submission.md).
Scope, design, evidence and current limitations: [`docs/native-ios-delivery.md`](docs/native-ios-delivery.md).
