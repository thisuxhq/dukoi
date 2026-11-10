package com.example.droidhostspike

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Starts the server again after a reboot or app update, if it was running before. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!NodeService.isWanted(context)) return
    NodeSupervisor.logEvent(context, "boot receiver: ${intent.action}")
    NodeService.start(context)
  }
}
