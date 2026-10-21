# Testing og testresultater

> **Status: UTKAST.** Skrevet etter fase 1, 2 (2026-10-20), 3 og 4 (2026-10-21). Testene og teksten er laget av KI (Claude) og
> ikke gjennomgått av teamet ennå. Alle resultater under er fra faktiske kjøringer. Utdataene er lagret ordrett i
> [fase-1/](../evidence/test-results/fase-1/), [fase-2/](../evidence/test-results/fase-2/),
> [fase-3/](../evidence/test-results/fase-3/) og [fase-4/](../evidence/test-results/fase-4/).
> Offisielle APP2000-krav til rapporten er ikke verifisert.

## Testmiljø

- Ubuntu 22.04 (server), Node 22.14.0, npm 11.1.0
- Vitest 4.1.12 med jsdom 27 og Testing Library (enhets- og komponenttester)
- Playwright 1.63.0 med Chromium (ende-til-ende), mot det ferdige bygget (`vite preview`)
  - prosjekt `mobil-360`: 360 × 800 px, berøringsskjerm
  - prosjekt `desktop`: 1280 × 800 px
  - nettleserspråk `nb-NO`, tidssone Europe/Oslo
- axe-core 4.14 for automatisk tilgjengelighetssjekk (WCAG 2.0/2.1/2.2 A og AA)
- Fra fase 2: PostgreSQL 16 (`postgres:16-alpine`) i Docker på `127.0.0.1:55432`, med egne databaser for tester

## Kommandoer

```bash
npm run typecheck   # TypeScript, alle pakker
npm run lint        # ESLint
npm run test        # Vitest (shared + web + api, uten database)
npm run test:api    # API-tester mot testdatabasen smartmat_test (krever npm run db:up)
npm run build       # produksjonsbygg
npm run test:e2e    # Playwright (bygger appen og starter et eget API mot smartmat_e2e)
```

Fra fase 2 trengs Postgres-containeren for `test:api` og `test:e2e`. Testene bruker egne databaser
(`smartmat_test` og `smartmat_e2e`), og nekter å kjøre mot en database som ikke slutter på `_test` eller `_e2e`.
Utviklingsdatabasen kan derfor ikke tømmes ved en feil.

## Testtyper og sporbarhet (fase 1)

Testene refererer til krav-ID-ene i [01-designsystem-og-app-skall.md](../development/requirements/01-designsystem-og-app-skall.md).

| Krav | Hva testes | Fil | Antall |
|---|---|---|---|
| FR-SHR-001 | `parseOre`/`formatOre`: gyldige og ugyldige formater, grenseverdier, frem-og-tilbake | `packages/shared/src/money/ore.test.ts` | 61 |
| FR-SHR-001 | Zod-skjemaer for øre, visningsnavn og språk | `packages/shared/src/schemas/common.test.ts` | 16 |
| FR-UI-006 | Etikett, `aria-describedby`, `aria-invalid`, tastatur, axe for alle skjemafelt og knapp | `components/formControls.test.tsx` | 14 |
| FR-UI-006 | Feiloppsummering: fokus, antall, lenker til felt | `components/FormError/FormError.test.tsx` | 2 |
| FR-UI-006, FR-SHR-001 | Eksempelskjema: tom innsending, tre desimaler, «49,90» → 4990, bare tastatur | `pages/ExampleItemForm.test.tsx` | 4 |
| FR-UI-007 | Lasting, feil, tomt, Alert, Card | `components/states.test.tsx` | 9 |
| FR-UI-007 | Toast: live-region, lukk, forsvinner, pause ved musepeker, maks tre | `components/Toast/Toast.test.tsx` | 5 |
| FR-UI-001–003 | Menyer, `aria-current`, hopp-lenke, fokus ved sidebytte, alle 9 sider, 404, axe, eksempeldata, beløpsformat | `app/navigation.test.tsx` | 28 |
| FR-UI-004/005 | Tema og språk, lagring, blokkert `localStorage` | `pages/SettingsPage.test.tsx` | 8 |
| NFR-UX-004 | Like nøkler på norsk/engelsk, ingen tomme, alle valideringsnøkler finnes | `i18n/locales.test.ts` | 4 |
| NFR-UX-002 | Kontrast for 27 fargepar × 3 temablokker + at mørke blokker er like | `styles/tokens.test.ts` | 82 |
| **Sum enhet/komponent** | | 11 filer | **233** |
| NFR-UX-001/002 | 12 sider × 2 temaer: vises, ingen horisontal rulling, ingen axe-brudd | `e2e/app-shell.spec.ts` | 48 |
| FR-UI-001 | Riktig meny per skjerm, bunnmeny-tekster kuttes ikke, «Mer», tastaturnavigasjon, synlig fokus | `e2e/app-shell.spec.ts` | 7 |
| FR-UI-003 | 1 kolonne på 360 px, 3 på 1280 px | `e2e/app-shell.spec.ts` | 2 |
| FR-UI-004/005 | Mørkt tema før appen starter, engelsk huskes etter omlasting | `e2e/app-shell.spec.ts` | 4 |
| FR-UI-006 | Feiloppsummering og fokus i ekte nettleser, axe etter feil | `e2e/app-shell.spec.ts` | 2 |
| **Sum ende-til-ende** | | | **63** |

