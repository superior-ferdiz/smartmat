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

## Testtyper og sporbarhet (fase 5)

Testene refererer til krav-ID-ene i [05-oppskrifter.md](../development/requirements/05-oppskrifter.md). Oppskriftene i
API- og ende-til-ende-testene er tre fiktive testoppskrifter (`source=test`, `apps/api/test/fixtures/seed/`), ikke
teamets.

| Krav | Hva testes | Fil | Antall |
|---|---|---|---|
| Spesifikasjon 05 (kobling) | Normalisering av navn (mengder, tegnsetting, store bokstaver), alias på hele ord, flest ord vinner, tvetydig gir ingen kobling, manuell kobling og «ikke en ingrediens» | `shared/src/recipes/matching.test.ts` | 31 |
| FR-REC-002/003, ADR-0006 | Omregning rundes ned, summering av varer, siste forbruksdag passert regnes aldri, «går snart ut», status per ingrediens, poengsum, bonus høyst 3, basisvarer og valgfrie, rekkefølge | `shared/src/recipes/scoring.test.ts` | 30 |
| ADR-0009, spesifikasjon 05 (frødata) | Mengder og skjeer til grunnenhet, forfatter påkrevd, `source`, unike aliaser, ukjent ingrediens, samme ingrediens to ganger, allergener påkrevd, alle feil på en gang | `shared/src/recipes/seed.test.ts` | 28 |
| ADR-0009 | Alle frødatafilene i repoet og testfiksturene består sjekken | `api/src/modules/recipes/seed.test.ts` | 4 |
| FR-REC-001–004, FR-DASH-001 | URL-filter, søk i tittel og ingrediens, tagg, skjuling på grunn av allergener med telling, middagsforslag, gruppering av ingredienser | `web/src/recipes/filter.test.ts` | 14 |
| FR-REC-001/002/004 | Oppskriftslisten: status, første grunn, forbehold, tom tilstand, testdata-merke, søk i URL, skjulte allergener og «Vis dem likevel», feil, axe | `pages/recipes/RecipesPage.test.tsx` | 8 |
| FR-REC-002/003/004 | Oppskriftssiden: grupper, mengder, «ca.», siste forbruksdag passert, forklaring med poeng, best før-ordlyd, allergenboks i tre varianter, 404, axe | `pages/recipes/RecipePage.test.tsx` | 8 |
| FR-REC-004 | Ingen tekst i noe språk sier «allergenfri»/«free from», forbeholdet finnes, alle allergener har navn | `web/src/i18n/locales.test.ts` (3 nye) | 3 |
| FR-DASH-001, FR-REC-004, spesifikasjon 05 | Middagskortet (allergener, ingen treff), ingen eksempeldata på forsiden, allergier på profilen, ingredienskobling på varesiden | `OverviewPage.test.tsx`, `navigation.test.tsx`, `ProfilePage.test.tsx`, `ItemPage.test.tsx` | 7 |
| FR-REC-001–004 | API mot database: tomt lager, detaljer, 404/400, ingredienser, rangering etter vare, for lite og omregning, summering, siste forbruksdag passert, best før passert, brukt opp, automatisk/manuell/ingen kobling, ukjent ingrediens, CHECK, allergier (lagre, rekkefølge, advarsler, valgfri ingrediens, ugyldig, kontosletting, ikke i loggen) | `api/test/recipes.api.test.ts` | 23 |
| NFR-SEC-001 | Annen husholdnings ID i URL-en, rangering uten andres lager og allergier, `/me/allergens` alltid egen, andres vare, 401 og CSRF, ingen skriving av oppskrifter | `api/test/recipes.security.api.test.ts` | 6 |
| FR-REC-001–004, FR-DASH-001, NFR-UX-001/002 | Ende-til-ende: vare lagt inn i skjemaet → oppskriften rangeres først og viser hva som mangler → forsiden; siste forbruksdag passert; allergier på profilen → skjult → vist med advarsel; axe og 360 px på fire sider i lyst og mørkt tema | `e2e/recipes.spec.ts` | 5 (× 2 skjermstørrelser) |

**Sum etter fase 5:** 637 enhetstester (267 shared, 60 api, 310 web), 158 API-tester mot database, 125
ende-til-ende-tester.

Eksisterende tester som ble endret fordi oppførselen var ment å endres:
- navigasjonstesten forventet ett merke med «Eksempeldata» på forsiden (nå ingen)
- tre profiltester forventet at første forespørsel var endringen (siden leser nå også allergiene)
- testdataene for `ItemResponse` fikk `ingredientMatch`/`ingredientId`
- axe-testene for alle sider og profilen i `app-shell.spec.ts` og `auth.spec.ts` bruker nå et vindu like høyt som
  siden på telefon (se «Begrensninger»)

**Ustabil test rettet:** `findBy*` i Testing Library gir opp etter 1 sekund. Med hele pakken i gang samtidig tok
første rendering av oppskriftslisten 1,4 sekunder, og testen feilte tilfeldig (2 av 4 kjøringer). Fristen er nå
3 sekunder for alle webtester (`test/setup.ts`). Etterpå gikk pakken grønt 5 av 5 ganger. Samme årsak forklarer
trolig at en axe-test i `InventoryPage` feilet én gang tidligere i fasen, men det er ikke undersøkt for seg.

### Kontroll av testene (fase 5)

Én regel eller beskyttelse ble slått av i koden om gangen
([skript](../evidence/test-results/fase-5/10-mutation-check.sh)). Både enhetstestene og API-testene ble kjørt.

**Første kjøring** ([utdata](../evidence/test-results/fase-5/10-mutation-check-run1.txt)) viste to problemer:
- **Allergener fra valgfrie ingredienser** kunne ignoreres uten at noen test feilet. Ingen testoppskrift hadde en
  valgfri ingrediens med et allergen. Testoppskriften med kylling og ris fikk valgfrie sesamfrø, og en ny API-test
  sjekker advarselen.
- **Tallene for enhetstestene var ikke til å stole på:** runder som bare endret API-kode, viste 1–2 feilende
  enhetstester. Det var den ustabile testen over, ikke endringen.

