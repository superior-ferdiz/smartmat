# API-dokumentasjon

**Status:** Fase 2 (2026-10-20). Skrevet av KI (Claude), ikke gjennomgått av teamet. Se
[ADR-0002](architecture-decisions/0002-fastify-rest-api.md) og
[fasespesifikasjon 02](requirements/02-database-og-autentisering.md).

Alle endepunkter ligger under `/api/v1`. Forespørsler og svar er JSON. Skjemaene ligger i `packages/shared`
(`src/schemas/` for inn, `src/api/` for ut) og brukes av både API-et og web-appen.

## Felles regler

| Regel | Detaljer |
|---|---|
| Innlogging | Cookien `smartmat_session` (HttpOnly, Secure, SameSite=Lax). Nettleseren sender den automatisk. |
| Origin | POST, PATCH og DELETE må ha `Origin` fra `APP_ORIGINS`, ellers 403 `errors.security.forbiddenOrigin` |
| CSRF | POST, PATCH og DELETE med sesjon må ha `X-CSRF-Token` lik `csrfToken` fra `/auth/session`, ellers 403 `errors.security.invalidCsrf` |
| Validering | Ugyldig input gir 400 `errors.validation` med `fields`, der hver verdi er en i18n-nøkkel. Ukjente felt fjernes. |
| Feilformat | `{ "error": { "code": "<i18n-nøkkel>", "fields"?: { "<felt>": "<i18n-nøkkel>" } } }` |
| Ikke innlogget | 401 `errors.auth.unauthenticated` |
| Rate limit | 429 `errors.rateLimited` med `Retry-After` |
| Ukjent rute eller ingen tilgang | 404 `errors.notFound` |
| Uventet feil | 500 `errors.internal`, uten detaljer |

## Typer

```ts
SessionUser = { id: uuid, email: string, displayName: string, locale: 'nb-NO' | 'en', householdId: uuid }
SessionResponse = { user: SessionUser, csrfToken: string }
HouseholdResponse = { id: uuid, name: string, role: 'owner' | 'member', memberCount: number }
```

## Endepunkter

### `POST /auth/register` (FR-AUTH-001)
- **Kropp:** `{ displayName, email, password, locale? }`. Navnet er 1–50 tegn, passordet 12–128 tegn.
- **Svar:** `201 SessionResponse` og `Set-Cookie`. Brukeren, husholdningen og eiermedlemskapet opprettes i én
  transaksjon.
- **Feil:** 400 validering, 409 `errors.auth.emailTaken` (også i `fields.email`), 429.
- **Rate limit:** 10 per time per IP.

### `POST /auth/login` (FR-AUTH-002/003)
- **Kropp:** `{ email, password }`
- **Svar:** `200 SessionResponse` og `Set-Cookie`. Alltid ny sesjon. En eventuell gammel sesjon i samme nettleser
  slettes.
- **Feil:** 401 `errors.auth.invalidCredentials`. Gjelder både ukjent e-post, feil passord og sperret konto
  (5 feil gir 15 minutters sperre). 429.
- **Rate limit:** 20 per 15 min per IP.

### `POST /auth/logout`
- **Svar:** `204` og fjernet cookie. Med gyldig sesjon kreves CSRF-token. Uten sesjon svarer API-et likevel 204.

### `GET /auth/session`
- **Svar:** `200 SessionResponse`, eller 401 hvis ingen er innlogget.

### `GET /me` · `PATCH /me` (FR-AUTH-004)
- **GET:** `200 SessionUser`
- **PATCH kropp:** `{ displayName?, locale? }`, minst ett av feltene. Svaret er `200 SessionUser`.

### `POST /me/password` (FR-AUTH-004)
- **Kropp:** `{ currentPassword, newPassword }`
- **Svar:** `204`. Alle *andre* sesjoner for brukeren slettes.
- **Feil:** 400 `errors.auth.wrongPassword` (i `fields.currentPassword`), 429.
- **Rate limit:** 10 per 15 min per IP.

### `DELETE /me` (FR-AUTH-005)
- **Kropp:** `{ password }`
- **Svar:** `204` og fjernet cookie. Sletter brukeren, sesjonene, medlemskapene og husholdninger der brukeren er
  eneste medlem.
- **Feil:** 400 `errors.auth.wrongPassword` (i `fields.password`), 429.
- **Rate limit:** 10 per 15 min per IP.

### `GET /households/:householdId` (NFR-SEC-001)
- **Krever:** innlogging og medlemskap i husholdningen.
- **Svar:** `200 HouseholdResponse`. Er brukeren ikke medlem, eller finnes husholdningen ikke, svarer API-et `404`
  i begge tilfeller.

### `GET /health`
- **Svar:** `200 { "status": "ok" }` når databasen svarer.

## Matlager (fase 3)

**Status:** Fase 3 (2026-10-21). Skrevet av KI (Claude), ikke gjennomgått av teamet. Se
[fasespesifikasjon 03](requirements/03-matlager.md).

Alle ruter under `/households/:householdId/` krever innlogging og medlemskap i husholdningen. Vare-, parti- og
steds-ID-er slås opp *innenfor* husholdningen. En ID fra en annen husholdning gir 404 (eller 400 som feltfeil
når den står i forespørselens kropp), og ingenting blir endret.

