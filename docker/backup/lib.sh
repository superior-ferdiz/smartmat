# Shared settings and helpers for the SmartMat backup scripts (spec 13, ADR-0021). Sourced, not run.
# Everything can be overridden from the environment (the tests point it at a scratch directory).

SMARTMAT_DB_CONTAINER="${SMARTMAT_DB_CONTAINER:-smartmat-staging-db}"
SMARTMAT_DB_NAME="${SMARTMAT_DB_NAME:-smartmat}"
SMARTMAT_DB_USER="${SMARTMAT_DB_USER:-smartmat}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/smartmat}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-/etc/smartmat-backup/passphrase}"
BACKUP_STATUS_DIR="${BACKUP_STATUS_DIR:-/var/lib/smartmat-backup}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
# One missed night is allowed a couple of hours' slack (the app uses the same limit, backupStatus.ts).
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
# Must match the image of the database container, so pg_restore understands the dump.
RESTORE_IMAGE="${RESTORE_IMAGE:-postgres:16-alpine}"

# Spec 08/13: receipt images and OCR text are never in a backup (they are deleted within 7 days in the app).
# The job queue is only transient work (receipt ids). The tables themselves are kept, empty.
EXCLUDED_DATA=(receipt_images receipt_extractions 'pgboss.*')

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

psql_db() {
  docker exec -i "$SMARTMAT_DB_CONTAINER" psql -X -A -t -q -v ON_ERROR_STOP=1 \
    -U "$SMARTMAT_DB_USER" -d "$SMARTMAT_DB_NAME" "$@"
}

newest_backup() {
  find "$BACKUP_DIR" -maxdepth 1 -name 'smartmat-*.dump.gpg' -type f -printf '%f\n' 2>/dev/null | sort | tail -n 1
}

# The SQL that reads every row of every table in public and prints "table|rows|md5 of all rows". The two receipt
# tables whose rows are never backed up are left out here; the restore test checks that they exist and are empty.
# Rows are compared as text, sorted, in UTC, so the same content gives the same line on both sides.
manifest_sql() {
  cat <<'SQL'
SET TimeZone = 'UTC';
SET extra_float_digits = 3;
SELECT string_agg(
  format('SELECT %L || ''|'' || count(*) || ''|'' || coalesce(md5(string_agg(t::text, E''\n'' ORDER BY t::text COLLATE "C")), ''-'') FROM public.%I t;', table_name, table_name),
  E'\n' ORDER BY table_name)
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   AND table_name NOT IN ('receipt_images', 'receipt_extractions')
\gexec
SQL
}

write_status() {
  # $1 = ok | stale | failed, $2 = ISO time of the newest backup or empty
  local state="$1" newest="${2:-}" tmp
  mkdir -p "$BACKUP_STATUS_DIR"
  chmod 0755 "$BACKUP_STATUS_DIR"
  tmp="$(mktemp "$BACKUP_STATUS_DIR/.status.XXXXXX")"
  if [[ -n "$newest" ]]; then newest="\"$newest\""; else newest=null; fi
  printf '{"checkedAt":"%s","state":"%s","newestBackupAt":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$state" "$newest" > "$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$BACKUP_STATUS_DIR/status.json"
}
