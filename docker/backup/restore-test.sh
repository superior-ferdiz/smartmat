#!/usr/bin/env bash
# Restore test (spec 13 NFR-OPS-002, ADR-0021): is the newest backup a database we could actually go back to?
#
#   sudo docker/backup/restore-test.sh            # the newest backup
#   sudo docker/backup/restore-test.sh FILE       # a given .dump.gpg (its .manifest must lie next to it)
#
# 1. Decrypts the backup (gpg checks its integrity) and restores it into a throw-away Postgres container without
#    network, on tmpfs.
# 2. Reads EVERY row of EVERY table there (rows + md5 of all rows per table) and compares with the manifest that was
#    read from the same snapshot as the dump. A table list alone (pg_restore --list) would not find lost rows.
# 3. receipt_images and receipt_extractions must exist and be empty.
# The container is removed afterwards, also on failure. Only table names, counts and the result are printed.
set -Euo pipefail
umask 077
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

file="${1:-}"
if [[ -z "$file" ]]; then
  newest="$(newest_backup)"
  [[ -n "$newest" ]] || { log "restore test: no backup found"; exit 1; }
  file="$BACKUP_DIR/$newest"
fi
manifest="${file%.dump.gpg}.manifest"
[[ -s "$file" && -s "$manifest" ]] || { log "restore test: missing $file or its manifest"; exit 1; }

container="smartmat-restore-test-$(date -u +%Y%m%d%H%M%S)-$$"
work="$(mktemp -d)"
cleanup() { docker rm -f "$container" > /dev/null 2>&1 || true; rm -rf "${work:?}"; }
trap cleanup EXIT

log "restore test: $(basename "$file") into $container"
docker run -d --name "$container" --network none --tmpfs /var/lib/postgresql/data:rw,size=2g \
  -e POSTGRES_PASSWORD=restore-test-only -e POSTGRES_USER=smartmat -e POSTGRES_DB=smartmat \
  "$RESTORE_IMAGE" > /dev/null
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready -U smartmat -d smartmat -q 2>/dev/null && break
  sleep 1
done
docker exec "$container" pg_isready -U smartmat -d smartmat -q || { log "restore test: database did not start"; exit 1; }

if ! gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
      --decrypt "$file" > "$work/dump" 2> "$work/gpg.err"; then
  log "restore test FAILED: cannot decrypt (integrity check or passphrase)"
  exit 1
fi
if ! docker exec -i "$container" pg_restore -U smartmat -d smartmat --no-owner --exit-on-error \
      < "$work/dump" 2> "$work/restore.err"; then
  log "restore test FAILED: pg_restore ($(head -c 300 "$work/restore.err" | tr '\n' ' '))"
  exit 1
fi
rm -f "${work:?}/dump"

manifest_sql | docker exec -i "$container" psql -X -A -t -q -v ON_ERROR_STOP=1 -U smartmat -d smartmat \
  | sed '/^$/d' > "$work/restored.manifest"

status=0
if ! diff -u "$manifest" "$work/restored.manifest" > "$work/diff"; then
  log "restore test FAILED: the restored content differs from the backup's manifest:"
  # Only table|rows|md5 lines: no content.
  cat "$work/diff" >&2
  status=1
fi
for t in receipt_images receipt_extractions; do
  count="$(docker exec "$container" psql -X -A -t -q -U smartmat -d smartmat \
    -c "SELECT count(*) FROM public.$t" 2>/dev/null || echo missing)"
  if [[ "$count" != "0" ]]; then
    log "restore test FAILED: $t is missing or not empty ($count)"
    status=1
  fi
done
tables="$(wc -l < "$work/restored.manifest")"
rows="$(awk -F'|' '{s += $2} END {print s + 0}' "$work/restored.manifest")"
if (( status == 0 )); then
  log "restore test OK: $tables tables, $rows rows, every row read and identical to the backup's manifest"
fi
exit "$status"
