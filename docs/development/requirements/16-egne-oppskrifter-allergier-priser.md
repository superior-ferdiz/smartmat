# 16 – Egne oppskrifter, allergier i Innstillinger og priser på oppskrifter (fase 15)

**Status:** Beslutningene i del 1–3 er tatt av teamet (Ferdinand Risan) 2026-10-30 og står i prompten for fase 15.
Planen ble godkjent av Ferdinand Risan i chat samme dag («godkjent vennligst fortsett»). De ni åpne spørsmålene ble
ikke besvart enkeltvis, så anbefalingene i planen gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før
implementeringen. Ikke gjennomgått av Linus Saxe Huseby.

Filnummeret er 16 fordi `13-sikkerhet-drift.md` er spesifikasjonen til fase 13 og fase 14 ikke hadde noen.

**Bygger på:** FR-REC-001–006, FR-PLAN-001–005, FR-SHOP-002, FR-HH-006/007, FR-PRICE-001–006, FR-PRIV-001,
NFR-SEC-001/002/004, NFR-DATA-001 og NFR-UX-001–004 i [00-kravoversikt.md](00-kravoversikt.md), ADR-0006,
ADR-0007, ADR-0010, ADR-0016, ADR-0018, ADR-0020 og
[ADR-0023](../architecture-decisions/0023-egne-oppskrifter-i-felles-tabell.md).

## Teamets beslutninger (prompten, 2026-10-30)

- Egne oppskrifter tilhører husholdningen. Alle medlemmer ser og bruker dem, og andre husholdninger får 404.
- Ingredienslinjer velges fra ingredienslisten med mengde og enhet. Fritekstlinjer er lov, men teller ikke, og det
  står tydelig i UI-et. Ingen bilder.
- Når et medlem forlater husholdningen, blir oppskriftene igjen, og navnet vises etter `toCreator`-regelen.
- Vises som «Egen oppskrift», aldri som «KI-utkast». Aldri `source=team`.
- Allergier legges inn fra Innstillinger. I tillegg til de 14 allergenene kan man velge matvarer fra
  ingredienslisten man ikke tåler. Delingen bygger på `share_allergens` og slås ikke på automatisk.
- Varsler bruker bare ordet «registrert», aldri «fri for». Allergier logges aldri.
- Ingen skraping. Kassalapp er av uten nøkkel. Prisene på en oppskrift vises som et ærlig anslag.

## Avgjørelser tatt ved godkjenningen (anbefalingene i planen)

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Gren | `fase-15` fra `fase-14` (eebc39d) |
| 2 | Hvem kan endre og slette en egen oppskrift | Alle medlemmer, som andre husholdningsdata (fase 10) |
| 3 | Standard for deling (GDPR art. 9) | Av. Uttrykkelig samtykke (art. 9 nr. 2 bokstav a) må være et aktivt valg. Innstillinger viser en oppfordring når husholdningen har flere medlemmer og brukeren har registrert noe som ikke deles. Teamet bør ta spørsmålet med veilederen. |
| 4 | Én eller to brytere for deling | Én bryter (`share_allergens`) for både allergener og matvarer, med tekst som sier begge deler |
| 5 | Søk etter navn hos Kassalapp | Ikke i denne fasen (se «Priser: det som er undersøkt») |
| 6 | Visning av prisanslaget | Bare «andel av det dere betalte» per linje, merket som anslag |
| 7 | Ukjent eller fremmed oppskrift i måltidsplanen | 404 (var 400 med feltfeil i spesifikasjon 09) |
| 8 | Grenser | 200 egne oppskrifter per husholdning, 40 linjer, 30 trinn, 50 matvarer man ikke tåler |

## Del 1: Egne oppskrifter

### FR-REC-007 Lage, endre og slette
- `/oppskrifter/ny` og `/oppskrifter/:recipeId/endre`. Skjemaet har tittel (1–120), beskrivelse (0–500), porsjoner
  (1–50), forberedelse og koking (0–1440 min), tagger (høyst 10, 1–30 tegn, små bokstaver), linjer (1–40) og trinn
  (1–30, hvert 1–1000 tegn).
