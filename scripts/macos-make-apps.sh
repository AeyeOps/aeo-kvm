#!/bin/bash
# Build self-contained .app wrappers for the switch-to-* executables so Logi
# Options+ Smart Actions ("Open application" needs a .app) can launch them.
#
# CRITICAL: the switch binary IS the app's CFBundleExecutable (not a child of a
# launcher script). macOS Input Monitoring (TCC) does NOT extend to child
# processes - the exact process that opens the K950 keyboard HID must itself be
# the granted app. So we embed the binary + dylib directly in Contents/MacOS.
# The binary picks its target from its own filename (switch-to-windows -> Windows)
# and finds libhidapi.dylib next to itself.
#
# After (re)building, grant Input Monitoring to BOTH .apps in
# System Settings -> Privacy & Security -> Input Monitoring.
set -e

INSTALL_DIR="$HOME/.local/share/aeo-kvm"

make_app() {
    local target="$1"          # switch-to-windows | switch-to-linux
    local pretty="$2"          # "Switch to Windows"
    local app="$INSTALL_DIR/$pretty.app"
    local macos="$app/Contents/MacOS"

    [ -f "$INSTALL_DIR/$target" ] || { echo "[ERROR] missing $INSTALL_DIR/$target (run install first)"; exit 1; }

    rm -rf "$app"
    mkdir -p "$macos"
    # The binary itself is the app executable; dylib sits beside it (findLibPath
    # checks dirname(execPath) first).
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
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

    codesign --force --deep -s - "$app" >/dev/null 2>&1 || true
    echo "[app] $app  (executable=$target)"
}

make_app switch-to-windows "Switch to Windows"
make_app switch-to-linux   "Switch to Linux"

/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f "$INSTALL_DIR/Switch to Windows.app" "$INSTALL_DIR/Switch to Linux.app" 2>/dev/null || true

echo ""
echo "Next: grant Input Monitoring to BOTH .apps:"
echo "  System Settings -> Privacy & Security -> Input Monitoring -> +"
echo "    $INSTALL_DIR/Switch to Windows.app"
echo "    $INSTALL_DIR/Switch to Linux.app"
