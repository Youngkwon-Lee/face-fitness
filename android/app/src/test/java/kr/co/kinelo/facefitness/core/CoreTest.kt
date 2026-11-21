package kr.co.kinelo.facefitness.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.UUID

/** Same cases as the iOS FaceFitnessCore tests. Synthetic: they do not establish real counting accuracy. */
class MovementCounterTest {
    private fun MovementCounter.feed(signal: Double, from: Double, through: Double) {
        for (tick in Math.round(from * 10).toInt()..Math.round(through * 10).toInt()) observe(signal, tick / 10.0)
    }

    @Test fun onlyFullSettledExpressionAndRelaxationCounts() {
        val counter = MovementCounter()
        counter.feed(0.7, 0.0, 0.8)
        counter.feed(0.05, 0.9, 1.3)
        assertEquals("Starting with a contracted expression is not a repetition", 0, counter.count)
        counter.feed(0.7, 1.4, 2.0)
        assertEquals("Holding a movement never creates repeated counts", 0, counter.count)
        counter.feed(0.05, 2.1, 3.0)
        assertEquals(1, counter.count)
    }

    @Test fun jitterAndShortBlinkDoNotCount() {
        val counter = MovementCounter()
        counter.feed(0.05, 0.0, 0.5)
        counter.observe(0.9, 0.6)
        counter.observe(0.05, 0.7)
        for (tick in 8..30) counter.observe(if (tick % 2 == 0) 0.37 else 0.3, tick / 10.0)
        counter.feed(0.05, 3.1, 3.5)
        assertEquals(0, counter.count)
    }

    @Test fun lostFaceOrPauseCannotCompletePendingMovement() {
        for (lost in listOf(true, false)) {
            val counter = MovementCounter()
            counter.feed(0.05, 0.0, 0.5)
            counter.feed(0.8, 0.6, 1.0)
            if (lost) counter.observe(null, 1.1) else counter.interrupt()
            counter.feed(0.05, 1.2, 1.8)
            assertEquals(0, counter.count)
            counter.feed(0.8, 1.9, 2.3)
            counter.feed(0.05, 2.4, 2.8)
            assertEquals(1, counter.count)
        }
    }

    @Test fun staleAndInvalidObservationsCannotJoinACycle() {
        for (invalid in listOf(Double.NaN, Double.POSITIVE_INFINITY, -1.0, 2.0)) {
            val counter = MovementCounter()
            counter.feed(0.05, 0.0, 0.5)
            counter.feed(0.8, 0.6, 1.0)
            counter.observe(invalid, 1.1)
            counter.feed(0.05, 1.2, 1.8)
            assertEquals(0, counter.count)
        }
        val stale = MovementCounter()
        stale.feed(0.05, 0.0, 0.5)
        stale.feed(0.8, 0.6, 1.0)
        stale.feed(0.05, 2.0, 3.0)
        assertEquals(0, stale.count)
    }

    @Test fun countsSurviveSaveAndOlderRecordsDecodeWithoutCounts() {
        val clock = PracticeClock(3, 20.0).apply { start(0.0); pause(5.0) }
        val routine = Catalog.routines[0]
        val record = WorkoutRecord.from(routine, clock, mapOf(Catalog.brow.title to 2))
        val encoded = HistoryFile.encode(record)
        assertEquals(mapOf(Catalog.brow.title to 2), HistoryFile.decode(JSONObject(encoded.toString())).estimatedRepetitions)
        encoded.remove("estimatedRepetitions")
        val legacy = HistoryFile.decode(JSONObject(encoded.toString()))
        assertNull(legacy.estimatedRepetitions)
        assertTrue(legacy.isValid)
        assertFalse(WorkoutRecord.from(routine, clock, mapOf("unselected" to 2)).isValid)
        assertFalse(WorkoutRecord.from(routine, clock, mapOf(Catalog.brow.title to -1)).isValid)
    }
}

class PracticeTest {
    @get:Rule val folder = TemporaryFolder()

