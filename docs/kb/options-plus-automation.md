# Logitech Options+ Automation Research

## Summary
Options+ Smart Actions **cannot be configured fully non-interactively**. One-time GUI interaction required.

## What Works

### Smart Actions Export/Import
- Export: GUI → Smart Actions → Three dots → Export → `.json` file
- Import: GUI → Smart Actions → Import → Select `.json` file
- JSON is portable between machines

### File Locations (Windows)
- User config: `%LocalAppData%\LogiOptionsPlus\`
- Smart Actions: JSON format, exportable
- Newer versions: SQLite database with JSON blobs

### Silent Installation
```
logioptionsplus_installer.exe /quiet /analytics no /sso no /update no
```
Only controls installation, NOT Smart Actions configuration.

## What Doesn't Work

### No CLI for Smart Actions
- No command-line tool to create/modify Smart Actions
- No registry keys for Smart Actions config
- No documented API for programmatic setup

### Direct File Placement
- Copying JSON to AppData doesn't reliably work
- Machine-specific IDs cause compatibility issues
- Cloud sync tied to Logitech account

## Recommended Deployment Approach

1. **One-time setup on reference machine**: Create Smart Action via GUI
2. **Export**: Save as `aeo-kvm-trigger.json`
3. **Distribute**: Ship json alongside `aeo-kvm.exe`
4. **User imports once**: Open Options+ → Import json (one-time GUI step)

## Alternative: WebSocket Plugin SDK
- Options+ listens on port 10134 (WebSocket)
- Logi Actions SDK available for plugin development
- Could build a plugin, but significant complexity increase

## Sources
- Logitech Hub: Smart Actions documentation
- Logitech B2B Support: Mass installation guides
- GitHub: logitech-g-hub-settings-extractor, logi-options-plus-mini
- Logi Actions SDK: https://logitech.github.io/actions-sdk-docs/
