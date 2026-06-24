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

## Key Paths
- Build script: build/setup.sh
- Source: src/{main-ffi,hid-ffi,hidapi-ffi,tv}.ts
- Installer: scripts/install-linux.sh (Windows uses self-extracting exe)
- Libs (built): libs/{hidapi.dll,libhidapi-hidraw.so.0}
- Output: dist/
- Solaar config: ~/.config/solaar/rules.yaml
- TV config: tv-keys.json (Linux: ~/.config/aeo-kvm/, Windows: same dir as exe)
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
