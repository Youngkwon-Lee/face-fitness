package kr.co.kinelo.facefitness.core

import java.util.UUID
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

data class Movement(
    val id: String,
    val title: String,
    val detail: String,
    val instructions: List<String>,
    val artwork: String,
)

data class Routine(
    val id: String,
    val title: String,
    val subtitle: String,
    val movements: List<Movement>,
)

/** Same copy and routines as the iOS FaceFitnessCore catalog. */
object Catalog {
    val brow = Movement("brow", "눈썹 올렸다 내리기", "거울을 보며 천천히 움직여요", listOf("정면을 보고 편안한 표정으로 시작하세요.", "편안한 범위에서 눈썹을 천천히 올렸다 내려보세요.", "크기보다 편안한 움직임에 집중하세요."), "brow")
    val eyes = Movement("eyes", "눈 부드럽게 감았다 뜨기", "세게 감지 않고 부드럽게", listOf("눈 주변에 힘을 빼고 정면을 보세요.", "눈을 부드럽게 감았다 천천히 떠보세요.", "눈을 꼭 감거나 손으로 누르지 마세요."), "eyes")
    val smile = Movement("smile", "작은 미소 짓기", "자연스러운 표정을 살펴봐요", listOf("입 주변을 편안하게 두세요.", "작게 미소 지었다 편안한 표정으로 돌아오세요.", "억지로 크게 웃거나 양쪽 모양을 맞추려 하지 마세요."), "smile")
    val lips = Movement("lips", "입술 가볍게 모았다 풀기", "입 주변을 천천히 움직여요", listOf("턱과 입 주변을 편안하게 두세요.", "입술을 가볍게 모았다 자연스럽게 풀어보세요.", "이를 악물거나 입술을 세게 누르지 마세요."), "lips")
    val vowels = Movement("vowels", "모음 입 모양 따라 하기", "아 · 에 · 이 · 오 · 우", listOf("편안한 크기로 ‘아·에·이·오·우’ 입 모양을 만들어보세요.", "각 모양 사이에 편안한 표정으로 돌아오세요.", "입을 크게 벌리거나 끝까지 움직일 필요는 없어요."), "vowels")
    val routines = listOf(
        Routine("daily", "가볍게 시작하기", "눈썹 · 눈 · 미소", listOf(brow, eyes, smile)),
        Routine("eyes", "눈과 눈썹 움직이기", "두 가지 움직임을 천천히", listOf(brow, eyes)),
        Routine("mouth", "입 주변 움직이기", "미소 · 입술 · 모음", listOf(smile, lips, vowels)),
    )
}

/**
 * A foreground-only practice clock. The caller supplies monotonic uptime in seconds.
 * Completion describes elapsed practice time, never movement correctness.
 */
class PracticeClock(val stepCount: Int, val stepDuration: Double) {
    enum class Phase { READY, RUNNING, PAUSED, BETWEEN_STEPS, FINISHED }

    init {
        require(stepCount > 0 && stepDuration.isFinite() && stepDuration > 0)
    }

    var phase = Phase.READY
        private set
    var completedSteps = 0
        private set
    var stepElapsed = 0.0
        private set
    private var accrued = 0.0
    private var startedAt: Double? = null

    val stepIndex: Int get() = min(completedSteps, stepCount - 1)
    val activeSeconds: Double
        get() = completedSteps * stepDuration + (if (phase == Phase.FINISHED) 0.0 else stepElapsed)
    val remainingSeconds: Int get() = max(0, ceil(stepDuration - stepElapsed).toInt())

    fun start(uptime: Double) {
        if (!uptime.isFinite() || phase !in setOf(Phase.READY, Phase.PAUSED, Phase.BETWEEN_STEPS)) return
        startedAt = uptime
        phase = Phase.RUNNING
    }

    fun tick(uptime: Double) {
        val began = startedAt
        if (phase != Phase.RUNNING || !uptime.isFinite() || began == null) return
        stepElapsed = min(stepDuration, accrued + max(0.0, uptime - began))
        if (stepElapsed >= stepDuration) {
            completedSteps += 1
            startedAt = null
            accrued = 0.0
            stepElapsed = 0.0
            phase = if (completedSteps == stepCount) Phase.FINISHED else Phase.BETWEEN_STEPS
        }
    }

    fun pause(uptime: Double) {
        if (phase != Phase.RUNNING) return
        tick(uptime)
        if (phase != Phase.RUNNING) return
        accrued = stepElapsed
        startedAt = null
        phase = Phase.PAUSED
    }
}

data class WorkoutRecord(
    val id: String,
    val dateMillis: Long,
    val routineTitle: String,
    val movementTitles: List<String>,
    val activeSeconds: Int,
    val completedSteps: Int,
    val plannedSteps: Int,
    val estimatedRepetitions: Map<String, Int>?,
) {
    val isComplete: Boolean get() = completedSteps == plannedSteps

    val isValid: Boolean
        get() = dateMillis > 0 && routineTitle.isNotEmpty() && activeSeconds > 0 &&
            plannedSteps > 0 && completedSteps in 0..plannedSteps &&
            movementTitles.size == plannedSteps && movementTitles.all { it.isNotEmpty() } &&
            (estimatedRepetitions?.all { (title, count) -> title in movementTitles && count in 0..100_000 } ?: true)

    companion object {
        fun from(
            routine: Routine,
            clock: PracticeClock,
            estimatedRepetitions: Map<String, Int>? = null,
            id: String = UUID.randomUUID().toString(),
            dateMillis: Long = System.currentTimeMillis(),
        ) = WorkoutRecord(
            id = id,
            dateMillis = dateMillis,
            routineTitle = routine.title,
            movementTitles = routine.movements.map { it.title },
            activeSeconds = clock.activeSeconds.toInt(),
            completedSteps = clock.completedSteps,
            plannedSteps = clock.stepCount,
            estimatedRepetitions = estimatedRepetitions,
        )
    }
}

/**
 * An engineering heuristic for complete expression/relaxation cycles.
 * Thresholds are not clinical bounds, strength scores, or exercise targets.
 * Identical to the iOS MovementCounter.
 */
class MovementCounter {
    var count = 0
        private set

    private enum class Phase { WAITING, ARMED, ENGAGED }

    private var phase = Phase.WAITING
    private var candidateAt: Double? = null
    private var lastAt: Double? = null

    /** Keep the total, but never join observations across a pause or lost face. */
    fun interrupt() {
        phase = Phase.WAITING
        candidateAt = null
        lastAt = null
    }

    fun observe(signal: Double?, time: Double) {
        if (signal == null || !signal.isFinite() || signal !in 0.0..1.0 || !time.isFinite()) {
            interrupt()
            return
        }
        lastAt?.let { if (time <= it || time - it > 0.5) interrupt() }
        lastAt = time
        val relaxed = signal <= 0.18
        val expressed = signal >= 0.35
        val qualifying = when (phase) {
            Phase.WAITING -> relaxed
            Phase.ARMED -> expressed
            Phase.ENGAGED -> relaxed
        }
        if (!qualifying) {
            candidateAt = null
            return
        }
        val began = candidateAt
        if (began == null) {
            candidateAt = time
            return
        }
        if (time - began < 0.15) return
        candidateAt = null
        phase = when (phase) {
            Phase.WAITING -> Phase.ARMED
            Phase.ARMED -> Phase.ENGAGED
            Phase.ENGAGED -> {
                count += 1
                Phase.WAITING
            }
        }
    }
}
