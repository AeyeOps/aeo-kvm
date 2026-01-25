#!/bin/bash
# AEO-KVM Linux Uninstall

set -e

INSTALL_DIR="/opt/aeo/kvm"
SOLAAR_RULES="$HOME/.config/solaar/rules.yaml"
AUTOSTART="$HOME/.config/autostart/solaar.desktop"

echo "[Uninstall] AEO-KVM Linux"

# Remove installation directory
if [ -d "$INSTALL_DIR" ]; then
    echo "[Remove] $INSTALL_DIR..."
    sudo rm -rf "$INSTALL_DIR"
    echo "  Removed"
else
    echo "[Skip] $INSTALL_DIR not found"
fi

# Backup and remove Solaar rules
if [ -f "$SOLAAR_RULES" ]; then
    echo "[Remove] Solaar rules..."
    cp "$SOLAAR_RULES" "$SOLAAR_RULES.bak"
    rm "$SOLAAR_RULES"
    echo "  Backed up to $SOLAAR_RULES.bak and removed"
fi

# Remove autostart entry
if [ -f "$AUTOSTART" ]; then
    echo "[Remove] Autostart entry..."
    rm "$AUTOSTART"
    echo "  Removed"
fi

echo ""
echo "============================================================"
echo " AEO-KVM uninstalled"
echo "============================================================"
echo " Backup: $SOLAAR_RULES.bak (if existed)"
echo " Note: Solaar is still installed (system package)"
echo "============================================================"
