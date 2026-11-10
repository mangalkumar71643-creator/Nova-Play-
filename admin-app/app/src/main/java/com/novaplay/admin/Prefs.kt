package com.novaplay.admin

import android.content.Context

/** What the SMS phone needs to remember: whether it is turned on and the admin's session token. */
object Prefs {
    private fun p(c: Context) = c.getSharedPreferences("sms_gateway", Context.MODE_PRIVATE)
    fun isOn(c: Context) = p(c).getBoolean("on", false)
    fun setOn(c: Context, on: Boolean) = p(c).edit().putBoolean("on", on).apply()
    fun token(c: Context): String? = p(c).getString("token", null)
    fun setToken(c: Context, t: String) = p(c).edit().putString("token", t).apply()
}
