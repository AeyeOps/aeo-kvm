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
         +-------------------+-------------------+-------------------+
         |                   |                   |
    HDMI_2              HDMI_3              HDMI_4
   (Linux)            (Windows)           (MacBook)

    +------------------+    +------------------+
    | Logi K950        |    | Logi M750 L      |
    | Host 1: Windows  |    | Host 1: Windows  |
    | Host 2: Linux    |    | Host 2: Linux    |
    | Host 3: MacBook  |    | Host 3: MacBook  |  <-- Back/Forward triggers
    +------------------+    +------------------+
```

## Requirements

**Build:**
- [Bun](https://bun.sh) runtime
- Linux host builds Linux + Windows; macOS builds **all three** —
  Mac natively, Windows via download, and Linux inside an Apple
  [`container`](https://github.com/apple/container) VM (`brew install container`,
  optional; only needed to build the Linux target from a Mac)
- First build: sudo access for Linux deps (cmake, libudev-dev, etc.) on a Linux
  host; on macOS, `hidapi` comes via Homebrew and the Linux lib builds in the
  container (both no sudo)

**Runtime:**
- Linux: [Solaar](https://pwr-solaar.github.io/Solaar/) for button diversion
- Windows: Logi Options+ for button binding
- **macOS: [Karabiner-Elements](https://karabiner-elements.pqrs.org/)** for
  button binding (`brew install --cask karabiner-elements`) — required
  dependency; it needs an Input Monitoring grant on first run
- LG WebOS TV with "IP Control" enabled

> **TV pairing (all platforms, first run):** the first switch auto-discovers the
> TV over SSDP and the TV shows a pairing prompt — accept it once. The client key
> is saved to `tv-keys.json`, so later switches are silent.

### Supported Devices

**Tested:**
- Logitech K950 keyboard
- Logitech M750 L mouse

**Should work:** Any Logitech device supporting HID++ 2.0 with multi-host (CHANGE_HOST feature 0x1814).

**Note:** Devices must be connected via **Bluetooth**, not USB receiver. The Bolt/Unifying receivers don't expose HID++ over the host USB interface.

## Quick Start

1. **Build** from source (see [Building](#building) below); on macOS, `make macos` does steps 1–2 and 4
2. **Run installer** for your platform (`install.sh` or `aeo-kvm-installer.exe`)
3. **Accept TV pairing** prompt on first run
4. **Configure trigger** button in Solaar (Linux), Logi Options+ (Windows), or Karabiner-Elements (macOS, auto-enabled)

## Building

```bash
make build    # Build every platform this host can + auto-deploy
make clean    # Remove dist/
```

The build is environment-conditional — each platform is built only when its
native hidapi library can be produced on (or already exists for) the current
host: Linux `.so` needs a Linux host, macOS `.dylib` needs a macOS host
(Homebrew), Windows `.dll` downloads on any host. Restrict with
`--linux-only` / `--windows-only` / `--mac-only`.

**Building all three from a Mac:** with Apple's [`container`](https://github.com/apple/container)
installed (`brew install container`, macOS 26+ / Apple Silicon), `make build` on
a Mac also produces the Linux package — the `libhidapi-hidraw.so.0` is compiled
inside a throwaway Ubuntu container VM, then the binary cross-compiles via Bun. No
Linux host required.

**How each target is built (one script, two hosts):** there is a single build
script — `build/setup.sh` — shared by both build *hosts* (macOS and Linux); it
gates on `uname -s`. Windows is a build *target*, not a host: its
`aeo-kvm-installer.exe` is cross-compiled by that same script
(`bun build --target=bun-windows-x64`), and the Windows install logic lives in
`src/windows-installer.ts`, compiled *into* the exe as a runtime self-extractor
(it embeds the DLL and installs to `%LOCALAPPDATA%`). Windows never runs a build
itself — there is no separate Windows build script.

| Build host | Produces                | Linux `.so` source          |
|------------|-------------------------|-----------------------------|
| macOS      | macOS + Windows + Linux | Apple `container` Ubuntu VM |
| Linux      | Linux + Windows         | cmake on the host           |
| Windows    | *(not a build host)*    | —                           |

Output:
```
dist/
├── linux-arm64/
│   ├── aeo-kvm
│   ├── libhidapi-hidraw.so.0
│   └── install.sh
├── macos-arm64/
│   ├── aeo-kvm
│   ├── libhidapi.dylib
│   └── install.sh
└── windows-x64/
    └── aeo-kvm-installer.exe   # Self-extracting, DLL embedded
```

Build auto-deploys:
- Linux: `/opt/aeo-kvm/`
- Windows: via SSH to `%LOCALAPPDATA%\aeo-kvm\`
- macOS: prints the `install.sh` command (run it to deploy + wire Karabiner)

## Installation

### Linux

```bash
cd dist/linux-arm64   # or linux-x64
./install.sh
```

The installer:
- Copies files to `/opt/aeo-kvm/`
- Configures Solaar rules for Back Button → switch-to-windows and Forward Button → switch-to-macbook
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
   - For Windows-to-MacBook, bind the adjacent button to `%LOCALAPPDATA%\aeo-kvm\switch-to-macbook.exe`

**First run:** Your TV will display a pairing prompt - accept it. The client key is saved for future use.

### macOS

One command does the whole lifecycle (prerequisites → build → install → enable):

```bash
make macos
```

It installs `bun`, `hidapi`, and **Karabiner-Elements** (a required dependency),
builds the native binary, installs to `~/.local/share/aeo-kvm/` (**no sudo**), and
auto-enables the Karabiner rule mapping the M750 Back button → `switch-to-windows`
and Forward button → `switch-to-linux`. It's idempotent and survives restart
(Karabiner runs as a login agent).

Two one-time approvals macOS requires: **Input Monitoring** for Karabiner-Elements
(and for `~/.local/share/aeo-kvm/aeo-kvm` if a switch fires but the devices don't
move), and the **TV pairing** prompt on the first button press. Full setup,
permissions, and validation: [`docs/macos-trigger-setup.md`](docs/macos-trigger-setup.md).

## Usage

```bash
aeo-kvm switch-to-linux     # HDMI_2 + devices to Host 2
aeo-kvm switch-to-windows   # HDMI_3 + devices to Host 1
aeo-kvm switch-to-macbook   # HDMI_4 + devices to Host 3
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
const DEVICES: Record<string, { linux_host: number; windows_host: number; macbook_host: number }> = {
  K950: { linux_host: 1, windows_host: 0, macbook_host: 2 },  // host indices are 0-based
  M750: { linux_host: 1, windows_host: 0, macbook_host: 2 },
};
```

**HDMI Inputs** (requires rebuild to change):

Currently hardcoded in `src/main-ffi.ts`:
- Linux: `HDMI_2` (line 56)
- Windows: `HDMI_3` (line 62)
- MacBook: `HDMI_4`

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