### Typer

```ts
LocationResponse = { id, kind: 'fridge'|'freezer'|'pantry'|'other', name: string | null, batchCount }
BatchResponse = { id, quantityBase, initialQuantityBase, locationId, expiryKind: 'best_before'|'use_by'|null,
                  expiryDate: 'YYYY-MM-DD'|null, priceOre|null, purchasedOn|null,
                  purchaseId|null /* fase 4: kjøpet partiet kom fra */, createdAt }
ItemResponse = { id, name, categoryKey, unit: 'g'|'ml'|'stk', createdAt, batches: BatchResponse[] }  // bare partier med noe igjen
HistoryEvent = { id, type, deltaBase, batchId|null, fromLocationId|null, toLocationId|null, actorName|null, createdAt,
                 revertsEventId|null, revertedType|null, wasteReason|null, wasteValueOre|null, wasteValueBasis|null, undone }
```

Mengder er alltid heltall i grunnenhet (g, ml, stk) og beløp er heltall i øre (ADR-0006).

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/categories` (offentlig) | – | `[{ key }]` | – |
| GET | `/households/:h/locations` | – | `LocationResponse[]` | |
| POST | `/households/:h/locations` | `{ name, kind? }` | 201 `LocationResponse` | 400 |
| PATCH | `/households/:h/locations/:locationId` | `{ name }` | `LocationResponse` | 404 |
| DELETE | `/households/:h/locations/:locationId` | – | 204 | 404, 409 `locationNotEmpty`, 409 `lastLocation` |
| GET | `/households/:h/inventory` | – | `{ items: ItemResponse[] }` | |
| GET | `/households/:h/inventory/waste-summary` | – | `{ month, count, knownValueOre, unknownValueCount }` | |
| POST | `/households/:h/inventory/items` | `{ name, categoryKey, unit, batch }` | 201 `ItemResponse` | 400 (også `batch.locationId: validation.location.notFound`) |
| GET | `/households/:h/inventory/items/:itemId` | – | `ItemResponse` | 404 |
| PATCH | `/households/:h/inventory/items/:itemId` | `{ name?, categoryKey? }` | `ItemResponse` | 400, 404 |
| DELETE | `/households/:h/inventory/items/:itemId` | – | 204 | 404 |
| POST | `/households/:h/inventory/items/:itemId/batches` | `{ quantityBase, locationId, expiry?, priceOre?, purchasedOn? }` | 201 `ItemResponse` | 400, 404 |
| GET | `/households/:h/inventory/items/:itemId/history` | – | `{ events: HistoryEvent[], undoableEventId }` | 404 |
| POST | `/households/:h/inventory/items/:itemId/undo` | – | `ItemResponse` | 404, 409 `nothingToUndo`, 409 `cannotUndo` |
| PATCH | `/households/:h/inventory/batches/:batchId` | `{ quantityBase?, locationId?, expiry?, priceOre?, purchasedOn? }` | `ItemResponse` | 400, 404, 409 `changedMeanwhile` |
| DELETE | `/households/:h/inventory/batches/:batchId` | – | `ItemResponse` | 404 |
| POST | `/households/:h/inventory/batches/:batchId/consume` | `{ quantityBase }` | `ItemResponse` | 404, 409 `notEnough` |
| POST | `/households/:h/inventory/batches/:batchId/discard` | `{ quantityBase, reason, valueOre? }` | `ItemResponse` | 404, 409 `notEnough` |

- `expiry` er `{ kind: 'best_before'|'use_by', date: 'YYYY-MM-DD' }` eller `null`.
- `reason` er en av `expired`, `spoiled`, `leftovers`, `tooMuch` og `other`.
- Ved `PATCH` på et parti gir ny `quantityBase` en hendelse av typen `adjust`, og ny `locationId` en hendelse av
  typen `move`.

## Kjøp og budsjett (fase 4)

**Status:** Fase 4 (2026-10-21). Skrevet av KI (Claude), ikke gjennomgått av teamet. Se
[fasespesifikasjon 04](requirements/04-kjop-og-budsjett.md).

Samme regler som for matlageret: alle ruter ligger under `/households/:householdId/`, krever innlogging og
medlemskap, og kjøps-, linje-, vare- og steds-ID-er slås opp innenfor husholdningen. Et kjøp i en annen husholdning
gir 404. En vare eller et sted fra en annen husholdning i kroppen gir 400 med feltfeil. I begge tilfeller blir
ingenting endret.

### Typer

```ts
PurchaseLineInput = { id? /* bare ved retting */, description, kind: 'food'|'nonFood', categoryKey? /* påkrevd for mat */,
                      amountOre, toInventory?: { itemId? | unit?, quantityBase, locationId, expiry? } | null }
PurchaseResponse = { id, storeName|null, purchasedOn: 'YYYY-MM-DD', totalOre, source: 'manual', createdAt, updatedAt,
                     lines: [{ id, position, description, kind, categoryKey|null, amountOre,
                               batch: { id, itemId, itemName, untouched } | null }] }
