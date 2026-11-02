#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=== AEO-KVM macOS lifecycle ==="
[ "$(uname -s)" = "Darwin" ] || { echo "This script is macOS-only."; exit 1; }

if ! command -v bun &>/dev/null; then
    echo "[prereq] Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi
command -v bun &>/dev/null || { echo "[ERROR] bun not on PATH; open a new shell and re-run."; exit 1; }

if ! command -v brew &>/dev/null; then
    echo "[ERROR] Homebrew required (https://brew.sh)"; exit 1
fi
brew list hidapi &>/dev/null || { echo "[prereq] brew install hidapi..."; brew install hidapi; }

echo "[build] ./build/setup.sh --mac-only"
./build/setup.sh --mac-only

ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && DARCH=x64 || DARCH=arm64
bash "dist/macos-$DARCH/install.sh"