- Alle medlemmer kan lage, endre og slette (avgjørelse 2). Sletting bekreftes i en dialog.
- **Endring med `version`:** `PUT` sender versjonen skjemaet ble åpnet med. Har noen andre lagret i mellomtiden,
  svarer API-et 409 `errors.changedMeanwhile`, og ingenting lagres.
- **Dobbel innsending:** `POST` sender `clientRequestId`. Kommer den igjen, svarer API-et 200 med oppskriften som ble
  lagret.
- Høyst 200 egne oppskrifter per husholdning (409 `errors.recipe.tooMany`).
- Kortet og oppskriften viser merket **«Egen oppskrift»** og «Lagt inn av ‹navn›». Navnet vises bare for nåværende
  medlemmer, ellers «et tidligere medlem» eller «en slettet konto» (`toCreator`, FR-HH-007). Aldri «KI-utkast».
- Listen får filteret «Egne oppskrifter» (`?egne=1` i URL-en).
- Egne oppskrifter rangeres, planlegges og legges i handlelisten på samme måte som de andre.

### FR-REC-008 Ingredienslinjer
- **Ingredienslinje:** ingrediens fra listen (søk), mengde (`"2"`, `"1,5"`, `"1/2"`) og enhet, eller ingen mengde
  («etter smak»), og valgfri. Enhetene er de som kan regnes om til ingrediensens grunnenhet (`units` i
  `GET /ingredients`). Serveren regner om med samme funksjon som seed-dataene (`seedQuantityBase`). Det brukeren
  skrev (mengde og enhet), lagres, så skjemaet kan åpnes igjen.
- **Teksten på linjen** er det brukeren skriver. Er feltet tomt, lager serveren den: «2 dl melk».
- **Fritekstlinje:** bare tekst (1–120 tegn), uten mengde. Skjemaet og oppskriften sier: «Fritekst – telles ikke i
  matlageret, handlelisten, måltidsplanen, prisanslaget eller allergenvarslene.»
- Samme ingrediens kan stå bare én gang per oppskrift (400 med feltfeil).
- En ukjent ingrediens eller en enhet som ikke kan regnes om, gir 400 med feltfeil på linjen.

### FR-REC-009 Bare egen husholdning
- Oppskriftene tilhører husholdningen (`household_id`). En annen husholdning får **404** på:

  | Rute | Hva testen viser |
  |---|---|
  | `GET /recipes` | Oppskriften er ikke med i listen |
  | `GET /recipes?for=…` | Oppskriften er ikke med i rangeringen for en planlagt dag |
  | `GET /recipes/:id` | 404 |
  | `PUT /recipes/:id` | 404, og oppskriften er uendret |
  | `DELETE /recipes/:id` | 404, og oppskriften finnes fortsatt |
  | `GET /recipes/:id/price-estimate` | 404 |
  | `POST /meal-plan/entries` med oppskriften | 404, og ingen oppføring |
  | `POST /shopping-list/from-recipe/:id` | 404, og listen er uendret |

- Databasen stopper en oppføring i måltidsplanen eller et bidrag på handlelisten som peker på en annen husholdnings
  oppskrift (triggeren `recipe_household_guard`, ADR-0023). En API-test prøver det med SQL.
- Alle oppskriftsspørringer går gjennom `apps/api/src/modules/recipes/repo.ts`. `recipeQueries.test.ts` feiler hvis
  en annen fil spør tabellen direkte. Unntak: eksporten (leser med `household_id`).
- Når et medlem går ut eller blir fjernet, blir oppskriftene i husholdningen. Slettes husholdningen, slettes
  oppskriftene (CASCADE).

### FR-REC-010 Seed og eksport
- `npm run db:seed` leser, oppdaterer og sletter bare globale oppskrifter. En ingrediens som brukes i en egen
  oppskrift eller er registrert som en matvare noen ikke tåler, slettes ikke (den nevnes i «beholdt»).
- `/me/export` tar med `recipes` og `recipe_ingredients` for husholdningene brukeren er medlem av.

## Del 2: Allergier i Innstillinger

### FR-ALG-001 Kortet «Allergier og matvarer»
- Ligger i Innstillinger (`/innstillinger#allergier`). Profilen viser en lenke dit i stedet for skjemaet.
- **Allergener:** de 14 som før (`PUT /me/allergens`).
- **Matvarer jeg ikke tåler:** søk i ingredienslisten, høyst 50 (`PUT /me/avoided-ingredients`). Valgte matvarer
  vises som en liste med «Fjern».
