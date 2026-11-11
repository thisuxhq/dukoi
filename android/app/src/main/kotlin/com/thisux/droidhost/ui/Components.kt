package com.thisux.droidhost.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.thisux.droidhost.AppState
import com.thisux.droidhost.ui.theme.Border
import com.thisux.droidhost.ui.theme.Card
import com.thisux.droidhost.ui.theme.Crashed
import com.thisux.droidhost.ui.theme.Divider
import com.thisux.droidhost.ui.theme.Faint
import com.thisux.droidhost.ui.theme.Ink
import com.thisux.droidhost.ui.theme.Muted
import com.thisux.droidhost.ui.theme.Night
import com.thisux.droidhost.ui.theme.Restarting
import com.thisux.droidhost.ui.theme.Running
import com.thisux.droidhost.ui.theme.Styles
import com.thisux.droidhost.ui.theme.Violet
import kotlinx.coroutines.delay

val Gutter = 28.dp
private val ButtonShape = RoundedCornerShape(4.dp)

@Composable
fun PrimaryButton(label: String, modifier: Modifier = Modifier, height: Dp = 52.dp, onClick: () -> Unit) {
  Box(
    modifier.fillMaxWidth().height(height).background(Violet, ButtonShape).tap(onClick),
    contentAlignment = Alignment.Center,
  ) { Text(label, style = Styles.Button, color = Card) }
}

@Composable
fun SecondaryButton(label: String, modifier: Modifier = Modifier, height: Dp = 52.dp, square: Boolean = false, onClick: () -> Unit) {
  val shape = if (square) RoundedCornerShape(0.dp) else ButtonShape
  Box(
    modifier.fillMaxWidth().height(height).background(Card, shape).border(1.dp, Border, shape).tap(onClick),
    contentAlignment = Alignment.Center,
  ) { Text(label, style = if (height < 52.dp) Styles.Button.copy(fontSize = Styles.Label.fontSize) else Styles.Button, color = Ink) }
}

@Composable
fun QuietButton(label: String, color: Color = Ink, onClick: () -> Unit) {
  Text(label, style = Styles.Body, color = color, modifier = Modifier.tap(onClick).padding(8.dp))
}

/** Onboarding progress: one dash per step. */
@Composable
fun ProgressDashes(total: Int, done: Int) {
  Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    repeat(total) { i ->
      val color by animateColorAsState(if (i < done) Violet else Faint, tween(Durations.SHEET, easing = EaseOut), label = "dash")
      Box(Modifier.size(18.dp, 3.dp).background(color))
    }
  }
}

@Composable
fun Dot(color: Color, size: Dp = 7.dp) = Box(Modifier.size(size).background(color, CircleShape))

fun stateColor(state: AppState) = when (state) {
  AppState.RUNNING -> Running
  AppState.STARTING, AppState.RESTARTING -> Restarting
  AppState.CRASHED -> Crashed
  AppState.STOPPED -> Muted
}

fun stateLabel(state: AppState) = when (state) {
  AppState.RUNNING -> "Running"
  AppState.STARTING -> "Starting"
  AppState.RESTARTING -> "Restarting"
  AppState.CRASHED -> "Crashed"
  AppState.STOPPED -> "Stopped"
}

@Composable
fun StateLabel(state: AppState, bold: Boolean = false) {
  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
    val color by animateColorAsState(stateColor(state), tween(200), label = "state")
    // Live states breathe; settled ones sit still.
    val alpha = breathing(state == AppState.STARTING || state == AppState.RESTARTING)
    Dot(color.copy(alpha = alpha), if (bold) 8.dp else 7.dp)
    Text(
      stateLabel(state),
      style = if (bold) Styles.Body.copy(fontSize = Styles.Label.fontSize.times(14f / 13f)) else Styles.Label,
      color = if (state == AppState.CRASHED) Crashed else Ink,
    )
  }
}

/** A white card split into equal cells with hairline dividers: CPU, Memory, … */
@Composable
fun StatsCard(cells: List<Pair<String, String>>, big: Boolean = false) {
  Row(Modifier.fillMaxWidth().background(Card).height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
    cells.forEachIndexed { i, (value, label) ->
      if (i > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(Divider))
      Column(Modifier.weight(1f).padding(horizontal = if (big) 18.dp else 16.dp, vertical = if (big) 16.dp else 14.dp)) {
        RollingText(value, if (big) Styles.Number.copy(fontSize = Styles.Number.fontSize.times(24f / 22f)) else Styles.Number.copy(fontSize = Styles.CardTitle.fontSize))
        Spacer(Modifier.height(2.dp))
        Text(label, style = Styles.Small)
      }
    }
  }
}

/** The dark box with a command and a copy button. */
@Composable
fun CommandBox(command: String, modifier: Modifier = Modifier, compact: Boolean = false) {
  val clipboard = LocalClipboardManager.current
  val toast = LocalToast.current
  val copy = { clipboard.setText(AnnotatedString(command)); toast.show("Command copied") }
  Row(
    modifier.height(if (compact) 44.dp else 56.dp).background(Night, ButtonShape).then(if (compact) Modifier.tap(copy) else Modifier)
      .padding(start = if (compact) 16.dp else 18.dp, end = if (compact) 16.dp else 8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(
      buildAnnotatedString {
        withStyle(SpanStyle(color = Color(0xFF7E7D8A))) { append("$ ") }
        append(command)
      },
      style = if (compact) Styles.Code.copy(fontSize = Styles.Label.fontSize.times(14f / 13f)) else Styles.Code,
      modifier = if (compact) Modifier else Modifier.weight(1f),
    )
    if (!compact) {
      CopyButton(Color.White, 20.dp, 40.dp, copy)
    }
  }
}

/** A dashed outline, for empty states. */
fun Modifier.dashedBorder(color: Color) = drawBehind {
  drawRoundRect(
    color = color,
    style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))),
    cornerRadius = CornerRadius.Zero,
  )
}

@Composable
fun BackLink(label: String, onClick: () -> Unit) {
  Row(
    Modifier.padding(start = 22.dp, top = 12.dp).height(32.dp).tap(onClick),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    Icon("arrow-left-01", 20.dp, Violet)
    Text(label, style = Styles.Label.copy(fontSize = Styles.Label.fontSize.times(14f / 13f)), color = Violet)
  }
}

@Composable
fun RowScope.Grow() = Spacer(Modifier.weight(1f))