**Andre kjøring** ([utdata](../evidence/test-results/fase-5/10-mutation-check.txt)) viser også *hvilke* tester som
feilet, slik at det går an å se at riktig test fanget endringen:

| Endring | Enhet | API |
|---|---|---|
| Oppskriftsrutene uten `householdAccess` | 0 | 21 |
| Matlageret leses uten husholdningsfilter | 0 | 2 |
| Lagring av allergier sletter alle brukeres allergier | 0 | 1 |
| Valgt ingrediens sjekkes ikke mot tabellen | 0 | 1 |
| Partier med passert siste forbruksdag regnes med | 2 | 1 |
| Omregning runder opp | 2 | 0 |
| Valgfrie ingredienser teller i poengsummen | 2 | 5 |
| Basisvarer regnes som vanlige ingredienser | 2 | 4 |
| Ingen grense på bonus for «går snart ut» | 1 | 0 |
| Best før passert gir ikke bonus | 1 | 1 |
| Tvetydige navn gjettes | 2 | 0 |
| Manuell kobling ignoreres | 2 | 1 |
| «Ikke en ingrediens» ignoreres | 2 | 1 |
| Aliaser treffer deler av ord | 3 | 1 |
| Allergener fra valgfrie ingredienser telles ikke | 0 | 2 |
| Oppskrift uten forfatter godtas | 1 | 0 |
| Samme alias på to ingredienser godtas | 1 | 0 |
| Oppskrifter med brukerens allergener skjules ikke | 4 | 0 |
| Forbeholdet fjernes fra oppskriften | 3 | 0 |
| En tekst sier «allergenfri» | 2 | 0 |
| *Uendret kode* | *0 (637 av 637)* | *0 (158 av 158)* |

Alle 20 endringer ble fanget. Kontrollen dekker ikke alt: CHECK-begrensningene i databasen ble ikke slått av, og
ende-til-ende-testene ble ikke kjørt i kontrollen.

## Resultater fase 5 (kjørt 2026-10-21)

| Sjekk | Resultat | Bevis |
|---|---|---|
| Typesjekk, lint, formatering | Ingen feil | `01`–`03` |
| Enhet/komponent | 637 av 637 | `04-unit-tests.txt` |
| API mot testdatabase | 158 av 158 | `05-api-tests.txt` |
| Bygg | Vellykket. Advarsel om stor JS-fil (690 kB). | `06-build.txt` |
| Ende-til-ende | 125 bestått, 23 hoppet over (20 skjermbilder, 3 som bare gjelder én skjermstørrelse) | `07-e2e.txt` |
| `npm audit` | 0 sårbarheter | `08-npm-audit.txt` |
| Migreringsstatus | À jour (5 migreringer) | `09-migrate-status.txt` |

Skjermbilder (lyst og mørkt tema, 360 px og desktop) ligger i
[screenshots/fase-5/](../evidence/screenshots/fase-5/). De viser testoppskriftene, merket «Testdata».

## Feil funnet i fase 5

Alle funnene ble gjort av KI-verktøyet under implementeringen 2026-10-21.

| # | Funn | Hvordan funnet | Retting |
|---|---|---|---|
| 1 | Uavgjort mellom aliaser ble avgjort av ordlengde. «Kyllingfilet med løk» ble kylling, og «smør og melk» ble avgjort av tilfeldigheter. | Enhetstest | Like mange ord gir ingen kobling. Spesifikasjonen er rettet. |
| 2 | Samme varenavn ble vist to ganger («Kyllingfilet og Kyllingfilet») når to varer het det samme | Gjennomgang av egne skjermbilder | Navnene vises én gang. Ny test. |
| 3 | Filtrene i oppskriftslisten fylte hele første skjermbilde på 360 px | Gjennomgang av egne skjermbilder | Tagg og allergenbryter i sammenleggbar «Filtrer», og lenken «Vis dem likevel» |
| 4 | To knapper het «Endre» på varesiden. Det er uklart for skjermleserbrukere. | Skjermbildeskriptet feilet (Playwright strict mode) | «Endre ingrediens» |
| 5 | Salt og krydder i gram kunne ikke måles i teskje. Teamet ville fått feil på «1 ts salt». | Frødatasjekken på testoppskriftene | Omregning fra ml (anslag) for salt, krydder og noen sauser |
| 6 | Hull i testene og en ustabil test (se kontrollen over) | Mutasjonskontrollen | Ny testoppskrift og test, og lengre frist i Testing Library |

Feil i testene:
- én test forventet feil rekkefølge (alle oppskrifter med 0 poeng sorteres etter færrest manglende, ikke tittel)
- én testfil fikk et usynlig hardt mellomrom (kjent fallgruve)
- `Pick<…, 'a' | 'b'>` i delt kode traff regexen i `locales.test.ts` som ser etter øre-feilkoder
- `check()` i Playwright leste av en avkrysningsboks før routeren hadde oppdatert den

## Testtyper og sporbarhet (fase 6)

Testene refererer til krav-ID-ene i [06-handleliste.md](../development/requirements/06-handleliste.md). API- og
ende-til-ende-testene bruker de fiktive testoppskriftene (`source=test`).

