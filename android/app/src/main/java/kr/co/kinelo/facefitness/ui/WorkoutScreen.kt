package kr.co.kinelo.facefitness.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import kotlinx.coroutines.delay
import kr.co.kinelo.facefitness.camera.FaceCamera
import kr.co.kinelo.facefitness.camera.FaceMesh
import kr.co.kinelo.facefitness.core.PracticeClock.Phase
import kr.co.kinelo.facefitness.core.Routine
import kr.co.kinelo.facefitness.core.WorkoutRecord
import kotlin.math.max

private val meshColor = Color(0xFF63E6E2).copy(alpha = 0.65f)
private val meshEdges: IntArray by lazy {
    FaceLandmarker.FACE_LANDMARKS_TESSELATION.flatMap { listOf(it.start(), it.end()) }.toIntArray()
}

@Composable
fun WorkoutScreen(routine: Routine, seconds: Int, history: HistoryStore, preferences: Preferences, onClose: () -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val view = LocalView.current
    val workout = remember { WorkoutController(routine, seconds) }
    val camera = remember { FaceCamera(context.applicationContext) }
    val voice = remember { VoiceGuide(context) }
    var confirmingExit by remember { mutableStateOf(false) }

    fun speak(text: String) { if (preferences.voiceCues) voice.speak(text) }
    fun requestClose() {
        if (workout.saved || workout.activeSeconds < 1) onClose()
        else {
            workout.pause()
            confirmingExit = true
        }
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) camera.start(owner) else camera.markDenied()
    }
    fun toggleCamera() {
        if (camera.isOn) {
            camera.stop()
            return
        }
        camera.markRequesting()
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            camera.start(owner)
        } else {
            permission.launch(Manifest.permission.CAMERA)
        }
    }

    BackHandler { requestClose() }

    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                // The permission dialog only pauses the activity; a real background transition also stops it.
                Lifecycle.Event.ON_PAUSE -> {
                    workout.pause()
                    voice.stop()
                }
                Lifecycle.Event.ON_STOP -> camera.stop()
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose {
            owner.lifecycle.removeObserver(observer)
            workout.pause()
            camera.release()
            voice.shutdown()
            view.keepScreenOn = false
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(250)
            workout.tick()
            camera.expireObservation()
        }
    }
    LaunchedEffect(Unit) { snapshotFlow { camera.observation }.collect { workout.observe(it) } }
    LaunchedEffect(Unit) {
        snapshotFlow { workout.phase }.collect { phase ->
            view.keepScreenOn = phase == Phase.RUNNING
            if (phase != Phase.RUNNING) voice.stop()
            else speak(workout.movement.title + ". " + workout.movement.instructions[1])
        }
    }
    LaunchedEffect(Unit) {
        var previous = workout.currentRepetitions
        snapshotFlow { workout.currentRepetitions }.collect { current ->
            if (current > previous && workout.phase == Phase.RUNNING) speak("${current}회")
            previous = current
        }
    }
    LaunchedEffect(Unit) { snapshotFlow { preferences.voiceCues }.collect { if (!it) voice.stop() } }
    LaunchedEffect(Unit) { snapshotFlow { workout.record?.id }.collect { if (it != null) camera.stop() } }

    val record = workout.record
    Page(
        title = if (record == null) routine.title else "운동 기록",
        onBack = ::requestClose,
        backLabel = "닫기",
        bottomBar = {
            if (record == null) {
                Column(
                    Modifier.fillMaxWidth().background(Brand.surface).padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    PrimaryButton(primaryTitle(workout.phase), Modifier.widthIn(max = 600.dp)) {
                        if (workout.phase == Phase.RUNNING) workout.pause() else workout.start()
                    }
                    TextButton(onClick = workout::finish, modifier = Modifier.heightIn(min = 44.dp)) { Text("여기까지 기록하기") }
                }
            }
        },
    ) {
        if (record == null) {
            Practice(workout, camera, voice, preferences, ::toggleCamera, ::speak)
        } else {
            Summary(record, workout, history, onClose)
        }
    }

    if (confirmingExit) {
        AlertDialog(
            onDismissRequest = { confirmingExit = false },
            title = { Text("저장하지 않은 운동 시간이 있어요", fontSize = 17.sp) },
            confirmButton = { TextButton(onClick = onClose) { Text("기록하지 않고 나가기", color = Color(0xFFFF453A)) } },
            dismissButton = { TextButton(onClick = { confirmingExit = false }) { Text("계속 보기") } },
        )
    }
}

