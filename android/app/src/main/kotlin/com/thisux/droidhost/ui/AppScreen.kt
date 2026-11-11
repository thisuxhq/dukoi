package com.thisux.droidhost.ui

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.droidhost.AppInfo
import com.thisux.droidhost.AppState
import com.thisux.droidhost.LogKind
import com.thisux.droidhost.LogLine
import com.thisux.droidhost.crashReason
import com.thisux.droidhost.formatUptime
import com.thisux.droidhost.ui.theme.Canvas
import com.thisux.droidhost.ui.theme.Card
import com.thisux.droidhost.ui.theme.Crashed
import com.thisux.droidhost.ui.theme.DeepRed
import com.thisux.droidhost.ui.theme.LogError
import com.thisux.droidhost.ui.theme.LogLive
import com.thisux.droidhost.ui.theme.LogNote
import com.thisux.droidhost.ui.theme.LogText
import com.thisux.droidhost.ui.theme.LogTime
import com.thisux.droidhost.ui.theme.Muted
import com.thisux.droidhost.ui.theme.Night
import com.thisux.droidhost.ui.theme.NightGrip
import com.thisux.droidhost.ui.theme.NightRaised
import com.thisux.droidhost.ui.theme.SoftRed
import com.thisux.droidhost.ui.theme.Styles
import com.thisux.droidhost.ui.theme.Violet
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Release speed, in px per second, that counts as a flick. */
private const val FLING = 1500f

@Composable
fun AppScreen(
  app: AppInfo,
  logs: List<LogLine>,
  onBack: () -> Unit,
  onAction: (String) -> Unit,
) {
  val crashed = app.state == AppState.CRASHED
  val density = LocalDensity.current
  val scope = rememberCoroutineScope()

  BoxWithConstraints(Modifier.fillMaxSize().background(Canvas)) {
    val (minPx, lowPx, highPx) = with(density) {
      Triple(96.dp.toPx(), (if (crashed) 420.dp else 300.dp).toPx(), (maxHeight - 120.dp).toPx())
    }
    // The sheet stays wherever it's dragged to. The chevron opens or closes it fully.
    var heightPx by remember { mutableFloatStateOf(lowPx) }
    var settle by remember { mutableStateOf<Job?>(null) }
    val open = heightPx >= highPx - 1f

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
      BackLink("Apps", onBack)
      Column(Modifier.padding(horizontal = Gutter)) {
        Spacer(Modifier.height(12.dp))
        Text(app.name, style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp))
        Spacer(Modifier.height(10.dp))
        StateLabel(app.state, bold = true)
        Spacer(Modifier.height(24.dp))
        if (crashed) CrashBanner(crashReason(app, logs), onRollBack = { onAction("rollback") }, onRetry = { onAction("restart") })
        else Details(app, onAction)
      }
    }

    LogsSheet(
      title = if (heightPx > (lowPx + highPx) / 2) "${app.name} logs" else "Logs",
      lines = logs,
      open = open,
      onToggle = {
        settle?.cancel()
        settle = scope.launch {
          animate(heightPx, if (open) lowPx else highPx, animationSpec = tween(Durations.SHEET, easing = EaseDrawer)) { v, _ -> heightPx = v }
        }
      },
      onDrag = { delta ->
        settle?.cancel()
        heightPx = (heightPx - delta).coerceIn(minPx, highPx)
      },
      // A fast flick opens or closes it fully, carrying the finger's speed (a spring, no bounce).
      // Letting go close to an end snaps there.
      onRelease = { velocity ->
        val near = (highPx - lowPx) * 0.15f
        val target = when {
          velocity < -FLING -> highPx
          velocity > FLING -> lowPx
          heightPx > highPx - near -> highPx
          heightPx in (lowPx - near)..(lowPx + near) -> lowPx
          else -> null
        }
        if (target != null) {
          settle = scope.launch {
            animate(heightPx, target, initialVelocity = -velocity, animationSpec = spring(dampingRatio = 1f, stiffness = 420f)) { v, _ ->
              heightPx = v
            }
          }
        }
      },
      modifier = Modifier.align(Alignment.BottomCenter).height(with(density) { heightPx.toDp() }),
    )
  }
}

