package com.thisux.droidhost.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.droidhost.AppInfo
import com.thisux.droidhost.AppState
import com.thisux.droidhost.TemplateInfo
import com.thisux.droidhost.Vitals
import com.thisux.droidhost.ui.theme.Canvas
import com.thisux.droidhost.ui.theme.Card
import com.thisux.droidhost.ui.theme.Dashed
import com.thisux.droidhost.ui.theme.DeepRed
import com.thisux.droidhost.ui.theme.Ink
import com.thisux.droidhost.ui.theme.SoftRed
import com.thisux.droidhost.ui.theme.Styles
import com.thisux.droidhost.ui.theme.Violet

/** Why the apps can't run, when that's the case. */
data class Problem(val message: String, val action: String)

@Composable
fun HomeScreen(
  apps: List<AppInfo>?,
  vitals: Vitals,
  problem: Problem?,
  templates: List<TemplateInfo>,
  onFix: () -> Unit,
  onDeployed: (AppInfo) -> Unit,
  onOpenApp: (String) -> Unit,
  onSettings: () -> Unit,
) {
  val title = when {
    problem != null -> "Apps paused"
    apps.isNullOrEmpty() -> "No apps yet"
    else -> "Apps"
  }
  Box(Modifier.fillMaxSize().background(Canvas).systemBarsPadding()) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Gutter)) {
      Spacer(Modifier.height(28.dp))
      Text(title, style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp), modifier = Modifier.padding(end = 52.dp))
      Spacer(Modifier.height(28.dp))
      when {
        problem != null -> ProblemBox(problem, onFix)
        apps == null -> {}
        // With templates bundled, a new phone can be live in a minute without a computer.
        apps.isEmpty() && templates.isNotEmpty() -> TemplatesSection(templates, onDeployed)
        apps.isEmpty() -> EmptyBox()
        else -> {
          StatsCard(
            listOf(
              (vitals.cpuPercent?.let { "$it%" } ?: "–") to "CPU",
              (vitals.memoryPercent?.let { "$it%" } ?: "–") to "Memory",
              (vitals.temperatureC?.let { "$it°C" } ?: "–") to "Temperature",
            ),
            big = true,
          )
          Spacer(Modifier.height(32.dp))
          Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            apps.forEach { AppRow(it) { onOpenApp(it.name) } }
          }
        }
      }
      Spacer(Modifier.height(28.dp))
    }
    // Settings sits top-right, level with the title.
    Box(
      Modifier.align(Alignment.TopEnd).padding(top = 32.dp, end = Gutter).size(40.dp).background(Card).tap(onSettings),
      contentAlignment = Alignment.Center,
    ) { Icon("settings-02", 20.dp, Ink) }
  }
}

@Composable
private fun AppRow(app: AppInfo, onClick: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().background(Card).tap(onClick).padding(horizontal = 20.dp, vertical = 18.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
      Text(app.name, style = Styles.CardTitle, maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (app.publicUrl != null) {
        Text("Public link", style = Styles.Label, color = Violet)
      } else {
        Text(if (app.state == AppState.RUNNING) "Wi-Fi only" else "No link", style = Styles.Small)
      }
    }
    Spacer(Modifier.width(12.dp))
    StateLabel(app.state)
  }
}

@Composable
private fun EmptyBox() {
  Column(
    Modifier.fillMaxWidth().dashedBorder(Dashed).padding(horizontal = 24.dp, vertical = 40.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text("Deploy from your computer", style = Styles.CardTitle.copy(lineHeight = 26.sp))
    Spacer(Modifier.height(24.dp))
    CommandBox("npx droidhost deploy", compact = true)
  }
}

@Composable
private fun ProblemBox(problem: Problem, onFix: () -> Unit) {
  Column(Modifier.fillMaxWidth().background(SoftRed).padding(horizontal = 22.dp, vertical = 28.dp)) {
    Text(problem.message, style = Styles.Button.copy(lineHeight = 26.sp), color = DeepRed)
    Spacer(Modifier.height(28.dp))
    PrimaryButton(problem.action, height = 48.dp, onClick = onFix)
  }
}
