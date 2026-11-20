package kr.co.kinelo.facefitness.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kr.co.kinelo.facefitness.BuildConfig
import kr.co.kinelo.facefitness.R
import kr.co.kinelo.facefitness.core.Catalog
import kr.co.kinelo.facefitness.core.Routine
import kr.co.kinelo.facefitness.core.WorkoutRecord
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Brand {
    val accent = Color(0xFFBFB3FF)
    val background = Color(0xFF000000)
    val surface = Color(0xFF1C1C1E)
    val secondary = Color(0xFFA1A1A6)
    val warning = Color(0xFFFF9F0A)
}

private val colors = darkColorScheme(
    primary = Brand.accent,
    onPrimary = Color.Black,
    background = Brand.background,
    surface = Brand.background,
    surfaceContainer = Brand.surface,
    onSurfaceVariant = Brand.secondary,
    secondaryContainer = Brand.accent.copy(alpha = 0.25f),
)

const val SUPPORT_URL = "https://github.com/Youngkwon-Lee/face-fitness/issues"

@DrawableRes
fun artwork(name: String): Int = when (name) {
    "brow" -> R.drawable.art_brow
    "eyes" -> R.drawable.art_eyes
    "smile" -> R.drawable.art_smile
    "lips" -> R.drawable.art_lips
    "vowels" -> R.drawable.art_vowels
    else -> R.drawable.art_neutral
}

fun formatDate(millis: Long): String =
    SimpleDateFormat("yyyy. M. d. a h:mm", Locale.KOREA).format(Date(millis))

private sealed interface Route {
    data class RoutineDetail(val routine: Routine) : Route
    data class Workout(val routine: Routine, val seconds: Int) : Route
    data class RecordDetail(val record: WorkoutRecord) : Route
    data object Privacy : Route
    data object Help : Route
}

private enum class Tab(val label: String) { WORKOUT("운동"), HISTORY("기록"), SETTINGS("설정") }

@Composable
fun FaceFitnessApp(history: HistoryStore, preferences: Preferences) {
    MaterialTheme(colorScheme = colors) {
        val routes = remember { mutableStateListOf<Route>() }
        var tab by rememberSaveable { mutableStateOf(Tab.WORKOUT) }
        val owner = LocalLifecycleOwner.current
        DisposableEffect(owner) {
            val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) history.reload() }
            owner.lifecycle.addObserver(observer)
            onDispose { owner.lifecycle.removeObserver(observer) }
        }
        Box(Modifier.fillMaxSize().background(Brand.background)) {
            if (!preferences.welcomed) {
                if (routes.lastOrNull() == Route.Privacy) {
                    BackHandler { routes.removeAt(routes.lastIndex) }
                    Page("개인정보 처리방침", onBack = { routes.removeAt(routes.lastIndex) }) { PrivacyContent() }
                } else {
                    WelcomeScreen(onPrivacy = { routes.add(Route.Privacy) }, onContinue = {
                        routes.clear()
                        preferences.markWelcomed()
                    })
                }
                return@Box
            }
            val top = routes.lastOrNull()
            if (top != null && top !is Route.Workout) BackHandler { routes.removeAt(routes.lastIndex) }
            val back = { if (routes.isNotEmpty()) routes.removeAt(routes.lastIndex) }
            when (top) {
                is Route.Workout -> WorkoutScreen(top.routine, top.seconds, history, preferences, onClose = { back() })
                is Route.RoutineDetail -> RoutineDetailScreen(top.routine, onBack = back) { seconds ->
                    routes.add(Route.Workout(top.routine, seconds))
                }
                is Route.RecordDetail -> Page("기록 상세", onBack = back) { RecordDetailContent(top.record) }
                Route.Privacy -> Page("개인정보 처리방침", onBack = back) { PrivacyContent() }
                Route.Help -> Page("앱 사용 안내", onBack = back) { HelpContent() }
                null -> Scaffold(
                    containerColor = Brand.background,
                    bottomBar = {
                        NavigationBar(containerColor = Brand.surface) {
                            Tab.entries.forEach { item ->
                                NavigationBarItem(
                                    selected = tab == item,
                                    onClick = { tab = item },
                                    label = { Text(item.label) },
                                    icon = {
                                        Icon(
                                            when (item) {
                                                Tab.WORKOUT -> Icons.Filled.Face
                                                Tab.HISTORY -> Icons.AutoMirrored.Filled.List
                                                Tab.SETTINGS -> Icons.Filled.Settings
                                            },
                                            contentDescription = null,
                                        )
                                    },
                                )
                            }
                        }
                    },
                ) { padding ->
                    Box(Modifier.padding(padding)) {
                        when (tab) {
                            Tab.WORKOUT -> RoutinesScreen { routes.add(Route.RoutineDetail(it)) }
                            Tab.HISTORY -> HistoryScreen(history) { routes.add(Route.RecordDetail(it)) }
                            Tab.SETTINGS -> SettingsScreen(
                                history, preferences,
                                onPrivacy = { routes.add(Route.Privacy) },
                                onHelp = { routes.add(Route.Help) },
                            )
                        }
                    }
                }
            }
        }
    }
}

