package com.novaplay.admin

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.telephony.SmsManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sends the players' password reset codes as SMS with this phone's SIM card, instead of an SMS company.
 *
 * While it runs it asks the server for waiting texts every few seconds (GET /api/admin/sms-gateway/next,
 * with the admin's session token); each text is sent with SmsManager and its result is reported back
 * (POST /api/admin/sms-gateway/<id>/result). Asking is also how the server knows this phone is connected.
 * Started from the admin panel inside the app (MainActivity's NovaSms), kept in the foreground with a
 * notification so Android does not stop it, and restarted after a reboot (BootReceiver).
 */
class SmsGatewayService : Service() {
    private var worker: Thread? = null
    @Volatile private var running = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var resultReceiver: BroadcastReceiver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Prefs.setOn(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            showForeground("Waiting for password reset codes to text")
        } catch (e: Throwable) {
            Prefs.setLastError(this, "Could not start the notification service: ${e.javaClass.simpleName} ${e.message ?: ""}")
            Prefs.setOn(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        if (!running) {
            running = true
            registerResultReceiver()
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "novaplay:smsgateway").apply { setReferenceCounted(false); acquire() }
            worker = Thread { loop() }.also { it.isDaemon = true; it.start() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        worker?.interrupt()
        resultReceiver?.let { try { unregisterReceiver(it) } catch (_: Exception) {} }
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    private fun showForeground(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "SMS sending", NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("NovaPlay SMS phone is ON")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION_ID, n)
    }

    private fun loop() {
        while (running) {
            try {
                val token = Prefs.token(this)
                if (token.isNullOrBlank()) { Prefs.setOn(this, false); stopSelf(); return }
                val res = call("GET", "/api/admin/sms-gateway/next", token, null)
                Prefs.setLastPoll(this, res.code)
                if (res.code == 401 || res.code == 403) {
                    // The session ended: turn it on again from the panel.
                    Prefs.setLastError(this, "The server refused the login (code ${res.code}). Log out of the panel, log in again and turn it ON again.")
                    Prefs.setOn(this, false)
                    stopSelf()
                    return
                }
                if (res.code == 200) {
                    Prefs.setLastError(this, null)
                    val arr = JSONObject(res.body).getJSONArray("messages")
                    for (i in 0 until arr.length()) {
                        val m = arr.getJSONObject(i)
                        sendText(m.getString("id"), m.getString("phone"), m.getString("body"), token)
                    }
                }
            } catch (_: InterruptedException) {
                return
            } catch (e: Exception) {
                // No internet or a server hiccup: try again on the next round.
                Prefs.setLastError(this, "Could not reach the server: ${e.javaClass.simpleName} ${e.message ?: ""}")
            }
            try { Thread.sleep(POLL_MS) } catch (_: InterruptedException) { return }
        }
    }

    private fun sendText(id: String, phone: String, body: String, token: String) {
        try {
            val sms = if (Build.VERSION.SDK_INT >= 31) getSystemService(SmsManager::class.java) else @Suppress("DEPRECATION") SmsManager.getDefault()
            val sent = PendingIntent.getBroadcast(
                this, id.hashCode(),
                Intent(ACTION_SENT).setPackage(packageName).putExtra("id", id),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val parts = sms.divideMessage(body)
            if (parts.size > 1) {
                val intents = ArrayList<PendingIntent>().apply { repeat(parts.size) { add(sent) } }
                sms.sendMultipartTextMessage(phone, null, parts, intents, null)
            } else {
                sms.sendTextMessage(phone, null, body, sent, null)
            }
        } catch (e: Exception) {
            Prefs.setLastError(this, "SMS could not be sent: ${e.javaClass.simpleName} ${e.message ?: ""}")
            report(id, false, e.message ?: "Could not send")
        }
    }

    // SmsManager says asynchronously whether the text left the phone; that is what is reported to the server.
    private fun registerResultReceiver() {
        val r = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val id = intent.getStringExtra("id") ?: return
                val ok = resultCode == Activity.RESULT_OK
                if (!ok) Prefs.setLastError(context, "The phone could not send an SMS (error $resultCode): no SMS balance, no signal or SMS blocked.")
                Thread { report(id, ok, if (ok) null else "SMS error $resultCode") }.start()
            }
        }
        ContextCompat.registerReceiver(this, r, IntentFilter(ACTION_SENT), ContextCompat.RECEIVER_NOT_EXPORTED)
        resultReceiver = r
    }

    private fun report(id: String, ok: Boolean, error: String?) {
        try {
            val token = Prefs.token(this) ?: return
            val json = JSONObject().put("ok", ok).apply { if (error != null) put("error", error) }
            call("POST", "/api/admin/sms-gateway/$id/result", token, json.toString())
        } catch (_: Exception) {
        }
    }

    private class Res(val code: Int, val body: String)

    private fun call(method: String, path: String, token: String, body: String?): Res {
        val c = URL(BASE + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 10000
            c.readTimeout = 15000
            c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            return Res(code, text)
        } finally {
            c.disconnect()
        }
    }

    companion object {
        const val BASE = "https://novaplay-server.vercel.app"
        const val ACTION_STOP = "com.novaplay.admin.STOP_SMS"
        private const val ACTION_SENT = "com.novaplay.admin.SMS_SENT"
        private const val CHANNEL = "sms_gateway"
        private const val NOTIFICATION_ID = 41
        private const val POLL_MS = 10_000L

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, SmsGatewayService::class.java))
        }

        fun stop(context: Context) {
            Prefs.setOn(context, false)
            context.stopService(Intent(context, SmsGatewayService::class.java))
        }
    }
}
