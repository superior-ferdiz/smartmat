# Endringslogg

## [Ikke utgitt]

### Fase 11 – 2026-10-25 (grenen `fase-11`)
- **Svinnstatistikk** (`/svinn`, [spesifikasjon 11](requirements/11-svinn-og-varsler.md)):
  - per måned: antall, kjent verdi med faktisk og anslått hver for seg, ukjent verdi og mengde per enhet
  - per årsak og per kategori, med andeler som går opp i 100 (største rest), og «mest kastet»
  - de siste 12 månedene som tabell, med skravert søyle for anslått verdi
  - lenke fra forsidekortet «Kastet denne måneden»
- **Varsler i appen** ([ADR-0019](architecture-decisions/0019-varsler-beregnes-ved-lesing.md)):
  - siste forbruksdag (snart, i dag, passert) og best før (snart, i dag), med ulik ordlyd
  - budsjettet ved 80 % og 100 %
  - «… la til … på handlelisten», med navn bare for nåværende medlemmer
  - bjelle med antall i toppfeltet og sidemenyen, siden `/varsler`, «Avvis», og en live-region for nye varsler
  - innstillinger per bruker under Innstillinger → Varsler (hvilke varsler, 0–7 dager før)
- **Migrering** `notifications`: `notification_settings`, `notification_states` (CASCADE fra medlemskapet),
  `household_members.shopping_seen_at`, CHECK.
- **Endret:**
  - toast-regionen heter «Meldinger» (het «Varsler»)
  - menyen har ti seksjoner
- **Rettet:** sletting av et kjøp eller en vare kunne miste meldingen og navigeringen når den nye hentingen av
  husholdningens data var treg (spesifikasjon 11, avvik 5).

### Fase 10 – 2026-10-24 (grenen `fase-10`)
- **Delte husholdninger** ([ADR-0018](architecture-decisions/0018-delte-husholdninger-og-invitasjoner.md),
  [spesifikasjon 10](requirements/10-husholdning.md)):
  - **invitasjon med engangslenke** `/bli-med#<token>`: 48 timer, én gang, kan trekkes tilbake, bare hash lagres,
    begrensning av forsøk, del med telefonens delingsmeny eller kopier
  - **siden `/bli-med`:** hvem inviterer til hva, egne data blir værende, Bli med / Nei takk, og lenkene til
    innlogging og registrering tar brukeren tilbake
  - **roller:** eier (invitere, fjerne, gi nytt navn, overføre med passord, slette med passord) og medlem (alle
    husholdningsdata, forlate). Kontrolleres med `requireOwner` og under lås.
  - **flere husholdninger** (høyst 5) med velger og «Husholdning: …» øverst på sidene når det er flere
  - **forlate og fjerne:** tilgangen forsvinner straks, dataene blir i husholdningen, og den som står uten
    husholdning, får en ny og tom
  - **sletting av konto** som eier av en delt husholdning gir eierskapet til medlemmet som har vært med lengst
  - **allergier** kan deles med husholdningen etter eget valg (Profil → Allergier). Oppskrifter og måltidsplan
    skjuler og merker dem «registrert i husholdningen», uten navn.
  - **«Lagt til av …»** på handlelisten, kjøp, måltidsplanen og varehistorikken, bare for nåværende medlemmer
- **Migrering** `households_sharing`: `household_invitations`, `share_allergens`, `active_household_id`, delvis unik
  indeks for én eier, CHECK.
- **Endret:**
  - `HistoryEvent.actorName` er erstattet av `actor` (`CreatorRef`)
  - `SessionUser` har `householdRole` og `households`
  - teksten om skjulte oppskrifter nevner husholdningen
  - plassholdersiden `SectionPage` er fjernet, fordi alle seksjoner nå finnes
- **Rettet:**
  - `RequireAuth` byttet ut hele siden med en feilmelding når en ny henting av sesjonen feilet i bakgrunnen
  - slettedialogen sa at «husholdningen din» alltid slettes

### Fase 9 – 2026-10-24 (grenen `fase-9`)
- **Oppskrifter fra åpne kilder** ([ADR-0016](architecture-decisions/0016-oppskrifter-fra-apne-kilder.md), akseptert,
  erstatter ADR-0009):
  - importskript `npm run recipes:fetch -w @smartmat/api` (Wikibooks, MediaWiki-API, lisensen sjekkes)
  - 27 oppskrifter oversatt av KI med kilde, revisjonslenke, lisens (CC BY-SA 4.0) og hva som er endret
  - 45 nye ingredienser (KI-utkast)
  - «KI-utkast – ikke kontrollert av teamet» på oppskriften og kortet, og siden `/oppskrifter/kilder`
  - `RECIPES_INCLUDE_UNREVIEWED=false` skjuler ukontrollerte oppskrifter
