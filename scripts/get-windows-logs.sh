#!/bin/bash
# Helper script to fetch aeo-kvm logs from Windows via SSH

# Use Windows environment variable for user-independent paths
LOG_PATH='$env:LOCALAPPDATA\aeo-kvm\aeo-kvm.log'
CONFIG_PATH='$env:LOCALAPPDATA\aeo-kvm\tv-keys.json'

case "${1:-logs}" in
  logs|log)
    LINES="${2:-50}"
    ssh windows "powershell -Command \"Get-Content $LOG_PATH -Tail $LINES\""
    ;;
  config)
    ssh windows "powershell -Command \"Get-Content $CONFIG_PATH\""
    ;;
  all)
    echo "=== TV Config ==="
    ssh windows "powershell -Command \"Get-Content $CONFIG_PATH\""
    echo ""
    echo "=== Recent Logs (last 50 lines) ==="
    ssh windows "powershell -Command \"Get-Content $LOG_PATH -Tail 50\""
    ;;
  *)
    echo "Usage: $0 [logs|config|all] [lines]"
    echo "  logs [N]  - Show last N log lines (default 50)"
    echo "  config    - Show TV config"
    echo "  all       - Show both config and recent logs"
    ;;
esac
