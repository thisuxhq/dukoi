package com.thisux.droidhost

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URLEncoder

data class PairingRequest(val publicKey: String, val name: String, val code: String)
data class PairedComputer(val publicKey: String, val name: String, val pairedAt: String)

object Pairing {
  private const val CHANNEL_ID = "pairing"

  fun load(): Pair<List<PairingRequest>, List<PairedComputer>>? {
    val json = AgentClient.get("/local/pairing") ?: return null
    val pending = json.optJSONArray("pending")?.let { arr ->
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        PairingRequest(o.getString("publicKey"), o.getString("name"), o.getString("code"))
      }
    }.orEmpty()
    val computers = json.optJSONArray("computers")?.let { arr ->
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        PairedComputer(o.getString("publicKey"), o.getString("name"), o.optString("pairedAt"))
      }
    }.orEmpty()
    return pending to computers
  }

  fun decide(key: String, approve: Boolean): JSONObject? =
    AgentClient.post("/local/pairing/${enc(key)}/${if (approve) "approve" else "deny"}")

  fun remove(key: String): JSONObject? = AgentClient.delete("/local/computers/${enc(key)}")

  private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

  fun formatCode(code: String) = if (code.length == 6) "${code.take(3)} ${code.drop(3)}" else code

  /** Tells the owner a computer is waiting, even when the app is closed. */
  fun notify(context: Context, request: PairingRequest) {
    val nm = context.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Pairing requests", NotificationManager.IMPORTANCE_HIGH),
    )
    val open = PendingIntent.getActivity(
      context, 1,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE,
    )
    val n = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_server)
      .setContentTitle("${request.name} wants to pair")
      .setContentText("Code ${formatCode(request.code)}. Tap to approve or deny.")
      .setContentIntent(open)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()
    nm.notify(request.publicKey.hashCode(), n)
  }

  fun clearNotification(context: Context, key: String) {
    context.getSystemService(NotificationManager::class.java).cancel(key.hashCode())
  }
}

@Composable
fun PairingSection(context: Context) {
  var pending by remember { mutableStateOf(emptyList<PairingRequest>()) }
  var computers by remember { mutableStateOf(emptyList<PairedComputer>()) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(Unit) {
    while (true) {
      withContext(Dispatchers.IO) { Pairing.load() }?.let { (p, c) -> pending = p; computers = c }
      delay(1000)
    }
  }

  pending.forEach { req ->
    Card(
      Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
      Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("${req.name} wants to pair", style = MaterialTheme.typography.titleMedium)
        Text("Check the computer shows the same code:")
        Text(Pairing.formatCode(req.code), style = MaterialTheme.typography.displaySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(onClick = {
            scope.launch(Dispatchers.IO) { Pairing.decide(req.publicKey, true); Pairing.clearNotification(context, req.publicKey) }
            pending = pending - req
          }) { Text("Approve") }
          OutlinedButton(onClick = {
            scope.launch(Dispatchers.IO) { Pairing.decide(req.publicKey, false); Pairing.clearNotification(context, req.publicKey) }
            pending = pending - req
          }) { Text("Deny") }
        }
      }
    }
  }

  if (computers.isNotEmpty()) {
    Text("Paired computers", style = MaterialTheme.typography.titleMedium)
    computers.forEach { pc ->
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Column {
          Text(pc.name)
          Text("Since ${pc.pairedAt.take(10)}", style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = {
          scope.launch(Dispatchers.IO) { Pairing.remove(pc.publicKey) }
          computers = computers - pc
        }) { Text("Remove") }
      }
    }
  }
}
