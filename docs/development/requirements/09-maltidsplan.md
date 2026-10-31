# 09 – Oppskrifter fra åpne kilder og måltidsplan (fase 9)

**Status:** Planen ble godkjent 2026-10-24 i chat. Ferdinand Risan skrev: «Godkjent i plenum av Ferdinand og Linus».
Det er registrert ordrett som hans erklæring. Linus Saxe Huseby har ikke bekreftet det selv i en økt. Anbefalingene
i de seks åpne spørsmålene gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før implementeringen.

**Bygger på:** FR-REC-001–004 (spesifikasjon 05), FR-SHOP-002 (spesifikasjon 06), FR-INV-005, NFR-SEC-001/002/004,
NFR-DATA-001/002, NFR-UX-001–004 og KURS-02/04 (antatt) i [00-kravoversikt.md](00-kravoversikt.md), samt
ADR-0006, ADR-0008 og [ADR-0016](../architecture-decisions/0016-oppskrifter-fra-apne-kilder.md).

## Teamets beslutning om oppskrifter

Ferdinand skrev 2026-10-24, før planen: «Oppskrifter på matretter skal hentes fra internett slik at det automatisk
kommer opp oppskrifer på matretter som brukeren kan lage basert på hva de har.» Planen tolket det som en godkjenning
av retningen i ADR-0016 og foreslo Wikibooks som kilde. Planen ble godkjent. ADR-0016 er derfor akseptert, og den
erstatter ADR-0009.

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Hvor oppskriftene kommer fra | Engelske Wikibooks (Cookbook), CC BY-SA 4.0. De importeres med et skript, oversettes av KI og merkes «KI-utkast – ikke kontrollert av teamet». Ingen oppskrifts-API mens appen kjører. |
| 2 | Rekkefølge | Del A (oppskrifter) før del B (måltidsplan), på grenen `fase-9` |
| 3 | Hvilke måltider | Frokost, lunsj og middag finnes. Bare middag vises som standard, og en bryter viser de andre. |
| 4 | Periode for behov | Fra i dag til søndag i uka som vises (hele uka hvis den er i fremtiden) |
| 5 | Kontaktadresse i User-Agent | Ikke oppgitt av teamet. Skriptet bruker GitHub-profilen til repoet (`https://github.com/superior-ferdiz`) som kontaktpunkt. Den kan overstyres med `WIKIMEDIA_CONTACT`. Ingen e-postadresse brukes. |
| 6 | Kontroll av oversettelsene | Teamet kontrollerer oppskriftene og fører seg inn i `reviewedBy`. Til da er de merket som KI-utkast. |

## Del A: oppskrifter fra åpne kilder

### FR-REC-005 Import med kilde og lisens
- Skriptet `npm run recipes:fetch -w @smartmat/api` henter sidene i `prisma/seed/sources/wikibooks.json` gjennom
  MediaWiki-API-et til en.wikibooks.org: wikitekst, side-id, revisjons-id og tidspunkt. Hver side lagres som
  `prisma/seed/sources/wikibooks/<slug>.json`, slik at oversettelsen kan kontrolleres mot originalen.
  - Høyst én forespørsel per sekund, tidsavbrudd 15 s, User-Agent med kontaktpunkt (avgjørelse 5).
  - Skriptet henter bare sider i navnerommet `Cookbook:` og stopper hvis nettstedets lisens ikke er CC BY-SA 4.0.
- KI oversetter og tilpasser hver side til en oppskriftsfil i `prisma/seed/recipes/` med:

  | Felt | Betydning |
  |---|---|
  | `source` | `external` |
  | `authors` | Opphavet: «Bidragsytere til Wikibooks» |
  | `license` | SPDX-id. For Wikibooks: `CC-BY-SA-4.0`. |
  | `sourceUrl` / `sourceTitle` | Lenke til og navn på originalen (med revisjons-id i lenken) |
  | `retrievedOn` | Datoen siden ble hentet |
  | `adaptation` | `translated` (oversatt) eller `adapted` (oversatt og endret, for eksempel mengder eller trinn) |
  | `aiAssisted` | `true` når KI har oversatt eller tilpasset |
  | `reviewedBy` / `reviewedOn` | Hvem i teamet som har kontrollert oppskriften, og når. Tom til det skjer. |

