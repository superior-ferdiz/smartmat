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
Ingredient = { id, key, name, baseUnit, isStaple, aliases: string[] }
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
