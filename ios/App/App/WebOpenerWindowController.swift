import UIKit
import WebKit

/// 单个标签的打开规格
struct WebOpenerTabSpec {
    var url: URL
    var title: String?
    var userAgent: String?
    var themeColor: String?
    var injectScript: String?
}

/// 全屏原生 WebView 窗口（无地址栏）：边缘滑动前进后退、下拉刷新、UA 覆盖与脚本注入。
///
/// 多标签：一个窗口承载场景内的全部站点，底部标签栏切换，WKWebView 按需创建后常驻
/// （已访问过的标签再切回来不会重新加载）。只有一个站点时自动隐藏标签栏。
/// 返回语义：WebView 有历史则网页内后退，否则关闭窗口。
final class WebOpenerWindowController: NSObject, WKNavigationDelegate {
    private let tabs: [WebOpenerTabSpec]
    private let onClose: () -> Void

    private var window: UIWindow?
    private var container: UIView?
    private var pagesHost: UIView?
    private var progressView: UIProgressView?
    private var spinner: UIActivityIndicatorView?
    private var tabScroll: UIScrollView?
    private var tabStack: UIStackView?
    private var tabButtons: [UIButton] = []

    private var webViews: [Int: WKWebView] = [:]
    private var activeIndex = 0

    private var observations: [NSKeyValueObservation] = []
    private var pullArmed = false
    /// 当前生效的配色方案（light / dark / system），供实时联动去重
    private var colorScheme: String?

    init(tabs: [WebOpenerTabSpec], colorScheme: String?, onClose: @escaping () -> Void) {
        self.tabs = tabs
        self.onClose = onClose
        super.init()
        self.colorScheme = colorScheme
    }

