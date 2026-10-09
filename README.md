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
- **场景（工作环境）**：把一组站点组合成一个上下文，例如「上班」只显示内部系统与工具、「看盘」只显示行情与资讯。场景按分组批量纳入，并可额外纳入 / 排除个别站点；首页顶部一键切换，选中后站点网格、计数与分组数一起过滤。场景不改动站点本身，只是叠加在站点之上的一层过滤
- **场景级覆盖**：场景可以整体覆盖 UA、主题色与注入脚本，作用于「打开网页」时的参数与首页卡片外观。例如「看盘」统一强制桌面 UA + 深色主题色，「上班」统一注入一段隐藏侧边栏的脚本——不用逐个站点去改
- **一键打开整个场景**：选中场景后点「打开全部」，全部站点在一个原生容器里以底部标签栏打开，各自带着自己的 UA / 主题色 / 注入脚本。标签按需加载后常驻，切回来不会重新加载；只有一个站点时自动隐藏标签栏
- 搜索：按名称 / 网址 / 分组实时过滤（在当前场景范围内搜索）
- 每页 UA 切换：默认（移动）/ 桌面版 / 自定义
- 每页主题色：卡片磁贴与原生工具栏着色
- 主题联动：应用外观可切换（跟随系统 / 浅色 / 深色），内嵌网页自动套用对应配色；设置里可开关该同步并选择网页配色（跟随应用 / 强制浅色 / 强制深色），切换主题时已打开的网页实时联动
- 注入脚本：打开页面时执行自定义 JS（如隐藏广告浮层）
- 数据导出 / 导入：JSON 格式，可备份或迁移设备（导出包含站点、场景与设置）
- 原生 WebView 打开页：无工具栏全屏沉浸，纯手势导航（左缘滑 / 系统返回 = 网页内有历史先网页内后退，到根再操作退出回首页；iOS 右缘滑 = 前进）、下拉刷新、加载进度条 + 主题色加载背景（无白/黑屏闪烁）

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
  store.ts                zustand + @capacitor/preferences 本地持久化（站点 + 设置 + 场景）
  types.ts                Site / Scene / SceneOverrides 数据模型、场景匹配与覆盖合并
  settings.ts             外观/主题设置模型与解析（应用主题 → 网页配色方案）
  plugins/webopener.ts    WebOpener 插件 JS 侧（open / openScene / setColorScheme；Web 端兜底 window.open）
  components/             卡片网格 / 编辑抽屉 / 设置 / 场景管理 / 操作菜单
ios/App/App/
  MainViewController.swift   capacitorDidLoad 里注册本地插件
  WebOpenerPlugin.swift      插件入口（open / openScene / close / setColorScheme）
  WebOpenerWindowController.swift  全屏多标签 WKWebView + 底部标签栏 + 下拉刷新
android/.../WebOpenerPlugin.kt / WebOpenerActivity.kt   Android 对应实现
```

本地持久化键：`web2app.sites.v1`（站点）、`web2app.settings.v1`（外观设置）、`web2app.scenes.v1`（场景列表 + 当前激活场景）。三者相互独立，任一损坏都只回退自身。

备份信封：v1 是裸的 `Site[]`；v2 起为 `{ version: 2, sites, scenes, settings }`。导入时由 `sanitizeBackup` 做兼容分发——v1 文件照常可用（场景与设置沿用当前值），v2 文件则整包恢复。删除站点时会同步清理场景里对它的引用，不会留下脏 id。

场景覆盖的合并由 `withSceneOverrides(site, scene)` 完成，返回新对象：站点自身的配置永远不被改写，编辑页里看到的始终是原始值；操作菜单里的「编辑 / 删除」按 id 回退到原始站点，避免把覆盖值写回站点。

原生多标签：`open()` 与 `openScene()` 在两端走同一条路径——把 N 个页面的规格以并行数组（Android）/ `[WebOpenerTabSpec]`（iOS）传给同一个容器，容器内底部标签栏切换、WebView 按需创建后常驻，单页时自动隐藏标签栏。Android 切换日/夜模式会重建 Activity，重建前会把各标签的当前地址与当前标签写回 intent，避免回退到初始页。

网页配色联动实现：iOS 用 `WKWebView.overrideUserInterfaceStyle`、Android 用 AppCompat `localNightMode`（决定主题 `isLightTheme`，进而决定 WebView 的 `prefers-color-scheme`），另在 Android 打开算法变暗兜底未适配深色的网页。

两个平台的自绘 WebView 都是手写的本地插件（Capacitor 8 的 `packageClassList` 会覆盖手工注册，所以 iOS 侧走 `registerPluginInstance`，Android 侧在 `MainActivity.onCreate` 里 `registerPlugin`）。

## 已知边界

- app 内 WebView 的登录态与系统浏览器不共享，每个站点需在 app 内登录一次（cookie / localStorage 均为持久化存储，跨次打开保留，退出页面或重启 app 都不会清除；设置里的"清空全部数据"只清站点列表，不动网页数据）
- 拖拽排序只在同一分组内生效（跨分组拖动会弹回）
- 场景覆盖是「整场统一」的：不支持给场景内某个站点单独开小灶（那属于站点自身配置，回站点编辑页改）
- 多标签容器里切换标签会保留各标签的页面状态，但退出容器时全部一起销毁；「返回」只在当前标签内后退，到根再返回就退出容器
- iOS 真机自用安装需开发者账号（$99/年）走 TestFlight，或 Xcode 直接真机运行
