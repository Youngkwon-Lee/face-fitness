package kr.co.kinelo.facefitness.core

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * Versioned local workout history. The single UI owner serializes access.
 * Never overwrites a file it could not read.
 */
class HistoryFile(val file: File) {
    class Failure(message: String) : IOException(message)

    fun load(): List<WorkoutRecord> {
        if (!file.exists()) return emptyList()
        val envelope = try {
            JSONObject(file.readText(Charsets.UTF_8))
        } catch (error: Exception) {
            throw Failure("unreadable history")
        }
        if (envelope.optInt("version", -1) != VERSION) throw Failure("unsupported version")
        val array = envelope.optJSONArray("records") ?: throw Failure("missing records")
        val records = (0 until array.length()).map { decode(array.getJSONObject(it)) }
        if (!records.all { it.isValid }) throw Failure("invalid record")
        if (records.map { it.id }.toSet().size != records.size) throw Failure("duplicate id")
        return records.sortedByDescending { it.dateMillis }
    }

    fun append(record: WorkoutRecord): List<WorkoutRecord> {
        if (!record.isValid) throw Failure("invalid record")
        val records = load().toMutableList()
        records.firstOrNull { it.id == record.id }?.let { existing ->
            if (existing != record) throw Failure("duplicate id")
            return records
        }
        records.add(0, record)
        write(records)
        return load()
    }

    fun delete(id: String): List<WorkoutRecord> {
        write(load().filter { it.id != id })
        return load()
    }

    fun deleteAll() = write(emptyList())

    private fun write(records: List<WorkoutRecord>) {
        val directory = file.parentFile ?: throw Failure("no directory")
        if (!directory.exists() && !directory.mkdirs()) throw Failure("cannot create directory")
        val envelope = JSONObject()
            .put("version", VERSION)
            .put("records", JSONArray().apply { records.forEach { put(encode(it)) } })
        // Write a sibling file and rename it over the original: never a half-written history.
        val temporary = File(directory, file.name + ".tmp")
        temporary.writeText(envelope.toString(), Charsets.UTF_8)
        if (!temporary.renameTo(file)) {
            temporary.delete()
            throw Failure("cannot replace history")
        }
    }

    companion object {
        const val VERSION = 1

        fun encode(record: WorkoutRecord): JSONObject = JSONObject()
            .put("id", record.id)
            .put("dateMillis", record.dateMillis)
            .put("routineTitle", record.routineTitle)
            .put("movementTitles", JSONArray(record.movementTitles))
            .put("activeSeconds", record.activeSeconds)
            .put("completedSteps", record.completedSteps)
            .put("plannedSteps", record.plannedSteps)
            .apply {
                record.estimatedRepetitions?.let { counts ->
                    put("estimatedRepetitions", JSONObject().apply { counts.forEach { (k, v) -> put(k, v) } })
                }
            }

        fun decode(json: JSONObject): WorkoutRecord {
            val titles = json.getJSONArray("movementTitles")
            val counts = json.optJSONObject("estimatedRepetitions")
            return WorkoutRecord(
                id = json.getString("id"),
                dateMillis = json.getLong("dateMillis"),
                routineTitle = json.getString("routineTitle"),
                movementTitles = (0 until titles.length()).map { titles.getString(it) },
                activeSeconds = json.getInt("activeSeconds"),
                completedSteps = json.getInt("completedSteps"),
                plannedSteps = json.getInt("plannedSteps"),
                estimatedRepetitions = counts?.let { obj -> obj.keys().asSequence().associateWith { obj.getInt(it) } },
            )
        }
    }
}
