package com.zcc.web2app

import android.app.Activity
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/// 全屏 WebView 页面（无工具栏）：纯手势导航——系统返回手势/返回键 = 网页内后退，
/// 无历史则退出；下拉刷新；顶部加载进度条 + 主题色背景；UA 覆盖与脚本注入。
class WebOpenerActivity : Activity() {

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_UA = "userAgent"
        const val EXTRA_COLOR = "themeColor"
        const val EXTRA_SCRIPT = "injectScript"
    }

    private lateinit var webView: WebView
    private lateinit var refreshLayout: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var spinner: ProgressBar

    @Suppress("SetJavaScriptEnabled", "DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            finish()
            return
        }

        val themeHex = intent.getStringExtra(EXTRA_COLOR)
        val themeColor = themeHex?.takeIf { it.isNotBlank() }
            ?.let { hex -> runCatching { Color.parseColor(hex) }.getOrNull() }
        val isDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        // 无主题色时用深浅色自适应底色，避免加载前闪白/黑屏
        val baseColor = themeColor
            ?: (if (isDark) 0xFF1C1C1E.toInt() else 0xFFF2F2F7.toInt())
        val accentColor = if (themeColor != null || isDark) Color.WHITE else 0xFF1C1C1E.toInt()

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            visibility = View.GONE
            if (themeColor != null) {
                progressTintList = ColorStateList.valueOf(Color.WHITE)
            }
        }

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            // cookie / 本地存储持久化：登录态跨次打开保留，退出页面不清除
            val cookieManager = CookieManager.getInstance()
            cookieManager.setAcceptCookie(true)
            cookieManager.setAcceptThirdPartyCookies(this, true)
            // 页面渲染前用主题色填充，避免白/黑屏闪烁
            setBackgroundColor(baseColor)
            intent.getStringExtra(EXTRA_UA)?.takeIf { it.isNotBlank() }?.let { settings.userAgentString = it }
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, urlStr: String?) {
                    refreshLayout.isRefreshing = false
                    progressBar.visibility = View.GONE
                    spinner.visibility = View.GONE
                    intent.getStringExtra(EXTRA_SCRIPT)?.takeIf { it.isNotBlank() }
                        ?.let { view.evaluateJavascript(it, null) }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    progressBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                    progressBar.progress = newProgress
                }
            }
        }

        refreshLayout = SwipeRefreshLayout(this).apply {
            addView(
                webView,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            setOnRefreshListener { webView.reload() }
        }

        spinner = ProgressBar(this).apply {
            visibility = View.GONE
            indeterminateTintList = ColorStateList.valueOf(accentColor)
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

        val root = LinearLayout(this).apply {
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

        spinner.visibility = View.VISIBLE
        webView.loadUrl(url)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        // 仅销毁 WebView 实例释放资源；cookie / localStorage 属于持久化存储，不受影响
        if (this::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }
}