- **Måltidsplan** (`/maltidsplan`):
  - uke mandag–søndag (ISO-uke, Europe/Oslo) med `?uke=`, middag som standard, frokost og lunsj bak en bryter
  - oppskrift med porsjoner eller fritekst («Rester», «Spise ute»), flytte og endre i en dialog, fjerne
  - oppskriftsvelger rangert for dagen (`GET /recipes?for=`), med grunn og allergenfilter
  - «Hva mangler for uka»: behov skalert og rundet opp, matlageret fordelt etter siste forbruksdag, forslag som i
    fase 6, «Legg på handlelisten» etter bekreftelse, aldri dobbelt
  - «Går ut denne uka» for det ingen planlagt oppskrift bruker
- **Oppskriftssiden:** porsjonsvelger (`?porsjoner=`) med skalerte mengder, og «Legg i måltidsplanen».
- **Handlelisten** viser hvilken planlagt rett en linje kommer fra.
- **Migreringer** `recipe_sources` og `meal_plan`: `meal_plan_entries`, `shopping_list_item_meals`, kildefelt på
  `recipes`, CHECK.
- **Rettet:** frødata rundet av før omregningen («½ løk» ble 100 g).

### Fase 8 – 2026-10-24 (grenen `fase-8`)
- **Pilotmåling av OCR** på 3 ekte kvitteringer (2 Extra, 1 Kiwi), med fasit kontrollert av Ferdinand Risan:
  - Tesseract 5.3.0 med norsk modell i Docker uten nettverk
  - 4 forbehandlinger × 2 sidedelinger (psm), målt i 6 kjøringer
  - bare samlede tall er lagret, i `docs/evidence/test-results/fase-8/`
  - resultat: dato og total 3/3, 88 % av linjene, men bare 50 % av beløpene per linje
  - [ADR-0017](architecture-decisions/0017-tesseract-pa-serveren-forelopig.md) (foreslått, foreløpig): appen foreslår
    bare butikk, dato og total
- **Kvitteringer** (`/budsjett/kvittering`):
  - laste opp med «Ta bilde» (bakkameraet) eller «Velg fil»
  - lesing i bakgrunnen, med tilstandene i kø, leses, feilet (med årsak, «Prøv igjen» og «Fyll inn selv»), lav
    sikkerhet, klar til sjekk og registrert
  - gjennomgang med bildet ved siden av kjøpsskjemaet fra fase 4, og «Teksten vi leste»
  - linjeforslag med «Sjekk:»-merknader, som bare vises når de er slått på
  - forkasting, og lenke fra budsjettsiden
- **Opplasting:**
  - JPEG, PNG og WebP, avgjort av innholdet
  - høyst 10 MB og 40 MP
  - bildet skrives om uten EXIF/GPS (og skaleres ned i nettleseren når det går)
  - 10 per bruker og time, 20 i kø for hele serveren
- **Tolkning** (`packages/shared/src/receipts/`):
  - kjedegjenkjenning bare fra toppteksten, og familie (Coop, NG, Rema, generell) ut fra oppsettet
  - beløp i øre, antall- og vektlinjer, pant, rabatt trukket fra linjen over
  - kontrollsum mot totalen og antall artikler
  - betalingslinjer fjernes før lagring
- **Bekreftelse:** kjøp, linjer, partier og hendelser i én transaksjon, sammen med at kvitteringen lukkes og bilde
  og uttrekk slettes. Samme kvittering kan ikke gi to kjøp: sterk nøkkel med kvitteringsnummer og klokkeslett,
  ellers en advarsel ved samme dato og sum. Usikre verdier merkes.
- **Bakgrunnsjobber med pg-boss** (12.38.0):
  - `npm run worker -w @smartmat/api` leser én kvittering om gangen
  - hvert 15. minutt slettes ubekreftede kvitteringer eldre enn 7 dager
- **Migrering `receipts`:** `receipts`, `receipt_images`, `receipt_extractions`, med CHECK og sammensatte
  fremmednøkler.
- **API:** sju endepunkter under `/households/:h/receipts`. Feilsvar kan ha `refId`. URL-er logges uten
  spørrestreng.
