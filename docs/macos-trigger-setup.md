# macOS Side: Switching Back to Windows / Linux

While on the MacBook, the Logitech M750 mouse is paired to it (Bluetooth host
slot 3). Its two thumb buttons trigger the return switch:

- **Back button → Windows** (`switch-to-windows`: Logitech host 1 / `HDMI_3`)
- **Forward button → Linux** (`switch-to-linux`: Logitech host 2 / `HDMI_2`)

A single `aeo-kvm switch-to-X` command moves all three together — the LG TV
input (HDMI), the K950 keyboard, and the M750 mouse — so one button press is a
full KVM switch, the same as the Linux and Windows sides.

## Why Karabiner-Elements

macOS has no Solaar, and Logi Options+ on the Mac cannot reliably launch a
command with an argument (the same limitation that forced two `.exe`
entrypoints on Windows). Karabiner-Elements can bind a pointing-device button
directly to a `shell_command`, so the Mac reuses the **single-binary, argument**
model the Linux side already uses with Solaar — no wrapper apps needed.

| Host    | Trigger software | Back button     | Forward button   |
|---------|------------------|-----------------|------------------|
| Linux   | Solaar           | switch-to-windows | switch-to-macbook |
| Windows | Logi Options+    | switch-to-linux   | switch-to-macbook |
| macOS   | Karabiner-Elements | switch-to-windows | switch-to-linux  |

## Install — one command

```bash
make macos      # = scripts/macos-lifecycle.sh
```

This runs the whole lifecycle on the current Mac: installs prerequisites (`bun`,
`hidapi`, Karabiner-Elements), builds the `bun-darwin-arm64` binary, copies
`aeo-kvm` + `libhidapi.dylib` to `~/.local/share/aeo-kvm/` (**no sudo**), and
**auto-enables** the Karabiner rule by merging it into your active profile
(backing the profile up first). No manual Karabiner UI step.

It is idempotent — safe to re-run after a code change.

## Survives restart

Karabiner-Elements registers itself as a login agent, so the trigger is active
after every reboot with no autostart wiring of our own. The binary lives in
`~/.local/share/aeo-kvm/` and the rule lives in your Karabiner profile.

## Two one-time steps macOS will not let a script do

1. **Input Monitoring** (System Settings → Privacy & Security): enable
   Karabiner-Elements. If a switch fires but the devices don't move host, also
   add `~/.local/share/aeo-kvm/aeo-kvm`.
2. **TV pairing**: the first button press triggers SSDP discovery and a pairing
   prompt on the LG TV — accept it once; the client key is saved.

## Device access (confirmed via ioreg)

Both devices were enumerated on the MacBook while paired to it:

- **M750 L** (PID `0xb02c`): Button-page usages 1–5 (all five buttons standard,
  back=4 / forward=5) + the `0xFF43` HID++ vendor collection.
- **K950** (PID `0xb386`): full Keyboard/Keypad + Consumer pages + the `0xFF43`
  HID++ vendor collection (and `0xFF0C`).

So macOS exposes the standard buttons/keys Karabiner needs **and** the `0xFF43`
interface `aeo-kvm` uses to issue `CHANGE_HOST` to both devices — the same
mechanism used on Linux/Windows. Karabiner cannot bind controls that emit only
via the vendor pages, but the M750 has no such extra buttons.

## Prerequisites (installed automatically by `make macos`)

- `bun` — `curl -fsSL https://bun.sh/install | bash`
- `libhidapi.dylib` — `brew install hidapi`
- Karabiner-Elements — `brew install --cask karabiner-elements`

## Validation (hardware)

1. `~/.local/share/aeo-kvm/aeo-kvm switch-to-windows --verbose` from Terminal —
   TV moves to HDMI_3 and the K950 + M750 switch to host 1. Check
   `/tmp/aeo-kvm.log`. (This first run also pairs the TV.)
2. `~/.local/share/aeo-kvm/aeo-kvm switch-to-linux --verbose` — TV to HDMI_2,
   devices to host 2.
3. M750 Back button switches to Windows, Forward to Linux. If reversed on your
   unit, swap `button4`/`button5` in the rule
   (`~/.config/karabiner/karabiner.json`) and reload Karabiner.
