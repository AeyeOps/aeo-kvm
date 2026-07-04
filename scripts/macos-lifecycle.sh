#!/bin/bash
# AEO-KVM macOS full lifecycle: prerequisites -> build -> install (+enable rule).
# Idempotent. Run from the repo root (or anywhere): bash scripts/macos-lifecycle.sh
#
# After this completes, two one-time macOS actions remain (TCC permissions and
# the TV pairing prompt cannot be automated) - see the closing notes.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=== AEO-KVM macOS lifecycle ==="
[ "$(uname -s)" = "Darwin" ] || { echo "This script is macOS-only."; exit 1; }

# 1. bun (build toolchain)
if ! command -v bun &>/dev/null; then
    echo "[prereq] Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi
command -v bun &>/dev/null || { echo "[ERROR] bun not on PATH; open a new shell and re-run."; exit 1; }

# 2. hidapi (native lib)
if ! command -v brew &>/dev/null; then
    echo "[ERROR] Homebrew required (https://brew.sh)"; exit 1
fi
brew list hidapi &>/dev/null || { echo "[prereq] brew install hidapi..."; brew install hidapi; }

# 3. Build (macOS only). Produces aeo-kvm plus the prebundled arg-free
#    switch-to-windows / switch-to-linux executables.
echo "[build] ./build/setup.sh --mac-only"
./build/setup.sh --mac-only

# 4. Install (copies binary + switch-to-* + dylib under $HOME)
ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && DARCH=x64 || DARCH=arm64
bash "dist/macos-$DARCH/install.sh"

# 5. .app wrappers for Logi Options+ ("Open application" needs a .app, and the
#    Input Monitoring grant must land on the exact process opening the HID
#    device). Rebuilt only when the installed binary changed: a rebuild
#    re-signs the bundles, which silently invalidates their existing grants.
INSTALL_DIR="$HOME/.local/share/aeo-kvm"
if ! cmp -s "$INSTALL_DIR/switch-to-windows" \
            "$INSTALL_DIR/Switch to Windows.app/Contents/MacOS/switch-to-windows"; then
    bash "$PROJECT_DIR/scripts/macos-make-apps.sh"
    APPS_REBUILT=1
fi

echo ""
echo "=== Lifecycle complete ==="
if [ -n "${APPS_REBUILT:-}" ]; then
    echo "[ACTION REQUIRED] The .app wrappers were (re)built. TCC pins Input"
    echo "  Monitoring grants to the code signature, so remove and RE-ADD both"
    echo "  apps in System Settings -> Privacy & Security -> Input Monitoring"
    echo "  (toggling an existing entry off/on is NOT enough):"
    echo "    $INSTALL_DIR/Switch to Windows.app"
    echo "    $INSTALL_DIR/Switch to Linux.app"
fi
echo "One-time steps if not done yet:"
echo "  1. Keyboard root helper (admin password once):"
echo "       bash scripts/macos-install-kbd-helper.sh"
echo "  2. Bind the M750 buttons in Logi Options+ (edits settings.db directly):"
echo "       python3 scripts/macos-optionsplus-bind.py"
echo "  3. Input Monitoring for BOTH Switch to *.app (see above)."
echo "  4. First switch: accept the LG TV pairing prompt. Behind a router/NAT"
echo "     where SSDP can't reach the TV, seed ~/.config/aeo-kvm/tv-keys.json"
echo "     with {\"ip\": \"<tv-ip>\"} first."
echo ""
echo "Once wired: Back button -> Windows, Forward button -> Linux."