- **Testmiljø:** Tesseract i bildet og containeren `smartmat-staging-worker` på det interne nettverket.
- **Andre endringer:**
  - Docker-bildet `docker/ocr`
  - `npm run check:files` og `.gitignore` stopper bildefiler utenfor skjermbildemappen
  - ikoner for kamera og kvittering
- **Avhengigheter:** sharp 0.35.5, pg-boss 12.38.0, `@fastify/multipart` 10.1.4 (valgt før 10.1.5/10.1.6, som var 0–2
  dager gamle) og pino 10.4.0 (som direkte avhengighet, samme versjon som Fastify bruker).

### Fase 7 – 2026-10-22 (grenen `fase-7`)
- **Strekkodeskanning** (`/skann`):
  - skanne med kameraet: nettleserens `BarcodeDetector`, ellers `barcode-detector` + `zxing-wasm`, lastet bare når
    kameraet startes, med wasm-filen fra vår egen server
  - egne tekster for ingen kamerastøtte, ikke sikker side, nektet tilgang, fant ikke kamera og annen feil
  - skrive inn koden selv: EAN-8, EAN-13, UPC-A, UPC-E (fra kameraet) og GTIN-14, med kontrollsiffer, i nettleseren
    og på serveren. Koden står i URL-en (`?kode=`).
  - oppslag: husholdningens egne svar, så mellomlageret, så Open Food Facts (ODbL, kreditert på siden).
    Tidsavbrudd 3 s, Zod-validering, 30 oppslag per bruker og minutt, 10 per minutt mot OFF. Appen virker når OFF er
    nede.
  - skjemaet fylles ut (navn, kategori, mengde, enhet, sted, datotype, ingrediens), men datoen aldri. Ingenting
    lagres før brukeren bekrefter. Ukjente koder huskes for husholdningen. Butikkens egne koder (vekt/pris) slås ikke
    opp og huskes ikke.
  - nytt parti på varen fra sist (FR-INV-002), og ett parti selv ved dobbel innsending
- **Migrering `barcodes`:** `products`, `product_lookup_misses`, `household_barcodes` og
  `inventory_batches.dedupe_key`, med CHECK og sammensatte fremmednøkler.
- **API:** `GET /households/:h/barcodes/:gtin` og `POST …/confirm`. Strekkoden logges som `[gtin]`. Ny
  `Permissions-Policy` på alle svar.
- **Testmiljø (ADR-0015, ikke satt opp):** `docker/staging/` (Dockerfile, compose og eksempelfil for miljøvariabler),
  `TRUST_PROXY`, `REGISTRATION_OPEN`, `COOKIE_HOST_PREFIX` (`__Host-`), `WEB_DIST_DIR` (API-et serverer webappen,
  med CSP), skriptet `create-user` og et banner i webappen. Oppsettet står i
  [testmiljo.md](testmiljo.md).
- **Dokumentasjon:** spesifikasjon 07, vilkårene til Open Food Facts, ADR-0014 og ADR-0015 (akseptert) og ADR-0016
  (oppskrifter fra åpne kilder, bare foreslått).
- **Avhengigheter:** `barcode-detector` 3.2.2, `zxing-wasm` 3.1.3, `@fastify/static` 10.1.5. Valgt med vilje før
  nyeste versjon, som var tre og én dag gammel.

### Fase 6 – 2026-10-21 (grenen `fase-6`)
- **Handleliste** (`/handleliste`), én per husholdning:
  - føre listen for hånd: legge til (Enter i hurtigfeltet), rette, fjerne, huke av og fjerne hake, fjerne avhukede
  - avhuking vises med en gang (optimistisk) og rulles tilbake ved feil
  - én delegert DOM-lytter for hele listen, fokusflytting og `aria-live`-meldinger (KURS-03)
- **Fra oppskrift:** «Legg manglende i handlelisten» foreslår det som mangler, med manglende mengde. Basisvarer,
  valgfrie ingredienser og det som står på listen, er ikke krysset av. Samme ingrediens slås sammen med den åpne
  linjen, og samme oppskrift telles aldri to ganger.
- **Til matlageret:** avhukede linjer legges inn som partier (eksisterende eller ny vare) i én transaksjon. Ingen
  doble partier ved dobbel innsending. Ny vare kobles til ingrediensen, så oppskriften rangeres høyere. Ingen utgift
  registreres (ADR-0007).
