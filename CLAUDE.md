# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Directives
- Validate before declaring root cause/solution
- Version source of truth: pyproject.toml (package.json is stale)
- Document validated insights only
- Request user validation for hardware/UI tests - no automated tests exist
- MINIMAL COMPLEXITY: Prefer existing tools over custom code

## Meta: CLAUDE.md Usage
When to update this file:
- After validating a hypothesis → move to "Validated Facts"
- After discovering a blocking constraint
- When project state changes significantly
- NOT for speculation or in-progress exploration

## State
- Bun/TypeScript implementation with native FFI
- Cross-compiles Linux + Windows from Linux
- Makefile provides simple interface to build commands

## Physical Architecture
```
LG TV (SSDP auto-discovery) | HDMI_2=Linux | HDMI_3=Windows | HDMI_4=MacBook
Logi K950 + M750 L (Bluetooth only, no Bolt/Unifying receiver)
  Host1=Windows | Host2=Linux | Host3=MacBook
Trigger: Mouse Back Button -> Windows, Forward Button -> MacBook
```

## Code Architecture
```
main-ffi.ts          CLI entry, routes to switch commands
    ├── hid-ffi.ts       HID++ protocol for Logitech device switching
    │       └── hidapi-ffi.ts   Bun FFI wrapper for native hidapi library
    ├── tv.ts            LG WebOS TV control via WebSocket (wss://TV:3001)
    └── windows-installer.ts  Self-extracting installer for Windows
```

**Platform FFI differences:**
- Linux wchar_t: 4 bytes (UTF-32)
- Windows wchar_t: 2 bytes (UTF-16)
- hidapi-ffi.ts handles this transparently

## Validated Facts
- Solaar rules work on BLE devices (tested 2026-01-10)
- Back Button (0x53) diverted and sends HID++ notifications
- HID++ BLE uses long reports (0x11, 20 bytes) on usage_page 0xFF43
- M750_L mouse: device_index 0xFF works
- K950 keyboard: device_index 0x00 required (0xFF times out)
- Bun FFI → hidapi works for cross-platform HID++
- Native WebSocket LG TV control works (no bscpylgtv needed)
- Bun compile DOES support `import with { type: "file" }` - Windows DLL is embedded in exe
- Solaar requires full restart (not HUP) to reload rules.yaml reliably
- ~3-5s window after device reconnection where Solaar hasn't re-enabled divert-keys
- SSDP discovery for LG TV works reliably (urn:lge-com:service:webos-second-screen:1)
- TV IP is dynamic (DHCP) - SSDP auto-discovers and updates config
- Windows Hyper-V: UDP multicast requires explicit interface binding (socket.bind to local IP)
- Solaar rules.yaml requires `Rule:` wrapper to combine condition+action (not flat list)
- macOS exposes the `0xFF43` HID++ vendor collection on BOTH K950 (PID 0xb386) and M750 L (PID 0xb02c) over BLE (ioreg-confirmed) - the CHANGE_HOST interface aeo-kvm needs is present on Mac. K950 also exposes `0xFF0C`.
- macOS CHANGE_HOST via HID++ CONFIRMED on hardware (2026-07-04): mouse (M750) opens + switches from a NON-root user process; keyboard (K950) needs ROOT. Non-root K950 open returns kIOReturnNotPrivileged (0xE00002C1) even WITH Input Monitoring granted - an anti-keylogger wall beyond TCC. Root bypasses it (proven: same terminal, `sudo` run opens K950, non-sudo denied). From a TERMINAL session the M750 opens with no grant; from an Options+-launched .app it does NOT (see Input Monitoring facts below).
- macOS DDC/CI display control is DEAD on this Mac, even under root (2026-07-04): `m1ddc display 1 get {input,luminance,contrast,volume}` all return 0 both non-root AND `sudo`. The LG TV enumerates (display 1, `dispext0/IOMobileFramebufferShim`) but exposes no working I2C/DDC channel - Apple Silicon's built-in framebuffer path doesn't plumb the AUX bus, and root can't wire a bus the hardware doesn't expose (IOAVServiceReadI2C isn't privilege-gated, it fails at the transport). DDC ruled out permanently; macOS display switch must go over the network (WebOS/IP) or via a router-proxy.
- macOS keyboard solution = tiny root-owned helper `/usr/local/libexec/aeo-kvm/aeo-kvm-kbd` (root:wheel, dylib beside it root-owned) invoked via passwordless `sudo -n` whitelisted in `/etc/sudoers.d/aeo-kvm` (3 EXACT `keyboard-to-{linux,windows,macbook}` commands, no wildcard). NOT a DriverKit sysext / MDM policy (user rejected that wall). User-space `.app` still does mouse + TV; only keyboard setHost runs as root. Installed by `scripts/macos-install-kbd-helper.sh`. Verified end-to-end: K950 open=OK + setHost acknowledged via the helper (2026-07-04).
- macOS reports M750 L buttons as standard Button-page usages 1-5 (L/R/middle/back=4/forward=5), so button-binding tools can see them. Proprietary controls that emit only via vendor pages are NOT bindable that way (same class Solaar/Options+ reach via HID++ divert); M750 has none beyond the 5 standard buttons.
- macOS trigger = Logi Options+ (VALIDATED end-to-end 2026-07-04, all three directions incl. TV HDMI): M750 Back/Fwd bound to "Open application" on Switch to {Windows,Linux}.app via scripts/macos-optionsplus-bind.py, which edits Options+' settings.db directly (profile blob, card_global_presets_open_application). The Options+ agent com.logi.cp-dev-mgr is the button listener - if it's not in `launchctl list`, buttons silently do nothing; `launchctl bootstrap` right after `bootout` can fail transiently, so the bind script retries and verifies the agent is up.
- macOS TCC Input Monitoring (2026-07-04): an Options+-launched .app needs the grant to hid_open EITHER device (M750 included - the "no grant needed" result was terminal-context only). The grant gates children too: the root kbd helper fails via sudo if the launching .app lacks the grant (TCC responsibility flows to the responsible app). Grants pin to the code signature: every macos-make-apps.sh re-sign invalidates them SILENTLY - the Settings toggle still shows on, and toggling off/on does NOT fix it. Fix = remove+re-add the app, or `tccutil reset ListenEvent com.aeo.kvm.switch-to-<target>` (works without Full Disk Access) then approve the fresh prompt. Symptom in /tmp/aeo-kvm.log: every `open: ... success=false`.
- Mac behind GL-iNet travel router (192.168.8.x): SSDP multicast can NOT cross the NAT, so TV discovery always fails there - but direct TCP to the TV on the house LAN (10.0.0.238:3001) routes fine. Fix = seed ~/.config/aeo-kvm/tv-keys.json with {"ip": ...}; tv.ts tries cached IP (TCP check) BEFORE SSDP. If the TV's DHCP lease changes, re-seed manually (SSDP fallback can't work from behind the NAT); DHCP-reserve the TV IP on the main router.
- Apple `container` (Homebrew formula, 1.0.0, macOS 26+/Apple Silicon, no sudo) builds the Linux arm64 `libhidapi-hidraw.so.0` inside a throwaway Ubuntu VM, letting a Mac build all three packages (tested 2026-06-24). Needs `pkg-config` in the apt list (cmake libusb-backend probe). Kernel: `container system kernel set --recommended`; volume mount `-v host:guest` writes back to libs/. setup.sh auto-uses it when on Darwin + `container` present.
- Container lifecycle is Apple's `container` CLI, NOT brew services (`brew services list` shows `container none`; brew only installs the binary). `container system status` exits 0=running/1=stopped. setup.sh's build starts the service only if down and stops it afterward only if it started it (transient build use); a pre-running service is left alone.

