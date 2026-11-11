package com.thisux.droidhost

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Starts DroidHost after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (AgentService.isWanted(context)) AgentService.start(context)
  }
}