PurchaseListItem = { id, storeName|null, purchasedOn, totalOre, lineCount, batchCount }
BudgetSummary = { month: 'YYYY-MM', budgetOre|null, spentOre, remainingOre|null, usedPercent|null,
                  byCategory: [{ categoryKey, amountOre }], unallocatedOre, nonFoodOre, purchaseCount }
```

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/households/:h/purchases?month=YYYY-MM` | – | `{ month, purchases: PurchaseListItem[] }` | 400 `validation.month.invalid` |
| POST | `/households/:h/purchases` | `{ storeName?, purchasedOn, lines? \| totalOre?, clientRequestId? }` | 201 `PurchaseResponse` (200 hvis `clientRequestId` er brukt før) | 400, 409 `errors.purchase.changedMeanwhile` |
| GET | `/households/:h/purchases/:purchaseId` | – | `PurchaseResponse` | 404 |
| PUT | `/households/:h/purchases/:purchaseId` | `{ storeName?, purchasedOn, lines? \| totalOre?, removeUntouchedBatches? }` | `PurchaseResponse` | 400, 404, 409 |
| DELETE | `/households/:h/purchases/:purchaseId?removeUntouchedBatches=true\|false` | – | `{ removedBatches, keptBatches }` | 404 |
| GET | `/households/:h/budget` | – | `{ amountOre\|null, validFrom\|null }` (inneværende måned) | |
| PUT | `/households/:h/budget` | `{ amountOre: number \| null }` | `{ amountOre, validFrom }` | 400 |
| GET | `/households/:h/budget/summary?month=YYYY-MM` | – | `BudgetSummary` | 400 |

- Et kjøp har **enten** linjer **eller** `totalOre`. Med linjer regner serveren totalsummen, og en totalsum fra
  klienten gir 400 (`validation.purchase.totalWithLines`).
- `purchasedOn` kan ikke være senere enn i dag i norsk tid (`validation.purchase.dateInFuture`).
- Uten `month` brukes inneværende måned i norsk tid.
- `toInventory` lager et parti i samme transaksjon som kjøpet: på varen `itemId`, eller på en ny vare med linjens
  beskrivelse som navn (da kreves `unit`). Partiet får linjens beløp som pris og kjøpsdatoen.
- Ved retting: linjer med kjent `id` oppdateres, linjer som mangler slettes, og linjer uten `id` er nye. En `id` som
  ikke hører til kjøpet, gir `lines.N.id: validation.purchase.unknownLine`.
- `removeUntouchedBatches` (standard `true`) gjelder partier fra linjer som slettes, og fra kjøpet når det slettes.
  Urørte partier fjernes. Andre partier blir alltid værende, og koblingen til kjøpet blir tom.
- Budsjettet settes fra den første i inneværende måned. `null` fjerner det fra og med denne måneden.

## Oppskrifter og allergier (fase 5)

Oppskrifter og ingredienser er **globale** og bare lesbare: de legges inn med `npm run db:seed` (spesifikasjon 05),
og det finnes ingen endepunkter som skriver dem. Rangeringen bruker matlageret til husholdningen i URL-en og
allergiene til den innloggede brukeren, så oppskriftene ligger under `/households/:householdId/` med samme
autorisasjon som matlageret. En annen husholdnings id gir 404. Allergiene ligger under `/me` og tar alltid brukeren
fra sesjonen.

### Typer

