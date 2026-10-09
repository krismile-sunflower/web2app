import Capacitor
import UIKit

/// 唤起系统分享面板。用于把场景模板 / 备份的分享码发出去。
@objc(SharerPlugin)
public class SharerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "Sharer"
    public let jsName = "Sharer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
    ]

    @objc func share(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty else {
            call.reject("text is required")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let host = self.bridge?.viewController else {
                call.reject("no view controller to present from")
                return
            }

            let controller = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            // 用户取消时 completed 为 false，据此告诉 JS 侧「没分享出去」
            controller.completionWithItemsHandler = { _, completed, _, _ in
                call.resolve(["completed": completed])
            }

            // iPad 上不给锚点会崩
            if let popover = controller.popoverPresentationController {
                popover.sourceView = host.view
                popover.sourceRect = CGRect(
                    x: host.view.bounds.midX,
                    y: host.view.bounds.midY,
                    width: 0,
                    height: 0
                )
                popover.permittedArrowDirections = []
            }

            host.present(controller, animated: true)
        }
    }
}