- **Deling:** én bryter per husholdning (`share_allergens`), med tekst om at den gjelder både allergener og matvarer,
  at andre ser *hva* som er registrert, men ikke *hvem*, at det likevel kan skjønnes i en liten husholdning, og at
  den kan slås av når som helst. Av som standard (avgjørelse 3).
- **Oppfordring:** har husholdningen flere medlemmer, og brukeren har registrert noe uten å dele, står det: «Det
  du har registrert, deles ikke med husholdningen. De andre får ikke varsel om det.»
- Teksten sier at opplysningene er frivillige, bare brukes til varsler i appen og slettes med kontoen.

### FR-ALG-002 Varsler for matvarer
- En oppskrift **inneholder** en matvare når en ingredienslinje har den ingrediensen (også valgfrie og
  basisvarer). Fritekst teller ikke.
- Svarene får `ingredientWarnings` (egne) og `householdIngredientWarnings` (delt av andre nåværende medlemmer, minus
  egne). Begge er lister med ingrediensnavn.
- **Listen:** oppskrifter med egne eller delte allergener **eller** matvarer skjules som standard, med samme bryter
  som før («Vis oppskrifter med registrerte allergier»).
- **Merkelapper:** «Inneholder kiwi (registrert av deg)» og «Inneholder kiwi (registrert i husholdningen)». Aldri
  navn.
- Gjelder oppskriftslisten, oppskriften, måltidsplanen (oppføringer og velgeren) og middagskortet på forsiden.

### FR-ALG-003 Fritekst er ikke sjekket
- Har oppskriften fritekstlinjer, viser oppskriften og allergenboksen: «N linjer er fritekst og er ikke sjekket mot
  allergiene.» (`freeTextCount` i svaret.)
- Forbeholdet fra fase 5 vises som før. `locales.test.ts` stopper fortsatt «fri for», «allergenfri» osv.

### Personvern
- Matvarer man ikke tåler, kan avsløre helse og behandles som allergiene (GDPR art. 9): frivillig, slettes med
  kontoen (CASCADE), tas med i eksporten (`avoidedIngredients`), og deles bare når brukeren har slått på delingen.
  Behandlingsgrunnlaget er ikke vurdert av teamet.
- Innholdet kommer aldri i logger eller feilmeldinger. `logs.security.api.test.ts` sjekker det.

## Del 3: Priser på oppskrifter

