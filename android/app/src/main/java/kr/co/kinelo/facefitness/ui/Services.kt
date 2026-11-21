package kr.co.kinelo.facefitness.ui

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import kr.co.kinelo.facefitness.camera.FaceObservation
import kr.co.kinelo.facefitness.core.HistoryFile
import kr.co.kinelo.facefitness.core.MovementCounter
import kr.co.kinelo.facefitness.core.PracticeClock
import kr.co.kinelo.facefitness.core.Routine
import kr.co.kinelo.facefitness.core.WorkoutRecord
import java.io.File
import java.util.Locale

/** Local preferences: voice cues and first-run welcome only. */
class Preferences(context: Context) {
    private val prefs = context.getSharedPreferences("face_fitness", Context.MODE_PRIVATE)
    var welcomed by mutableStateOf(prefs.getBoolean("hasSeenWelcome.v1", false))
        private set
    var voiceCues by mutableStateOf(prefs.getBoolean("voiceCues", true))
        private set

    fun markWelcomed() {
        welcomed = true
        prefs.edit().putBoolean("hasSeenWelcome.v1", true).apply()
    }

    fun updateVoiceCues(enabled: Boolean) {
        voiceCues = enabled
        prefs.edit().putBoolean("voiceCues", enabled).apply()
    }
}

class HistoryStore(context: Context) {
    private val file = HistoryFile(File(File(context.filesDir, "FaceFitness"), "history.json"))
    var records by mutableStateOf<List<WorkoutRecord>>(emptyList())
        private set
    var error by mutableStateOf<String?>(null)
        private set

    init { reload() }

    fun reload() {
        try {
            records = file.load()
            error = null
        } catch (failure: Exception) {
            error = "기록을 읽지 못했습니다. 기존 기록을 덮어쓰지 않습니다. 잠시 뒤 다시 시도해 주세요."
        }
    }

    fun save(record: WorkoutRecord) {
        records = file.append(record)
        error = null
    }

    fun delete(record: WorkoutRecord) {
        try {
            records = file.delete(record.id)
            error = null
        } catch (failure: Exception) {
            error = "기록을 삭제하지 못했습니다. 다시 시도해 주세요."
        }
    }

    fun deleteAll() {
        try {
            file.deleteAll()
            records = emptyList()
            error = null
        } catch (failure: Exception) {
            error = "기록을 삭제하지 못했습니다. 다시 시도해 주세요."
        }
    }
}

/** Korean spoken cues through the platform TextToSpeech engine. */
class VoiceGuide(context: Context) {
    var error by mutableStateOf<String?>(null)
        private set

    private val audio = context.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributes)
        .build()
    private val main = ContextCompat.getMainExecutor(context)
    private var ready = false
    private var pending: String? = null
    private var tts: TextToSpeech? = null

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            main.execute {
                val engine = tts ?: return@execute
                if (status != TextToSpeech.SUCCESS) {
                    error = "음성 엔진을 시작하지 못했어요. 기기의 텍스트 음성 변환 설정을 확인해 주세요."
                    return@execute
                }
                val language = engine.setLanguage(Locale.KOREAN)
                if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
                    error = "한국어 음성 데이터가 없어요. 기기 설정의 텍스트 음성 변환에서 한국어를 설치해 주세요."
                    return@execute
                }
                engine.setSpeechRate(0.85f)
                engine.setAudioAttributes(attributes)
                engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) { audio.abandonAudioFocusRequest(focus) }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) { audio.abandonAudioFocusRequest(focus) }
                    override fun onStop(utteranceId: String?, interrupted: Boolean) { audio.abandonAudioFocusRequest(focus) }
                })
                ready = true
                pending?.let { speak(it) }
                pending = null
            }
        }
    }

    fun speak(text: String) {
        val engine = tts ?: return
        if (!ready) {
            pending = text
            return
        }
        error = null
        audio.requestAudioFocus(focus)
        if (engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "cue-${SystemClock.uptimeMillis()}") != TextToSpeech.SUCCESS) {
            audio.abandonAudioFocusRequest(focus)
            error = "음성을 재생하지 못했어요. 기기 음량과 오디오 연결을 확인해 주세요."
        }
    }

    fun stop() {
        pending = null
        tts?.stop()
        audio.abandonAudioFocusRequest(focus)
    }

    fun shutdown() {
        stop()
        tts?.shutdown()
        tts = null
    }
}

/** Same behavior as the iOS WorkoutController. */
class WorkoutController(val routine: Routine, seconds: Int) {
    private val clock = PracticeClock(routine.movements.size, seconds.toDouble())
    // Compose reads these snapshots; the mutable clock is mirrored after each change.
    var phase by mutableStateOf(clock.phase)
        private set
    var stepIndex by mutableStateOf(0)
        private set
    var remainingSeconds by mutableStateOf(seconds)
        private set
    var stepElapsed by mutableStateOf(0.0)
        private set
    var activeSeconds by mutableStateOf(0.0)
        private set
    var record by mutableStateOf<WorkoutRecord?>(null)
        private set
    var saved by mutableStateOf(false)
        private set
    var saveError by mutableStateOf<String?>(null)
        private set
    val estimatedRepetitions = mutableStateMapOf<String, Int>()
    val stepDuration = seconds.toDouble()

    private var counter = MovementCounter()
    private var counterMovement: String? = null
    private var counterTrack: Int? = null

    val movement get() = routine.movements[stepIndex]
    val currentRepetitions: Int get() = estimatedRepetitions[movement.title] ?: 0

    private fun now() = SystemClock.uptimeMillis() / 1000.0

    private fun sync() {
        phase = clock.phase
        stepIndex = clock.stepIndex
        remainingSeconds = clock.remainingSeconds
        stepElapsed = clock.stepElapsed
        activeSeconds = clock.activeSeconds
    }

    fun start() {
        if (record != null) return
        clock.start(now())
        sync()
    }

    fun pause() {
        clock.pause(now())
        counter.interrupt()
        sync()
    }

    fun observe(observation: FaceObservation?) {
        if (record != null || clock.phase != PracticeClock.Phase.RUNNING || observation == null) {
            counter.interrupt()
            return
        }
        if (counterMovement != movement.id) {
            counter = MovementCounter()
            counterMovement = movement.id
        }
        if (counterTrack != observation.trackId) {
            counter.interrupt()
            counterTrack = observation.trackId
        }
        counter.observe(observation.signal(movement.id), observation.timestamp)
        if (estimatedRepetitions[movement.title] != counter.count) estimatedRepetitions[movement.title] = counter.count
    }

    fun tick() {
        if (record != null) return
        clock.tick(now())
        sync()
        if (clock.phase == PracticeClock.Phase.FINISHED) finish()
    }

    fun finish() {
        if (record != null) return
        pause()
        val counts = estimatedRepetitions.toMap()
        record = WorkoutRecord.from(routine, clock, counts.ifEmpty { null })
    }

    fun save(history: HistoryStore) {
        val current = record ?: return
        if (saved) return
        try {
            history.save(current)
            saved = true
            saveError = null
        } catch (failure: Exception) {
            saveError = "기록 저장을 확인하지 못했습니다. 이 화면에서 다시 시도할 수 있어요."
        }
    }
}
