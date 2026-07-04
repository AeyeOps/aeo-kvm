#!/bin/bash
# AEO-KVM macOS Installation (no sudo)
# Installs the executable + hidapi dylib under $HOME. The M750 Back/Forward
# buttons are wired via Logi Options+ Smart Actions (no kernel driver / system
# extension needed). Run from a built dist/macos-* folder.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.local/share/aeo-kvm"

echo "[Install] AEO-KVM macOS Setup"
echo "  Source: $SCRIPT_DIR"
echo "  Target: $INSTALL_DIR"
echo ""

# Required files (aeo-kvm + the prebundled arg-free per-target executables)
for f in aeo-kvm switch-to-windows switch-to-linux libhidapi.dylib; do
    if [ ! -f "$SCRIPT_DIR/$f" ]; then
        echo "[ERROR] $f not found in $SCRIPT_DIR (run this from dist/macos-*/)"
        exit 1
    fi
done

# Install binary + per-target copies + dylib (no sudo: user-writable location).
# -f removes a read-only destination first (the brew dylib installs mode 444).
mkdir -p "$INSTALL_DIR"
for f in aeo-kvm switch-to-windows switch-to-linux libhidapi.dylib; do
    cp -f "$SCRIPT_DIR/$f" "$INSTALL_DIR/$f"
done
chmod +x "$INSTALL_DIR/aeo-kvm" "$INSTALL_DIR/switch-to-windows" "$INSTALL_DIR/switch-to-linux"
echo "[Install] Binary + switch-to-* + dylib -> $INSTALL_DIR/"

echo ""
echo "============================================================"
echo " AEO-KVM macOS installation complete"
echo "============================================================"
echo ""
echo " Installed to: $INSTALL_DIR  (no sudo, survives restart)"
echo ""
echo " Next steps (or run 'make macos', which also builds the .app wrappers):"
echo "   1. Build the .app wrappers Logi Options+ launches:"
echo "        bash scripts/macos-make-apps.sh"
echo "   2. Install the root keyboard helper (admin password once; the K950"
echo "      only opens for root):"
echo "        bash scripts/macos-install-kbd-helper.sh"
echo "   3. Bind M750 Back -> Switch to Windows, Forward -> Switch to Linux:"
echo "        python3 scripts/macos-optionsplus-bind.py"
echo "   4. Privacy & Security -> Input Monitoring: add BOTH"
echo "        $INSTALL_DIR/Switch to Windows.app"
echo "        $INSTALL_DIR/Switch to Linux.app"
echo "      (re-add after every wrapper rebuild - grants pin to the signature)"
echo "   5. First switch: accept the pairing prompt on the LG TV. If SSDP can't"
echo "      reach the TV (router/NAT), seed ~/.config/aeo-kvm/tv-keys.json"
echo "      with {\"ip\": \"<tv-ip>\"}."
echo "============================================================"
