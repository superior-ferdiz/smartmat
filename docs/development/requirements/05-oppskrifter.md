# 05 – Oppskrifter (fase 5)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-21 («godkjennt vennligst fortsett»). Anbefalingene i
de sju åpne spørsmålene gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før implementeringen. Ikke
gjennomgått av Linus Saxe Huseby.

**Bygger på:** FR-REC-001–004, FR-DASH-001 (middagsdelen), NFR-SEC-001/002/004, NFR-DATA-001 og NFR-UX-001–004 i
[00-kravoversikt.md](00-kravoversikt.md), samt ADR-0006, ADR-0008 og ADR-0009.

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Hvem skriver oppskriftene | Teamet. KI kan gjøre en tekst fra teamet om til JSON, men teamet står som forfatter (`authors`). KI skriver ingen oppskrifter med `source=team`. Testene bruker egne, tydelig fiktive oppskrifter (`source=test`) som bare finnes i test-databasene. |
| 2 | Ingredienser, aliaser, omregninger og allergener | KI lager et utkast (`prisma/seed/ingredients.json`, merket som KI-utkast i filen og i KI-loggen). Teamet må kontrollere allergenmerkingen og omregningene. |
| 3 | Kobling vare → ingrediens | Automatisk med aliaser, pluss manuell overstyring på varesiden |
| 4 | Basisvarer (salt, pepper, olje, vann) | Regnes ikke som manglende. Vises som «Basisvare – sjekk at du har». |
| 5 | Skjule eller varsle om allergener | Skjul som standard. En bryter viser dem igjen, med advarsel. |
| 6 | Hvem sine allergener | Den innloggede brukeren sine. Husholdningens allergener kommer i fase 10. |
| 7 | Best før passert | Teller som noe man har og gir bonus for «går snart ut», med ordlyden fra fase 3. Siste forbruksdag passert teller aldri. |

## Begreper

| Begrep | Betydning |
|---|---|
| **Ingrediens** (`ingredient`) | En global, normalisert matvare som oppskrifter bruker, for eksempel «melk». Har én grunnenhet (g, ml eller stk). |
| **Alias** (`ingredient_alias`) | Et navn som betyr ingrediensen: «lettmelk», «helmelk», «melk». Unikt på tvers av alle ingredienser. |
| **Omregning** (`unit_conversion`) | Hvor mye én annen enhet er i ingrediensens grunnenhet, for eksempel «1 stk egg = 60 g». Alltid et anslag. |
| **Basisvare** | En ingrediens de fleste har (`is_staple`). Telles ikke i poengsummen. |
| **Oppskrift** (`recipe`) | Global, skrevet av teamet. Mengdene står i ingrediensens grunnenhet (ADR-0006). |
| **Treff** | En vare i matlageret som er koblet til en ingrediens, automatisk eller manuelt |

## Krav og akseptansekriterier

### FR-REC-001 Bla i og åpne oppskrifter
- `/oppskrifter` viser alle oppskrifter som kort med tittel, tid, porsjoner, tagger og en kort status
  («Har 4 av 6 · 2 mangler · 1 går snart ut»).
- **Søk** i tittel og ingrediensnavn, uten skille mellom store og små bokstaver. **Filter** på tagg. Søk, tagg og
  allergenbryteren ligger i URL-en (`?q=&tagg=&allergener=vis`). Filtreringen skjer i nettleseren, som i matlageret.
- `/oppskrifter/:recipeId` viser beskrivelse, tid, porsjoner, ingredienser, fremgangsmåte og «Skrevet av …».
  Oppskrifter med `source=test` merkes «Testdata».
- Oppskrifter vises på norsk også når grensesnittet er på engelsk (innholdet finnes bare på norsk).
- Uten oppskrifter vises en tom-tilstand («Ingen oppskrifter ennå»).

### Kobling mellom vare og ingrediens
- **Normalisering av navn:** små bokstaver (norsk), tegnsetting fjernes, og mengder som «1 l», «1,5 kg» og «500g»
  fjernes. Resten deles i ord.
