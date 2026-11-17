import Foundation
import Combine
import FaceFitnessCore

@MainActor
final class HistoryStore: ObservableObject {
    @Published private(set) var records: [WorkoutRecord] = []
    @Published var error: String?
    private let file: HistoryFile

    init() {
        let support = URL.applicationSupportDirectory.appendingPathComponent("FaceFitness", isDirectory: true)
        // UI tests use their own file. No reset/seed flag exists in release builds.
        #if DEBUG
        let name = ProcessInfo.processInfo.arguments.contains("--ui-testing") ? "ui-test-history.json" : "history.json"
        #else
        let name = "history.json"
        #endif
        file = HistoryFile(url: support.appendingPathComponent(name))
        reload()
    }
    func reload() {
        do { records = try file.load(); error = nil }
        catch { self.error = "기록을 읽지 못했습니다. 기존 기록을 덮어쓰지 않습니다. 잠금을 해제한 뒤 다시 시도해 주세요." }
    }
    func save(_ record: WorkoutRecord) throws {
        records = try file.append(record)
        error = nil
    }
    func delete(_ record: WorkoutRecord) {
        do { records = try file.delete(id: record.id); error = nil }
        catch { self.error = "기록을 삭제하지 못했습니다. 잠금을 해제한 뒤 다시 시도해 주세요." }
    }
    func deleteAll() {
        do { try file.deleteAll(); records = []; error = nil }
        catch { self.error = "기록을 삭제하지 못했습니다. 다시 시도해 주세요." }
    }
}
