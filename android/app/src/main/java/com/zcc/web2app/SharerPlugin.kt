package com.zcc.web2app

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/// 唤起系统分享面板。用于把场景模板 / 备份的分享码发出去。
@CapacitorPlugin(name = "Sharer")
class SharerPlugin : Plugin() {

    @PluginMethod
    fun share(call: PluginCall) {
        val text = call.getString("text")
        if (text.isNullOrBlank()) {
            call.reject("text is required")
            return
        }
        val title = call.getString("title")

        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
            title?.let { putExtra(Intent.EXTRA_SUBJECT, it) }
        }
        val chooser = Intent.createChooser(send, title).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        // 系统分享面板没有可靠的回调，交给系统即视为已分享
        context.startActivity(chooser)
        call.resolve(JSObject().put("completed", true))
    }
}
