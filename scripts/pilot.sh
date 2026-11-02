#!/usr/bin/env bash
# The PILOT instance: the showroom's real data, separate from development.
#
#   scripts/pilot.sh start    start Docker (colima) if needed, the pilot database, and the app on :5180.
#                             The app runs as a background service (launchd): it keeps running after
#                             the terminal closes, restarts if it crashes, starts again at login, and
#                             keeps this Mac from idle-sleeping while it runs.
#   scripts/pilot.sh stop     stop the app and the pilot database (data is kept)
#   scripts/pilot.sh status   is it running, and the addresses to open
#   scripts/pilot.sh backup   back up the pilot to ~/ShowroomBackups/pilot (the 18:00 job runs this)
#
# The pilot has its own ports (563xx), its own Docker volumes and its own signing key.
# Development tests, seeds and the dev app never touch it.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PILOT="$REPO/pilot"
WEB="$REPO/web"
APP_PORT=5180
LOG_FILE="$PILOT/app.log"
LABEL="com.sinolink.showroom.pilot-app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

lan_ip() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "<this-mac's-ip>"; }
app_running() { curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$APP_PORT/"; }
port_pids() { lsof -nP -t -iTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null || true; }
db_running() { docker inspect -f '{{.State.Running}}' supabase_db_ShowroomPilot 2>/dev/null | grep -q true; }

ensure_docker() {
  docker info >/dev/null 2>&1 && return
  echo "→ Starting Docker (colima)…"
  colima start >/dev/null
}

write_env() {
  # Keys of the running pilot → pilot/.env (scripts) and the app's pilot build settings.
  local status
  status="$(cd "$PILOT" && supabase status -o env 2>/dev/null)"
  local api anon svc
  api="$(sed -n 's/^API_URL="\(.*\)"/\1/p' <<<"$status")"
  anon="$(sed -n 's/^ANON_KEY="\(.*\)"/\1/p' <<<"$status")"
  svc="$(sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"/\1/p' <<<"$status")"
  umask 077
  printf 'PILOT_API_URL=%s\nPILOT_ANON_KEY=%s\nPILOT_SERVICE_ROLE_KEY=%s\n' "$api" "$anon" "$svc" > "$PILOT/.env"
  printf 'VITE_SUPABASE_URL=/sb\nVITE_SUPABASE_ANON_KEY=%s\n' "$anon" > "$WEB/.env.pilot.local"
}

build_app() {
  echo "→ Building the app…"
  (cd "$WEB" && npx vite build --mode pilot --outDir dist-pilot --emptyOutDir >/dev/null)
}

stop_app() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  # Also an app started by hand earlier (not by the service), which would hold the port.
  for p in $(port_pids); do kill "$p" 2>/dev/null || true; done
}

install_service() {
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$REPO/scripts/pilot.sh</string><string>serve</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>20</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>$LOG_FILE</string>
  <key>StandardErrorPath</key><string>$LOG_FILE</string>
</dict>
</plist>
PLIST
  launchctl bootstrap "$DOMAIN" "$PLIST"
}

case "${1:-status}" in
  start)
    ensure_docker
    if ! db_running; then echo "→ Starting the pilot database…"; (cd "$PILOT" && supabase start >/dev/null); fi
    write_env
    build_app
    stop_app
    echo "→ Starting the app on :${APP_PORT} (background service)…"
    install_service
    for _ in $(seq 1 60); do app_running && break; sleep 1; done
    "$0" status
    ;;
  serve)
    # Run by the background service (launchd), in the foreground. Not for direct use.
    ensure_docker
    db_running || (cd "$PILOT" && supabase start >/dev/null)
    write_env
    [ -f "$WEB/dist-pilot/index.html" ] || build_app
    cd "$WEB"
    PILOT_API_URL="$(sed -n 's/^PILOT_API_URL=//p' "$PILOT/.env")"
    export PILOT_API_URL
    echo "== $(date '+%F %T') app starting on :$APP_PORT"
    # caffeinate -i: no idle sleep while the app is up (the display may still sleep).
    exec caffeinate -i node node_modules/vite/bin/vite.js preview --mode pilot --outDir dist-pilot --port "$APP_PORT" --host
    ;;
  stop)
    stop_app
    rm -f "$PLIST"
    echo "→ App stopped"
    # Never --no-backup here: that would delete the pilot's data volumes.
    (cd "$PILOT" && supabase stop >/dev/null) && echo "→ Pilot database stopped (data kept)"
    ;;
  status)
    db_running && echo "Database: running" || echo "Database: stopped"
    if app_running; then
      echo "App:      running"
      echo "  On this Mac:          http://localhost:${APP_PORT}"
      echo "  Other devices (same Wi-Fi): http://$(scutil --get LocalHostName).local:$APP_PORT   or http://$(lan_ip):$APP_PORT"
      if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then echo "  Background service: on (survives closing the terminal; starts at login)"
      else echo "  Background service: off (run scripts/pilot.sh start)"; fi
    else echo "App:      stopped   (scripts/pilot.sh start)"; fi
    ;;
  backup)
    ensure_docker
    db_running || { echo "✗ $(date '+%F %T') pilot database is not running; no backup made"; exit 1; }
    echo "== $(date '+%F %T') pilot backup"
    SUPABASE_WORKDIR="$PILOT" BACKUP_ROOT="$HOME/ShowroomBackups/pilot" "$REPO/scripts/backup.sh"
    ;;
  *) echo "usage: scripts/pilot.sh start|stop|status|backup"; exit 1 ;;
esac
