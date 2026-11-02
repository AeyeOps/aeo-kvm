#!/bin/bash
set -euo pipefail

[ "$(uname -s)" = "Darwin" ] || { echo "[ERROR] macOS only"; exit 1; }

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' "$PROJECT_DIR/pyproject.toml")
INSTALL_DIR="$HOME/.local/share/aeo-kvm"

make_app() {
    local target="$1"
    local pretty="$2"
    local app="$INSTALL_DIR/$pretty.app"
    local macos="$app/Contents/MacOS"

    [ -f "$INSTALL_DIR/$target" ] || { echo "[ERROR] missing $INSTALL_DIR/$target (run install first)"; exit 1; }

    rm -rf "$app"
    mkdir -p "$macos"
    cp "$INSTALL_DIR/$target" "$macos/$target"
    cp "$INSTALL_DIR/libhidapi.dylib" "$macos/libhidapi.dylib"
    chmod +x "$macos/$target"

    cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>$target</string>
    <key>CFBundleIdentifier</key><string>com.aeo.kvm.$target</string>
    <key>CFBundleName</key><string>$pretty</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>$VERSION</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

    codesign --force --deep -s - "$app"
    echo "[app] $app  (executable=$target)"
}

make_app switch-to-windows "Switch to Windows"
make_app switch-to-linux   "Switch to Linux"

/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f "$INSTALL_DIR/Switch to Windows.app" "$INSTALL_DIR/Switch to Linux.app"

echo ""
echo "[Permissions] Refreshing Input Monitoring for the two Switch apps."
/usr/bin/tccutil reset ListenEvent com.aeo.kvm.switch-to-windows
/usr/bin/tccutil reset ListenEvent com.aeo.kvm.switch-to-linux
/usr/bin/open -n -W "$INSTALL_DIR/Switch to Windows.app" --args request-input-monitoring
/usr/bin/open -n -W "$INSTALL_DIR/Switch to Linux.app" --args request-input-monitoring
/usr/bin/open "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"

echo ""
echo "[ACTION REQUIRED] Enable Switch to Windows and Switch to Linux in Input Monitoring."
echo "  macOS requires you to approve both switches yourself."
echo "  Permission setup does not switch the keyboard, mouse, or TV."
