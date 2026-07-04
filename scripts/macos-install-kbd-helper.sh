#!/bin/bash
# Install the aeo-kvm keyboard root helper on macOS.
#
# WHY THIS EXISTS: macOS gates keyboard (K950) HID++ access behind root - even
# with Input Monitoring granted, a non-root process gets kIOReturnNotPrivileged
# (0xE00002C1, anti-keylogger wall). The mouse (M750) and the TV need no
# privilege and stay in the user-space .app. Only the keyboard setHost runs as
# root, through this helper.
#
# SECURITY MODEL (why it is not a privesc hole):
#   - Helper binary + its dylib live in /usr/local/libexec/aeo-kvm, a root:wheel
#     path chain the invoking user cannot write. NOPASSWD sudo on a
#     user-writable binary would let the user rewrite what root runs; this
#     avoids that.
#   - sudoers whitelists three EXACT commands (keyboard-to-{linux,windows,
#     macbook}) - no wildcard, no arbitrary args.
#   - It is userland root via your admin password, NOT a DriverKit system
#     extension / MDM policy. Nothing persists running; sudo launches it per
#     press and it exits.
#
# Run WITHOUT sudo (the script calls sudo itself; you enter your password once):
#   ./scripts/macos-install-kbd-helper.sh
set -euo pipefail

[ "$(uname)" = "Darwin" ] || { echo "[ERROR] macOS only"; exit 1; }

SRC_DIR="$HOME/.local/share/aeo-kvm"
SRC_BIN="$SRC_DIR/aeo-kvm"
SRC_DYLIB="$SRC_DIR/libhidapi.dylib"
DEST_DIR="/usr/local/libexec/aeo-kvm"
DEST_BIN="$DEST_DIR/aeo-kvm-kbd"
DEST_DYLIB="$DEST_DIR/libhidapi.dylib"
SUDOERS="/etc/sudoers.d/aeo-kvm"
USER_NAME="$(id -un)"

[ -f "$SRC_BIN" ]   || { echo "[ERROR] missing $SRC_BIN (run the macOS build/install first)"; exit 1; }
[ -f "$SRC_DYLIB" ] || { echo "[ERROR] missing $SRC_DYLIB"; exit 1; }

# Refuse to install into a non-root-owned path chain (would defeat the model).
owner="$(stat -f '%Su' /usr/local)"
[ "$owner" = "root" ] || { echo "[ERROR] /usr/local is owned by '$owner', not root - unsafe for a NOPASSWD helper"; exit 1; }

echo "[1/4] Installing helper -> $DEST_BIN (root:wheel)"
sudo mkdir -p "$DEST_DIR"
sudo cp "$SRC_BIN"   "$DEST_BIN"
sudo cp "$SRC_DYLIB" "$DEST_DYLIB"
sudo chown -R root:wheel "$DEST_DIR"
sudo chmod 755 "$DEST_DIR" "$DEST_BIN"
sudo chmod 644 "$DEST_DYLIB"
# cp preserves the ad-hoc signature, but re-sign defensively so a perturbed
# signature never blocks root execution.
sudo codesign --force -s - "$DEST_BIN" >/dev/null 2>&1 || true

echo "[2/4] Writing + validating sudoers rule (exact commands, no wildcard)"
tmp_sudoers="$(mktemp)"
cat > "$tmp_sudoers" <<EOF
# aeo-kvm: let $USER_NAME run the keyboard-switch helper as root, no password.
# The helper opens the K950 HID++ interface (root-gated on macOS) and sends only
# a CHANGE_HOST setHost. Exact commands whitelisted - no wildcards.
$USER_NAME ALL=(root) NOPASSWD: $DEST_BIN keyboard-to-linux, $DEST_BIN keyboard-to-windows, $DEST_BIN keyboard-to-macbook
EOF
sudo visudo -cf "$tmp_sudoers" >/dev/null
sudo install -m 0440 -o root -g wheel "$tmp_sudoers" "$SUDOERS"
rm -f "$tmp_sudoers"

echo "[3/4] Verifying passwordless invocation"
sudo -k   # drop cached credentials so -n truly tests the NOPASSWD rule, not the cache
if sudo -n "$DEST_BIN" keyboard-to-macbook >/dev/null 2>&1; then
  echo "      OK - sudo -n reached the helper (keyboard should have switched to this Mac)"
else
  echo "      [WARN] sudo -n returned nonzero - check $SUDOERS"
fi

echo "[4/4] Done."
echo ""
echo "Installed:"
echo "  $DEST_BIN   (root:wheel 755)"
echo "  $DEST_DYLIB (root:wheel 644)"
echo "  $SUDOERS    (root:wheel 440)"
echo ""
echo "The 'Switch to *' apps now switch the keyboard too - no per-press password."
