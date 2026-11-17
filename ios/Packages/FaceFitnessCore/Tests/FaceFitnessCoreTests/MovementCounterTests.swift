import XCTest
@testable import FaceFitnessCore

final class MovementCounterTests: XCTestCase {
    func testOnlyFullSettledExpressionAndRelaxationCounts() {
        var counter = MovementCounter()
        feed(&counter, 0.7, from: 0, through: 0.8)
        feed(&counter, 0.05, from: 0.9, through: 1.3)
        XCTAssertEqual(counter.count, 0, "Starting with a contracted expression is not a repetition")
        feed(&counter, 0.7, from: 1.4, through: 2.0)
        XCTAssertEqual(counter.count, 0, "Holding a movement never creates repeated counts")
        feed(&counter, 0.05, from: 2.1, through: 3.0)
        XCTAssertEqual(counter.count, 1)
    }
    func testJitterAndShortBlinkDoNotCount() {
        var counter = MovementCounter()
        feed(&counter, 0.05, from: 0, through: 0.5)
        counter.observe(signal: 0.9, at: 0.6)
        counter.observe(signal: 0.05, at: 0.7)
        for tick in 8...30 { counter.observe(signal: tick % 2 == 0 ? 0.37 : 0.3, at: Double(tick) / 10) }
        feed(&counter, 0.05, from: 3.1, through: 3.5)
        XCTAssertEqual(counter.count, 0)
    }
    func testLostFaceOrPauseCannotCompletePendingMovement() {
        for lost in [true, false] {
            var counter = MovementCounter()
            feed(&counter, 0.05, from: 0, through: 0.5)
            feed(&counter, 0.8, from: 0.6, through: 1.0)
            if lost { counter.observe(signal: nil, at: 1.1) } else { counter.interrupt() }
            feed(&counter, 0.05, from: 1.2, through: 1.8)
            XCTAssertEqual(counter.count, 0)
            feed(&counter, 0.8, from: 1.9, through: 2.3)
            feed(&counter, 0.05, from: 2.4, through: 2.8)
            XCTAssertEqual(counter.count, 1)
        }
    }
    func testStaleAndInvalidObservationsCannotJoinACycle() {
        for invalid in [Double.nan, Double.infinity, -1, 2] {
            var counter = MovementCounter()
            feed(&counter, 0.05, from: 0, through: 0.5)
            feed(&counter, 0.8, from: 0.6, through: 1.0)
            counter.observe(signal: invalid, at: 1.1)
            feed(&counter, 0.05, from: 1.2, through: 1.8)
            XCTAssertEqual(counter.count, 0)
        }
        var stale = MovementCounter()
        feed(&stale, 0.05, from: 0, through: 0.5)
        feed(&stale, 0.8, from: 0.6, through: 1.0)
        feed(&stale, 0.05, from: 2, through: 3)
        XCTAssertEqual(stale.count, 0)
    }
    func testCountsSurviveSaveAndOlderRecordsDecodeWithoutCounts() throws {
        var clock = PracticeClock(stepCount: 3, stepDuration: 20)
        clock.start(at: 0); clock.pause(at: 5)
        let record = WorkoutRecord(routine: Catalog.routines[0], clock: clock, estimatedRepetitions: [Catalog.brow.title: 2])
        let encoded = try JSONEncoder().encode(record)
        XCTAssertEqual(try JSONDecoder().decode(WorkoutRecord.self, from: encoded).estimatedRepetitions, [Catalog.brow.title: 2])
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        legacy.removeValue(forKey: "estimatedRepetitions")
        let decoded = try JSONDecoder().decode(WorkoutRecord.self, from: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertNil(decoded.estimatedRepetitions)
        XCTAssertTrue(decoded.isValid)
        XCTAssertFalse(WorkoutRecord(routine: Catalog.routines[0], clock: clock, estimatedRepetitions: ["unselected": 2]).isValid)
        XCTAssertFalse(WorkoutRecord(routine: Catalog.routines[0], clock: clock, estimatedRepetitions: [Catalog.brow.title: -1]).isValid)
    }
    private func feed(_ counter: inout MovementCounter, _ signal: Double, from start: Double, through end: Double) {
        for tick in Int((start * 10).rounded())...Int((end * 10).rounded()) { counter.observe(signal: signal, at: Double(tick) / 10) }
    }
}