## Resultater fase 1 (kjørt 2026-10-20)

| Sjekk | Resultat | Bevis |
|---|---|---|
| Typesjekk | Ingen feil | `01-typecheck.txt` |
| Lint | Ingen feil eller advarsler | `02-lint.txt` |
| Formatering (Prettier) | Ingen avvik | `03-format-check.txt` |
| Enhet/komponent (Vitest) | 233 av 233 bestått | `04-unit-tests.txt` |
| Bygg | Vellykket, med advarsel om stor JS-fil (517 kB) | `05-build.txt` |
| Ende-til-ende (Playwright) | 63 bestått, 23 hoppet over | `06-e2e.txt` |
| `npm audit` | 0 sårbarheter | `07-npm-audit.txt` |

De 23 som ble hoppet over i Playwright er ikke feil. 20 er skjermbilde-skriptet (`e2e/screenshots.spec.ts`), som bare
kjører med `SCREENSHOTS=1`. 3 er tester som bare gjelder én skjermstørrelse, og som derfor hoppes over i den andre.

## Feil funnet i fase 1, retting og ny test

Alle funnene under ble gjort av KI-verktøyet under implementeringen 2026-10-20, ikke av teamet.

| # | Funn | Hvordan funnet | Retting | Test som nå dekker det |
|---|---|---|---|---|
| 1 | For store beløp fikk meldingen «Beløpet må være i hele øre» | Enhetstest feilet: Zod 4 sin `int()` avviser også usikre heltall | Sjekk for maksverdi før `int()` | `common.test.ts` (`out_of_range`) |
| 2 | Lenkene i feiloppsummeringen var for små og for tett plassert (WCAG 2.5.8 Target Size) | axe i Playwright på 360 px | Lenkene fikk minst 24 px høyde | `app-shell.spec.ts` (axe etter feil) |
| 3 | «Mer»-siden kunne be om oversettelser som ikke fantes | TypeScript (typede i18n-nøkler) | Beskrivelser lagt til for alle seksjoner | Typesjekk + `locales.test.ts` |
| 4 | Usynlige tegn (hardt mellomrom, Unicode-minus) lå rett i kildekoden og var umulige å se | ESLint `no-irregular-whitespace` | Erstattet med ` `, ` `, `−` | Lint |
| 5 | Innstillinger-ikonet lignet en sol (kunne tolkes som temabryter) | Gjennomgang av skjermbilder | Nytt ikon (glidebrytere) | Ingen automatisk test (visuelt) |
| 6 | Sidemenyens bakgrunn stoppet ved skjermhøyden på lange sider | Gjennomgang av skjermbilder | Bare innholdet er «sticky», ikke hele kolonnen | Ingen automatisk test (visuelt) |
| 7 | Datofelt viste amerikansk format i testene | Skjermbilde | Playwright kjører nå med `nb-NO` (appen var riktig, testmiljøet var feil) | Skjermbilder |
| 8 | npm-installasjonen krasjet | `npm install` | Vite låst med `overrides` (se kapittel 10) | Installasjonen |

Noen testfeil skyldtes feil i selve testene, ikke i appen. De er tatt med fordi de viser at en test også kan ta feil:

- En test påsto at deling med flyttall ville miste én øre for et bestemt stort tall. Det stemte ikke da det ble sjekket,
  og testen ble byttet ut med en som sjekker største trygge beløp.
