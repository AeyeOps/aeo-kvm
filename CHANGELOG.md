# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- Windows-side `switch-to-macbook` target for Logitech host slot 3 and LG TV `HDMI_4`.
- Windows installer creates `switch-to-macbook.exe` for Logi Options+ Smart Actions.
- Linux installer maps Forward Button to `switch-to-macbook` while keeping Back Button mapped to Windows.

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