- **Automatisk treff:** et alias treffer når alle ordene står etter hverandre i varenavnet, som hele ord. Aliaset med
  flest ord vinner. Treffer to ingredienser med like mange ord, blir det **ikke** noe treff (tvetydig), og
  varesiden sier det. *Under implementeringen ble «så flest tegn» fjernet som regel for uavgjort: «smør» og
  «melk» er like lange, og «Kyllingfilet med løk» ville blitt kylling bare fordi ordet er lengre.*
  - «Tine lettmelk 1 l» → «lettmelk» → melk
  - «Kokosmelk» → ikke melk (et annet ord)
  - Sammensatte ord må derfor stå som egne aliaser.
- **Manuell kobling:** brukeren kan velge ingrediens på varesiden, eller «Ingen ingrediens». Valget lagres på varen
  (`inventory_items.ingredient_id`, eller `ingredient_match = none`) og vinner over det automatiske. «Automatisk»
  setter det tilbake.
- Varesiden viser «Ingrediens: melk (automatisk)», «… (valgt av deg)» eller «Ikke koblet».

### FR-REC-003 Hva man har, hva som mangler, og om det er nok
- For hver oppskriftsingrediens summeres partiene med mengde over 0 fra alle varer som treffer ingrediensen.
- **Partier der siste forbruksdag er passert, regnes aldri med.** Oppskriften sier «Du har … med passert siste
  forbruksdag. Den er ikke regnet med.» Appen råder aldri til å bruke slik mat.
- Har varen en annen enhet enn ingrediensen, regnes mengden om med ingrediensens omregning og **rundes ned**
  (heltall). Uten omregning kan mengden ikke sammenlignes.
- **Status per ingrediens:**

  | Status | Når |
  |---|---|
  | `enough` | nok, eller ingrediensen har ingen mengde («etter smak») og finnes |
  | `notEnough` | finnes, men for lite. Viser hvor mye som mangler. |
  | `unknownAmount` | finnes, men mengden kan ikke regnes om |
  | `missing` | ingen treff |
  | `staple` | basisvare: «sjekk at du har» |

- Valgfrie ingredienser får vanlig status, men merkes «valgfri» og teller ikke i poengsummen.
- Omregnede mengder vises med «ca.».

### FR-REC-002 Rangering med forklart poengsum
Bare heltall. Basisvarer og valgfrie ingredienser er ikke med («påkrevde» = resten).

| Del | Regel |
|---|---|
| Dekning (0–100) | `floor(100 × poeng / (2 × påkrevde))`, der `enough` = 2, `notEnough`/`unknownAmount` = 1, `missing` = 0. En oppskrift uten påkrevde ingredienser får 0. |
| Går snart ut (0–30) | +10 for hver påkrevde ingrediens som dekkes av et parti med status `today` eller `soon`, eller med best før passert. Høyst 3. |
| Sum | dekning + går snart ut |

- **Rekkefølge:** høyest sum, så færrest manglende, så tittel (norsk sortering).
- **Forklaringen** er en liste med grunner fra API-et (i18n-nøkler med verdier):
  - «Du har nok av 4 av 6 ingredienser, og litt av 1 (+75)»
  - «Kyllingfilet: siste forbruksdag om 2 dager (+10)»
  - «Mangler: løk, fløte»
  - «Du har ingen av ingrediensene» når dekningen er 0

### FR-REC-004 Allergener
- De 14 allergenene som skal merkes etter matinformasjonsforskriften: gluten, skalldyr, egg, fisk, peanøtter, soya,
  melk, nøtter, selleri, sennep, sesam, sulfitt, lupin og bløtdyr.
- Brukeren velger sine under **Profil → Allergier** (`PUT /me/allergens`). Det er frivillig. Teksten forklarer at det
  bare brukes til å varsle om oppskrifter.
- En oppskrifts allergener **regnes ut** fra ingrediensene (også valgfrie og basisvarer), og lagres ikke for seg.
- **Listen:** oppskrifter med noen av brukerens allergener skjules som standard. Over listen står hvor mange som er
  skjult, med en bryter «Vis oppskrifter med mine allergener». Vist med bryteren får kortet en advarsel
  («Inneholder melk»).
- **Oppskriften:** en allergenboks viser hvilke av brukerens allergener som er registrert, og hvilke ingredienser de
  kommer fra.
- **Forbeholdet vises alltid**, i listen, på oppskriften og på forsiden: «Allergeninformasjonen er veiledende og kan
  være ufullstendig. Sjekk alltid ingredienslisten på varene du bruker.»
