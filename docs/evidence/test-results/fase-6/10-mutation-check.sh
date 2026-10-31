#!/usr/bin/env bash
# Kontroll av testene for handlelisten (fase 6): slår av én regel eller beskyttelse om gangen i kildekoden,
# kjører enhetstestene og API-testene mot testdatabasen, og viser resultatet. Filen settes tilbake etter hver
# runde. En endring er «fanget» når minst én test feiler; skriptet viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-6/10-mutation-check.sh
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
LR=packages/shared/src/shopping/list.ts
SR=apps/api/src/modules/shopping/routes.ts
SS=apps/api/src/modules/shopping/service.ts
SP=apps/api/src/modules/shopping/repo.ts
SD=apps/api/src/modules/recipes/seed.ts
WA=apps/web/src/shopping/api.ts
WP=apps/web/src/pages/shopping/ShoppingListPage.tsx
WE=apps/web/src/shopping/listEvents.ts

mutate $SR "1. Handlelisterutene uten householdAccess (bare innlogging)" \
"  const preHandler = [requireAuth, householdAccess];" "  const preHandler = [requireAuth];"
mutate $SP "2. Retting av en linje filtrerer ikke på husholdning" \
"      const { count } = await db.shoppingListItem.updateMany({
        where: { id: itemId, householdId }," \
"      const { count } = await db.shoppingListItem.updateMany({
        where: { id: itemId },"
mutate $SP "3. Sletting av en linje filtrerer ikke på husholdning" \
"      const { count } = await db.shoppingListItem.deleteMany({
        where: { id: itemId, householdId }," \
"      const { count } = await db.shoppingListItem.deleteMany({
        where: { id: itemId },"
mutate $SP "4. «Fjern avhukede» fjerner avhukede linjer i alle husholdninger" \
"        where: { householdId, checked: true }," "        where: { checked: true },"
mutate $SP "5. Til lageret: linjene slettes uten krav om at de er avhuket" \
"            where: { householdId, checked: true, id: { in:" "            where: { householdId, id: { in:"
mutate $SP "6. Til lageret: ingen kontroll av hvor mange linjer som ble slettet (dobbel innsending)" \
"          if (count !== writes.length) throw new LinesChanged();" ""
mutate $SP "7. Samme oppskrift kan legge til på samme linje to ganger" \
"          if (open && open.recipes.length > 0) {" "          if (false) {"
mutate $SP "8. Listen låses ikke ved sammenslåing (samtidige forespørsler)" \
"household_id = \${householdId}::uuid FOR UPDATE\`" "household_id = \${householdId}::uuid\`"
mutate $SS "9. Ny linje: clientRequestId sjekkes ikke før lagring" \
"    const existing = dedupeKey ? await repo.findByDedupeKey(householdId, dedupeKey) : null;" \
"    const existing = null;"
mutate $SS "10. Ingrediens som ikke er i oppskriften, godtas" \
"      if (!ingredient || !inRecipe.has(line.ingredientId)) {" "      if (!ingredient) {"
mutate $SS "11. Sted fra en annen husholdning godtas i «Legg i matlageret»" \
"      if (!knownLocations.has(line.locationId))" "      if (false)"
mutate $SS "12. Vare fra en annen husholdning godtas i «Legg i matlageret»" \
"      if (target.kind === 'existing' && !units.has(target.itemId))" "      if (false)"
mutate $SS "13. Avhuking lagrer ikke tidspunktet" \
"      patch.checkedAt = body.checked ? this.deps.now() : null;" "      patch.checkedAt = null;"
mutate $LR "14. Sammenslåing legger sammen ulike enheter" \
"incoming.unit !== existing.unit) return existing;" "false) return existing;"
mutate $LR "15. En linje uten mengde får oppskriftens mengde" \
"  if (existing.quantityBase === null || existing.unit === null) return existing;" \
"  if (existing.quantityBase === null || existing.unit === null) return { quantityBase: incoming.quantityBase, unit: incoming.unit };"
mutate $LR "16. Basisvarer og valgfrie krysses av i forslagene" \
"      selected: reason === 'missing' || reason === 'notEnough'," "      selected: reason !== 'onList',"
mutate $LR "17. «Litt for lite» foreslår hele mengden i stedet for det som mangler" \
"      line.status === 'notEnough'
        ? line.missingBase" \
"      line.status === 'notEnough'
        ? line.quantityBase"
mutate $LR "18. Ny vare fra linjen kobles aldri til ingrediensen" \
"  return textIngredientId(name, index) === ingredientId" "  return true"
mutate $SD "19. Seed sletter ingredienser som en handlelistelinje bruker" \
"i._count.items + i._count.shoppingItems > 0;" "i._count.items > 0;"
mutate $WA "20. Avhukingen rulles ikke tilbake ved feil" \
"      if (context?.previous) queryClient.setQueryData(keys.list(h), context.previous);" ""
mutate $WP "21. Avkrysningsboksene bygges ikke på nytt etter tilbakerulling" \
"    setCheckboxVersion((v) => v + 1);" ""
mutate $WE "22. Den delegerte change-lytteren legges ikke til" \
"    root.addEventListener('change', onChange);" ""
echo "23. Uendret kode (kontroll: ingen tester skal feile)"
echo "    enhetstester: $(npx vitest run 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')"
echo "    API-tester:   $(npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')"