- **Forsiden:** hurtighandlingen «Handleliste» viser antall åpne linjer.
- **Migrering:** `shopping_list` (3 tabeller, sammensatte fremmednøkler, CHECK, delvis unik indeks, én liste for hver
  husholdning).
- **API:** 7 nye endepunkter under `/households/:householdId/shopping-list`. `GET /ingredients` har `categoryKey`.
  Nye feilkoder `errors.shopping.changedMeanwhile` og `errors.shopping.alreadyOnList`.
- **`packages/shared`:** skjemaer og svar for handlelisten, `mergeQuantity`, `suggestFromRecipe`,
  `sortShoppingItems`, `newItemIngredientLink`, `textIngredientId`.
- **Seed:** ingredienser som en handlelistelinje bruker, fjernes ikke.

### Fase 5 – 2026-10-21 (grenen `fase-5`)
- **Oppskrifter:**
  - bla i og åpne oppskrifter, med søk (tittel og ingrediens) og tagg i URL-en
  - rangering etter matlageret med forklart poengsum: dekning (0–100) + «går snart ut» (0–30)
  - per ingrediens: har, for lite (hvor mye som mangler), usikker mengde, mangler, basisvare. Siste forbruksdag
    passert regnes aldri med.
  - kobling vare → ingrediens med aliaser (hele ord), og manuell kobling eller «ikke en ingrediens» på varesiden
- **Allergier:** 14 allergener på profilen. Oppskrifter med dem skjules som standard eller vises med advarsel.
  Forbeholdet vises alltid, og ingen tekst sier «allergenfri».
- **Forsiden:** middagsforslaget viser den best rangerte oppskriften. Ingenting er eksempeldata lenger.
- **Migrering:** `recipes` (7 tabeller, 3 enums, `ingredient_match`/`ingredient_id` på varer, CHECK).
- **Frødata:** `npm run db:seed` fra `prisma/seed/` med sjekk av alle filer. KI-utkast til 61 ingredienser (ikke
  kontrollert). Ingen oppskrifter fra teamet ennå. Tre fiktive testoppskrifter bare i test-databasene.
- **API:** `GET /households/:h/recipes`, `GET /households/:h/recipes/:id`, `GET /ingredients`,
  `GET`/`PUT /me/allergens`. `PATCH` av vare tar `ingredient`.
- **`packages/shared`:** matching, poengsum, frødataskjemaer, allergener, API-skjemaer.
- **Tester:** 637 enhetstester (+132), 158 API-tester (+29), 125 Playwright-tester (+10), og kontroll av testene.
  Felles frist på 3 s for `findBy` i webtestene. Axe på telefon med vindu like høyt som siden.

### Fase 4 – 2026-10-21 (grenen `fase-4`)
- **Kjøp og budsjett:**
  - registrere kjøp manuelt med linjer (mat med kategori, eller ikke mat) eller bare totalsum
  - matlinjer kan legges rett i matlageret som partier, på en ny eller eksisterende vare, i samme transaksjon
  - månedlig matbudsjett som gjelder fra en måned og fremover
  - månedsoversikt: brukt, gjenstående, andel, per kategori, «ikke fordelt» og ikke-mat for seg
  - retting og sletting av kjøp. Urørte partier fjernes, brukte beholdes.
  - samme skjema sendt to ganger gir ett kjøp (`clientRequestId`)
- **Migrering:** `purchases_budget` (`purchases`, `purchase_lines`, `food_budgets`, `purchase_line_id` på partier,
  sammensatte fremmednøkler, CHECK).
- **API:** 8 nye endepunkter under `/households/:householdId/` (`purchases`, `budget`). Partier har nå `purchaseId`.
- **`packages/shared`:** skjemaer for kjøp og budsjett, `sumOre`, `usedPercent` (BigInt), `monthFigures`,
  `addMonths`/`firstOfMonth`, ny feilkode `errors.purchase.changedMeanwhile`.
- **Web:**
  - `/budsjett` med månedsvelger i URL-en, `/budsjett/kjop/ny`, `/budsjett/kjop/:id` og `/budsjett/kjop/:id/rett`
  - forsidens budsjettkort viser ekte data. Bare middagsforslaget er fortsatt eksempeldata.
  - varesiden lenker til kjøpet et parti kom fra
  - `apiFetch` støtter `PUT`
- **Tester:** 505 enhetstester (+79), 127 API-tester (+46), 115 Playwright-tester (+8), og kontroll av testene.