- En test forventet 2 kolonner på 1280 px, men brytepunktet for 3 kolonner er 1200 px. Testen ble rettet.
- Søk etter knappen «Lagre» traff også «Lagrer» (Playwright søker på deler av teksten). Rettet med `exact: true`.
- Testing Library gjør hardt mellomrom i siden om til vanlig mellomrom før den sammenligner, men ikke i teksten man
  søker etter. Testen søker nå med vanlige mellomrom.
- Skriptet som lagret testbevis, rapporterte feil exit-kode (alltid 0). Det ble oppdaget fordi
  formateringssjekken feilet uten å bli rapportert. Skriptet ble rettet, og alle bevisfiler ble laget på nytt.

## Testtyper og sporbarhet (fase 2)

Testene refererer til krav-ID-ene i [02-database-og-autentisering.md](../development/requirements/02-database-og-autentisering.md).

| Krav | Hva testes | Fil | Antall |
|---|---|---|---|
| FR-AUTH-001–005, NFR-SEC-003 | Delte skjemaer: e-post, passordregler, ukjente felt fjernes | `packages/shared/src/schemas/auth.test.ts` | 17 |
| FR-AUTH-001–003 | Service-laget med falskt repo og falsk klokke: registrering, innlogging, sperre, utløp | `apps/api/src/modules/auth/service.test.ts` | 17 |
| FR-AUTH-004/005 | Profil, passordbytte, sletting (service-laget) | `apps/api/src/modules/profile/service.test.ts` | 5 |
| ADR-0005, NFR-SEC-003 | Utløpsregler, tokens, ekte argon2id, konfigurasjon | `policy`, `tokens`, `password`, `config` (`.test.ts`) | 12 |
| FR-AUTH-001/002 | API mot ekte database: registrering, cookie-attributter, hash i databasen, innlogging, utlogging, utløp | `apps/api/test/auth.api.test.ts` | 13 |
| FR-AUTH-004/005 | API: profil, passordbytte logger ut andre enheter, sletting av alt (og ikke andres data) | `apps/api/test/profile.api.test.ts` | 11 |
| FR-AUTH-003, NFR-SEC-001/004/005 | Brute force, rate limit, falsk `X-Forwarded-For`, CSRF, Origin, annen brukers data, logger, feilsvar | `apps/api/test/security.api.test.ts` | 23 |
| FR-AUTH-001/002 | Sidene for innlogging og registrering: validering, feilmeldinger, `?neste`, axe | `LoginPage.test.tsx`, `RegisterPage.test.tsx` | 12 |
| FR-AUTH-004/005 | Profilsiden: lagring, feil passord, sletting krever avkrysning, utlogging | `pages/ProfilePage.test.tsx` | 6 |
| FR-AUTH-002 | Beskyttede sider, omdirigering, utløpt sesjon, feil ved sesjonssjekk | `auth/RequireAuth.test.tsx` | 8 |
| FR-AUTH-002 | Ingen åpen viderekobling (`?neste`) | `auth/safeNextPath.test.ts` | 12 |
| NFR-SEC-005, NFR-SEC-004 | API-klienten: CSRF-header bare på endringer, feilkoder, nettverksfeil | `api/client.test.ts` | 6 |
| FR-AUTH-004 | Språkvalg lagres på kontoen, feil ved lagring | `pages/SettingsPage.test.tsx` | 9 (2 nye) |
| NFR-UX-004 | Alle feilkoder fra API-et finnes på norsk og engelsk | `i18n/locales.test.ts` | 6 (2 nye) |
| FR-AUTH-001–005, NFR-SEC-003/005 | Ende-til-ende: hele flyten, cookie-attributter, `?neste`, sperre, CSRF fra nettleseren, språk på annen enhet, passordbytte, sletting, axe og 360 px | `e2e/auth.spec.ts` | 32 |
| (fase 1) | Alle fase 1-sidene, nå som innlogget bruker | `e2e/app-shell.spec.ts` | 63 |

**Sum:** 331 enhetstester (94 shared, 34 api, 203 web), 47 API-tester mot database, 95 ende-til-ende-tester.

### Kontroll av sikkerhetstestene

