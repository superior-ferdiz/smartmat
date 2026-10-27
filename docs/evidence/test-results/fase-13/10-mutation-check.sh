#!/usr/bin/env bash
# Kontroll av testene for fase 13 (sikkerhet, personvern, drift): slår av én regel eller beskyttelse om gangen i kildekoden, kjører testene
# og viser resultatet. Filen settes tilbake etter hver runde. En endring er «fanget» når minst én test feiler; skriptet
# viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-13/10-mutation-check.sh          (med DRY=1: sjekker bare at endringene finnes)
# Som i fase 8–12 kjøres alle enhetstestene, men bare API-testene fasen berører (fase 13-filene og staging).
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
  unit_out=$(npx vitest run 2>&1)
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts $API_TESTS 2>&1)
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
  grep -hE '^ FAIL ' <<<"$unit_out"$'\n'"$api_out" | sed 's/^ FAIL  */      feilet: /' | sort -u
}
RULES=packages/shared/src/prices/rules.ts
API_TESTS="apps/api/test/passwords.security apps/api/test/sessions.security apps/api/test/purchaseVersion apps/api/test/privacy apps/api/test/logs.security apps/api/test/twoFactor.security apps/api/test/staging"
PWNED=apps/api/src/providers/passwords/pwnedPasswords.ts
PWNCHK=apps/api/src/modules/auth/pwned.ts
SESS=apps/api/src/modules/sessions/repo.ts
PREPO=apps/api/src/modules/purchases/repo.ts
EDIT=apps/web/src/pages/budget/EditPurchasePage.tsx
PRIV=apps/api/src/modules/privacy/repo.ts
BACKUP=apps/api/src/modules/ops/backupStatus.ts
TOTP=apps/api/src/lib/totp.ts
TFS=apps/api/src/modules/twoFactor/service.ts
TFR=apps/api/src/modules/twoFactor/repo.ts
AUTH=apps/api/src/modules/auth/service.ts
APP=apps/api/src/app.ts
DEVICE=packages/shared/src/account/device.ts

# FR-AUTH-008 lekkede passord
mutate $PWNCHK "1. Et lekket passord godtas (sjekken ignoreres)" \
"  if ((await check.check(password)) === 'pwned') {" "  if ((await check.check(password)) === 'pwned' && false) {"
mutate $PWNED "2. Polstringslinjer (antall 0) regnes som lekket" \
"    if (match[1] === suffix && Number(match[2]) > 0) listed = true;" "    if (match[1] === suffix) listed = true;"
mutate $PWNED "3. Tjenesten svarer 503 → passordet avvises (fail closed i stedet for åpen)" \
"        if (!response.ok) return 'unknown';" "        if (!response.ok) return 'pwned';"

# FR-AUTH-009 økter og varsel om ny innlogging
mutate $SESS "4. En annen brukers økt kan logges ut (bruker-id mangler i where)" \
"      const { count } = await db.session.deleteMany({ where: { id: sessionId, userId } });" "      const { count } = await db.session.deleteMany({ where: { id: sessionId } });"
mutate $SESS "5. Denne økten kan logges ut fra listen" \
"      if (sessionId === currentSessionId) return 0;" ""
mutate $SESS "6. Varselet om ny innlogging vises også for eldre økter" \
"          createdAt: { gt: current.createdAt }," ""
mutate $SESS "7. «Det var meg» fjerner ikke varselet" \
"          loginNoticeDismissedAt: null," ""
mutate $DEVICE "8. Edge registreres som Chrome" \
"  if (/\bEdg(e|A|iOS)?\//.test(ua)) browser = 'edge';" "  if (/\bEdgX\//.test(ua)) browser = 'edge';"

