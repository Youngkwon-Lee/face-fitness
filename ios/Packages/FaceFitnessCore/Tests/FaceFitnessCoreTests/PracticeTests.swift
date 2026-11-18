import XCTest
@testable import FaceFitnessCore

final class PracticeTests: XCTestCase {
    func testPausedAndBetweenStepTimeNeverBecomeExerciseTime() {
        var clock = PracticeClock(stepCount: 2, stepDuration: 20)
        clock.start(at: 100)
        clock.pause(at: 107)
        clock.tick(at: 700)
        XCTAssertEqual(clock.activeSeconds, 7)
        clock.start(at: 700)
        clock.tick(at: 713)
        XCTAssertEqual(clock.phase, .betweenSteps)
        XCTAssertEqual(clock.completedSteps, 1)
        clock.tick(at: 1000)
        XCTAssertEqual(clock.activeSeconds, 20)
        clock.start(at: 1000)
        clock.tick(at: 1020)
        XCTAssertEqual(clock.phase, .finished)
        XCTAssertEqual(clock.activeSeconds, 40)
        clock.tick(at: 5000)
        XCTAssertEqual(clock.completedSteps, 2)
    }
    func testLateTimerDoesNotCreditUnstartedSteps() {
        var clock = PracticeClock(stepCount: 3, stepDuration: 20)
        clock.start(at: 10)
        clock.tick(at: 1000)
        XCTAssertEqual(clock.completedSteps, 1)
        XCTAssertEqual(clock.activeSeconds, 20)
        XCTAssertEqual(clock.phase, .betweenSteps)
    }
    func testEarlyFinishIsPartialAndZeroTimeCannotBeSaved() {
        let routine = Catalog.routines[0]
        var clock = PracticeClock(stepCount: 3, stepDuration: 20)
        XCTAssertFalse(WorkoutRecord(routine: routine, clock: clock).isValid)
        clock.start(at: 100)
        clock.pause(at: 105)
        let record = WorkoutRecord(routine: routine, clock: clock)
        XCTAssertTrue(record.isValid)
        XCTAssertFalse(record.isComplete)
        XCTAssertEqual(record.activeSeconds, 5)
        XCTAssertEqual(record.completedSteps, 0)
    }
    func testInvalidOrBackwardTimestampsDoNotAddTime() {
        var clock = PracticeClock(stepCount: 1, stepDuration: 20)
        clock.start(at: .nan)
        XCTAssertEqual(clock.phase, .ready)
        clock.start(at: 100)
        clock.tick(at: .infinity)
        clock.tick(at: 90)
        XCTAssertEqual(clock.activeSeconds, 0)
    }
    func testSaveIsDurableAndRetryDoesNotDuplicate() throws {
        try withFile { file in
            let record = makeRecord()
            XCTAssertEqual(try file.append(record), [record])
            XCTAssertEqual(try file.append(record), [record])
            XCTAssertEqual(try HistoryFile(url: file.url).load(), [record])
        }
    }
    func testCorruptHistoryIsNotOverwrittenBySaveOrSingleDelete() throws {
        try withFile { file in
            let original = Data("corrupt-history".utf8)
            try original.write(to: file.url)
            XCTAssertThrowsError(try file.append(makeRecord()))
            XCTAssertThrowsError(try file.delete(id: UUID()))
            XCTAssertEqual(try Data(contentsOf: file.url), original)
        }
    }
    func testDeleteRemovesOnlySelectedRecordAndDeleteAllIsDurable() throws {
        try withFile { file in
            let first = makeRecord(), second = makeRecord()
            try file.append(first)
            try file.append(second)
            XCTAssertEqual(try file.delete(id: first.id).map(\.id), [second.id])
            try file.deleteAll()
            XCTAssertEqual(try file.load(), [])
        }
    }
    func testUnsupportedVersionRemainsUntouched() throws {
        try withFile { file in
            let original = Data(#"{"version":99,"records":[]}"#.utf8)
            try original.write(to: file.url)
            XCTAssertThrowsError(try file.append(makeRecord()))
            XCTAssertEqual(try Data(contentsOf: file.url), original)
        }
    }
    private func makeRecord() -> WorkoutRecord {
        var clock = PracticeClock(stepCount: 3, stepDuration: 20)
        clock.start(at: 0)
        clock.pause(at: 5)
        return WorkoutRecord(routine: Catalog.routines[0], clock: clock)
    }
    private func withFile(_ test: (HistoryFile) throws -> Void) throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        try test(HistoryFile(url: folder.appendingPathComponent("history.json")))
    }
}
