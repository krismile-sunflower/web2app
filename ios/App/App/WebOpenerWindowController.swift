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
    private var titleLabel: UILabel?
    private var backBtn: UIButton?
    private var forwardBtn: UIButton?
    private var observations: [NSKeyValueObservation] = []
    private var pullArmed = false

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
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        if let ua = options.userAgent, !ua.isEmpty {
            webView.customUserAgent = ua
        }
        self.webView = webView

        let themeColor = options.themeColor.flatMap(Self.color(from:))
        let tintColor: UIColor = themeColor.map { _ in .white } ?? UIColor { $0.userInterfaceStyle == .dark ? .white : .systemBlue }
        let toolbarColor = themeColor ?? UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1) : UIColor(red: 0.95, green: 0.95, blue: 0.97, alpha: 1) }

        let backButton = UIButton(type: .system)
        backButton.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        backButton.tintColor = tintColor
        backButton.addTarget(self, action: #selector(goBackTapped), for: .touchUpInside)
        backBtn = backButton

        let forwardButton = UIButton(type: .system)
        forwardButton.setImage(UIImage(systemName: "chevron.right"), for: .normal)
        forwardButton.tintColor = tintColor
        forwardButton.addTarget(self, action: #selector(goForwardTapped), for: .touchUpInside)
        forwardBtn = forwardButton

        let titleLabel = UILabel()
        titleLabel.text = options.title
        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        titleLabel.textColor = tintColor
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 1
        self.titleLabel = titleLabel

        let reloadButton = UIButton(type: .system)
        reloadButton.setImage(UIImage(systemName: "arrow.clockwise"), for: .normal)
        reloadButton.tintColor = tintColor
        reloadButton.addTarget(self, action: #selector(reloadTapped), for: .touchUpInside)

        let safariButton = UIButton(type: .system)
        safariButton.setImage(UIImage(systemName: "safari"), for: .normal)
        safariButton.tintColor = tintColor
        safariButton.addTarget(self, action: #selector(openInSafariTapped), for: .touchUpInside)

        let closeButton = UIButton(type: .system)
        closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButton.tintColor = tintColor
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)

        let titleHolder = UIView()
        titleHolder.addSubview(titleLabel)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let toolbar = UIStackView(arrangedSubviews: [backButton, forwardButton, titleHolder, reloadButton, safariButton, closeButton])
        toolbar.axis = .horizontal
        toolbar.alignment = .center
        toolbar.spacing = 18
        toolbar.layoutMargins = UIEdgeInsets(top: 0, left: 14, bottom: 0, right: 14)
        toolbar.isLayoutMarginsRelativeArrangement = true
        toolbar.backgroundColor = toolbarColor

        let container = UIView()
        container.backgroundColor = toolbarColor
        container.addSubview(toolbar)
        container.addSubview(webView)
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        webView.translatesAutoresizingMaskIntoConstraints = false

        let rootViewController = UIViewController()
        rootViewController.view = container

        let window = UIWindow(windowScene: scene)
        window.rootViewController = rootViewController
        window.backgroundColor = toolbarColor
        self.window = window

        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: 50),

            webView.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),

            titleLabel.centerXAnchor.constraint(equalTo: titleHolder.centerXAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: titleHolder.centerYAnchor),
            titleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: titleHolder.leadingAnchor, constant: 8),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: titleHolder.trailingAnchor, constant: -8),
        ])

        window.makeKeyAndVisible()

        // 手势返回：左缘滑动 = 网页内有历史先网页内后退，到根再滑退出回首页；右缘滑动 = 前进
        let leftEdge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        leftEdge.edges = .left
        container.addGestureRecognizer(leftEdge)
        let rightEdge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        rightEdge.edges = .right
        container.addGestureRecognizer(rightEdge)

        observations.append(webView.observe(\.title, options: [.new])) { [weak self] webView, _ in
            let title = webView.title
            self?.titleLabel?.text = (title?.isEmpty == false) ? title : self?.options.title
        }
        observations.append(webView.observe(\.canGoBack, options: [.new])) { [weak self] webView, _ in
            self?.backBtn?.isEnabled = webView.canGoBack
            self?.backBtn?.alpha = webView.canGoBack ? 1 : 0.35
        }
        observations.append(webView.observe(\.canGoForward, options: [.new])) { [weak self] webView, _ in
            self?.forwardBtn?.isEnabled = webView.canGoForward
            self?.forwardBtn?.alpha = webView.canGoForward ? 1 : 0.35
        }
        observations.append(webView.scrollView.observe(\.contentOffset, options: [.new])) { [weak self] scrollView, _ in
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
        }

        backBtn?.isEnabled = false
        backBtn?.alpha = 0.35
        forwardBtn?.isEnabled = false
        forwardBtn?.alpha = 0.35

        webView.load(URLRequest(url: url))
    }

    func dismiss() {
        guard window != nil else { return }
        observations.removeAll()
        window?.isHidden = true
        window = nil
        webView = nil
        onClose()
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

    @objc private func goBackTapped() {
        if webView?.canGoBack == true {
            webView?.goBack()
        } else {
            dismiss()
        }
    }

    @objc private func goForwardTapped() {
        webView?.goForward()
    }

    @objc private func reloadTapped() {
        webView?.reload()
    }

    @objc private func openInSafariTapped() {
        guard let current = webView?.url ?? URL(string: url.absoluteString) else { return }
        UIApplication.shared.open(current)
    }

    @objc private func closeTapped() {
        dismiss()
    }

    // target=_blank 的链接在当前 WebView 内打开
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
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
}
