package com.thisux.dukoi

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
  /** Set when the public URL is on a custom domain (it never changes). */
  val domain: String?,
  /** The template it started from on this phone, like "notes-api", else null. */
  val template: String? = null,
)

/** An app you can deploy from the phone in one tap. */
data class TemplateInfo(
  val id: String,
  val name: String,
  val description: String,
  /** The setting it needs first, like TELEGRAM_BOT_TOKEN, else null. */
  val secret: String?,
)

/** What a template deploy returned: the new app, or the agent's own words. */
data class Deployed(val app: AppInfo?, val error: String?)

/** The phone's link to Cloudflare for custom domains. */
data class DomainStatus(val loggedIn: Boolean, val zone: String?, val loginUrl: String?, val domains: List<AppDomain> = emptyList())

/** An app and the domain it's served on. */
data class AppDomain(val app: String, val hostname: String)

/** What an action returned: the new public URL, or the agent's own words if it failed. */
data class Outcome(val publicUrl: String?, val error: String?, val code: String?)

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
    val reply = AgentClient.post("/local/apps/${enc(name)}/$action", timeoutMs = 30_000) ?: return "Couldn’t reach Dukoi on this phone."
    return if (reply.has("name")) null else reply.optString("message", "Something went wrong.")
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  /** Templates bundled with this build. Empty if none are, or the agent is down. */
  fun templates(): List<TemplateInfo> = AgentClient.getArray("/local/templates")?.objects()?.map {
    TemplateInfo(it.getString("id"), it.getString("name"), it.optString("description"), it.optStringOrNull("secret"))
  }.orEmpty()

  /** Deploys a template as an app named after it. It installs and health-checks, so allow a minute. */
  fun deployTemplate(id: String, env: Map<String, String> = emptyMap()): Deployed {
    val body = JSONObject().put("env", JSONObject(env))
    val reply = AgentClient.post("/local/templates/${enc(id)}/deploy", body, timeoutMs = 90_000)
      ?: return Deployed(null, UNREACHABLE)
    reply.optJSONObject("app")?.let { return Deployed(parseApp(it), null) }
    val message = reply.optString("message", "Something went wrong.")
    // One-line hints say what to do; long ones are log tails, which belong in the logs.
    val hint = reply.optStringOrNull("hint")?.takeIf { '\n' !in it }
    return Deployed(null, if (hint != null) "$message $hint" else message)
  }

  // ── Public links ──────────────────────────────────────────────────────────

  fun domainStatus(): DomainStatus? = AgentClient.get("/local/domain")?.let(::parseDomain)

  /** Starts Cloudflare login; the status carries the page to open. */
  fun startDomainLogin(): Pair<DomainStatus?, String?> {
    val reply = AgentClient.post("/local/domain/login", timeoutMs = 20_000) ?: return null to UNREACHABLE
    return if (reply.has("loggedIn")) parseDomain(reply) to null else null to reply.optString("message")
  }

  /** Disconnects the phone from Cloudflare. Null on success, otherwise the agent's message. */
  fun disconnectCloudflare(): String? {
    val reply = AgentClient.delete("/local/domain", timeoutMs = 60_000) ?: return UNREACHABLE
    return if (reply.has("loggedIn")) null else reply.optString("message", "Something went wrong.")
  }

  fun quickLink(name: String) = outcome(AgentClient.post("/local/apps/${enc(name)}/expose", timeoutMs = 45_000))

  fun setDomain(name: String, hostname: String) =
    outcome(AgentClient.post("/local/apps/${enc(name)}/domain", JSONObject().put("hostname", hostname), timeoutMs = 60_000))

  fun makePrivate(name: String) = outcome(AgentClient.delete("/local/apps/${enc(name)}/expose", timeoutMs = 30_000))

  private fun outcome(reply: JSONObject?): Outcome = when {
    reply == null -> Outcome(null, UNREACHABLE, null)
    reply.has("app") -> Outcome(reply.optStringOrNull("publicUrl"), null, null)
    else -> {
      // The hint holds the reason, such as cloudflared's own error line. Show it with the message.
      val message = reply.optString("message", "Something went wrong.")
      val hint = reply.optStringOrNull("hint")?.takeIf { '\n' !in it }
      Outcome(null, if (hint != null) "$message $hint" else message, reply.optStringOrNull("code"))
    }
  }

  private fun parseDomain(o: JSONObject) =
    DomainStatus(
      o.optBoolean("loggedIn"),
      o.optStringOrNull("zone"),
      o.optStringOrNull("loginUrl"),
      o.optJSONArray("domains")?.let { a ->
        (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { AppDomain(it.optString("app"), it.optString("hostname")) } }
      }.orEmpty(),
    )

  private const val UNREACHABLE = "Couldn’t reach Dukoi on this phone."

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
    domain = o.optStringOrNull("domain"),
    template = o.optStringOrNull("template"),
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
