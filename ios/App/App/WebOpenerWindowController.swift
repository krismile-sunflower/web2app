import UIKit
import WebKit

/// 全屏原生 WebView 窗口：自绘工具栏（返回/前进/标题/刷新/Safari/关闭）、
/// 边缘滑动前进后退、下拉刷新、UA 覆盖与脚本注入。
/// 返回按钮语义：WebView 有历史则网页内后退，否则关闭窗口。
final class WebOpenerWindowController: NSObject, WKNavigationDelegate {
    private let url: URL
    private let options: WebOpenerOptions
    private let onClose: () -> Void

    private var window: UIWindow?
    private var webView: WKWebView?
    private var container: UIView?
    private var progressView: UIProgressView?
    private var spinner: UIActivityIndicatorView?
    private var observations: [NSKeyValueObservation] = []
    private var pullArmed = false
    /// 当前生效的配色方案（light / dark / system），供实时联动去重
    private var colorScheme: String?

    init(url: URL, options: WebOpenerOptions, onClose: @escaping () -> Void) {
        self.url = url
        self.options = options
        self.onClose = onClose
        super.init()
    }

    func present() {
        guard window == nil,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
        else { return }

        let configuration = WKWebViewConfiguration()
        if let js = options.injectScript, !js.isEmpty {
            configuration.userContentController.addUserScript(
                WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
        }
        // 显式持久化数据存储：cookie / localStorage 跨次打开保留，登录态不丢
        configuration.websiteDataStore = .default()

        // 强制网页配色：overrideUserInterfaceStyle 决定页面内 prefers-color-scheme 的取值
        let interfaceStyle = Self.interfaceStyle(from: options.colorScheme)
        self.colorScheme = options.colorScheme ?? "system"

        let themeColor = options.themeColor.flatMap(Self.color(from:))
        let toolbarColor = themeColor ?? Self.defaultChromeColor
        let tintColor: UIColor = themeColor != nil ? .white : Self.defaultTintColor

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.overrideUserInterfaceStyle = interfaceStyle
        if let ua = options.userAgent, !ua.isEmpty {
            webView.customUserAgent = ua
        }
        // 页面渲染前不闪白/黑屏：WebView 透明，透出下方主题色底
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.underPageBackgroundColor = toolbarColor
        self.webView = webView

        let progressView = UIProgressView(progressViewStyle: .bar)
        progressView.trackTintColor = .clear
        progressView.progressTintColor = tintColor
        progressView.progress = 0
        progressView.isHidden = true

        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = tintColor
        spinner.hidesWhenStopped = true

        let container = UIView()
        container.backgroundColor = toolbarColor
        container.overrideUserInterfaceStyle = interfaceStyle
        container.addSubview(webView)
        container.addSubview(progressView)
        container.addSubview(spinner)
        progressView.translatesAutoresizingMaskIntoConstraints = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        spinner.translatesAutoresizingMaskIntoConstraints = false

        let rootViewController = UIViewController()
        rootViewController.view = container

        let window = UIWindow(windowScene: scene)
        window.rootViewController = rootViewController
        window.backgroundColor = toolbarColor
        window.overrideUserInterfaceStyle = interfaceStyle
        self.window = window
        self.container = container
        self.progressView = progressView
        self.spinner = spinner

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor),

            progressView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: container.trailingAnchor),

            spinner.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: webView.centerYAnchor),
        ])

        window.makeKeyAndVisible()

        // 手势返回：左缘滑动 = 网页内有历史先网页内后退，到根再滑退出回首页；右缘滑动 = 前进
        let leftEdge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        leftEdge.edges = .left
        container.addGestureRecognizer(leftEdge)
        let rightEdge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        rightEdge.edges = .right
        container.addGestureRecognizer(rightEdge)

        observations.append(webView.scrollView.observe(\.contentOffset, options: [.new]) { [weak self] scrollView, _ in
            guard let self else { return }
            if scrollView.isTracking && scrollView.contentOffset.y < -70 {
                self.pullArmed = true
            }
            if !scrollView.isTracking && self.pullArmed {
                self.pullArmed = false
                if scrollView.contentOffset.y < -20 {
                    webView.reload()
                }
            }
        })
        observations.append(webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
            DispatchQueue.main.async {
                guard let progressView = self?.progressView else { return }
                progressView.isHidden = webView.estimatedProgress >= 1.0
                progressView.setProgress(Float(webView.estimatedProgress), animated: true)
            }
        })

        webView.load(URLRequest(url: url))
    }

    func dismiss() {
        guard window != nil else { return }
        observations.removeAll()
        spinner?.stopAnimating()
        window?.isHidden = true
        window = nil
        webView = nil
        container = nil
        progressView = nil
        spinner = nil
        onClose()
    }

    /// 应用切换主题时实时更新已打开网页的配色
    func applyColorScheme(_ scheme: String?) {
        let normalized = scheme ?? "system"
        if colorScheme == normalized { return }
        colorScheme = normalized
        let style = Self.interfaceStyle(from: normalized)
        webView?.overrideUserInterfaceStyle = style
        container?.overrideUserInterfaceStyle = style
        window?.overrideUserInterfaceStyle = style
        refreshChromeColors()
    }

    /// 按当前配色重绘原生 chrome（进度条 / 加载指示器 / 底色）
    private func refreshChromeColors() {
        let themeColor = options.themeColor.flatMap(Self.color(from:))
        let chrome = themeColor ?? Self.defaultChromeColor
        container?.backgroundColor = chrome
        window?.backgroundColor = chrome
        webView?.underPageBackgroundColor = chrome
        let tint: UIColor = themeColor != nil ? .white : Self.defaultTintColor
        progressView?.progressTintColor = tint
        spinner?.color = tint
    }

    @objc private func edgeSwiped(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .began else { return }
        if gesture.edges == .left {
            if webView?.canGoBack == true {
                webView?.goBack()
            } else {
                dismiss()
            }
        } else if webView?.canGoForward == true {
            webView?.goForward()
        }
    }

    // target=_blank 的链接在当前 WebView 内打开
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        spinner?.startAnimating()
        progressView?.isHidden = false
        progressView?.setProgress(0.05, animated: false)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner?.stopAnimating()
        progressView?.setProgress(1.0, animated: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.progressView?.isHidden = true
            self?.progressView?.setProgress(0, animated: false)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        spinner?.stopAnimating()
        progressView?.isHidden = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        spinner?.stopAnimating()
        progressView?.isHidden = true
    }

    private static func color(from hex: String) -> UIColor? {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let rgb = UInt64(value, radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }

    /// 配色方案 → 界面风格；system / nil = 跟随系统
    private static func interfaceStyle(from scheme: String?) -> UIUserInterfaceStyle {
        switch scheme {
        case "dark": return .dark
        case "light": return .light
        default: return .unspecified
        }
    }

    /// 无站点主题色时的原生 chrome 底色（随深浅色动态解析）
    private static let defaultChromeColor = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)
            : UIColor(red: 0.95, green: 0.95, blue: 0.97, alpha: 1)
    }

    /// 无站点主题色时的强调色（随深浅色动态解析）
    private static let defaultTintColor = UIColor { traits in
        traits.userInterfaceStyle == .dark ? .white : .systemBlue
    }
}
