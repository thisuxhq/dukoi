package com.example.droidhostspike

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
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
import androidx.compose.material3.Button
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.droidhostspike.ui.theme.DroidHostSpikeTheme
import kotlinx.coroutines.delay
import java.net.Inet4Address

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      DroidHostSpikeTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
          SpikeScreen()
        }
      }
    }
  }
}

@SuppressLint("BatteryLife")
@Composable
private fun SpikeScreen() {
  val context = LocalContext.current
  val status by NodeSupervisor.status.collectAsStateWithLifecycle()
  var events by remember { mutableStateOf("") }
  var batteryExempt by remember { mutableStateOf(false) }
  var ip by remember { mutableStateOf<String?>(null) }

  val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

  // Refresh things that aren't flows every 2 seconds.
  LaunchedEffect(Unit) {
    while (true) {
      events = NodeSupervisor.eventsFile(context).takeIf { it.exists() }
        ?.readLines()?.takeLast(15)?.reversed()?.joinToString("\n") ?: "No events yet."
      batteryExempt = context.getSystemService(PowerManager::class.java)
        .isIgnoringBatteryOptimizations(context.packageName)
      ip = wifiIp(context)
      delay(2000)
    }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .safeDrawingPadding()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("DroidHost survival spike", style = MaterialTheme.typography.headlineSmall)

    Card(modifier = Modifier.fillMaxWidth()) {
      Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(status.state.name.lowercase().replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.titleLarge)
        status.nodeVersion?.let { Text("Node $it") }
        status.pid?.let { Text("PID $it") }
        Text("Restarts: ${status.restarts}")
        status.lastExit?.let { Text("Last exit: $it") }
        status.problem?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        val url = ip?.let { "http://$it:${NodeSupervisor.PORT}" } ?: "Not on Wi-Fi"
        Text(url, style = MaterialTheme.typography.titleMedium)
      }
    }

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = { NodeService.start(context) }) { Text("Start server") }
      OutlinedButton(onClick = { NodeService.stop(context) }) { Text("Stop") }
    }

    Text("Setup", style = MaterialTheme.typography.titleMedium)
    if (Build.VERSION.SDK_INT >= 33) {
      OutlinedButton(onClick = { notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS) }) {
        Text("Allow notifications")
      }
    }
    OutlinedButton(
      enabled = !batteryExempt,
      onClick = {
        context.startActivity(
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")),
        )
      },
    ) { Text(if (batteryExempt) "✓ Battery optimization off" else "Turn off battery optimization") }

    Text("Events (newest first)", style = MaterialTheme.typography.titleMedium)
    Text(events, fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 14.sp)
  }
}

private fun wifiIp(context: android.content.Context): String? {
  val cm = context.getSystemService(ConnectivityManager::class.java)
  val props = cm.getLinkProperties(cm.activeNetwork) ?: return null
  return props.linkAddresses.map { it.address }.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
}