| Krav | Hva testes | Fil | Antall |
|---|---|---|---|
| FR-SHOP-001–003 (regler) | Sammenslåing (samme enhet, linje uten mengde, annen enhet, øvre grense, heltall), forslag fra oppskrift (bare manglende krysset av, basisvarer, valgfrie, ukjent mengde, står på listen), rekkefølge, kobling av tekst og ny vare til ingrediens | `shared/src/shopping/list.test.ts` | 16 |
| NFR-SEC-002 | Skjemaene: tekst, mengde med enhet, «minst ett felt», ingen ingrediens eller linje to ganger, mål for lageret | `shared/src/schemas/shopping.test.ts` | 8 |
| FR-SHOP-001–003 | Servicen med fakes: kobling ved ny linje, `clientRequestId` og tapt kappløp, avhuking med tidspunkt, 404/409, ingrediens utenfor oppskriften, parti uten pris og kjøp, kobling av ny vare, andres sted/vare, kappløp under skriving | `api/src/modules/shopping/service.test.ts` | 18 |
| FR-SHOP-001–003 | Skjemalogikken i nettleseren: mengder til grunnenhet, forslag til API-kropp, første gjetning i lagerdialogen, feltfeil med API-ets navn | `web/src/shopping/forms.test.ts` | 10 |
| FR-SHOP-001/003, KURS-03 | Siden: tom tilstand, rekkefølge og bidrag, hurtigfelt med Enter og fokus, optimistisk avhuking før svaret, tilbakerulling når også ny henting feiler, fjern/endre/fjern avhukede, fokus til neste rad, lagerdialogen (kropp, 409, enhet fra mengden), axe | `pages/shopping/ShoppingListPage.test.tsx` | 14 |
| FR-SHOP-002, FR-DASH-001 | Dialogen på oppskriftssiden (hva er krysset av, endret mengde, «står på listen», alt i boks) og antall på forsiden | `RecipePage.test.tsx`, `OverviewPage.test.tsx` | 5 |
| FR-SHOP-001–003, NFR-DATA-002 | API mot database: én liste, kontosletting, kobling, linje for seg ved åpen ingrediens, `clientRequestId` (også samtidig), avhuking, 409 ved fjernet hake, retting, ugyldig input, sletting, rekkefølge, oppskrift (navn/enhet, samme oppskrift igjen, sammenslåing, to oppskrifter, samtidig, ikke i oppskriften, 404), seed beholder ingrediens, til lageret (kobling, rangering høyere, ingen kjøp, eksisterende vare, alt eller ingenting, ikke avhuket, to ganger, samtidig, kappløp i repoet), logg | `api/test/shopping.api.test.ts` | 32 |
| NFR-SEC-001 | Andres husholdnings-ID på alle sju endepunkter, andres linje via egen husholdning, andres sted/vare, «fjern avhukede» og sammenslåing rører ikke andre, 401 og CSRF på alle | `api/test/shopping.security.api.test.ts` | 5 |
| FR-SHOP-001–003, NFR-UX-001/002 | Ende-til-ende: oppskrift → legg manglende i listen → huk av (også etter ny lasting) → legg i lageret → oppskriften får høyere poengsum, ingen kjøp; dobbeltklikk gir ett parti; føring for hånd; 360 px, trykkflater ≥ 44 px og axe i lyst og mørkt tema | `e2e/shopping.spec.ts` | 5 (× 2 skjermstørrelser) |

**Sum etter fase 6:** 708 enhetstester (291 shared, 78 api, 339 web), 195 API-tester mot database, 135
ende-til-ende-tester.

Eksisterende tester ble ikke endret. `mockApi` svarer nå med en tom handleliste som standard.

### Kontroll av testene (fase 6)

Én regel eller beskyttelse ble slått av i koden om gangen
([skript](../evidence/test-results/fase-6/10-mutation-check.sh)). Enhetstestene og API-testene ble kjørt.

**Første kjøring** ([utdata](../evidence/test-results/fase-6/10-mutation-check-run1.txt)) viste tre ting:
- **Runde 5 ble ikke fanget:** kravet `checked: true` i slettingen i repoet kunne fjernes. Servicen sjekker det
  samme før skrivingen, så kravet i repoet beskytter bare mot at haken fjernes på en annen telefon mellom sjekken og
  skrivingen. Ingen test dekket det. En ny API-test kaller repoet direkte med en linje som ikke er avhuket.
- **Runde 20 ble ikke fanget:** tilbakerullingen i `onError` kunne fjernes, fordi hentingen etterpå uansett viste
  serverens data. Testen lar nå også den nye hentingen feile, så bare tilbakerullingen kan rette visningen.
- **Runde 14 var ugyldig:** endringen ga en syntaksfeil, så alle testfilene feilet av feil grunn. Mutasjonen er
  rettet.

**Andre kjøring** ([utdata](../evidence/test-results/fase-6/10-mutation-check.txt)):

| Endring | Enhet | API |
|---|---|---|
| Rutene uten `householdAccess` | 0 | 37 |
| Retting filtrerer ikke på husholdning | 0 | 1 |
| Sletting filtrerer ikke på husholdning | 0 | 1 |
| «Fjern avhukede» i alle husholdninger | 0 | 1 |
| Til lageret uten krav om avhuket | 0 | 1 |
| Til lageret uten kontroll av antall slettet | 0 | 2 |
| Samme oppskrift to ganger på en linje | 0 | 2 |
| Listen låses ikke | 0 | 1 |
| `clientRequestId` sjekkes ikke | 2 | 0 |
| Ingrediens utenfor oppskriften godtas | 1 | 1 |
| Andres sted godtas | 1 | 2 |
| Andres vare godtas | 1 | 1 |
| Avhuking uten tidspunkt | 1 | 12 |
| Sammenslåing på tvers av enheter | 1 | 0 |
| Linje uten mengde får oppskriftens mengde | 1 | 1 |
| Basisvarer og valgfrie krysses av | 2 | 0 |
| «Litt for lite» foreslår hele mengden | 2 | 0 |
| Ny vare kobles aldri til ingrediensen | 2 | 1 |
| Seed sletter ingrediens i bruk | 0 | 1 |
| Ingen tilbakerulling ved feil | 1 | 0 |
| Boksene bygges ikke på nytt etter tilbakerulling | 1 | 0 |
| Den delegerte lytteren legges ikke til | 3 | 0 |
| *Uendret kode* | *0 (708 av 708)* | *0 (195 av 195)* |

Alle 22 endringer ble fanget, og utdataene viser at det var de riktige testene som feilet. Kontrollen dekker ikke
CHECK-begrensningene eller den delvise unike indeksen for seg, og ende-til-ende-testene ble ikke kjørt i kontrollen.
At låsen på listen (runde 8) ble fanget, avhenger av at samtidige forespørsler faktisk overlapper i testen. Det
gjorde de i begge kjøringene, men det er ikke garantert.

