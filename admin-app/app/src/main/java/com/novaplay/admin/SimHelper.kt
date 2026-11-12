package com.novaplay.admin

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat

/** The phone's SIM cards, and the SmsManager of the one the admin chose (else the phone's default SMS SIM). */
object SimHelper {
    fun canList(c: Context) = ContextCompat.checkSelfPermission(c, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

    fun active(c: Context): List<SubscriptionInfo> {
        if (!canList(c)) return emptyList()
        return try {
            val sm = c.getSystemService(SubscriptionManager::class.java)
            sm?.activeSubscriptionInfoList ?: emptyList()
        } catch (_: SecurityException) {
            emptyList()
        }
    }

    fun smsManager(c: Context): SmsManager {
        val chosen = Prefs.smsSubId(c)
        val default = if (Build.VERSION.SDK_INT >= 31) c.getSystemService(SmsManager::class.java) else @Suppress("DEPRECATION") SmsManager.getDefault()
        if (chosen < 0) return default
        // The chosen SIM may have been taken out: then the default is used.
        if (active(c).none { it.subscriptionId == chosen }) return default
        return if (Build.VERSION.SDK_INT >= 31) default.createForSubscriptionId(chosen) else @Suppress("DEPRECATION") SmsManager.getSmsManagerForSubscriptionId(chosen)
    }
}
