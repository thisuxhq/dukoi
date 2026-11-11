package com.thisux.droidhost.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.thisux.droidhost.ui.theme.Ink
import com.thisux.droidhost.ui.theme.LogError
import com.thisux.droidhost.ui.theme.LogLive
import com.thisux.droidhost.ui.theme.Styles
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Motion rules (Emil Kowalski's): every animation has a job, UI motion stays under
// 300 ms, things that enter use a strong ease-out, exits are faster than entrances,
// and anything pressable presses in. Android's "Remove animations" setting scales
// all of these to zero, which Compose honours on its own.

/** Strong ease-out, for things entering or responding to a touch. */
val EaseOut = CubicBezierEasing(0.23f, 1f, 0.32f, 1f)

/** For things moving on screen, like the logs sheet opening or closing. */
val EaseDrawer = CubicBezierEasing(0.32f, 0.72f, 0f, 1f)

object Durations {
  const val PRESS = 120
  const val RELEASE = 160
  const val SMALL = 180
  const val SCREEN_IN = 280
  const val SCREEN_OUT = 200
  const val SHEET = 300
}

/**
 * Tap with a press-in instead of a ripple, so the screen feels like it's listening.
 * A quick tap still plays the whole press (down, then back up); otherwise the release
 * arrives before the press-in is visible. [depth] is how far it presses: 0.97 for rows,
 * deeper for buttons.
 */
fun Modifier.tap(onClick: () -> Unit): Modifier = pressIn(0.97f, onClick)

fun Modifier.pressIn(depth: Float, onClick: () -> Unit): Modifier = composed {
  val source = remember { MutableInteractionSource() }
  val scale = remember { Animatable(1f) }
  LaunchedEffect(source) {
    source.interactions.collect { interaction ->
      when (interaction) {
        is PressInteraction.Press -> launch { scale.animateTo(depth, tween(Durations.PRESS, easing = EaseOut)) }
        is PressInteraction.Release, is PressInteraction.Cancel -> launch {
          if (scale.value > depth + 0.005f) scale.animateTo(depth, tween(70, easing = EaseOut))
          scale.animateTo(1f, tween(Durations.RELEASE, easing = EaseOut))
        }
      }
    }
  }
  graphicsLayer { scaleX = scale.value; scaleY = scale.value }.clickable(source, null, onClick = onClick)
}

/** A gentle breathing alpha, for states that are still changing (starting, restarting, live logs). */
@Composable
fun breathing(on: Boolean = true): Float {
  if (!on) return 1f
  val t = rememberInfiniteTransition(label = "breathing")
  val alpha by t.animateFloat(1f, 0.35f, infiniteRepeatable(tween(1000), RepeatMode.Reverse), label = "alpha")
  return alpha
}

/** Text that rolls when its value changes (4% → 6%), so a change reads as a change. */
@Composable
fun RollingText(text: String, style: TextStyle, color: Color = Color.Unspecified) {
  AnimatedContent(
    targetState = text,
    transitionSpec = {
      (slideInVertically(tween(Durations.SMALL, easing = EaseOut)) { it / 3 } + fadeIn(tween(Durations.SMALL, easing = EaseOut)))
        .togetherWith(slideOutVertically(tween(140, easing = EaseOut)) { -it / 3 } + fadeOut(tween(120)))
    },
    label = "rolling",
  ) { Text(it, style = style, color = color) }
}

/**
 * The copy icon turns into a check for a moment after copying, then turns back.
 * The swap scales from 0.8 with a fade, never from nothing.
 */
@Composable
fun CopyButton(tint: Color, size: Dp, box: Dp, onCopy: () -> Unit) {
  var copiedAt by remember { mutableIntStateOf(0) }
  var copied by remember { mutableStateOf(false) }
  LaunchedEffect(copiedAt) {
    if (copiedAt > 0) { copied = true; delay(1500); copied = false }
  }
  Box(Modifier.size(box).tap { onCopy(); copiedAt++ }, contentAlignment = Alignment.Center) {
    AnimatedContent(
      targetState = copied,
      transitionSpec = {
        (scaleIn(tween(Durations.SMALL, easing = EaseOut), initialScale = 0.8f) + fadeIn(tween(Durations.SMALL, easing = EaseOut)))
          .togetherWith(scaleOut(tween(120, easing = EaseOut), targetScale = 0.8f) + fadeOut(tween(100)))
      },
      label = "copy",
    ) { done -> Icon(if (done) "tick-02" else "copy-01", size, tint) }
  }
}

// ── Snackbar ────────────────────────────────────────────────────────────────

class Toast {
  var message by mutableStateOf<String?>(null)
    private set
  var error by mutableStateOf(false)
    private set
  var shownAt by mutableIntStateOf(0)
    private set

  /** Shows [text]; a newer message replaces the current one and restarts its timer. */
  fun show(text: String, error: Boolean = false) {
    message = text
    this.error = error
    shownAt++
  }

  fun hide() { message = null }
}

val LocalToast = staticCompositionLocalOf { Toast() }

/**
 * A short confirmation that drops in at the top and leaves after two seconds; tap to
 * dismiss sooner. Top, not bottom: the logs sheet and Android's own clipboard preview
 * live at the bottom. It enters and exits the same way, and leaves faster than it came.
 */
@Composable
fun BoxScope.ToastHost(toast: Toast) {
  LaunchedEffect(toast.shownAt) {
    if (toast.message != null) { delay(2000); toast.hide() }
  }
  var last by remember { mutableStateOf("") }
  toast.message?.let { last = it }
  AnimatedVisibility(
    visible = toast.message != null,
    enter = slideInVertically(tween(240, easing = EaseOut)) { -it } + fadeIn(tween(200, easing = EaseOut)),
    exit = slideOutVertically(tween(Durations.SMALL, easing = EaseOut)) { -it } + fadeOut(tween(140)),
    modifier = Modifier.align(Alignment.TopCenter),
  ) {
    Box(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Gutter, vertical = 8.dp)) {
      Row(
        Modifier.fillMaxWidth().background(Ink, RoundedCornerShape(4.dp)).tap { toast.hide() }
          .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        if (toast.error) Icon("alert-02", 20.dp, LogError) else Icon("checkmark-circle-02", 20.dp, LogLive)
        Text(last, style = Styles.Body, color = Color.White)
      }
    }
  }
}
