# Bevisoversikt

**Status:** Samlet av KI (Claude) i fase 14, 2026-10-27. Alle tall er lest fra de lagrede utdatafilene, ikke fra
utviklingsloggen eller kapitlene (antall mutasjoner er talt med et skript, og ett tall i kapittel 11 ble rettet etter
det, se nederst). **Ikke gjennomgått av teamet.**

Alle testkjøringer under er gjort av KI på utviklingsserveren. Ingen av dem er gjort av teamet, og ingen er gjort på
en ekte telefon eller med skjermleser. Hva som *ikke* er testet, står i [eget avsnitt](#det-som-ikke-er-testet).

## Slik leses tabellene

- **Enhet** = enhets- og komponenttester (Vitest, uten database). **API** = API-tester mot en ekte testdatabase.
  **E2E** = Playwright i Chromium, 360 px og 1280 px, med axe. Tallet er antall beståtte tester i den lagrede
  kjøringen. Alle tellingene øker fordi testene fra tidligere faser kjøres på nytt hver gang.
- **Mutasjonskontroll** = en beskyttelse i koden slås av med vilje, én om gangen, og vi ser om testene oppdager det.
  «Fanget» betyr at minst én test feilet. Kontrollrunden med uendret kode er ikke talt med.
- **Feilede forsøk** er lagret ved siden av den kjøringen som besto. Årsakene står i kapittel 11.
- **Hovedfil** = størrelsen på `index-*.js` i bygget (før gzip).

## Testresultater per fase

| Fase | Kjørt | Enhet | API | E2E | `npm audit` | Hovedfil | Utdata |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-20 | 233 | – | 63 | 0 | 517 kB | [fase-1/](test-results/fase-1/) |
| 2 | 2026-10-20 | 331 | 47 | 95 | 0 | 566 kB | [fase-2/](test-results/fase-2/) |
| 3 | 2026-10-21 | 426 | 81 | 107 | 0 | 619 kB | [fase-3/](test-results/fase-3/) |
| 4 | 2026-10-21 | 505 | 129 | 115 | 0 | 658 kB | [fase-4/](test-results/fase-4/) |
| 5 | 2026-10-21 | 637 | 158 | 125 | 0 | 690 kB | [fase-5/](test-results/fase-5/) |
| 6 | 2026-10-21 | 708 | 195 | 135 | 0 | 720 kB | [fase-6/](test-results/fase-6/) |
| 7 | 2026-10-22 | 863 | 241 | 157 | 0 | 739 kB | [fase-7/](test-results/fase-7/) |
| 8 | 2026-10-24 | 956 | 282 | 163 | 0 | 761 kB | [fase-8/](test-results/fase-8/) |
| 9 | 2026-10-24 | 1058 | 317 | 167 | 0 | 803 kB | [fase-9/](test-results/fase-9/) |
| 10 | 2026-10-25 | 1104 | 356 | 175 | 0 | 836 kB | [fase-10/](test-results/fase-10/) |
| 11 | 2026-10-25 | 1178 | 395 | 183 | 0 | 864 kB | [fase-11/](test-results/fase-11/) |
| 12 | 2026-10-25 | 1293 | 442 | 187 | 0 | 881 kB | [fase-12/](test-results/fase-12/) |
| 13 | 2026-10-27 | 1364 | 491 | 209 | 0 | 608 kB | [fase-13/](test-results/fase-13/) |
| 14 | 2026-10-27 | 1364 | 491 | 209 | 0 | 608 kB | [fase-14/](test-results/fase-14/) |
| 15 | 2026-10-30 | 1412 | 538 | 215 | 0 | 616 kB | [fase-15/](test-results/fase-15/) |

Typesjekk, lint og formatering er lagret som `01`–`03` i hver mappe, og migreringsstatus som `09` fra fase 2.
Fase 14 endret ingen appkode. Kjøringen viser at ingenting er brutt av endringene i fase 14 (dokumentasjon og
`scripts/traceability.mjs`), og filene er nummerert `10`–`18`. `01`–`04` er kontrollene av dokumentasjonen
(sporbarhet, lenker, mutasjonstelling, kodehenvisninger), og `05`–`06` er lenkesjekk og formatering etter del 2 av
fase 14.
Fase 6 og 7 har ikke tidspunkt i filhodet. Datoen er hentet fra veikartet.

## Feilede forsøk som er lagret

| Fase | Fil | Resultat | Hva som skjedde (kapittel 11) |
|---|---|---|---|
| 8 | [03-format-check-forsok1.txt](test-results/fase-8/03-format-check-forsok1.txt) | én fil ikke formatert (`ReceiptPage.tsx`) | Formatert, sjekken kjørt på nytt |
| 9 | [03-format-check-forsok1.txt](test-results/fase-9/03-format-check-forsok1.txt) | én fil ikke formatert (`e2e-server.ts`) | Formatert, typesjekk og lint kjørt på nytt |
| 10 | [07-e2e-forsok1.txt](test-results/fase-10/07-e2e-forsok1.txt), [forsok2](test-results/fase-10/07-e2e-forsok2.txt) | 1 og 2 feilet | Kameratesten under høy last fra et annet prosjekt (besto alene), og en test fra fase 1 som målte sidehøyden før dataene var lastet (rettet) |
| 11 | [07-e2e-forsok1.txt](test-results/fase-11/07-e2e-forsok1.txt) | 1 feilet | Feil fra fase 4 ved sletting av kjøp, rettet |
| 12 | [07-e2e-forsok1.txt](test-results/fase-12/07-e2e-forsok1.txt), [forsok2](test-results/fase-12/07-e2e-forsok2.txt) | 1 og 1 feilet | Kameratesten under høy last, rettet |
| 13 | [05-api-tests-forsok1.txt](test-results/fase-13/05-api-tests-forsok1.txt) | 1 av 491 feilet | Dato i en test fra fase 11 («tidsbombe»), rettet |
| 13 | [07-e2e-forsok1.txt](test-results/fase-13/07-e2e-forsok1.txt) | 3 feilet | Kodedelingen brøt fokus ved sidebytte, og et axe-funn med `scroll-padding` (funn 4, rettet) |
| 14 | [13-format-check-forsok1.txt](test-results/fase-14/13-format-check-forsok1.txt) | én fil ikke formatert (`scripts/traceability.mjs`) | Formatert, format og lint kjørt på nytt |
| 15 | [04-unit-tests-forsok1.txt](test-results/fase-15/04-unit-tests-forsok1.txt) | 1411 av 1411 besto | Besto, men mutasjonssjekken viste at én ny webtest gikk over 5 sekunder i 17 av 21 runder. Testen ble delt i to, og enhetstestene kjørt på nytt (`04`). |
| 15 | [03-format-check.txt](test-results/fase-15/03-format-check.txt) | `scripts/check-files.mjs` ikke formatert | Fila er fra fase 14 (eebc39d) og ikke endret i fase 15. Ikke rettet. |

## Mutasjonskontroll

| Fase | Kjøring 1 | Siste kjøring | Ikke fanget i siste kjøring | Utdata |
|---|---|---|---|---|
| 2 | – | 6 av 6 | – | [10-mutation-check.txt](test-results/fase-2/10-mutation-check.txt) |
| 3 | – | 6 av 7 | Runde 7, forventet: databasen stopper slettingen uansett | [10-mutation-check.txt](test-results/fase-3/10-mutation-check.txt) |
| 4 | 14 av 16 | 16 av 16 | – | [run1](test-results/fase-4/10-mutation-check-run1.txt), [siste](test-results/fase-4/10-mutation-check.txt) |
| 5 | 19 av 20 | 20 av 20 | – | [run1](test-results/fase-5/10-mutation-check-run1.txt), [siste](test-results/fase-5/10-mutation-check.txt) |
| 6 | 20 av 22 | 22 av 22 | – | [run1](test-results/fase-6/10-mutation-check-run1.txt), [siste](test-results/fase-6/10-mutation-check.txt) |
| 7 | 29 av 30 | 30 av 30 | – | [run1](test-results/fase-7/10-mutation-check-run1.txt), [siste](test-results/fase-7/10-mutation-check.txt) |
| 8 | 34 av 37 | 36 av 37 | Runde 16: repoet stopper det samme, fanget i [tillegget](test-results/fase-8/10-mutation-check-tillegg.txt) | [run1](test-results/fase-8/10-mutation-check-run1.txt), [siste](test-results/fase-8/10-mutation-check.txt) |
| 9 | 31 av 35 | 35 av 35 | – | [run1](test-results/fase-9/10-mutation-check-run1.txt), [siste](test-results/fase-9/10-mutation-check.txt) |
| 10 | 32 av 34 | 33 av 34 | Runde 3: avhengig av timing, fanget i [runde 3 på nytt](test-results/fase-10/10-mutation-check-runde3.txt) | [run1](test-results/fase-10/10-mutation-check-run1.txt), [siste](test-results/fase-10/10-mutation-check.txt) |
| 11 | 28 av 29 | 29 av 29 | – | [run1](test-results/fase-11/10-mutation-check-run1.txt), [siste](test-results/fase-11/10-mutation-check.txt) |
| 12 | 35 av 36 | 36 av 36 | – | [run1](test-results/fase-12/10-mutation-check-run1.txt), [siste](test-results/fase-12/10-mutation-check.txt) |
| 13 | 24 av 27 | 2 av 3 (bare de tre som ikke ble fanget) | Runde 15, gir samme oppførsel (forklart i kapittel 11) | [run1](test-results/fase-13/10-mutation-check-run1.txt), [run2](test-results/fase-13/10-mutation-check-run2.txt) |
| 15 | 21 av 21 | 21 av 21 | – (hver runde ble fanget av en relevant test, ikke bare av den ustabile webtesten) | [run1](test-results/fase-15/10-mutation-check-run1.txt) |

Skriptene som gjør endringene, ligger ved siden av utdataene (`10-mutation-check.sh`). Fase 1 hadde ingen
mutasjonskontroll.

## Målinger og andre kontroller

| Hva | Resultat | Utdata |
|---|---|---|
| OCR-pilot (fase 8), 3 ekte kvitteringer, 6 kjøringer | Bare samlede tall er lagret. Konklusjonen står i [ADR-0017](../development/architecture-decisions/0017-tesseract-pa-serveren-forelopig.md), med forbehold om at parseren ble justert mot de samme kvitteringene | [ocr-pilot-*.txt](test-results/fase-8/) |
| Røyktest av den ekte OCR-kjeden (fase 8), fiktiv kvittering | Fant en kort kvittering som lå på siden og ikke ble lest (rettet) | [11-royktest-ekte-kjede.txt](test-results/fase-8/11-royktest-ekte-kjede.txt) |
| Kamera alene og gjentatt (fase 10 og 12) | 6 og 16 beståtte | [fase-10](test-results/fase-10/07-e2e-kamera-alene.txt), [fase-12](test-results/fase-12/07-e2e-kamera-gjentatt.txt) |
| Kodedeling (fase 13) | Hovedfil 881 kB → 608 kB (gzip 265 → 192 kB) | [før](test-results/fase-13/20-bundle-before.txt), [etter](test-results/fase-13/20-bundle-after.txt) |
| Spørringer med genererte data (fase 13), 501 husholdninger | Svinn median 9,8 ms og p95 11,9 ms etter rettingen. Oppskriftsrangering median 31 ms. | [før](test-results/fase-13/21-perf-explain-before.txt), [hele planer før](test-results/fase-13/21-perf-explain-before-fullplans.txt), [etter](test-results/fase-13/21-perf-explain-after.txt) |
| Utdaterte pakker (fase 13) | Liste før oppdateringen | [22-npm-outdated.txt](test-results/fase-13/22-npm-outdated.txt) |
| Backup-skriptene (fase 13) | 21 av 21 sjekker | [23-backup-test.txt](test-results/fase-13/23-backup-test.txt) |
| Backup i testmiljøet (fase 13) | Timerne kjører, siste status `ok` | [24-backup-staging.txt](test-results/fase-13/24-backup-staging.txt) |
| Testmiljøet etter bygg, og over HTTPS (fase 13) | `{"status":"ok"}`, basic auth kreves | [25-staging-check.txt](test-results/fase-13/25-staging-check.txt), [26-caddy-https.txt](test-results/fase-13/26-caddy-https.txt) |

Ytelsestallene er målt på utviklingsserveren mens den også kjørte andre prosjekter. De sier noe om spørringene, ikke om
hvordan appen oppleves på en telefon.

## Skjermbilder per fase

Tatt med Playwright (`SCREENSHOTS=1 npx playwright test screenshots`) i Chromium, med fiktive testdata, på 360 px og
1280 px, og fra fase 1 også i lyst og mørkt tema. De er ikke tatt på en ekte telefon.

| Fase | Sider | Mappe |
|---|---|---|
| 1 | designsystem, innstillinger, matlager, mer, oversikt | [fase-1/](screenshots/fase-1/) |
| 2 | innstillinger, logg inn, profil, registrer | [fase-2/](screenshots/fase-2/) |
| 3 | kast-dialog, lagringssteder, matlager, ny vare, oversikt, vare | [fase-3/](screenshots/fase-3/) |
| 4 | budsjett, kjøp, nytt kjøp, oversikt, rett kjøp, slett kjøp | [fase-4/](screenshots/fase-4/) |
| 5 | oppskrift, oppskrifter (også med allergener), oversikt, allergier på profilen, ingrediens på varen | [fase-5/](screenshots/fase-5/) |
| 6 | handleliste, til matlageret, fra oppskrift | [fase-6/](screenshots/fase-6/) |
| 7 | skann: start, funnet, ukjent, kamerafeil, svarer ikke | [fase-7/](screenshots/fase-7/) |
| 8 | kvittering: start, sjekk, bekreftet, feilet | [fase-8/](screenshots/fase-8/) |
| 9 | måltidsplan (uke, legg til, handleliste), kilder, oppskrift fra Wikibooks | [fase-9/](screenshots/fase-9/) |
| 10 | bli med, «lagt til av», husholdning (eier, medlem, lenke), del allergier | [fase-10/](screenshots/fase-10/) |
| 11 | varselinnstillinger, bjellen, svinn, varsler | [fase-11/](screenshots/fase-11/) |
| 12 | anslag på handlelisten, priser på skann og vare | [fase-12/](screenshots/fase-12/) |
| 13 | innloggingskode, ny innlogging, personvern, profil, tofaktoroppsett | [fase-13/](screenshots/fase-13/) |

## Det som ikke er testet

Dette er ikke gjort av noen per 2026-10-27. Det bør stå åpent i rapporten (kapittel 11 og 17).

**Av mennesker**
- **Ingen brukertester.** Ingen i målgruppen har prøvd appen.
- **Ingen kodegjennomgang med funn er registrert.** Ferdinand har oppgitt gjennomganger «i plenum» for fase 5, 7, 9 og
  13 (planen), men omfang og funn er ikke oppgitt, og det finnes ingen møtenotater. Ingen pull request er merget.
- **Teamet har ikke selv kjørt testene** eller sjekket at tallene over stemmer.

**Enheter og hjelpemidler**
- **Ekte telefon:** ingen test på iPhone eller Android, heller ikke av kamera, strekkode, kvitteringsfoto eller
  handlelisten i butikk.
- **Skjermleser:** ingen test med VoiceOver eller TalkBack. Sjekklisten i
  [tilgjengelighet.md](../development/testing/tilgjengelighet.md) er tom.
- **To telefoner i samme husholdning** (deling i sanntid): bare testet med to nettleserkontekster i Playwright.
- **Andre nettlesere:** bare Chromium. Safari og Firefox er ikke testet. Headless Chromium har ikke
  `BarcodeDetector`, så bare reserveleseren er testet.

**Data og tjenester**
- **Open Food Facts:** av uten kontaktadresse i User-Agent. Testene bruker et falskt OFF med oppdiktede produkter.
- **Kassalapp:** ingen nøkkel. Svarformatet er ikke sett i et ekte svar. Testene bruker oppdiktede priser.
- **OCR:** målt på bare 3 ekte kvitteringer (2 Extra, 1 Kiwi, ingen Rema 1000). Tallene er sannsynligvis for gode.
- **Innhold skrevet av KI og ikke kontrollert:** de 27 oppskriftene, `ingredients.json` (allergener og omregninger)
  og OFF-kategoritabellen.
- **Testvektorene for TOTP** er skrevet fra KI-ens hukommelse. At testene består, viser bare at koden og vektorene
  stemmer overens.

**Drift**
- **Gjenoppretting** er testet med skriptet og testdata, men ingen i teamet har gjort en gjenoppretting selv.
- **E-post** (FR-AUTH-006) og **produksjon** finnes ikke.
- **Ytelse på en ekte telefon og et vanlig nett** er ikke målt.

## Rettelser gjort i fase 14 ved denne gjennomgangen

Alle kontrollene av dokumentasjonen er lagret i [fase-14/](test-results/fase-14/): sporbarhet (`01`), 526 lenker
uten feil (`02`), mutasjonstelling (`03`) og kodehenvisninger i kapittel 07–12 (`04`).
Senere kontroller: lenkesjekk og formatering i del 2 (`05`, `06`) og del 3 (`08`, `09`), og innlogging med
teamets kontoer i testmiljøet (`07`, 2026-10-29).


- Kapittel 11 sa at første mutasjonskjøring i fase 8 fanget 35 av 37. Utdataene viser 34 av 37: tre runder (16, 31 og
  36) ble ikke fanget, og det var også de tre som ble beskrevet. Tallet er rettet.