- **Avvik fra ADR-0016:** feltet `original_author` er ikke laget. `authors` har allerede den rollen for eksterne
  oppskrifter.
- Mengdene står i grunnenheter (ADR-0006), som før. Mangler en ingrediens i `ingredients.json`, legges den til som
  KI-utkast.
- `checkSeed` krever alle feltene over når `source` er `external`, og godtar bare lisensene i ADR-0016.
  `reviewedOn` må stå når `reviewedBy` har navn, og ellers ikke.

### FR-REC-006 Visning av kilde og lisens
- Oppskriftssiden viser «Kilde: ‹tittel› fra Wikibooks · Lisens: CC BY-SA 4.0 · Oversatt med KI», med lenker til
  originalen og til lisensen. Lenkene åpnes i ny fane med `rel="noopener noreferrer"`.
- Er `reviewedBy` tom, står det «KI-utkast – ikke kontrollert av teamet» på oppskriften og på kortet i listen.
- Siden `/oppskrifter/kilder` lister kildene og alle eksterne oppskrifter med lisens og lenke.
- `RECIPES_INCLUDE_UNREVIEWED` (standard `true`): settes den til `false`, viser API-et ikke ukontrollerte eksterne
  oppskrifter. Ment for et fremtidig produksjonsmiljø (ADR-0016: ukontrollerte bare i testmiljøet).
- Oppskriftene rangeres og foreslås automatisk etter matlageret, som i fase 5. Det er dette som oppfyller teamets
  ønske om at det «automatisk kommer opp oppskrifter … basert på hva de har».

## Del B: måltidsplan

### Begreper

| Begrep | Betydning |
|---|---|
| **Uke** | ISO-uke, mandag–søndag, i Europe/Oslo. Skrives `2026-W44` i URL-en. |
| **Måltid** (`meal`) | `breakfast` (frokost), `lunch` (lunsj) eller `dinner` (middag) |
| **Oppføring** (`meal_plan_entry`) | Én ting på én dag og ett måltid: en oppskrift med antall porsjoner, eller fritekst («Rester») |
| **Behov** | Hva oppskriftene i planen trenger, skalert til porsjonene, summert per ingrediens |
| **Bidrag** (`shopping_list_item_meal`) | Hvor mye en oppføring har lagt på en handlelistelinje |

### FR-PLAN-001 Ukeplan
- `/maltidsplan` viser uka som inneholder i dag. `?uke=2026-W44` viser en annen uke, og knapper blar én uke frem og
  tilbake. «Denne uka» går tilbake. En ugyldig uke gir denne uka.
- **Legge til:** på en dag og et måltid velger brukeren
  - en oppskrift (søk i tittel, sortert som under FR-PLAN-005) og antall porsjoner (1–50, standard er oppskriftens), eller
  - fritekst (1–100 tegn). Hurtigvalgene «Rester» og «Spise ute» fyller inn teksten.
- **Endre:** antall porsjoner (oppskrift) eller teksten (fritekst).
- **Flytte:** til en annen dag og et annet måltid, med en dialog (ikke dra-og-slipp, så det virker med tastatur og
  skjermleser). Flytting til en annen uke er lov.
- **Fjerne:** én oppføring, uten bekreftelse. Meldingen «Fjernet» leses opp.
- Rekkefølgen innenfor et måltid er rekkefølgen oppføringene ble lagt til.
- Høyst 20 oppføringer per dag (409 `errors.mealPlan.dayFull`).
- **Dobbel innsending:** skjemaet sender `clientRequestId`. Kommer den igjen, svarer API-et med oppføringen som ble
  lagret (200).
