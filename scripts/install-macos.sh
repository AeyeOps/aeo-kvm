#!/bin/bash
set -euo pipefail

[ "$(uname -s)" = "Darwin" ] || { echo "[ERROR] macOS only"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.local/share/aeo-kvm"

echo "[Install] AEO-KVM macOS Setup"
echo "  Source: $SCRIPT_DIR"
echo "  Target: $INSTALL_DIR"
echo ""

for f in aeo-kvm switch-to-windows switch-to-linux libhidapi.dylib pyproject.toml scripts/macos-make-apps.sh; do
    if [ ! -f "$SCRIPT_DIR/$f" ]; then
        echo "[ERROR] $f not found in $SCRIPT_DIR (run this from dist/macos-*/)"
        exit 1
    fi
done

mkdir -p "$INSTALL_DIR"
for f in aeo-kvm switch-to-windows switch-to-linux libhidapi.dylib; do
    cp -f "$SCRIPT_DIR/$f" "$INSTALL_DIR/$f.new"
    mv -f "$INSTALL_DIR/$f.new" "$INSTALL_DIR/$f"
done
chmod +x "$INSTALL_DIR/aeo-kvm" "$INSTALL_DIR/switch-to-windows" "$INSTALL_DIR/switch-to-linux"
echo "[Install] Binary + switch-to-* + dylib -> $INSTALL_DIR/"

bash "$SCRIPT_DIR/scripts/macos-make-apps.sh"

echo ""
echo "============================================================"
echo " AEO-KVM macOS installed — permission approval required"
echo "============================================================"
echo ""
echo " Installed to: $INSTALL_DIR  (no sudo, survives restart)"
echo ""
echo " Enable Switch to Windows and Switch to Linux in the Input Monitoring"
echo " settings opened above. The installer refreshed both permission entries."
echo ""
echo " One-time setup if not already configured:"
echo "   1. Install the root keyboard helper (admin password once; the K950"
echo "      only opens for root):"
echo "        bash \"$SCRIPT_DIR/scripts/macos-install-kbd-helper.sh\""
echo "   2. Bind M750 Back -> Switch to Windows, Forward -> Switch to Linux:"
echo "        python3 \"$SCRIPT_DIR/scripts/macos-optionsplus-bind.py\""
echo "   3. First switch: accept the pairing prompt on the LG TV. If SSDP can't"
echo "      reach the TV (router/NAT), seed ~/.config/aeo-kvm/tv-keys.json"
echo "      with {\"ip\": \"<tv-ip>\"}."
echo "============================================================"
