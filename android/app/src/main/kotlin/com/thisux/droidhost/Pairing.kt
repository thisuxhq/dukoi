package com.thisux.droidhost

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
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
