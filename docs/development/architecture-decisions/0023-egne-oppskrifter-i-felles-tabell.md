# ADR-0023: Husholdningens egne oppskrifter i den felles oppskriftstabellen

**Status:** Akseptert 2026-10-30. Retningen ble foreslått av Ferdinand Risan i prompten for fase 15 («Foreslått
løsning å vurdere»). KI (Claude) vurderte den og skrev ADR-en i planen for fase 15, og planen ble godkjent av
Ferdinand Risan i chat («godkjent vennligst fortsett»). Ikke gjennomgått av Linus Saxe Huseby. Se
[spesifikasjon 16](../requirements/16-egne-oppskrifter-allergier-priser.md). Endrer konsekvensene av
[ADR-0016](0016-oppskrifter-fra-apne-kilder.md): oppskriftstabellen er ikke lenger bare global.

## Kontekst
Oppskriftene har vært globale: de skrives bare av seed-skriptet, og ingen tabell for oppskrifter har hatt
`household_id` (fase 5). Teamet vil at husholdninger skal kunne lage egne oppskrifter. De skal virke som de andre:
matching mot matlageret, rangering, allergenvarsler, måltidsplan og handleliste. Kravet som ikke kan fravikes, er at
ingen husholdning noen gang kan se, endre, rangere, planlegge eller legge i handlelisten en annen husholdnings
oppskrift.

Det som fantes før fasen, og som gjorde en endring risikabel:
- `meal_plan_entries.recipe_id` og `shopping_list_item_recipes.recipe_id` har vanlige fremmednøkler til
  `recipes.id`. Databasen ville godtatt en oppføring som peker på en annen husholdnings oppskrift.
- Seed-skriptet slettet alle oppskrifter som ikke sto i filene (`slug NOT IN …`). Det ville slettet alle egne
  oppskrifter ved neste `db:seed`.
- Alle oppskriftsspørringer gikk gjennom `createRecipeRepo`, men uten husholdning som argument.

## Beslutning
- **Én tabell:** `recipes` får `household_id` (CASCADE), `created_by` (SET NULL) og `version`. `RecipeSource` får
  verdien `household`. En CHECK binder dem sammen: `(source = 'household') = (household_id IS NOT NULL)`.
- **Egne oppskrifter har ingen slug, lisens, forfattere eller kildefelt**, og aldri `reviewed_by`. Hvem som la dem
  inn, vises med `toCreator` (navn bare for nåværende medlemmer). Globale oppskrifter krever slug, lisens og
  forfattere som før (CHECK).
- **Fritekstlinjer:** `recipe_ingredients.ingredient_id` blir nullable, og linjen får `household_id`, som en trigger
  fyller fra oppskriften. En CHECK tillater fritekst bare når `household_id` er satt, og fritekst har aldri mengde.
- **Grensen håndheves i tre lag:**
  1. **Repoet:** `RecipeRepo.recipes(householdId)` og `recipe(householdId, id)` krever husholdningen. Filteret
     «global eller denne husholdningen» står bare der. En statisk test (`recipeQueries.test.ts`) feiler hvis en
     annen fil spør `recipes` direkte.
  2. **Databasen:** triggeren `recipe_household_guard` stopper en oppføring i måltidsplanen eller et bidrag på
     handlelisten som peker på en annen husholdnings oppskrift.
  3. **Testene:** 404 for en annen husholdning på hver rute (spesifikasjon 16).
- **Seed-skriptet** leser og skriver bare globale oppskrifter (`GLOBAL_RECIPES` fra repoet).

## Alternativer
- **Egne tabeller** (`household_recipes`, `household_recipe_lines`):
  - Fordeler: ingen nullable kolonner, enkle CHECK-er, og seed-skriptet kunne ikke nådd dem.
  - Ulemper: matching, rangering, allergener, måltidsplan, handleliste og prisanslag måtte slått sammen to kilder
    overalt. `meal_plan_entries` og `shopping_list_item_recipes` måtte fått to nullable fremmednøkler med en CHECK
    for «nøyaktig én». Hver av de stedene er et sted der husholdningsfilteret kan glemmes. Forkastet.
- **Global tabell med en egen eierskapstabell** (`recipe_owners`): alle spørringer måtte slått opp eierskap, og en
  glemt join ville gjort oppskriften global. Forkastet.
- **Bare filter i koden (uten trigger):** enklere migrering, men da avhenger grensen av at ingen ny kode glemmer
  filteret. Forkastet. Triggeren koster ett oppslag per innsetting.

## Konsekvenser
- Én migrering (`household_recipes`) med CHECK-er og trigger som rå SQL.
- Tjenestene for oppskrifter, måltidsplan og handleliste sender husholdningen videre til repoet.
- Egne oppskrifter eksporteres med `/me/export` (`recipes` og `recipe_ingredients` med `household_id`).
- `RECIPES_INCLUDE_UNREVIEWED` gjelder bare eksterne oppskrifter.
- Sletter en husholdning en egen oppskrift, beholder måltidsplanen tittelen (SET NULL), og bidragene på handlelisten
  slettes (CASCADE), som når seed-skriptet fjerner en global oppskrift.
- Ingen bilder, ingen offentlige oppskrifter og ingen deling mellom husholdninger i denne fasen.
