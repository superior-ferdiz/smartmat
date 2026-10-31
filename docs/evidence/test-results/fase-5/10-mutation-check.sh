#!/usr/bin/env bash
# Kontroll av testene for oppskrifter (fase 5): slår av én regel eller beskyttelse om gangen i kildekoden,
# kjører enhetstestene og API-testene mot testdatabasen, og viser resultatet. Filen settes tilbake etter hver
# runde. En endring er «fanget» når minst én test feiler; skriptet viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-5/10-mutation-check.sh
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
SC=packages/shared/src/recipes/scoring.ts
MA=packages/shared/src/recipes/matching.ts
SE=packages/shared/src/recipes/seed.ts
RR=apps/api/src/modules/recipes/routes.ts
RS=apps/api/src/modules/recipes/service.ts
RP=apps/api/src/modules/recipes/repo.ts
IR=apps/api/src/modules/inventory/repo.ts
IS=apps/api/src/modules/inventory/service.ts
WF=apps/web/src/recipes/filter.ts
WA=apps/web/src/recipes/AllergenNotice.tsx
NB=apps/web/src/i18n/locales/nb-NO.json

mutate $RR "1. Oppskriftsrutene uten householdAccess (bare innlogging)" \
"  const preHandler = [requireAuth, householdAccess];" "  const preHandler = [requireAuth];"
mutate $IR "2. Matlageret leses uten husholdningsfilter (rangeringen ville brukt andres varer)" \
"      const rows = await db.inventoryItem.findMany({
        where: { householdId }," \
"      const rows = await db.inventoryItem.findMany({
        where: {},"
mutate $RP "3. Lagring av allergier sletter alle brukeres allergier" \
"db.userAllergen.deleteMany({ where: { userId } })" "db.userAllergen.deleteMany({ where: {} })"
mutate $IS "4. Valgt ingrediens sjekkes ikke mot ingredienstabellen" \
"        !(await this.deps.ingredients.exists(ingredient.ingredientId))" \
"        false"
mutate $SC "5. Partier med passert siste forbruksdag regnes med" \
"if (status === 'passed' && batch.expiryKind === 'use_by') {" "if (false) {"
mutate $SC "6. Omregning runder opp i stedet for ned" \
"quantityBase: Math.floor((quantity * conversion.baseQty) / conversion.unitQty)," \
"quantityBase: Math.ceil((quantity * conversion.baseQty) / conversion.unitQty),"
mutate $SC "7. Valgfrie ingredienser teller i poengsummen" \
"if (!result || line.optional || result.status === 'staple') return;" \
"if (!result || result.status === 'staple') return;"
mutate $SC "8. Basisvarer regnes som vanlige ingredienser" \
"  if (line.isStaple) return { ...base, status: 'staple' };" ""
mutate $SC "9. Ingen grense på bonus for «går snart ut»" \
"    .slice(0, EXPIRING_MAX_COUNT);" "    .slice(0);"
mutate $SC "10. Best før passert gir ikke bonus" \
"        (status === 'passed' && batch.expiryKind === 'best_before');" "        false;"
mutate $MA "11. Tvetydige navn gjettes i stedet for å gi ingen kobling" \
"if (ids.length > 1) return { kind: 'ambiguous', ingredientIds: ids.sort() };" ""
mutate $MA "12. Manuell kobling ignoreres" \
"if (item.ingredientMatch === 'manual' && item.ingredientId)" "if (false)"
mutate $MA "13. «Ikke en ingrediens» ignoreres" \
"  if (item.ingredientMatch === 'none') return { kind: 'none' };" ""
mutate $MA "14. Aliaser treffer deler av ord (ikke bare hele ord)" \
"  const words = normalizeWords(itemName);" \
"  const words = [...normalizeWords(itemName), ...normalizeWords(itemName).flatMap((w) => [...index.keys()].filter((a) => w.includes(a)))];"
mutate $RS "15. Allergener fra valgfrie ingredienser telles ikke" \
"    const registered = ingredientsOf.flatMap((i) => i.allergens);" \
"    const registered = ingredientsOf.filter((_, i) => !recipe.lines[i]?.optional).flatMap((i) => i.allergens);"
mutate $SE "16. Oppskrift uten forfatter godtas" \
"  authors: z.array(text(100)).min(1).max(10)," "  authors: z.array(text(100)).max(10),"
mutate $SE "17. Samme alias på to ingredienser godtas" \
"      else if (owner && owner !== ingredient.key)" "      else if (false)"
mutate $WF "18. Oppskrifter med brukerens allergener skjules ikke" \
"  const shown = matching.filter((r) => r.allergenWarnings.length === 0);" "  const shown = matching;"
mutate $WA "19. Forbeholdet fjernes fra allergenboksen på oppskriften" \
"      <p className={styles.disclaimerText}>{t('recipes.allergens.disclaimer')}</p>" ""
mutate $NB "20. En tekst sier at en oppskrift er allergenfri" \
"\"noneRegistered\": \"Ingen av dine registrerte allergener er registrert i ingrediensene.\"" \
"\"noneRegistered\": \"Oppskriften er allergenfri for deg.\""
echo "21. Uendret kode (kontroll: ingen tester skal feile)"
echo "    enhetstester: $(npx vitest run 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')"
echo "    API-tester:   $(npx vitest run --config apps/api/vitest.db.config.ts 2>&1 | grep -E '^\s+Tests ' | sed 's/^ *//')"