```ts
Allergen = 'gluten'|'crustaceans'|'egg'|'fish'|'peanuts'|'soy'|'milk'|'nuts'|'celery'|'mustard'|'sesame'|'sulphites'|'lupin'|'molluscs'
ScoreReason = { code: 'coverage', points, enough, partial, required } | { code: 'nothing', points: 0 }
            | { code: 'expiring', points: 10, ingredientName, itemName, expiryKind, daysLeft }
            | { code: 'missing', points: 0, names: string[] }
RecipeSummary = { id, slug, title, description, servings, prepMinutes, cookMinutes, tags, source: 'team'|'test',
                  ingredientNames, allergens: Allergen[], allergenWarnings: Allergen[] /* brukerens */,
                  score: { total, coverage, expiringBonus, requiredCount, enoughCount, partialCount, missingCount,
                           reasons: ScoreReason[] } }
RecipeLine = { position, ingredientId, ingredientName, displayText, quantityBase|null, baseUnit, optional,
               status: 'enough'|'notEnough'|'unknownAmount'|'missing'|'staple', haveBase|null, missingBase|null,
               approximate, itemNames, expiring: { itemName, expiryKind, daysLeft }|null, excludedUseByItems,
               allergens: Allergen[] }
RecipeDetail = RecipeSummary & { steps, license, authors, lines: RecipeLine[], userAllergens: Allergen[] }
Ingredient = { id, key, name, baseUnit, isStaple, categoryKey|null /* fra fase 6 */, aliases: string[] }
```

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/households/:h/recipes` | – | `{ recipes: RecipeSummary[] /* best først */, userAllergens }` | 404 |
| GET | `/households/:h/recipes/:recipeId` | – | `RecipeDetail` | 400 (ikke UUID), 404 |
| GET | `/ingredients` | – | `Ingredient[]` | 401 |
| GET | `/me/allergens` | – | `{ allergens: Allergen[] }` | 401 |
| PUT | `/me/allergens` | `{ allergens: Allergen[] }` | `{ allergens }` (fast rekkefølge) | 400 `validation.allergen.unknown` / `.duplicate` |
| PATCH | `/households/:h/inventory/items/:itemId` | `{ ingredient: { match: 'auto' } \| { match: 'none' } \| { match: 'manual', ingredientId } }` (sammen med eller uten `name`/`categoryKey`) | `ItemResponse` | 400 `ingredient.ingredientId: validation.ingredient.unknown`, 404 |

- `ItemResponse` har nå `ingredientMatch` (`auto`/`manual`/`none`) og `ingredientId` (bare ved `manual`).
- Listen er sortert etter poengsum, så færrest manglende, så tittel. Søk, tagg og skjuling på grunn av allergener
  gjøres i nettleseren (som i matlageret), fordi listen er liten. Planen nevnte spørreparametere for dette. Se
  «Avvik» i spesifikasjon 05.
- Partier med passert siste forbruksdag regnes aldri med. De står i `excludedUseByItems`.

## Handleliste (fase 6)

Én liste per husholdning (spesifikasjon 06, avgjørelse 1). Alle ruter ligger under
`/households/:householdId/shopping-list` med `requireAuth` og `householdAccess`. Linjer, varer og steder slås opp
innenfor husholdningen. En id fra en annen husholdning gir 404 (eller 409/400 i `to-inventory`), og ingenting endres.

### Typer

```ts
ShoppingQuantity = { quantityBase: number /* heltall > 0 i grunnenhet */, unit: 'g'|'ml'|'stk' } | null
ShoppingItem = { id, text, ingredientId|null, quantityBase|null, unit|null, checked, checkedAt|null, createdAt,
                 recipes: { recipeId, title, quantityBase|null }[] /* oppskriftsbidrag */ }
StockTarget = { kind: 'existing', itemId } | { kind: 'new', name, categoryKey, unit }
StockLine = { shoppingItemId, target: StockTarget, quantityBase /* i målvarens enhet */, locationId,
              expiry?: { kind: 'best_before'|'use_by', date } | null }
```

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/households/:h/shopping-list` | – | `{ items: ShoppingItem[] }` (åpne først, så avhukede) | 404 |
| POST | `/households/:h/shopping-list/items` | `{ text, quantity?: ShoppingQuantity, clientRequestId?: uuid }` | 201 `{ item, similarItemId\|null }`, 200 ved gjentatt `clientRequestId` | 400 `validation.shoppingText.*`, `validation.quantity.*` |
| PATCH | `/households/:h/shopping-list/items/:itemId` | minst ett av `{ text, quantity (null fjerner), checked }` | `ShoppingItem` | 400, 404, 409 `errors.shopping.alreadyOnList` |
| DELETE | `/households/:h/shopping-list/items/:itemId` | – | 204 | 404 |
| POST | `/households/:h/shopping-list/clear-checked` | – | `{ removed }` | 404 |
| POST | `/households/:h/shopping-list/from-recipe/:recipeId` | `{ lines: { ingredientId, quantityBase\|null }[] }` (1–100, ingen ingrediens to ganger) | `{ created, merged, skipped }` | 400 `lines.N.ingredientId: validation.shopping.notInRecipe`, 404 |
| POST | `/households/:h/shopping-list/to-inventory` | `{ lines: StockLine[] }` (1–100) | `{ added, itemIds }` | 400 `lines.N.locationId` / `lines.N.target.itemId`, 409 `errors.shopping.changedMeanwhile` |

- `checked` **settes** (sann eller usann), og byttes aldri. Samme forespørsel to ganger gir samme resultat.
- `from-recipe`: teksten blir ingrediensens navn og enheten ingrediensens grunnenhet. En åpen linje for samme
  ingrediens får bidraget (mengder i samme enhet legges sammen). Er oppskriften allerede registrert på linjen,
  telles linjen som `skipped`.
- `to-inventory`: én transaksjon. Linjene slettes først med krav om at de er avhuket. Blir det slettet færre enn
  sendt, rulles alt tilbake (409). Partiene får ingen pris og ingen kjøpskobling (ADR-0007, avgjørelse 4). En ny vare
  får `ingredient_match = manual` når navnet ikke selv treffer linjens ingrediens.


## Strekkoder (fase 7)

Spesifikasjon [07](requirements/07-strekkode.md), ADR-0014. Begge rutene ligger under
`/households/:householdId/barcodes/:gtin` med `requireAuth` og `householdAccess`. `:gtin` valideres og normaliseres
med de samme reglene som skjemaet (`gtinSchema`). En ugyldig kode gir 400 med feltfeil `gtin`
(`validation.barcode.*`), og sendes aldri videre til Open Food Facts. I loggen står koden som `[gtin]`.

### Typer

