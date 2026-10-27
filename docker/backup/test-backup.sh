#!/usr/bin/env bash
# Tests the backup scripts end to end (spec 13 NFR-OPS-001–003) against a throw-away Postgres container with the
# migrations and made-up data (test-fixture.sql) – never against the test environment's own database.
#
#   sudo docker/backup/test-backup.sh
#
# Checks: the backup is encrypted, has no receipt images or OCR text, is restored and every row read; a changed byte,
# a wrong passphrase or a changed manifest make the restore test fail; an old or missing backup makes the check fail
# (and the status file says so); only the newest N are kept.
set -Euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
scratch="$(mktemp -d)"
db="smartmat-backup-test-db-$$"
export SMARTMAT_DB_CONTAINER="$db" BACKUP_DIR="$scratch/backups" BACKUP_STATUS_DIR="$scratch/status" \
  BACKUP_PASSPHRASE_FILE="$scratch/passphrase"
cleanup() { docker rm -f "$db" > /dev/null 2>&1 || true; rm -rf "${scratch:?}"; }
trap cleanup EXIT

passed=0
failed=0
ok() { echo "PASS  $*"; passed=$((passed + 1)); }
bad() { echo "FAIL  $*"; failed=$((failed + 1)); }
expect_fail() {
  local what="$1"; shift
  if "$@" > "$scratch/out" 2>&1; then bad "$what (it succeeded)"; else ok "$what"; fi
}
expect_ok() {
  local what="$1"; shift
  if "$@" > "$scratch/out" 2>&1; then ok "$what"; else bad "$what"; cat "$scratch/out"; fi
}
status_is() { grep -q "\"state\":\"$1\"" "$BACKUP_STATUS_DIR/status.json"; }

(umask 077; openssl rand -base64 48 > "$BACKUP_PASSPHRASE_FILE")
docker run -d --name "$db" --network none --tmpfs /var/lib/postgresql/data:rw,size=1g \
  -e POSTGRES_PASSWORD=test-only -e POSTGRES_USER=smartmat -e POSTGRES_DB=smartmat postgres:16-alpine > /dev/null