En sikkerhetstest som aldri kan feile, beviser ingenting. Derfor ble seks beskyttelser slått av i koden, én om gangen.
API-testene ble kjørt etter hver endring, og koden ble satt tilbake etterpå
([skript](../evidence/test-results/fase-2/10-mutation-check.sh),
[utdata](../evidence/test-results/fase-2/10-mutation-check.txt)):

| Beskyttelse som ble slått av | Feilende tester |
|---|---|
| CSRF-token sjekkes ikke | 3 |
| Origin sjekkes ikke | 3 |
| Medlemskap i husholdningen sjekkes ikke | 1 |
| Kontoen sperres aldri | 1 |
| `X-Forwarded-For` blir trodd | 1 |
| Standard logging av forespørsler (med IP-adresse) | 1 |
| *Uendret kode* | *0 (47 av 47 bestått)* |

## Resultater fase 2 (kjørt 2026-10-20)

| Sjekk | Resultat | Bevis |
|---|---|---|
| Typesjekk | Ingen feil | `01-typecheck.txt` |
| Lint | Ingen feil eller advarsler | `02-lint.txt` |
| Formatering (Prettier) | Ingen avvik | `03-format-check.txt` |
| Enhet/komponent (Vitest) | 331 av 331 bestått | `04-unit-tests.txt` |
| API mot testdatabase | 47 av 47 bestått | `05-api-tests.txt` |
| Bygg | Vellykket, med advarsel om stor JS-fil (566 kB) | `06-build.txt` |
| Ende-til-ende (Playwright) | 95 bestått, 19 hoppet over | `07-e2e.txt` |
| `npm audit` | 0 sårbarheter | `08-npm-audit.txt` |
| Migreringsstatus | Databasen er à jour | `09-migrate-status.txt` |
| Kontroll av sikkerhetstestene | Alle 6 endringer fanget | `10-mutation-check.txt` |

Av de 19 som ble hoppet over, er 16 skjermbilde-skriptet (kjører bare med `SCREENSHOTS=1`) og 3 tester som bare
gjelder én skjermstørrelse.

## Feil funnet i fase 2

Alle funnene ble gjort av KI-verktøyet under implementeringen 2026-10-20, ikke av teamet.

| # | Funn | Hvordan funnet | Retting | Test som nå dekker det |
|---|---|---|---|---|
| 1 | Cookien fikk utløp etter 14 dager selv om sesjonen ble forlenget ved bruk. Nettleseren ville da kastet en gyldig sesjon. | Røyktest med `curl` (så på `Set-Cookie`) | Cookien varer til den absolutte grensen på 30 dager | `auth.api.test.ts` (cookie har utløp), `service.test.ts` |
| 2 | Etter innlogging gikk appen alltid til forsiden og ignorerte `?neste` | Enhetstest av innloggingssiden feilet | `GuestOnly` følger `?neste` (validert) | `LoginPage.test.tsx`, `auth.spec.ts` |
| 3 | Språket fra kontoen ble ikke brukt ved ny sidelasting, bare ved innlogging | Gjennomlesning av koden mens e2e-testen ble skrevet | Språket settes når sesjonen hentes | `auth.spec.ts` (språk på annen enhet) |
| 4 | Språkvalget på innloggingssiden var merket «(valgfritt)» | Gjennomgang av skjermbilder | Merket fjernet | Ingen automatisk test (visuelt) |

Feil i selve testene:

- **argon2-testen** forventet parametrene i rekkefølgen `t,p`. Biblioteket skriver `p,t`. Testen ble rettet.
- **Testen av passordbytte** lot den «andre enheten» bruke samme cookie som den første. Da var det i praksis samme
  sesjon, og testen feilet. Den andre enheten logger nå inn selv.
- **Alle 47 API-testene passerte første gang de ble kjørt.** Det var grunnen til at sikkerhetstestene ble kontrollert
  ved å slå av beskyttelsene (se over).

## Testtyper og sporbarhet (fase 3)

Testene refererer til krav-ID-ene i [03-matlager.md](../development/requirements/03-matlager.md).

