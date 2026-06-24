#!/bin/bash
# AEO-KVM macOS Installation (no sudo)
# Installs the executable + hidapi dylib under $HOME and enables the
# Karabiner-Elements rule that maps the M750 Back/Forward buttons to switch
# back to Windows / Linux. Run from a built dist/macos-* folder.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.local/share/aeo-kvm"
KARABINER_JSON="$HOME/.config/karabiner/karabiner.json"

echo "[Install] AEO-KVM macOS Setup"
echo "  Source: $SCRIPT_DIR"
echo "  Target: $INSTALL_DIR"
echo ""

# Required files
if [ ! -f "$SCRIPT_DIR/aeo-kvm" ]; then
    echo "[ERROR] aeo-kvm not found in $SCRIPT_DIR (run this from dist/macos-*/)"
    exit 1
fi
if [ ! -f "$SCRIPT_DIR/libhidapi.dylib" ]; then
    echo "[ERROR] libhidapi.dylib not found in $SCRIPT_DIR"
    exit 1
fi

# Install binary + dylib (no sudo: user-writable location)
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/aeo-kvm" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/libhidapi.dylib" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/aeo-kvm"
echo "[Install] Binary + dylib -> $INSTALL_DIR/"

BIN="$INSTALL_DIR/aeo-kvm"

# Enable the Karabiner mouse-button rule automatically by merging it into the
# active profile (idempotent, backs up first). This means no manual UI step.
if command -v python3 &>/dev/null; then
    AEO_BIN="$BIN" KARABINER_JSON="$KARABINER_JSON" python3 - <<'PY'
import json, os, shutil
path = os.environ["KARABINER_JSON"]
binp = os.environ["AEO_BIN"]
os.makedirs(os.path.dirname(path), exist_ok=True)
if os.path.exists(path):
    shutil.copy(path, path + ".bak")
    with open(path) as f:
        cfg = json.load(f)
else:
    cfg = {"profiles": [{"name": "Default profile", "selected": True,
                         "virtual_hid_keyboard": {"keyboard_type_v2": "ansi"}}]}
profiles = cfg.setdefault("profiles", [{"name": "Default profile", "selected": True}])
prof = next((p for p in profiles if p.get("selected")), profiles[0])
cm = prof.setdefault("complex_modifications", {})
rules = [r for r in cm.get("rules", [])
         if not str(r.get("description", "")).startswith("AEO-KVM")]

def rule(desc, btn, cmd):
    return {"description": desc, "manipulators": [
        {"type": "basic", "from": {"pointing_button": btn},
         "to": [{"shell_command": cmd}]}]}

rules.append(rule("AEO-KVM: M750 Back button -> switch to Windows",
                  "button4", f"{binp} switch-to-windows"))
rules.append(rule("AEO-KVM: M750 Forward button -> switch to Linux",
                  "button5", f"{binp} switch-to-linux"))
cm["rules"] = rules
with open(path, "w") as f:
    json.dump(cfg, f, indent=4)
print(f"[Setup] Karabiner rule enabled in {path}")
PY
else
    # Fallback: drop a selectable asset; user enables it in the Karabiner UI
    ASSET_DIR="$HOME/.config/karabiner/assets/complex_modifications"
    mkdir -p "$ASSET_DIR"
    cat > "$ASSET_DIR/aeo-kvm.json" <<EOF
{
  "title": "AEO-KVM mouse buttons",
  "rules": [
    { "description": "AEO-KVM: M750 Back button -> switch to Windows",
      "manipulators": [ { "type": "basic", "from": { "pointing_button": "button4" },
        "to": [ { "shell_command": "$BIN switch-to-windows" } ] } ] },
    { "description": "AEO-KVM: M750 Forward button -> switch to Linux",
      "manipulators": [ { "type": "basic", "from": { "pointing_button": "button5" },
        "to": [ { "shell_command": "$BIN switch-to-linux" } ] } ] }
  ]
}
EOF
    echo "[Setup] python3 not found; dropped asset to $ASSET_DIR"
    echo "        Enable it in Karabiner-Elements -> Complex Modifications."
fi

echo ""
echo "============================================================"
echo " AEO-KVM macOS installation complete"
echo "============================================================"
echo ""
echo " Installed to: $INSTALL_DIR  (no sudo, survives restart)"
echo " Trigger: Back button -> Windows,  Forward button -> Linux"
echo "          (HDMI input + K950 keyboard + M750 mouse all follow)"
echo ""
echo " One-time macOS steps that cannot be scripted:"
echo "   1. Privacy & Security -> Input Monitoring: enable Karabiner-Elements"
echo "      (and $BIN if a switch runs but the devices do not move)."
echo "   2. First button press: accept the pairing prompt on the LG TV"
echo "      (the TV IP is auto-discovered via SSDP)."
echo "============================================================"
