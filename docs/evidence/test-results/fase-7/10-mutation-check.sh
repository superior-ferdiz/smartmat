#!/usr/bin/env bash
# Kontroll av testene for strekkodeskanning og testmiljøet (fase 7): slår av én regel eller beskyttelse om gangen i kildekoden,
# kjører enhetstestene og API-testene mot testdatabasen, og viser resultatet. Filen settes tilbake etter hver
# runde. En endring er «fanget» når minst én test feiler; skriptet viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-7/10-mutation-check.sh
set -u
backup=$(mktemp)
mutate() {
  local file=$1 desc=$2
  shift 2
  cp "$file" "$backup"
  python3 - "$file" "$@" <<'PY'
import sys
p, pairs = sys.argv[1], sys.argv[2:]
s = open(p).read()
for old, new in zip(pairs[::2], pairs[1::2]):
    assert old in s, f'not found: {old[:60]}'
    s = s.replace(old, new, 1)
open(p, 'w').write(s)
PY
  local unit_out api_out
  unit_out=$(npx vitest run 2>&1)
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts 2>&1)
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
  # Which tests failed, so it is visible that the right test caught the change (not an unstable one).
  grep -hE '^ FAIL ' <<<"$unit_out"$'\n'"$api_out" | sed 's/^ FAIL  */      feilet: /' | sort -u
}
BR=apps/api/src/modules/barcodes/routes.ts
BP=apps/api/src/modules/barcodes/repo.ts
BS=apps/api/src/modules/barcodes/service.ts
OFF=apps/api/src/providers/barcode/openFoodFacts.ts
GT=packages/shared/src/barcode/gtin.ts
APP=apps/api/src/app.ts
IR=apps/api/src/modules/inventory/repo.ts
LO=apps/api/src/modules/locations/repo.ts
SD=apps/api/src/modules/recipes/seed.ts
AU=apps/api/src/modules/auth/routes.ts
WEB=apps/api/src/plugins/web.ts
CS=apps/web/src/scan/CameraScanner.tsx
CA=apps/web/src/scan/camera.ts

mutate $BR "1. Strekkoderutene uten householdAccess (bare innlogging)" \
"  const preHandler = [requireAuth, householdAccess];" "  const preHandler = [requireAuth];"
mutate $BP "2. Husholdningens strekkoder hentes uten å filtrere på husholdning" \
"      const row = await db.householdBarcode.findUnique({
        where: { householdId_gtin: { householdId, gtin } }," \
"      const row = await db.householdBarcode.findFirst({
        where: { gtin },"
mutate $BP "3. «Varen fra sist» hentes uten å filtrere på husholdning" \
"        where: { id: itemId, householdId }," "        where: { id: itemId },"
mutate $BP "4. Nytt parti på en vare: varen hentes uten å filtrere på husholdning" \
"              where: { id: write.target.itemId, householdId }," "              where: { id: write.target.itemId },"
mutate $BP "5. Partiet lagres uten dedupe_key" \
"            write.dedupeKey," "            null,"
mutate $BS "6. Stedet i bekreftelsen kontrolleres ikke" \
"    if (!(await this.deps.locations.exists(householdId, body.batch.locationId))) {" "    if (false) {"
mutate $BS "7. clientRequestId sjekkes ikke før lagring" \
"    const earlier = await repo.itemIdByDedupeKey(householdId, dedupeKey);" "    const earlier = null;"
mutate $BS "8. Butikkens egne koder huskes" \
"      remember: !storeCode," "      remember: true,"
mutate $BS "9. Butikkens egne koder slås opp hos Open Food Facts" \
"    if (storeCode) return answer('none', 'notAsked');" ""
mutate $BS "10. Husholdningens svar brukes ikke" \
"    if (remembered) {" "    if (false) {"
mutate $BS "11. Mellomlageret brukes uansett alder" \
"time.getTime() - cached.fetchedAt.getTime() < PRODUCT_TTL_MS" "true"
mutate $BS "12. Feil hos OFF lagres som «fant ingenting»" \
"    if (result.status === 'notFound') {" "    if (result.status !== 'found') {"
mutate $BS "13. Ingen grense per bruker" \
"    if (!this.deps.userLimiter.take(userId)) throw" "    if (false) throw"
mutate $OFF "14. Ingen tidsavbrudd mot OFF" \
"          signal: AbortSignal.timeout(options.timeoutMs)," ""
mutate $OFF "15. HTTP-feil fra OFF tolkes som svar" \
"      if (response.status !== 200 && response.status !== 404) {" "      if (false) {"
mutate $OFF "16. Svaret fra OFF valideres ikke med Zod" \
"      const parsed = offResponseSchema.safeParse(json);" \
"      const parsed = { success: true as const, data: json as z.infer<typeof offResponseSchema> };"
mutate $OFF "17. Serverens egen grense mot OFF brukes ikke" \
"      if (!options.limiter.take('openFoodFacts'))" "      if (false)"
mutate $GT "18. Kontrollsifferet sjekkes ikke" \
"  if (!hasValidCheckDigit(full)) return" "  if (false) return"
mutate $GT "19. UPC-A får ikke 0 foran" \
"  if (gtin.length === 12) gtin = \`0\${gtin}\`;" ""
mutate $GT "20. Prefiks 2 regnes ikke som butikkens egen kode" \
" || gtin13.startsWith('2');" ";"
mutate $APP "21. Strekkoden står i den loggede URL-en" \
"url: redactUrl(request.url)" "url: request.url"
mutate $IR "22. Sletting av en vare tømmer ikke koblingen i household_barcodes" \
"        await tx.householdBarcode.updateMany({
          where: { householdId, itemId },
          data: { itemId: null },
        });" ""
mutate $LO "23. Sletting av et sted tømmer ikke koblingen i household_barcodes" \
"          await tx.householdBarcode.updateMany({
            where: { householdId, locationId },
            data: { locationId: null },
          });" ""
mutate $SD "24. Seed sletter ingredienser som en husket strekkode bruker" \
" + i._count.barcodes > 0;" " > 0;"
mutate $APP "25. trustProxy fra konfigurasjonen brukes ikke" \
"    trustProxy: config.trustProxy," "    trustProxy: false,"
mutate $AU "26. Stengt registrering slipper likevel gjennom" \
"        if (!registrationOpen) throw" "        if (false) throw"
mutate $WEB "27. CSP uten 'wasm-unsafe-eval'" \
"    scriptSrc: [\"'self'\", \"'wasm-unsafe-eval'\", ...scriptHashes]," "    scriptSrc: [\"'self'\", ...scriptHashes],"
mutate $APP "28. __Host--cookien brukes ikke" \
"    config.cookieHostPrefix ? HOST_SESSION_COOKIE : SESSION_COOKIE," "    SESSION_COOKIE,"
mutate $CS "29. En feillest kode fra kameraet godtas" \
"                if (normalizeGtin(code.rawValue, format).ok) {" "                if (true) {"
mutate $CA "30. Kameraet stoppes ikke" \
"  stream?.getTracks().forEach((track) => track.stop());" ""
echo "31. Uendret kode (kontroll: ingen tester skal feile)"
echo "    enhetstester: $(npx vitest run 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')"
echo "    API-tester:   $(npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')"
