# macOS Side: Switching Back to Windows / Linux

While on the MacBook, the Logitech M750 mouse is paired to it (Bluetooth host
slot 3). Its two thumb buttons trigger the return switch:

- **Back button → Windows** (`Switch to Windows.app`: Logitech host 1 / `HDMI_3`)
- **Forward button → Linux** (`Switch to Linux.app`: Logitech host 2 / `HDMI_2`)

One button press moves all three together — the LG TV input (HDMI over
WebOS/IP), the K950 keyboard, and the M750 mouse — the same full-KVM switch as
the Linux and Windows sides. Validated end-to-end on hardware (2026-07-04),
including the return paths from Linux and Windows back to the Mac.

## Architecture (what is actually running)

| Piece | Mechanism |
|-------|-----------|
| Trigger | Logi Options+ binds M750 Back/Forward to "Open application" on the two `.app` wrappers |
| `.app` wrappers | `Switch to Windows.app` / `Switch to Linux.app` in `~/.local/share/aeo-kvm/` — the switch binary **is** the bundle executable (Input Monitoring must land on the exact process that opens the HID device) |
| Mouse switch | HID++ `CHANGE_HOST` (0x1814) from the user-space `.app`, needs that app's Input Monitoring grant |
| Keyboard switch | Root-owned helper `/usr/local/libexec/aeo-kvm/aeo-kvm-kbd` via passwordless `sudo -n` — macOS blocks non-root `hid_open` on keyboards (kIOReturnNotPrivileged) regardless of TCC grants |
| TV input | LG WebOS WebSocket (`wss://TV:3001`) — cached IP from `tv-keys.json` first, SSDP discovery as fallback |

| Host    | Trigger software | Back button       | Forward button    |
|---------|------------------|-------------------|-------------------|
| Linux   | Solaar           | switch-to-windows | switch-to-macbook |
| Windows | Logi Options+    | switch-to-linux   | switch-to-macbook |
| macOS   | Logi Options+    | Switch to Windows | Switch to Linux   |

## Installation

```bash
make macos      # = scripts/macos-lifecycle.sh
```

Installs prerequisites (`bun`, `hidapi` via Homebrew), builds the
`bun-darwin-arm64` binary, copies `aeo-kvm` + `switch-to-*` +
`libhidapi.dylib` to `~/.local/share/aeo-kvm/` (**no sudo**), and (re)builds
the two `.app` wrappers when they are stale. Idempotent — safe to re-run after
a code change.

Then three one-time steps:

1. **Keyboard root helper** (admin password once):

   ```bash
   bash scripts/macos-install-kbd-helper.sh
   ```

   Installs the root-owned helper and `/etc/sudoers.d/aeo-kvm`, whitelisting
   exactly three commands (`keyboard-to-{linux,windows,macbook}`) — no
   wildcards, nothing else runs as root.

2. **Bind the mouse buttons** (no UI clicking):

   ```bash
   python3 scripts/macos-optionsplus-bind.py
   ```

   Writes the Back → Switch to Windows / Forward → Switch to Linux
   assignments directly into Logi Options+' `settings.db` (backed up first),
   then restarts the Options+ agent and verifies it came back up.

3. **Input Monitoring**: System Settings → Privacy & Security → Input
   Monitoring → add **both** apps:
   - `~/.local/share/aeo-kvm/Switch to Windows.app`
   - `~/.local/share/aeo-kvm/Switch to Linux.app`

**First switch:** accept the pairing prompt on the LG TV once; the client key
is saved to `~/.config/aeo-kvm/tv-keys.json`.

## TV behind a router / NAT

SSDP multicast does not cross a NAT. If the Mac sits behind a travel router on
its own subnet, seed the TV's IP manually:

```json
{ "ip": "10.0.0.238" }
```

in `~/.config/aeo-kvm/tv-keys.json`. The cached IP (with a TCP connectivity
check to port 3001) is always tried **before** SSDP, so discovery is never
needed when the seeded IP is reachable. If the TV's DHCP lease changes, update
the file (or pin a DHCP reservation for the TV on the main router).

## Input Monitoring gotchas (learned the hard way)

- The TCC grant is pinned to the app's **code signature**. The wrappers are
  ad-hoc signed, so every rebuild of the `.app`s invalidates existing grants —
  and the Settings toggle still shows "on". **Toggling it off/on does not
  fix this.** Remove the entry (−) and re-add the app, or reset it cleanly:

  ```bash
  tccutil reset ListenEvent com.aeo.kvm.switch-to-windows
  tccutil reset ListenEvent com.aeo.kvm.switch-to-linux
  ```

  then press the button and approve the fresh prompt.
- The grant gates **everything** launched by the app — including the root
  keyboard helper (TCC attributes responsibility to the launching app, even
  across `sudo`). A missing grant looks like every `hid_open` returning
  false in `/tmp/aeo-kvm.log`.
- The Options+ agent (`com.logi.cp-dev-mgr`) is the process that listens to
  the buttons. If buttons do nothing at all (no log entries), check it:

  ```bash
  launchctl print gui/$(id -u)/com.logi.cp-dev-mgr
  ```

  and re-bootstrap with
  `launchctl bootstrap gui/$(id -u) /Library/LaunchAgents/com.logi.optionsplus.plist`.

## Device access (confirmed via ioreg + hardware)

- **M750 L** (PID `0xb02c`): Button-page usages 1–5 (back=4 / forward=5) +
  the `0xFF43` HID++ vendor collection. Opens and switches from a non-root
  user process (with the Input Monitoring grant).
- **K950** (PID `0xb386`): full Keyboard/Keypad + Consumer pages + `0xFF43`
  (and `0xFF0C`). Non-root open is denied with kIOReturnNotPrivileged even
  with Input Monitoring granted — root (the helper) opens it fine.

## Validation (hardware)

1. Press M750 **Back** → TV moves to `HDMI_3`, K950 + M750 switch to host 1
   (Windows). Check `/tmp/aeo-kvm.log`: both devices log
   `switchHostWithRetry: SUCCESS (acknowledged)`.
2. Press M750 **Forward** → TV to `HDMI_2`, devices to host 2 (Linux).
3. From Linux (Solaar) and Windows (Options+), the paired button returns
   everything to the MacBook (`HDMI_4`, host 3).