## Resultater fase 6 (kjørt 2026-10-21)

| Sjekk | Resultat | Bevis |
|---|---|---|
| Typesjekk, lint, formatering | Ingen feil | `01`–`03` |
| Enhet/komponent | 708 av 708 | `04-unit-tests.txt` |
| API mot testdatabase | 195 av 195 | `05-api-tests.txt` |
| Bygg | Vellykket. Advarsel om stor JS-fil (720 kB). | `06-build.txt` |
| Ende-til-ende | 135 bestått, 7 hoppet over (4 skjermbilder, 3 som bare gjelder én skjermstørrelse) | `07-e2e.txt` |
| `npm audit` | 0 sårbarheter | `08-npm-audit.txt` |
| Migreringsstatus | À jour (6 migreringer) | `09-migrate-status.txt` |

Skjermbilder (lyst og mørkt tema, 360 px og desktop) ligger i
[screenshots/fase-6/](../evidence/screenshots/fase-6/).

## Feil funnet i fase 6

Alle funnene ble gjort av KI-verktøyet under implementeringen 2026-10-21.

| # | Funn | Hvordan funnet | Retting |
|---|---|---|---|
| 1 | En avkrysningsboks kunne vise hake etter at serveren avviste avhukingen (ukontrollert boks, samme nøkkel før og etter) | Komponenttest | Ny nøkkel ved tilbakerulling |
| 2 | «Mengde (valgfritt)» brøt over to linjer i hurtigfeltet på 360 px, så feltene stod skjevt | Gjennomgang av egne skjermbilder | To kolonner og knapp i full bredde på telefon |
| 3 | Mengden stod to ganger på linjer fra én oppskrift («150 g» og «Testrett: pannekaker: 150 g») | Gjennomgang av egne skjermbilder | «Fra Testrett: pannekaker» |
| 4 | To felt het «Enhet» i dialogen for ny vare | Gjennomgang av egne skjermbilder | Ett felt. Grunnenheten følger av enheten ved mengden. |
| 5 | To hull i testene og en ugyldig mutasjon (se kontrollen over) | Mutasjonskontrollen | Ny API-test og strengere komponenttest |

Feil i testene:
- én testfil fikk et usynlig hardt mellomrom (kjent fallgruve, tredje gang)
- testene for innlogging og CSRF sendte tom kropp, og fikk 400 fra valideringen før sjekken de skulle teste
- skjermbildeskriptet prøvde å huke av melk, som testdataene allerede hadde nok av

## Testtyper og sporbarhet (fase 7)

Testene refererer til krav-ID-ene i [07-strekkode.md](../development/requirements/07-strekkode.md). **Ingen test
kaller Open Food Facts:** `apps/api/test/noNetwork.ts` stopper `fetch` i alle API-tester, og API- og
ende-til-ende-testene bruker den ekte provideren med en falsk `fetch` med oppdiktede produkter
(`apps/api/test/fakeOff.ts`).

| Krav | Hva testes | Fil | Antall |
|---|---|---|---|
| FR-SCAN-003 | Kontrollsiffer (verdier regnet ut for seg), EAN-8/13, UPC-A, GTIN-14, mellomrom og bindestrek, feilmeldinger, UPC-E (alle fire regler), butikkens egne koder, `gtinSchema`, kategorier fra OFF | `shared/src/barcode/gtin.test.ts` | 37 |
| FR-SCAN-002, NFR-REL-001 | OFF-provideren: treff, ukjent (404 og 200), URL og felt, User-Agent, innlogging bare mot OFF sitt testmiljø, tidsavbrudd, nettverksfeil, HTTP-feil, seks slags ugyldige svar, for stort svar, egen grense, nekter alt som ikke er en GTIN, navn/merke/pakningsstørrelse, ingen nettilgang i testene | `api/src/providers/barcode/openFoodFacts.test.ts` | 41 |
| FR-SCAN-002/-004/-005 | Servicen med fakes: rekkefølge, mellomlager 30 dager / 24 timer, feil lagres ikke, gammelt treff når OFF er nede, husholdningens svar vinner, butikkens egne koder, grense per bruker, bekreftelse, `clientRequestId` og tapt kappløp, ingrediens, sted, vare som er borte | `api/src/modules/barcodes/service.test.ts` | 17 |
| Spec 07, ADR-0015 | Telleren for grensene, og konfigurasjonen (`TRUST_PROXY`, `COOKIE_HOST_PREFIX`, OFF-innstillinger) | `windowLimiter.test.ts`, `config.test.ts` | 2 + 12 |
| FR-SCAN-001/-002/-005 | Skjemalogikken: utfylling fra OFF og fra husholdningen, ingen dato, sted som ikke finnes lenger, varen fra sist, kropp til API-et, feltfeil, bytte av enhet | `web/src/scan/scanForm.test.ts` | 10 |
| FR-SCAN-001 | Kameratilstander og feilnavn, `stopStream`, format | `web/src/scan/camera.test.ts` | 13 |
| FR-SCAN-001–005 | Skannesiden: feil kontrollsiffer sendes ikke, normalisert kode i URL-en, ugyldig kode i URL-en, utfylt skjema → bekreft (én POST, `clientRequestId`), påkrevde felt, tre statustekster, varen fra sist, «Ny vare», 429, kreditering, ikke sikker side, ingen kamerastøtte, tre kamerafeil, kamera bare på forespørsel og stoppet etter lesing (feillesing ignorert), UPC-E, «Stopp kamera», axe | `pages/scan/ScanPage.test.tsx` | 20 |
| ADR-0015 | Banner og stengt registrering i nettleseren | `layout/StagingBanner.test.tsx` | 5 |
| FR-SCAN-002/-004/-005, NFR-DATA-002 | API mot database: ugyldig kode (400, ingenting til OFF), UPC-A, treff og mellomlager på tvers av husholdninger, oppslag lagrer ingenting, ukjent, tidsavbrudd og ugyldig svar (ingenting lagret, årsak i loggen, ikke koden), butikkens egne koder, bekreftelse (vare, parti, hendelse), oppskriftsmatching for skannet vare, huskede svar og nytt parti på samme vare, ingrediens, ugyldig ingrediens, to ganger og fem samtidig gir ett parti, ugyldig kropp, sletting av vare, sted og konto, seed beholder ingrediens | `api/test/barcodes.api.test.ts` | 24 |
| NFR-SEC-001 | Andres husholdnings-ID (404), andres vare og sted (404/400), andres `clientRequestId`, repoet filtrerer selv, andres huskede svar vises aldri, 401, CSRF, Origin, grense per bruker (også fra samme IP) | `api/test/barcodes.security.api.test.ts` | 14 |
| ADR-0015 | `trustProxy` (egen grense per klient bak proxy, falsk header fra andre ignoreres), stengt registrering, `__Host-`-cookie, servering av webappen (sideruter, CSP med hash og `'wasm-unsafe-eval'`, buffer, `.wasm`, JSON-404 for API), `Permissions-Policy` | `api/test/staging.api.test.ts` | 8 |
| FR-SCAN-001–005, NFR-REL-001, NFR-UX-001/002 | Ende-til-ende: skriv inn kjent kode → utfylt skjema → bekreft → varen er i matlageret (bare egen server ble spurt), ukjent kode huskes og gir nytt parti, OFF svarer ikke, dobbeltklikk gir ett parti, feil kontrollsiffer, ingen kameratilgang, ingen kamerastøtte, 360 px og axe i lyst og mørkt tema | `e2e/scan.spec.ts` | 9 (× 2 skjermstørrelser) |
| FR-SCAN-001 | **Ekte kamera i Chromium:** falskt kamera som viser en generert EAN-13-video. Reserveleseren (zxing-wasm) leser koden, wasm-filen kommer fra egen server, og kameraet stoppes. Tegningen er sjekket mot zxing sin egen. | `e2e/scan-camera.spec.ts` | 2 (× 2) |

