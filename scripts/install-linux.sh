#!/bin/bash
# AEO-KVM Linux Installation
# Installs executable and sets up Solaar rules + autostart

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="/opt/aeo-kvm"

echo "[Install] AEO-KVM Linux Setup"
echo "  Source: $SCRIPT_DIR"
echo "  Target: $INSTALL_DIR"
echo ""

# Check required files
if [ ! -f "$SCRIPT_DIR/aeo-kvm" ]; then
    echo "[ERROR] aeo-kvm not found in $SCRIPT_DIR"
    echo "        Run this script from the dist/ folder"
    exit 1
fi
if [ ! -f "$SCRIPT_DIR/libhidapi-hidraw.so.0" ]; then
    echo "[ERROR] libhidapi-hidraw.so.0 not found in $SCRIPT_DIR"
    exit 1
fi

# Check dependencies
echo "[Check] Solaar..."
if ! command -v solaar &> /dev/null; then
    echo "  ERROR: Solaar not installed. Install with: sudo apt install solaar"
    exit 1
fi
echo "  OK"

# Create install directory
echo "[Install] Creating $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"
sudo chown -R $USER:$USER "$INSTALL_DIR"

# Copy executable and library
echo "[Install] Copying files..."
cp "$SCRIPT_DIR/aeo-kvm" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/libhidapi-hidraw.so.0" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/aeo-kvm"
echo "  Installed to $INSTALL_DIR/"

# Install Solaar rules
echo "[Setup] Solaar rules..."
mkdir -p ~/.config/solaar
cat > ~/.config/solaar/rules.yaml << EOF
%YAML 1.3
---
- Rule:
  - Key: [Back Button, pressed]
  - Execute: [$INSTALL_DIR/aeo-kvm, switch-to-windows]
- Rule:
  - Key: [Forward Button, pressed]
  - Execute: [$INSTALL_DIR/aeo-kvm, switch-to-macbook]
...
EOF
echo "  Rules installed to ~/.config/solaar/rules.yaml"

# Setup Solaar autostart
echo "[Setup] Solaar autostart..."
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/solaar.desktop << EOF
[Desktop Entry]
Type=Application
Name=Solaar
Exec=solaar --window=hide
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Comment=Logitech device manager for AEO-KVM
EOF
echo "  Autostart entry created"

# Restart Solaar to load new rules (HUP signal doesn't reliably reload)
echo "[Restart] Restarting Solaar to load rules..."
pkill solaar 2>/dev/null || true
# Never leave Solaar dead: relaunch on ANY exit (set -e aborts included) -
# a stopped Solaar breaks the already-working triggers too.
trap 'pgrep -x solaar >/dev/null || nohup solaar --window=hide >/dev/null 2>&1 &' EXIT
# Wait for the old process to actually exit - Solaar flushes its in-memory
# config to config.yaml on shutdown, which would overwrite an edit made too early.
for _ in $(seq 1 20); do pgrep -x solaar >/dev/null || break; sleep 0.1; done

# Divert the trigger buttons on the M750 so presses reach Solaar rules
# instead of the OS. Scoped to the M750's device block so a future second
# device with the same key ids is never touched.
SOLAAR_CFG="$HOME/.config/solaar/config.yaml"
M750_RANGE='/_NAME:.*M750/,/^- /'
m750_block() { sed -n "${M750_RANGE}p" "$SOLAAR_CFG" 2>/dev/null; }
divert() {
    if m750_block | grep -q "divert-keys:.*$1: 0x0"; then
        sed -i "${M750_RANGE}{/divert-keys:/s/$1: 0x0/$1: 0x1/}" "$SOLAAR_CFG"
        echo "  $2 ($1) diverted"
    elif m750_block | grep -q "divert-keys:.*$1: 0x1"; then
        echo "  $2 already diverted"
    else
        echo "  WARNING: no M750 divert-keys entry for $2 in $SOLAAR_CFG - divert it in the Solaar UI"
    fi
}
divert 0x53 "Back Button"
divert 0x56 "Forward Button"

nohup solaar --window=hide > /dev/null 2>&1 &
sleep 2
echo "  Solaar restarted"

echo ""
echo "============================================================"
echo " AEO-KVM Linux installation complete"
echo "============================================================"
echo ""
echo " Installed to: $INSTALL_DIR"
echo " Solaar rules: ~/.config/solaar/rules.yaml"
echo " Autostart:    ~/.config/autostart/solaar.desktop"
echo ""
echo " Test: Press Back Button on mouse to switch to Windows"
echo "       Press Forward Button on mouse to switch to MacBook"
echo "============================================================"
