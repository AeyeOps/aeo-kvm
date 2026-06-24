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

# 3. Karabiner-Elements (the trigger). The system-extension activation needs a
#    password + a Privacy approval, so this step may require interaction.
if [ ! -d "/Applications/Karabiner-Elements.app" ]; then
    echo "[prereq] Installing Karabiner-Elements..."
    brew install --cask karabiner-elements \
        || echo "  [warn] Run 'brew install --cask karabiner-elements' yourself, then re-run this script."
fi

# 4. Build (macOS only)
echo "[build] ./build/setup.sh --mac-only"
./build/setup.sh --mac-only

# 5. Install + enable the Karabiner rule
ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && DARCH=x64 || DARCH=arm64
bash "dist/macos-$DARCH/install.sh"

echo ""
echo "=== Lifecycle complete ==="
echo "Remaining one-time steps (macOS protects these; no script can do them):"
echo "  1. System Settings -> Privacy & Security -> Input Monitoring:"
echo "     enable Karabiner-Elements (and ~/.local/share/aeo-kvm/aeo-kvm if a"
echo "     switch fires but the mouse/keyboard do not move host)."
echo "  2. Press a button once and accept the LG TV pairing prompt (auto-found)."
echo ""
echo "Karabiner auto-starts at login, so the trigger survives restart."
echo "From then on: Back button -> Windows, Forward button -> Linux."
