#!/usr/bin/env bash
# Kontroll av testene for oppskrifter fra åpne kilder og måltidsplan (fase 9): slår av én regel eller beskyttelse om
# gangen i kildekoden, kjører testene og viser resultatet. Filen settes tilbake etter hver runde. En endring er
# «fanget» når minst én test feiler; skriptet viser hvilke. Kjøres fra repo-roten:
#   bash docs/evidence/test-results/fase-9/10-mutation-check.sh          (med DRY=1: sjekker bare at endringene finnes)
# Som i fase 8 kjøres alle enhetstestene, men bare API-testene fasen berører (mealPlan, recipeSources, recipes og
# shopping*.api.test.ts).
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
  api_out=$(npx vitest run --config apps/api/vitest.db.config.ts apps/api/test/mealPlan apps/api/test/recipeSources apps/api/test/recipes apps/api/test/shopping 2>&1)
  cp "$backup" "$file"
  echo "$desc"
  echo "    endret: $file"
  echo "    enhetstester: $(grep -E '^\s+Tests ' <<<"$unit_out" | sed 's/^ *//')"
  echo "    API-tester:   $(grep -E '^\s+Tests ' <<<"$api_out" | sed 's/^ *//')"
  grep -hE '^ FAIL ' <<<"$unit_out"$'\n'"$api_out" | sed 's/^ FAIL  */      feilet: /' | sort -u
}
NEEDS=packages/shared/src/mealplan/needs.ts
WEEK=packages/shared/src/dates/week.ts
MPS=packages/shared/src/schemas/mealPlan.ts
SCORE=packages/shared/src/recipes/scoring.ts
SEED=packages/shared/src/recipes/seed.ts
MR=apps/api/src/modules/mealplan/routes.ts
MRP=apps/api/src/modules/mealplan/repo.ts
MS=apps/api/src/modules/mealplan/service.ts
SRP=apps/api/src/modules/shopping/repo.ts
RRP=apps/api/src/modules/recipes/repo.ts
WSC=apps/web/src/recipes/scale.ts
WPG=apps/web/src/pages/mealplan/MealPlanPage.tsx
WAD=apps/web/src/mealplan/AddEntryDialog.tsx

