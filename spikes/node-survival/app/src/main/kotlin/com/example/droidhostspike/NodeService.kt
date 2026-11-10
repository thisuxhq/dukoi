package com.example.droidhostspike

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * The foreground service Android protects. Node runs as its child process.
 *
 * Holds a partial wake lock and a Wi-Fi lock so the server keeps answering with
 * the screen off. Whether that's enough against Doze and vendor killers is what
 * the overnight test checks.
 */
class NodeService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      buildNotification(),
      if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
    )
    acquireLocks()
    logPreviousAppExits()
    NodeSupervisor.logEvent(this, "service created (Android ${Build.VERSION.RELEASE}, ${Build.MANUFACTURER} ${Build.MODEL})")
    NodeSupervisor.start(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // START_STICKY: if Android kills the service, it should recreate it.
    return START_STICKY
  }

  override fun onDestroy() {
    NodeSupervisor.logEvent(this, "service destroyed")
    NodeSupervisor.stop()
    wakeLock?.takeIf { it.isHeld }?.release()
    wifiLock?.takeIf { it.isHeld }?.release()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun acquireLocks() {
    val power = getSystemService(PowerManager::class.java)
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DroidHostSpike:node").apply {
      setReferenceCounted(false)
      acquire()
    }
    val wifi = applicationContext.getSystemService(WifiManager::class.java)
    @Suppress("DEPRECATION")
    wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "DroidHostSpike:node").apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  /** Android 11+ keeps a record of why our app process died. Log the recent ones. */
  private fun logPreviousAppExits() {
    if (Build.VERSION.SDK_INT < 30) return
    val am = getSystemService(ActivityManager::class.java)
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val lastSeen = prefs.getLong("lastExitSeen", 0L)
    val exits = am.getHistoricalProcessExitReasons(packageName, 0, 10).filter { it.timestamp > lastSeen }
    exits.reversed().forEach {
      NodeSupervisor.logEvent(this, "app process died earlier: ${reasonName(it.reason)} - ${it.description ?: "no detail"}")
    }
    exits.maxOfOrNull { it.timestamp }?.let { prefs.edit().putLong("lastExitSeen", it).apply() }
  }

  private fun reasonName(reason: Int) = when (reason) {
    ApplicationExitInfo.REASON_LOW_MEMORY -> "low memory"
    ApplicationExitInfo.REASON_SIGNALED -> "signaled"
    ApplicationExitInfo.REASON_CRASH -> "crash"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "native crash"
    ApplicationExitInfo.REASON_ANR -> "not responding"
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "excessive resource use"
    ApplicationExitInfo.REASON_USER_REQUESTED -> "user force-stopped"
    ApplicationExitInfo.REASON_USER_STOPPED -> "user stopped"
    ApplicationExitInfo.REASON_OTHER -> "other (often a vendor killer)"
    ApplicationExitInfo.REASON_EXIT_SELF -> "exited itself"
    ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "dependency died"
    ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "permission change"
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "initialization failure"
    else -> "reason $reason"
  }

  private fun createChannel() {
    val channel = NotificationChannel(CHANNEL_ID, "Server", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shows while the Node server is running"
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val open = PendingIntent.getActivity(
      this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_server)
      .setContentTitle("Node server running")
      .setContentText("Port ${NodeSupervisor.PORT}. Tap to see status.")
      .setContentIntent(open)
      .setOngoing(true)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "server"
    private const val NOTIFICATION_ID = 1
    const val PREFS = "spike"
    private const val KEY_WANTED = "serverWanted"

    fun start(context: Context) {
      context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_WANTED, true).apply()
      ContextCompat.startForegroundService(context, Intent(context, NodeService::class.java))
    }

    fun stop(context: Context) {
      context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_WANTED, false).apply()
      context.stopService(Intent(context, NodeService::class.java))
    }

    fun isWanted(context: Context) =
      context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_WANTED, false)
  }
}
