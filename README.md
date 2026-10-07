# 网页盒子 (Web2App)

[![下载 Android APK](https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD-Android_APK-3DDC84?logo=android)](https://github.com/krismile-sunflower/web2app/releases/latest/download/web2app.apk)

把网页变成你手机上的 app：一个移动端管理器，集中管理你的常用网页，点开后用全屏原生 WebView 打开——没有地址栏、没有标签栏，每个网页用起来就像一个独立 app。纯自用工具，所有数据只保存在本机。

技术栈：**Capacitor 8 + React 19 + TypeScript + Vite + zustand**。

## 下载安装

**Android**（推荐，链接永远指向最新构建）：

```
https://github.com/krismile-sunflower/web2app/releases/latest/download/web2app.apk
```

每次推送到 main 都会自动重新构建并更新这个安装包，也可以在仓库的 [Releases](https://github.com/krismile-sunflower/web2app/releases) 页面下载。

**版本号与覆盖安装**：`versionCode` 使用 CI 构建号自动递增（versionName 形如 `1.0.<构建号>`），且所有构建使用仓库内置的同一签名密钥，新 APK 可直接覆盖安装，无需卸载旧版。

## 功能

- 网页管理：添加 / 编辑 / 删除，favicon 自动抓取（站点 favicon.ico → DuckDuckGo 兜底，可手动指定）
- 分组 + 置顶：按分组分区展示，置顶单独一区，长按卡片弹操作菜单
- 搜索：按名称 / 网址 / 分组实时过滤
- 每页 UA 切换：默认（移动）/ 桌面版 / 自定义
- 每页主题色：卡片磁贴与原生工具栏着色
- 注入脚本：打开页面时执行自定义 JS（如隐藏广告浮层）
- 数据导出 / 导入：JSON 格式，可备份或迁移设备
- 原生 WebView 打开页：自绘工具栏（返回 / 前进 / 刷新 / Safari / 关闭）、边缘滑动手势（左缘 = 网页内有历史先网页内后退，到根再滑退出回首页；右缘 = 前进；Android 系统返回手势同语义）、下拉刷新、加载进度条 + 主题色加载背景（无白/黑屏闪烁）

## 本地开发

```bash
npm install
npm run dev        # 浏览器里调管理界面（打开网页会兜底为新标签页）
npm run build      # 产出 dist/
npx cap sync       # 同步到 iOS / Android 工程
```

### iOS 模拟器

需要完整版 Xcode（App Store 安装后执行 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` 和 `xcodebuild -runFirstLaunch`），然后：

```bash
npm run ios        # 自动：构建 → 同步 → 编译 → 启动模拟器 → 安装 → 启动 app
```

### Android

工程已就绪，APK 由 GitHub Actions 打包（见下），也可本地 `cd android && ./gradlew assembleDebug`。

## CI 打包

推送到 `main`（或手动触发 workflow_dispatch）即运行 `.github/workflows/build.yml`：

- **android-apk**：构建 APK 并自动发布到 Releases（滚动更新 `latest`），固定下载链接见上方「下载安装」
- **ios-build**：模拟器构建，校验 Swift 插件可编译，并产出 `.app` 产物

## 架构说明

```
src/                      管理界面（React）
  store.ts                zustand + @capacitor/preferences 本地持久化
  plugins/webopener.ts    WebOpener 插件 JS 侧（Web 端兜底 window.open）
  components/             卡片网格 / 编辑抽屉 / 设置 / 操作菜单
ios/App/App/
  MainViewController.swift   capacitorDidLoad 里注册本地插件
  WebOpenerPlugin.swift      插件入口（open/close）
  WebOpenerWindowController.swift  全屏 WKWebView + 工具栏 + 下拉刷新
android/.../WebOpenerPlugin.kt / WebOpenerActivity.kt   Android 对应实现
```

两个平台的自绘 WebView 都是手写的本地插件（Capacitor 8 的 `packageClassList` 会覆盖手工注册，所以 iOS 侧走 `registerPluginInstance`，Android 侧在 `MainActivity.onCreate` 里 `registerPlugin`）。

## 已知边界

- app 内 WebView 的登录态与系统浏览器不共享，每个站点需在 app 内登录一次（cookie / localStorage 均为持久化存储，跨次打开保留，退出页面或重启 app 都不会清除；设置里的"清空全部数据"只清站点列表，不动网页数据）
- 拖拽排序只在同一分组内生效（跨分组拖动会弹回）
- iOS 真机自用安装需开发者账号（$99/年）走 TestFlight，或 Xcode 直接真机运行
