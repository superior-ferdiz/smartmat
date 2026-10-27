#!/usr/bin/env bash
# Nightly encrypted backup of the test environment's database (spec 13 NFR-OPS-001, ADR-0021).
#
#   sudo docker/backup/backup.sh
#
# 1. One repeatable-read snapshot: pg_dump uses it, and the manifest (rows and md5 per table) is read from the same
#    snapshot, so the restore test can compare against exactly what was dumped.
# 2. The dump is encrypted with gpg (AES-256, passphrase file) on the way to disk: no unencrypted copy is written.
# 3. The newest $BACKUP_KEEP backups are kept. Then the freshness check runs and writes the status file.
# Nothing personal is printed: only file names, sizes and counts.
set -Eeuo pipefail
umask 077
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

fail() {
  log "backup FAILED: $*"
  write_status failed "$(newest_iso || true)"
  exit 1
}
newest_iso() {
  local f; f="$(newest_backup)"; [[ -n "$f" ]] || return 0
  date -u -d "@$(stat -c %Y "$BACKUP_DIR/$f")" +%Y-%m-%dT%H:%M:%SZ
}
trap 'fail "line $LINENO"' ERR

[[ -r "$BACKUP_PASSPHRASE_FILE" ]] || fail "no passphrase file"
[[ "$(stat -c %a "$BACKUP_PASSPHRASE_FILE")" == "600" ]] || fail "passphrase file must be 0600"
mkdir -p "$BACKUP_DIR"; chmod 0700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="smartmat-$stamp"
work="$(mktemp -d "$BACKUP_DIR/.work.XXXXXX")"
trap 'rm -rf "${work:?}"' EXIT

# A session that holds the snapshot open while pg_dump and the manifest read from it.
coproc SNAP { docker exec -i "$SMARTMAT_DB_CONTAINER" psql -X -A -t -q -v ON_ERROR_STOP=1 \
  -U "$SMARTMAT_DB_USER" -d "$SMARTMAT_DB_NAME"; }
printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' 'SELECT pg_export_snapshot();' >&"${SNAP[1]}"
read -r -t 30 snapshot <&"${SNAP[0]}" || fail "no snapshot"
[[ "$snapshot" =~ ^[0-9A-F-]+$ ]] || fail "unexpected snapshot id"

exclude=()
for t in "${EXCLUDED_DATA[@]}"; do exclude+=("--exclude-table-data=$t"); done
docker exec "$SMARTMAT_DB_CONTAINER" pg_dump -U "$SMARTMAT_DB_USER" -d "$SMARTMAT_DB_NAME" \
    --format=custom --snapshot="$snapshot" "${exclude[@]}" \
  | gpg --batch --quiet --yes --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
      --symmetric --cipher-algo AES256 --compress-algo none -o "$work/$name.dump.gpg"
[[ "${PIPESTATUS[0]}" == 0 ]] || fail "pg_dump"

{ manifest_sql; echo "SELECT '__END__';"; } >&"${SNAP[1]}"
: > "$work/$name.manifest"
while IFS= read -r -t 600 line <&"${SNAP[0]}"; do
  [[ "$line" == "__END__" ]] && break
  [[ -n "$line" ]] && printf '%s\n' "$line" >> "$work/$name.manifest"
done
[[ "$line" == "__END__" ]] || fail "manifest"
printf '%s\n' 'COMMIT;' '\q' >&"${SNAP[1]}"
wait "$SNAP_PID" 2>/dev/null || true

[[ -s "$work/$name.dump.gpg" && -s "$work/$name.manifest" ]] || fail "empty output"
chmod 0600 "$work/$name.dump.gpg" "$work/$name.manifest"
mv "$work/$name.manifest" "$BACKUP_DIR/$name.manifest"
mv "$work/$name.dump.gpg" "$BACKUP_DIR/$name.dump.gpg"
log "backup written: $name.dump.gpg ($(stat -c %s "$BACKUP_DIR/$name.dump.gpg") bytes, $(wc -l < "$BACKUP_DIR/$name.manifest") tables)"

# Keep the newest $BACKUP_KEEP.
mapfile -t old < <(find "$BACKUP_DIR" -maxdepth 1 -name 'smartmat-*.dump.gpg' -type f -printf '%f\n' | sort | head -n "-$BACKUP_KEEP")
for f in "${old[@]}"; do
  rm -f "${BACKUP_DIR:?}/$f" "${BACKUP_DIR:?}/${f%.dump.gpg}.manifest"
  log "removed old backup: $f"
done

trap - ERR
exec "$here/check-backup.sh"
