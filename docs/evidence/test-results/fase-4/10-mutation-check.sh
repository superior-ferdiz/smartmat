#!/usr/bin/env bash
# Kontroll av sikkerhets- og regeltestene for kjøp og budsjett (fase 4): slår av én beskyttelse om gangen i
# kildekoden, kjører API-testene mot testdatabasen og viser hvor mange tester som feiler. Filen settes tilbake
# etter hver runde. Kjøres fra repo-roten: bash docs/evidence/test-results/fase-4/10-mutation-check.sh
set -u
backup=$(mktemp)
# mutate fil beskrivelse gammel1 ny1 [gammel2 ny2 …] – hver tekst må finnes, og byttes ut første gang den står.
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
  result=$(npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    resultat: $result"
}
R=apps/api/src/modules/purchases/repo.ts
S=apps/api/src/modules/purchases/service.ts
B=apps/api/src/modules/budget/repo.ts

mutate $R "1. Kjøp slås opp uten husholdningsfilter (GET)" \
"      const row = await db.purchase.findFirst({
        where: { id: purchaseId, householdId }," \
"      const row = await db.purchase.findFirst({
        where: { id: purchaseId },"
mutate $R "2. Retting av kjøp uten husholdningsfilter" \
"        const { count } = await tx.purchase.updateMany({
          where: { id: purchaseId, householdId }," \
"        const { count } = await tx.purchase.updateMany({
          where: { id: purchaseId },"
mutate $R "3. Sletting av kjøp uten husholdningsfilter" \
"        const purchase = await tx.purchase.findFirst({
          where: { id: purchaseId, householdId }," \
"        const purchase = await tx.purchase.findFirst({
          where: { id: purchaseId },"
mutate $B "4. Månedsoversikten summerer linjer uten husholdningsfilter" \
"        JOIN purchases p ON p.id = l.purchase_id AND p.household_id = l.household_id
        WHERE p.household_id = \${householdId}::uuid" \
"        JOIN purchases p ON p.id = l.purchase_id AND p.household_id = l.household_id
        WHERE true"
mutate $S "5. Linje-ID i rettingen sjekkes ikke mot kjøpet" \
"if (line.id && !known.has(line.id))" "if (false)"
mutate $S "6. Lagringssted i en linje sjekkes ikke mot husholdningen" \
"if (!knownLocations.has(target.locationId)) {" "if (false) {"
mutate $S "7. Eksisterende vare i en linje sjekkes ikke mot husholdningen" \
"if (target.itemId && !units.has(target.itemId)) {" "if (false) {"
mutate $S "8. Kjøpsdato frem i tid tillates" \
"if (body.purchasedOn > osloDate(this.deps.now())) {" "if (false) {"
mutate $S "9. Totalsummen regnes ikke av serveren (linjene summeres ikke)" \
"return lines.length > 0 ? sumOre(lines.map((l) => l.amountOre)) : (totalOre ?? 0);" \
"return totalOre ?? 0;"
mutate $R "10. Kjøp, linjer og partier skrives uten transaksjon" \
"        return await db.\$transaction(async (tx) => {
          const created = await tx.purchase.create({" \
"        return await (async (tx: Db) => {
          const created = await tx.purchase.create({" \
"          return created.id;
        });" \
"          return created.id;
        })(db);"
mutate $S "11. Ingen gjenbruk av clientRequestId (dobbel innsending gir to kjøp)" \
"const dedupeKey = body.clientRequestId ? \`manual:\${body.clientRequestId}\` : null;" \
"const dedupeKey = null as string | null;"
mutate $R "12. Dedupe-nøkkelen lagres ikke (bare forhåndssjekken i servicen gjenstår)" \
"              dedupeKey,
              createdById: actorId," \
"              dedupeKey: null,
              createdById: actorId,"
mutate $R "13. «Urørt» sjekker bare mengden, ikke hendelsene (et flyttet parti regnes som urørt)" \
"            AND NOT EXISTS (SELECT 1 FROM inventory_events e
                            WHERE e.batch_id = b.id AND e.type <> 'add')) AS untouched" \
"            ) AS untouched"
mutate $R "14. Urørte partier fjernes alltid, også når brukeren vil beholde dem" \
"  const remove = removeUntouched ? batches.filter((b) => b.untouched) : [];" \
"  const remove = batches.filter((b) => b.untouched);"
mutate $R "15. Partiene låses ikke (FOR UPDATE fjernet) før urørt-sjekken" \
"    FOR UPDATE OF b\`;" "    \`;"
mutate $B "16. Feil budsjettrad brukes for en måned (eldste i stedet for siste gyldige)" \
"orderBy: { validFrom: 'desc' }," "orderBy: { validFrom: 'asc' },"

echo "Uendret kode:"
npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ */    /'
rm -f "$backup"