private fun primaryTitle(phase: Phase) = when (phase) {
    Phase.READY -> "안내 시작"
    Phase.RUNNING -> "잠깐 쉬기"
    Phase.PAUSED -> "이어서 하기"
    Phase.BETWEEN_STEPS -> "다음 동작 시작"
    Phase.FINISHED -> "운동 마치기"
}

private fun statusText(phase: Phase) = when (phase) {
    Phase.READY -> "준비"
    Phase.RUNNING -> "진행 중"
    Phase.PAUSED -> "일시정지"
    Phase.BETWEEN_STEPS -> "휴식 중"
    Phase.FINISHED -> "마침"
}

@Composable
private fun Practice(
    workout: WorkoutController,
    camera: FaceCamera,
    voice: VoiceGuide,
    preferences: Preferences,
    toggleCamera: () -> Unit,
    speak: (String) -> Unit,
) {
    val context = LocalContext.current
    val movement = workout.movement
    Row(Modifier.fillMaxWidth()) {
        Text("${workout.stepIndex + 1} / ${workout.routine.movements.size} 동작", fontSize = 15.sp, color = Brand.accent, modifier = Modifier.weight(1f))
        Text(statusText(workout.phase), fontSize = 15.sp, color = Brand.secondary)
    }
    Spacer(Modifier.height(16.dp))
    Box(
        Modifier.fillMaxWidth().height(260.dp).clip(RoundedCornerShape(20.dp)).background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painterResource(artwork(movement.artwork)),
            contentDescription = movement.title + " 안내 그림",
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize(),
        )
        if (camera.isOn) {
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).apply {
                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                        camera.preview.surfaceProvider = surfaceProvider
                    }
                },
                onRelease = { camera.preview.surfaceProvider = null },
                modifier = Modifier.fillMaxSize().semantics { contentDescription = "전면 카메라와 얼굴 메쉬" },
            )
            camera.mesh?.let { MeshOverlay(it) }
        }
    }
    Spacer(Modifier.height(16.dp))
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TextButton(onClick = toggleCamera, modifier = Modifier.heightIn(min = 44.dp)) {
            Text(if (camera.isOn) "거울 끄기" else "거울 켜기")
        }
        Footnote(camera.message)
        if (camera.supportsTracking) {
            Text("추정 횟수 ${workout.currentRepetitions}회", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Footnote(
                if (camera.observation == null) "거울을 켜면 얼굴 메쉬와 움직임 변화를 기기 안에서만 처리해요. 얼굴 데이터는 저장하지 않아요."
                else "안내 중 움직였다가 편안한 표정으로 돌아온 변화를 셉니다. 일시정지 중에는 세지 않아요.",
            )
            Footnote("횟수는 참고용 추정값으로, 놓치거나 중복될 수 있어요. 자연스러운 눈깜박임도 포함될 수 있고 모음 종류는 구분하지 않아요. 횟수를 맞추려고 무리하지 마세요.")
        }
        ToggleRow("음성 안내", preferences.voiceCues, preferences::updateVoiceCues)
        TextButton(
            onClick = {
                preferences.updateVoiceCues(true)
                speak(movement.title + ". " + movement.instructions.joinToString(" "))
            },
            modifier = Modifier.heightIn(min = 44.dp),
        ) { Text("안내 듣기") }
        voice.error?.let { Footnote(it, Brand.warning) }
        if (camera.state == FaceCamera.State.DENIED) {
            TextButton(onClick = {
                context.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
                )
            }, modifier = Modifier.heightIn(min = 44.dp)) { Text("설정에서 카메라 권한 확인") }
        }
    }
    Spacer(Modifier.height(16.dp))
    Text(movement.title, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(10.dp))
    movement.instructions.forEachIndexed { index, instruction ->
        Row(Modifier.padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("${index + 1}", fontSize = 15.sp, color = Brand.accent, modifier = Modifier.width(18.dp))
            Text(instruction)
        }
    }
    Column(
        Modifier.fillMaxWidth().padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val resting = workout.phase == Phase.BETWEEN_STEPS
        Text(if (resting) "쉬어가도 좋아요" else "남은 안내 시간", fontSize = 15.sp, color = Brand.secondary)
        Text(if (resting) "다음 동작 준비" else "${workout.remainingSeconds}초", fontSize = 34.sp, fontWeight = FontWeight.SemiBold)
        if (!resting) {
            LinearProgressIndicator(
                progress = { (workout.stepElapsed / workout.stepDuration).toFloat() },
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "안내 시간 진행" },
                color = Brand.accent,
            )
        }
    }
    Footnote("불편하면 바로 멈추세요. 안내 시간이나 동작 크기를 끝까지 채울 필요는 없어요.")
    Spacer(Modifier.height(16.dp))
}

