# Face Fitness Android — Play 출시 준비

패키지 `kr.co.kinelo.facefitness`, versionCode 1 / versionName 1.0.0.
계정, 결제, 약관 동의, 제출은 소유자가 Play Console에서 직접 한다.

## 1. 업로드 키와 서명된 번들

업로드 키는 소유자가 한 번만 만든다. 비밀번호는 직접 입력하고 저장소에 넣지 않는다.

```bash
keytool -genkeypair -v -keystore ~/keys/face-fitness-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

`~/.gradle/gradle.properties`(저장소 밖)에 다음 값을 넣는다.

```properties
FACE_FITNESS_UPLOAD_STORE_FILE=/Users/<you>/keys/face-fitness-upload.jks
FACE_FITNESS_UPLOAD_STORE_PASSWORD=...
FACE_FITNESS_UPLOAD_KEY_ALIAS=upload
FACE_FITNESS_UPLOAD_KEY_PASSWORD=...
```

```bash
cd android && ./gradlew :app:bundleRelease
# app/build/outputs/bundle/release/app-release.aab (약 30 MB, 얼굴 모델 포함)
```

네 값이 모두 있으면 서명된 번들이 나오고, 없으면 서명되지 않은 번들이 나온다. Play App Signing을 켠다.

## 2. 네트워크 권한을 뺀 이유

MediaPipe(`tasks-core`)에는 Google datatransport 사용 통계 라이브러리가 딸려 온다.
이 라이브러리가 `INTERNET`과 `ACCESS_NETWORK_STATE` 권한을 병합 매니페스트에 넣는다.

이 앱은 모델을 번들에 넣었고 서버 기능이 없어서 네트워크가 필요 없다.
그래서 두 권한을 매니페스트에서 제거했다(`tools:node="remove"`).

결과:
- release 번들에 남은 사용자 권한은 `CAMERA` 하나다.
- 사용 통계를 포함해 어떤 데이터도 기기 밖으로 나갈 수 없다.
- 권한이 없을 때 통계 전송이 조용히 실패하는지는 실기기에서 확인해야 한다. 에뮬레이터에서는 MediaPipe가 CPU 문제로 돌지 않는다.

## 3. Data safety 답변 초안

| 질문 | 답 |
|---|---|
| 필수 데이터 유형을 수집하거나 공유하나요? | **아니요** |

근거:
- 카메라 영상은 기기 안에서만 MediaPipe로 처리하고 저장하지 않는다.
- 연습 기록은 앱 내부 저장소에만 둔다.
- 백업은 끈다(`allowBackup=false`, data extraction rules로 제외).
- 네트워크 권한이 없다.
- 분석·광고·크래시 SDK가 없다.

"수집하지 않음"으로 답하면 전송 암호화와 삭제 요청 항목은 나오지 않는다.

## 4. App content 나머지 항목

- **Privacy policy URL:** `https://face-fitness.vercel.app/privacy.html`
  - 페이지는 PR #18에서 추가했다. 머지해서 Vercel에 배포된 뒤에 Play Console에 입력한다.
  - Android 앱의 처리 방식이 들어 있다: 카메라는 기기 안에서만 처리, 기록은 기기에만 저장, 네트워크 권한 없음.
- **App access:** 로그인 없이 모든 기능을 쓸 수 있다.
- **Ads:** 없음.
- **Content rating:** 설문을 소유자가 작성한다(사용자 간 상호작용 없음).
- **Target audience:** 소유자가 정한다. 의료 효과를 주장하는 문구는 피한다.
- **Health apps declaration:** 표정 근육 운동과 연습 기록이다. 진단, 평가 점수, 치료 기능이 없다는 점을 일관되게 적는다.

## 5. 비공개 테스트 → 프로덕션

개인 개발자 계정은 테스터 12명 이상이 14일 연속 참여한 비공개 테스트가 있어야 프로덕션을 신청할 수 있다.

1. 내부 테스트 트랙에 서명된 번들을 올린다.
2. 실기기에서 얼굴 인식, 횟수 세기, 기록 저장을 확인한다. 에뮬레이터에서는 확인하지 못했다.
3. 비공개 테스트 트랙에 테스터 12명 이상을 초대한다.
4. 14일 뒤 프로덕션 접근을 신청한다.