- Oppføringer med en oppskrift viser de av brukerens allergener som er registrert i oppskriften
  («Inneholder melk»), og forbeholdet om allergener vises på siden.

### FR-PLAN-002 Porsjoner og avrunding
- Mengden for en ingrediens er `ceil(mengde × porsjoner / oppskriftens porsjoner)`, med heltall hele veien
  (ADR-0006). Det rundes **opp**, slik at man ikke handler for lite. Er resultatet ikke eksakt, vises det med «ca.».
- **«Etter smak»** (ingen mengde) skaleres ikke og vises som «etter smak».
- Valgfrie ingredienser og basisvarer skaleres som andre, men regnes som i fase 5 (basisvare: «sjekk at du har»,
  valgfri: ikke krysset av).
- Oppskriftssiden har en porsjonsvelger (1–50). Med et annet antall enn oppskriftens viser hver ingrediens den
  skalerte mengden i grunnenhet ved siden av oppskriftens tekst, og status (har/mangler) regnes for den skalerte
  mengden. Valget står i URL-en (`?porsjoner=6`).

### FR-PLAN-003 Behov for uka
- Perioden er fra i dag (eller mandag, hvis uka er i fremtiden) til søndag. Dager som har vært, telles ikke.
- For hver ingrediens summeres de skalerte mengdene fra alle oppføringer i perioden.
- **Matlageret trekkes fra** med reglene fra fase 5:
  - partier med mengde over 0 fra varer som er koblet til ingrediensen
  - omregning til ingrediensens grunnenhet rundes **ned**, parti for parti; uten omregning er mengden ukjent
  - **siste forbruksdag passert teller aldri**
- **Nytt:** et parti med siste forbruksdag teller bare for måltider **på eller før** den datoen. Partiene fordeles
  grådig: tidligste måltid først, og blant partiene som kan brukes, det som går ut først. Best før passert teller
  fortsatt (som i fase 5).
- **Status per ingrediens** er som i fase 5 (`enough`, `notEnough`, `unknownAmount`, `missing`, `staple`). En
  ingrediens er valgfri bare hvis den er valgfri i alle oppføringene.
- For hver ingrediens vises hvilke oppføringer som trenger den («Tirsdag middag: Fårikål, 400 g»).
- **Går ut denne uka:** partier som går ut i perioden (siste forbruksdag eller best før), og som ingen oppskrift i
  planen bruker. Høyst 10. Teksten følger fase 3 (ulik ordlyd for best før og siste forbruksdag).

### FR-PLAN-004 Fra behov til handlelisten
- «Se hva som mangler» viser behovet med ett forslag per ingrediens, med samme regler for avkryssing som i
  fase 6 (`suggestFromRecipe`): det som mangler og det som er for lite av, er krysset av. Basisvarer, valgfrie,
  ukjente mengder og det som allerede er lagt til fra planen, er ikke krysset av.
- Brukeren kan krysse av og rette mengden. Ingenting legges på listen før brukeren trykker «Legg på handlelisten».
- **Bidrag per oppføring:** hver oppføring som mangler noe av en ingrediens, får et bidrag på linjen. Det som
  allerede er lagt til fra en oppføring (på en åpen eller avhuket linje), trekkes fra. Derfor:
  - **samme behov lagt til to ganger gir ikke dobbelt** (andre gang er det ingenting å legge til)
  - øker man porsjonene etterpå, legges bare økningen til
  - behovet trekkes aldri fra listen automatisk
- Sammenslåing med en åpen linje skjer med `mergeQuantity` fra fase 6. Listen låses (`FOR UPDATE`) mens det skjer,
  og bidragene leses på nytt inne i transaksjonen.
- Serveren regner behovet ut på nytt og stoler ikke på tallene fra nettleseren. En ingrediens som ikke trengs i
  perioden, gir 400 med feltfeil.
