# Testing og testresultater

> **Status: UTKAST.** Skrevet etter fase 1 og fase 2 (2026-10-20). Testene og teksten er laget av KI (Claude) og
> ikke gjennomgått av teamet ennå. Alle resultater under er fra faktiske kjøringer. Utdataene er lagret ordrett i
> [fase-1/](../evidence/test-results/fase-1/) og [fase-2/](../evidence/test-results/fase-2/).
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

## Kilder i prosjektet

- [Testbevis fase 1](../evidence/test-results/fase-1/)
- [Skjermbilder fase 1](../evidence/screenshots/fase-1/)
- [Testbevis fase 2](../evidence/test-results/fase-2/), [skjermbilder fase 2](../evidence/screenshots/fase-2/)
- [Fasespesifikasjon 02](../development/requirements/02-database-og-autentisering.md)
- [Fasespesifikasjon 01](../development/requirements/01-designsystem-og-app-skall.md)
