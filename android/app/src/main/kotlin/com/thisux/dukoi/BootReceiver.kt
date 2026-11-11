package com.thisux.dukoi

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Starts Dukoi after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (AgentService.isWanted(context)) AgentService.start(context)
  }
}