```ts
ScanSuggestion = { name|null, brand|null, categoryKey|null, unit: 'g'|'ml'|'stk'|null, quantityBase|null,
                   ingredient: { match: 'auto'|'manual'|'none', ingredientId|null }|null, // bare fra husholdningen
                   locationId|null, expiryKind: 'best_before'|'use_by'|null }            // datoen fylles aldri ut
BarcodeLookup = { gtin, storeCode: boolean, source: 'household'|'openFoodFacts'|'none',
                  providerStatus: 'notAsked'|'found'|'notFound'|'unavailable',
                  suggestion: ScanSuggestion, existingItem: { id, name, unit }|null }
ConfirmScan = { mode: 'newItem', clientRequestId: uuid, name, categoryKey, unit, ingredient: ItemIngredient,
                batch: BatchInput }
            | { mode: 'existingItem', clientRequestId: uuid, itemId, batch: BatchInput }
```

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/households/:h/barcodes/:gtin` | – | `BarcodeLookup`. Lagrer ingenting for husholdningen. | 400 `gtin`, 404, 429 (30 per bruker og minutt) |
| POST | `/households/:h/barcodes/:gtin/confirm` | `ConfirmScan` | 201 `{ item }`, 200 ved gjentatt `clientRequestId` | 400 `batch.locationId`, `ingredient.ingredientId`, `validation.*`; 404 (vare som ikke finnes i husholdningen), 409 `errors.inventory.changedMeanwhile` |

- **Rekkefølge for oppslaget:**
  1. Butikkens egen kode slås ikke opp (`notAsked`).
  2. Husholdningens svar (`source: household`).
  3. Mellomlageret: treff i 30 dager, «fant ingenting» i 24 timer.
  4. Open Food Facts.

  Svarer ikke OFF (tidsavbrudd 3 s, HTTP-feil, ugyldig svar, serverens egen grense på 10 i minuttet), blir det
  `unavailable`, eller et gammelt treff fra mellomlageret hvis det finnes. Feil lagres aldri.
- **`confirm`:** én transaksjon. Den lager vare og parti (med hendelsen `add` og `dedupe_key = scan:<clientRequestId>`)
  eller et nytt parti på `itemId`, og lagrer svarene i `household_barcodes`. Butikkens egne koder huskes ikke.

## Kvitteringer (fase 8)

Spesifikasjon [08](requirements/08-kvittering.md), ADR-0011 og ADR-0017. Alle rutene ligger under
`/households/:householdId/receipts` med `requireAuth` og `householdAccess`. En kvittering i en annen husholdning
gir 404. API-et tar imot bildet og legger kvitteringens id i køen (pg-boss). Workeren (`npm run worker -w
@smartmat/api`) leser bildet med Tesseract.

### Typer

```ts
ReceiptSummary  = { id, status: 'queued'|'processing'|'review'|'failed'|'confirmed',
                    failureCode: 'timeout'|'unavailable'|'invalidResponse'|'noText'|null,
                    createdAt, deleteAfter }                       // deleteAfter = opplasting + 7 dager
ParsedLine      = { description, amountOre|null, kind: 'item'|'deposit', discountOre, count|null, weightG|null,
                    unitPriceOre|null, vatRate|null, suggestedKind: 'food'|'nonFood', confidence: 0–100,
                    flags: ('lowConfidence'|'noAmount'|'amountFromQuantity'|'quantityMismatch'|'discountApplied')[],
                    uncertain: boolean }
ReceiptSuggestion = { storeName|null, chain|null, purchasedOn|null, totalOre|null,
                      linesShown: boolean, lines: ParsedLine[],   // tom når linjeforslag er av (ADR-0017)
                      linesSumOre, sumMatches: boolean }
Receipt         = ReceiptSummary & { purchaseId|null, suggestion: ReceiptSuggestion|null,
                                     rawText: string[]|null,       // bare i review, uten betalingslinjer
                                     meanConfidence|null }
ReceiptList     = { ocrAvailable: boolean, lineSuggestions: boolean, receipts: ReceiptSummary[] }
ConfirmReceipt  = { storeName|null, purchasedOn, lines: PurchaseLineInput[] | totalOre,   // som POST /purchases
                    allowPossibleDuplicate?: boolean }
```

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/households/:h/receipts` | – | `ReceiptList` (åpne kvitteringer, ikke utløpte) | 404 |
| POST | `/households/:h/receipts` | `multipart/form-data`, ett felt `image` (JPEG, PNG eller WebP) | 202 `ReceiptSummary` | 400 `image`, `errors.receipt.unreadable`; 409 `alreadyUploaded` (+ `refId`); 413 `tooLarge` (> 10 MB eller > 40 MP); 415 `unsupportedType`; 429 (10 per bruker og time); 503 `busy` (20 i kø) eller `ocrUnavailable` |
| GET | `/households/:h/receipts/:id` | – | `Receipt` | 404 (også etter fristen) |
| GET | `/households/:h/receipts/:id/image` | – | `image/jpeg`, `Cache-Control: no-store, private` | 404 (bekreftet, forkastet eller utløpt) |
| POST | `/households/:h/receipts/:id/confirm` | `ConfirmReceipt` | 201 kjøp (`source: receipt`), 200 hvis kvitteringen er bekreftet før | 400 som kjøp; 409 `notReady`, `duplicate` (+ `refId`), `possibleDuplicate` (+ `refId`) |
| POST | `/households/:h/receipts/:id/retry` | – | 202 `ReceiptSummary` | 409 `cannotRetry` (ikke `failed`) |
| DELETE | `/households/:h/receipts/:id` | – | 204 | 409 `alreadyConfirmed` |