    func present() {
        guard window == nil, !tabs.isEmpty,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
        else { return }

        let interfaceStyle = Self.interfaceStyle(from: colorScheme)
        let chrome = Self.chromeColor(for: tabs[0].themeColor)
        let tint: UIColor = tabs[0].themeColor != nil ? .white : Self.defaultTintColor

        let container = UIView()
        container.backgroundColor = chrome
        container.overrideUserInterfaceStyle = interfaceStyle

        let pagesHost = UIView()
        pagesHost.backgroundColor = .clear

        let progressView = UIProgressView(progressViewStyle: .bar)
        progressView.trackTintColor = .clear
        progressView.progressTintColor = tint
        progressView.progress = 0
        progressView.isHidden = true

        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = tint
        spinner.hidesWhenStopped = true

        let tabStack = UIStackView()
        tabStack.axis = .horizontal
        tabStack.spacing = 6
        tabStack.alignment = .center

        let tabScroll = UIScrollView()
        tabScroll.showsHorizontalScrollIndicator = false
        tabScroll.backgroundColor = chrome

        container.addSubview(pagesHost)
        container.addSubview(progressView)
        container.addSubview(spinner)
        container.addSubview(tabScroll)

        for view in [pagesHost, progressView, spinner, tabScroll] {
            view.translatesAutoresizingMaskIntoConstraints = false
        }

        let hasTabBar = tabs.count > 1
        // 单页时整条标签栏都不进视图树，避免留下没有约束的 stack 触发布局告警
        if hasTabBar {
            tabScroll.addSubview(tabStack)
            tabStack.translatesAutoresizingMaskIntoConstraints = false
        }

        var constraints: [NSLayoutConstraint] = [
            pagesHost.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            pagesHost.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            pagesHost.trailingAnchor.constraint(equalTo: container.trailingAnchor),

            progressView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: container.trailingAnchor),

            spinner.centerXAnchor.constraint(equalTo: pagesHost.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: pagesHost.centerYAnchor),

            tabScroll.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            tabScroll.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            tabScroll.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor),
            tabScroll.heightAnchor.constraint(equalToConstant: hasTabBar ? 46 : 0),
        ]

        if hasTabBar {
            // 标签栏可见时才给 stack 定高；高度为 0 时 -12 会变成非法负值
            constraints.append(contentsOf: [
                pagesHost.bottomAnchor.constraint(equalTo: tabScroll.topAnchor),

                tabStack.topAnchor.constraint(equalTo: tabScroll.contentLayoutGuide.topAnchor, constant: 6),
                tabStack.bottomAnchor.constraint(equalTo: tabScroll.contentLayoutGuide.bottomAnchor, constant: -6),
                tabStack.leadingAnchor.constraint(equalTo: tabScroll.contentLayoutGuide.leadingAnchor, constant: 8),
                tabStack.trailingAnchor.constraint(equalTo: tabScroll.contentLayoutGuide.trailingAnchor, constant: -8),
                tabStack.heightAnchor.constraint(equalTo: tabScroll.frameLayoutGuide.heightAnchor, constant: -12),
            ])
        } else {
            constraints.append(pagesHost.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor))
        }

        let rootViewController = UIViewController()
        rootViewController.view = container

        let window = UIWindow(windowScene: scene)
        window.rootViewController = rootViewController
        window.backgroundColor = chrome
        window.overrideUserInterfaceStyle = interfaceStyle

        self.window = window
        self.container = container
        self.pagesHost = pagesHost
        self.progressView = progressView
        self.spinner = spinner
        self.tabScroll = tabScroll
        self.tabStack = tabStack

        tabScroll.isHidden = !hasTabBar
        if hasTabBar {
            buildTabs()
        }

        NSLayoutConstraint.activate(constraints)
        window.makeKeyAndVisible()

        // 手势返回：左缘滑动 = 网页内有历史先网页内后退，到根再滑退出回首页；右缘滑动 = 前进
        let leftEdge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        leftEdge.edges = .left
        container.addGestureRecognizer(leftEdge)
        let rightEdge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        rightEdge.edges = .right
        container.addGestureRecognizer(rightEdge)

        showTab(0, animated: false)
    }

    func dismiss() {
        guard window != nil else { return }
        observations.removeAll()
        spinner?.stopAnimating()
        webViews.removeAll()
        tabButtons.removeAll()
        window?.isHidden = true
        window = nil
        container = nil
        pagesHost = nil
        progressView = nil
        spinner = nil
        tabScroll = nil
        tabStack = nil
        onClose()
    }

    /// 应用切换主题时实时更新已打开网页的配色
    func applyColorScheme(_ scheme: String?) {
        let normalized = scheme ?? "system"
        if colorScheme == normalized { return }
        colorScheme = normalized
        let style = Self.interfaceStyle(from: normalized)
        for webView in webViews.values {
            webView.overrideUserInterfaceStyle = style
        }
        container?.overrideUserInterfaceStyle = style
        window?.overrideUserInterfaceStyle = style
        applyChromeColors()
    }

    // MARK: - 标签

    private func buildTabs() {
        guard let tabStack else { return }
        tabButtons.forEach { $0.removeFromSuperview() }
        tabButtons.removeAll()

        for index in tabs.indices {
            let spec = tabs[index]
            var config = UIButton.Configuration.filled()
            config.cornerStyle = .medium
            config.contentInsets = NSDirectionalEdgeInsets(top: 7, leading: 14, bottom: 7, trailing: 14)
            config.title = spec.title?.isEmpty == false ? spec.title : (spec.url.host ?? spec.url.absoluteString)
            config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var outgoing = incoming
                outgoing.font = UIFont.systemFont(ofSize: 13, weight: .medium)
                return outgoing
            }

            let button = UIButton(configuration: config)
            button.titleLabel?.lineBreakMode = .byTruncatingTail
            button.addAction(UIAction { [weak self] _ in self?.showTab(index, animated: true) }, for: .touchUpInside)
            button.translatesAutoresizingMaskIntoConstraints = false

            tabStack.addArrangedSubview(button)
            button.widthAnchor.constraint(lessThanOrEqualToConstant: 170).isActive = true
            tabButtons.append(button)
        }
        styleTabs()
    }

    /// 切换标签：隐藏旧的、显示新的，并让 chrome 跟随当前标签的主题色
    private func showTab(_ index: Int, animated: Bool) {
        guard tabs.indices.contains(index) else { return }
        if index == activeIndex, webViews[index] != nil { return }

        if activeIndex != index {
            webViews[activeIndex]?.isHidden = true
        }
        activeIndex = index
        guard let view = webView(for: index) else { return }
        view.isHidden = false

        applyChromeColors()
        styleTabs()
        if animated {
            scrollTabIntoView(index)
        }
    }

    /// 按需创建 WKWebView：首次切到该标签才真正加载，之后常驻内存
    private func webView(for index: Int) -> WKWebView? {
        if let existing = webViews[index] { return existing }
        guard tabs.indices.contains(index), let host = pagesHost else { return nil }
        let spec = tabs[index]

        let configuration = WKWebViewConfiguration()
        if let js = spec.injectScript, !js.isEmpty {
            configuration.userContentController.addUserScript(
                WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
        }
        // 显式持久化数据存储：cookie / localStorage 跨次打开保留，登录态不丢
        configuration.websiteDataStore = .default()

        let interfaceStyle = Self.interfaceStyle(from: colorScheme)
        let chrome = Self.chromeColor(for: spec.themeColor)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.overrideUserInterfaceStyle = interfaceStyle
        if let ua = spec.userAgent, !ua.isEmpty {
            webView.customUserAgent = ua
        }
        // 页面渲染前不闪白/黑屏：WebView 透明，透出下方主题色底
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.underPageBackgroundColor = chrome
        webView.isHidden = true
        webView.translatesAutoresizingMaskIntoConstraints = false

        host.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: host.topAnchor),
            webView.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: host.bottomAnchor),
        ])
        webViews[index] = webView

        observations.append(webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
            DispatchQueue.main.async {
                guard let self, self.activeIndex == index, let progressView = self.progressView else { return }
                progressView.isHidden = view.estimatedProgress >= 1.0
                progressView.setProgress(Float(view.estimatedProgress), animated: true)
            }
        })
        observations.append(webView.scrollView.observe(\.contentOffset, options: [.new]) { [weak self, weak webView] scrollView, _ in
            guard let self, let webView else { return }
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

        webView.load(URLRequest(url: spec.url))
        return webView
    }

    /// 按当前标签的主题色刷新 chrome（进度条 / 加载指示器 / 容器与标签栏底色）
    private func applyChromeColors() {
        guard tabs.indices.contains(activeIndex) else { return }
        let theme = tabs[activeIndex].themeColor.flatMap(Self.color(from:))
        let chrome = theme ?? Self.defaultChromeColor
        container?.backgroundColor = chrome
        window?.backgroundColor = chrome
        tabScroll?.backgroundColor = chrome
        webViews[activeIndex]?.underPageBackgroundColor = chrome
        let tint: UIColor = theme != nil ? .white : Self.defaultTintColor
        progressView?.progressTintColor = tint
        spinner?.color = tint
    }

    /// 标签胶囊配色：有主题色时用白底 + 主题色字，否则用强调色实心
    private func styleTabs() {
        guard tabs.indices.contains(activeIndex) else { return }
        let theme = tabs[activeIndex].themeColor.flatMap(Self.color(from:))
        // 无主题色时用系统蓝（深浅色自适应），避免深色下白底白字
        let accent = theme ?? UIColor.systemBlue

        for (index, button) in tabButtons.enumerated() {
            guard var config = button.configuration else { continue }
            if index == activeIndex {
                config.baseBackgroundColor = theme != nil ? .white : accent
                config.baseForegroundColor = theme != nil ? accent : .white
            } else {
                config.baseBackgroundColor = theme != nil ? Self.inactiveOnTint : Self.inactiveTabBackground
                config.baseForegroundColor = theme != nil ? .white : Self.inactiveTabForeground
            }
            button.configuration = config
        }
    }

    private func scrollTabIntoView(_ index: Int) {
        guard let scroll = tabScroll, let stack = tabStack, tabButtons.indices.contains(index) else { return }
        let button = tabButtons[index]
        DispatchQueue.main.async {
            // button.frame 在 stack 坐标系里，先换算到 scroll 的内容坐标系
            let rect = stack.convert(button.frame, to: scroll).insetBy(dx: -12, dy: 0)
            scroll.scrollRectToVisible(rect, animated: true)
        }
    }

    @objc private func edgeSwiped(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .began, let view = webViews[activeIndex] else { return }
        if gesture.edges == .left {
            if view.canGoBack {
                view.goBack()
            } else {
                dismiss()
            }
        } else if view.canGoForward {
            view.goForward()
        }
    }

    // MARK: - WKNavigationDelegate

    /// 只有当前标签的加载状态驱动共享的进度条与加载指示器
    private func isActive(_ webView: WKWebView) -> Bool {
        webViews[activeIndex] === webView
    }

    // target=_blank 的链接在当前 WebView 内打开
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard isActive(webView) else { return }
        spinner?.startAnimating()
        progressView?.isHidden = false
        progressView?.setProgress(0.05, animated: false)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard isActive(webView) else { return }
        spinner?.stopAnimating()
        progressView?.setProgress(1.0, animated: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self, self.isActive(webView) else { return }
            self.progressView?.isHidden = true
            self.progressView?.setProgress(0, animated: false)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard isActive(webView) else { return }
        spinner?.stopAnimating()
        progressView?.isHidden = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard isActive(webView) else { return }
        spinner?.stopAnimating()
        progressView?.isHidden = true
    }

    // MARK: - 配色

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

    /// 站点主题色 → chrome 底色；无主题色时用深浅色自适应底色
    private static func chromeColor(for themeColor: String?) -> UIColor {
        themeColor.flatMap(color(from:)) ?? defaultChromeColor
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

    /// 标签栏在彩色底上的未选中胶囊
    private static let inactiveOnTint = UIColor.white.withAlphaComponent(0.22)

    /// 标签栏在无主题色底上的未选中胶囊
    private static let inactiveTabBackground = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor.white.withAlphaComponent(0.16)
            : UIColor.black.withAlphaComponent(0.08)
    }

    private static let inactiveTabForeground = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.69, green: 0.69, blue: 0.71, alpha: 1)
            : UIColor(red: 0.43, green: 0.43, blue: 0.45, alpha: 1)
    }
}