**Sum etter fase 7:** 863 enhetstester (328 shared, 148 api, 387 web), 241 API-tester mot database, 157
ende-til-ende-tester.

Eksisterende tester ble ikke endret, bortsett fra at `testConfig` og `e2e/fixtures.ts` fikk nye felt
(`inventory()`). Skjermbildeskriptet viser nå skannesiden.

### Kontroll av testene (fase 7)

Samme metode som før: én regel eller beskyttelse slås av om gangen, og enhetstestene og API-testene kjøres
([skript](../evidence/test-results/fase-7/10-mutation-check.sh)). 30 endringer, også i oppsettet for testmiljøet og
i kamerakoden.

**Første kjøring** ([utdata](../evidence/test-results/fase-7/10-mutation-check-run1.txt)): 29 av 30 ble fanget.
**Runde 3 ble ikke fanget:** `itemSummary` kunne slutte å filtrere på husholdning. Det kan ikke misbrukes gjennom
API-et, fordi `item_id` kommer fra husholdningens egen rad, og fremmednøkkelen sikrer samme husholdning. Filteret er
et ekstra lag. En ny API-test kaller repoet direkte med en annen husholdnings vare.

**Andre kjøring** ([utdata](../evidence/test-results/fase-7/10-mutation-check.txt)): alle 30 ble fanget, og
utdataene viser at det var de riktige testene som feilet. Uendret kode: 863 av 863 og 241 av 241.

Kontrollen dekker ikke CHECK-begrensningene for seg, og ende-til-ende-testene ble ikke kjørt i kontrollen. Feilen med
`dataUpdatedAt` (funn 3 under) ble bare fanget av Playwright, ikke av noen enhetstest.

## Resultater fase 7 (kjørt 2026-10-22)

| Sjekk | Resultat | Bevis |
|---|---|---|
| Typesjekk, lint, formatering | Ingen feil | `01`–`03` |
| Enhet/komponent | 863 av 863 | `04-unit-tests.txt` |
| API mot testdatabase | 241 av 241 | `05-api-tests.txt` |
| Bygg | Vellykket. Hovedfilen er 739 kB (223 kB gzip). Skanneren ligger for seg: `CameraScanner` 2,8 kB, reserveleseren 43 kB og wasm 1,09 MB (461 kB gzip), bare lastet ved behov. | `06-build.txt` |
| Ende-til-ende | 157 bestått, 7 hoppet over (4 skjermbilder, 3 som bare gjelder én skjermstørrelse) | `07-e2e.txt` |
| `npm audit` | 0 sårbarheter | `08-npm-audit.txt` |
| Migreringsstatus | À jour (7 migreringer; rettet 2026-10-24, stod først 8) | `09-migrate-status.txt` |

Første forsøk på sluttkjøringen ble avbrutt mens API-testene kjørte (prosessen ble drept, kode 137). Årsaken ble ikke
funnet. Minnet på serveren var ikke fullt da det ble sjekket etterpå. API-testene ble kjørt på nytt for seg, og
utdataene i `05` er fra den kjøringen.

**Røyktest av testmiljøet:** Docker-bildet ble bygd og startet med midlertidige containere på serveren (eget nett,
port bare på 127.0.0.1), og så fjernet. Med `curl` ble dette sjekket:
- CSP, `Permissions-Policy`, `.wasm` som `application/wasm`, 403 ved registrering, JSON-404 for API-et
- prosessen kjører som brukeren `node`

Et Playwright-skript i nettleseren logget inn med `__Host-`-cookien, leste en strekkode med det falske kameraet
(reserveleseren under den ekte CSP-en), og la til en vare. Dette er ikke lagret som bevisfil, fordi det var en
engangssjekk med midlertidige containere.

Skjermbilder (lyst og mørkt tema, 360 px og desktop) ligger i
[screenshots/fase-7/](../evidence/screenshots/fase-7/). I headless Chromium gir «Start kamera» meldingen «Fant ikke
noe kamera» (det finnes ikke noe kamera).

