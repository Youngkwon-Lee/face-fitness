# App Review notes — Face Fitness 1.0

Face Fitness is a native SwiftUI app for guided facial movement practice and device-local workout history. It is not a WebView wrapper. The legacy web prototype is not included in this binary.

No account or login is required. No demo credentials, server setup, external hardware, purchase, subscription, or location permission is needed. The front camera is optional; every routine works with the bundled instruction illustrations if camera permission is denied or a camera is unavailable.

## Steps to review

1. Read the first-use information and tap 시작하기 (Get started).
2. In 운동 (Practice), open 가볍게 시작하기 (Basic routine).
3. Choose an instruction duration and tap 이 루틴 시작하기 (Start this routine).
4. Tap 안내 시작 (Start guidance). 잠깐 쉬기 pauses the timer; 이어서 하기 resumes it. Use 거울 켜기 (Turn on mirror) to optionally view the front-camera preview and live face mesh on supported devices. Voice guidance is enabled by default, can be toggled on the workout screen, and has an explicit replay button.
5. Tap 여기까지 기록하기 (Finish here) at any time, then 기록 저장 (Save record). Partial sessions are explicitly marked as such. A completed timer does not certify that a movement was performed or performed correctly.
6. Open 기록 (History) to view the saved entry. Swipe a row to delete it, or open 설정 (Settings) → 모든 운동 기록 삭제 to delete all entries after confirmation.
7. The privacy policy and help are available in Settings. Switching apps or locking the screen pauses practice and stops the camera; the user explicitly resumes on return.

## Data and health boundaries

- No health measurements, asymmetry/normality classifications, muscle activation/strength scores, diagnoses, prescriptions, or treatment/cosmetic outcome claims.
- The optional camera uses Apple ARKit on supported devices to render a face mesh and estimate expression/relaxation cycles during running guidance. This is an engineering heuristic, not a clinically validated count, exercise verification, identity recognition, diagnostic or accuracy score. Natural blinks may count; vowel identities are not recognized. Face loss, pause and background transitions break pending cycles. No images, video, depth, mesh geometry or blend-shape coefficients are stored, transmitted or logged. Unsupported devices retain a preview-only mirror. The microphone and photo library are not used.
- Workout date, selected routine/movement names, active practice duration and timer-completed step count and optional per-movement estimated cycle totals are stored only in the app sandbox with iOS file protection, excluded from backups. There is no developer-operated backend or third-party SDK in this binary.
- Local defaults hold first-use acknowledgement and voice preference. The privacy manifest declares UserDefaults (CA92.1) and system uptime (35F9.1) for local preferences and foreground elapsed-time measurement respectively.
- System frameworks used: SwiftUI/UIKit, AVFoundation for camera preview and system speech, ARKit/SceneKit for local face tracking and wireframe rendering, Foundation. No external authentication, payment, AI, analytics, advertising or data-provider service.
- The support link opens the developer's public GitHub issue tracker in the browser, only at the user's request; the app instructs users not to post sensitive information there.

Before submission: attach accurate screenshots from the final candidate, confirm public privacy/support URLs, and provide the account owner's real review-contact details. Do not claim physical-device acceptance or App Store approval from simulator evidence.
