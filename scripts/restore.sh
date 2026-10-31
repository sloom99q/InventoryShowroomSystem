#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh into a LOCAL Supabase instance.
# This REPLACES all app data, logins and uploaded files in that instance.
#
#   scripts/restore.sh ~/ShowroomBackups/2026-10-30_181500
#   scripts/restore.sh <folder> --yes                          (no confirmation prompt)
#   SUPABASE_WORKDIR=/path/to/project scripts/restore.sh <folder>   (another local project)
#
# The target must be running (supabase start) with the same migrations applied
# as the backup (or newer ones); the database structure comes from the migrations.
set -euo pipefail

SRC="${1:?usage: scripts/restore.sh <backup-folder> [--yes]}"
SRC="$(cd "$SRC" && pwd)"
YES="${2:-}"
WORKDIR="${SUPABASE_WORKDIR:-$(cd "$(dirname "$0")/.." && pwd)}"
PROJECT_ID="$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' "$WORKDIR/supabase/config.toml" | head -1)"
DB="supabase_db_${PROJECT_ID}"
STORAGE="supabase_storage_${PROJECT_ID}"

for f in database.sql.gz migrations.txt manifest.txt SHA256SUMS; do
  [ -f "$SRC/$f" ] || { echo "✗ $SRC is not a backup folder (missing $f)"; exit 1; }
done
for c in "$DB" "$STORAGE"; do
  docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true || { echo "✗ $c is not running (supabase start)"; exit 1; }
done

echo "→ Checking the backup's checksums"
(cd "$SRC" && shasum -a 256 -c --quiet SHA256SUMS) || { echo "✗ Backup files are damaged"; exit 1; }

psql_db() { docker exec -i -e PGPASSWORD=postgres "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }

echo "→ Checking migrations"
TARGET_MIGRATIONS="$(psql_db -c "select version from supabase_migrations.schema_migrations order by version")"
MISSING="$(comm -23 <(sort "$SRC/migrations.txt") <(echo "$TARGET_MIGRATIONS" | sort))"
if [ -n "$MISSING" ]; then
  echo "✗ The target is missing migrations the backup needs:"; echo "$MISSING"
  echo "  Apply them first (supabase migration up / db reset in $WORKDIR)."; exit 1
fi

if [ "$YES" != "--yes" ]; then
  read -r -p "Replace ALL data and files in '$PROJECT_ID' with $(basename "$SRC")? Type 'restore': " answer
  [ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }
fi

echo "→ Database ($DB)"
# One transaction (as the instance superuser, which owns Supabase's internal tables): empty every data table, then load the dump with triggers
# off (so audit/timeline triggers don't fire again and FK order doesn't matter).
{
  echo "begin;"
  echo "set session_replication_role = replica;"
  psql_db -c "
    select 'truncate table ' || string_agg(format('%I.%I', n.nspname, c.relname), ', ') || ' cascade;'
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname in ('public', 'auth', 'storage')
      and c.relname not in ('schema_migrations', 'migrations')"
  gunzip -c "$SRC/database.sql.gz" | grep -v -E '^(SET transaction_timeout|SELECT pg_catalog.set_config\(.search_path)'
  echo "set session_replication_role = origin;"
  echo "commit;"
} | psql_db >/dev/null

echo "→ Files ($STORAGE)"
docker exec "$STORAGE" sh -c 'rm -rf /mnt/stub/stub && mkdir -p /mnt/stub'
docker cp "$SRC/storage" "$STORAGE:/mnt/stub/stub" >/dev/null

echo "→ Verifying against the manifest"
GOT="$(mktemp)"
{
  echo "rows-check"
  psql_db -c "
    select format('rows %s.%s %s', schemaname, relname, n) from (
      select n.nspname as schemaname, c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::int as n
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public','auth','storage')
        and c.relname not in ('schema_migrations','migrations')
    ) t where n > 0 order by 1"
  echo "files $(docker exec "$STORAGE" find /mnt/stub/stub -type f | wc -l | tr -d ' ')"
} > "$GOT"
if diff <(grep -E '^(rows|files) ' "$SRC/manifest.txt") <(grep -E '^(rows|files) ' "$GOT") >/dev/null; then
  echo "✓ Restored $(grep -c '^rows ' "$GOT") tables and $(grep '^files ' "$GOT" | cut -d' ' -f2) files; everything matches the backup."
else
  echo "✗ Restore finished but differs from the backup's manifest:"
  diff <(grep -E '^(rows|files) ' "$SRC/manifest.txt") <(grep -E '^(rows|files) ' "$GOT") || true
  rm -f "$GOT"; exit 1
fi
rm -f "$GOT"
