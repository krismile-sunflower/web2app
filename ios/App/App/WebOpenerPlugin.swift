import Capacitor
import WebKit

@objc(WebOpenerPlugin)
public class WebOpenerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebOpener"
    public let jsName = "WebOpener"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openScene", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setColorScheme", returnType: CAPPluginReturnPromise),
    ]

    private var controller: WebOpenerWindowController?

    @objc func open(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("url is required")
            return
        }
        let spec = WebOpenerTabSpec(
            url: url,
            title: call.getString("title"),
            userAgent: call.getString("userAgent"),
            themeColor: call.getString("themeColor"),
            injectScript: call.getString("injectScript")
        )
        present(tabs: [spec], colorScheme: call.getString("colorScheme"), call: call)
    }

    /// 一键打开多个页面：同一个窗口内以底部标签栏承载，
    /// 不会反复创建 / 关闭 UIWindow，也不会丢掉各自的 UA、主题色与注入脚本。
    @objc func openScene(_ call: CAPPluginCall) {
        let items = call.getArray("items", JSObject.self) ?? []
        let tabs: [WebOpenerTabSpec] = items.compactMap { item in
            guard let urlStr = item["url"] as? String, let url = URL(string: urlStr) else { return nil }
            return WebOpenerTabSpec(
                url: url,
                title: item["title"] as? String,
                userAgent: item["userAgent"] as? String,
                themeColor: item["themeColor"] as? String,
                injectScript: item["injectScript"] as? String
            )
        }
        guard !tabs.isEmpty else {
            call.reject("items has no usable url")
            return
        }
        present(tabs: tabs, colorScheme: call.getString("colorScheme"), call: call)
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.controller?.dismiss()
            call.resolve()
        }
    }

    /// 应用切换主题时实时更新已打开网页的配色
    @objc func setColorScheme(_ call: CAPPluginCall) {
        let scheme = call.getString("colorScheme")
        DispatchQueue.main.async { [weak self] in
            self?.controller?.applyColorScheme(scheme)
            call.resolve()
        }
    }

    private func present(tabs: [WebOpenerTabSpec], colorScheme: String?, call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.controller?.dismiss()
            let controller = WebOpenerWindowController(tabs: tabs, colorScheme: colorScheme) { [weak self] in
                self?.controller = nil
            }
            self.controller = controller
            controller.present()
            call.resolve()
        }
    }
}