// ---------- Shared building blocks ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Page(
    title: String,
    onBack: (() -> Unit)? = null,
    backLabel: String = "뒤로",
    bottomBar: @Composable () -> Unit = {},
    content: @Composable () -> Unit,
) {
    Scaffold(
        containerColor = Brand.background,
        topBar = {
            TopAppBar(
                title = { Text(title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = backLabel) }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.background),
            )
        },
        bottomBar = bottomBar,
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(Modifier.widthIn(max = 600.dp).fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp)) { content() }
        }
    }
}

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Brand.accent, contentColor = Color.Black),
    ) { Text(text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp) }
}

@Composable
fun Footnote(text: String, color: Color = Brand.secondary) {
    Text(text, fontSize = 13.sp, color = color, lineHeight = 18.sp)
}

@Composable
fun SectionTitle(text: String) {
    Text(text, fontSize = 13.sp, color = Brand.secondary, modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))
}

@Composable
fun Card(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) { content() }
}

@Composable
fun LabeledRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, modifier = Modifier.weight(1f))
        Text(value, color = Brand.secondary)
    }
}

@Composable
fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { onChange(!checked) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
fun ConfirmDialog(title: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontSize = 17.sp) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirm, color = Color(0xFFFF453A)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}

// ---------- Welcome ----------

@Composable
private fun WelcomeScreen(onPrivacy: () -> Unit, onContinue: () -> Unit) {
    Page("Face Fitness") {
        Image(
            painterResource(R.drawable.art_neutral), contentDescription = null,
            contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(230.dp),
        )
        Spacer(Modifier.height(28.dp))
        Text("얼굴을 움직이는\n작은 시간", fontSize = 34.sp, fontWeight = FontWeight.Bold, lineHeight = 40.sp)
        Spacer(Modifier.height(12.dp))
        Text("안내를 따라 편안하게 움직이고,\n운동한 시간을 기록하세요.", fontSize = 20.sp, color = Brand.secondary, lineHeight = 28.sp)
        Spacer(Modifier.height(24.dp))
        listOf("로그인 없이 바로 시작", "운동 기록은 이 기기에만 저장", "원할 때 켜는 얼굴 메쉬와 추정 횟수").forEach {
            Text("•  $it", fontSize = 17.sp, modifier = Modifier.padding(vertical = 6.dp))
        }
        Spacer(Modifier.height(20.dp))
        Footnote("얼굴 메쉬와 표정 변화는 기기 안에서만 실시간 처리하며 얼굴 데이터는 저장·전송하지 않습니다. 횟수는 참고용 추정값입니다. 의료적 평가·진단·처방을 제공하지 않으며, 운동 완료는 동작의 정확성을 뜻하지 않습니다.")
        TextButton(onClick = onPrivacy, modifier = Modifier.padding(vertical = 8.dp)) { Text("개인정보 처리방침 보기") }
        PrimaryButton("시작하기", onClick = onContinue)
        Spacer(Modifier.height(24.dp))
    }
}

