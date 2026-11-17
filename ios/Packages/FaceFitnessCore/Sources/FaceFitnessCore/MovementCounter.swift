import Foundation

/// An engineering heuristic for complete expression/relaxation cycles.
/// Thresholds are not clinical bounds, strength scores, or exercise targets.
public struct MovementCounter: Sendable {
    public private(set) var count = 0
    private enum Phase: Sendable { case waiting, armed, engaged }
    private var phase: Phase = .waiting
    private var candidateAt: TimeInterval?
    private var lastAt: TimeInterval?

    public init() {}

    /// Keep the total, but never join observations across a pause or lost face.
    public mutating func interrupt() {
        phase = .waiting
        candidateAt = nil
        lastAt = nil
    }

    public mutating func observe(signal: Double?, at time: TimeInterval) {
        guard let signal, signal.isFinite, (0...1).contains(signal), time.isFinite else { interrupt(); return }
        if let lastAt, time <= lastAt || time - lastAt > 0.5 { interrupt() }
        lastAt = time
        let relaxed = signal <= 0.18
        let expressed = signal >= 0.35
        let qualifying: Bool
        switch phase {
        case .waiting: qualifying = relaxed
        case .armed: qualifying = expressed
        case .engaged: qualifying = relaxed
        }
        guard qualifying else { candidateAt = nil; return }
        guard let began = candidateAt else { candidateAt = time; return }
        guard time - began >= 0.15 else { return }
        candidateAt = nil
        switch phase {
        case .waiting: phase = .armed
        case .armed: phase = .engaged
        case .engaged: count += 1; phase = .waiting
        }
    }
}