### Priser: det som er undersøkt (lest av KI 2026-10-30)
Lest: [kassal.app/api/faq](https://kassal.app/api/faq) og [kassal.app/api/docs](https://kassal.app/api/docs). Se
[integrations/kassalapp.md](../integrations/kassalapp.md#søk-etter-navn-lest-2026-10-30).

- `GET /products?search=` (fuzzy-søk i navn) er tilgjengelig på Hobby: «Begge nivåene har tilgang til alle
  endepunkter».
- Søkeord logges hos Kassalapp: «Søkeord og strekkoder inngår i loggen.»
- Vilkårene sier ingenting om å bruke søketreff til prisanslag eller automatisk kobling.
- Et søk på «melk» gir mange forskjellige produkter. Å velge ett er gjetning (grunnen til at ADR-0020 forkastet
  fritekst).
- Rema 1000, Kiwi og Coop er ikke med uansett.

**Avgjørelse 5:** søk etter navn bygges ikke. Et senere alternativ er at teamet kobler hver ingrediens til
kontrollerte referanse-GTIN-er.

### FR-PRICE-007 Prisanslag på en oppskrift
- `GET /households/:householdId/recipes/:recipeId/price-estimate`. Kortet på oppskriftssiden lastes etter
  oppskriften. Gjelder oppskriftens egne porsjoner.
- **Per ingredienslinje** (ikke fritekst, ikke basisvarer, ikke linjer uten mengde):
  1. **Egen pris:** varer i husholdningen som er koblet til ingrediensen (manuell kobling eller navnet, fase 5).
     Det nyeste partiet med pris. Er partiets mengde i samme grunnenhet som linjen: `scalePriceOre(pris, linjens
     mengde, partiets mengde)`, merket «andel av det dere betalte ‹dato›». Annen enhet gir ingen egen pris.
  2. **Kassalapp:** ferske observasjoner som allerede er lagret, for strekkoder husholdningen har lagt på de samme
     varene. Nedre median, skalert med pakningsstørrelsen. **Ingen nye kall til Kassalapp.**
  3. Ellers ingen pris, med årsak: `noMatch` (ikke i matlageret), `noPrice` (ingen pris) eller `unitMismatch`.
- **Hoppet over:** fritekst (`freeText`), basisvarer (`staple`) og linjer uten mengde (`noAmount`) får ikke pris og
  telles for seg.
- **Kortet:** «Anslag for X av Y ingredienser: ca. Z kr», hvor mange som mangler pris, hvor mange som er fra egne kjøp
  og fra Kassalapp, og at basisvarer og fritekst ikke er med. Ordene «Totalt», «Koster» og «Pris for oppskriften»
  brukes aldri. Uten noen anslag: «Ingen av ingrediensene har pris ennå.»
- Kortet sier alltid at eksterne priser gjelder kjeden, at tilbud og medlemspriser ikke er med, og at Rema 1000,
  Kiwi og Coop ikke er med. Uten `KASSALAPP_API_KEY` står det at eksterne priser er slått av.
- **Et anslag er ikke en utgift** (FR-PRICE-005): ingenting skrives.
- Egne priser er husholdningsdata: en annen husholdning får 404 (FR-REC-009).

## Datamodell (migrering `household_recipes`)

| Endring | Merknad |
|---|---|
| `recipe_source` + `household` | |
| `recipes.household_id` | uuid, nullable, CASCADE. Indeks. `@@unique([id, household_id])`. |
| `recipes.created_by` | uuid, nullable, SET NULL |
| `recipes.version` | int, standard 1 |
| `recipes.dedupe_key` | nullable, unik per husholdning |
| `recipes.slug`, `recipes.license` | nullable |
| CHECK `recipes_household_source` | `(source = 'household') = (household_id IS NOT NULL)` |
| CHECK `recipes_household_fields` | egne: ingen slug, lisens, forfattere, kildefelt eller `reviewed_by`. Andre: slug, lisens og forfattere påkrevd |
| `recipe_ingredients.ingredient_id` | nullable |
| `recipe_ingredients.household_id` | nullable, fylles av triggeren `recipe_ingredients_household` fra oppskriften |
| `recipe_ingredients.input_amount`, `input_unit` | det brukeren skrev, bare for egne oppskrifter |
| CHECK `recipe_ingredients_free_text` | `ingredient_id IS NOT NULL OR (household_id IS NOT NULL AND quantity_base IS NULL)` |
| Trigger `recipe_household_guard` | på `meal_plan_entries` og `shopping_list_item_recipes`: oppskriften må være global eller i samme husholdning |
| `user_avoided_ingredients` | `(user_id, ingredient_id)`, CASCADE fra brukeren, RESTRICT fra ingrediensen (seed beholder den) |

## API
Se [api-documentation.md](../api-documentation.md).

| Metode og sti | Hva |
|---|---|
| `POST /households/:id/recipes` | Ny egen oppskrift (201, eller 200 ved gjentatt `clientRequestId`) |
| `GET /households/:id/recipes/:recipeId/edit` | Skjemadataene til en egen oppskrift (404 for globale) |
| `PUT /households/:id/recipes/:recipeId` | Endre (med `version`) |
| `DELETE /households/:id/recipes/:recipeId` | Slette (204) |
| `GET /households/:id/recipes/:recipeId/price-estimate` | Prisanslag |
| `GET/PUT /me/avoided-ingredients` | Matvarer brukeren ikke tåler |

`GET /ingredients` får `units` (enhetene ingrediensen kan skrives i).

## Utenfor fasen
Forslag til nye ingredienser fra brukere, bilder på oppskrifter, offentlige oppskrifter, deling av oppskrifter mellom
husholdninger, søk etter navn hos Kassalapp, «hele pakker du må kjøpe», pris per porsjon.

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md) og
[vedlegg-sporbarhet.md](../../academic/vedlegg-sporbarhet.md).