### Fase 3 – 2026-10-21 (grenen `fase-3`)
- **Matlager:**
  - varer med partier (egen mengde, eget sted, best før *eller* siste forbruksdag, pris, kjøpsdato)
  - lagringssteder (Kjøleskap/Fryser/Skap og egne), 12 kategorier
  - forbruk og kassering (helt eller delvis), med årsak og verdi (faktisk, estimert fra pris, ukjent) i svinnloggen
  - historikk med «Angre siste endring»
- **Migreringer:** `inventory` (5 tabeller, sammensatte fremmednøkler, CHECK, kategorier, standardsteder) og
  `inventory_event_seq`. Registrering lager nå tre standardsteder.
- **API:** 15 nye endepunkter under `/households/:householdId/`, og `GET /categories`.
- **`packages/shared`:**
  - mengder i grunnenhet (`parseQuantity`/`formatQuantity`)
  - holdbarhetsstatus og «i dag» i Europe/Oslo
  - verdiestimat med BigInt, skjemaer og typer for matlageret
- **Web:**
  - `/matlager` med oppsummering, søk, filtre og sortering i URL-en
  - `/matlager/ny`, `/matlager/:id` med dialoger og historikk, `/matlager/steder`
  - ny `Dialog`-komponent (`<dialog>`)
  - forsiden viser ekte «Går ut snart» og «Kastet denne måneden»
- **Tester:** 426 enhetstester (+95), 81 API-tester (+34), 107 Playwright-tester (+12), og kontroll av testene.

### Fase 2 – 2026-10-20 (grenen `fase-2`)
- Docker Compose med PostgreSQL 16 på `127.0.0.1:55432`, med egne databaser for utvikling, API-tester og Playwright.
- `apps/api`: Fastify + Zod + Prisma 7, REST under `/api/v1`, moduler med routes/service/repo.
- Prisma-skjema og første migrering: `users`, `households`, `household_members` og `sessions`, med CHECK-begrensninger.
- Registrering (med husholdning av én), innlogging, utlogging, profil (navn, språk, passord) og sletting av konto.
- Sikkerhet:
  - argon2id og sesjoner i Postgres der bare hash av tokenet lagres
  - cookie med HttpOnly/Secure/SameSite=Lax
  - Origin-sjekk og CSRF-token
  - sperre per konto og rate limit per IP-adresse
  - feilkoder som i18n-nøkler, ingen personopplysninger i loggen
- Felles autorisasjonsmønster for husholdningsdata (`authz/household.ts`).
- Web:
  - sidene `/logg-inn`, `/registrer` og `/profil`
  - beskyttede ruter, kontoseksjon i Innstillinger
  - språket lagres på kontoen
  - Vite videresender `/api`
- `packages/shared`: skjemaer for auth og profil, typer for API-svar og feilkoder.
- Tester: 331 enhetstester (+98), 47 API-tester mot database (nye), 95 Playwright-tester (+32).
- `.env.example`, nye skript: `db:up`, `db:stop`, `db:migrate`, `db:deploy`, `test:api`, `dev` (web + API).

### Fase 1 – 2026-10-20
- npm workspaces-monorepo med `apps/web` og `packages/shared`, felles TypeScript-, ESLint- og Prettier-oppsett.
- Designsystem i ren CSS: tokens for farger (lyst og mørkt tema), typografi, avstand, radius, skygger og brytepunkter.
- App-skall med bunnmeny (mobil) og sidemeny (≥ 900 px), 9 seksjoner med plassholdersider, «Mer»-side og 404.
- Forside med CSS Grid-kort merket som eksempeldata.
- Grunnkomponenter: Button/LinkButton, TextField, NumberField, Select, DateField, Checkbox, FormError/FormErrorSummary,
  Card, Tag, EmptyState, LoadingState, ErrorState, Alert, Toast.
- Innstillinger for språk (bokmål/engelsk) og tema (automatisk/lyst/mørkt), designsystem-side med eksempelskjema.
- `packages/shared`: `parseOre`/`formatOre` og første Zod-skjemaer.
- Testoppsett: Vitest + Testing Library (233 tester), Playwright på 360 px og 1280 px med axe (63 tester).

### Fase 0 – 2026-10-19
- Prosjektmappe og dokumentasjonsstruktur opprettet.
- ADR-0001–0012, veikart, kravoversikt og datamodellutkast.
- Ingen applikasjonskode ennå.
