# Frødata for oppskrifter (fase 5)

Her ligger ingrediensene og oppskriftene som `npm run db:seed` legger inn i databasen (spesifikasjon 05, ADR-0009).

| Fil | Innhold | Hvem |
|---|---|---|
| `ingredients.json` | Ingredienser med aliaser, allergener og omregninger | **KI-utkast** (Claude, 2026-10-21). Allergenmerking og omregninger er ikke kontrollert. Se `meta.note`. |
| `recipes/<slug>.json` | Én oppskrift per fil | **Teamet.** Ingen oppskrifter er lagt inn ennå. |

```bash
npm run db:seed -- --check   # bare sjekk filene
npm run db:seed              # sjekk og legg inn i databasen i DATABASE_URL
```

Sjekken lister alle feil på en gang. Enhetstesten `apps/api/src/modules/recipes/seed.test.ts` kjører den samme
sjekken på alle filene her.

## Regler for oppskriftene (ADR-0009)

- **Skriv oppskriften selv.** Ikke kopier tekst fra nettsider, kokebøker eller Matprat. En ingrediensliste er sjelden
  vernet, men fremgangsmåten og beskrivelsen er det.
- `authors` er navnet til den eller dem som faktisk skrev oppskriften. Gjør KI om teksten din til JSON, står du
  fortsatt som forfatter, og det føres i KI-loggen.
- `source` er `team`. (`test` brukes bare for de fiktive testoppskriftene i `apps/api/test/fixtures/`.)
- `license` er `egen`.
- Filnavnet skal være `slug` + `.json`, og `slug` skal bare ha små bokstaver, tall og bindestrek.

## Mal

```json
{
  "slug": "kyllinggryte-med-ris",
  "title": "Kyllinggryte med ris",
  "description": "En kort beskrivelse av retten (maks 500 tegn).",
  "servings": 4,
  "prepMinutes": 15,
  "cookMinutes": 30,
  "tags": ["middag", "kylling"],
  "source": "team",
  "license": "egen",
  "authors": ["Fornavn Etternavn"],
  "ingredients": [
    { "ingredient": "kyllingfilet", "amount": "400", "unit": "g", "text": "400 g kyllingfilet" },
    { "ingredient": "lok", "amount": "1", "unit": "stk", "text": "1 løk" },
    { "ingredient": "flote", "amount": "2", "unit": "dl", "text": "2 dl matfløte" },
    { "ingredient": "karri", "amount": "1", "unit": "ss", "text": "1 ss karri", "optional": true },
    { "ingredient": "salt", "text": "Salt og pepper" }
  ],
  "steps": ["Skjær kyllingen i biter.", "Stek den i olje til den er gjennomstekt.", "…"]
}
```

- `ingredient` er en `key` fra `ingredients.json`. Mangler ingrediensen, legg den til der (med `allergens`, også
  når listen er tom).
- `amount` og `unit` står sammen, eller begge mangler («etter smak»). `amount` kan være `"2"`, `"1,5"` eller `"1/2"`.
- Enheter: `g`, `kg`, `ml`, `dl`, `l`, `ss` (15 ml), `ts` (5 ml), `krm` (1 ml), `stk`. Er enheten en annen type enn
  ingrediensens grunnenhet (for eksempel `dl` mel, der mel er i gram), brukes omregningen i `ingredients.json`.
  Uten omregning gir sjekken feil.
- Mengden lagres som et heltall i grunnenheten. `ss`/`ts` og omregninger rundes til nærmeste hele gram eller milliliter.
- `text` er det som vises i oppskriften.
- `optional: true` teller ikke i poengsummen.

## Ingredienser

```json
{
  "key": "melk",
  "name": "Melk",
  "baseUnit": "ml",
  "category": "dairy",
  "aliases": ["lettmelk", "helmelk", "skummet melk"],
  "allergens": ["milk"],
  "conversions": [{ "unit": "g", "unitQty": 1, "baseQty": 1, "note": "Hvor tallet kommer fra" }]
}
```

- **Aliaser** er navn en vare i matlageret kan ha. De matcher bare hele ord («kokosmelk» er ikke «melk»), så
  sammensatte ord må stå som egne aliaser. Et alias kan bare høre til én ingrediens.
- **Omregning:** `unitQty` av `unit` ≈ `baseQty` av grunnenheten. «1 stk løk ≈ 100 g» skrives
  `{ "unit": "stk", "unitQty": 1, "baseQty": 100 }`.
- **Allergener:** `gluten`, `crustaceans` (skalldyr), `egg`, `fish`, `peanuts`, `soy`, `milk`, `nuts`, `celery`,
  `mustard`, `sesame`, `sulphites`, `lupin` og `molluscs` (bløtdyr).
- `isStaple: true` for basisvarer (salt, pepper, olje, vann). De regnes ikke som manglende.
