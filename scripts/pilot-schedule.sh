#!/usr/bin/env bash
# Daily 18:00 backup of the PILOT instance (macOS launchd).
#
#   scripts/pilot-schedule.sh install     install/refresh the job
#   scripts/pilot-schedule.sh run-now     run it once now (to test)
#   scripts/pilot-schedule.sh status      is it installed, and the last log lines
#   scripts/pilot-schedule.sh uninstall
#
# If the Mac is asleep at 18:00, launchd runs the backup when it wakes.
# Log: ~/ShowroomBackups/pilot/backup.log
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.sinolink.showroom.pilot-backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/ShowroomBackups/pilot"
DOMAIN="gui/$(id -u)"

case "${1:-status}" in
  install)
    mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$REPO/scripts/pilot.sh</string><string>backup</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>0</integer></dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/backup.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/backup.log</string>
</dict>
</plist>
PLIST
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "✓ Installed: pilot backup every day at 18:00 → $LOG_DIR"
    ;;
  run-now) launchctl kickstart -p "$DOMAIN/$LABEL" && echo "Started; see $LOG_DIR/backup.log" ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then echo "Installed (daily 18:00)"; else echo "Not installed"; fi
    tail -n 6 "$LOG_DIR/backup.log" 2>/dev/null || true
    ;;
  uninstall) launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "Removed" ;;
  *) echo "usage: scripts/pilot-schedule.sh install|run-now|status|uninstall"; exit 1 ;;
esac
