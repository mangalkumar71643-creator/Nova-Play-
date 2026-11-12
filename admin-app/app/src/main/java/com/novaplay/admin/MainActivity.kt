package com.novaplay.admin

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import android.widget.Toast

private const val ADMIN_URL = "https://novaplay-server.vercel.app/admin.html"

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout

    // The page's <input type="file"> (popup and slider uploads) waiting for
    // the picked image. It must always be answered, or the input stops
    // opening the picker again.
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        pendingFileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        pendingFileCallback = null
    }

    // "Send SMS from this phone": asks for the SMS permission, then starts SmsGatewayService (see NovaSmsBridge below).
    private val askSmsPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.SEND_SMS] == true || hasPermission(Manifest.permission.SEND_SMS)) {
            beginSending()
        } else {
            Prefs.setOn(this, false)
            Prefs.setLastError(this, "SMS permission is NOT allowed. Phone Settings > Apps > NovaPlay Admin > (three dots) Allow restricted settings, then Permissions > SMS > Allow.")
            openAppSettings()
        }
    }

    // Reading the SIM list, so the admin can choose the SIM that sends the texts.
    private val askPhoneState = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private fun hasPermission(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private fun openAppSettings() {
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        } catch (_: Exception) {
        }
    }

    private fun beginSending() {
        Prefs.setLastError(this, null)
        Prefs.setOn(this, true)
        try {
            SmsGatewayService.start(this)
        } catch (e: Throwable) {
            Prefs.setOn(this, false)
            Prefs.setLastError(this, "Could not start the sending service: ${e.javaClass.simpleName} ${e.message ?: ""}")
            return
        }
        askToStayAlive()
    }

    // Android may stop a background app to save battery; ask to be left alone so codes are still sent with the screen off.
    private fun askToStayAlive() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            }
        } catch (_: Exception) {
        }
    }

    // The result of the test text (did it leave the phone?), kept for the panel.
    private val testSent = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            Prefs.setTestResult(
                context,
                if (resultCode == android.app.Activity.RESULT_OK) "Test SMS was sent by the phone. If it does not reach the number, the SIM has no SMS balance or the network blocked it."
                else "The phone could NOT send the test SMS (error $resultCode): no SIM / no signal / no SMS balance / SMS blocked.",
            )
        }
    }

    /** What the admin panel page calls (window.NovaSms) to turn the SMS phone on or off and to see what is wrong. */
    inner class NovaSmsBridge {
        @JavascriptInterface
        fun isOn(): Boolean = Prefs.isOn(this@MainActivity) && hasPermission(Manifest.permission.SEND_SMS)

        /** Answers at once, in words, what it is doing (the panel shows it). */
        @JavascriptInterface
        fun start(token: String): String {
            if (token.isBlank()) {
                Prefs.setLastError(this@MainActivity, "No login found in the panel. Log out, log in again, then turn it ON.")
                return "No login found in the panel. Log out, log in again, then try again."
            }
            Prefs.setToken(this@MainActivity, token)
            Prefs.setLastError(this@MainActivity, null)
            runOnUiThread {
                if (hasPermission(Manifest.permission.SEND_SMS)) {
                    beginSending()
                } else {
                    val wanted = ArrayList<String>().apply {
                        add(Manifest.permission.SEND_SMS)
                        if (Build.VERSION.SDK_INT >= 33 && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)) add(Manifest.permission.POST_NOTIFICATIONS)
                    }
                    askSmsPermission.launch(wanted.toTypedArray())
                }
            }
            return if (hasPermission(Manifest.permission.SEND_SMS)) "Starting…" else "Asking for the SMS permission…"
        }

        @JavascriptInterface
        fun stop() {
            runOnUiThread { SmsGatewayService.stop(this@MainActivity) }
        }

        /** Sends one text now with this phone's SIM, no server involved: tells if the phone can send SMS at all. */
        @JavascriptInterface
        fun sendTest(phone: String): String {
            if (!hasPermission(Manifest.permission.SEND_SMS)) return "SMS permission is not allowed yet."
            val digits = phone.filter { it.isDigit() }.takeLast(10)
            if (digits.length != 10) return "Enter a 10-digit number."
            return try {
                Prefs.setTestResult(this@MainActivity, "Test SMS handed to the phone…")
                val sms = SimHelper.smsManager(this@MainActivity)
                val sent = android.app.PendingIntent.getBroadcast(
                    this@MainActivity, 7, Intent("com.novaplay.admin.TEST_SENT").setPackage(packageName),
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT,
                )
                sms.sendTextMessage("+91$digits", null, "NovaPlay test SMS: your SMS phone works.", sent, null)
                "Test SMS handed to the phone. See the result below in a few seconds."
            } catch (e: Throwable) {
                "Could not send: ${e.javaClass.simpleName} ${e.message ?: ""}"
            }
        }

        /** JSON the panel shows: permission, service, last contact with the server, last error. */
        @JavascriptInterface
        fun status(): String {
            val c = this@MainActivity
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            return org.json.JSONObject()
                .put("on", Prefs.isOn(c))
                .put("smsPermission", hasPermission(Manifest.permission.SEND_SMS))
                .put("notificationsAllowed", Build.VERSION.SDK_INT < 33 || hasPermission(Manifest.permission.POST_NOTIFICATIONS))
                .put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(packageName))
                .put("lastPollAt", Prefs.lastPollAt(c))
                .put("lastPollCode", Prefs.lastPollCode(c))
                .put("lastError", Prefs.lastError(c) ?: "")
                .put("testResult", Prefs.testResult(c) ?: "")
                .put("version", "1.4")
                .toString()
        }

        /** The SIM cards and the chosen one, for the panel's "SMS SIM" list. */
        @JavascriptInterface
        fun sims(): String {
            val c = this@MainActivity
            val arr = org.json.JSONArray()
            SimHelper.active(c).forEach {
                arr.put(
                    org.json.JSONObject()
                        .put("subId", it.subscriptionId)
                        .put("slot", it.simSlotIndex + 1)
                        .put("name", (it.carrierName ?: it.displayName ?: "").toString()),
                )
            }
            return org.json.JSONObject().put("permission", SimHelper.canList(c)).put("chosen", Prefs.smsSubId(c)).put("sims", arr).toString()
        }

        @JavascriptInterface
        fun askSimPermission() {
            runOnUiThread { askPhoneState.launch(Manifest.permission.READ_PHONE_STATE) }
        }

        /** subId of the SIM that should send the texts; -1 = the phone's default. */
        @JavascriptInterface
        fun chooseSim(subId: Int) {
            Prefs.setSmsSubId(this@MainActivity, subId)
        }

        @JavascriptInterface
        fun openSettings() {
            runOnUiThread { openAppSettings() }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemStatusBar()
        setContentView(R.layout.activity_main)

        ContextCompat.registerReceiver(this, testSent, android.content.IntentFilter("com.novaplay.admin.TEST_SENT"), ContextCompat.RECEIVER_NOT_EXPORTED)
        webView = findViewById(R.id.webView)
        swipeRefresh = findViewById(R.id.swipeRefresh)

        webView.settings.javaScriptEnabled = true
        webView.addJavascriptInterface(NovaSmsBridge(), "NovaSms")
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        // This is a live admin dashboard, not a static page — every open
        // must hit the server, never a cached copy from a previous visit.
        webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
            }
        }

        // Without this a WebView ignores <input type="file"> taps entirely.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = filePathCallback
                return try {
                    pickFile.launch(fileChooserParams.createIntent())
                    true
                } catch (e: Exception) {
                    pendingFileCallback = null
                    false
                }
            }
        }

        swipeRefresh.setOnRefreshListener { webView.reload() }

        // Always a fresh load — restoring saved WebView state after the OS
        // recreates this activity was showing whatever the panel looked
        // like the last time it was open, not what's live now.
        webView.loadUrl(ADMIN_URL)
    }

    // Hides the OS status bar (clock, battery, signal icons) so the page's
    // own top bar is the only one visible — re-applied on focus since a
    // system dialog or the keyboard can bring the status bar back.
    private fun hideSystemStatusBar() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.hide(WindowInsetsCompat.Type.statusBars())
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemStatusBar()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
