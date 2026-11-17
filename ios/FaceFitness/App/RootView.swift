import SwiftUI

struct RootView: View {
    @AppStorage("hasSeenWelcome.v1") private var welcomed = false
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var history: HistoryStore
    var body: some View {
        TabView {
            NavigationStack { RoutinesView() }
                .tabItem { Label("운동", systemImage: "face.smiling") }
            NavigationStack { HistoryView() }
                .tabItem { Label("기록", systemImage: "clock.arrow.circlepath") }
            NavigationStack { SettingsView() }
                .tabItem { Label("설정", systemImage: "gearshape") }
        }
        .fullScreenCover(isPresented: Binding(get: { !welcomed }, set: { if !$0 { welcomed = true } })) {
            NavigationStack { WelcomeView { welcomed = true } }
                .interactiveDismissDisabled()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { history.reload() }
        }
    }
}

struct WelcomeView: View {
    let onContinue: () -> Void
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Image("Neutral")
                    .resizable().scaledToFill()
                    .frame(height: 230).frame(maxWidth: .infinity)
                    .clipped().accessibilityHidden(true)
                Text("얼굴을 움직이는\n작은 시간")
                    .font(.largeTitle.bold())
                Text("안내를 따라 편안하게 움직이고,\n운동한 시간을 기록하세요.")
                    .font(.title3).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 18) {
                    Label("로그인 없이 바로 시작", systemImage: "person.crop.circle.badge.checkmark")
                    Label("운동 기록은 이 기기에만 저장", systemImage: "iphone")
                    Label("카메라는 원할 때만 켜는 거울", systemImage: "camera")
                }
                Text("사진·영상은 저장하거나 전송하지 않습니다. 의료적 평가·진단·처방을 제공하지 않으며, 운동 완료는 동작의 정확성을 뜻하지 않습니다.")
                    .font(.footnote).foregroundStyle(.secondary)
                NavigationLink("개인정보 처리방침 보기") { PrivacyView() }
                Button("시작하기", action: onContinue)
                    .buttonStyle(PrimaryButtonStyle()).accessibilityIdentifier("welcome.continue")
            }
            .padding(24).frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
        .background(Brand.background)
        .navigationTitle("Face Fitness").navigationBarTitleDisplayMode(.inline)
    }
}
