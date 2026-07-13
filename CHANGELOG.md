# Changelog

All notable changes to this project will be documented in this file.

## [0.3.1] - 2026-07-13

Completes the third-host rollout on the Linux side: the Forward Button →
MacBook trigger now works out of the box.

### Fixed
- Linux installer now diverts the M750 trigger buttons (Back `0x53`, Forward
  `0x56`) in Solaar's `config.yaml` while Solaar is stopped. Previously it
  wrote the rules but never diverted the keys, so on a machine without a
  manual divert the button presses never reached Solaar rules and the
  triggers were silently inert.
- `uninstall-linux.sh` removed the wrong directory (`/opt/aeo/kvm` instead of
  `/opt/aeo-kvm`), leaving the installed binary behind.
- Uninstall now stops Solaar before removing rules (rules only unload on a
  full restart), reverts the trigger-button diverts (a diverted key with no
  rule is a dead button), and restarts Solaar.

## [0.3.0] - 2026-07-04

macOS is now a fully working third KVM host: one M750 button press switches
mouse, keyboard, and the LG TV input, validated end-to-end in all three
directions (Mac→Linux, Mac→Windows, and back from both).

### Added
- macOS-side return switching via Logi Options+: M750 Back button →
  `Switch to Windows.app`, Forward button → `Switch to Linux.app`.
  `scripts/macos-make-apps.sh` wraps the per-target executables in minimal
  `.app` bundles (Options+ "Open application" requires a `.app`, and the TCC
  Input Monitoring grant must land on the exact process that opens the HID
  device), and `scripts/macos-optionsplus-bind.py` binds the buttons by
  editing Options+' `settings.db` directly — idempotent, backed up, restarts
  the Options+ agent and verifies it actually came back up.
- macOS root keyboard helper: the K950 refuses `hid_open` from non-root
  processes (kIOReturnNotPrivileged — an anti-keylogger wall beyond TCC), so
  keyboard setHost runs through a root-owned copy at
  `/usr/local/libexec/aeo-kvm/aeo-kvm-kbd`, invoked via passwordless
  `sudo -n` whitelisted for exactly three commands in `/etc/sudoers.d/aeo-kvm`.
  Installed by `scripts/macos-install-kbd-helper.sh` (admin password once).
- `make macos` (`scripts/macos-lifecycle.sh`): one-command lifecycle that
  installs prerequisites (bun, hidapi), builds, installs to
  `~/.local/share/aeo-kvm/` (no sudo), and (re)builds the `.app` wrappers when
  they are stale — warning that rebuilt wrappers need their Input Monitoring
  grants re-added (TCC pins the grant to the code signature).
- TV control from a NAT'd host: `tv-keys.json` accepts a manually seeded
  `"ip"` — the cached-IP path (TCP connectivity check to port 3001) runs
  before SSDP, so a Mac behind a travel router, where multicast discovery
  can't cross the NAT, still switches the TV over WebOS/IP.
- `scripts/macos-hid-diag.ts`: standalone HID open/enumerate diagnostic.
- `build/setup.sh` now builds a macOS (`bun-darwin-arm64`) target and obtains
  `libhidapi.dylib` via Homebrew.
- ioreg-confirmed that macOS exposes the `0xFF43` HID++ interface on both the
  K950 and M750, and the M750's 5 buttons as standard usages — so the switch
  can reach both devices and the buttons are bindable.
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
  throwaway Ubuntu container VM, so a Mac can produce all three packages. The
  container service is managed transiently via the Apple `container` CLI (not
  brew) — started only if down and stopped afterward only if the build started
  it. Falls back to the skip message if `container` isn't installed.
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
