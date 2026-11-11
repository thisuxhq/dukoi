package com.thisux.droidhost

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.provider.Settings
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale

/** Whether the phone stops charging before 100%. Android has no public API for this, so we watch. */
enum class ChargeLimit { ON, OFF, UNKNOWN }

data class BatteryReading(
  val level: Int?,
  val temperatureC: Int?,
  val health: String,
  val pluggedIn: Boolean,
  val charging: Boolean,
)

data class BatteryWeek(
  /** Average hours a day spent plugged in at 100%, or null with no history yet. */
  val hoursFullPerDay: Int?,
  val hottestC: Int?,
  /** "Tuesday", or null with no history yet. */
  val hottestDay: String?,
)

data class BatteryCare(val now: BatteryReading, val limit: ChargeLimit, val week: BatteryWeek)

/**
 * Battery care for a phone that stays plugged in all day. The service writes
 * a sample every 10 minutes; the app reads them back for the last 7 days.
 */
object Battery {
  const val SAMPLE_MS = 10 * 60_000L
  private const val WEEK_S = 7 * 24 * 3600L
  private const val FILE = "battery.csv"

  fun read(context: Context): BatteryReading {
    val b = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      ?: return BatteryReading(null, null, "Unknown", pluggedIn = false, charging = false)
    val level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
    val tenths = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
    val status = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    return BatteryReading(
      level = if (level >= 0 && scale > 0) level * 100 / scale else null,
      temperatureC = if (tenths == Int.MIN_VALUE) null else Math.round(tenths / 10f),
      health = when (b.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)) {
        BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
        BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Too hot"
        BatteryManager.BATTERY_HEALTH_COLD -> "Too cold"
        BatteryManager.BATTERY_HEALTH_DEAD -> "Worn out"
        BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE, BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "Faulty"
        else -> "Unknown"
      },
      pluggedIn = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0,
      charging = status == BatteryManager.BATTERY_STATUS_CHARGING,
    )
  }

  /** Called by the service. Appends one sample and drops anything older than a week. */
  fun sample(context: Context) {
    val r = read(context)
    val level = r.level ?: return
    val now = Instant.now().epochSecond
    val file = File(context.filesDir, FILE)
    val kept = samples(context).filter { now - it.at < WEEK_S }
    val line = Sample(now, level, r.pluggedIn, r.temperatureC)
    file.writeText((kept + line).joinToString("") { "${it.at},${it.level},${if (it.plugged) 1 else 0},${it.tempC ?: ""}\n" })
  }

  fun care(context: Context): BatteryCare {
    val now = read(context)
    val week = samples(context)
    return BatteryCare(now, limit(now, week), summarise(week))
  }

  /**
   * Plugged in and resting below 90% means a limit is on. Plugged in near
   * 100% means it's off. Unplugged, we look at the last day of samples.
   */
  private fun limit(now: BatteryReading, week: List<Sample>): ChargeLimit {
    val level = now.level
    if (now.pluggedIn && level != null) {
      if (level >= 95) return ChargeLimit.OFF
      if (level <= 90 && !now.charging) return ChargeLimit.ON
    }
    val dayAgo = Instant.now().epochSecond - 24 * 3600
    val plugged = week.filter { it.plugged && it.at > dayAgo }
    return when {
      plugged.any { it.level >= 99 } -> ChargeLimit.OFF
      plugged.size >= 6 && plugged.all { it.level <= 90 } -> ChargeLimit.ON
      else -> ChargeLimit.UNKNOWN
    }
  }

  private fun summarise(week: List<Sample>): BatteryWeek {
    if (week.isEmpty()) return BatteryWeek(null, null, null)
    val days = ((week.last().at - week.first().at) / 86_400.0).coerceAtLeast(1.0)
    val fullHours = week.count { it.plugged && it.level >= 100 } * (SAMPLE_MS / 3_600_000.0)
    val hottest = week.filter { it.tempC != null }.maxByOrNull { it.tempC!! }
    val day = hottest?.let {
      Instant.ofEpochSecond(it.at).atZone(ZoneId.systemDefault()).dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())
    }
    return BatteryWeek(Math.round(fullHours / days).toInt().coerceAtMost(24), hottest?.tempC, day)
  }

  private data class Sample(val at: Long, val level: Int, val plugged: Boolean, val tempC: Int?)

  private fun samples(context: Context): List<Sample> = runCatching {
    File(context.filesDir, FILE).readLines().mapNotNull { line ->
      val p = line.split(",")
      if (p.size < 4) return@mapNotNull null
      Sample(p[0].toLongOrNull() ?: return@mapNotNull null, p[1].toIntOrNull() ?: return@mapNotNull null, p[2] == "1", p[3].toIntOrNull())
    }
  }.getOrDefault(emptyList())

  /** Opens the phone's battery page, where each brand keeps its charge limit. */
  fun openSettings(context: Context) {
    val battery = Intent(Intent.ACTION_POWER_USAGE_SUMMARY).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(battery) }
      .onFailure { context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
  }
}
