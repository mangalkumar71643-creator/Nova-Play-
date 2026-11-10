package com.novaplay.admin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After a reboot the SMS phone starts again if it was turned on. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Prefs.isOn(context) && !Prefs.token(context).isNullOrBlank()) {
            try { SmsGatewayService.start(context) } catch (_: Exception) {}
        }
    }
}
