import SwiftUI
import FaceFitnessCore

struct RoutinesView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("FACE FITNESS").font(.caption.weight(.semibold)).tracking(2).foregroundStyle(Brand.accent)
                    Text("오늘은 가볍게,\n얼굴을 움직여요.").font(.largeTitle.bold())
                    Text("편안한 범위에서, 나의 속도로.").foregroundStyle(.secondary)
                }
                NavigationLink(value: Catalog.routines[0]) {
                    HStack(spacing: 16) {
                        Image("Neutral").resizable().scaledToFill().frame(width: 108, height: 148).clipped().accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 12) {
                            Text("기본 루틴").font(.caption).foregroundStyle(Brand.accent)
                            Text(Catalog.routines[0].title).font(.title2.bold())
                            Text("눈썹 · 눈 · 미소\n3가지 동작").font(.subheadline).foregroundStyle(.secondary)
                            Label("루틴 보기", systemImage: "arrow.right").font(.subheadline.bold())
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Brand.surface, in: RoundedRectangle(cornerRadius: 20))
                }
                .buttonStyle(.plain).accessibilityIdentifier("routine.daily")
                VStack(alignment: .leading, spacing: 0) {
                    Text("다른 움직임").font(.headline).padding(.bottom, 10)
                    ForEach(Array(Catalog.routines.dropFirst())) { routine in
                        NavigationLink(value: routine) {
                            HStack(spacing: 14) {
                                Image(systemName: routine.id == "eyes" ? "eye" : "mouth").font(.title2).frame(width: 36).foregroundStyle(Brand.accent)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(routine.title).font(.headline)
                                    Text(routine.subtitle).font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                            }.padding(.vertical, 18).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        Divider()
                    }
                }
                Text("움직임이 불편하면 중단하세요. 치료 중이거나 얼굴 움직임에 어려움이 있다면 담당 전문가와 상의한 내용을 우선하세요.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding(24).frame(maxWidth: 600).frame(maxWidth: .infinity)
        }
        .background(Brand.background)
        .navigationTitle("운동").navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Routine.self) { RoutineDetailView(routine: $0) }
    }
}

struct RoutineDetailView: View {
    let routine: Routine
    @State private var seconds = 30
    @State private var practicing = false
    var body: some View {
        List {
            Section {
                Text(routine.title).font(.title.bold()).listRowBackground(Color.clear)
                Text("정해진 횟수나 동작 크기를 맞출 필요는 없어요.\n안내 시간은 원할 때 멈추거나 줄일 수 있습니다.")
                    .foregroundStyle(.secondary).listRowBackground(Color.clear)
            }
            Section("따라 할 동작") {
                ForEach(Array(routine.movements.enumerated()), id: \.element.id) { index, movement in
                    HStack(spacing: 14) {
                        Image(movement.artwork).resizable().scaledToFit().frame(width: 76, height: 62).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 5) {
                            Text("\(index + 1). \(movement.title)").font(.headline)
                            Text(movement.detail).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 6)
                }
            }
            Section {
                Picker("동작별 안내 시간", selection: $seconds) {
                    Text("20초").tag(20)
                    Text("30초").tag(30)
                    Text("45초").tag(45)
                }.pickerStyle(.segmented)
                Text("총 안내 시간 \(seconds * routine.movements.count)초 · 쉬는 시간은 자유롭게")
                    .font(.footnote).foregroundStyle(.secondary)
            } header: { Text("안내 시간 선택") }
            Section {
                Text("카메라를 켜지 않아도 운동할 수 있어요. 켜면 지원 기기에서 얼굴 메쉬와 추정 횟수를 보여줍니다. 동작 정확성이나 건강 상태는 평가하지 않습니다.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("루틴 안내").navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            Button("이 루틴 시작하기") { practicing = true }
                .buttonStyle(PrimaryButtonStyle()).padding().frame(maxWidth: 600).frame(maxWidth: .infinity).background(.bar)
                .accessibilityIdentifier("routine.start")
        }
        .fullScreenCover(isPresented: $practicing) {
            WorkoutView(routine: routine, seconds: seconds)
        }
    }
}