@Composable
private fun Details(app: AppInfo, onAction: (String) -> Unit) {
  val clipboard = LocalClipboardManager.current
  val toast = LocalToast.current
  Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
    app.publicUrl?.let { url ->
      LinkRow("Public", url.removePrefix("https://"), Violet) { clipboard.setText(AnnotatedString(url)); toast.show("URL copied") }
    }
    LinkRow("Wi-Fi", app.localUrl.removePrefix("http://"), com.thisux.droidhost.ui.theme.Ink) {
      clipboard.setText(AnnotatedString(app.localUrl)); toast.show("URL copied")
    }
  }
  Spacer(Modifier.height(12.dp))
  StatsCard(
    listOf(
      (app.cpuPercent?.let { "${Math.round(it)}%" } ?: "–") to "CPU",
      (app.memoryMb?.let { "${Math.round(it)} MB" } ?: "–") to "Memory",
      (if (app.state == AppState.RUNNING) formatUptime(app.startedAt) else "–") to "Uptime",
    ),
  )
  Spacer(Modifier.height(12.dp))
  Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    SecondaryButton("Restart", Modifier.weight(1f), height = 44.dp, square = true) { onAction("restart") }
    if (app.state == AppState.STOPPED) {
      SecondaryButton("Start", Modifier.weight(1f), height = 44.dp, square = true) { onAction("start") }
    } else {
      SecondaryButton("Stop", Modifier.weight(1f), height = 44.dp, square = true) { onAction("stop") }
    }
  }
}

@Composable
private fun LinkRow(label: String, value: String, color: Color, onCopy: (() -> Unit)?) {
  Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Text(label, style = Styles.Small.copy(fontSize = 12.sp, lineHeight = 16.sp))
      Text(value, style = Styles.Log.copy(fontSize = 13.sp, lineHeight = 18.sp, color = color), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (onCopy != null) {
      CopyButton(Muted, 18.dp, 32.dp, onCopy)
    }
  }
}

@Composable
private fun CrashBanner(reason: String, onRollBack: () -> Unit, onRetry: () -> Unit) {
  Column(Modifier.fillMaxWidth().background(SoftRed).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      Icon("alert-02", 22.dp, Crashed)
      Text(reason, style = Styles.Body.copy(fontWeight = Styles.Button.fontWeight), color = DeepRed)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Box(Modifier.weight(1f).height(44.dp).background(Violet).tap(onRollBack), contentAlignment = Alignment.Center) {
        Text("Roll back", style = Styles.Button.copy(fontSize = 14.sp), color = Card)
      }
      Box(Modifier.weight(1f).height(44.dp).background(Card).tap(onRetry), contentAlignment = Alignment.Center) {
        Text("Try again", style = Styles.Button.copy(fontSize = 14.sp), color = com.thisux.droidhost.ui.theme.Ink)
      }
    }
  }
}

/** Logs live in a dark sheet. Drag the handle to any height, or tap the chevron to open or close it fully. */
@Composable
private fun LogsSheet(
  title: String,
  lines: List<LogLine>,
  open: Boolean,
  onToggle: () -> Unit,
  onDrag: (Float) -> Unit,
  onRelease: (Float) -> Unit,
  modifier: Modifier,
) {
  val drag = rememberDraggableState(onDrag)
  val list = rememberLazyListState()
  LaunchedEffect(lines.size) { if (lines.isNotEmpty()) list.scrollToItem(lines.lastIndex) }

  Column(modifier.fillMaxWidth().background(Night).navigationBarsPadding()) {
    Column(
      Modifier.fillMaxWidth()
        .draggable(drag, Orientation.Vertical, onDragStopped = { onRelease(it) })
        .padding(start = 20.dp, end = 20.dp, top = 10.dp, bottom = 14.dp),
    ) {
      Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Box(Modifier.size(40.dp, 4.dp).background(NightGrip)) }
      Spacer(Modifier.height(10.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = Styles.CardTitle.copy(fontSize = 18.sp, lineHeight = 22.sp, color = Color.White))
        Spacer(Modifier.width(10.dp))
        Dot(LogLive.copy(alpha = breathing()))
        Grow()
        Box(Modifier.size(32.dp).background(NightRaised).tap(onToggle), contentAlignment = Alignment.Center) {
          Icon(if (open) "arrow-down-01" else "arrow-up-01", 18.dp, Color.White)
        }
      }
    }
    if (lines.isEmpty()) {
      Text("No logs yet", style = Styles.Log.copy(color = LogTime), modifier = Modifier.padding(horizontal = 20.dp))
    }
    LazyColumn(state = list, modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
      items(lines) { line -> LogRow(line) }
      item { Spacer(Modifier.height(16.dp)) }
    }
  }
}

@Composable
private fun LogRow(line: LogLine) {
  val color = when (line.kind) {
    LogKind.NOTE -> LogNote
    LogKind.ERR -> LogError
    LogKind.OUT -> LogText
  }
  Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
    Text(line.time, style = Styles.Log.copy(color = LogTime), maxLines = 1, softWrap = false, modifier = Modifier.width(64.dp))
    Text(
      when (line.kind) { LogKind.NOTE -> "●"; LogKind.ERR -> "err"; LogKind.OUT -> "" },
      style = Styles.Log.copy(color = color),
      modifier = Modifier.width(22.dp),
    )
    Text(line.text, style = Styles.Log.copy(color = color), modifier = Modifier.weight(1f))
  }
}