- Svaret sier hvor mange linjer som ble nye, slått sammen og hoppet over. Siden lenker til handlelisten.

### FR-PLAN-005 Det som går ut snart, foreslås først
- Når man velger oppskrift til en dag, er listen sortert med rangeringen fra fase 5 (FR-REC-002), og den første
  grunnen vises under tittelen («Kyllingfilet: siste forbruksdag om 2 dager (+10)»), ikke bare poengsummen.
- Partier med siste forbruksdag **før** dagen man planlegger for, regnes ikke med for den dagen.
- Oppskrifter med brukerens allergener skjules som i fase 5, med bryteren «Vis oppskrifter med mine allergener».
- Ordlyden sier aldri at noe er fritt for et allergen, og appen gir ingen helseråd.

### Mobil først (NFR-UX-001/002, KURS-02)
- **Telefon (under 900 px):** én kolonne med ett kort per dag. Dagens kort er markert og har `aria-current="date"`.
- **Fra 900 px:** CSS Grid med 7 kolonner (dagene) og én rad per måltid som vises (`grid-template-columns:
  repeat(7, minmax(0, 1fr))`). Måltidsnavnet står over hver celle, så rutenettet kan leses uten tabellsemantikk.
- Alle handlinger kan gjøres med tastatur. Dialogene bruker `components/Dialog`. Endringer meldes i et
  `aria-live`-område.
- Tilstander: lasting, feil, tom uke («Ingenting planlagt denne uka») og ingen oppskrifter («Ingen oppskrifter ennå»
  – fritekst virker fortsatt).

## Datamodell
- `meal_plan_entries`:
  - kolonner: `id`, `household_id`, `date`, `meal` (enum), `recipe_id?`, `recipe_title?`, `servings?`, `note?`,
    `dedupe_key?` (unik per husholdning), `created_by?`, `created_at`, `updated_at`
  - CHECK: enten `recipe_title` og `servings` (1–50) uten `note`, eller `note` uten `recipe_title` og `servings`
  - `@@unique([id, household_id])`, indeks på `(household_id, date)`
- `shopping_list_item_meals`:
  - kolonner: `item_id`, `entry_id`, `household_id`, `quantity_base?`
  - primærnøkkel `(item_id, entry_id)`
  - sammensatte fremmednøkler `(item_id, household_id)` og `(entry_id, household_id)`, begge med CASCADE
- `recipes` får `source_url`, `source_title`, `retrieved_on`, `adaptation`, `ai_assisted`, `reviewed_by` og
  `reviewed_on`, og `source` kan være `external`.

**Når noe slettes:**

| Det som slettes | Hva skjer |
|---|---|
| Oppskrift (fjernet ved seed) | `recipe_id` blir NULL (SET NULL). Oppføringen beholder tittelen (`recipe_title`) og vises som «‹tittel› (oppskriften finnes ikke lenger)». Den teller ikke i behovet. |
| Vare eller parti | Ingenting lagres om varer i planen. Behovet regnes ut på nytt. |
| Oppføring | Bidragene slettes (CASCADE). Linjene på handlelisten blir stående. |
| Handlelistelinje | Bidragene slettes (CASCADE), så oppføringen kan legges til på nytt |
| Husholdning eller konto | Alt slettes (CASCADE) |

## API
Se [api-documentation.md](../api-documentation.md). Alt ligger under `/households/:householdId/meal-plan`, med
`requireAuth` og `householdAccess`:

| Metode og sti | Hva |
|---|---|
| `GET ?from=&to=` | Oppføringer i perioden (høyst 42 dager) |
| `POST /entries` | Ny oppføring (201, eller 200 ved gjentatt `clientRequestId`) |
| `PATCH /entries/:entryId` | Dato, måltid, porsjoner eller tekst |
| `DELETE /entries/:entryId` | Fjern (204) |
| `GET /needs?from=&to=` | Behov, fordeling og «går ut denne uka» |
| `POST /shopping` | Legg valgte ingredienser på handlelisten |