- **Ordlyden sier aldri at noe er fritt for et allergen.** Uten treff står det: «Ingen av dine registrerte allergener
  er registrert i ingrediensene.» En test stopper locale-tekster med «allergenfri», «fri for», «allergen-free» eller
  «free from».

### FR-DASH-001 Forsiden (middagsdelen)
- Kortet «Forslag til middag» viser oppskriften som rangeres høyest, blant dem som ikke er skjult på grunn av
  allergener, med lenke, poengsum og første grunn.
- Sum 0: «Ingen oppskrifter passer det du har ennå.» Ingen oppskrifter: «Ingen oppskrifter ennå.»
- Merket «eksempeldata» og varselet om eksempeldata øverst på forsiden fjernes. Ingenting på forsiden er eksempeldata
  lenger.

## Datamodell
Se [data-model.md](../data-model.md) og [kapittel 8](../../academic/08-databasemodell.md). Kort:
`ingredients`, `ingredient_aliases`, `ingredient_allergens`, `unit_conversions`, `recipes`, `recipe_ingredients` er
globale (ingen `household_id`). `user_allergens` hører til brukeren (ADR-0008). `inventory_items` får
`ingredient_id` (nullable) og `ingredient_match` (`auto`/`manual`/`none`).

## Frødata
- `prisma/seed/ingredients.json` og `prisma/seed/recipes/*.json`, validert med Zod-skjemaer i `packages/shared`.
  `npm run db:seed` legger dem inn (upsert på `key`/`slug`) og fjerner oppskrifter og ubrukte ingredienser som ikke
  lenger finnes i filene.
- Hver oppskrift må ha `authors` (minst ett navn) og `source`. Formatet er beskrevet i
  [prisma/seed/README.md](../../../prisma/seed/README.md).
- En test validerer alle filene: referansene finnes, ingen ingrediens står to ganger i samme oppskrift, aliaser er
  unike, enhetene stemmer, og mengdene er heltall i grunnenhet.

## Sikkerhet og personvern
- Oppskrifter og ingredienser er globale og bare lesbare. Det finnes ingen endepunkter som skriver dem.
- Rangeringen ligger under `/households/:householdId/` med `requireAuth` og `householdAccess`, og leser bare
  matlageret til den husholdningen. Fremmed husholdning gir 404.
- Allergener: `/me/allergens` tar alltid brukeren fra sesjonen. Det finnes ingen `/users/:id`.
- Allergier kan være **helseopplysninger** (GDPR art. 9). De er frivillige, slettes med kontoen (cascade), og kommer
  aldri i logger eller feilmeldinger. Behandlingsgrunnlaget er ikke vurdert av teamet (se kapittel 12).
- `ingredientId` på en vare kontrolleres mot ingredienstabellen (400 med feltfeil).

## API
Se [api-documentation.md](../api-documentation.md).

## Avvik og tillegg under implementeringen

- **Uavgjort mellom aliaser:** «så flest tegn» ble fjernet som regel (se FR-matching over). Like mange ord = tvetydig.
- **Søk, tagg og allergenbryter filtreres i nettleseren,** ikke med spørreparametere til API-et som planen nevnte.
  Listen er liten (30–50 oppskrifter), og det er samme mønster som matlageret. URL-en har fortsatt `?q=&tagg=&allergener=vis`.
- **`ingredient_match = none`** ble lagt til, slik at en feil automatisk kobling kan slås av («Ikke en ingrediens»).
- **Filtre på telefon:** tagg og allergenbryter ligger i en sammenleggbar «Filtrer», som i matlageret. Ellers fylte
  filtrene hele første skjermbilde på 360 px. Teksten om skjulte oppskrifter har derfor en egen lenke «Vis dem likevel».
- **Navn vises én gang:** to varer med samme navn (for eksempel én fra matlageret og én fra et kjøp) legges sammen,
  men navnet står én gang i «Fra matlageret».
- **Knappen på varesiden heter «Endre ingrediens»,** fordi varesiden allerede hadde en knapp som het «Endre».
- **Omregning med skjeer:** salt, krydder og noen sauser fikk ml-omregning (anslag) i KI-utkastet, slik at teamet
  kan skrive «1 ts salt».

## Utenfor fasen
Skalering av porsjoner (fase 9), «legg manglende i handlelisten» (fase 6), produktkatalog og strekkode (fase 7),
allergener for hele husholdningen (fase 10), oppskrifter på engelsk, bilder, brukerens egne oppskrifter.

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-5).
