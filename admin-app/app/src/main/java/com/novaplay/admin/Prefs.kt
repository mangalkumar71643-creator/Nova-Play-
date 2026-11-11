package com.novaplay.admin

import android.content.Context

/** What the SMS phone needs to remember: whether it is turned on and the admin's session token. */
object Prefs {
    private fun p(c: Context) = c.getSharedPreferences("sms_gateway", Context.MODE_PRIVATE)
    fun isOn(c: Context) = p(c).getBoolean("on", false)
    fun setOn(c: Context, on: Boolean) = p(c).edit().putBoolean("on", on).apply()
    fun token(c: Context): String? = p(c).getString("token", null)
    fun setToken(c: Context, t: String) = p(c).edit().putString("token", t).apply()

    // What the panel shows under "SMS from this phone" so a problem can be seen instead of guessed.
    fun lastError(c: Context): String? = p(c).getString("lastError", null)
    fun setLastError(c: Context, e: String?) = p(c).edit().putString("lastError", e).apply()
    fun lastPollAt(c: Context): Long = p(c).getLong("lastPollAt", 0L)
    fun lastPollCode(c: Context): Int = p(c).getInt("lastPollCode", 0)
    fun setLastPoll(c: Context, code: Int) = p(c).edit().putLong("lastPollAt", System.currentTimeMillis()).putInt("lastPollCode", code).apply()
    fun testResult(c: Context): String? = p(c).getString("testResult", null)
    fun setTestResult(c: Context, r: String?) = p(c).edit().putString("testResult", r).apply()
}
