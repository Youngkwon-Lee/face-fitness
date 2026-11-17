import Foundation

public struct Movement: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let detail: String
    public let instructions: [String]
    public let artwork: String
}

public struct Routine: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let subtitle: String
    public let movements: [Movement]
}

public enum Catalog {
    public static let brow = Movement(id: "brow", title: "눈썹 올렸다 내리기", detail: "거울을 보며 천천히 움직여요", instructions: ["정면을 보고 편안한 표정으로 시작하세요.", "편안한 범위에서 눈썹을 천천히 올렸다 내려보세요.", "크기보다 편안한 움직임에 집중하세요."], artwork: "Brow")
    public static let eyes = Movement(id: "eyes", title: "눈 부드럽게 감았다 뜨기", detail: "세게 감지 않고 부드럽게", instructions: ["눈 주변에 힘을 빼고 정면을 보세요.", "눈을 부드럽게 감았다 천천히 떠보세요.", "눈을 꼭 감거나 손으로 누르지 마세요."], artwork: "Eyes")
    public static let smile = Movement(id: "smile", title: "작은 미소 짓기", detail: "자연스러운 표정을 살펴봐요", instructions: ["입 주변을 편안하게 두세요.", "작게 미소 지었다 편안한 표정으로 돌아오세요.", "억지로 크게 웃거나 양쪽 모양을 맞추려 하지 마세요."], artwork: "Smile")
    public static let lips = Movement(id: "lips", title: "입술 가볍게 모았다 풀기", detail: "입 주변을 천천히 움직여요", instructions: ["턱과 입 주변을 편안하게 두세요.", "입술을 가볍게 모았다 자연스럽게 풀어보세요.", "이를 악물거나 입술을 세게 누르지 마세요."], artwork: "Lips")
    public static let vowels = Movement(id: "vowels", title: "모음 입 모양 따라 하기", detail: "아 · 에 · 이 · 오 · 우", instructions: ["편안한 크기로 ‘아·에·이·오·우’ 입 모양을 만들어보세요.", "각 모양 사이에 편안한 표정으로 돌아오세요.", "입을 크게 벌리거나 끝까지 움직일 필요는 없어요."], artwork: "Vowels")
    public static let routines: [Routine] = [
        Routine(id: "daily", title: "가볍게 시작하기", subtitle: "눈썹 · 눈 · 미소", movements: [brow, eyes, smile]),
        Routine(id: "eyes", title: "눈과 눈썹 움직이기", subtitle: "두 가지 움직임을 천천히", movements: [brow, eyes]),
        Routine(id: "mouth", title: "입 주변 움직이기", subtitle: "미소 · 입술 · 모음", movements: [smile, lips, vowels])
    ]
}

/// A foreground-only practice clock. The caller supplies monotonic uptime.
/// Completion describes elapsed practice time, never movement correctness.
public struct PracticeClock: Sendable {
    public enum Phase: Equatable, Sendable { case ready, running, paused, betweenSteps, finished }
    public private(set) var phase: Phase = .ready
    public private(set) var completedSteps = 0
    public private(set) var stepElapsed: TimeInterval = 0
    public let stepCount: Int
    public let stepDuration: TimeInterval
    private var accrued: TimeInterval = 0
    private var startedAt: TimeInterval?

    public init(stepCount: Int, stepDuration: TimeInterval) {
        precondition(stepCount > 0 && stepDuration.isFinite && stepDuration > 0)
        self.stepCount = stepCount
        self.stepDuration = stepDuration
    }
    public var stepIndex: Int { min(completedSteps, stepCount - 1) }
    public var activeSeconds: TimeInterval { Double(completedSteps) * stepDuration + (phase == .finished ? 0 : stepElapsed) }
    public var remainingSeconds: Int { max(0, Int(ceil(stepDuration - stepElapsed))) }

    public mutating func start(at uptime: TimeInterval) {
        guard uptime.isFinite, [.ready, .paused, .betweenSteps].contains(phase) else { return }
        startedAt = uptime
        phase = .running
    }
    public mutating func tick(at uptime: TimeInterval) {
        guard phase == .running, uptime.isFinite, let startedAt else { return }
        stepElapsed = min(stepDuration, accrued + max(0, uptime - startedAt))
        if stepElapsed >= stepDuration {
            completedSteps += 1
            self.startedAt = nil
            accrued = 0
            stepElapsed = 0
            phase = completedSteps == stepCount ? .finished : .betweenSteps
        }
    }
    public mutating func pause(at uptime: TimeInterval) {
        guard phase == .running else { return }
        tick(at: uptime)
        guard phase == .running else { return }
        accrued = stepElapsed
        startedAt = nil
        phase = .paused
    }
}

public struct WorkoutRecord: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public let date: Date
    public let routineTitle: String
    public let movementTitles: [String]
    public let activeSeconds: Int
    public let completedSteps: Int
    public let plannedSteps: Int
    public var isComplete: Bool { completedSteps == plannedSteps }

    public init(id: UUID = UUID(), date: Date = Date(), routine: Routine, clock: PracticeClock) {
        self.id = id
        self.date = date
        routineTitle = routine.title
        movementTitles = routine.movements.map(\.title)
        activeSeconds = Int(clock.activeSeconds.rounded(.down))
        completedSteps = clock.completedSteps
        plannedSteps = clock.stepCount
    }
    public var isValid: Bool {
        date.timeIntervalSince1970.isFinite && !routineTitle.isEmpty && activeSeconds > 0 &&
        plannedSteps > 0 && completedSteps >= 0 && completedSteps <= plannedSteps &&
        movementTitles.count == plannedSteps && movementTitles.allSatisfy { !$0.isEmpty }
    }
}
