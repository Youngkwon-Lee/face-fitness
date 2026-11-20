package kr.co.kinelo.facefitness.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.SystemClock
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.max

/** Blend-shape summary for one frame. Same mapping as the iOS ARKit pipeline. */
data class FaceObservation(
    val trackId: Int,
    val timestamp: Double,
    val brow: Double,
    val eyes: Double,
    val smile: Double,
    val lips: Double,
    val mouthShape: Double,
) {
    fun signal(movement: String): Double = when (movement) {
        "brow" -> brow
        "eyes" -> eyes
        "smile" -> smile
        "lips" -> lips
        else -> mouthShape
    }

    companion object {
        fun from(trackId: Int, timestamp: Double, shapes: Map<String, Float>): FaceObservation {
            fun v(name: String) = (shapes[name] ?: 0f).toDouble()
            val smile = (v("mouthSmileLeft") + v("mouthSmileRight")) / 2
            return FaceObservation(
                trackId = trackId,
                timestamp = timestamp,
                brow = max(v("browInnerUp"), (v("browOuterUpLeft") + v("browOuterUpRight")) / 2),
                eyes = (v("eyeBlinkLeft") + v("eyeBlinkRight")) / 2,
                smile = smile,
                lips = v("mouthPucker"),
                mouthShape = maxOf(v("jawOpen"), v("mouthPucker"), v("mouthFunnel"), smile),
            )
        }
    }
}

/** Landmarks in the mirrored, upright analysis image, normalized 0..1. */
class FaceMesh(val points: FloatArray, val imageWidth: Int, val imageHeight: Int)

/**
 * Front-camera mirror plus on-device MediaPipe face landmarks.
 * Frames, landmarks and blend shapes live only in memory: no files, network or logging of face data.
 */
class FaceCamera(private val context: Context) {
    enum class State { OFF, REQUESTING, ACTIVE, DENIED, UNAVAILABLE, INTERRUPTED }

    var state by mutableStateOf(State.OFF)
        private set
    var observation by mutableStateOf<FaceObservation?>(null)
        private set
    var mesh by mutableStateOf<FaceMesh?>(null)
        private set
    /** False once the landmark model could not start on this device: mirror only. */
    var supportsTracking by mutableStateOf(true)
        private set

    val preview: Preview = Preview.Builder().setResolutionSelector(selector()).build()

    private var provider: ProcessCameraProvider? = null
    private var landmarker: FaceLandmarker? = null
    private var analysisExecutor: ExecutorService? = null
    private var generation = 0
    @Volatile private var activeGeneration = -1
    @Volatile private var lastSubmittedMs = 0L
    @Volatile private var lastFaceSeen = false
    @Volatile private var trackId = 0

    val message: String
        get() = when (state) {
            State.OFF -> "카메라는 꺼져 있어요"
            State.REQUESTING -> "카메라를 준비하고 있어요"
            State.ACTIVE -> if (supportsTracking) {
                if (observation == null) "얼굴을 화면 안에 편안히 두세요" else "얼굴 메쉬 추적 중 · 기기 안에서만 처리해요"
            } else {
                "거울 모드 · 이 기기에서는 자동 횟수 추적을 사용할 수 없어요"
            }
            State.DENIED -> "카메라 접근이 꺼져 있어요. 안내 그림으로 계속할 수 있습니다."
            State.UNAVAILABLE -> "전면 카메라를 사용할 수 없어요. 안내 그림으로 계속하세요."
            State.INTERRUPTED -> "카메라가 중단됐어요. 준비되면 다시 켜주세요."
        }

    val isOn: Boolean get() = state == State.ACTIVE || state == State.REQUESTING

    fun markRequesting() {
        generation += 1
        state = State.REQUESTING
    }

    fun markDenied() {
        generation += 1
        state = State.DENIED
    }

