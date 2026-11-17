import AVFoundation
import Combine
import FaceFitnessCore
import SwiftUI

struct WorkoutView: View {
    @StateObject private var workout: WorkoutController
    @StateObject private var camera = CameraModel()
    @EnvironmentObject private var history: HistoryStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("voiceCues") private var voiceCues = false
    @State private var speech = AVSpeechSynthesizer()
    @State private var confirmingExit = false
    private let ticks = Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()

    init(routine: Routine, seconds: Int) {
        _workout = StateObject(wrappedValue: WorkoutController(routine: routine, seconds: seconds))
    }
    var body: some View {
        NavigationStack {
            Group {
                if let record = workout.record { summary(record) }
                else { practice }
            }
            .background(Brand.background)
            .navigationTitle(workout.record == nil ? workout.routine.title : "운동 기록")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") {
                        if workout.saved || workout.clock.activeSeconds < 1 { dismiss() }
                        else { workout.pause(); confirmingExit = true }
                    }.accessibilityIdentifier("workout.close")
                }
            }
        }
        .interactiveDismissDisabled()
        .confirmationDialog("저장하지 않은 운동 시간이 있어요", isPresented: $confirmingExit, titleVisibility: .visible) {
            Button("기록하지 않고 나가기", role: .destructive) { dismiss() }
            Button("계속 보기", role: .cancel) {}
        }
        .onReceive(ticks) { _ in workout.tick() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active {
                workout.pause(); camera.suspend(background: phase == .background); speech.stopSpeaking(at: .immediate)
            } else { camera.completePendingPermission() }
        }
        .onChange(of: workout.clock.phase) { _, phase in
            UIApplication.shared.isIdleTimerDisabled = phase == .running && scenePhase == .active
            if phase != .running { speech.stopSpeaking(at: .immediate) }
            if phase == .running { speak(workout.movement.instructions[1]) }
        }
        .onChange(of: workout.record?.id) { _, _ in camera.stop() }
        .onDisappear {
            workout.pause(); camera.stop(); speech.stopSpeaking(at: .immediate)
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }

    private var practice: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    Text("\(workout.clock.stepIndex + 1) / \(workout.routine.movements.count) 동작").font(.subheadline.weight(.medium)).foregroundStyle(Brand.accent)
                    Spacer()
                    Text(statusText).font(.subheadline).foregroundStyle(.secondary).accessibilityIdentifier("workout.status")
                }
                ZStack {
                    Image(workout.movement.artwork).resizable().scaledToFit()
                        .frame(maxWidth: .infinity, minHeight: 190, maxHeight: 260)
                        .accessibilityLabel(workout.movement.title + " 안내 그림")
                    if camera.state == .active {
                        CameraPreview(session: camera.session).frame(height: 260).accessibilityLabel("전면 카메라 거울")
                    }
                }
                .background(Color.black).clipShape(RoundedRectangle(cornerRadius: 20))
                VStack(alignment: .leading, spacing: 10) {
                    Button(action: camera.toggle) {
                        Label(camera.state == .active || camera.state == .requesting ? "거울 끄기" : "거울 켜기", systemImage: "camera")
                            .frame(minHeight: 44)
                    }.accessibilityIdentifier("camera.toggle")
                    Text(camera.message).font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("camera.status")
                    if camera.state == .denied {
                        Button("설정에서 카메라 권한 확인") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }.font(.subheadline).frame(minHeight: 44)
                    }
                }
                Text(workout.movement.title).font(.title2.bold()).accessibilityIdentifier("workout.movement")
                ForEach(Array(workout.movement.instructions.enumerated()), id: \.offset) { index, instruction in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)").font(.subheadline.monospacedDigit()).foregroundStyle(Brand.accent).frame(width: 18)
                        Text(instruction).fixedSize(horizontal: false, vertical: true)
                    }
                }
                VStack(spacing: 8) {
                    Text(workout.clock.phase == .betweenSteps ? "쉬어가도 좋아요" : "남은 안내 시간")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Text(workout.clock.phase == .betweenSteps ? "다음 동작 준비" : "\(workout.clock.remainingSeconds)초")
                        .font(.system(.largeTitle, design: .rounded, weight: .semibold)).monospacedDigit()
                        .accessibilityIdentifier("workout.timer")
                    if workout.clock.phase != .betweenSteps {
                        ProgressView(value: workout.clock.stepElapsed, total: workout.clock.stepDuration)
                            .accessibilityLabel("안내 시간 진행")
                    }
                }.frame(maxWidth: .infinity).padding(.vertical, 8)
                Text("불편하면 바로 멈추세요. 안내 시간이나 동작 크기를 끝까지 채울 필요는 없어요.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding(24).frame(maxWidth: 600).frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 4) {
                Button(primaryTitle) {
                    if workout.clock.phase == .running { workout.pause() }
                    else { workout.start() }
                }.buttonStyle(PrimaryButtonStyle()).accessibilityIdentifier("workout.primary")
                Button("여기까지 기록하기") { workout.finish() }
                    .frame(minHeight: 44).accessibilityIdentifier("workout.finish")
            }.padding(.horizontal).padding(.top, 12).frame(maxWidth: 600).frame(maxWidth: .infinity).background(.bar)
        }
    }
    private var primaryTitle: String {
        switch workout.clock.phase {
        case .ready: "안내 시작"
        case .running: "잠깐 쉬기"
        case .paused: "이어서 하기"
        case .betweenSteps: "다음 동작 시작"
        case .finished: "운동 마치기"
        }
    }
    private var statusText: String {
        switch workout.clock.phase {
        case .ready: "준비"
        case .running: "진행 중"
        case .paused: "일시정지"
        case .betweenSteps: "휴식 중"
        case .finished: "마침"
        }
    }
    private func summary(_ record: WorkoutRecord) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Image(systemName: workout.saved ? "checkmark.circle.fill" : "bookmark")
                    .font(.system(size: 42)).foregroundStyle(Brand.accent).accessibilityHidden(true)
                Text(workout.saved ? "이 기기에 기록했어요" : "나를 위한 시간을 남겨요")
                    .font(.largeTitle.bold()).accessibilityIdentifier("summary.title")
                Text(record.routineTitle).font(.title2)
                LabeledContent("움직인 시간", value: "\(record.activeSeconds)초")
                LabeledContent("안내 시간을 마친 동작", value: "\(record.completedSteps) / \(record.plannedSteps)")
                LabeledContent("세션 상태", value: record.isComplete ? "전체 안내 완료" : "중간에 마침")
                Text("일시정지와 동작 사이 휴식은 시간에 포함하지 않습니다. 기록은 운동한 시간이며, 동작의 정확성이나 근육 상태에 대한 평가가 아닙니다.")
                    .font(.footnote).foregroundStyle(.secondary)
                if let error = workout.saveError {
                    Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).accessibilityIdentifier("summary.error")
                }
                if workout.saved {
                    Button("운동 목록으로") { dismiss() }.buttonStyle(PrimaryButtonStyle()).accessibilityIdentifier("summary.done")
                } else if record.isValid {
                    Button(workout.saveError == nil ? "기록 저장" : "저장 다시 시도") { workout.save(to: history) }
                        .buttonStyle(PrimaryButtonStyle()).accessibilityIdentifier("summary.save")
                } else {
                    Text("저장할 운동 시간이 아직 없어요.").foregroundStyle(.secondary)
                    Button("운동 목록으로") { dismiss() }.buttonStyle(PrimaryButtonStyle())
                }
            }.padding(24).frame(maxWidth: 600).frame(maxWidth: .infinity)
        }
    }
    private func speak(_ text: String) {
        guard voiceCues else { return }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
        speech.speak(utterance)
    }
}