@Composable
private fun MeshOverlay(mesh: FaceMesh) {
    Canvas(Modifier.fillMaxSize()) {
        // Same mapping as PreviewView FILL_CENTER: scale to cover, then center-crop.
        val scale = max(size.width / mesh.imageWidth, size.height / mesh.imageHeight)
        val dx = (size.width - mesh.imageWidth * scale) / 2
        val dy = (size.height - mesh.imageHeight * scale) / 2
        val points = mesh.points
        val count = points.size / 2
        fun at(index: Int) = Offset(points[index * 2] * mesh.imageWidth * scale + dx, points[index * 2 + 1] * mesh.imageHeight * scale + dy)
        val edges = meshEdges
        var i = 0
        while (i < edges.size) {
            val a = edges[i]
            val b = edges[i + 1]
            if (a < count && b < count) drawLine(meshColor, at(a), at(b), strokeWidth = 1f)
            i += 2
        }
    }
}

@Composable
private fun Summary(record: WorkoutRecord, workout: WorkoutController, history: HistoryStore, onClose: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = if (workout.saved) Brand.accent else Brand.secondary, modifier = Modifier.size(42.dp))
        Text(if (workout.saved) "이 기기에 기록했어요" else "나를 위한 시간을 남겨요", fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text(record.routineTitle, fontSize = 22.sp)
        Card {
            LabeledRow("움직인 시간", "${record.activeSeconds}초")
            LabeledRow("안내 시간을 마친 동작", "${record.completedSteps} / ${record.plannedSteps}")
            LabeledRow("세션 상태", if (record.isComplete) "전체 안내 완료" else "중간에 마침")
            record.estimatedRepetitions?.let { counts ->
                record.movementTitles.forEach { title -> counts[title]?.let { LabeledRow(title, "추정 ${it}회") } }
            }
        }
        if (record.estimatedRepetitions != null) {
            Footnote("추정 횟수는 표정 변화의 참고 기록이며, 운동 수행·정확성이나 임상적 상태를 판정하지 않습니다.")
        }
        Footnote("일시정지와 동작 사이 휴식은 시간에 포함하지 않습니다. 기록은 운동한 시간이며, 동작의 정확성이나 근육 상태에 대한 평가가 아닙니다.")
        workout.saveError?.let { error ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Warning, contentDescription = null, tint = Brand.warning)
                Text(error, color = Brand.warning)
            }
        }
        when {
            workout.saved -> PrimaryButton("운동 목록으로", onClick = onClose)
            record.isValid -> PrimaryButton(if (workout.saveError == null) "기록 저장" else "저장 다시 시도") { workout.save(history) }
            else -> {
                Text("저장할 운동 시간이 아직 없어요.", color = Brand.secondary)
                PrimaryButton("운동 목록으로", onClick = onClose)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