- **`refId` i feilsvaret** (nytt i fase 8): id-en til raden konflikten gjelder, for eksempel kjøpet en kvittering
  ligner. Bare id-er, aldri innhold. `{ "error": { "code": "errors.receipt.duplicate", "refId": "…" } }`.
- **Opplasting:** filtypen avgjøres av de første bytene. Bildet skrives om (rettes opp, all metadata fjernes,
  høyst 3000 piksler, JPEG) før det lagres. Samme bildefil i en åpen kvittering i samme husholdning gir 409.
- **`confirm`:** én transaksjon. Kjøp, linjer, partier og hendelser lagres som i `POST /purchases`. Kvitteringen
  settes til `confirmed`, og bilde og uttrekk slettes. Med kvitteringsnummer og klokkeslett får kjøpet
  `dedupe_key = receipt:<sha256>`, ellers `receipt-id:<kvitterings-id>` og en sjekk mot kjøp med samme dato og sum.
- **Logger:** ingen tekst, beløp eller butikk fra kvitteringen. Workeren logger id, utfall og varighet. Fra fase 8
  logges URL-er uten spørrestreng.

## Oppskrifter fra åpne kilder og måltidsplan (fase 9)

Se [spesifikasjon 09](requirements/09-maltidsplan.md). Alle ruter krever innlogging og medlemskap i husholdningen.
En fremmed husholdning eller en oppføring fra en annen husholdning gir 404.

### Endringer i eksisterende svar
- `RecipeSummary` (og `RecipeDetail`) har `origin`: `null` for teamets og testoppskriftene, ellers
  `{ title, url, license, retrievedOn, adaptation, adaptationNote, aiAssisted, reviewedBy, reviewedOn }`
  (ADR-0016). `source` kan være `external`.
- `GET /households/:h/recipes?for=YYYY-MM-DD` rangerer for en planlagt dag: partier med siste forbruksdag før dagen
  regnes ikke med. En dag som har vært, rangeres som i dag (FR-PLAN-005).
- `ShoppingItem` har `meals: { entryId, date, meal, title, quantityBase }[]`: hva planlagte måltider la på linjen.

### Typer
```ts
type Meal = 'breakfast' | 'lunch' | 'dinner';
MealEntry = { id, date, meal: Meal, kind: 'recipe' | 'note', recipeId: string | null, recipeTitle: string | null,
              recipeServings: number | null, servings: number | null, note: string | null,
              allergenWarnings: Allergen[], createdAt }
CreateMealEntry = { date, meal, clientRequestId?: uuid }
                  & ({ kind: 'recipe', recipeId, servings: 1–50 } | { kind: 'note', note: 1–100 tegn })
UpdateMealEntry = { date?, meal?, servings?, note? }      // minst ett felt
MealPlanNeeds = { from, to, recipeEntryCount, ingredients: IngredientNeed[], suggestions: PlanSuggestion[],
                  unplannedExpiring: { itemId, itemName, expiryKind, expiryDate, daysLeft }[] }
AddPlanToShopping = { from, to, lines: { ingredientId, quantityBase: number | null }[] }   // 1–100 linjer
```

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/households/:h/meal-plan?from=&to=` | – | `{ from, to, entries: MealEntry[] }` (dato, måltid, rekkefølge) | 400 (høyst 42 dager, `from` ≤ `to`) |
| POST | `/households/:h/meal-plan/entries` | `CreateMealEntry` | 201 `MealEntry`, 200 ved gjentatt `clientRequestId` | 400 (`recipeId` → `validation.mealPlan.recipeNotFound`); 409 `errors.mealPlan.dayFull` (20 per dag) |
| PATCH | `/households/:h/meal-plan/entries/:id` | `UpdateMealEntry` | `MealEntry` | 400 `servings` på fritekst / `note` på oppskrift; 404; 409 `dayFull` |
| DELETE | `/households/:h/meal-plan/entries/:id` | – | 204 | 404 |
| GET | `/households/:h/meal-plan/needs?from=&to=` | – | `MealPlanNeeds` (fra i dag, dager som har vært telles ikke) | 400 |
| POST | `/households/:h/meal-plan/shopping` | `AddPlanToShopping` | `{ created, merged, skipped }` | 400 `lines.N.ingredientId` → `validation.mealPlan.notInPlan` |

- **`shopping`:** serveren regner behovet ut på nytt. For hver oppføring legges bare det til som mangler utover det
  oppføringen har lagt på listen før (`shopping_list_item_meals`). Samme forespørsel to ganger gir `skipped`.
  Listen låses (`FOR UPDATE`), og bidragene leses på nytt inne i transaksjonen.
- **Logger:** fritekst og titler kommer aldri i logger eller feilmeldinger.

| Variabel | Standard | Virkning |
|---|---|---|
| `RECIPES_INCLUDE_UNREVIEWED` | `true` | `false` skjuler eksterne oppskrifter som ingen i teamet har kontrollert (ADR-0016) |
| `WIKIMEDIA_CONTACT` | GitHub-profilen til repoet | Kontakt i User-Agent for importskriptet (bare skriptet bruker den) |

## Husholdning: invitasjoner, roller og deling (fase 10)

Se [spesifikasjon 10](requirements/10-husholdning.md) og [ADR-0018](architecture-decisions/0018-delte-husholdninger-og-invitasjoner.md).
Rutene under `/households/:h` krever innlogging og medlemskap (ikke medlem gir 404, som før). Eierhandlinger krever
i tillegg rollen `owner`. Et medlem får da 403 `errors.household.ownerOnly`.

### Endringer i eksisterende svar
- `SessionUser` (`GET /auth/session`, `/me`) har `householdRole` og `households: { id, name, role }[]`.
  `householdId` er den **aktive** husholdningen.
- `GET /households/:h` har `shareAllergens`: om den innloggede brukeren deler allergiene sine med husholdningen.
- `RecipeSummary` og `MealEntry` har `householdAllergenWarnings`, og oppskriftslisten og `RecipeDetail` har
  `householdAllergens`. Det er allergener som andre medlemmer deler, og som brukeren ikke har selv. Svaret sier
  aldri hvem.
- `ShoppingItem.createdBy`, `Purchase.createdBy`, `MealEntry.createdBy` og `HistoryEvent.actor` (erstatter
  `actorName`) er `CreatorRef`.

### Typer
```ts
type CreatorRef = { kind: 'member', displayName: string } | { kind: 'former' | 'unknown', displayName: null };
HouseholdMember = { userId, displayName, role: 'owner' | 'member', joinedAt, isYou }   // ingen e-post
Invitation = { id, createdAt, expiresAt, status: 'active' | 'used' | 'revoked' | 'expired',
               usedBy: CreatorRef | null }