// ---------- Routines ----------

@Composable
private fun RoutinesScreen(onOpen: (Routine) -> Unit) {
    Page("운동") {
        Text("FACE FITNESS", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp, color = Brand.accent)
        Spacer(Modifier.height(10.dp))
        Text("오늘은 가볍게,\n얼굴을 움직여요.", fontSize = 34.sp, fontWeight = FontWeight.Bold, lineHeight = 40.sp)
        Spacer(Modifier.height(8.dp))
        Text("편안한 범위에서, 나의 속도로.", color = Brand.secondary)
        Spacer(Modifier.height(28.dp))
        val daily = Catalog.routines[0]
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Brand.surface)
                .clickable { onOpen(daily) }.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Image(
                painterResource(R.drawable.art_neutral), contentDescription = null,
                contentScale = ContentScale.Crop, modifier = Modifier.size(width = 108.dp, height = 148.dp),
            )
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("기본 루틴", fontSize = 12.sp, color = Brand.accent)
                Text(daily.title, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("눈썹 · 눈 · 미소\n3가지 동작", fontSize = 15.sp, color = Brand.secondary)
                Text("루틴 보기 →", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(28.dp))
        Text("다른 움직임", fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Catalog.routines.drop(1).forEach { routine ->
            Row(
                Modifier.fillMaxWidth().clickable { onOpen(routine) }.padding(vertical = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(routine.title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                    Text(routine.subtitle, fontSize = 15.sp, color = Brand.secondary)
                }
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Brand.secondary)
            }
            HorizontalDivider(color = Brand.surface)
        }
        Spacer(Modifier.height(20.dp))
        Footnote("움직임이 불편하면 중단하세요. 치료 중이거나 얼굴 움직임에 어려움이 있다면 담당 전문가와 상의한 내용을 우선하세요.")
        Spacer(Modifier.height(24.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RoutineDetailScreen(routine: Routine, onBack: () -> Unit, onStart: (Int) -> Unit) {
    var seconds by rememberSaveable { mutableStateOf(30) }
    Page(
        "루틴 안내", onBack = onBack,
        bottomBar = {
            Box(Modifier.fillMaxWidth().background(Brand.surface).padding(16.dp), contentAlignment = Alignment.Center) {
                PrimaryButton("이 루틴 시작하기", Modifier.widthIn(max = 600.dp)) { onStart(seconds) }
            }
        },
    ) {
        Text(routine.title, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text("정해진 횟수나 동작 크기를 맞출 필요는 없어요.\n안내 시간은 원할 때 멈추거나 줄일 수 있습니다.", color = Brand.secondary)
        SectionTitle("따라 할 동작")
        Card {
            routine.movements.forEachIndexed { index, movement ->
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource(artwork(movement.artwork)), contentDescription = null, modifier = Modifier.size(width = 76.dp, height = 62.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${index + 1}. ${movement.title}", fontWeight = FontWeight.SemiBold)
                        Text(movement.detail, fontSize = 15.sp, color = Brand.secondary)
                    }
                }
            }
        }
        SectionTitle("안내 시간 선택")
        val options = listOf(20, 30, 45)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            options.forEachIndexed { index, option ->
                SegmentedButton(
                    selected = seconds == option,
                    onClick = { seconds = option },
                    shape = SegmentedButtonDefaults.itemShape(index, options.size),
                ) { Text("${option}초") }
            }
        }
        Spacer(Modifier.height(8.dp))
        Footnote("총 안내 시간 ${seconds * routine.movements.size}초 · 쉬는 시간은 자유롭게")
        Spacer(Modifier.height(20.dp))
        Footnote("카메라를 켜지 않아도 운동할 수 있어요. 켜면 얼굴 메쉬와 추정 횟수를 보여줍니다. 동작 정확성이나 건강 상태는 평가하지 않습니다.")
        Spacer(Modifier.height(24.dp))
    }
}

// ---------- History ----------

@Composable
private fun HistoryScreen(history: HistoryStore, onOpen: (WorkoutRecord) -> Unit) {
    var deleting by remember { mutableStateOf<WorkoutRecord?>(null) }
    Page("기록") {
        history.error?.let { error ->
            Card {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = Brand.warning)
                    Text(error, color = Brand.warning)
                }
                TextButton(onClick = history::reload) { Text("다시 읽기") }
            }
            Spacer(Modifier.height(16.dp))
        }
        if (history.records.isEmpty() && history.error == null) {
            Column(
                Modifier.fillMaxWidth().padding(top = 120.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("아직 운동 기록이 없어요", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("루틴을 따라 움직인 뒤 ‘기록 저장’을 눌러보세요.\n짧게 움직인 시간도 남길 수 있어요.", color = Brand.secondary)
            }
            return@Page
        }
        history.records.forEach { record ->
            Row(
                Modifier.fillMaxWidth().clickable { onOpen(record) }.padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row {
                        Text(record.routineTitle, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text("${record.activeSeconds}초", fontWeight = FontWeight.SemiBold, color = Brand.accent)
                    }
                    Text(formatDate(record.dateMillis), fontSize = 15.sp, color = Brand.secondary)
                    Text(
                        if (record.isComplete) "전체 안내 완료" else "중간에 마침 · 안내 완료 ${record.completedSteps}/${record.plannedSteps}",
                        fontSize = 12.sp, color = Brand.secondary,
                    )
                }
                TextButton(onClick = { deleting = record }) { Text("삭제", color = Color(0xFFFF453A)) }
            }
            HorizontalDivider(color = Brand.surface)
        }
        Spacer(Modifier.height(12.dp))
        Footnote("운동 시간과 감지된 추정 횟수를 기록합니다. 쉬는 시간은 제외되며, 얼굴 데이터는 저장하지 않습니다.")
        Spacer(Modifier.height(24.dp))
    }
    deleting?.let { record ->
        ConfirmDialog("이 운동 기록을 삭제할까요?", "기록 삭제", onConfirm = {
            history.delete(record)
            deleting = null
        }, onDismiss = { deleting = null })
    }
}

@Composable
private fun RecordDetailContent(record: WorkoutRecord) {
    Text(record.routineTitle, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(12.dp))
    Card {
        LabeledRow("날짜", formatDate(record.dateMillis))
        LabeledRow("움직인 시간", "${record.activeSeconds}초")
        LabeledRow("안내 완료", "${record.completedSteps} / ${record.plannedSteps} 동작")
        LabeledRow("상태", if (record.isComplete) "전체 안내 완료" else "중간에 마침")
    }
    SectionTitle("선택한 동작")
    Card { record.movementTitles.forEach { Text(it) } }
    record.estimatedRepetitions?.let { counts ->
        SectionTitle("추정 횟수")
        Card {
            record.movementTitles.forEach { title -> counts[title]?.let { LabeledRow(title, "${it}회") } }
            Footnote("표정 변화의 참고 기록으로, 실제 수행 횟수와 다를 수 있습니다. 정확성·근력·건강 상태를 평가하지 않습니다.")
        }
    }
    Spacer(Modifier.height(16.dp))
    Footnote("선택한 동작 목록에는 중단하여 끝내지 않은 동작도 포함됩니다. 안내 완료는 타이머가 끝났다는 뜻이며, 실제 동작 수행 여부나 정확성은 판정하지 않습니다.")
    Spacer(Modifier.height(24.dp))
}

// ---------- Settings ----------

@Composable
private fun SettingsScreen(history: HistoryStore, preferences: Preferences, onPrivacy: () -> Unit, onHelp: () -> Unit) {
    val context = LocalContext.current
    val voice = remember { VoiceGuide(context) }
    var deletingAll by remember { mutableStateOf(false) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_PAUSE) voice.stop() }
        owner.lifecycle.addObserver(observer)
        onDispose {
            owner.lifecycle.removeObserver(observer)
            voice.shutdown()
        }
    }
    Page("설정") {
        SectionTitle("운동 안내")
        Card {
            ToggleRow("음성 안내", preferences.voiceCues, preferences::updateVoiceCues)
            TextButton(onClick = { voice.speak("얼굴을 편안하게 움직여 보세요. 음성 안내가 켜져 있습니다.") }) { Text("소리 확인") }
            Footnote("안내 시작 때 동작을 읽고, 감지된 횟수를 알려줍니다. 소리가 나오지 않으면 기기 음량과 연결된 오디오 기기를 확인해 주세요.")
            voice.error?.let { Footnote(it, Brand.warning) }
        }
        SectionTitle("개인정보와 기록")
        Card {
            LinkRow("개인정보 처리방침", onPrivacy)
            Footnote("기록은 이 기기에만 저장하며 서버와 동기화하거나 기기 백업에 포함하지 않습니다. 앱을 삭제하거나 기기를 바꾸면 복원할 수 없습니다.")
            TextButton(onClick = { deletingAll = true }) { Text("모든 운동 기록 삭제", color = Color(0xFFFF453A)) }
            history.error?.let { Footnote(it, Brand.warning) }
        }
        SectionTitle("도움말")
        Card {
            LinkRow("앱 사용 안내", onHelp)
            LinkRow("문의하기") { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(SUPPORT_URL))) }
            Footnote("문의할 때 얼굴 사진·영상이나 의료정보를 올리지 마세요.")
        }
        Spacer(Modifier.height(20.dp))
        Card {
            LabeledRow("Face Fitness", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            Footnote("얼굴 움직임 연습과 개인 운동 기록을 위한 앱입니다. 의료적 평가·진단·처방 또는 치료 효과를 제공하지 않습니다.")
        }
        Spacer(Modifier.height(24.dp))
    }
    if (deletingAll) {
        ConfirmDialog("이 기기의 운동 기록을 모두 삭제할까요? 복구할 수 없습니다.", "모든 기록 삭제", onConfirm = {
            history.deleteAll()
            deletingAll = false
        }, onDismiss = { deletingAll = false })
    }
}

@Composable
private fun LinkRow(label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onClick).semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Brand.secondary)
    }
}

