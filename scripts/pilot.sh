#!/usr/bin/env bash
# The PILOT instance: the showroom's real data, separate from development.
#
#   scripts/pilot.sh start    start Docker (colima) if needed, the pilot database, and the app on :5180
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
PID_FILE="$PILOT/app.pid"
LOG_FILE="$PILOT/app.log"

lan_ip() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "<this-mac's-ip>"; }
app_running() { [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; }
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

case "${1:-status}" in
  start)
    ensure_docker
    if ! db_running; then echo "→ Starting the pilot database…"; (cd "$PILOT" && supabase start >/dev/null); fi
    write_env
    if app_running; then echo "→ App already running"; else
      echo "→ Building the app…"
      (cd "$WEB" && npx vite build --mode pilot --outDir dist-pilot --emptyOutDir >/dev/null)
      echo "→ Starting the app on :${APP_PORT}…"
      (cd "$WEB" && PILOT_API_URL="$(sed -n 's/^PILOT_API_URL=//p' "$PILOT/.env")" \
        nohup npx vite preview --mode pilot --outDir dist-pilot --port "$APP_PORT" --host </dev/null >"$LOG_FILE" 2>&1 & echo $! > "$PID_FILE"; disown)
      for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$APP_PORT/" && break; sleep 1; done
    fi
    "$0" status
    ;;
  stop)
    if app_running; then kill "$(cat "$PID_FILE")" && rm -f "$PID_FILE"; echo "→ App stopped"; fi
    # Never --no-backup here: that would delete the pilot's data volumes.
    (cd "$PILOT" && supabase stop >/dev/null) && echo "→ Pilot database stopped (data kept)"
    ;;
  status)
    db_running && echo "Database: running" || echo "Database: stopped"
    if app_running; then
      echo "App:      running"
      echo "  On this Mac:          http://localhost:${APP_PORT}"
      echo "  Phone / other devices: http://$(lan_ip):$APP_PORT   (same Wi-Fi)"
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
