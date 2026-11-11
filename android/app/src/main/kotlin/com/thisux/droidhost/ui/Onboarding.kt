package com.thisux.droidhost.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.thisux.droidhost.ui.theme.Canvas
import com.thisux.droidhost.ui.theme.Styles
import com.thisux.droidhost.ui.theme.Violet
import kotlinx.coroutines.delay

/** Welcome, then one screen per setup step that still needs doing, then Pair. */
enum class OnboardingStep(val illustration: String, val title: String, val action: String) {
  WELCOME("welcome", "Turn this phone into a server", "Get started"),
  BACKGROUND("background", "Run in the background", "Allow"),
  BATTERY_LIMITS("battery", "Turn off battery limits", "Turn off"),
  UNRESTRICTED("unrestricted", "Set battery to Unrestricted", "Set to Unrestricted"),
  PAIR("pair", "Pair your computer", ""),
}

private val TOTAL = OnboardingStep.entries.size

/** The shared layout: progress at the top, illustration, big title, then the action. */
@Composable
private fun OnboardingFrame(
  step: OnboardingStep,
  brand: Boolean = false,
  bottom: @Composable ColumnScope.() -> Unit,
) {
  Column(Modifier.fillMaxSize().background(Canvas).systemBarsPadding()) {
    Row(Modifier.fillMaxWidth().height(48.dp).padding(horizontal = Gutter), verticalAlignment = Alignment.CenterVertically) {
      if (brand) Text("DroidHost", style = Styles.CardTitle)
      Grow()
      ProgressDashes(TOTAL, step.ordinal + 1)
    }
    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
      Svg("illustrations/${step.illustration}.svg", 340.dp)
    }
    Column(Modifier.padding(horizontal = Gutter)) {
      Text(step.title, style = Styles.Hero)
      Spacer(Modifier.height(24.dp))
      bottom()
    }
  }
}

@Composable
fun WelcomeScreen(onStart: () -> Unit) {
  OnboardingFrame(OnboardingStep.WELCOME, brand = true) {
    PrimaryButton(OnboardingStep.WELCOME.action, onClick = onStart)
    Spacer(Modifier.height(48.dp))
  }
}

@Composable
fun PermissionScreen(step: OnboardingStep, onAction: () -> Unit, onSkip: () -> Unit) {
  OnboardingFrame(step) {
    PrimaryButton(step.action, onClick = onAction)
    Spacer(Modifier.height(6.dp))
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { QuietButton("Skip", onClick = onSkip) }
    Spacer(Modifier.height(24.dp))
  }
}

@Composable
fun PairScreen(onLater: () -> Unit) {
  OnboardingFrame(OnboardingStep.PAIR) {
    CommandBox("npx droidhost pair", Modifier.fillMaxWidth())
    Spacer(Modifier.height(28.dp))
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      WaitingDots()
      Text("Waiting for your computer", style = Styles.Body)
    }
    Spacer(Modifier.height(36.dp))
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { QuietButton("Later", onClick = onLater) }
    Spacer(Modifier.height(24.dp))
  }
}

/** Three dots with a fading highlight that walks left to right. */
@Composable
private fun WaitingDots() {
  var lit by remember { mutableIntStateOf(0) }
  LaunchedEffect(Unit) { while (true) { delay(400); lit = (lit + 1) % 3 } }
  Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    repeat(3) { i ->
      val alpha = when ((i - lit + 3) % 3) { 0 -> 1f; 2 -> 0.6f; else -> 0.3f }
      Box(Modifier.size(6.dp).background(Violet.copy(alpha = alpha), CircleShape))
    }
  }
}
