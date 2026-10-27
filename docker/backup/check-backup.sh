#!/usr/bin/env bash
# Is the newest backup recent and readable? (spec 13 NFR-OPS-003, ADR-0021)
# Writes $BACKUP_STATUS_DIR/status.json (read by the app for the banner) and exits non-zero when it is not ok, so the
# systemd unit shows as failed in `systemctl --failed` and the journal.
# "Readable" = gpg can decrypt it (its integrity check passes) and pg_restore can read the table of contents. The
# full read of every row is the restore test's job (restore-test.sh).
set -Euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$here/lib.sh"

newest="$(newest_backup)"
if [[ -z "$newest" ]]; then
  log "check: no backup found"
  write_status stale ""
  exit 1
fi
mtime="$(stat -c %Y "$BACKUP_DIR/$newest")"
newest_iso="$(date -u -d "@$mtime" +%Y-%m-%dT%H:%M:%SZ)"
age_hours=$(( ($(date +%s) - mtime) / 3600 ))

if ! gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
      --decrypt "$BACKUP_DIR/$newest" 2>/dev/null \
    | docker run --rm -i --network none "$RESTORE_IMAGE" pg_restore --list > /dev/null 2>&1; then
  log "check: $newest cannot be decrypted or read"
  write_status failed "$newest_iso"
  exit 1
fi
if (( age_hours >= BACKUP_MAX_AGE_HOURS )); then
  log "check: newest backup $newest is ${age_hours} h old (limit ${BACKUP_MAX_AGE_HOURS} h)"
  write_status stale "$newest_iso"
  exit 1
fi
log "check: ok, newest backup $newest is ${age_hours} h old"
write_status ok "$newest_iso"