@Composable
private fun TextBlock(title: String, vararg paragraphs: String) {
    SectionTitle(title)
    Card { paragraphs.forEach { Text(it, fontSize = 15.sp, lineHeight = 22.sp) } }
}

@Composable
fun PrivacyContent() {
    Text("Face Fitness Android 개인정보 처리방침", fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
    Text("시행일: Google Play 출시일", color = Brand.secondary, modifier = Modifier.padding(top = 4.dp))
    TextBlock(
        "카메라",
        "운동 화면에서 사용자가 거울을 켤 때만 전면 카메라를 사용합니다. 앱에 포함된 Google MediaPipe 얼굴 랜드마크 모델로 얼굴 메쉬와 표정 변화를 기기 안에서 실시간 처리해 메쉬와 추정 횟수를 보여줍니다. 얼굴 식별·인증·진단에는 사용하지 않습니다. 사진·영상·얼굴 메쉬·표정 계수는 저장·전송하지 않으며, 거울을 끄면 처리를 중지합니다. 마이크와 사진 보관함에는 접근하지 않습니다.",
        "거울을 끄거나 운동 화면을 닫거나 앱이 백그라운드로 가면 카메라를 중지합니다. Android 설정에서 카메라 권한을 철회할 수 있으며, 권한이 없어도 안내 그림으로 운동할 수 있습니다.",
    )
    TextBlock(
        "기기에 저장하는 정보",
        "사용자가 저장한 운동 날짜, 선택한 루틴·동작 이름, 운동 시간, 안내 완료 개수와 감지된 동작별 추정 횟수를 기기에만 저장합니다. 추정 횟수에는 얼굴을 식별할 수 있는 데이터가 포함되지 않습니다. 음성 안내 설정과 첫 사용 안내 확인 여부도 기기에 저장합니다.",
        "로그인, 광고, 추적, 분석 SDK와 서버 동기화를 사용하지 않으며 앱에 인터넷 권한이 없습니다. 운동 기록은 앱 전용 저장소에 두고 Google 백업과 기기 간 이전에서 제외합니다.",
    )
    TextBlock(
        "보관과 삭제",
        "운동 기록은 사용자가 삭제할 때까지 기기에 보관합니다. 기록 화면에서 개별 삭제하거나 설정에서 전체 삭제할 수 있습니다. 앱 삭제 시 앱 내부 기록도 삭제되며 다른 기기로 복원할 수 없습니다.",
    )
    TextBlock(
        "외부 문의",
        "문의 링크를 열면 GitHub 서비스의 개인정보 처리방침이 적용됩니다. 얼굴 사진·영상, 진료정보 등 민감한 정보는 게시하지 마세요.",
    )
    TextBlock(
        "적용 범위",
        "이 방침은 Face Fitness Android 앱 1.0에 적용됩니다. 별도의 웹 시제품에는 다른 저장·로그인 동작이 있을 수 있습니다. 개인정보 처리 방식이 바뀌면 방침과 Google Play 공개 내용을 갱신합니다.",
    )
    Spacer(Modifier.height(24.dp))
}

@Composable
fun HelpContent() {
    TextBlock(
        "어떻게 사용하나요?",
        "1. 운동 탭에서 루틴과 동작별 안내 시간을 선택하세요.\n2. 안내 시작을 누르고 편안한 범위에서 움직여보세요.\n3. 동작 사이에는 원하는 만큼 쉬고 다음 동작을 시작하세요.\n4. 마친 뒤 기록 저장을 누르면 기록 탭에서 확인할 수 있습니다.",
    )
    TextBlock(
        "거울과 타이머",
        "거울 켜기를 누르면 카메라 권한을 요청하고 얼굴 메쉬도 표시합니다. 카메라를 쓰지 않아도 됩니다. 통화·화면 잠금·앱 전환 중에는 타이머가 일시정지하고 카메라가 꺼집니다. 돌아온 뒤 이어서 하기를 눌러주세요.",
    )
    TextBlock(
        "추정 횟수와 음성",
        "안내가 진행 중이고 얼굴이 보일 때 표정 변화와 편안한 상태로 돌아오는 변화를 셉니다. 얼굴을 놓치거나 쉬는 중에는 세지 않습니다. 자연스러운 눈깜박임도 포함되며 모음의 종류는 구분하지 않습니다. 추정값은 실제 횟수와 다를 수 있고 정확성·근력·치료 효과의 평가가 아닙니다. 횟수를 올리려고 동작을 키우지 마세요.",
        "음성 안내는 기본으로 켜져 있습니다. 운동 화면에서 끄거나 안내 듣기를 누를 수 있습니다. 설정의 소리 확인으로 기기 음량을 확인하세요.",
    )
    TextBlock(
        "기록은 무엇을 뜻하나요?",
        "완료는 안내 시간이 끝났다는 뜻입니다. 실제 동작 수행 여부, 정확성, 근력·근활성도 또는 건강 상태를 측정하지 않습니다. 중간에 마친 세션도 운동한 시간만 저장할 수 있습니다.",
    )
    TextBlock(
        "편안하게 사용하세요",
        "불편하거나 통증이 있으면 중단하세요. 안내 시간을 채우거나 움직임을 크게 만들려고 무리하지 마세요. 치료 중이거나 얼굴 움직임에 어려움이 있다면 담당 전문가와 상의한 내용을 우선하세요.",
    )
    Spacer(Modifier.height(24.dp))
}
