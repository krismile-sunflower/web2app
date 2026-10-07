package com.zcc.web2app

import android.app.Activity
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/// 全屏 WebView 页面：自绘工具栏（返回/前进/标题/刷新/外部浏览器/关闭）、
/// 下拉刷新、加载进度条 + 主题色加载背景（避免白/黑屏闪烁）、UA 覆盖与脚本注入。
/// 系统返回手势/返回键语义：WebView 有历史则网页内后退，否则关闭页面。
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
    private lateinit var titleView: TextView
    private lateinit var backBtn: Button
    private lateinit var forwardBtn: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var spinner: ProgressBar

    @Suppress("SetJavaScriptEnabled", "PrivateResource", "DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            finish()
            return
        }

        val density = resources.displayMetrics.density
        fun dp(v: Int): Int = (v * density).toInt()

        val themeHex = intent.getStringExtra(EXTRA_COLOR)
        val themeColor = themeHex?.takeIf { it.isNotBlank() }
            ?.let { hex -> runCatching { Color.parseColor(hex) }.getOrNull() }
        val isDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        // 无主题色时用深浅色自适应底色，避免加载前闪白/黑屏、按钮白字看不清
        val baseColor = themeColor
            ?: (if (isDark) 0xFF1C1C1E.toInt() else 0xFFF2F2F7.toInt())
        val contentColor = if (themeColor != null || isDark) Color.WHITE else 0xFF1C1C1E.toInt()

        fun toolbarButton(label: String, onClick: () -> Unit): Button = Button(this).apply {
            text = label
            background = null
            setTextColor(contentColor)
            textSize = 22f
            setPadding(dp(10), 0, dp(10), 0)
            minWidth = dp(44)
            minHeight = dp(44)
            setOnClickListener { onClick() }
        }

        val back = toolbarButton("‹") {
            if (this@WebOpenerActivity::webView.isInitialized && webView.canGoBack()) webView.goBack() else finish()
        }
        backBtn = back
        val forward = toolbarButton("›") {
            if (this@WebOpenerActivity::webView.isInitialized && webView.canGoForward()) webView.goForward()
        }
        forwardBtn = forward

        titleView = TextView(this).apply {
            text = intent.getStringExtra(EXTRA_TITLE)
            textSize = 15f
            setTextColor(contentColor)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            gravity = Gravity.CENTER
        }

        val reload = toolbarButton("⟳") {
            if (this@WebOpenerActivity::webView.isInitialized) webView.reload()
        }
        val external = toolbarButton("↗") {
            val current = if (this@WebOpenerActivity::webView.isInitialized) webView.url ?: url else url
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(current)))
            } catch (e: Exception) {
                Toast.makeText(this@WebOpenerActivity, "无法打开外部浏览器", Toast.LENGTH_SHORT).show()
            }
        }
        val close = toolbarButton("✕") { finish() }

        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(baseColor)
            setPadding(dp(6), 0, dp(6), 0)
            addView(back)
            addView(forward)
            addView(
                titleView,
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            )
            addView(reload)
            addView(external)
            addView(close)
        }

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
                override fun doUpdateVisitedHistory(view: WebView, urlStr: String?, isReload: Boolean) {
                    back.isEnabled = view.canGoBack()
                    back.alpha = if (back.isEnabled) 1f else 0.4f
                    forward.isEnabled = view.canGoForward()
                    forward.alpha = if (forward.isEnabled) 1f else 0.4f
                }

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

                override fun onReceivedTitle(view: WebView, title: String?) {
                    if (!title.isNullOrBlank()) titleView.text = title
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
            indeterminateTintList = ColorStateList.valueOf(contentColor)
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
            addView(toolbar, LinearLayout.LayoutParams(-1, dp(52)))
            addView(
                progressBar,
                LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT)
            )
            addView(pageContainer, LinearLayout.LayoutParams(-1, 0, 1f))
        }

        setContentView(root)
        window.statusBarColor = baseColor

        back.isEnabled = false
        back.alpha = 0.4f
        forward.isEnabled = false
        forward.alpha = 0.4f

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