InvitationPreview = { householdName, invitedBy: string | null, memberCount, expiresAt, alreadyMember }
```

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/households/:h/members` | – | `{ members: HouseholdMember[] }` (eldste først) | 404 |
| PATCH | `/households/:h/members/me` | `{ shareAllergens: boolean }` | `Household` | 404 |
| POST | `/households/:h/leave` | – | 204 | 409 `ownerMustTransfer` (eieren) |
| PATCH | `/households/:h` | `{ name: 1–100 tegn }` | `Household` | 400, 403 |
| DELETE | `/households/:h` | `{ password }` | 204 | 400 `wrongPassword`, 403, 429 |
| DELETE | `/households/:h/members/:userId` | – | 204 | 400 `cannotRemoveSelf`, 403, 404 |
| POST | `/households/:h/transfer-ownership` | `{ userId, password }` | 204 | 400 `wrongPassword` / `userId` → `notAMember`, 403, 429 |
| GET | `/households/:h/invitations` | – | `{ invitations: Invitation[] }` (siste 30 dager) | 403 |
| POST | `/households/:h/invitations` | – | 201 `{ invitation, token }` – tokenet vises bare her | 403, 409 `tooManyInvitations` (5 aktive) |
| DELETE | `/households/:h/invitations/:id` | – | 204 (også når den ikke er aktiv lenger) | 403, 404 |
| POST | `/invitations/preview` | `{ token }` | `InvitationPreview` | 400, 404 `invitationInvalid`, 429 |
| POST | `/invitations/accept` | `{ token }` | `{ householdId }` (nå aktiv) | 400, 404 `invitationInvalid`, 409 `alreadyMember` / `full` / `tooManyHouseholds`, 429 |
| PUT | `/me/active-household` | `{ householdId }` | `SessionUser` | 404 |

- **Token:** 32 tilfeldige byte i base64url (43 tegn). Bare SHA-256 lagres. Lenken er `<origin>/bli-med#<token>`,
  og tokenet sendes bare i kroppen til en POST. Ukjent, utløpt (48 timer), brukt og tilbaketrukket gir samme svar.
- **Grenser:** 10 forsøk per bruker og 30 per IP-adresse på 15 minutter for `preview` og `accept` til sammen.
  Høyst 10 medlemmer per husholdning og 5 husholdninger per bruker.
- **Låsing:** alle endringer i medlemskap låser husholdningsraden (`FOR UPDATE`). Samtidig bruk av samme invitasjon
  gir ett medlem.
- **Minst én husholdning:** den som står uten husholdning etter utmelding, fjerning eller sletting, får en ny og tom
  husholdning av én.

| Variabel | Standard | Virkning |
|---|---|---|
| `RATE_LIMIT_INVITATION_MAX` | 30 | `preview` + `accept` per IP-adresse på 15 minutter |
| `INVITATION_ATTEMPTS_PER_USER` | 10 | `preview` + `accept` per bruker på 15 minutter (i minnet) |

### Innstillinger for testmiljøet (ADR-0015)

