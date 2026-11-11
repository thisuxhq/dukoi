package com.thisux.droidhost

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * The foreground service Android protects. The agent runs as its child.
 * It also announces the phone on the Wi-Fi (_droidhost._tcp) so
 * `droidhost pair` can find it.
 */
class AgentService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private var nsd: NsdManager? = null
  private var nsdListener: NsdManager.RegistrationListener? = null
  private var pairingWatcher: Thread? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification(),
      if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
    )
    acquireLocks()
    announce()
    AgentSupervisor.start(this)
    watchPairing()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

  override fun onDestroy() {
    pairingWatcher?.interrupt()
    AgentSupervisor.stop()
    runCatching { nsdListener?.let { nsd?.unregisterService(it) } }
    wakeLock?.takeIf { it.isHeld }?.release()
    wifiLock?.takeIf { it.isHeld }?.release()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun acquireLocks() {
    wakeLock = getSystemService(PowerManager::class.java)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DroidHost:agent")
      .apply { setReferenceCounted(false); acquire() }
    @Suppress("DEPRECATION")
    wifiLock = applicationContext.getSystemService(WifiManager::class.java)
      .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "DroidHost:agent")
      .apply { setReferenceCounted(false); acquire() }
  }

  /** Shows a notification for each new pairing request, even when the app is closed. */
  private fun watchPairing() {
    pairingWatcher = Thread({
      val notified = mutableSetOf<String>()
      while (!Thread.currentThread().isInterrupted) {
        Pairing.load()?.first?.forEach { req ->
          if (notified.add(req.publicKey)) Pairing.notify(this, req)
        }
        try { Thread.sleep(1500) } catch (_: InterruptedException) { break }
      }
    }, "pairing-watcher").apply { isDaemon = true; start() }
  }

  /** mDNS: lets the CLI find this phone on the same Wi-Fi. */
  private fun announce() {
    val info = NsdServiceInfo().apply {
      serviceName = "droidhost-${Build.MODEL}".replace(" ", "-")
      serviceType = "_droidhost._tcp"
      port = AgentSupervisor.ADMIN_PORT
    }
    val listener = object : NsdManager.RegistrationListener {
      override fun onServiceRegistered(info: NsdServiceInfo) {}
      override fun onRegistrationFailed(info: NsdServiceInfo, error: Int) {}
      override fun onServiceUnregistered(info: NsdServiceInfo) {}
      override fun onUnregistrationFailed(info: NsdServiceInfo, error: Int) {}
    }
    nsd = getSystemService(NsdManager::class.java)
    runCatching { nsd?.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener) }
      .onSuccess { nsdListener = listener }
  }

  private fun createChannel() {
    val channel = NotificationChannel(CHANNEL_ID, "DroidHost", NotificationManager.IMPORTANCE_LOW)
      .apply { description = "Shows while DroidHost is running your apps" }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun notification(): Notification {
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_server)
      .setContentTitle("DroidHost is running")
      .setContentText("Your apps stay up while this shows.")
      .setContentIntent(open)
      .setOngoing(true)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "agent"
    private const val NOTIFICATION_ID = 1
    private const val PREFS = "droidhost"
    private const val KEY_WANTED = "running"

    fun start(context: Context) {
      context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_WANTED, true).apply()
      ContextCompat.startForegroundService(context, Intent(context, AgentService::class.java))
    }

    fun stop(context: Context) {
      context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_WANTED, false).apply()
      context.stopService(Intent(context, AgentService::class.java))
    }

    /** DroidHost runs unless someone turned it off. */
    fun isWanted(context: Context) =
      context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_WANTED, true)
  }
}
