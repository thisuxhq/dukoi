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
import com.thisux.dukoi.ChargeLimit
import com.thisux.dukoi.DomainStatus
import com.thisux.dukoi.PairedComputer
import com.thisux.dukoi.ui.theme.Canvas
import com.thisux.dukoi.ui.theme.Card
import com.thisux.dukoi.ui.theme.Crashed
import com.thisux.dukoi.ui.theme.Lavender
import com.thisux.dukoi.ui.theme.Restarting
import com.thisux.dukoi.ui.theme.Running
import com.thisux.dukoi.ui.theme.SoftRed
import com.thisux.dukoi.ui.theme.Styles
import com.thisux.dukoi.ui.theme.Violet

@Composable
fun SettingsScreen(
  computers: List<PairedComputer>,
  phoneName: String,
  address: String?,
  setupDone: Boolean,
  chargeLimit: ChargeLimit,
  cloudflare: DomainStatus?,
  hasApps: Boolean,
  onBack: () -> Unit,
  onRemove: (PairedComputer) -> Unit,
  onFinishSetup: () -> Unit,
  onBatteryCare: () -> Unit,
  onDisconnectCloudflare: () -> Unit,
  onStopAll: () -> Unit,
) {
  Column(Modifier.fillMaxSize().background(Canvas).systemBarsPadding().verticalScroll(rememberScrollState())) {
    BackLink("Apps", onBack)
    Column(Modifier.padding(horizontal = Gutter)) {
      Spacer(Modifier.height(20.dp))
      Text("Settings", style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp))

      Section("Computers") {
        if (computers.isEmpty()) {
          Text("None yet. Run dukoi pair on your computer.", style = Styles.Small.copy(fontSize = 14.sp))
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
          InfoRow("Name") { Text(phoneName, style = Styles.Log.copy(fontSize = 13.sp, color = com.thisux.dukoi.ui.theme.Ink)) }
          InfoRow("Address") { Text(address ?: "Not on Wi-Fi", style = Styles.Log.copy(fontSize = 13.sp, color = com.thisux.dukoi.ui.theme.Ink)) }
          InfoRow("Setup", if (setupDone) null else onFinishSetup) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
              Dot(if (setupDone) Running else Restarting)
              Text(if (setupDone) "Done" else "Finish setup", style = Styles.Label)
            }
          }
          InfoRow("Battery care", onBatteryCare) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
              Dot(limitColor(chargeLimit))
              Text(
                when (chargeLimit) {
                  ChargeLimit.ON -> "Limit on"
                  ChargeLimit.OFF -> "Limit off"
                  ChargeLimit.UNKNOWN -> "Check"
                },
                style = Styles.Label,
              )
              Icon("arrow-right-01", 18.dp, com.thisux.dukoi.ui.theme.Muted)
            }
          }
        }
      }

      // Only once the phone has logged in to Cloudflare for a custom domain.
      if (cloudflare?.loggedIn == true) {
        Section("Cloudflare") {
          Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
              Text(cloudflare.zone ?: "Connected", style = Styles.Body.copy(fontWeight = Styles.Button.fontWeight), maxLines = 1, overflow = TextOverflow.Ellipsis)
              val apps = cloudflare.domains.map { it.app }
              Text(if (apps.isEmpty()) "No apps yet" else "Used by ${apps.joinToString(", ")}", style = Styles.Small, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text("Disconnect", style = Styles.Label.copy(fontSize = 14.sp, fontWeight = Styles.Button.fontWeight), color = Violet, modifier = Modifier.tap(onDisconnectCloudflare).padding(start = 12.dp))
          }
        }
      }

      if (hasApps) {
        Spacer(Modifier.height(32.dp))
        Box(Modifier.fillMaxWidth().height(48.dp).background(SoftRed).press(onStopAll), contentAlignment = Alignment.Center) {
          Text("Stop all apps", style = Styles.Button.copy(fontSize = 14.sp), color = Crashed)
        }
      }
      Spacer(Modifier.height(28.dp))
    }
  }
}

@Composable
internal fun Section(title: String, content: @Composable () -> Unit) {
  Spacer(Modifier.height(32.dp))
  Text(title, style = Styles.Section)
  Spacer(Modifier.height(12.dp))
  content()
}

@Composable
internal fun InfoRow(label: String, onClick: (() -> Unit)? = null, value: @Composable () -> Unit) {
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