# FR-BUD-006 samtidig retting av kjøp
mutate $PREPO "9. Versjonen sjekkes ikke (siste lagring vinner igjen)" \
"          where: { id: purchaseId, householdId, version }," "          where: { id: purchaseId, householdId },"
mutate $PREPO "10. Versjonen økes ikke ved retting" \
"            version: { increment: 1 }," ""
mutate $EDIT "11. Skjemaet sender versjonen etter en henting i bakgrunnen (ikke den det ble åpnet med)" \
"  const [version] = useState(purchase.version);" "  const version = purchase.version;"

# FR-PRIV-001 eksport
mutate $PRIV "12. Passordhashen og tofaktorhemmeligheten kommer med i eksporten" \
"minus(['password_hash', 'totp_secret', 'totp_pending_secret', 'totp_last_step'])" "minus([])"
mutate $PRIV "13. Sesjonstokens og CSRF-tokens kommer med i eksporten" \
"minus(['token_hash', 'csrf_token', 'user_id'])" "minus(['user_id'])"
mutate $PRIV "14. Et vanlig medlem får husholdningens invitasjoner" \
"              membership.role === 'owner'" "              true"

# NFR-OPS-003 status for backup
mutate $BACKUP "15. En sjekk som har sluttet å kjøre, vises som ok" \
"  if (state === 'stale' || tooOld(new Date(checkedAt)) || tooOld(newest)) {" "  if (state === 'stale' || tooOld(newest)) {"

# NFR-SEC-008 logg
mutate $APP "16. Strekkoden i /prices/<gtin> kommer i loggen" \
"    .replace(/\/prices\/[^/?#]*/, '/prices/[gtin]')" ""

# FR-AUTH-010 tofaktor
mutate $TOTP "17. En kode kan brukes på nytt (ingen beskyttelse mot gjenbruk)" \
"  if (found === null || (lastUsedStep !== null && found <= lastUsedStep)) return null;" "  if (found === null) return null;"
mutate $TOTP "18. Vinduet er ±3 steg i stedet for ±1" \
"const WINDOW = 1;" "const WINDOW = 3;"
mutate $TFR "19. Samme kode to ganger samtidig gir to økter (betinget skriving fjernet)" \
"          OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }]," ""
mutate $TFR "20. En gjenopprettingskode kan brukes flere ganger" \
"        where: { userId, codeHash, usedAt: null }," "        where: { userId, codeHash },"
mutate $TFR "21. En utfordring utløper aldri" \
"      return row && row.expiresAt.getTime() > now.getTime() ? row.userId : null;" "      return row ? row.userId : null;"
mutate $TFS "22. Tofaktor kan settes opp uten passord" \
"    const secrets = await this.verifiedSecrets(userId, password, 'password');
    if (secrets.totpSecret) throw new AppError(409, API_ERRORS.twoFactorAlreadyOn);" "    const secrets = (await this.deps.repo.secrets(userId))!;
    if (secrets.totpSecret) throw new AppError(409, API_ERRORS.twoFactorAlreadyOn);"
mutate $TFS "23. Tofaktor slås på uten gyldig kode" \
"    if (step === null) throw invalidCode();" ""
mutate $AUTH "24. Riktig passord nullstiller telleren for feil koder (ubegrenset gjetting)" \
"    if (user.twoFactor) {" "    if (user.failedLoginCount > 0) await repo.resetFailedLogins(user.id);
    if (user.twoFactor) {"
mutate $AUTH "25. Feil koder sperrer aldri kontoen" \
"        await repo.lockLogin(user.id, new Date(this.deps.now().getTime() + LOGIN_LOCK_MS));" ""
mutate $AUTH "26. En sperret konto kan fullføre steg to" \
"    if (!user || isLocked(user.loginLockedUntil, this.deps.now())) {" "    if (!user) {"
mutate $AUTH "27. Uten nøkkel slipper en konto med tofaktor inn med bare passord (fail open)" \
"      if (!twoFactor.available) throw new AppError(503, API_ERRORS.twoFactorUnavailable);" "      if (!twoFactor.available) return { kind: 'session', user: await this.requireSessionUser(user.id), session: await this.startSession(user.id, device) };"
rm -f "$backup"