| Krav | Hva testes | Fil | Antall |
|---|---|---|---|
| FR-INV-001, ADR-0006 | `parseQuantity`/`formatQuantity`: enheter, desimalkomma, for nøyaktige mengder, tilbake og frem | `shared/src/quantity/quantity.test.ts` | 27 |
| FR-INV-005 | `expiryStatus`, mest alvorlige status, «i dag» i Oslo, midnatt, nyttår, sommer/vinter | `shared/src/quantity/expiry.test.ts` | 12 |
| FR-INV-007 | Verdiestimat i hele øre, avrunding, store tall | `shared/src/money/waste.test.ts` | 9 |
| FR-INV-001/003/007 | Skjemaene for vare, parti og kassering | `shared/src/schemas/inventory.test.ts` | 6 |
| FR-INV-007/008 | `planUndo` for alle hendelsestyper, `wasteValue` | `api/src/modules/inventory/service.test.ts` | 8 |
| FR-INV-001–008, FR-DASH-001 | API mot database: kategorier, standardsteder, opprette, partier, validering, CHECK, forbruk (også 10 samtidige), kassering med alle verdityper, svinnoppsummering med tidssone, redigere, flytte, slette, steder, historikk, angre (også samtidig), kontosletting | `api/test/inventory.api.test.ts` | 29 |
| NFR-SEC-001 | Alle 15 endepunkter med en annen husholdnings ID-er (to varianter), sted fra annen husholdning, sammensatt fremmednøkkel i databasen | `api/test/inventory.security.api.test.ts` | 5 |
| FR-INV-004/005 | Filtrering, sortering (norsk), oppsummering, URL | `web/src/inventory/filter.test.ts` | 8 |
| FR-INV-001 | Skjematekst → API-kropp | `web/src/inventory/batchForm.test.ts` | 3 |
| FR-INV-004/005 | Lagersiden: status med tekst, oppsummering som lenker, søk i URL, tom, feil, axe | `pages/inventory/InventoryPage.test.tsx` | 7 |
| FR-INV-001 | Ny vare: validering, datofelt, «1,5 kg» → 1500, «89,90» → 8990, axe | `pages/inventory/NewItemPage.test.tsx` | 4 |
| FR-INV-002/005–008 | Varesiden: ulik ordlyd for datotypene, dialog for forbruk og kassering, historikk, angre, 404, axe | `pages/inventory/ItemPage.test.tsx` | 7 |
| FR-DASH-001 | Forsiden: «Går ut snart» (rekkefølge, maks 5), tom, svinnkort | `pages/OverviewPage.test.tsx` | 3 |
| – | Dialog: navn, beskrivelse, lukk | `components/Dialog/Dialog.test.tsx` | 2 |
| FR-INV-001–008 | Ende-til-ende: hele flyten fra ny vare til angre, filtre i URL, dialog med tastatur, steder, axe og 360 px | `e2e/inventory.spec.ts` | 12 |

**Sum etter fase 3:** 426 enhetstester (148 shared, 42 api, 236 web), 81 API-tester mot database, 107
ende-til-ende-tester.

### Kontroll av testene (fase 3)

Som i fase 2 ble beskyttelsene slått av i koden én om gangen
([skript](../evidence/test-results/fase-3/10-mutation-check.sh),
[utdata](../evidence/test-results/fase-3/10-mutation-check.txt)):

| Endring | Feilende tester |
|---|---|
| Parti slås opp uten husholdningsfilter | 1 |
| Vare slås opp uten husholdningsfilter | 1 |
| Sletting av vare uten husholdningsfilter | 1 |
| Forbruk/kassering uten sjekk av mengde | 2 |
| Lagringssted i forespørselen sjekkes ikke | 2 |
| Angrede kasseringer telles i svinnet | 1 |
| Kodesjekken «sted med varer» fjernet | 0 – **forventet**: fremmednøkkelen i databasen stopper slettingen likevel |
| *Uendret kode* | *0 (81 av 81)* |

I første kjøring fant skriptet ikke koden for endring nr. 2, fordi Prettier hadde delt linjen. Den raden testet
derfor ingenting. Skriptet ble rettet og kjørt på nytt. Utdataene over er fra den andre kjøringen.

## Resultater fase 3 (kjørt 2026-10-21)