**Ikke testet:** ekte telefoner (Android og iPhone) og ekte strekkoder på varer. Det krever testmiljøet med HTTPS.
Sjekklisten står i [testmiljo.md](../development/testmiljo.md).

## Feil funnet i fase 7

Alle funnene ble gjort av KI-verktøyet under implementeringen 2026-10-22.

| # | Funn | Hvordan funnet | Retting |
|---|---|---|---|
| 1 | Planen sa at OFF tillater rundt 100 oppslag i minuttet. Riktig tall er 15 per IP. | Vilkårene ble lest før koden ble skrevet | Grense på 10 i minuttet totalt, og mellomlager |
| 2 | Strekkoden stod i URL-en i loggen | Egen API-test for loggen | `redactUrl` |
| 3 | Etter bekreftelsen kom ingen melding, og koden ble stående i URL-en: skjemaet var nøklet på `dataUpdatedAt`, ble bygd på nytt da oppslaget ble hentet igjen, og `onSuccess` i `mutate` ble aldri kalt | Playwright (komponenttesten fanget det ikke) | Nøkkel bare på koden |
| 4 | `prisma generate` i Docker-bygget krever `DATABASE_URL` | Docker-bygget feilet | Plassholder under bygget |
| 5 | Helmets `upgrade-insecure-requests` ville stoppet en nettlesertest over http, og trengs ikke bak Caddy | Røyktesten | Slått av |
| 6 | Et regulært uttrykk med kontrolltegn ble stoppet av lint | ESLint | Filtrering på tegnkoder |
| 7 | Ett hull i testene (se kontrollen over) | Mutasjonskontrollen | Ny API-test |

Feil i testene:
- to av KI-ens egne testverdier for UPC-E hadde feil kontrollsiffer (funnet da de ble regnet ut på nytt i Python)
- paritetstabellen i generatoren for den falske kameravideoen hadde radene for 6 og 7 byttet. Strekkodeleseren fant
  derfor ingenting. Funnet ved å lese bildet med zxing i Node og sammenligne med zxing sin egen tegning. Testen
  sammenligner nå med den.
- tre Playwright-tester traff feil element: «Skap» i «Kjøleskap», to sider montert samtidig i en komponenttest, og
  «450 g» som stod fire steder
- en komponenttest ventet ikke på at skjemaet var lastet

## Testtyper og sporbarhet (fase 8)

Testene refererer til krav-ID-ene i [08-kvittering.md](../development/requirements/08-kvittering.md).
**Ingen test bruker en ekte kvittering eller en ekte OCR-tjeneste.**
- API- og ende-til-ende-testene bruker en falsk OCR som «leser» oppdiktede kvitteringstekster
  (`packages/shared/src/receipts/fixtures.ts`).
- Testene av Tesseract-kjøreren bruker en liten Node-prosess i stedet for Tesseract.
- Bildene i testene genereres med sharp.

| Krav | Hva testes | Fil | Antall |
|---|---|---|---|
| FR-RCPT-004 | Parseren med fiktive tekster i Coop-, NG- og generelt oppsett: beløp (punktum, komma, minus), kjede bare fra toppteksten (også med frukten «KIWI»), dato med to- og firesifret år, kvitteringsnummer, vekt og antall, pant, rabatt, kontrollsum, antall artikler, mat eller ikke mat. OCR-støy fra piloten: beløp på neste linje, beløp på antall-linjen, antall × pris retter et feillest beløp, kantstøy, «Part», O%, «Tota1t», junk etter totalen, tid som ligner klokkeslett, umulige datoer. Betalingslinjer gjenkjennes og fjernes. | `shared/src/receipts/parse.test.ts` | 32 |
| FR-RCPT-001/002 | Filtype fra innholdet (JPEG, PNG, WebP; GIF, SVG og PDF nektes), EXIF med GPS og kamera fjernes, bildet rettes opp, største side 3000 px, ingen forstørring, ødelagt fil, 10 MB, «dekompresjonsbombe» på 48 MP, Otsu-terskel, papir på mørkt bord med lyse prikker, liggende papir, utretting (0°, 2°, −1,5°, 3,5°) | `api/src/providers/ocr/image.test.ts` | 13 |
| FR-RCPT-003 | Tesseract-kjøreren: stdin/stdout, tidsavbrudd dreper prosessen, feilkode, program som mangler, for mye utdata, ingen shell. Valg av retning: stående og liggende kvittering, kort kvittering (alle fire retninger når usikker), søppel med mange usikre ord taper, sikker lesing leses ikke på nytt, rått bilde én gang. Feil blir `timeout`, `unavailable`, `invalidResponse` eller `noText`. | `api/src/providers/ocr/tesseract.test.ts` | 12 |
| FR-RCPT-003 | TSV fra Tesseract: ord til linjer med sikkerhet, tomme ord, «empty» og «invalid», lange linjer kuttes | `api/src/providers/ocr/tesseractTsv.test.ts` | 4 |
| Pilotmålingen | Poengberegningen: CER mot del av linje, beløp med punktum og komma, nivå 1 og nivå 2, fasit med hele øre | `api/src/providers/ocr/pilot/score.test.ts` | 9 |
| FR-RCPT-007 | Den sterke duplikatnøkkelen: lik for samme kvittering, skjuler kvitteringsnummeret, endres med dato, total, tid, nummer og kjede, tom uten nummer eller tid | `api/src/modules/receipts/service.test.ts` | 3 |
| FR-RCPT-005 | Fra forslag til skjema: bare totalsum (ADR-0017, også når serveren har sendt linjer), dato som ikke ble lest, linjer med vekt og antall, merknader, nedskalering i nettleseren | `web/src/receipts/receiptForm.test.ts` | 5 |
| FR-RCPT-001/003/005/006 | Sidene: kamera og fil (`capture="environment"`), multipart med CSRF, samme bilde igjen (lenke), OCR av, liste med status i ord, i kø, tar lang tid, feilet og «Prøv igjen», borte etter 7 dager, gjennomgang med bare totalsum, lav sikkerhet og dato som ikke ble lest, linjer med «Sjekk», sum som ikke stemmer, mulig duplikat og «Lagre likevel», forkasting med dialog, registrert. Axe på tre av dem. | `web/src/pages/receipts/ReceiptPages.test.tsx` | 15 |
| FR-RCPT-001–008, NFR-SEC-004 | API mot database: opplasting og lagret bilde uten metadata, samme bilde, filtyper, størrelse og piksler, lest kvittering (bare butikk, dato og total), linjeforslag på, fire OCR-feil, provider som kaster, bare betalingslinjer, lest to ganger, nytt forsøk, liste, bildet med `no-store`, bekreftelse (kjøp, linjer, partier, hendelser, kvittering lukket, bilde og uttrekk slettet), samtidig bekreftelse gir ett kjøp, sterk og svak duplikatkontroll, kvittering som ikke er klar, kjøpsreglene, sted som ikke finnes, repoet nekter selv, forkasting, frist på 7 dager og opprydding, slettet kjøp, workeren som døde, OCR av, grense per bruker, full kø, ingen kvitteringstekst i loggene | `api/test/receipts.api.test.ts` | 30 |
| NFR-SEC-001 | Andres husholdnings-ID (404, også opplasting), andres kvitterings-ID (404), listen, samme bilde i to husholdninger, andres sted, duplikatsvar på tvers av husholdninger, samme kvittering i to husholdninger, repoet filtrerer selv, databasen nekter feil husholdning, 401, CSRF | `api/test/receipts.security.api.test.ts` | 10 |
| FR-RCPT-003 | Ekte pg-boss i testdatabasen: starter to ganger, jobben inneholder bare id-en | `api/test/receiptQueue.api.test.ts` | 1 |
| FR-RCPT-001/003/005/006/008, NFR-UX-001/002 | Ende-til-ende med ekte kø og falsk OCR: last opp → sjekk → bekreft → kjøpet og varen finnes, og listen er tom. Ulesbart bilde → årsak → «Fyll inn selv». Forkasting. 360 px og axe. | `e2e/receipts.spec.ts` | 3 (× 2 skjermstørrelser) |

