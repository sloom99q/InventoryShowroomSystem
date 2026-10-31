#!/usr/bin/env bash
# Back up the LOCAL Supabase instance: database data + every uploaded file.
#
#   scripts/backup.sh                 → ~/ShowroomBackups/2026-10-30_181500/
#   BACKUP_ROOT=/elsewhere scripts/backup.sh
#   SUPABASE_WORKDIR=/path/to/project scripts/backup.sh   (another local project)
#
# Each backup folder is self-contained and safe to sync to Google Drive:
#   database.sql.gz   data of the public, auth (logins) and storage (file records) schemas
#   storage/          the uploaded files themselves, as the storage server keeps them
#   migrations.txt    database migrations the data belongs to (restore checks them)
#   manifest.txt      row counts per table and file count, for checking a restore
#   SHA256SUMS        checksums of every file in this folder
set -euo pipefail

WORKDIR="${SUPABASE_WORKDIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ROOT="${BACKUP_ROOT:-$HOME/ShowroomBackups}"
PROJECT_ID="$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' "$WORKDIR/supabase/config.toml" | head -1)"
DB="supabase_db_${PROJECT_ID}"
STORAGE="supabase_storage_${PROJECT_ID}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$ROOT/$STAMP"

for c in "$DB" "$STORAGE"; do
  docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true || { echo "✗ $c is not running (supabase start)"; exit 1; }
done

mkdir -p "$OUT.partial"
trap 'rm -rf "$OUT.partial"' ERR
psql_db() { docker exec -e PGPASSWORD=postgres "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }

echo "→ Database ($DB)"
# Data only: the structure comes from the migrations in the repo. Migration
# bookkeeping tables are left out (the target instance has its own).
docker exec -e PGPASSWORD=postgres "$DB" pg_dump -U postgres -d postgres \
  --data-only --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --exclude-table-data=auth.schema_migrations --exclude-table-data=storage.migrations \
  | gzip -9 > "$OUT.partial/database.sql.gz"
psql_db -c "select version from supabase_migrations.schema_migrations order by version" > "$OUT.partial/migrations.txt"

echo "→ Files ($STORAGE)"
docker cp "$STORAGE:/mnt/stub/stub" "$OUT.partial/storage" >/dev/null

echo "→ Manifest"
{
  echo "backup: $STAMP"
  echo "project: $PROJECT_ID"
  psql_db -c "
    select format('rows %s.%s %s', schemaname, relname, n) from (
      select n.nspname as schemaname, c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::int as n
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public','auth','storage')
        and c.relname not in ('schema_migrations','migrations')
    ) t where n > 0 order by 1"
  echo "files $(find "$OUT.partial/storage" -type f | wc -l | tr -d ' ')"
} > "$OUT.partial/manifest.txt"

(cd "$OUT.partial" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS)
mv "$OUT.partial" "$OUT"
trap - ERR
echo "✓ Backup written to $OUT ($(du -sh "$OUT" | cut -f1))"
cat "$OUT/manifest.txt"