    fun start(owner: LifecycleOwner) {
        val request = generation
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            if (request != generation) return@addListener
            val cameraProvider = try {
                future.get()
            } catch (error: Exception) {
                state = State.UNAVAILABLE
                return@addListener
            }
            provider = cameraProvider
            if (!cameraProvider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) {
                state = State.UNAVAILABLE
                return@addListener
            }
            val analysis = if (supportsTracking && ensureLandmarker()) buildAnalysis(request) else null
            try {
                cameraProvider.unbindAll()
                val camera = if (analysis != null) {
                    cameraProvider.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis)
                } else {
                    cameraProvider.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview)
                }
                camera.cameraInfo.cameraState.observe(owner) { cameraState ->
                    if (request != generation) return@observe
                    if (cameraState.error != null) {
                        stop(State.INTERRUPTED)
                    } else if (cameraState.type == CameraState.Type.OPEN) {
                        state = State.ACTIVE
                    }
                }
                activeGeneration = request
            } catch (error: Exception) {
                state = State.UNAVAILABLE
            }
        }, ContextCompat.getMainExecutor(context))
    }

    fun stop(next: State = State.OFF) {
        generation += 1
        activeGeneration = -1
        provider?.unbindAll()
        observation = null
        mesh = null
        state = next
    }

    /** Drop a stale face after half a second, as on iOS. */
    fun expireObservation() {
        val current = observation ?: return
        if (SystemClock.uptimeMillis() / 1000.0 - current.timestamp > 0.5) {
            observation = null
            mesh = null
        }
    }

    fun release() {
        stop()
        analysisExecutor?.shutdown()
        analysisExecutor = null
        landmarker?.close()
        landmarker = null
    }

    private fun ensureLandmarker(): Boolean {
        if (landmarker != null) return true
        return try {
            val options = FaceLandmarker.FaceLandmarkerOptions.builder()
                .setBaseOptions(BaseOptions.builder().setModelAssetPath(MODEL).setDelegate(Delegate.CPU).build())
                .setRunningMode(RunningMode.LIVE_STREAM)
                .setNumFaces(1)
                .setOutputFaceBlendshapes(true)
                .setResultListener(::onResult)
                .setErrorListener { _ -> }
                .build()
            landmarker = FaceLandmarker.createFromOptions(context, options)
            true
        } catch (error: Exception) {
            supportsTracking = false
            false
        }
    }

    private fun buildAnalysis(request: Int): ImageAnalysis {
        val executor = analysisExecutor ?: Executors.newSingleThreadExecutor().also { analysisExecutor = it }
        return ImageAnalysis.Builder()
            .setResolutionSelector(selector())
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
            .also { analysis -> analysis.setAnalyzer(executor) { image -> analyze(image, request) } }
    }

    private fun analyze(image: ImageProxy, request: Int) {
        image.use { frame ->
            val now = SystemClock.uptimeMillis()
            if (request != activeGeneration || now - lastSubmittedMs < SAMPLE_MS) return
            val detector = landmarker ?: return
            lastSubmittedMs = now
            val source = frame.toBitmap()
            // Upright and mirrored, so landmark x matches the mirrored front preview directly.
            val matrix = Matrix().apply {
                postRotate(frame.imageInfo.rotationDegrees.toFloat())
                postScale(-1f, 1f)
            }
            val upright = Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
            if (upright !== source) source.recycle()
            try {
                detector.detectAsync(BitmapImageBuilder(upright).build(), now)
            } catch (error: Exception) {
                // Dropped frame; the next sample retries.
            }
        }
    }

    private fun onResult(result: FaceLandmarkerResult, input: com.google.mediapipe.framework.image.MPImage) {
        val timestamp = result.timestampMs() / 1000.0
        val width = input.width
        val height = input.height
        val landmarks = result.faceLandmarks().firstOrNull()
        val shapes = result.faceBlendshapes().orElse(null)?.firstOrNull()
        ContextCompat.getMainExecutor(context).execute {
            if (activeGeneration < 0) return@execute
            if (landmarks == null || shapes == null) {
                if (lastFaceSeen) trackId += 1
                lastFaceSeen = false
                observation = null
                mesh = null
                return@execute
            }
            lastFaceSeen = true
            val points = FloatArray(landmarks.size * 2)
            landmarks.forEachIndexed { index, landmark ->
                points[index * 2] = landmark.x()
                points[index * 2 + 1] = landmark.y()
            }
            mesh = FaceMesh(points, width, height)
            observation = FaceObservation.from(trackId, timestamp, shapes.associate { it.categoryName() to it.score() })
        }
    }

    private fun selector() = ResolutionSelector.Builder()
        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
        .setResolutionStrategy(ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
        .build()

    companion object {
        private const val MODEL = "face_landmarker.task"
        private const val SAMPLE_MS = 75L
    }
}
