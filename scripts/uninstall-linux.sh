#!/bin/bash
# AEO-KVM Linux Uninstall

set -e

INSTALL_DIR="/opt/aeo-kvm"
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

# Stop Solaar so the rules removal takes effect and config.yaml is editable
pkill solaar 2>/dev/null || true
# Never leave Solaar dead: relaunch on ANY exit (set -e aborts included).
trap 'pgrep -x solaar >/dev/null || nohup solaar --window=hide >/dev/null 2>&1 &' EXIT
# Wait for the old process to actually exit - it flushes config.yaml on shutdown.
for _ in $(seq 1 20); do pgrep -x solaar >/dev/null || break; sleep 0.1; done

# Backup and remove Solaar rules
if [ -f "$SOLAAR_RULES" ]; then
    echo "[Remove] Solaar rules..."
    cp "$SOLAAR_RULES" "$SOLAAR_RULES.bak"
    rm "$SOLAAR_RULES"
    echo "  Backed up to $SOLAAR_RULES.bak and removed"
fi

# Return the trigger buttons to the OS - with the rules gone, a diverted key
# is swallowed by Solaar and the button left dead. Scoped to the M750's block.
SOLAAR_CFG="$HOME/.config/solaar/config.yaml"
M750_RANGE='/_NAME:.*M750/,/^- /'
m750_block() { sed -n "${M750_RANGE}p" "$SOLAAR_CFG" 2>/dev/null; }
undivert() {
    if m750_block | grep -q "divert-keys:.*$1: 0x1"; then
        sed -i "${M750_RANGE}{/divert-keys:/s/$1: 0x1/$1: 0x0/}" "$SOLAAR_CFG"
        echo "  $2 divert reverted"
    elif m750_block | grep -q "divert-keys:.*$1: 0x0"; then
        echo "  $2 was not diverted"
    else
        echo "  WARNING: no M750 divert-keys entry for $2 - check in the Solaar UI (a diverted button with no rule is dead)"
    fi
}
undivert 0x53 "Back Button"
undivert 0x56 "Forward Button"

nohup solaar --window=hide > /dev/null 2>&1 &
sleep 1

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