**Sum etter fase 8:** 956 enhetstester (360 shared, 189 api, 407 web), 282 API-tester mot database, 163
ende-til-ende-tester.

Eksisterende tester ble endret så lite som mulig:
- `testConfig` fikk feltet `receipts`, og `mockApi` sender `FormData` videre.
- `e2e/fixtures.ts` fikk `receipts()`.
- To tester som starter prosesser, fikk 20 s tidsavbrudd.

Skjermbildeskriptet viser nå kvitteringssidene.

### Pilotmålingen er ikke en automatisk test

Målingen på ekte kvitteringer (`apps/api/scripts/ocr-pilot.ts`) kjøres for hånd, fordi bildene og fasiten ikke kan
ligge i repoet. Utdataene har bare samlede tall og ligger i `docs/evidence/test-results/fase-8/ocr-pilot-*.txt`
(kjøring 1–6). Resultatet og forbeholdene står i ADR-0017.

### Kontroll av testene (fase 8)

Samme metode som før ([skript](../evidence/test-results/fase-8/10-mutation-check.sh)), med 37 endringer.
**Avvik:** for å holde tiden nede ble bare API-testene for kvitteringer og kjøp kjørt for hver endring, ikke hele
API-pakken. Enhetstestene ble kjørt i sin helhet.

**Første kjøring** ([utdata](../evidence/test-results/fase-8/10-mutation-check-run1.txt)): 35 av 37 ble fanget.
- **Runde 31 ble ikke fanget** (kjeden letes etter i hele kvitteringen). Testen med frukten «KIWI» hadde «COOP
  EXTRA» i toppen, og Extra sjekkes før Kiwi, så rekkefølgen skjulte feilen. Ny fiktiv kvittering med bare «COOP».
- **Runde 36 ble ikke fanget** (linjene fylles inn selv om linjeforslag er av). Testen sendte en tom linjeliste. Ny
  test med linjer.
- **Runde 16 ble ikke fanget** (servicen sjekker ikke at kvitteringen er klar). Repoet sjekker det uansett i
  transaksjonen, så svaret ble det samme. En ny test kaller repoet direkte, og en ekstra mutasjon av repoets sjekk
  ([utdata](../evidence/test-results/fase-8/10-mutation-check-tillegg.txt)) viser at den fanges.

**Andre kjøring** ([utdata](../evidence/test-results/fase-8/10-mutation-check.txt)): 36 av 37 ble fanget, og
utdataene viser at det var de riktige testene som feilet. Runde 16 fanges fortsatt ikke, av samme grunn som over.
Uendret kode: 956 av 956 enhetstester og 89 av 89 API-tester.

**Ustabil test:** loggtesten (ingen kvitteringstekst i loggene) feilet én gang av fem kjøringer mellom de to
kontrollene. Feilmeldingen ble ikke lagret, så årsaken er **ikke bekreftet**. Den sannsynlige årsaken er at tall
fra den fiktive kvitteringen («13232», «424242») kan stå inne i en tilfeldig id i loggen. Tallene sjekkes nå bare
når de ikke er en del av en heks-streng. Testen bestod tre ganger på rad etterpå.

Kontrollen dekker ikke Playwright, CHECK-begrensningene og worker-oppsettet (`worker.ts`) for seg. Den ekte kjeden ble
røyktestet for hånd (under).

## Resultater fase 8 (kjørt 2026-10-24)

| Sjekk | Resultat | Bevis |
|---|---|---|
| Bilder i repoet | Ingen utenfor skjermbildemappen | `00-check-files.txt` |
| Typesjekk, lint, formatering | Ingen feil. Første formateringssjekk feilet på én fil som ikke var formatert (`03-format-check-forsok1.txt`). | `01`–`03` |
| Enhet/komponent | 956 av 956 | `04-unit-tests.txt` |
| API mot testdatabase | 282 av 282 | `05-api-tests.txt` |
| Bygg | Vellykket. Hovedfilen er 761 kB (232 kB gzip). | `06-build.txt` |
| Ende-til-ende | 163 bestått, 7 hoppet over (4 skjermbilder, 3 som bare gjelder én skjermstørrelse) | `07-e2e.txt` |
| `npm audit` | 0 sårbarheter | `08-npm-audit.txt` |
| Migreringsstatus | À jour (8 migreringer) | `09-migrate-status.txt` |
| Røyktest av den ekte kjeden | Fiktiv kvittering lest riktig etter én retting (se funn 6) | `11-royktest-ekte-kjede.txt` |

