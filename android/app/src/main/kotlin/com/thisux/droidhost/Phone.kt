package com.thisux.droidhost

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.Inet4Address
import java.net.URLEncoder
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** What the phone app shows, read from the agent on 127.0.0.1. Call off the main thread. */

enum class AppState { STOPPED, STARTING, RUNNING, RESTARTING, CRASHED }

data class AppInfo(
  val name: String,
  val state: AppState,
  val restarts: Int,
  val lastExit: String?,
  val startedAt: Instant?,
  val cpuPercent: Double?,
  val memoryMb: Double?,
  val localUrl: String,
  val publicUrl: String?,
)

data class Vitals(val cpuPercent: Int?, val memoryPercent: Int?, val temperatureC: Int?)

enum class LogKind { OUT, ERR, NOTE }

data class LogLine(val time: String, val kind: LogKind, val text: String)

object Phone {
  fun apps(): List<AppInfo>? = AgentClient.getArray("/local/apps")?.objects()?.map(::parseApp)

  fun app(name: String): AppInfo? = AgentClient.get("/local/apps/${enc(name)}")
    ?.takeIf { it.has("name") }?.let(::parseApp)

  fun logs(name: String, lines: Int = 200): List<LogLine> =
    AgentClient.get("/local/apps/${enc(name)}/logs?lines=$lines")
      ?.optJSONArray("lines")
      ?.let { arr -> (0 until arr.length()).mapNotNull { parseLog(arr.getString(it)) } }
      .orEmpty()

  /** Runs start, stop, restart or rollback. Null on success, otherwise the agent's message. */
  fun control(name: String, action: String): String? {
    val reply = AgentClient.post("/local/apps/${enc(name)}/$action") ?: return "Couldn’t reach DroidHost on this phone."
    return if (reply.has("name")) null else reply.optString("message", "Something went wrong.")
  }

  fun vitals(context: Context): Vitals {
    val status = AgentClient.get("/local/phone")
    val cpu = status?.let {
      val load = it.optJSONArray("load")?.optDouble(0) ?: return@let null
      val cores = it.optInt("cpuCount", 1).coerceAtLeast(1)
      (load / cores * 100).toInt().coerceIn(0, 100)
    }
    val memory = status?.optJSONObject("memory")?.let {
      val total = it.optDouble("totalMb")
      if (total > 0) ((total - it.optDouble("freeMb")) / total * 100).toInt() else null
    }
    return Vitals(cpu, memory, batteryTemperature(context))
  }

  private fun batteryTemperature(context: Context): Int? {
    val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
    val tenths = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
    return if (tenths == Int.MIN_VALUE) null else Math.round(tenths / 10f)
  }

  fun wifiIp(context: Context): String? {
    val cm = context.getSystemService(ConnectivityManager::class.java)
    val props = cm.getLinkProperties(cm.activeNetwork) ?: return null
    return props.linkAddresses.map { it.address }
      .firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
  }

  private fun parseApp(o: JSONObject) = AppInfo(
    name = o.getString("name"),
    state = runCatching { AppState.valueOf(o.getString("state").uppercase()) }.getOrDefault(AppState.STOPPED),
    restarts = o.optInt("restarts"),
    lastExit = o.optStringOrNull("lastExit"),
    startedAt = o.optStringOrNull("startedAt")?.let { runCatching { Instant.parse(it) }.getOrNull() },
    cpuPercent = o.optDoubleOrNull("cpuPercent"),
    memoryMb = o.optDoubleOrNull("memoryMb"),
    localUrl = o.optString("localUrl"),
    publicUrl = o.optStringOrNull("publicUrl"),
  )

  private val clock = DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault())

  /** "2026-11-11T06:12:01.123Z out   hono-api listening on 3000" */
  private fun parseLog(raw: String): LogLine? {
    val time = raw.substringBefore(' ')
    val rest = raw.substringAfter(' ', "")
    val stream = rest.take(5).trim()
    val text = rest.drop(6)
    val shown = runCatching { clock.format(Instant.parse(time)) }.getOrElse { return null }
    val kind = when (stream) {
      "err" -> LogKind.ERR
      "agent" -> LogKind.NOTE
      else -> LogKind.OUT
    }
    return LogLine(shown, kind, text)
  }

  private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
}

/** Each setup step is done only when Android says so. */
object Setup {
  fun notifications(context: Context) = Build.VERSION.SDK_INT < 33 ||
    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

  fun batteryLimitsOff(context: Context) =
    context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)

  fun unrestricted(context: Context) =
    batteryLimitsOff(context) && !context.getSystemService(ActivityManager::class.java).isBackgroundRestricted

  fun done(context: Context) = notifications(context) && batteryLimitsOff(context) && unrestricted(context)
}

fun formatUptime(since: Instant?): String {
  since ?: return "–"
  val d = Duration.between(since, Instant.now())
  return when {
    d.toDays() > 0 -> "${d.toDays()}d"
    d.toHours() > 0 -> "${d.toHours()}h"
    d.toMinutes() > 0 -> "${d.toMinutes()}m"
    else -> "${d.seconds.coerceAtLeast(0)}s"
  }
}

/** A plain-words reason for a crash, from the last error line. */
fun crashReason(app: AppInfo, logs: List<LogLine>): String {
  val lastError = logs.lastOrNull { it.kind == LogKind.ERR }?.text.orEmpty()
  Regex("Cannot find module '([^']+)'").find(lastError)?.let { return "Can’t find the ${it.groupValues[1]} package" }
  Regex("EADDRINUSE").find(lastError)?.let { return "The port is already in use" }
  return app.lastExit?.let { "It $it" } ?: "Your app stopped"
}

private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
private fun JSONObject.optStringOrNull(key: String) = if (isNull(key) || !has(key)) null else optString(key)
private fun JSONObject.optDoubleOrNull(key: String) = if (isNull(key) || !has(key)) null else optDouble(key)