## Key Paths
- Build script: build/setup.sh
- Source: src/{main-ffi,hid-ffi,hidapi-ffi,tv}.ts
- Installer: scripts/install-linux.sh, scripts/install-macos.sh (Windows uses self-extracting exe)
- macOS lifecycle (one command): scripts/macos-lifecycle.sh (`make macos`) - prereqs+build+install+enable
- macOS install dir: ~/.local/share/aeo-kvm/ (no sudo); trigger via Logi Options+ Smart Action bound to M750 Back/Fwd -> "Switch to *.app". Keyboard root helper at /usr/local/libexec/aeo-kvm/ (installed by scripts/macos-install-kbd-helper.sh, needs admin pw once)
- Libs (built): libs/{hidapi.dll,libhidapi-hidraw.so.0,libhidapi.dylib}
- Output: dist/{linux-*,windows-x64,macos-*}/
- Solaar config: ~/.config/solaar/rules.yaml
- TV config: tv-keys.json (Linux/macOS: ~/.config/aeo-kvm/, Windows: same dir as exe)
- HDMI inputs: hardcoded in src/main-ffi.ts

## Known Limitations
- First button press after switching back to Linux may be ignored (~3-5s Solaar reconnection window)
- No automated tests - requires physical hardware

## Build Commands
```bash
make build                                  # Full build (both platforms)
make dev ARGS="switch-to-linux --verbose"   # Test locally without building
make clean                                  # Remove dist/
./build/setup.sh --linux-only               # Linux only
./build/setup.sh --windows-only             # Windows only
```

First build requires sudo for: libudev-dev, cmake, build-essential, libusb-1.0-0-dev

## HID++ Protocol Notes
```
Report format (long): [0x11, device_index, feature_index, function<<4|sw_id, ...params] (20 bytes)
Feature discovery: Send to feature 0x00, function 0x00 with [feature_id_hi, feature_id_lo]
CHANGE_HOST feature: 0x1814, function 0x01 = setHost(host_index)
Device wakes on any HID activity - may need retry if sleeping
SW_ID (lower 4 bits of byte 3): Use unique value (0x0A) to filter responses when sharing device with Solaar
Filter reads: Accept only report IDs 0x10/0x11 (HID++), discard 0x02 (mouse movement) etc.
```

## Cross-Platform Debugging

### Windows Access
- SSH alias: `ssh windows` (configure Host in ~/.ssh/config)
- Logs: `./scripts/get-windows-logs.sh [logs|config|all] [lines]`
- Deploy: Build script auto-deploys via SCP+SSH

### Windows Quirks
- SSDP/UDP multicast on Hyper-V: Must bind to explicit local IP (10.0.0.x), not 0.0.0.0
  - Windows may route multicast to VPN interface (NordLynx) if not explicit
  - Use socket.bind(port, localIP) + socket.setMulticastInterface(localIP)