Enhets- og API-testene ble kjørt på nytt etter den andre mutasjonskontrollen, fordi testene var endret. Tallene over
er fra den siste kjøringen. Ende-til-ende-testene ble ikke kjørt på nytt, fordi bare testfiler og en ny fiktiv tekst
var endret etter den kjøringen.

Skjermbilder (lyst og mørkt tema, 360 px og desktop) ligger i
[screenshots/fase-8/](../evidence/screenshots/fase-8/). Kvitteringen på bildene er generert fra den fiktive teksten.

**Ikke testet:**
- ekte telefon (kamera og opplasting over mobilnett)
- iPhone sin omgjøring fra HEIC
- ekte kvitteringer ut over de 3 i piloten
- staging-containerne kjørende (bildet er bare bygd og kontrollert)

## Feil funnet i fase 8

Alle funnene ble gjort av KI-verktøyet under implementeringen 2026-10-24.

| # | Funn | Hvordan funnet | Retting |
|---|---|---|---|
| 1 | De ekte kvitteringene lå i roten av repoet som filer Git ikke sporet, og ingenting hindret at de ble committet | `git status` før planen | Flyttet ut, `.gitignore` og `check:files` |
| 2 | Beskjæringen fant ikke en smal kvittering: rader og kolonner ble målt mot hele bildet | Enhetstest, og deretter de to liggende bildene i piloten | Telling i to omganger |
| 3 | Tesseracts OSD valgte feil retning på to av tre ekte kvitteringer | Pilotkjøring 1 (0 treff) | Retning fra papirets form, lese to retninger |
| 4 | Med psm 4 kunne beløpskolonnen forsvinne | Selvtest av måleskriptet med fiktiv kvittering | psm 4 og 6 målt. psm 4 ble valgt på grunn av målingen. |
| 5 | Parseren mistet linjer OCR hadde lest, og laget ekstra linjer | Pilotkjøring 3 | Åtte generelle rettinger, hver med fiktiv test (spesifikasjon 08) |
| 6 | En kort kvittering som lå på siden, ble ikke lest (den så stående ut) | Røyktest med ekte Tesseract | Leser alle fire retninger når usikker |
| 7 | Målet «ord × snittsikkerhet» valgte søppeltekst i feil retning | Pilotkjøring 5 (psm 6 falt til 0) | Antall sikre ord |
| 8 | sharp gjør et rått gråtonebilde om til 3 kanaler ved skalering | Enhetstest | `toColourspace('b-w')` |
| 9 | `singletonKey` i pg-boss hindrer ikke doble jobber | Test mot ekte pg-boss | Fjernet. Workeren tåler doble jobber. |
| 10 | En kilopris kunne bli tatt for linjebeløpet | Gjennomlesing av koden mot formatene | Bare beløp etter prisen teller |
| 11 | Tre hull i testene (se kontrollen over) | Mutasjonskontrollen | Nye tester |

Feil i målingen og testene:
- minnemålingen målte et tomt kjøretrinn: en bakgrunnsjobb i `sh` får stdin fra `/dev/null`
- to av KI-ens egne fiktive tall i Coop-eksempelet var feil (artikler og mva), funnet da de ble regnet etter
- tvetydige lokatorer i Playwright («Totalsum» er både en radioknapp og et felt), og flere `role="status"` i en
  komponenttest
- forventninger i testene som ikke stemte med regelen, for eksempel kantord med siffer
- loggtesten var ustabil (se over)

## Begrensninger

- axe og andre automatiske verktøy finner bare en del av tilgjengelighetsproblemene. **Manuell test med skjermleser
  (NVDA/VoiceOver) og tastatur er ikke gjort.**
- Bare Chromium er testet. Firefox og Safari (WebKit) er ikke testet.
- Ingen brukertesting med ekte personer.
- Kontrast i jsdom-testene er slått av (jsdom regner ikke ut stiler). Kontrast sjekkes i stedet i Playwright og i
  `tokens.test.ts`.
- Ingen kodedekning (coverage) er målt.
- **Allergenmerkingen og omregningene er ikke testet mot virkeligheten.** Testene sjekker at reglene virker, ikke at
  dataene i `prisma/seed/ingredients.json` (KI-utkast) er riktige. Det må teamet kontrollere.
- Ende-til-ende-testene kjører mot et API med høye rate limits (alle tester registrerer brukere fra samme adresse).
  Selve grensene er testet i API-testene.
- Det er ikke gjort noen penetrasjonstest eller ekstern sikkerhetsgjennomgang.
- **axe på telefon med fast bunnmeny:** axe vurderer bare siden slik den står når den lastes. Et felt som da
  tilfeldigvis ligger halvveis bak den faste bunnmenyen, blir rapportert som for lite (WCAG 2.5.8), selv om
  brukeren kan scrolle det fram. I `e2e/inventory.spec.ts` kjøres derfor axe på telefon med et høyt vindu
  (360 × 2400 px), slik at hele siden får plass. Fra fase 5 setter hjelpefunksjonen `useTallPhoneViewport` høyden
  etter sidens faktiske lengde (designsystemsiden er lengre enn 2400 px), og den brukes også i de eldre testene i
  `app-shell.spec.ts` og `auth.spec.ts`. Oppskriftslisten og profilen ble så lange at et kort og en avkrysningsboks
  havnet bak menyen (målt: y ≈ 785–790 px, menyen y 735–800 px i et vindu på 360 × 800 px). Bredden er fortsatt 360 px. Ved ett tilfelle var funnet reelt nok
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
