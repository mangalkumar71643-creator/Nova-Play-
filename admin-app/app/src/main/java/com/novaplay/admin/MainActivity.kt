package com.novaplay.admin

import android.Manifest
import android.annotation.SuppressLint
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

    // "Send SMS from this phone": asks for the SMS permission, then starts SmsGatewayService (see NovaSms below).
    private val askSmsPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.SEND_SMS] == true || hasPermission(Manifest.permission.SEND_SMS)) {
            Prefs.setOn(this, true)
            SmsGatewayService.start(this)
            askToStayAlive()
            Toast.makeText(this, "This phone now sends the password reset SMS.", Toast.LENGTH_LONG).show()
        } else {
            Prefs.setOn(this, false)
            Toast.makeText(this, "Allow SMS to use this phone for password reset codes.", Toast.LENGTH_LONG).show()
        }
    }

    private fun hasPermission(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

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

    /** What the admin panel page calls (window.NovaSms) to turn the SMS phone on or off. */
    inner class NovaSmsBridge {
        @JavascriptInterface
        fun isOn(): Boolean = Prefs.isOn(this@MainActivity) && hasPermission(Manifest.permission.SEND_SMS)

        @JavascriptInterface
        fun start(token: String) {
            if (token.isBlank()) return
            Prefs.setToken(this@MainActivity, token)
            runOnUiThread {
                val wanted = ArrayList<String>().apply {
                    add(Manifest.permission.SEND_SMS)
                    if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
                }
                askSmsPermission.launch(wanted.toTypedArray())
            }
        }

        @JavascriptInterface
        fun stop() {
            runOnUiThread { SmsGatewayService.stop(this@MainActivity) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemStatusBar()
        setContentView(R.layout.activity_main)

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