mutate $NEEDS "1. Skalering runder ned i stedet for opp" \
"  const scaled = Math.ceil(product / recipeServings);" "  const scaled = Math.floor(product / recipeServings);"
mutate $NEEDS "2. «ca.» (rundet) settes aldri" \
"    rounded: product % recipeServings !== 0," "    rounded: false,"
mutate $NEEDS "3. Et parti med siste forbruksdag teller også for måltider etter datoen" \
"const usableOn = (until: string | null, date: string) => until === null || until >= date;" "const usableOn = (_until: string | null, _date: string) => true;"
mutate $NEEDS "4. Fordelingen bruker partiet som går ut sist, først" \
"          (a.usableUntil ?? '9999-12-31').localeCompare(b.usableUntil ?? '9999-12-31')," "          (b.usableUntil ?? '9999-12-31').localeCompare(a.usableUntil ?? '9999-12-31'),"
mutate $NEEDS "5. Siste forbruksdag passert teller med i behovet" \
"      if (usableUntil !== null && expiryStatus(usableUntil, today).status === 'passed') {" "      if (usableUntil !== null && expiryStatus(usableUntil, today).status === 'never') {"
mutate $NEEDS "6. Det som er lagt på listen før, trekkes ikke fra (samme behov to ganger gir dobbelt)" \
"  return Math.max(0, (need.shortfallBase ?? 0) - (need.addedBase ?? 0));" "  return Math.max(0, need.shortfallBase ?? 0);"
mutate $NEEDS "7. Færre porsjoner tar noe av listen (negativ endring)" \
"  return Math.max(0, (need.shortfallBase ?? 0) - (need.addedBase ?? 0));" "  return (need.shortfallBase ?? 0) - (need.addedBase ?? 0);"
mutate $NEEDS "8. «For lite» også når ingenting kan brukes den dagen" \
"    else if (covered > 0) status = 'notEnough';" "    else if (covered > 0 || (have?.itemNames.size ?? 0) > 0) status = 'notEnough';"
mutate $NEEDS "9. Basisvarer og valgfrie krysses av i forslaget" \
"      selected: reason === 'missing' || reason === 'notEnough'," "      selected: reason !== 'onList',"
mutate $NEEDS "10. «Går ut denne uka» tar med varer som planen bruker" \
"    if (ingredientId && input.plannedIngredientIds.has(ingredientId)) continue;" ""
mutate $NEEDS "11. «Går ut denne uka» tar med passerte datoer" \
"      if (batch.expiryDate < input.today || batch.expiryDate > input.to) continue;" "      if (batch.expiryDate > input.to) continue;"
mutate $WEEK "12. ISO-uka regnes fra onsdag i stedet for torsdag" \
"  const thursday = day - weekday(day) + 3;" "  const thursday = day - weekday(day) + 2;"
mutate $WEEK "13. Behovet for denne uka regnes fra mandag (dager som har vært, telles)" \
"  return { from: monday > today ? monday : today, to: sunday };" "  return { from: monday, to: sunday };"
mutate $MPS "14. Perioden kan være 43 dager" \
"  else if (daysBetween(range.from, range.to) >= MEAL_PLAN_MAX_DAYS)" "  else if (daysBetween(range.from, range.to) > MEAL_PLAN_MAX_DAYS)"
mutate $SCORE "15. Rangering for en dag: partier som går ut før dagen teller" \
"      if (batch.expiryKind === 'use_by' && batch.expiryDate !== null && batch.expiryDate < usableOn)" "      if (batch.expiryKind === 'use_by' && batch.expiryDate !== null && batch.expiryDate < today)"
mutate $SEED "16. Eksterne oppskrifter uten kildefelt godtas" \
"      if (recipe[field] === undefined) issue(field, \`\${field} er påkrevd for eksterne oppskrifter\`);" ""
mutate $SEED "17. Alle lisenser godtas for eksterne oppskrifter" \
"    if (!(RECIPE_LICENSES as readonly string[]).includes(recipe.license))" "    if (false)"
mutate $SEED "18. Omregning med brøk rundes før omregningen (½ løk = 100 g)" \
"    Math.round((parsed.num * factor * conversion.baseQty) / (parsed.den * conversion.unitQty))," "    Math.round((parsed.num * factor) / parsed.den) * Math.round(conversion.baseQty / conversion.unitQty),"
mutate $MR "19. Rutene for måltidsplanen uten householdAccess (bare innlogging)" \
"  const preHandler = [requireAuth, householdAccess];" "  const preHandler = [requireAuth];"
mutate $MRP "20. Uka hentes uten å filtrere på husholdning" \
"        where: { householdId, date: { gte: toDbDate(from), lte: toDbDate(to) } }," "        where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },"
mutate $MRP "21. En oppføring hentes uten å filtrere på husholdning" \
"      const row = await db.mealPlanEntry.findFirst({
        where: { id: entryId, householdId }," "      const row = await db.mealPlanEntry.findFirst({
        where: { id: entryId },"
mutate $MRP "22. En oppføring endres uten å filtrere på husholdning" \
"      const { count } = await db.mealPlanEntry.updateMany({
        where: { id: entryId, householdId }," "      const { count } = await db.mealPlanEntry.updateMany({
        where: { id: entryId },"
mutate $MRP "23. En oppføring slettes uten å filtrere på husholdning" \
"deleteMany({ where: { id: entryId, householdId } });" "deleteMany({ where: { id: entryId } });"
mutate $MS "24. Ingen grense på 20 oppføringer per dag" \
"    if ((await repo.countOnDay(householdId, body.date)) >= MEAL_PLAN_MAX_PER_DAY) throw dayFull();" ""
mutate $MS "25. Dobbel innsending gir to oppføringer (ingen dedupe-nøkkel)" \
"    const dedupeKey = body.clientRequestId ? \`client:\${body.clientRequestId}\` : null;" "    const dedupeKey = null;"
mutate $MS "26. Porsjoner kan settes på fritekst" \
"    if (body.servings !== undefined && isNote)" "    if (false)"
mutate $MS "27. En ingrediens planen ikke trenger, kan legges på listen" \
"        fields[\`lines.\${index}.ingredientId\`] = 'validation.mealPlan.notInPlan';
        return [];" "        return [];"
mutate $MS "28. Behovet regnes fra datoen i forespørselen, også dager som har vært" \
"    const from = range.from > today ? range.from : today;" "    const from = range.from;"
mutate $SRP "29. Bidragene leses uten å filtrere på husholdning" \
"        where: { householdId, entryId: { in: entryIds } }," "        where: { entryId: { in: entryIds } },"
mutate $SRP "30. Det en oppføring la til før, trekkes ikke fra i transaksjonen" \
"              addedBase: added?.quantityBase ?? null," "              addedBase: null,"
mutate $RRP "31. RECIPES_INCLUDE_UNREVIEWED=false skjuler ingenting" \
"    : { NOT: { source: 'external', reviewedBy: { isEmpty: true } } };" "    : {};"
mutate $MS "32. En fjernet oppskrift vises fortsatt med id" \
"      recipeId: recipe ? recipe.id : null," "      recipeId: entry.recipeId,"
mutate $WSC "33. Oppskriftssiden regner ikke har/mangler på nytt for skalerte mengder" \
"    if (have >= scaled.quantityBase) return { ...result, status: 'enough', missingBase: null };" "    return result;"
mutate $WAD "34. Skjemaet sender ikke clientRequestId" \
"    const parsed = createMealEntrySchema.safeParse({ ...input, date, meal, clientRequestId });" "    const parsed = createMealEntrySchema.safeParse({ ...input, date, meal });"
mutate $WPG "35. Meldingen etter fjerning settes aldri (skjermleseren får ikke vite det)" \
"      onSuccess: () => {
        setAnnouncement(t('mealPlan.removed', { name }));" "      onSuccess: () => {
        if (document.querySelector('[data-never]')) setAnnouncement(t('mealPlan.removed', { name }));"
