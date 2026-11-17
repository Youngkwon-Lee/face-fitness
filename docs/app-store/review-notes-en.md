# App Review notes submitted — Face Fitness 1.0.0 (3)

Submitted 2026-11-17 23:56 KST. The text below matches the saved App Store Connect review notes. Review-contact details are excluded.

Face Fitness is a native SwiftUI app for guided facial movement practice and device-local workout history. No account or login is required.

Review steps:
1. Tap 시작하기 on first use. In 운동, open 가볍게 시작하기 and tap 이 루틴 시작하기.
2. Tap 안내 시작. 잠깐 쉬기 pauses and 이어서 하기 resumes. Each next movement starts only on request.
3. 거울 켜기 optionally enables the front camera. Supported devices display an ARKit face wireframe and estimate expression/relaxation cycles while guidance runs. Voice guidance is on by default and can be toggled or replayed.
4. 여기까지 기록하기 finishes a partial session. Tap 기록 저장, then view it in 기록. Records can be deleted individually or in 설정 after confirmation.
5. Switching apps pauses guidance and stops the camera; returning requires explicit restart.

Camera permission is optional. Illustrations and timer/history work when permission is denied or a camera is unavailable. No microphone, photo library, purchases, subscriptions, location, external hardware or demo credentials are needed.

The app does not provide diagnoses, prescriptions, health/strength/activation/accuracy scores or treatment/cosmetic outcome claims. Counts are engineering estimates, not clinically validated or proof of exercise correctness. Natural blinks may count and vowel identities are not recognized. Face loss, stale frames and pauses break pending cycles.

Images, video, depth, face geometry and blend-shape coefficients are processed transiently on device and are never stored, transmitted or logged. There is no face identity recognition. Only user-saved routine/date/time/completed-step and optional estimated-count totals are stored locally, protected and excluded from backups. No backend, advertising, analytics, tracking or third-party SDK is used. The optional support link opens the public GitHub issue tracker in the browser at user request.

Build 3 was installed on iPhone 12 Pro and the tester confirmed that the mesh is visible and follows the face. Background/return showed camera off without automatic restart. The in-app privacy policy is in 설정. All practice illustrations are bundled.
