import SwiftUI
import FaceFitnessCore

struct HistoryView: View {
    @EnvironmentObject private var history: HistoryStore
    @State private var deleting: WorkoutRecord?
    var body: some View {
        Group {
            if history.records.isEmpty && history.error == nil {
                ContentUnavailableView("아직 운동 기록이 없어요", systemImage: "clock.arrow.circlepath", description: Text("루틴을 따라 움직인 뒤 ‘기록 저장’을 눌러보세요.\n짧게 움직인 시간도 남길 수 있어요."))
                    .accessibilityIdentifier("history.empty")
            } else {
                List {
                    if let error = history.error {
                        Section {
                            Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
                            Button("다시 읽기") { history.reload() }
                        }
                    }
                    Section {
                        ForEach(history.records) { record in
                            NavigationLink {
                                RecordDetailView(record: record)
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(alignment: .top) {
                                        Text(record.routineTitle).font(.headline)
                                        Spacer()
                                        Text("\(record.activeSeconds)초").font(.headline.monospacedDigit()).foregroundStyle(Brand.accent)
                                    }
                                    Text(record.date, format: .dateTime.year().month().day().hour().minute())
                                        .font(.subheadline).foregroundStyle(.secondary)
                                    Text(record.isComplete ? "전체 안내 완료" : "중간에 마침 · 안내 완료 \(record.completedSteps)/\(record.plannedSteps)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }.padding(.vertical, 6)
                            }
                            .swipeActions {
                                Button("삭제", role: .destructive) { deleting = record }
                            }
                            .accessibilityIdentifier("history.record")
                        }
                    } footer: {
                        Text("운동 시간만 기록합니다. 쉬는 시간은 제외되며, 얼굴 사진과 영상은 저장하지 않습니다.")
                    }
                }
            }
        }
        .navigationTitle("기록")
        .confirmationDialog("이 운동 기록을 삭제할까요?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("기록 삭제", role: .destructive) { if let deleting { history.delete(deleting) }; deleting = nil }
            Button("취소", role: .cancel) { deleting = nil }
        }
    }
}

struct RecordDetailView: View {
    let record: WorkoutRecord
    var body: some View {
        List {
            Section {
                Text(record.routineTitle).font(.title2.bold())
                LabeledContent("날짜") { Text(record.date, format: .dateTime.year().month().day().hour().minute()) }
                LabeledContent("움직인 시간", value: "\(record.activeSeconds)초")
                LabeledContent("안내 완료", value: "\(record.completedSteps) / \(record.plannedSteps) 동작")
                LabeledContent("상태", value: record.isComplete ? "전체 안내 완료" : "중간에 마침")
            }
            Section("선택한 동작") {
                ForEach(Array(record.movementTitles.enumerated()), id: \.offset) { _, title in Text(title) }
            }
            Section {
                Text("선택한 동작 목록에는 중단하여 끝내지 않은 동작도 포함됩니다. 안내 완료는 타이머가 끝났다는 뜻이며, 실제 동작 수행 여부나 정확성은 판정하지 않습니다.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }.navigationTitle("기록 상세").navigationBarTitleDisplayMode(.inline)
    }
}
