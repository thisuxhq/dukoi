package com.thisux.dukoi.ui

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
import androidx.compose.foundation.layout.statusBarsPadding
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
import com.thisux.dukoi.AppInfo
import com.thisux.dukoi.AppState
import com.thisux.dukoi.DatabaseInfo
import com.thisux.dukoi.TemplateInfo
import com.thisux.dukoi.Vitals
import com.thisux.dukoi.ui.theme.Canvas
import com.thisux.dukoi.ui.theme.Card
import com.thisux.dukoi.ui.theme.Dashed
import com.thisux.dukoi.ui.theme.DeepRed
import com.thisux.dukoi.ui.theme.Ink
import com.thisux.dukoi.ui.theme.SoftRed
import com.thisux.dukoi.ui.theme.Styles
import com.thisux.dukoi.ui.theme.Violet

/** Why the apps can't run, when that's the case. */
data class Problem(val message: String, val action: String)

@Composable
fun HomeScreen(
  apps: List<AppInfo>?,
  vitals: Vitals,
  problem: Problem?,
  templates: List<TemplateInfo>,
  databases: List<DatabaseInfo>,
  onFix: () -> Unit,
  onDeployed: (AppInfo) -> Unit,
  onOpenApp: (String) -> Unit,
  onOpenDatabase: (String) -> Unit,
  onTemplates: () -> Unit,
  onSettings: () -> Unit,
) {
  val title = when {
    problem != null -> "Apps paused"
    apps.isNullOrEmpty() -> "No apps yet"
    else -> "Apps"
  }
  Column(Modifier.fillMaxSize().background(Canvas)) {
    Box(Modifier.weight(1f).statusBarsPadding()) {
      Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Gutter)) {
        Spacer(Modifier.height(28.dp))
        Row(verticalAlignment = Alignment.Top) {
          Text(title, style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp), modifier = Modifier.weight(1f))
          SettingsButton(Modifier.padding(top = 4.dp), onSettings)
        }
        Spacer(Modifier.height(28.dp))
        when {
          problem != null -> ProblemBox(problem, onFix)
          apps == null -> {}
          // With templates bundled, a new phone can be live in a minute without a computer.
          apps.isEmpty() && databases.isEmpty() && templates.isNotEmpty() -> TemplatesSection(templates, onDeployed)
          apps.isEmpty() && databases.isEmpty() -> EmptyBox()
          else -> {
            StatsCard(
              listOf(
                (vitals.cpuPercent?.let { "$it%" } ?: "–") to "CPU",
                (vitals.memoryPercent?.let { "$it%" } ?: "–") to "Memory",
                (vitals.temperatureC?.let { "$it°C" } ?: "–") to "Temperature",
              ),
              big = true,
            )
            if (apps.isNotEmpty()) {
              Spacer(Modifier.height(32.dp))
              Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                apps.forEach { AppRow(it) { onOpenApp(it.name) } }
              }
            }
            if (databases.isNotEmpty()) {
              Spacer(Modifier.height(32.dp))
              Text("Databases", style = Styles.Section)
              Spacer(Modifier.height(12.dp))
              Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                databases.forEach { DatabaseRow(it) { onOpenDatabase(it.name) } }
              }
            }
          }
        }
        Spacer(Modifier.height(28.dp))
      }
    }
    BottomNav(templates = false, onApps = {}, onTemplates = onTemplates)
  }
}

@Composable
private fun AppRow(app: AppInfo, onClick: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().background(Card).tap(onClick).padding(horizontal = 16.dp, vertical = 18.dp),
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
    CommandBox("dukoi deploy", compact = true)
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
