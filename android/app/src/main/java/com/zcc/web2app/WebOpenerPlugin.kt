package com.zcc.web2app

import android.content.Intent
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WebOpener")
class WebOpenerPlugin : Plugin() {

    @PluginMethod
    fun open(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("url is required")
            return
        }
        val intent = Intent(context, WebOpenerActivity::class.java)
        intent.putExtra(WebOpenerActivity.EXTRA_URL, url)
        call.getString("title")?.let { intent.putExtra(WebOpenerActivity.EXTRA_TITLE, it) }
        call.getString("userAgent")?.let { intent.putExtra(WebOpenerActivity.EXTRA_UA, it) }
        call.getString("themeColor")?.let { intent.putExtra(WebOpenerActivity.EXTRA_COLOR, it) }
        call.getString("injectScript")?.let { intent.putExtra(WebOpenerActivity.EXTRA_SCRIPT, it) }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }
}
