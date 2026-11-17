import Foundation

/// Main-thread app owner serializes access. Never overwrite an unreadable file.
public struct HistoryFile {
    public enum Failure: Error { case unsupportedVersion, invalidRecord, duplicateID }
    private struct Envelope: Codable {
        let version: Int
        let records: [WorkoutRecord]
    }
    public let url: URL
    public init(url: URL) { self.url = url }

    public func load() throws -> [WorkoutRecord] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let envelope = try JSONDecoder().decode(Envelope.self, from: Data(contentsOf: url))
        guard envelope.version == 1 else { throw Failure.unsupportedVersion }
        guard envelope.records.allSatisfy(\.isValid) else { throw Failure.invalidRecord }
        guard Set(envelope.records.map(\.id)).count == envelope.records.count else { throw Failure.duplicateID }
        return envelope.records.sorted { $0.date > $1.date }
    }
    @discardableResult
    public func append(_ record: WorkoutRecord) throws -> [WorkoutRecord] {
        guard record.isValid else { throw Failure.invalidRecord }
        var records = try load()
        if let existing = records.first(where: { $0.id == record.id }) {
            guard existing == record else { throw Failure.duplicateID }
            return records
        }
        records.insert(record, at: 0)
        try write(records)
        return try load()
    }
    @discardableResult
    public func delete(id: UUID) throws -> [WorkoutRecord] {
        let records = try load().filter { $0.id != id }
        try write(records)
        return try load()
    }
    public func deleteAll() throws { try write([]) }

    private func write(_ records: [WorkoutRecord]) throws {
        var directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        let data = try JSONEncoder().encode(Envelope(version: 1, records: records))
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }
}
