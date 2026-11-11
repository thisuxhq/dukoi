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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.droidhost.PairedComputer
import com.thisux.droidhost.ui.theme.Canvas
import com.thisux.droidhost.ui.theme.Card
import com.thisux.droidhost.ui.theme.Crashed
import com.thisux.droidhost.ui.theme.Lavender
import com.thisux.droidhost.ui.theme.Restarting
import com.thisux.droidhost.ui.theme.Running
import com.thisux.droidhost.ui.theme.SoftRed
import com.thisux.droidhost.ui.theme.Styles
import com.thisux.droidhost.ui.theme.Violet

@Composable
fun SettingsScreen(
  computers: List<PairedComputer>,
  phoneName: String,
  address: String?,
  setupDone: Boolean,
  hasApps: Boolean,
  onBack: () -> Unit,
  onRemove: (PairedComputer) -> Unit,
  onFinishSetup: () -> Unit,
  onStopAll: () -> Unit,
) {
  Column(Modifier.fillMaxSize().background(Canvas).systemBarsPadding().verticalScroll(rememberScrollState())) {
    BackLink("Apps", onBack)
    Column(Modifier.padding(horizontal = Gutter)) {
      Spacer(Modifier.height(20.dp))
      Text("Settings", style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp))

      Section("Computers") {
        if (computers.isEmpty()) {
          Text("None yet. Run npx droidhost pair on your computer.", style = Styles.Small.copy(fontSize = 14.sp))
        }
        computers.forEach { pc ->
          Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).background(Lavender), contentAlignment = Alignment.Center) {
              Text(initials(pc.name), style = Styles.Label.copy(fontWeight = Styles.Button.fontWeight), color = Violet)
            }
            Spacer(Modifier.size(14.dp))
            Text(pc.name, style = Styles.Body.copy(fontWeight = Styles.Button.fontWeight), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text("Remove", style = Styles.Label.copy(fontSize = 14.sp, fontWeight = Styles.Button.fontWeight), color = Violet, modifier = Modifier.tap { onRemove(pc) }.padding(start = 12.dp))
          }
        }
      }

      Section("This phone") {
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
          InfoRow("Name") { Text(phoneName, style = Styles.Log.copy(fontSize = 13.sp, color = com.thisux.droidhost.ui.theme.Ink)) }
          InfoRow("Address") { Text(address ?: "Not on Wi-Fi", style = Styles.Log.copy(fontSize = 13.sp, color = com.thisux.droidhost.ui.theme.Ink)) }
          InfoRow("Setup", if (setupDone) null else onFinishSetup) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
              Dot(if (setupDone) Running else Restarting)
              Text(if (setupDone) "Done" else "Finish setup", style = Styles.Label)
            }
          }
        }
      }

      if (hasApps) {
        Spacer(Modifier.height(32.dp))
        Box(Modifier.fillMaxWidth().height(48.dp).background(SoftRed).tap(onStopAll), contentAlignment = Alignment.Center) {
          Text("Stop all apps", style = Styles.Button.copy(fontSize = 14.sp), color = Crashed)
        }
      }
      Spacer(Modifier.height(28.dp))
    }
  }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
  Spacer(Modifier.height(32.dp))
  Text(title, style = Styles.Section)
  Spacer(Modifier.height(12.dp))
  content()
}

@Composable
private fun InfoRow(label: String, onClick: (() -> Unit)? = null, value: @Composable () -> Unit) {
  val base = Modifier.fillMaxWidth().background(Card)
  Row(
    (if (onClick != null) base.tap(onClick) else base).padding(horizontal = 16.dp, vertical = 13.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, style = Styles.Small.copy(fontSize = 14.sp), modifier = Modifier.weight(1f))
    value()
  }
}

private fun initials(name: String): String {
  val words = name.split(Regex("[^A-Za-z0-9]+")).filter { it.isNotEmpty() && it.lowercase() != "on" }
  return words.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
}
