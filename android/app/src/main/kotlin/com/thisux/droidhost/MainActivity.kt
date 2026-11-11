package com.thisux.droidhost

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.thisux.droidhost.ui.theme.DroidHostTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.Inet4Address

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    if (AgentService.isWanted(this)) AgentService.start(this)
    setContent {
      DroidHostTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
          HomeScreen()
        }
      }
    }
  }
}

@Composable
private fun HomeScreen() {
  val context = LocalContext.current
  val supervisor by AgentSupervisor.status.collectAsStateWithLifecycle()
  var agent by remember { mutableStateOf<JSONObject?>(null) }
  var ip by remember { mutableStateOf<String?>(null) }
  var refresh by remember { mutableStateOf(0) }

  LaunchedEffect(Unit) {
    while (true) {
      agent = withContext(Dispatchers.IO) { AgentClient.get("/local/status") }
      ip = wifiIp(context)
      refresh++
      delay(2000)
    }
  }

  Column(
    modifier = Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("DroidHost", style = MaterialTheme.typography.headlineMedium)

    Card(Modifier.fillMaxWidth()) {
      Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        val ready = agent != null
        Text(if (ready) "Ready" else statusWord(supervisor.state), style = MaterialTheme.typography.titleLarge)
        supervisor.problem?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        agent?.let {
          Text("Node ${it.optString("nodeVersion")} · agent ${it.optString("agentVersion")}")
          Text("${it.optInt("computers")} paired computers · ${it.optInt("apps")} apps")
        }
        Text(ip?.let { "On Wi-Fi at $it" } ?: "Not on Wi-Fi", style = MaterialTheme.typography.bodyMedium)
        if (supervisor.restarts > 0) Text("Agent restarts: ${supervisor.restarts} (last: ${supervisor.lastExit})")
      }
    }

    PairingSection(context)

    SetupChecklist(refresh)

    Text("To pair a computer, run this on it:", style = MaterialTheme.typography.bodyMedium)
    Text("npx droidhost pair", style = MaterialTheme.typography.titleMedium)
  }
}

private fun statusWord(state: AgentSupervisor.State) = when (state) {
  AgentSupervisor.State.STOPPED -> "Stopped"
  AgentSupervisor.State.STARTING -> "Starting…"
  AgentSupervisor.State.RUNNING -> "Starting…"
  AgentSupervisor.State.RESTARTING -> "Restarting…"
  AgentSupervisor.State.FAILED -> "Problem"
}

/** Each step ticks only when Android confirms it. */
@SuppressLint("BatteryLife")
@Composable
private fun SetupChecklist(refresh: Int) {
  val context = LocalContext.current
  val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
  val notificationsOk = Build.VERSION.SDK_INT < 33 ||
    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
  val batteryOk = context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
  refresh // re-read on every refresh

  Text("Setup", style = MaterialTheme.typography.titleMedium)
  Step("Keep DroidHost running", AgentSupervisor.status.value.state != AgentSupervisor.State.FAILED, null) {}
  Step("Allow notifications", notificationsOk, "Allow") {
    if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
  }
  Step("Turn off battery optimization", batteryOk, "Turn off") {
    context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
  }
}

@Composable
private fun Step(label: String, done: Boolean, action: String?, onClick: () -> Unit) {
  Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
    Text((if (done) "✓ " else "○ ") + label)
    if (!done && action != null) OutlinedButton(onClick = onClick) { Text(action) }
  }
}

private fun wifiIp(context: Context): String? {
  val cm = context.getSystemService(ConnectivityManager::class.java)
  val props = cm.getLinkProperties(cm.activeNetwork) ?: return null
  return props.linkAddresses.map { it.address }.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
}