for _ in $(seq 1 60); do docker exec "$db" pg_isready -U smartmat -d smartmat -q 2>/dev/null && break; sleep 1; done
sleep 2
for m in "$repo"/prisma/migrations/*/migration.sql; do
  docker exec -i "$db" psql -X -q -v ON_ERROR_STOP=1 -U smartmat -d smartmat < "$m" > /dev/null \
    || { echo "migration $m failed"; exit 1; }
done
# A job queue row with a receipt id, to check that the queue's data is left out.
docker exec -i "$db" psql -X -q -v ON_ERROR_STOP=1 -U smartmat -d smartmat > /dev/null <<'SQL'
CREATE SCHEMA pgboss;
CREATE TABLE pgboss.job (id int, data jsonb);
INSERT INTO pgboss.job VALUES (1, '{"receiptId": "JOBBDATA-SOM-ALDRI-SKAL-I-BACKUP"}');
SQL
docker exec -i "$db" psql -X -q -v ON_ERROR_STOP=1 -U smartmat -d smartmat < "$here/test-fixture.sql" > /dev/null
events="$(docker exec "$db" psql -X -A -t -U smartmat -d smartmat -c 'SELECT count(*) FROM inventory_events')"
echo "fixture: $events inventory events, 300 items and batches, 500 purchases, 1 receipt with image and OCR text"

expect_ok "backup runs and the check says ok" "$here/backup.sh"
file="$(find "$BACKUP_DIR" -name '*.dump.gpg' | head -1)"
if [[ "$(stat -c %a "$BACKUP_DIR")" == 700 && "$(stat -c %a "$file")" == 600 ]]; then
  ok "backup directory 0700, file 0600"
else bad "permissions"; fi
if status_is ok; then ok "status file: ok"; else bad "status file"; fi
if grep -aq -e 'Testvare' -e 'kari@example.test' -e 'PGDMP' "$file"; then
  bad "the encrypted file contains plain text"
else ok "the file on disk is encrypted (no plain text, no dump header)"; fi

gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" --decrypt "$file" \
  | docker run --rm -i --network none postgres:16-alpine pg_restore -f - > "$scratch/plain.sql" 2> /dev/null
if grep -q 'kari@example.test' "$scratch/plain.sql"; then ok "decrypted, the dump has the user data"
else bad "user data missing"; fi
image_hex="$(printf 'KVITTERINGSBILDE' | od -An -tx1 | tr -d ' \n')"
if grep -q -e 'KVITTERINGSBILDE-SOM-ALDRI' -e "$image_hex" -e 'OCR-TEKST-SOM-ALDRI' -e 'JOBBDATA-SOM-ALDRI' \
    "$scratch/plain.sql"; then
  bad "receipt image, OCR text or job data in the backup"
else ok "no receipt image, no OCR text, no job queue data in the backup"; fi
if grep -q 'CREATE TABLE public.receipt_images' "$scratch/plain.sql"; then
  ok "the receipt tables themselves are there (empty)"
else bad "receipt table missing"; fi
rm -f "${scratch:?}/plain.sql"

expect_ok "restore test: every row read and identical" "$here/restore-test.sh"
grep 'restore test OK' "$scratch/out" | sed 's/^/      /'

cp "$file" "$scratch/corrupt.dump.gpg"
cp "${file%.dump.gpg}.manifest" "$scratch/corrupt.manifest"
size="$(stat -c %s "$scratch/corrupt.dump.gpg")"
printf '\x00' | dd of="$scratch/corrupt.dump.gpg" bs=1 seek=$((size / 2)) count=1 conv=notrunc status=none
if cmp -s "$file" "$scratch/corrupt.dump.gpg"; then
  printf '\xff' | dd of="$scratch/corrupt.dump.gpg" bs=1 seek=$((size / 2)) count=1 conv=notrunc status=none
fi
expect_fail "restore test fails on a backup with one changed byte" \
  "$here/restore-test.sh" "$scratch/corrupt.dump.gpg"

cp "$file" "$scratch/tampered.dump.gpg"
sed "s/^inventory_events|$events|/inventory_events|$((events - 1))|/" "${file%.dump.gpg}.manifest" \
  > "$scratch/tampered.manifest"
grep -q "^inventory_events|$((events - 1))|" "$scratch/tampered.manifest" || bad "could not change the manifest"
expect_fail "restore test fails when one table's rows differ from the manifest" \
  "$here/restore-test.sh" "$scratch/tampered.dump.gpg"
if grep -q 'differs' "$scratch/out"; then ok "      … and says that the content differs"
else bad "no 'differs' message"; fi

(umask 077; openssl rand -base64 48 > "$scratch/wrong")
expect_fail "restore test fails with the wrong passphrase" \
  env BACKUP_PASSPHRASE_FILE="$scratch/wrong" "$here/restore-test.sh"

chmod 0644 "$BACKUP_PASSPHRASE_FILE"
expect_fail "backup refuses a passphrase file that others can read" "$here/backup.sh"
chmod 0600 "$BACKUP_PASSPHRASE_FILE"
if status_is failed; then ok "      … and the status file says failed"; else bad "status not failed"; fi

touch -d '30 hours ago' "$file"
expect_fail "check fails when the newest backup is 30 hours old" "$here/check-backup.sh"
if status_is stale; then ok "      … and the status file says stale"; else bad "status not stale"; fi

expect_ok "a second backup" "$here/backup.sh"
sleep 1
expect_ok "a third backup, keeping 2" env BACKUP_KEEP=2 "$here/backup.sh"
n="$(find "$BACKUP_DIR" -name '*.dump.gpg' | wc -l)"
m="$(find "$BACKUP_DIR" -name '*.manifest' | wc -l)"
if [[ "$n" == 2 && "$m" == 2 ]]; then ok "only the newest 2 kept (BACKUP_KEEP=2), with their manifests"
else bad "kept $n backups, $m manifests"; fi

find "${BACKUP_DIR:?}" -maxdepth 1 -type f -name 'smartmat-*' -delete
expect_fail "check fails when there is no backup at all" "$here/check-backup.sh"
if status_is stale; then ok "      … and the status file says stale"; else bad "status not stale"; fi

echo "----"
echo "$passed passed, $failed failed"
(( failed == 0 ))
