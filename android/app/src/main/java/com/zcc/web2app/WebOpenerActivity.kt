package com.zcc.web2app

import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.TextUtils
import android.util.SparseArray
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import java.lang.ref.WeakReference

/// 全屏 WebView 容器（无地址栏）：纯手势导航——系统返回手势/返回键 = 网页内后退，
/// 无历史则退出；下拉刷新；顶部加载进度条 + 主题色背景；UA 覆盖与脚本注入。
///
/// 多标签：一个容器承载场景内的全部站点，底部标签栏切换，WebView 按需创建后常驻
/// （已访问过的标签再切回来不会重新加载）。只有一个站点时自动隐藏标签栏。
/// 配色联动：日/夜模式经 localNightMode 应用到主题，WebView 据此决定
/// prefers-color-scheme，从而让网页自动跟随应用主题。
class WebOpenerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URLS = "urls"
        const val EXTRA_TITLES = "titles"
        const val EXTRA_UAS = "userAgents"
        const val EXTRA_COLORS = "themeColors"
        const val EXTRA_SCRIPTS = "injectScripts"
        const val EXTRA_ACTIVE = "activeIndex"
        const val EXTRA_COLOR_SCHEME = "colorScheme"

        const val SCHEME_LIGHT = "light"
        const val SCHEME_DARK = "dark"
        const val SCHEME_SYSTEM = "system"

        /** 当前存活的页面实例，供插件实时下发配色 */
        var current: WeakReference<WebOpenerActivity>? = null
    }

    private data class TabSpec(
        val url: String,
        val title: String?,
        val userAgent: String?,
        val themeColorHex: String?,
        val themeColor: Int?,
        val script: String?
    )

    private lateinit var root: LinearLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var refreshLayout: SwipeRefreshLayout
    private lateinit var pagesHost: FrameLayout
    private lateinit var spinner: ProgressBar
    private lateinit var tabBar: HorizontalScrollView
    private lateinit var tabRow: LinearLayout

    private val tabs = mutableListOf<TabSpec>()
    private val webViews = SparseArray<WebView>()
    private val tabViews = mutableListOf<TextView>()
    private var activeIndex = 0
    private var colorScheme: String? = null
    private var baseColor = 0

    @Suppress("SetJavaScriptEnabled", "DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        // 必须在 super.onCreate 之前设置：WebView 的 prefers-color-scheme 由主题的
        // isLightTheme 决定，AppCompat 会据此套用浅色/深色主题（或跟随系统）
        colorScheme = intent.getStringExtra(EXTRA_COLOR_SCHEME) ?: SCHEME_SYSTEM
        delegate.localNightMode = nightModeFor(colorScheme)

        super.onCreate(savedInstanceState)
        current = WeakReference(this)

        readTabs()
        if (tabs.isEmpty()) {
            finish()
            return
        }

        val isDark = isDarkNow()
        baseColor = if (isDark) 0xFF1C1C1E.toInt() else 0xFFF2F2F7.toInt()

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            visibility = View.GONE
        }

        pagesHost = FrameLayout(this)

        refreshLayout = SwipeRefreshLayout(this).apply {
            addView(
                pagesHost,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            // SwipeRefreshLayout 判断「内容是否已在顶部」只会问**直接子 View**，
            // 而这里包的是 FrameLayout（永不滚动）→ 恒判定为「在顶部」，
            // 结果任何滚动位置向下拖都会被抢走手势触发刷新。改成直接问当前 WebView。
            setOnChildScrollUpCallback { _, _ -> (webViews.get(activeIndex)?.scrollY ?: 0) > 0 }
            setOnRefreshListener {
                val wv = webViews.get(activeIndex)
                if (wv != null) wv.reload() else isRefreshing = false
            }
        }

        spinner = ProgressBar(this).apply {
            visibility = View.GONE
        }

        val pageContainer = FrameLayout(this).apply {
            addView(
                refreshLayout,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            addView(
                spinner,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER
                )
            )
        }

        tabRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), dp(6), dp(8), dp(6))
        }
        tabBar = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            visibility = if (tabs.size > 1) View.VISIBLE else View.GONE
            addView(
                tabRow,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
        }
        buildTabs()

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(baseColor)
            addView(
                progressBar,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
            addView(pageContainer, LinearLayout.LayoutParams(-1, 0, 1f))
            addView(
                tabBar,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(46)
                )
            )
        }

        setContentView(root)

        // 安全区：内容避开状态栏/刘海与手势条，系统栏区域透出主题色底。
        // Android 15 强制 edge-to-edge，必须手动消费 insets
        WindowCompat.setDecorFitsSystemWindows(window, false)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        activeIndex = intent.getIntExtra(EXTRA_ACTIVE, 0).coerceIn(0, tabs.size - 1)
        showTab(activeIndex, animate = false)
    }

    /// 从 intent 读出并行数组形式的标签规格
    private fun readTabs() {
        val urls = intent.getStringArrayListExtra(EXTRA_URLS) ?: return
        val titles = intent.getStringArrayListExtra(EXTRA_TITLES)
        val uas = intent.getStringArrayListExtra(EXTRA_UAS)
        val colors = intent.getStringArrayListExtra(EXTRA_COLORS)
        val scripts = intent.getStringArrayListExtra(EXTRA_SCRIPTS)
        for (i in urls.indices) {
            val url = urls[i]
            if (url.isBlank()) continue
            val hex = colors?.getOrNull(i)?.takeIf { it.isNotBlank() }
            tabs.add(
                TabSpec(
                    url = url,
                    title = titles?.getOrNull(i)?.takeIf { it.isNotBlank() },
                    userAgent = uas?.getOrNull(i)?.takeIf { it.isNotBlank() },
                    themeColorHex = hex,
                    themeColor = hex?.let { runCatching { Color.parseColor(it) }.getOrNull() },
                    script = scripts?.getOrNull(i)?.takeIf { it.isNotBlank() }
                )
            )
        }
    }

    private fun buildTabs() {
        tabViews.clear()
        tabRow.removeAllViews()
        for (i in tabs.indices) {
            val tv = TextView(this).apply {
                text = tabs[i].title ?: tabs[i].url
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                maxWidth = dp(170)
                gravity = Gravity.CENTER
                setPadding(dp(14), dp(7), dp(14), dp(7))
                setOnClickListener { showTab(i, animate = true) }
            }
            tabRow.addView(
                tv,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { marginEnd = dp(6) }
            )
            tabViews.add(tv)
        }
    }

    private fun specOf(index: Int): TabSpec? = tabs.getOrNull(index)

    /// 按需创建 WebView：首次切到该标签才真正加载，之后常驻内存
    private fun webViewFor(index: Int): WebView? {
        webViews.get(index)?.let { return it }
        val spec = specOf(index) ?: return null
        val isDark = isDarkNow()
        val base = spec.themeColor ?: baseColor

        val view = WebView(this).apply {
            tag = index
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            // 网页自带 prefers-color-scheme 时优先用网页配色；未适配的网页在深色下算法变暗
            applyAlgorithmicDarkening(this, isDark)
            // cookie / 本地存储持久化：登录态跨次打开保留，退出页面不清除
            val cookieManager = CookieManager.getInstance()
            cookieManager.setAcceptCookie(true)
            cookieManager.setAcceptThirdPartyCookies(this, true)
            // 页面渲染前用主题色填充，避免白/黑屏闪烁
            setBackgroundColor(base)
            spec.userAgent?.let { settings.userAgentString = it }
            visibility = View.GONE
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(v: WebView, urlStr: String?) {
                    val i = v.tag as? Int ?: -1
                    if (i == activeIndex) {
                        refreshLayout.isRefreshing = false
                        progressBar.visibility = View.GONE
                        spinner.visibility = View.GONE
                    }
                    specOf(i)?.script?.let { v.evaluateJavascript(it, null) }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(v: WebView, newProgress: Int) {
                    // 后台标签的加载进度不干扰当前标签的进度条
                    if ((v.tag as? Int) != activeIndex) return
                    progressBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                    progressBar.progress = newProgress
                }
            }
        }

        pagesHost.addView(
            view,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        webViews.put(index, view)
        view.loadUrl(spec.url)
        return view
    }

    /// 切换标签：隐藏旧的、显示新的，并让 chrome 跟随当前标签的主题色
    private fun showTab(index: Int, animate: Boolean) {
        if (index !in tabs.indices) return
        if (index == activeIndex && webViews.get(index) != null) return

        webViews.get(activeIndex)?.let { old ->
            if (activeIndex != index) {
                old.visibility = View.GONE
                old.onPause()
            }
        }

        activeIndex = index
        val view = webViewFor(index) ?: return
        view.visibility = View.VISIBLE
        view.onResume()

        applyChromeColors()
        styleTabs()
        if (animate) {
            tabViews.getOrNull(index)?.let { tv ->
                // 让当前标签滚进可视区
                tabBar.post { tabBar.smoothScrollTo(tv.left - dp(8), 0) }
            }
        }
    }

    /// 按当前标签的主题色刷新进度条 / 加载指示器 / 容器与标签栏底色
    private fun applyChromeColors() {
        val spec = specOf(activeIndex)
        val isDark = isDarkNow()
        val theme = spec?.themeColor
        val chrome = theme ?: baseColor
        val accent = theme ?: (if (isDark) 0xFF0A84FF.toInt() else 0xFF007AFF.toInt())

        root.setBackgroundColor(chrome)
        tabBar.setBackgroundColor(chrome)
        progressBar.progressTintList = ColorStateList.valueOf(if (theme != null) Color.WHITE else accent)
        spinner.indeterminateTintList =
            ColorStateList.valueOf(if (theme != null || isDark) Color.WHITE else 0xFF1C1C1E.toInt())
        webViews.get(activeIndex)?.setBackgroundColor(chrome)
    }

    /// 标签胶囊配色：有主题色时用白底 + 主题色字，否则用强调色实心
    private fun styleTabs() {
        val isDark = isDarkNow()
        val theme = specOf(activeIndex)?.themeColor
        val accent = if (isDark) 0xFF0A84FF.toInt() else 0xFF007AFF.toInt()
        val inactiveBg = if (theme != null) 0x33FFFFFF else if (isDark) 0x38FFFFFF else 0x1F000000
        val inactiveFg = if (theme != null) Color.WHITE else if (isDark) 0xFFB0B0B6.toInt() else 0xFF6E6E73.toInt()

        for (i in tabViews.indices) {
            val tv = tabViews[i]
            val active = i == activeIndex
            tv.background = pill(
                if (active) (if (theme != null) Color.WHITE else accent) else inactiveBg
            )
            tv.setTextColor(if (active) (if (theme != null) accent else Color.WHITE) else inactiveFg)
        }
    }

    private fun pill(color: Int): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(9).toFloat()
        setColor(color)
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    /// 应用切换主题时实时更新已打开网页的配色。
    /// 切换日/夜模式需要重新套用主题，AppCompat 会重建本 Activity 并重新加载当前页。
    fun applyColorScheme(scheme: String?) {
        val normalized = scheme ?: SCHEME_SYSTEM
        if (colorScheme == normalized) return
        colorScheme = normalized
        // 重建时 onCreate 会重新读取 intent，先把新配色写回，避免被旧值覆盖；
        // 同时保留各标签当前地址与当前标签，重建后仍停在用户所在的位置
        intent.putExtra(EXTRA_COLOR_SCHEME, normalized)
        intent.putStringArrayListExtra(EXTRA_URLS, currentUrls())
        intent.putExtra(EXTRA_ACTIVE, activeIndex)
        val mode = nightModeFor(normalized)
        if (delegate.localNightMode != mode) {
            delegate.localNightMode = mode
        }
    }

    /// 各标签的当前地址（未创建的标签回落到初始地址）
    private fun currentUrls(): ArrayList<String> {
        val urls = ArrayList<String>(tabs.size)
        for (i in tabs.indices) {
            urls.add(webViews.get(i)?.url ?: tabs[i].url)
        }
        return urls
    }

    private fun nightModeFor(scheme: String?): Int = when (scheme) {
        SCHEME_DARK -> AppCompatDelegate.MODE_NIGHT_YES
        SCHEME_LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
        else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
    }

    private fun isDarkNow(): Boolean =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

    private fun applyAlgorithmicDarkening(view: WebView, isDark: Boolean) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(view.settings, isDark)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val view = webViews.get(activeIndex)
        if (view != null && view.canGoBack()) {
            view.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (current?.get() === this) current = null
        // 仅销毁 WebView 实例释放资源；cookie / localStorage 属于持久化存储，不受影响
        for (i in 0 until webViews.size()) {
            webViews.valueAt(i).destroy()
        }
        webViews.clear()
        super.onDestroy()
    }
}
