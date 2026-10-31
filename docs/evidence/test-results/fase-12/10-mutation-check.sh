#!/usr/bin/env bash
# Kontroll av testene for priser (fase 12): slår av én regel eller beskyttelse om gangen i kildekoden, kjører testene
# og viser resultatet. Filen settes tilbake etter hver runde. En endring er «fanget» når minst én test feiler; skriptet
# viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-12/10-mutation-check.sh          (med DRY=1: sjekker bare at endringene finnes)
# Som i fase 8–11 kjøres alle enhetstestene, men bare API-testene fasen berører (prices*).
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
  local unit_out api_out
  unit_out=$(npx vitest run 2>&1)
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts apps/api/test/prices 2>&1)
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
  grep -hE '^ FAIL ' <<<"$unit_out"$'\n'"$api_out" | sed 's/^ FAIL  */      feilet: /' | sort -u
}
RULES=packages/shared/src/prices/rules.ts
KASSA=apps/api/src/providers/prices/kassalapp.ts
SVC=apps/api/src/modules/prices/service.ts
REPO=apps/api/src/modules/prices/repo.ts
ROUTES=apps/api/src/modules/prices/routes.ts
APP=apps/api/src/app.ts
VIEWS=apps/web/src/prices/PriceViews.tsx
EST=apps/web/src/prices/ShoppingEstimate.tsx

# Reglene (packages/shared)
mutate $RULES "1. En pris med tre desimaler godtas (avrundes stille)" \
"  if (Math.abs(scaled - ore) > 1e-6 || ore > MAX_PRICE_ORE) return null;" "  if (ore > MAX_PRICE_ORE) return null;"
mutate $RULES "2. Grensen for gamle priser er 14 dager inkludert (>= i stedet for >)" \
"  return now.getTime() - observedAt.getTime() > STALE_PRICE_DAYS * DAY_MS;" "  return now.getTime() - observedAt.getTime() >= STALE_PRICE_DAYS * DAY_MS;"
mutate $RULES "3. Priser blir aldri gamle" \
"  return now.getTime() - observedAt.getTime() > STALE_PRICE_DAYS * DAY_MS;" "  return false;"
mutate $RULES "4. Coop regnes som en kjede Kassalapp henter priser fra" \
" || chainCode.startsWith('COOP');" ";"
mutate $RULES "5. Egne priser blir aldri merket som gamle" \
"  return daysBetween(date, today) > OLD_OWN_PRICE_DAYS;" "  return false;"
mutate $RULES "6. «Billigst» tar med priser som ikke er ferske" \
"    if (!observation.fresh) continue;" ""
mutate $RULES "7. Medianen tar den dyreste av de to i midten" \
"  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;" "  return sorted[Math.ceil((sorted.length - 1) / 2)] ?? null;"
mutate $RULES "8. Egen pris skaleres selv når enheten er en annen" \
"    if (line.unit === own.unit) {" "    if (true) {"
mutate $RULES "9. En linje uten pris telles som 0 kr i anslaget" \
"    if (line.estimateOre === null) continue;" "    if (line.estimateOre === null) {
      estimatedLines += 1;
      continue;
    }"

# Provideren (Kassalapp)
mutate $KASSA "10. 429 stopper ikke nye kall (Retry-After ignoreres)" \
"        blockedUntil = now.getTime() + retryAfterMs(response.headers.get('retry-after'), now);" ""
mutate $KASSA "11. Ingen egen grense for hele serveren" \
"      if (!options.limiter.take('kassalapp'))" "      if (false)"
mutate $KASSA "12. Omdirigeringer følges (nøkkelen kan sendes videre)" \
"          redirect: 'error'," "          redirect: 'follow',"
mutate $KASSA "13. Ingen grense på størrelsen av svaret" \
"      if (body.length > MAX_RESPONSE_CHARS)" "      if (false)"
mutate $KASSA "14. Lenker til andre nettsteder enn kassal.app godtas" \
" && parsed.hostname === 'kassal.app' ? parsed.href : null;" " ? parsed.href : null;"
mutate $KASSA "15. En dato langt fram i tid godtas" \
"  if (observedAt.getTime() > now.getTime() + FUTURE_SLACK_MS) return null;" ""
mutate $KASSA "16. http godtas som adresse (nøkkelen ukryptert)" \
"  if (new URL(base).protocol !== 'https:') throw new Error('KASSALAPP_BASE_URL must use https');" ""