`GET /households/:householdId/recipes?for=YYYY-MM-DD` rangerer for en dag (FR-PLAN-005).

## Sikkerhet og personvern
- Fremmed husholdning gir 404 på alle endepunktene (IDOR-tester for hvert endepunkt). En oppføring fra en annen
  husholdning gir 404.
- `recipeId` kontrolleres mot oppskriftstabellen (400 med feltfeil).
- Fritekst og titler kommer aldri i logger eller feilmeldinger.
- Teksten fra Wikibooks vises som ren tekst. Wikitekst eller HTML tolkes aldri i appen.
- Importskriptet kjører bare når en utvikler starter det. Appen kontakter aldri Wikibooks.

## Avvik og tillegg under implementeringen

- **Avrunding i frødata (fase 5-regel endret):** `seedQuantityBase` rundet av før omregningen, så «½ stk løk» ble en
  hel løk (100 g). Nå rundes det én gang, etter omregningen (50 g). Den fiktive testoppskriften med «½ ts salt» får
  derfor 3 g i stedet for 4 g, og to eldre tester er oppdatert.
- **Flytte og endre i samme dialog:** «Endre eller flytt» har dag (i uka som vises), måltid og porsjoner eller tekst.
  «Flytt til en annen uke» bytter dagvelgeren med et datofelt.
- **Måltidene er ikke landemerker:** først var hvert måltid en `section` med navn. axe meldte at landemerkene ikke var
  unike (sju regioner som het «Middag»). Nå er de vanlige blokker med overskrift (`h4`).
- **Fjerning håndteres av siden:** meldingen «… er fjernet fra planen» og flyttingen av fokus ble først satt i
  oppføringen selv. Oppføringen avmonteres når planen hentes på nytt, og da hopper TanStack Query over `onSuccess` i
  `mutate`. Playwright fant det på telefon. Siden kjører nå slettingen, og en enhetstest simulerer at oppføringen
  forsvinner.
- **Handlelisten viser bidrag fra planen:** «Måltidsplan man. 26. okt.: Fårikål, 1,5 kg» under linjen, som
  oppskriftsbidragene fra fase 6 (`meals` i svaret).
- **Poengsummen på oppskriftssiden** gjelder fortsatt oppskriftens egne porsjoner. Bare mengdene og har/mangler regnes
  om for valgt antall porsjoner, og siden sier det.
- **«Går ut denne uka»** viser én linje per vare (det partiet som går ut først). To varer med samme navn, for eksempel
  én fra matlageret og én fra et kjøp, står som to linjer.
- **Skjermbilder med ekte oppskrifter:** `E2E_RECIPE_SEED=repo` får e2e-serveren til å legge inn oppskriftene i
  `prisma/seed/` i stedet for testoppskriftene. Bare skjermbildekjøringen bruker det. De vanlige e2e-testene bruker
  fortsatt bare de fiktive oppskriftene.

## Endret i fase 15 (spesifikasjon 16)

- **Ukjent oppskrift i en ny oppføring gir 404**, ikke 400 med feltfeil som under «Sikkerhet og personvern» over.
  Grunnen er at en annen husholdnings egen oppskrift skal gi samme svar som en oppskrift som ikke finnes
  (FR-REC-009, avgjørelse 7 i spesifikasjon 16).
- Oppføringene varsler også om matvarer brukeren eller husholdningen har registrert (FR-ALG-002).
- Behovet for uka regner bare ingredienslinjer. Fritekstlinjer i egne oppskrifter telles aldri.

## Utenfor fasen
Kopiere en uke, faste ukeplaner, dra-og-slipp, varsler, ernæring og kalorier (ingen helseråd), oppskrifter på
engelsk, bilder fra Wikibooks, brukerens egne oppskrifter, deling i husholdningen i sanntid (fase 10).

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-9).
