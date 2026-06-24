# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- macOS-side return switching via Karabiner-Elements: M750 Back button →
  `switch-to-windows`, Forward button → `switch-to-linux`. See
  `docs/macos-trigger-setup.md`. (Switch send pending hardware validation.)
- `make macos` (`scripts/macos-lifecycle.sh`): one-command lifecycle that
  installs prerequisites (bun, hidapi, Karabiner-Elements), builds, installs to
  `~/.local/share/aeo-kvm/` (no sudo), and auto-enables the Karabiner rule by
  merging it into the active profile. Idempotent; survives restart (Karabiner is
  a login agent).
- `build/setup.sh` now builds a macOS (`bun-darwin-arm64`) target and obtains
  `libhidapi.dylib` via Homebrew.
- ioreg-confirmed that macOS exposes the `0xFF43` HID++ interface on both the
  K950 and M750, and the M750's 5 buttons as standard usages — so the switch can
  reach both devices and Karabiner can bind the buttons.
- Windows-side `switch-to-macbook` target for Logitech host slot 3 and LG TV `HDMI_4`.
- Windows installer creates `switch-to-macbook.exe` for Logi Options+ Smart Actions.
- Linux installer maps Forward Button to `switch-to-macbook` while keeping Back Button mapped to Windows.

### Changed
- `build/setup.sh` is now environment-conditional: it builds only the platforms
  whose native hidapi library can be produced on (or already exists for) the
  current host, and skips the rest with a log line. Adds `--mac-only`; portable
  sha256 (`shasum` on macOS).
- On macOS, `build/setup.sh` can now build the **Linux** target too: when Apple's
  `container` CLI is present it compiles `libhidapi-hidraw.so.0` inside a
  throwaway Ubuntu container VM, so a Mac can produce all three packages. Falls
  back to the skip message if `container` isn't installed.
- `findLibPath` (hidapi-ffi) resolves `libhidapi.dylib` and the Homebrew path on
  macOS.

## [0.2.0] - 2026-01-18

### Fixed
- SSDP auto-discovery now works on Windows with Hyper-V (explicit interface binding)
- TV IP auto-updates when DHCP lease changes

### Added
- TV operation logging to file (visible in aeo-kvm.log)
- Windows deployment via SSH in build script
- Helper script: `scripts/get-windows-logs.sh`

### Changed
- Build script deploys to Windows via SCP+SSH instead of shared folder
- Improved network interface selection (skips VPN adapters)

## [0.1.0] - 2026-01-11

### Added
- Initial release
- Cross-platform support (Linux x64/arm64, Windows x64)
- HID++ 2.0 protocol implementation for Logitech device switching
- LG WebOS TV control via native WebSocket
- Self-extracting Windows installer with embedded DLL
- Linux installer with Solaar rules configuration
- Comprehensive logging for debugging

### Technical
- Bun FFI integration with hidapi for cross-platform HID access
- SW_ID filtering for reliable device communication alongside Solaar
- UTF-32/UTF-16 wchar_t handling for cross-platform FFI