# Tjenesten
mutate $SVC "17. Hurtiglageret brukes ikke (Kassalapp spørres hver gang)" \
"    if (cached && age < PRICE_CACHE_MS) {" "    if (false) {"
mutate $SVC "18. Lagrede priser vises uansett alder når Kassalapp er nede" \
"        cached && age < PRICE_KEEP_MS" "        cached"
mutate $SVC "19. Ingen grense per bruker" \
"    if (!this.deps.userLimiter.take(userId)) return fallback('rateLimited');" ""
mutate $SVC "20. Uten nøkkel spørres provideren likevel" \
"    if (!provider.enabled) return { prices: { ...NOT_ASKED, status: 'off' }, unavailable: null };" ""
mutate $SVC "21. Butikkens egen kode sendes til Kassalapp" \
"      storeCode
        ? Promise.resolve({ prices: NOT_ASKED, unavailable: null })
        : this.external(gtin, userId)," "      this.external(gtin, userId),"
mutate $SVC "22. Anslaget bruker gamle priser fra Kassalapp" \
"      if (!isFreshObservation(o, now)) continue;" ""
mutate $SVC "23. Samtidige oppslag deler ikke kallet" \
"    if (running) return running;" ""
mutate $SVC "24. Anslaget bruker lagrede Kassalapp-priser også uten nøkkel" \
"      provider.enabled
        ? repo.barcodesByItem(householdId)" "      true
        ? repo.barcodesByItem(householdId)"
mutate $SVC "25. Alle egne priser vises (ikke bare de 10 nyeste)" \
"      .slice(0, OWN_PRICE_LIMIT)" ""

# Repoet (husholdningens data)
mutate $REPO "26. Egne priser leses for alle husholdninger" \
"          householdId,
          priceOre: { not: null }," "          priceOre: { not: null },"
mutate $REPO "27. Varen slås opp uten husholdning (IDOR på varesiden)" \
"        where: { id: itemId, householdId }," "        where: { id: itemId },"
mutate $REPO "28. Anslaget tar med avhukede linjer" \
"        where: { householdId, checked: false }," "        where: { householdId },"
mutate $REPO "29. Samtidig lagring av samme svar gir feil (P2002 slippes gjennom)" \
"    if (!isPrismaError(error, 'P2002')) throw error;" "    throw error;"

# Ruter og logg
mutate $ROUTES "30. Prisrutene sjekker ikke medlemskap" \
"  const preHandler = [requireAuth, householdAccess];" "  const preHandler = [requireAuth];"
mutate $APP "31. Strekkoden i prisruten logges" \
"    .replace(/\/prices\/[^/?#]*/, '/prices/[gtin]')" ""

# Nettappen
mutate $VIEWS "32. «Billigst» vises ikke" \
"      {external.cheapest && (" "      {false && external.cheapest && ("
mutate $VIEWS "33. Gamle priser står i hovedtabellen" \
"  const fresh = external.observations.filter((o) => o.fresh);" "  const fresh = external.observations;"
mutate $VIEWS "34. Teksten om manglende kjeder vises ikke" \
"      {asked && <p className={styles.muted}>{t('prices.external.coverage')}</p>}" ""
mutate $VIEWS "35. Merket for gamle egne priser vises ikke" \
"                      {entry.old && <Tag tone=\"warning\">{t('prices.own.old')}</Tag>}" ""
mutate $EST "36. Anslaget sier ikke hvor mange linjer som mangler pris" \
"          {estimate.data.summary.missingLines > 0 && (" "          {false && ("
rm -f "$backup"