| Sjekk | Resultat | Bevis |
|---|---|---|
| Typesjekk, lint, formatering | Ingen feil | `01`–`03` |
| Enhet/komponent | 426 av 426 | `04-unit-tests.txt` |
| API mot testdatabase | 81 av 81 | `05-api-tests.txt` |
| Bygg | Vellykket. Advarsel om stor JS-fil (619 kB). | `06-build.txt` |
| Ende-til-ende | 107 bestått, 23 hoppet over (20 skjermbilder, 3 som bare gjelder én skjermstørrelse) | `07-e2e.txt` |
| `npm audit` | 0 sårbarheter | `08-npm-audit.txt` |
| Migreringsstatus | À jour | `09-migrate-status.txt` |

## Feil funnet i fase 3

Alle funnene ble gjort av KI-verktøyet under implementeringen 2026-10-21.

| # | Funn | Hvordan funnet | Retting |
|---|---|---|---|
| 1 | Fremmednøkkelen fra parti til sted var `RESTRICT`. Det kunne stoppet sletting av husholdningen (cascade). | Gjennomlesning av migreringen før den ble kjørt | `NO ACTION` |
| 2 | Angring trengte en entydig «siste hendelse». To hendelser kan få samme millisekund. | Gjennomlesning | Løpenummer `seq` (egen migrering) |
| 3 | En velger lå halvveis bak den faste bunnmenyen på 360 px (WCAG 2.5.8) | axe i Playwright | Filtrene legges i en sammenleggbar «Filtrer og sorter» |
| 4 | Historikken var ikke ferdig lastet på skjermbildet | Gjennomgang av skjermbilder | Skriptet venter på historikken |

Feil i testene: Playwrights request-kontekst sender ikke `Secure`-cookies over http (Chromium gjør det for
127.0.0.1), så testhjelperen setter cookien som header. En test forventet at Tab aldri forlater en modal dialog;
med `<dialog>` kan fokus gå til nettleserens eget grensesnitt, og testen sjekker nå at fokus aldri havner på siden
bak.

## Testtyper og sporbarhet (fase 4)

Testene refererer til krav-ID-ene i [04-kjop-og-budsjett.md](../development/requirements/04-kjop-og-budsjett.md).

| Krav | Hva testes | Fil | Antall |
|---|---|---|---|
| NFR-DATA-001, FR-BUD-004 | `sumOre` (eksakt, avviser desimaler og for store summer), `usedPercent` (rundes ned, BigInt), `monthFigures` (mat, ikke-mat, ikke fordelt, over budsjett, tom måned), måneder over årsskifte og midnatt i Norge | `shared/src/money/budget.test.ts` | 15 |
| FR-BUD-001/002/003/005 | Skjemaene: linjer eller totalsum, grenser, dato, kategori for mat, lagerdel, ID-er ved retting, budsjett, måned | `shared/src/schemas/purchases.test.ts` | 15 |
| FR-BUD-001/002/005 | Servicen med falskt repo: pris og dato til partiet, eksisterende vare, alle feltfeil samtidig, dedupe, 409 ved fremmednøkkelfeil, linje-ID-er | `api/src/modules/purchases/service.test.ts` | 10 |
| FR-BUD-003/004 | Budsjettservice: måned i norsk tid, kalendermåned, fjernet budsjett | `api/src/modules/budget/service.test.ts` | 4 |
| FR-BUD-001–005, NFR-DATA-001/002 | API mot database: registrering, dato i norsk tid, dobbel innsending (også 5 samtidige), kjøp → lager, tilbakerulling midt i en transaksjon, budsjett med historikk, månedsoversikt og kontrollsum, retting (beløp, dato, linjer, type, totalsum), sletting (urørt/rørt/flyttet), samtidig sletting og forbruk, CHECK, kontosletting | `api/test/purchases.api.test.ts` | 38 |
| NFR-SEC-001 | Alle 8 endepunkter med en annen husholdnings ID-er (to varianter), vare/sted/linje fra annen husholdning, dedupe-nøkkel, husholdningsfilteret i repoet alene, sammensatt fremmednøkkel, 401, CSRF | `api/test/purchases.security.api.test.ts` | 10 |
| FR-BUD-001/002/005 | Skjematekst → API-kropp, feltnavn som feilnøkler, løpende sum, fra lagret kjøp til skjema | `web/src/purchases/purchaseForm.test.ts` | 13 |
| FR-BUD-003/004 | Budsjettsiden: tall, kategorier, over budsjett i tekst, måned i URL, liste, feil, sette og fjerne budsjett, axe | `pages/budget/BudgetPage.test.tsx` | 9 |
| FR-BUD-001/002/005 | Registrer, vis, rett og slett kjøp: validering, øre og grunnenheter, eksisterende vare, totalsum, feltfeil fra server, slettedialog, 404, axe | `pages/budget/PurchasePages.test.tsx` | 9 |
| FR-DASH-001, FR-BUD-002 | Budsjettkortet på forsiden med og uten budsjett, hurtighandling, lenke fra parti til kjøp | `OverviewPage.test.tsx`, `ItemPage.test.tsx` | 4 |
| FR-BUD-001–005, NFR-UX-001/002 | Ende-til-ende: budsjett → kjøp → varer i lageret → oppdatert budsjett og forside; retting og sletting; dobbeltklikk; axe og 360 px på alle nye sider | `e2e/budget.spec.ts` | 4 (× 2 skjermstørrelser) |

