#!/usr/bin/env bash
# 一键在 iOS 模拟器中构建、安装并启动 Web2App。
# 前置条件：已安装完整 Xcode（xcode-select -s /Applications/Xcode.app/Contents/Developer）
set -euo pipefail
cd "$(dirname "$0")/.."

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "❌ 未检测到 Xcode。请先从 App Store 安装 Xcode，然后执行："
  echo "   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  echo "   xcodebuild -runFirstLaunch   # 按提示安装 iOS 模拟器运行时"
  exit 1
fi

echo "▶ 构建	web 资源并同步..."
npm run build
npx cap sync ios

echo "▶ 查找可用的 iPhone 模拟器..."
SIM_ID=$(xcrun simctl list devices available | grep -m1 -oE '[A-F0-9]{8}-([A-F0-9]{4}-){3}[A-F0-9]{12}' || true)
if [ -z "$SIM_ID" ]; then
  echo "❌ 没有可用的模拟器。请打开 Xcode → Settings → Components 下载 iOS 模拟器运行时。"
  exit 1
fi
SIM_NAME=$(xcrun simctl list devices available | grep "$SIM_ID" | sed -E 's/^\s+(.*) \([A-F0-9-]+\).*/\1/')
echo "   使用 $SIM_NAME"

echo "▶ 启动模拟器..."
xcrun simctl boot "$SIM_ID" 2>/dev/null || true
open -a Simulator

echo "▶ xcodebuild 编译中（首次会解析 SPM 依赖，需要几分钟）..."
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "id=$SIM_ID" \
  -derivedDataPath ios/build \
  CODE_SIGNING_ALLOWED=NO \
  build

echo "▶ 安装并启动 app..."
xcrun simctl install "$SIM_ID" ios/build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$SIM_ID" com.zcc.web2app

echo ""
echo "✅ Web2App 已在模拟器（$SIM_NAME）中启动。"
echo "   截图：xcrun simctl io booted screenshot shot.png"