| Variabel | Lokalt | Testmiljø | Virkning |
|---|---|---|---|
| `TRUST_PROXY` | tom (`false`) | `172.26.0.0/16` | `X-Forwarded-For` trodd bare fra dette nettet (rate limiting per klient) |
| `REGISTRATION_OPEN` | `true` | `false` | `POST /auth/register` svarer 403 `errors.auth.registrationClosed` |
| `COOKIE_HOST_PREFIX` | `false` | `true` | Sesjonscookien heter `__Host-smartmat_session` (krever `COOKIE_SECURE=true`) |
| `WEB_DIST_DIR` | tom | `/app/apps/web/dist` | API-et serverer webappen (én opprinnelse), CSP med `'wasm-unsafe-eval'` og hash av temaskriptet |
| `OFF_BASE_URL` / `OFF_USER_AGENT` | testmiljøet til OFF / tom (av) | `world.openfoodfacts.org` / kontaktadresse | Uten User-Agent er oppslag slått av |
| `OCR_PROVIDER` | `off` (eller `tesseract`) | `tesseract` | Av: opplasting gir 503 `ocrUnavailable`, og siden lenker til skjemaet |
| `OCR_TESSERACT_COMMAND` | `docker run --rm -i --network none smartmat-ocr timeout 55 tesseract` | `timeout 55 tesseract` | Hvordan workeren starter Tesseract (uten shell) |
| `RECEIPT_LINE_SUGGESTIONS` | `false` | `false` | ADR-0017: linjene foreslås ikke før en ny måling viser at beløpene holder |
| `RECEIPT_UPLOADS_PER_HOUR` / `RECEIPT_MAX_QUEUED` | 10 / 20 | 10 / 20 | Grense per bruker / for hele serveren |

Alle svar har `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()`.

## Svinnstatistikk og varsler (fase 11)

Se [spesifikasjon 11](requirements/11-svinn-og-varsler.md) og
[ADR-0019](architecture-decisions/0019-varsler-beregnes-ved-lesing.md). Rutene under `/households/:h` krever
innlogging og medlemskap (ikke medlem gir 404, som før). Ingen av dem krever rollen `owner`.

### Typer
```ts
WasteValue = { count, actualOre, estimatedOre, knownOre, unknownCount }   // knownOre = actual + estimated
WasteStats = WasteValue & {
  month: 'YYYY-MM', estimatedPercent: number | null,                    // floor(estimated × 100 / known)
  quantities: { unit: 'g' | 'ml' | 'stk', quantityBase }[],              // aldri lagt sammen på tvers
  byReason: (WasteValue & { reason, percent })[],                        // andel av antallet, største rest
  byCategory: (WasteValue & { categoryKey, percent })[],
  topItems: { itemId, name, unit, count, quantityBase, knownOre, unknownCount }[],   // høyst 5
  trend: (WasteValue & { month })[],                                     // 12 måneder, eldst først
}
Notification =
  | { kind: 'useBySoon' | 'useByToday' | 'useByPassed' | 'bestBeforeSoon' | 'bestBeforeToday',
      key, seen, itemId, itemName, expiryDate, daysLeft }
  | { kind: 'budgetNearlyUsed' | 'budgetExceeded', key, seen, month, usedPercent }
  | { kind: 'shoppingAdded', key, seen, count, texts: string[], addedBy: CreatorRef[], latestAt }
NotificationSettings = { useBy: boolean, bestBefore: boolean, daysBefore: 0–7, budget: boolean, shopping: boolean }
```

### Endepunkter

| Metode | Sti | Kropp | Svar | Feil |
|---|---|---|---|---|
| GET | `/households/:h/waste-stats?month=YYYY-MM` | – | `WasteStats` (standard: inneværende måned i norsk tid) | 400 (måned), 404 |
| GET | `/households/:h/notifications` | – | `{ items: Notification[], unseenCount }` (avviste er ikke med) | 404 |
| POST | `/households/:h/notifications/seen` | `{ keys: string[] }` (1–100) | `{ marked }` – nøkler som ikke er aktive, hoppes over | 400, 404 |
| POST | `/households/:h/notifications/dismiss` | `{ key }` | 204 (også en gang til) | 400, 404 `errors.notification.notFound` |
| POST | `/households/:h/shopping-list/seen` | – | 204 | 404 |
| GET | `/me/notification-settings` | – | `NotificationSettings` (standard uten rad) | 401 |
| PUT | `/me/notification-settings` | `NotificationSettings` | `NotificationSettings` | 400 |

- **Nøkkel:** `<type>:<detaljer>` med bare bokstaver, sifre, bindestrek og kolon (høyst 120 tegn, CHECK i
  databasen). Eksempler: `useBy:soon:<parti-id>:2026-10-26`, `budget:2026-10:80`, `shopping:<ms>`.
- **Bare aktive nøkler** kan merkes og avvises. Et parti fra en annen husholdning gir aldri en aktiv nøkkel.
- **Handlelisten:** `shopping:<ms>` flytter brukerens «sett»-tidspunkt fram til linjen med det tidspunktet, aldri
  bakover. En eldre nøkkel fra en side som ble lastet før, godtas derfor (spesifikasjon 11, avvik 1).
- **Kropper og nøkler logges aldri.** URL-ene inneholder ingen varenavn.