**Sum etter fase 4:** 505 enhetstester (178 shared, 56 api, 271 web), 129 API-tester mot database, 115
ende-til-ende-tester.

Tre eksisterende tester ble endret fordi oppførselen var ment å endres: navigasjonstesten forventet to merker med
«Eksempeldata» på forsiden (nå ett), testen av pengeformat leste eksempeltall fra budsjettkortet (leser nå tall fra
et testsvar), og typen `BatchResponse` fikk feltet `purchaseId` i testdataene.

### Kontroll av testene (fase 4)

Beskyttelsene ble slått av i koden én om gangen
([skript](../evidence/test-results/fase-4/10-mutation-check.sh)).

**Første kjøring** ([utdata](../evidence/test-results/fase-4/10-mutation-check-run1.txt)) avslørte to hull:

- **Retting uten husholdningsfilter i repoet** ble ikke fanget. Servicen slår opp kjøpet med husholdningsfilter før
  repoet kalles, så API-testene nådde aldri dette laget. Det er et ekstra forsvar, men det var ikke testet.
- **«Urørt» uten sjekk av hendelser** ble ikke fanget. Ingen test hadde et parti som var flyttet uten at mengden var
  endret.

To nye tester ble skrevet (repoet kalt direkte med feil husholdning, og sletting av et kjøp med et flyttet parti).
**Andre kjøring** ([utdata](../evidence/test-results/fase-4/10-mutation-check.txt)):

| Endring | Feilende tester |
|---|---|
| Kjøp slås opp uten husholdningsfilter | 2 |
| Retting av kjøp uten husholdningsfilter (repo) | 1 |
| Sletting av kjøp uten husholdningsfilter | 2 |
| Månedsoversikten summerer uten husholdningsfilter | 1 |
| Linje-ID sjekkes ikke mot kjøpet | 2 |
| Sted i en linje sjekkes ikke | 2 |
| Eksisterende vare i en linje sjekkes ikke | 2 |
| Kjøpsdato frem i tid tillates | 1 |
| Totalsummen regnes ikke av serveren | 3 |
| Kjøp, linjer og partier uten transaksjon | 1 |
| Ingen gjenbruk av `clientRequestId` | 2 |
| Dedupe-nøkkelen lagres ikke | 2 |
| «Urørt» uten sjekk av hendelser | 1 |
| Urørte partier fjernes også når brukeren vil beholde dem | 2 |
| Partiene låses ikke (`FOR UPDATE` fjernet) | 1 |
| Feil budsjettrad for måneden | 1 |
| *Uendret kode* | *0 (129 av 129)* |

**Forbehold om `FOR UPDATE`:** Testen som fanget denne endringen, kjører sletting og forbruk samtidig åtte ganger.
Den fanget endringen i begge kjøringene, men en test av samtidighet avhenger av hvordan forespørslene tilfeldigvis
flettes. Den kan i prinsippet gå grønt selv om låsen mangler.

## Resultater fase 4 (kjørt 2026-10-21)

| Sjekk | Resultat | Bevis |
|---|---|---|
| Typesjekk, lint, formatering | Ingen feil | `01`–`03` |
| Enhet/komponent | 505 av 505 | `04-unit-tests.txt` |
| API mot testdatabase | 129 av 129 | `05-api-tests.txt` |
| Bygg | Vellykket. Advarsel om stor JS-fil (658 kB). | `06-build.txt` |
| Ende-til-ende | 115 bestått, 19 hoppet over (16 skjermbilder, 3 som bare gjelder én skjermstørrelse) | `07-e2e.txt` |
| `npm audit` | 0 sårbarheter | `08-npm-audit.txt` |
| Migreringsstatus | À jour (4 migreringer) | `09-migrate-status.txt` |

