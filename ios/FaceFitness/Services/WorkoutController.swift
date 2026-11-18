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
    @Published private(set) var estimatedRepetitions: [String: Int] = [:]
    private var counter = MovementCounter()
    private var counterMovement: String?
    private var counterAnchor: UUID?
    var currentRepetitions: Int { estimatedRepetitions[movement.title] ?? 0 }

    init(routine: Routine, seconds: Int) {
        self.routine = routine
        clock = PracticeClock(stepCount: routine.movements.count, stepDuration: Double(seconds))
    }
    var movement: Movement { routine.movements[clock.stepIndex] }
    func start() { guard record == nil else { return }; clock.start(at: ProcessInfo.processInfo.systemUptime) }
    func pause() { clock.pause(at: ProcessInfo.processInfo.systemUptime); counter.interrupt() }
    func observe(_ observation: FaceObservation?) {
        guard record == nil, clock.phase == .running, let observation else { counter.interrupt(); return }
        if counterMovement != movement.id { counter = MovementCounter(); counterMovement = movement.id }
        if counterAnchor != observation.anchorID { counter.interrupt(); counterAnchor = observation.anchorID }
        counter.observe(signal: observation.signal(for: movement.id), at: observation.timestamp)
        if estimatedRepetitions[movement.title] != counter.count { estimatedRepetitions[movement.title] = counter.count }
    }
    func tick() {
        guard record == nil else { return }
        clock.tick(at: ProcessInfo.processInfo.systemUptime)
        if clock.phase == .finished { finish() }
    }
    func finish() {
        guard record == nil else { return }
        pause()
        record = WorkoutRecord(routine: routine, clock: clock, estimatedRepetitions: estimatedRepetitions.isEmpty ? nil : estimatedRepetitions)
    }
    func save(to history: HistoryStore) {
        guard !saved, let record else { return }
        do { try history.save(record); saved = true; saveError = nil }
        catch { saveError = "기록 저장을 확인하지 못했습니다. 이 화면에서 다시 시도할 수 있어요." }
    }
}
