# aeo-kvm

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-lightgrey.svg)](#requirements)

Software KVM switch for Logitech multi-host devices and LG WebOS TVs.

## The Problem

Modern multi-host keyboards and mice (like Logitech's K950/M750) let you pair with multiple computers and switch between them. Modern smart TVs have multiple HDMI inputs for different machines. But switching requires multiple manual steps: press device buttons, change TV input, wait for reconnection.

## The Solution

aeo-kvm coordinates all switching in one action:

1. **Mouse button press** triggers the switch (via Solaar on Linux, Logi Options+ on Windows)
2. **HID++ commands** switch Logitech devices to the target host
3. **WebSocket commands** switch LG TV to the corresponding HDMI input

Result: press one button, everything switches together.

## Architecture

```
                    +-----------------+
                    |   LG TV (HDMI)  |
                    +-----------------+
                             |
         +-------------------+-------------------+
         |                                       |
    HDMI_2                                  HDMI_3
   (Linux)                                (Windows)

    +------------------+    +------------------+
    | Logi K950        |    | Logi M750 L      |
    | Host 1: Windows  |    | Host 1: Windows  |
    | Host 2: Linux    |    | Host 2: Linux    |  <-- Back Button trigger
    +------------------+    +------------------+
```

## Requirements

**Build:**
- [Bun](https://bun.sh) runtime
- Linux build environment (cross-compiles Windows)
- First build: sudo access for dependencies (cmake, libudev-dev, etc.)

**Runtime:**
- Linux: [Solaar](https://pwr-solaar.github.io/Solaar/) for button diversion
- Windows: Logi Options+ for button binding
- LG WebOS TV with "IP Control" enabled

### Supported Devices

**Tested:**
- Logitech K950 keyboard
- Logitech M750 L mouse

**Should work:** Any Logitech device supporting HID++ 2.0 with multi-host (CHANGE_HOST feature 0x1814).

**Note:** Devices must be connected via **Bluetooth**, not USB receiver. The Bolt/Unifying receivers don't expose HID++ over the host USB interface.

## Quick Start

1. **Build** from source (see [Building](#building) below)
2. **Run installer** for your platform (`install.sh` or `aeo-kvm-installer.exe`)
3. **Accept TV pairing** prompt on first run
4. **Configure trigger** button in Solaar (Linux) or Logi Options+ (Windows)

## Building

```bash
make build    # Build all platforms + auto-deploy
make clean    # Remove dist/
```

Output:
```
dist/
├── linux-arm64/
│   ├── aeo-kvm
│   ├── libhidapi-hidraw.so.0
│   └── install.sh
└── windows-x64/
    └── aeo-kvm-installer.exe   # Self-extracting, DLL embedded
```

Build auto-deploys:
- Linux: `/opt/aeo-kvm/`
- Windows: via SSH to `%LOCALAPPDATA%\aeo-kvm\`

## Installation

### Linux

```bash
cd dist/linux-arm64   # or linux-x64
./install.sh
```

The installer:
- Copies files to `/opt/aeo-kvm/`
- Configures Solaar rules for Back Button → switch-to-windows
- Sets up Solaar autostart

**First run:** Your TV will display a pairing prompt - accept it. The client key is saved to `tv-keys.json` for future use.

### Windows

1. Run `aeo-kvm-installer.exe` (or build auto-deploys via SSH)
2. Edit `%LOCALAPPDATA%\aeo-kvm\tv-keys.json` with your TV's IP (or let SSDP auto-discover)
3. Configure Logi Options+:
   - Smart Actions → Create action
   - Back Button → Open Application
   - Path: `%LOCALAPPDATA%\aeo-kvm\aeo-kvm.exe`
   - (No arguments needed - defaults to switch-to-linux)

**First run:** Your TV will display a pairing prompt - accept it. The client key is saved for future use.

## Usage

```bash
aeo-kvm switch-to-linux     # HDMI_2 + devices to Host 2
aeo-kvm switch-to-windows   # HDMI_3 + devices to Host 1
aeo-kvm --verbose ...       # Show HID++ communication
```

### Configuration

**TV Config** (`tv-keys.json`):
- Linux: `~/.config/aeo-kvm/tv-keys.json`
- Windows: `%LOCALAPPDATA%\aeo-kvm\tv-keys.json`

```json
{"ip": "192.168.1.100", "key": "your-client-key"}
```

TV IP is auto-discovered via SSDP if cached IP is unreachable.

**Device Config** (edit `src/hid-ffi.ts` if needed):
```typescript
const DEVICES: Record<string, { linux_host: number; windows_host: number }> = {
  K950: { linux_host: 1, windows_host: 0 },  // host indices are 0-based
  M750: { linux_host: 1, windows_host: 0 },
};
```

**HDMI Inputs** (requires rebuild to change):

Currently hardcoded in `src/main-ffi.ts`:
- Linux: `HDMI_2` (line 56)
- Windows: `HDMI_3` (line 62)

To use different inputs, edit the source and rebuild:
```typescript
// Change "HDMI_2" to your input
await switchTV("HDMI_1");  // or HDMI_2, HDMI_3, HDMI_4
```

## How It Works

**HID++ Protocol:** Bun FFI calls hidapi directly to send Logitech HID++ 2.0 commands. Uses SW_ID filtering to coexist with Solaar without interference.

**LG WebOS:** Native WebSocket connection to the TV's ssap:// API. First connection requires accepting pairing prompt on TV. Client key stored in `~/.config/aeo-kvm/tv-keys.json`.

**Cross-platform:** Single TypeScript codebase compiles to native executables via Bun.

## Troubleshooting

**Permission denied on Linux:**
```bash
sudo usermod -aG plugdev $USER
# Log out and back in
```

**Device not switching:**
- Use `--verbose` to see HID++ traffic
- Wake device first (press key/move mouse)
- Ensure Bluetooth connection (not USB receiver)

**TV not responding:**
- SSDP auto-discovers TV if cached IP fails
- Enable: Settings → Connection → Mobile Connection Management → IP Control
- First run: accept pairing prompt on TV
- Check logs: Linux `/tmp/aeo-kvm.log`, Windows `%LOCALAPPDATA%\aeo-kvm\aeo-kvm.log`

## License

MIT

## Contributing

Issues and PRs welcome at [github.com/AeyeOps/aeo-kvm](https://github.com/AeyeOps/aeo-kvm).

**Development requirements:**
- [Bun](https://bun.sh) runtime
- Linux environment (cross-compiles to Windows)
- First build installs system dependencies via sudo

**Build:**
```bash
make build    # Full build (Linux + Windows)
make dev ARGS="switch-to-linux --verbose"  # Test locally
```

**Note:** No automated tests currently - manual testing with physical devices required.
