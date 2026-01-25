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
sleep 1
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
echo "============================================================"
