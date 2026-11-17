import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var history: HistoryStore
    @AppStorage("voiceCues") private var voiceCues = false
    @State private var deletingAll = false
    var body: some View {
        List {
            Section("운동 안내") {
                Toggle("음성 안내", isOn: $voiceCues)
                Text("기기의 한국어 음성으로 동작 안내를 읽어줍니다. 소리가 나오지 않으면 음량과 무음 모드를 확인해 주세요.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("개인정보와 기록") {
                NavigationLink("개인정보 처리방침") { PrivacyView() }.accessibilityIdentifier("settings.privacy")
                Text("기록은 이 기기에만 저장하며 서버와 동기화하거나 기기 백업에 포함하지 않습니다. 앱을 삭제하거나 기기를 바꾸면 복원할 수 없습니다.")
                    .font(.footnote).foregroundStyle(.secondary)
                Button("모든 운동 기록 삭제", role: .destructive) { deletingAll = true }
                    .accessibilityIdentifier("settings.deleteAll")
                if let error = history.error { Text(error).foregroundStyle(.orange) }
            }
            Section("도움말") {
                NavigationLink("앱 사용 안내") { HelpView() }
                Link("문의하기", destination: URL(string: "https://github.com/Youngkwon-Lee/face-fitness/issues")!)
                Text("문의할 때 얼굴 사진·영상이나 의료정보를 올리지 마세요.").font(.footnote).foregroundStyle(.secondary)
            }
            Section {
                LabeledContent("Face Fitness", value: version)
                Text("얼굴 움직임 연습과 개인 운동 기록을 위한 앱입니다. 의료적 평가·진단·처방 또는 치료 효과를 제공하지 않습니다.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("설정")
        .confirmationDialog("이 기기의 운동 기록을 모두 삭제할까요? 복구할 수 없습니다.", isPresented: $deletingAll, titleVisibility: .visible) {
            Button("모든 기록 삭제", role: .destructive) { history.deleteAll() }
            Button("취소", role: .cancel) {}
        }
    }
    private var version: String {
        let info = Bundle.main.infoDictionary ?? [:]
        return "\(info["CFBundleShortVersionString"] as? String ?? "—") (\(info["CFBundleVersion"] as? String ?? "—"))"
    }
}

struct PrivacyView: View {
    var body: some View {
        List {
            Section {
                Text("Face Fitness iOS 개인정보 처리방침").font(.headline)
                Text("시행일: 2026년 11월 17일").foregroundStyle(.secondary)
            }
            Section("카메라") {
                Text("운동 화면에서 사용자가 거울을 켤 때만 전면 카메라를 사용합니다. 미리보기는 기기에서만 표시합니다. 사진·영상·얼굴 특징점을 저장, 전송 또는 분석하지 않습니다. 마이크와 사진 보관함에는 접근하지 않습니다.")
                Text("거울을 끄거나 운동 화면을 닫거나 앱이 비활성화되면 카메라를 중지합니다. iOS 설정에서 카메라 권한을 철회할 수 있으며, 권한이 없어도 안내 그림으로 운동할 수 있습니다.")
            }
            Section("기기에 저장하는 정보") {
                Text("사용자가 저장한 운동 날짜, 선택한 루틴·동작 이름, 운동 시간과 안내 완료 개수를 기기에만 저장합니다. 음성 안내 설정과 첫 사용 안내 확인 여부도 기기에 저장합니다.")
                Text("로그인, 광고, 추적, 분석 SDK와 서버 동기화를 사용하지 않습니다. 앱이 이 정보를 개발자나 제3자 서버로 전송하지 않습니다. 운동 기록은 운영체제 파일 보호를 적용하고 기기·iCloud 백업에서 제외합니다.")
            }
            Section("보관과 삭제") {
                Text("운동 기록은 사용자가 삭제할 때까지 기기에 보관합니다. 기록 화면에서 개별 삭제하거나 설정에서 전체 삭제할 수 있습니다. 앱 삭제 시 앱 내부 기록도 삭제되며 다른 기기로 복원할 수 없습니다.")
            }
            Section("외부 문의") {
                Text("문의 링크를 열면 GitHub 서비스의 개인정보 처리방침이 적용됩니다. 문의 시 사용자가 직접 제출한 내용은 해당 서비스에서 처리됩니다. 얼굴 사진·영상, 진료정보 등 민감한 정보는 게시하지 마세요.")
                Link("개발자에게 문의", destination: URL(string: "https://github.com/Youngkwon-Lee/face-fitness/issues")!)
            }
            Section("적용 범위") {
                Text("이 방침은 Face Fitness 네이티브 iOS 앱 1.0에 적용됩니다. 별도의 웹 시제품에는 다른 저장·로그인 동작이 있을 수 있습니다. 개인정보 처리 방식이 바뀌면 방침과 앱스토어 공개 내용을 갱신합니다.")
            }
        }.navigationTitle("개인정보 처리방침").navigationBarTitleDisplayMode(.inline)
    }
}

struct HelpView: View {
    var body: some View {
        List {
            Section("어떻게 사용하나요?") {
                Text("1. 운동 탭에서 루틴과 동작별 안내 시간을 선택하세요.\n2. 안내 시작을 누르고 편안한 범위에서 움직여보세요.\n3. 동작 사이에는 원하는 만큼 쉬고 다음 동작을 시작하세요.\n4. 마친 뒤 기록 저장을 누르면 기록 탭에서 확인할 수 있습니다.")
            }
            Section("거울과 타이머") {
                Text("거울 켜기를 누르면 카메라 권한을 요청합니다. 카메라를 쓰지 않아도 됩니다. 통화·화면 잠금·앱 전환 중에는 타이머가 일시정지하고 카메라가 꺼집니다. 돌아온 뒤 이어서 하기를 눌러주세요.")
            }
            Section("기록은 무엇을 뜻하나요?") {
                Text("완료는 안내 시간이 끝났다는 뜻입니다. 실제 동작 수행 여부, 정확성, 근력·근활성도 또는 건강 상태를 측정하지 않습니다. 중간에 마친 세션도 운동한 시간만 저장할 수 있습니다.")
            }
            Section("편안하게 사용하세요") {
                Text("불편하거나 통증이 있으면 중단하세요. 안내 시간을 채우거나 움직임을 크게 만들려고 무리하지 마세요. 치료 중이거나 얼굴 움직임에 어려움이 있다면 담당 전문가와 상의한 내용을 우선하세요.")
            }
        }.navigationTitle("앱 사용 안내").navigationBarTitleDisplayMode(.inline)
    }
}
