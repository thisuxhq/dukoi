package com.thisux.dukoi.ui

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
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.toArgb
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.dukoi.AppInfo
import com.thisux.dukoi.AppState
import com.thisux.dukoi.LogKind
import com.thisux.dukoi.LogLine
import com.thisux.dukoi.crashReason
import com.thisux.dukoi.formatUptime
import com.thisux.dukoi.ui.theme.Canvas
import com.thisux.dukoi.ui.theme.Card
import com.thisux.dukoi.ui.theme.Crashed
import com.thisux.dukoi.ui.theme.DeepRed
import com.thisux.dukoi.ui.theme.LogError
import com.thisux.dukoi.ui.theme.LogLive
import com.thisux.dukoi.ui.theme.LogNote
import com.thisux.dukoi.ui.theme.LogText
import com.thisux.dukoi.ui.theme.LogTime
import com.thisux.dukoi.ui.theme.Muted
import com.thisux.dukoi.ui.theme.Night
import com.thisux.dukoi.ui.theme.NightGrip
import com.thisux.dukoi.ui.theme.NightRaised
import com.thisux.dukoi.ui.theme.SoftRed
import com.thisux.dukoi.ui.theme.Styles
import com.thisux.dukoi.ui.theme.Violet
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
  WithLogs(app.name, logs, tall = crashed) {
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
}

/**
 * A screen with a dark logs sheet over its bottom: an app's or a database's.
 * [tall] starts the sheet higher, for a crash.
 */
@Composable
fun WithLogs(name: String, logs: List<LogLine>, tall: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
  val density = LocalDensity.current
  val scope = rememberCoroutineScope()

  BoxWithConstraints(Modifier.fillMaxSize().background(Canvas)) {
    val (minPx, lowPx, highPx) = with(density) {
      Triple(96.dp.toPx(), (if (tall) 420.dp else 300.dp).toPx(), (maxHeight - 120.dp).toPx())
    }
    // The sheet stays wherever it's dragged to. The chevron opens or closes it fully.
    var heightPx by remember { mutableFloatStateOf(lowPx) }
    var settle by remember { mutableStateOf<Job?>(null) }
    val open = heightPx >= highPx - 1f

    Column(Modifier.fillMaxSize().statusBarsPadding(), content = content)

    LogsSheet(
      title = if (heightPx > (lowPx + highPx) / 2) "$name logs" else "Logs",
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
  val context = LocalContext.current
  var editing by remember { mutableStateOf(false) }
  // Tap a link to open it; the icons copy it or change how it's public.
  Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
    val url = app.publicUrl
    if (url != null) {
      LinkRow(
        "Public",
        url.removePrefix("https://"),
        Violet,
        onOpen = { openInTab(context, url) },
        onEdit = { editing = true },
      ) { clipboard.setText(AnnotatedString(url)); toast.show("URL copied") }
    } else {
      Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text("Public", style = Styles.Small.copy(fontSize = 12.sp, lineHeight = 16.sp))
          Text("Off", style = Styles.Log.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Muted))
        }
        Text(
          "Make public",
          style = Styles.Label.copy(fontSize = 14.sp, fontWeight = Styles.Button.fontWeight),
          color = Violet,
          modifier = Modifier.tap { editing = true }.padding(vertical = 6.dp),
        )
      }
    }
    LinkRow("Wi-Fi", app.localUrl.removePrefix("http://"), com.thisux.dukoi.ui.theme.Ink, onOpen = { openInTab(context, app.localUrl) }) {
      clipboard.setText(AnnotatedString(app.localUrl)); toast.show("URL copied")
    }
  }
  if (editing) PublicLinkSheet(app) { editing = false }
  // A template deployed on the phone: the next step is getting its code, so that
  // takes the stats card's place.
  val template = app.template
  if (template != null) {
    Spacer(Modifier.height(16.dp))
    MakeItYoursCard(template)
    Spacer(Modifier.height(16.dp))
  } else {
    Spacer(Modifier.height(12.dp))
    // Numbers only mean something while the app runs.
    val live = app.state == AppState.RUNNING
    StatsCard(
      listOf(
        (app.cpuPercent?.takeIf { live }?.let { "${Math.round(it)}%" } ?: "–") to "CPU",
        (app.memoryMb?.takeIf { live }?.let { "${Math.round(it)} MB" } ?: "–") to "Memory",
        (if (live) formatUptime(app.startedAt) else "–") to "Uptime",
      ),
    )
    Spacer(Modifier.height(12.dp))
  }
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
private fun LinkRow(
  label: String,
  value: String,
  color: Color,
  onOpen: () -> Unit,
  onEdit: (() -> Unit)? = null,
  onCopy: (() -> Unit)?,
) {
  Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f).tap(onOpen), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Text(label, style = Styles.Small.copy(fontSize = 12.sp, lineHeight = 16.sp))
      Text(value, style = Styles.Log.copy(fontSize = 13.sp, lineHeight = 18.sp, color = color), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (onCopy != null) {
      CopyButton(Muted, 18.dp, 32.dp, onCopy)
    }
    if (onEdit != null) {
      Box(Modifier.size(32.dp).tap(onEdit), contentAlignment = Alignment.Center) { Icon("edit-02", 18.dp, Muted) }
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
      Box(Modifier.weight(1f).height(44.dp).background(Violet).press(onRollBack), contentAlignment = Alignment.Center) {
        Text("Roll back", style = Styles.Button.copy(fontSize = 14.sp), color = Card)
      }
      Box(Modifier.weight(1f).height(44.dp).background(Card).press(onRetry), contentAlignment = Alignment.Center) {
        Text("Try again", style = Styles.Button.copy(fontSize = 14.sp), color = com.thisux.dukoi.ui.theme.Ink)
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
        .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 14.dp),
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
      Text("No logs yet", style = Styles.Log.copy(color = LogTime), modifier = Modifier.padding(horizontal = 16.dp))
    }
    LazyColumn(state = list, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
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

/** Opens a link in an in-app browser tab, in Dukoi's colours. */
internal fun openInTab(context: Context, url: String) {
  val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(Canvas.toArgb()).build()
  val tab = CustomTabsIntent.Builder().setDefaultColorSchemeParams(colors).setShowTitle(true).build()
  runCatching { tab.launchUrl(context, Uri.parse(url)) }
    .onFailure { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
}
