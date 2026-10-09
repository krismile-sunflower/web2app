import Capacitor

/// 注册 app 内本地插件。
/// Capacitor 8 的 registerPluginType 在 autoRegisterPlugins（默认开启）下是空操作，
/// 只认 packageClassList（由 cap sync 从 npm 插件包重新生成，会覆盖手工条目），
/// 因此本地插件改用 registerPluginInstance 在桥创建后直接注入实例。
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WebOpenerPlugin())
        bridge?.registerPluginInstance(SharerPlugin())
    }
}
