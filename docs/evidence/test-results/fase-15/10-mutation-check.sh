#!/usr/bin/env bash
# Kontroll av testene for fase 15 (egne oppskrifter, allergier, priser): slår av én regel eller beskyttelse om gangen i kildekoden, kjører testene
# og viser resultatet. Filen settes tilbake etter hver runde. En endring er «fanget» når minst én test feiler; skriptet
# viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-15/10-mutation-check.sh          (med DRY=1: sjekker bare at endringene finnes)
# Som i fase 8–13 kjøres alle enhetstestene, men bare API-testene fasen berører.
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
API_TESTS="apps/api/test/ownRecipes apps/api/test/avoidedIngredients apps/api/test/prices.api apps/api/test/privacy apps/api/test/recipes apps/api/test/mealPlan apps/api/test/shopping"
REPO=apps/api/src/modules/recipes/repo.ts
SVC=apps/api/src/modules/recipes/service.ts
SEED=apps/api/src/modules/recipes/seed.ts
HREPO=apps/api/src/modules/households/repo.ts
HSVC=apps/api/src/modules/households/service.ts
PRICE=apps/api/src/modules/prices/service.ts
PRIV=apps/api/src/modules/privacy/repo.ts
MEAL=apps/api/src/modules/mealplan/service.ts
HH=packages/shared/src/recipes/household.ts
FILTER=apps/web/src/recipes/filter.ts
SETTINGS=apps/web/src/settings/AllergiesCard.tsx

# FR-REC-009 bare egen husholdning (ADR-0023)
mutate $REPO "1. Alle oppskrifter er synlige for alle (husholdningsfilteret fjernet)" \
"  return { OR: [GLOBAL_RECIPES, { householdId }] };" "  return {};"
mutate $REPO "2. Detaljen slår opp bare på id, uten husholdning" \
"        where: { AND: [{ id: recipeId }, visible(householdId)] }," "        where: { id: recipeId },"
mutate $REPO "3. Endre og slette treffer en oppskrift i en annen husholdning" \
"    ({ id: recipeId, householdId }) satisfies Prisma.RecipeWhereInput;" "    ({ id: recipeId }) satisfies Prisma.RecipeWhereInput;"
mutate $REPO "4. Endring uten versjonskontroll (siste lagring vinner)" \
"          where: { ...own(householdId, recipeId), version }," "          where: { ...own(householdId, recipeId) },"

# FR-REC-010 seed og eksport
mutate $SEED "5. Seed-skriptet sletter også egne oppskrifter" \
"        where: { ...GLOBAL_RECIPES, slug: { notIn: seed.recipes.map((r) => r.slug) } }," "        where: { OR: [{ slug: null }, { slug: { notIn: seed.recipes.map((r) => r.slug) } }] },"
mutate $SEED "6. Seed sletter en ingrediens som bare brukes i en egen oppskrift" \
"        c.items + c.shoppingItems + c.barcodes + c.recipes + c.avoidedBy > 0;" "        c.items + c.shoppingItems + c.barcodes + c.avoidedBy > 0;"
mutate $PRIV "7. Eksporten mangler egne oppskrifter" \
"  { table: 'recipes', omit: [] }," ""

# FR-REC-007/008 skjema og regler
mutate $SVC "8. En ukjent ingrediens godtas" \
"        fields[\`lines.\${i}.ingredientId\`] = 'validation.recipe.ingredient';" ""
mutate $SVC "9. Grensen på 200 egne oppskrifter gjelder ikke" \
"    if ((await this.deps.repo.countHouseholdRecipes(householdId)) >= HOUSEHOLD_RECIPES_MAX)" "    if (false)"
mutate $HH "10. En enhet som ikke kan regnes om, godtas" \
"  if (!unitsFor(ingredient).includes(unit)) return 'validation.recipe.unit';" ""
mutate $MEAL "11. En ukjent oppskrift i måltidsplanen gir 400 i stedet for 404" \
"      if (!recipe) throw notFound();" "      if (!recipe) throw fieldError({ recipeId: 'validation.mealPlan.recipeNotFound' });"

# FR-ALG-001/002 matvarer og deling
mutate $HREPO "12. Delte matvarer telles uten at medlemmet har slått på deling" \
"        select: { ingredient: { select: { id: true, name: true } } },
        distinct: ['ingredientId']," "        select: { ingredient: { select: { id: true, name: true } } },
        distinct: ['ingredientId'], where: { userId: { not: exceptUserId } },"
mutate $HSVC "13. Egne matvarer vises også som husholdningens" \
"    return shared.filter((i) => !mine.has(i.id));" "    return shared;"
mutate $HH "14. Husholdningens matvarer gir ingen varsel" \
"    householdIngredientWarnings: ingredientConflicts(ids, household.avoided)," "    householdIngredientWarnings: [],"
mutate $SVC "15. En ukjent matvare kan registreres" \
"    if (unknown >= 0)
      throw fieldError" "    if (false)
      throw fieldError"
mutate $FILTER "16. Oppskrifter med registrerte matvarer skjules ikke" \
"    recipe.ingredientWarnings.length > 0 ||" ""
mutate $FILTER "17. «Bare egne oppskrifter» filtrerer ikke" \
"      (!filter.ownOnly || r.source === 'household') &&" ""
mutate $SETTINGS "18. Delingen slås på av seg selv når husholdningen er delt" \
"        checked={household.data.shareAllergens}" "        checked={household.data.shareAllergens || shared}"

# FR-PRICE-007 prisanslag
mutate $PRICE "19. Basisvarer prises og telles med" \
"        if (!ingredient || ingredient.isStaple)" "        if (!ingredient)"
mutate $PRICE "20. Fritekstlinjer telles ikke som hoppet over" \
"      ...recipe.freeTextLines.map((line) => skipped(line.position, line.displayText, 'freeText'))," ""
mutate $PRICE "21. Prisanslaget slår opp en oppskrift uten husholdning (annen husholdnings oppskrift)" \
"    const recipe = await this.deps.recipes.recipe(householdId, recipeId);
    if (!recipe) throw notFound();
    const [estimate, catalog]" "    const recipe = await this.deps.recipes.recipe(householdId, recipeId).then((r) => r ?? { lines: [], freeTextLines: [] });
    const [estimate, catalog]"
rm -f "$backup"