Skjermbilder (lyst og mørkt tema, 360 px og desktop) ligger i
[screenshots/fase-4/](../evidence/screenshots/fase-4/).

## Feil funnet i fase 4

Alle funnene ble gjort av KI-verktøyet under implementeringen 2026-10-21.

| # | Funn | Hvordan funnet | Retting |
|---|---|---|---|
| 1 | Fremmednøkkelen fra kjøpslinje til kategori ble foreslått som `ON DELETE SET NULL` av Prisma. Det ville brutt regelen om at mat alltid har kategori. | Gjennomlesning av den genererte migreringen | `RESTRICT`, som for varer |
| 2 | Valgknappene «Med linjer / Bare totalsum» hadde ikke en etikett lint-regelen kunne se | ESLint (jsx-a11y) | Egen `<label>` per valg og hint via `aria-describedby` |
| 3 | Feilkoden for samtidige endringer sa «Partiet ble endret», som er feil for kjøp | Gjennomlesning av teksten | Egen kode `errors.purchase.changedMeanwhile` |
| 4 | To hull i testene (se kontrollen over) | Mutasjonskontrollen | To nye tester |

Feil i testene: En test flyttet en falsk klokke 20 dager frem og ble logget ut, fordi sesjoner utløper etter 14 dager
uten bruk. Testen går nå frem i to steg med en forespørsel imellom. To komponenttester sammenlignet tekst uten å ta
hensyn til hardt mellomrom i beløp, og én ventet ikke lenge nok på feilvisningen etter at en 5xx-feil ble prøvd på
nytt.

## Begrensninger

- axe og andre automatiske verktøy finner bare en del av tilgjengelighetsproblemene. **Manuell test med skjermleser
  (NVDA/VoiceOver) og tastatur er ikke gjort.**
- Bare Chromium er testet. Firefox og Safari (WebKit) er ikke testet.
- Ingen brukertesting med ekte personer.
- Kontrast i jsdom-testene er slått av (jsdom regner ikke ut stiler). Kontrast sjekkes i stedet i Playwright og i
  `tokens.test.ts`.
- Ingen kodedekning (coverage) er målt.
- Ende-til-ende-testene kjører mot et API med høye rate limits (alle tester registrerer brukere fra samme adresse).
  Selve grensene er testet i API-testene.
- Det er ikke gjort noen penetrasjonstest eller ekstern sikkerhetsgjennomgang.
- **axe på telefon med fast bunnmeny:** axe vurderer bare siden slik den står når den lastes. Et felt som da
  tilfeldigvis ligger halvveis bak den faste bunnmenyen, blir rapportert som for lite (WCAG 2.5.8), selv om
  brukeren kan scrolle det fram. I `e2e/inventory.spec.ts` kjøres derfor axe på telefon med et høyt vindu
  (360 × 2400 px), slik at hele siden får plass. Bredden er fortsatt 360 px. Ved ett tilfelle var funnet reelt nok
  til at vi endret siden (filtrene, se funn 3), men regelen kan slå ut på andre lange sider også.
- Testene for forsiden og lagerstatus bruker datoer regnet ut fra dagens dato. De er derfor ikke avhengige av når de
  kjøres, men en test kjørt nøyaktig ved midnatt kan i teorien se to forskjellige «i dag».

## Kilder i prosjektet

- [Testbevis fase 1](../evidence/test-results/fase-1/)
- [Skjermbilder fase 1](../evidence/screenshots/fase-1/)
- [Testbevis fase 2](../evidence/test-results/fase-2/), [skjermbilder fase 2](../evidence/screenshots/fase-2/)
- [Fasespesifikasjon 02](../development/requirements/02-database-og-autentisering.md),
  [fasespesifikasjon 03](../development/requirements/03-matlager.md)
- [Testbevis fase 3](../evidence/test-results/fase-3/), [skjermbilder fase 3](../evidence/screenshots/fase-3/)
- [Fasespesifikasjon 01](../development/requirements/01-designsystem-og-app-skall.md)
