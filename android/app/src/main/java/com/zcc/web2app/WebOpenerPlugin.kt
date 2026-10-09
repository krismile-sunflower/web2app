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
        val intent = buildIntent(
            urls = listOf(url),
            titles = listOf(call.getString("title")),
            uas = listOf(call.getString("userAgent")),
            colors = listOf(call.getString("themeColor")),
            scripts = listOf(call.getString("injectScript")),
            active = 0,
            colorScheme = call.getString("colorScheme")
        )
        context.startActivity(intent)
        call.resolve()
    }

    /**
     * 一键打开多个页面：同一个 Activity 内以底部标签栏承载，
     * 不重复创建 Activity，也不会把返回栈堆起来。
     */
    @PluginMethod
    fun openScene(call: PluginCall) {
        val items = call.getArray("items")
        if (items == null || items.length() == 0) {
            call.reject("items is required")
            return
        }
        val urls = ArrayList<String>()
        val titles = ArrayList<String>()
        val uas = ArrayList<String>()
        val colors = ArrayList<String>()
        val scripts = ArrayList<String>()
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            val url = item.optString("url", "")
            if (url.isBlank()) continue
            urls.add(url)
            titles.add(item.optString("title", ""))
            uas.add(item.optString("userAgent", ""))
            colors.add(item.optString("themeColor", ""))
            scripts.add(item.optString("injectScript", ""))
        }
        if (urls.isEmpty()) {
            call.reject("items has no usable url")
            return
        }
        context.startActivity(
            buildIntent(urls, titles, uas, colors, scripts, 0, call.getString("colorScheme"))
        )
        call.resolve()
    }

    /** 应用切换主题时实时更新已打开网页的配色 */
    @PluginMethod
    fun setColorScheme(call: PluginCall) {
        val scheme = call.getString("colorScheme")
        WebOpenerActivity.current?.get()?.applyColorScheme(scheme)
        call.resolve()
    }

    private fun buildIntent(
        urls: List<String>,
        titles: List<String?>,
        uas: List<String?>,
        colors: List<String?>,
        scripts: List<String?>,
        active: Int,
        colorScheme: String?
    ): Intent {
        val intent = Intent(context, WebOpenerActivity::class.java)
        intent.putStringArrayListExtra(WebOpenerActivity.EXTRA_URLS, ArrayList(urls))
        intent.putStringArrayListExtra(WebOpenerActivity.EXTRA_TITLES, blankSafe(titles))
        intent.putStringArrayListExtra(WebOpenerActivity.EXTRA_UAS, blankSafe(uas))
        intent.putStringArrayListExtra(WebOpenerActivity.EXTRA_COLORS, blankSafe(colors))
        intent.putStringArrayListExtra(WebOpenerActivity.EXTRA_SCRIPTS, blankSafe(scripts))
        intent.putExtra(WebOpenerActivity.EXTRA_ACTIVE, active)
        colorScheme?.let { intent.putExtra(WebOpenerActivity.EXTRA_COLOR_SCHEME, it) }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return intent
    }

    /** 并行数组用空串表示「未提供」，避免 null 在 Parcel 往返中出问题 */
    private fun blankSafe(values: List<String?>): ArrayList<String> {
        val out = ArrayList<String>(values.size)
        for (v in values) out.add(v ?: "")
        return out
    }
}
