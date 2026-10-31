#!/usr/bin/env bash
# Kontroll av testene for fase 16 («Glemt passord»): slår av én regel eller beskyttelse om gangen i kildekoden, kjører testene
# og viser resultatet. Filen settes tilbake etter hver runde. En endring er «fanget» når minst én test feiler; skriptet
# viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-16/10-mutation-check.sh          (med DRY=1: sjekker bare at endringene finnes)
# Bare enhetstestene i API-et, den delte pakken og innloggingssidene kjøres, og bare API-testene fasen berører.
set -u
backup=$(mktemp)
mutate() {
  local file=$1 desc=$2
  shift 2
  cp "$file" "$backup"
  if ! python3 - "$file" "$@" <<'PY'
import sys
p, pairs = sys.argv[1], sys.argv[2:]
s = open(p).read()
for old, new in zip(pairs[::2], pairs[1::2]):
    assert s.count(old) == 1, f'not found exactly once: {old[:70]}'
    s = s.replace(old, new, 1)
open(p, 'w').write(s)
PY
  then
    echo "$desc"; echo "    FEIL I SKRIPTET: endringen fantes ikke"; cp "$backup" "$file"; return
  fi
  if [ "${DRY:-0}" = 1 ]; then cp "$backup" "$file"; echo "ok: $desc"; return; fi
  # ONLY="19 26": run just those rounds (the second run after the tests were made stronger).
  if [ -n "${ONLY:-}" ] && ! grep -qw "${desc%%.*}" <<<"$ONLY"; then cp "$backup" "$file"; return; fi
  local unit_out api_out
  unit_out=$(npx vitest run apps/api/src packages/shared apps/web/src/pages/auth 2>&1)
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts $API_TESTS 2>&1)
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
  grep -hE '^ FAIL ' <<<"$unit_out"$'\n'"$api_out" | sed 's/^ FAIL  */      feilet: /' | sort -u
}
API_TESTS="apps/api/test/passwordReset apps/api/test/auth.api apps/api/test/twoFactor"
REPO=apps/api/src/modules/passwordReset/repo.ts
SVC=apps/api/src/modules/passwordReset/service.ts
PROC=apps/api/src/modules/passwordReset/processor.ts
ROUTES=apps/api/src/modules/passwordReset/routes.ts

mutate $REPO "1. FR-AUTH-006b: en brukt lenke kan brukes igjen (bare i transaksjonen)" \
  "where: { id: token.id, usedAt: null, expiresAt: { gt: now } }" "where: { id: token.id, expiresAt: { gt: now } }"
mutate $REPO "2. FR-AUTH-006b: en brukt lenke kan brukes igjen (begge steder)" \
  "where: { id: token.id, usedAt: null, expiresAt: { gt: now } }" "where: { id: token.id, expiresAt: { gt: now } }" \
  "where: { tokenHash, usedAt: null, expiresAt: { gt: now } }" "where: { tokenHash, expiresAt: { gt: now } }"
mutate $REPO "3. FR-AUTH-006b: lenken utløper aldri" \
  "where: { id: token.id, usedAt: null, expiresAt: { gt: now } }" "where: { id: token.id, usedAt: null }" \
  "where: { tokenHash, usedAt: null, expiresAt: { gt: now } }" "where: { tokenHash, usedAt: null }"
mutate $REPO "4. FR-AUTH-006b: en ny lenke stopper ikke de eldre" \
  "where: { userId: token.userId, usedAt: null }" "where: { userId: token.userId, usedAt: { not: null } }"
mutate $REPO "5. FR-AUTH-006d: øktene beholdes" \
  "await tx.session.deleteMany({ where: { userId } });" ""
mutate $REPO "6. FR-AUTH-006d: tofaktor-utfordringene beholdes" \
  "await tx.loginChallenge.deleteMany({ where: { userId } });" ""
mutate $REPO "7. FR-AUTH-006d: sperren etter feil passord nullstilles ikke" \
  "data: { passwordHash, failedLoginCount: 0, loginLockedUntil: null }" "data: { passwordHash }"
mutate $SVC "8. FR-AUTH-006a: jobb også for en adresse uten konto" \
  "if (!userId) return;" "if (!userId) { await queue.enqueue({ kind: 'passwordReset', userId: '00000000-0000-7000-8000-000000000000', requestedAt: this.deps.now().toISOString() }); return; }"
mutate $SVC "9. FR-AUTH-008: lekket passord godtas ved tilbakestilling" \
  "await refusePwnedPassword(pwned, input.newPassword, 'newPassword');" ""
mutate $SVC "10. FR-AUTH-006e: bekreftelsen virker uten e-postoppsett" \
  "    if (!queue) throw unavailable();
    const tokenHash" "    const tokenHash"
mutate $PROC "11. FR-AUTH-006a: ingen grense per konto" \
  ">= this.deps.perHour" ">= Number.MAX_SAFE_INTEGER"
mutate $PROC "12. FR-AUTH-006b: gamle jobber sendes likevel" \
  "> RESET_TTL_MS) return 'stale';" "> RESET_TTL_MS * 1000) return 'stale';"
mutate $PROC "13. FR-AUTH-006b: lenken blir liggende når sendingen feiler" \
  "await repo.deleteToken(id);" ""
mutate $ROUTES "14. FR-AUTH-006a: ingen grense per IP-adresse" \
  "{ schema: { body: passwordResetRequestSchema }, config: limit }" "{ schema: { body: passwordResetRequestSchema } }"
rm -f "$backup"
