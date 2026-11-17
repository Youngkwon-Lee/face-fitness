import Foundation
import Combine
import FaceFitnessCore

@MainActor
final class WorkoutController: ObservableObject {
    let routine: Routine
    @Published private(set) var clock: PracticeClock
    @Published private(set) var record: WorkoutRecord?
    @Published private(set) var saved = false
    @Published var saveError: String?

    init(routine: Routine, seconds: Int) {
        self.routine = routine
        clock = PracticeClock(stepCount: routine.movements.count, stepDuration: Double(seconds))
    }
    var movement: Movement { routine.movements[clock.stepIndex] }
    func start() { guard record == nil else { return }; clock.start(at: ProcessInfo.processInfo.systemUptime) }
    func pause() { clock.pause(at: ProcessInfo.processInfo.systemUptime) }
    func tick() {
        guard record == nil else { return }
        clock.tick(at: ProcessInfo.processInfo.systemUptime)
        if clock.phase == .finished { finish() }
    }
    func finish() {
        guard record == nil else { return }
        pause()
        record = WorkoutRecord(routine: routine, clock: clock)
    }
    func save(to history: HistoryStore) {
        guard !saved, let record else { return }
        do { try history.save(record); saved = true; saveError = nil }
        catch { saveError = "기록 저장을 확인하지 못했습니다. 이 화면에서 다시 시도할 수 있어요." }
    }
}
