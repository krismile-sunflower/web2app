import Capacitor
import WebKit

struct WebOpenerOptions {
    var title: String?
    var userAgent: String?
    var themeColor: String?
    var injectScript: String?
    /// 强制网页配色方案：light / dark；nil 或 system = 跟随系统
    var colorScheme: String?
}

@objc(WebOpenerPlugin)
public class WebOpenerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebOpener"
    public let jsName = "WebOpener"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setColorScheme", returnType: CAPPluginReturnPromise),
    ]

    private var controller: WebOpenerWindowController?

    @objc func open(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("url is required")
            return
        }
        let options = WebOpenerOptions(
            title: call.getString("title"),
            userAgent: call.getString("userAgent"),
            themeColor: call.getString("themeColor"),
            injectScript: call.getString("injectScript"),
            colorScheme: call.getString("colorScheme")
        )
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.controller?.dismiss()
            let controller = WebOpenerWindowController(url: url, options: options) { [weak self] in
                self?.controller = nil
            }
            self.controller = controller
            controller.present()
            call.resolve()
        }
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
}