    @Test fun pausedAndBetweenStepTimeNeverBecomeExerciseTime() {
        val clock = PracticeClock(2, 20.0)
        clock.start(100.0)
        clock.pause(107.0)
        clock.tick(700.0)
        assertEquals(7.0, clock.activeSeconds, 0.0)
        clock.start(700.0)
        clock.tick(713.0)
        assertEquals(PracticeClock.Phase.BETWEEN_STEPS, clock.phase)
        assertEquals(1, clock.completedSteps)
        clock.tick(1000.0)
        assertEquals(20.0, clock.activeSeconds, 0.0)
        clock.start(1000.0)
        clock.tick(1020.0)
        assertEquals(PracticeClock.Phase.FINISHED, clock.phase)
        assertEquals(40.0, clock.activeSeconds, 0.0)
        clock.tick(5000.0)
        assertEquals(2, clock.completedSteps)
    }

    @Test fun lateTimerDoesNotCreditUnstartedSteps() {
        val clock = PracticeClock(3, 20.0)
        clock.start(10.0)
        clock.tick(1000.0)
        assertEquals(1, clock.completedSteps)
        assertEquals(20.0, clock.activeSeconds, 0.0)
        assertEquals(PracticeClock.Phase.BETWEEN_STEPS, clock.phase)
    }

    @Test fun earlyFinishIsPartialAndZeroTimeCannotBeSaved() {
        val routine = Catalog.routines[0]
        val clock = PracticeClock(3, 20.0)
        assertFalse(WorkoutRecord.from(routine, clock).isValid)
        clock.start(100.0)
        clock.pause(105.0)
        val record = WorkoutRecord.from(routine, clock)
        assertTrue(record.isValid)
        assertFalse(record.isComplete)
        assertEquals(5, record.activeSeconds)
        assertEquals(0, record.completedSteps)
    }

    @Test fun invalidOrBackwardTimestampsDoNotAddTime() {
        val clock = PracticeClock(1, 20.0)
        clock.start(Double.NaN)
        assertEquals(PracticeClock.Phase.READY, clock.phase)
        clock.start(100.0)
        clock.tick(Double.POSITIVE_INFINITY)
        clock.tick(90.0)
        assertEquals(0.0, clock.activeSeconds, 0.0)
    }

    @Test fun saveIsDurableAndRetryDoesNotDuplicate() {
        val file = historyFile()
        val record = makeRecord()
        assertEquals(listOf(record), file.append(record))
        assertEquals(listOf(record), file.append(record))
        assertEquals(listOf(record), HistoryFile(file.file).load())
    }

    @Test fun corruptHistoryIsNotOverwrittenBySaveOrSingleDelete() {
        val file = historyFile()
        file.file.writeText("corrupt-history")
        assertThrows { file.append(makeRecord()) }
        assertThrows { file.delete(UUID.randomUUID().toString()) }
        assertEquals("corrupt-history", file.file.readText())
    }

    @Test fun deleteRemovesOnlySelectedRecordAndDeleteAllIsDurable() {
        val file = historyFile()
        val first = makeRecord(dateMillis = 1_000L)
        val second = makeRecord(dateMillis = 2_000L)
        file.append(first)
        file.append(second)
        assertEquals(listOf(second.id), file.delete(first.id).map { it.id })
        file.deleteAll()
        assertEquals(emptyList<WorkoutRecord>(), file.load())
    }

    @Test fun unsupportedVersionRemainsUntouched() {
        val file = historyFile()
        val original = """{"version":99,"records":[]}"""
        file.file.writeText(original)
        assertThrows { file.append(makeRecord()) }
        assertEquals(original, file.file.readText())
    }

    private fun makeRecord(dateMillis: Long = System.currentTimeMillis()): WorkoutRecord {
        val clock = PracticeClock(3, 20.0).apply { start(0.0); pause(5.0) }
        return WorkoutRecord.from(Catalog.routines[0], clock, dateMillis = dateMillis)
    }

    private fun historyFile() = HistoryFile(File(folder.newFolder(), "history.json"))

    private fun assertThrows(block: () -> Unit) {
        try {
            block()
            fail("Expected a failure")
        } catch (_: Exception) {
        }
    }
}
