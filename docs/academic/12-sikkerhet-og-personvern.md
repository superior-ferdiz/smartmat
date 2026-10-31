# Sikkerhet og personvern

> **Status: Kontrollert mot systemet av KI 2026-10-27 – ikke godkjent av teamet.** (Fase 14: filstier, kodenavn og tall
> er sjekket mot repoet og de lagrede utdataene, og det som var utdatert, er rettet. Se kapittel 20.)
> Historikk: Skrevet etter fase 2 (2026-10-20), fase 3 og fase 4 (2026-10-21), utvidet til og med fase 13 (2026-10-27). Tiltakene og teksten er laget av KI (Claude) og
> ikke gjennomgått av teamet ennå. **Kapittelet er ingen juridisk vurdering.** Samsvar med GDPR og
> personopplysningsloven er ikke vurdert av noen med kompetanse på det. Offisielle APP2000-krav er ikke verifisert.
> Fase 15 (2026-10-30): avsnittet «Matvarer brukeren ikke tåler og egne oppskrifter» er skrevet av KI (Claude) og kontrollert mot koden og de lagrede utdataene i
> `docs/evidence/test-results/fase-15/`. Ikke godkjent av teamet.

## Trusselbilde (fase 2)

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Gjetting av passord (brute force) | Skript prøver mange passord på én konto | Kontoen sperres i 15 min etter 5 feil. Grense per IP-adresse. | `security.api.test.ts`, `auth.spec.ts` |
| Spredt gjetting | Mange IP-adresser eller falsk `X-Forwarded-For` | Sperren er per konto. `X-Forwarded-For` blir ikke trodd. | `security.api.test.ts` |
| Finne ut hvem som har konto | Sammenligne svar eller svartid ved innlogging | Samme svar og samme hasharbeid for ukjent e-post, feil passord og sperret konto | `service.test.ts`, `auth.api.test.ts` |
| Stjålet database | Kopi av tabellene kommer på avveie | argon2id for passord, bare SHA-256 av sesjonstokens | `auth.api.test.ts` |
| XSS stjeler innlogging | Skript leser `document.cookie` | `HttpOnly`-cookie, ingen token i `localStorage` | `auth.spec.ts` |
| CSRF | En annen nettside sender skjema eller fetch med brukerens cookie | `SameSite=Lax`, Origin-sjekk og CSRF-token | `security.api.test.ts`, `auth.spec.ts` |
| Tilgang til andres data (IDOR) | Bytte husholdnings-ID i URL-en | Medlemskap sjekkes på serveren. Svaret er 404. | `security.api.test.ts` |
| Overta en sesjon | En glemt innlogging eller en stjålet cookie | Utløp (14/30 dager). Passordbytte logger ut andre enheter. Ny ID ved innlogging. | `service.test.ts`, `profile.api.test.ts`, `auth.spec.ts` |
| Åpen viderekobling | `/logg-inn?neste=https://falsk.side` | Bare stier i appen godtas | `safeNextPath.test.ts`, `LoginPage.test.tsx` |
| Lekkasje i logger eller feilmeldinger | E-post i en databasefeil som logges | Ingen kropp, IP eller feiltekst i loggen. Faste feilkoder. | `security.api.test.ts` |

### Nytt i fase 3: matlageret

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Lese eller endre andres matlager (IDOR) | Bytte vare-ID i URL-en, eller bruke egen husholdning med en annens vare-ID | `householdAccess` i URL-en, og hver spørring filtrerer på `household_id` | Matrisen i `inventory.security.api.test.ts` (15 endepunkter × 2 varianter) |
| Koble egne data til andres sted | Sende en annen husholdnings steds-ID i kroppen | Stedet sjekkes mot husholdningen. Sammensatt fremmednøkkel i databasen. | Samme fil |
| Feil mengder ved samtidige klikk | To faner trykker «Bruk» samtidig | Betinget oppdatering i SQL, og CHECK ≥ 0 | `inventory.api.test.ts` (10 samtidige) |
| Angre to ganger | Dobbeltklikk på «Angre» | Unik `reverts_event_id` | `inventory.api.test.ts` |

### Nytt i fase 4: kjøp og budsjett

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Lese eller endre andres kjøp og budsjett (IDOR) | Bytte husholdnings- eller kjøps-ID i URL-en | `householdAccess`, og hver spørring (også SQL-summene) filtrerer på `household_id` | Matrisen i `purchases.security.api.test.ts` (8 endepunkter, 2 varianter) |
| Legge egne kjøp inn i andres lager | Sende en annen husholdnings vare- eller steds-ID i en linje | Sjekkes mot husholdningen (400), og sammensatt fremmednøkkel fra parti til linje | Samme fil |
| Overta andres kjøpslinje | Sende en annen husholdnings linje-ID ved retting | Linje-ID må høre til kjøpet (400) | Samme fil |
| Hente andres kjøp via dedupe-nøkkelen | Sende en `clientRequestId` som en annen husholdning har brukt | Nøkkelen er unik per husholdning og slås opp med `household_id` | Samme fil |
| Feil summer | Klienten sender en totalsum som ikke stemmer med linjene | Serveren regner summen. Totalsum med linjer avvises. | `purchases.api.test.ts` |
| Tapt historikk ved sletting | Et kjøp slettes mens noen bruker en vare fra det | Partiene låses (`FOR UPDATE`). Brukte partier slettes aldri. | `purchases.api.test.ts` (samtidig sletting og forbruk) |

### Nytt i fase 5: oppskrifter og allergier

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Se andres matlager gjennom rangeringen | Bytte husholdnings-ID i URL-en til oppskriftene | `householdAccess` på begge oppskriftsrutene. Rangeringen leser bare matlageret til husholdningen i URL-en. | `recipes.security.api.test.ts` (A og B) |
| Lese eller endre andres allergier | Sende en annen brukers ID | Bare `/me/allergens`, brukeren tas fra sesjonen. Det finnes ingen `/users/:id`, og en `userId` i kroppen ignoreres. | Samme fil (C) |
| Koble andres vare til en ingrediens | PATCH med en annen husholdnings vare-ID | Varen slås opp med `household_id` (404) | Samme fil (D) |
| Ugyldig ingrediens | Sende en tilfeldig UUID som `ingredientId` | Sjekkes mot tabellen (400), og fremmednøkkel | `recipes.api.test.ts` |
| Endre oppskriftene | POST/PUT/DELETE mot oppskrifter | Ingen slike endepunkter. Oppskrifter legges bare inn med seed-skriptet. | `recipes.security.api.test.ts` |
| Villedende allergeninformasjon | Appen sier at en rett er «allergenfri» | Ordlyden sier bare hva som er *registrert*. Forbeholdet vises alltid. En test stopper slike ord i begge språk. | `locales.test.ts`, side- og e2e-tester |
| Råd om farlig mat | Oppskriften regner med kylling der siste forbruksdag er passert | Slike partier regnes aldri med, og oppskriften sier at de ikke bør spises | `scoring.test.ts`, `recipes.api.test.ts`, `e2e/recipes.spec.ts` |

### Nytt i fase 6: handleliste

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Se eller endre andres handleliste | Bytte husholdnings-ID i URL-en | `householdAccess` på alle sju endepunkter | `shopping.security.api.test.ts` (A) |
| Endre andres linje via egen husholdning | PATCH/DELETE med en annen husholdnings linje-ID | Linjen slås opp med `household_id` (404) | Samme fil (B) |
| Legge andres linje i eget lager | `to-inventory` med en annen husholdnings linje-ID | Linjen må finnes, være avhuket og høre til husholdningen (409) | Samme fil (B) |
| Bruke andres sted eller vare | `to-inventory` med andres `locationId` eller `itemId` | Sjekkes mot husholdningen (400), og sammensatte fremmednøkler | Samme fil (C) |
| Påvirke andres liste indirekte | «Fjern avhukede» eller sammenslåing fra oppskrift | Alle spørringer filtrerer på `household_id`. Sammenslåing ser bare på egen liste. | Samme fil (D) |
| Doble partier eller linjer | Dobbeltklikk, to telefoner samtidig | Betinget sletting av linjene i samme transaksjon, `dedupe_key`, delvis unik indeks og lås på listen | `shopping.api.test.ts` (samtidige forespørsler), `e2e/shopping.spec.ts` |
| Ugyldig ingrediens fra oppskrift | Sende en ingrediens som ikke er i oppskriften | Sjekkes mot oppskriften (400) | `shopping.api.test.ts` |
| Personopplysninger i logger | Linjetekst («graviditetstest») i loggen | Kropper logges aldri. Testen sjekker loggen. | `shopping.api.test.ts` |

### Nytt i fase 7: strekkoder, Open Food Facts og testmiljøet

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Se andres huskede strekkoder | Bytte husholdnings-ID i URL-en, eller skanne samme kode som en annen husholdning | `householdAccess`. `household_barcodes` slås opp med `(household_id, gtin)`. Mellomlageret har ingen husholdningsdata. | `barcodes.security.api.test.ts` (A, C) |
| Legge parti på andres vare eller sted | `confirm` med andres `itemId` eller `locationId` | Slås opp med `household_id` (404/400), og sammensatte fremmednøkler | Samme fil (B) |
| Fritekst eller stier sendt videre til OFF | `/barcodes/../../x` eller bokstaver i koden | Koden valideres med kontrollsiffer før noe skjer. Provideren nekter alt som ikke er 8, 13 eller 14 sifre. | `barcodes.api.test.ts`, `openFoodFacts.test.ts` |
| Ondsinnet eller ødelagt svar fra OFF | Feil typer, enorm tekst, kontrolltegn, HTML i stedet for JSON | Zod-validering, maks 200 000 tegn, navn renses og kuttes til 100 tegn, vises som ren tekst | `openFoodFacts.test.ts` |
| OFF nede eller treg | Tidsavbrudd, 503 | 3 s tidsavbrudd, manuelt skjema, feil lagres ikke | `barcodes.api.test.ts`, `e2e/scan.spec.ts` |
| Sperret av OFF eller misbruk av oppslaget | Mange oppslag fra én bruker | 30 per bruker og minutt, 10 per minutt totalt mot OFF (OFF tillater 15 per IP) | `barcodes.security.api.test.ts` (D), `openFoodFacts.test.ts` |
| Doble partier | Dobbeltklikk, nytt forsøk etter tapt svar | `dedupe_key` på partiet, unik per husholdning | `barcodes.api.test.ts` (også samtidig), `e2e/scan.spec.ts` |
| Hva noen har kjøpt, i loggen | Strekkoden står i URL-en | URL-en logges som `/barcodes/[gtin]`. Navn logges aldri. | `barcodes.api.test.ts` |
| Kamerabilder lekker | Bilder sendt til server eller CDN | Bildet leses bare i nettleseren. Reserveleseren og wasm-filen kommer fra vår egen server. `Permissions-Policy: camera=(self)`. | `ScanPage.test.tsx`, `e2e/scan.spec.ts`, `e2e/scan-camera.spec.ts` (alle forespørsler går til egen server) |
| Felles rate limit bak proxy, eller forfalsket IP | Alle brukere kommer fra Caddy sin adresse | `TRUST_PROXY` bare for `ghostweb`-nettet. Caddy overskriver `X-Forwarded-For`. | `staging.api.test.ts` |
| Fremmede registrerer seg i testmiljøet | Åpen registrering på en offentlig adresse | Basic auth i Caddy, `REGISTRATION_OPEN=false` (403), kontoer bare med skript | `staging.api.test.ts`, `StagingBanner.test.tsx` |
| Cookie overstyrt fra et annet underdomene | En side på `*.risansolutions.no` setter `smartmat_session` | `__Host-`-prefiks: ingen `Domain`, krever `Secure` | `staging.api.test.ts` |

### Nytt i fase 8: kvitteringer

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Se eller endre andres kvitteringer og bilder | Bytte husholdnings-ID eller kvitterings-ID i URL-en | `householdAccess`, og hvert oppslag i repoet filtrerer på `household_id`. Sammensatte fremmednøkler på bilde og uttrekk. | `receipts.security.api.test.ts` (A, B, repoet, databasen) |
| Lekke at en annen husholdning har samme bilde | Laste opp samme fil som en annen husholdning | «Allerede lastet opp» sjekkes bare innenfor husholdningen | Samme fil |
| Bekrefte inn i andres sted, eller få id-en til andres kjøp | `confirm` med andres `locationId`. Duplikatsvaret peker på et kjøp. | Kjøpsreglene fra fase 4. Duplikatsjekkene ser bare på egen husholdning. | Samme fil |
| Posisjon og kamerainformasjon lagres | GPS i EXIF fra mobilkameraet | Bildet skrives om uten metadata før lagring (også i nettleseren når det går). Originalfilen lagres aldri. | `image.test.ts`, `receipts.api.test.ts` |
| Ondsinnet fil | Annen filtype med `.jpg`-navn, «dekompresjonsbombe», ødelagt fil | Typen fra innholdet, 10 MB, 40 MP (sharp nekter før dekoding), ødelagt fil gir 400 | `image.test.ts`, `receipts.api.test.ts` |
| Kodeinjeksjon via OCR | Filnavn eller tekst sendt til et shell | Tesseract startes uten shell, bildet går på stdin. Ingenting fra brukeren blir argumenter. | `tesseract.test.ts` |
| OCR som henger eller svarer med søppel | Tesseract bruker minutter, eller svarer med noe som ikke er TSV | Tidsavbrudd (prosessen drepes), grense på 2 MB utdata, TSV-formatet kontrolleres, 60 s for hele lesingen | `tesseract.test.ts`, `tesseractTsv.test.ts`, `receipts.api.test.ts` |
| Bildet sendes ut av serveren | Skytjeneste, eller en container med internett | Tesseract kjører lokalt (lokalt i Docker med `--network none`). Workeren i testmiljøet er bare på det interne nettverket. | Røyktest og compose-oppsett (ikke automatisk testet) |
| Kortnummer og autorisasjonskode lagres | Betalingsdelen av kvitteringen i råteksten | Betalingslinjer fjernes før råteksten lagres | `parse.test.ts`, `receipts.api.test.ts` |
| Hva noen har kjøpt, i loggen | Varetekst, beløp, butikk eller filnavn | Workeren logger id, utfall og tid. API-et logger URL uten spørrestreng. | `receipts.api.test.ts` (sjekker loggene for tekst fra kvitteringen) |
| Overbelastning | Mange store bilder | 10 opplastinger per bruker og time, 20 i kø totalt, én kvittering om gangen i workeren, `mem_limit` 512 MB i testmiljøet | `receipts.api.test.ts` |
| Samme kvittering blir to kjøp | Fotografert to ganger, dobbeltklikk | Sterk nøkkel (hash av kvitteringsnummer, klokkeslett, dato, total) unik per husholdning, advarsel ved samme dato og sum, statusbetingelse i transaksjonen | `receipts.api.test.ts` (også samtidig) |

### Nytt i fase 9: måltidsplan og oppskrifter fra åpne kilder

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Se eller endre andres måltidsplan | Bytte husholdnings-ID eller oppførings-ID i URL-en | `householdAccess` på alle rutene, og repoet filtrerer på `household_id` ved lesing, endring og sletting. Sammensatte fremmednøkler på bidragene. | `mealPlan.api.test.ts` (alle seks endepunktene, begge retninger) |
| Legge noe på andres handleliste | `POST /meal-plan/shopping` med andres husholdning | Samme rutesjekk. Serveren regner behovet ut fra egen plan og nekter ingredienser planen ikke trenger. | `mealPlan.api.test.ts` |
| Doble linjer på handlelisten | Dobbeltklikk, to faner | Bidrag per oppføring trekkes fra, listen låses og bidragene leses på nytt i transaksjonen. Oppføringer har dedupe-nøkkel. | `mealPlan.api.test.ts` (også samtidig) |
| Overbelastning | Tusenvis av oppføringer på en dag, eller et år i én spørring | Høyst 20 oppføringer per dag, og høyst 42 dager per spørring | `mealPlan.api.test.ts` |
| Hva noen spiser, i loggen | Fritekst som «Bursdag til …» | Fritekst og titler kommer aldri i logger eller feilmeldinger | `mealPlan.api.test.ts` (sjekker loggen) |
| Skadelig innhold fra en åpen kilde | Wikitekst, HTML eller lenker i en Wikibooks-side | Appen viser bare den oversatte teksten som ren tekst. Lenken til originalen er en https-URL som seed-sjekken kontrollerer, og den åpnes med `rel="noopener noreferrer"`. | `seed.test.ts`, `RecipeSourcesPage.test.tsx` |
| Feil eller farlig oppskrift | KI har oversatt en mengde, tid eller et allergen feil | Merket «KI-utkast – ikke kontrollert av teamet». `RECIPES_INCLUDE_UNREVIEWED=false` skjuler slike oppskrifter. Allergener regnes fortsatt ut fra ingrediensene, og forbeholdet vises på måltidsplanen. | `recipeSources.api.test.ts`, `RecipeSourcesPage.test.tsx` |
| Brudd på lisens eller databasevern | Kopiering fra et oppskriftsnettsted | Bare kilder med åpne lisenser (ADR-0016). Kilde, lisens og endringer vises på hver oppskrift og på en egen side. | `seed.test.ts` (lisens og kildefelt kreves) |

**Personvern:** måltidsplanen kan si noe om helse eller tro (for eksempel at noen aldri planlegger svinekjøtt). Det er
husholdningens egne data, de vises ikke for andre, og de slettes med husholdningen (cascade). Teamet har ikke vurdert
om dette krever noe mer.

### Nytt i fase 10: delte husholdninger

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Se eller endre en annen husholdnings medlemmer og invitasjoner | Bytte husholdnings-ID i URL-en | `householdAccess` på alle nye ruter (404) | `households.security.api.test.ts` (A: 12 endepunkter) |
| Et medlem gjør eierhandlinger | Medlemmet sender DELETE eller POST til eierrutene | `requireOwner` (403), og rollen sjekkes på nytt under låsen | Samme fil (B: 8 endepunkter, ingenting endres) |
| Bruke egen husholdning med andres ID-er | Fjerne et medlem av en annen husholdning, trekke tilbake andres invitasjon, overføre til noen utenfor | Medlemmer og invitasjoner slås opp med `household_id` | Samme fil (C) |
| Gjette en invitasjon | Prøve mange tokener | 256 bit tilfeldig. 10 forsøk per bruker og 30 per IP-adresse på 15 minutter. | `households.api.test.ts` |
| Finne ut om en invitasjon har eksistert | Sammenligne svar for ukjent, utløpt og brukt | Samme svar (404 `invitationInvalid`) for alle | Samme fil |
| Stjålet database eller logg | Lese tokenet i en kopi av databasen eller i loggen | Bare SHA-256 lagres. Tokenet står i fragmentet (`#`), så det sendes aldri i en URL til serveren. | Samme fil (databasen og loggen sjekkes) |
| Bruke samme lenke flere ganger | Videresende lenken, eller to som trykker samtidig | Betinget oppdatering under lås. Én gang, 48 timer, kan trekkes tilbake. | Samme fil (10 samtidige → 1 medlem) |
| To eiere, eller ingen | Overføring samtidig med utmelding, eller to overføringer | Delvis unik indeks, lås på husholdningen, den gamle eieren settes til medlem først | Samme fil (samtidige overføringer) |
| Data lekker etter utmelding | Gamle sider, hurtiglager i nettleseren, en åpen fane | Medlemskapet sjekkes i databasen ved hver forespørsel (ingen hurtiglager på serveren). I nettappen fører en 404 til at sesjonen hentes på nytt, og alt for den gamle husholdningen fjernes. | `households.api.test.ts` (10 endepunkter gir 404 straks), `HouseholdPage.test.tsx`, `e2e/household.spec.ts` |
| Skrive i feil husholdning | Et skjema åpnet før et bytte | Husholdnings-ID-en ligger i URL-en til hver forespørsel. Navnet på den aktive vises når brukeren har flere. | `households.api.test.ts`, `HouseholdPage.test.tsx` |
| Overta andres sesjon via aktiv husholdning | `PUT /me/active-household` med en fremmed ID | Medlemskapet sjekkes (404), og ved lesing igjen | `households.security.api.test.ts` |

### Nytt i fase 11: svinnstatistikk og varsler

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Se en annen husholdnings svinn eller varsler | Bytte husholdnings-ID i URL-en | `householdAccess` på alle de fem nye rutene, og alle spørringer filtrerer på `household_id` | `notifications.security.api.test.ts` (A: 5 endepunkter → 404, ingenting endres) |
| Avvise eller merke noe i en annen husholdning | Sende en nøkkel med en annen husholdnings parti-ID | Bare nøkler som er aktive nå for brukeren og husholdningen i URL-en godtas (404) | Samme fil (B), `notifications.api.test.ts` |
| Fylle tabellen med vilkårlige nøkler | Tusenvis av oppdiktede nøkler | Bare aktive nøkler lagres, høyst 100 per forespørsel, fast alfabet (Zod og CHECK), og rydding etter 45 dager | `notifications.api.test.ts` |
| Doble rader ved dobbeltklikk | To faner avviser samtidig | Primærnøkkel `(user_id, household_id, key)` og `ON CONFLICT` | `notifications.api.test.ts` (10 samtidige → 1 rad) |
| Varsler etter utmelding | En som er fjernet, ser fortsatt varsler eller har tilstander igjen | Medlemskapet sjekkes ved hver lesing. Tilstanden har en fremmednøkkel til medlemskapet med CASCADE. | `notifications.api.test.ts` (utmelding og fjerning) |
| Navn på tidligere medlemmer | «Per la til Melk» etter at Per har gått ut | `toCreator`: navn bare for nåværende medlemmer | `notifications.api.test.ts` |
| Endre andres innstillinger | `userId` i kroppen | Bare `/me`, brukeren tas fra sesjonen, og ukjente felt fjernes | `notifications.api.test.ts`, `notifications.security.api.test.ts` |
| Hva noen kaster, i loggen | Varenavn eller nøkler med parti-ID | Kropper logges ikke, og URL-ene har ingen navn eller nøkler | `waste.api.test.ts`, `notifications.api.test.ts` |
| Farlige råd | «Kan fortsatt spises» om noe med siste forbruksdag | Egen ordlyd for siste forbruksdag. En test stopper slike fraser i begge språk. | `locales.test.ts`, `NotificationsPage.test.tsx` |

### Nytt i fase 12: priser

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Se en annen husholdnings priser eller anslag | Bytte husholdnings-ID i URL-en | `householdAccess` på alle tre rutene. Egne priser og anslaget filtrerer på `household_id`. | `prices.security.api.test.ts` (A: 3 endepunkter → 404, ingen kall til Kassalapp) |
| Lese andres vare via egen husholdning | `/items/<Karis vare>/prices` i Olas husholdning | Varen slås opp med `household_id` (404) | Samme fil (B) |
| Lekke egne priser gjennom en felles strekkode | Ola skanner samme vare som Kari | De eksterne prisene er felles (globale). Egne priser og varen kommer bare fra Olas husholdning. | Samme fil (C) |
| Nøkkelen kommer på avveie | I loggen, i et svar, i en omdirigering eller over http | Bare i `.env`. Sendes bare til `https`-adressen, med `redirect: 'error'`. Aldri i svar eller logg. | `kassalapp.test.ts`, `prices.api.test.ts` |
| Fritekst eller stier sendt til Kassalapp | `/prices/melk` eller `../../` | GTIN valideres med kontrollsiffer. Provideren nekter alt som ikke er 8, 13 eller 14 sifre. Butikkens egne koder sendes ikke. | `kassalapp.test.ts`, `prices.api.test.ts` |
| Ondsinnet eller ødelagt svar fra Kassalapp | Feil typer, HTML, enorm tekst, `javascript:`-lenke, dato langt fram i tid | Zod per rad, høyst 1 000 000 tegn, kjedekode med fast alfabet, navn renses, lenker bare til `https://kassal.app`, ren tekst i nettleseren | `kassalapp.test.ts` |
| Sperret av Kassalapp | Mange oppslag, eller en lang handleliste | 30 per minutt for serveren, 30 per bruker, 6 timers hurtiglager, pause etter 429 (`Retry-After`), og anslaget spør aldri | `kassalapp.test.ts`, `prices.api.test.ts` |
| Villedende sammenligning | En gammel Kiwi-pris fra 2024 vises som billigst | Gammel etter 14 dager, kjeder som ikke hentes er aldri ferske, «billigst» og anslag bare fra ferske priser, teksten sier hvilke kjeder som mangler | `rules.test.ts`, `prices.api.test.ts`, `prices.test.tsx` |
| Et anslag blir en utgift | En pris fra Kassalapp havner i budsjettet | Prisrutene skriver aldri til kjøp, partier, budsjett eller svinn | `prices.api.test.ts` (FR-PRICE-005) |
| Hva noen har kjøpt, i loggen | Strekkoden i URL-en | `/prices/[gtin]` i loggen. Grunnen til feil logges uten kode. | `prices.api.test.ts` |

### Nytt i fase 13: sikkerhet, personvern og drift

| Trussel | Eksempel | Tiltak | Test |
|---|---|---|---|
| Passord fra kjente lekkasjer | Brukeren velger «sommer2024», som står på alle lister | Pwned Passwords ved registrering og passordbytte (bare 5 tegn av SHA-1 sendes). Tjenesten nede: passordet godtas. | `passwords.security.api.test.ts`, `pwnedPasswords.test.ts`, `account.spec.ts` |
| Stjålet passord brukes i det stille | Noen logger inn fra en annen maskin | Varsel om ny innlogging i alle andre økter, liste over økter, «Logg ut» for hver | `sessions.security.api.test.ts`, `account.test.tsx`, `account.spec.ts` |
| Stjålet passord alene er nok | Gjettet eller lekket passord | Valgfri tofaktor (TOTP) med gjenopprettingskoder | `twoFactor.security.api.test.ts`, `totp.test.ts`, `twoFactor.test.tsx`, `account.spec.ts` |
| Kode sett over skulderen brukes igjen | Samme 6 sifre i en ny innlogging | Siste brukte tidssteg lagres; samme eller eldre kode avvises, også to samtidige | Samme |
| Gjetting av koder | Skript prøver koder etter riktig passord | Feil koder teller mot sperren (5 → 15 min). Riktig passord nullstiller **ikke** telleren før koden er riktig. | Samme |
| Database eller kopi på avveie gir tofaktor | Kopi av `users` | Hemmeligheten er kryptert (AES-256-GCM) med nøkkel bare i miljøet; gjenopprettingskoder bare som hash | Samme |
| Server uten nøkkel slipper inn med bare passord | Feilkonfigurasjon | Fail closed: kontoen med tofaktor får 503, ingen økt | Samme |
| Andre containere forfalsker klientadressen | Falsk `X-Forwarded-For` fra et annet nettsted på serveren | Eget nett for Caddy og SmartMat (ADR-0022), `TRUST_PROXY` bare for det | `staging.api.test.ts` |
| Klikkjakking, MIME-sniffing, lekkasje via Referer | Siden i en `iframe` på en annen side | CSP med `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP | `staging.api.test.ts` |
| To retter samme kjøp | Ola og Kari lagrer samtidig | Versjon på kjøpet, betinget skriving, 409 og melding | `purchaseVersion.api.test.ts`, `PurchasePages.test.tsx`, `account.spec.ts` |
| Personopplysninger i loggen | E-post, varenavn, strekkode, token eller IP-adresse | Én test som går gjennom de fleste flytene og leter etter kjente verdier i hele loggen | `logs.security.api.test.ts` |
| Eksporten lekker | Andres e-post, passordhash, tokens, andre husholdninger | Hver tabell nevnes eksplisitt; en ny kolonne får testen til å feile til noen har bestemt seg | `privacy.api.test.ts`, `account.spec.ts` |
| Tap av data | Feil, sletting, ødelagt disk | Nattlig, kryptert kopi; ukentlig gjenoppretting der alle rader leses; varsel ved gammel kopi | `docker/backup/test-backup.sh` (21 sjekker) |

Testene er kontrollert ved å slå av hver beskyttelse i koden én om gangen
([fase 2](../evidence/test-results/fase-2/10-mutation-check.txt),
[fase 3](../evidence/test-results/fase-3/10-mutation-check.txt),
[fase 4](../evidence/test-results/fase-4/10-mutation-check.txt),
[fase 5](../evidence/test-results/fase-5/10-mutation-check.txt),
[fase 6](../evidence/test-results/fase-6/10-mutation-check.txt),
[fase 7](../evidence/test-results/fase-7/10-mutation-check.txt),
[fase 8](../evidence/test-results/fase-8/10-mutation-check.txt),
[fase 9](../evidence/test-results/fase-9/10-mutation-check.txt),
[fase 10](../evidence/test-results/fase-10/10-mutation-check.txt),
[fase 11](../evidence/test-results/fase-11/10-mutation-check.txt),
[fase 12](../evidence/test-results/fase-12/10-mutation-check.txt),
[fase 13](../evidence/test-results/fase-13/10-mutation-check-run1.txt)). Resultatene står i kapittel 11.

## Personopplysninger som behandles (etter fase 2)

| Opplysning | Formål | Hvor | Lagringstid |
|---|---|---|---|
| E-postadresse | Innlogging | `users.email` | Til kontoen slettes |
| Navn (visningsnavn) | Vises i appen | `users.display_name`, også som navn på husholdningen | Til kontoen slettes |
| Passord | Innlogging | Bare som argon2id-hash i `users.password_hash` | Til kontoen slettes eller passordet byttes |
| Språkvalg | Grensesnitt | `users.locale` | Til kontoen slettes |
| Mislykkede innlogginger | Beskyttelse mot gjetting | `users.failed_login_count`, `login_locked_until` | Nullstilles ved vellykket innlogging |
| Sesjoner | Holde brukeren innlogget | `sessions` (hash av token, tidspunkter) | Maks 30 dager. Slettes ved utlogging, passordbytte eller kontosletting. |
| Matlager (varer, mengder, datoer, priser, hva som kastes og hvorfor) | Appens formål | `inventory_*`-tabellene, knyttet til husholdningen | Til varen eller kontoen slettes |
| Kjøp (butikk, dato, hva som ble kjøpt, beløp) og matbudsjett | Appens formål (budsjett) | `purchases`, `purchase_lines`, `food_budgets` | Til kjøpet eller kontoen slettes |
| Hvem som registrerte et kjøp | Historikk i husholdningen | `purchases.created_by` | Settes til tom hvis kontoen slettes |
| Hvem som gjorde en endring | Historikk i husholdningen | `inventory_events.actor_id` | Settes til tom hvis kontoen slettes. Hendelsen blir stående til husholdningen slettes. |
| **Allergier** (fase 5) | Skjule eller varsle om oppskrifter (FR-REC-004) | `user_allergens`, knyttet til brukeren | Til brukeren endrer dem eller sletter kontoen |
| Hvilken ingrediens en vare er (fase 5) | Rangering av oppskrifter | `inventory_items.ingredient_match`/`ingredient_id` | Som varen |
| Strekkoder husholdningen har bekreftet, med navn, sted og valgt ingrediens (fase 7) | Fylle ut skjemaet neste gang (FR-SCAN-004) | `household_barcodes`, knyttet til husholdningen | Til husholdningen slettes. Koblingen til en vare eller et sted tømmes når de slettes. |
| IP-adresse | Rate limiting | Bare i minnet i API-prosessen, i 15–60 minutter | Lagres ikke og logges ikke |
| Bruker-ID per oppslag (fase 7) | Grensen på 30 oppslag i minuttet | Bare i minnet i API-prosessen, i ett minutt | Lagres ikke og logges ikke |
| **Bilde av kvitteringen** (fase 8): butikk, tidspunkt, hva som er kjøpt, ofte kortnummerets siste siffer | Lese kjøpet (FR-RCPT-001–005) | `receipt_images`, uten metadata | Slettes ved bekreftelse eller forkasting, og senest etter 7 dager |
| Teksten fra kvitteringen og tolkede linjer (fase 8) | Gjennomgangen | `receipt_extractions`, uten betalingslinjer | Som bildet |
| At en kvittering er brukt (fase 8) | Hindre to kjøp av samme kvittering | `receipts` (kobling til kjøpet) og `purchases.dedupe_key` (hash) | Til kjøpet slettes |
| Bruker-ID per opplasting (fase 8) | Grensen på 10 i timen | Bare i minnet i API-prosessen, i én time | Lagres ikke og logges ikke |
| Medlemskap og rolle (fase 10) | Deling av husholdningen | `household_members` | Til medlemmet går ut, fjernes eller sletter kontoen |
| Invitasjoner: hvem som laget og brukte dem, og når (fase 10) | Eieren ser hva som skjedde med lenken | `household_invitations` (bare hash av tokenet) | 30 dager. Slettes med husholdningen. Navnet til den som brukte den, vises bare mens hen er medlem. |
| Valg om deling av allergier (fase 10) | Ta hensyn til allergiene i husholdningen | `household_members.share_allergens` | Som medlemskapet |
| Aktiv husholdning (fase 10) | Hvilken husholdning sidene viser | `users.active_household_id` | Til kontoen slettes |
| Bruker-ID per invitasjonsforsøk (fase 10) | Grensen på 10 forsøk | Bare i minnet i API-prosessen, i 15 minutter | Lagres ikke og logges ikke |
| Hvilke varsler brukeren vil ha (fase 11) | Innstillinger | `notification_settings`, knyttet til brukeren | Til kontoen slettes |
| Hvilke varsler brukeren har sett og avvist (fase 11): nøkkel med parti-ID, dato eller måned, og tidspunkt | Samme varsel skal ikke komme igjen | `notification_states`, knyttet til medlemskapet. Ingen varenavn eller tekst. | 45 dager. Slettes straks når brukeren går ut av husholdningen, blir fjernet eller sletter kontoen. |
| Når brukeren sist så handlelisten (fase 11) | Varselet om nye linjer | `household_members.shopping_seen_at` | Som medlemskapet |
| Egne priser (fase 12): hva husholdningen har betalt for en vare, og hvor | Vise prisen og regne anslag | Ingen ny lagring. Leses fra partiene og kjøpene. | Som partiene og kjøpene |
| Bruker-ID per prisoppslag (fase 12) | Grensen på 30 oppslag i minuttet | Bare i minnet i API-prosessen, i ett minutt | Lagres ikke og logges ikke |
| Nettleserfamilie og system for hver innlogging (fase 13), for eksempel «Firefox» og «Windows» | Vise hvor brukeren er logget inn, og varsle om ny innlogging (FR-AUTH-009) | `sessions.browser`, `sessions.os` (fast liste, ikke hele User-Agent, ikke IP-adresse) | Som økten: høyst 30 dager, slettes hver natt når den er utløpt |
| At noen svarte «Det var meg» på en innlogging (fase 13) | Varselet skal ikke komme igjen | `sessions.login_notice_dismissed_at` | Som økten |
| Tofaktorhemmelighet (fase 13) | Sjekke koden ved innlogging (FR-AUTH-010) | `users.totp_secret`, kryptert med AES-256-GCM; nøkkelen bare i miljøet | Til brukeren slår av tofaktor eller sletter kontoen |
| Gjenopprettingskoder (fase 13) | Innlogging uten telefonen | `user_recovery_codes`, bare SHA-256 | Til nye koder lages, tofaktor slås av eller kontoen slettes |
| Utfordring mellom passord og kode (fase 13) | Innlogging i to steg | `login_challenges`, bare SHA-256 | 5 minutter; slettes når den er brukt og hver natt |
| Sikkerhetskopier av databasen (fase 13) | Kunne gjenopprette etter feil (ADR-0021) | `/var/backups/smartmat/` på serveren, kryptert. Uten kvitteringsbilder og OCR-tekst. | De 7 siste nettene |

Det ble ikke brukt noen eksterne tjenester eller databehandlere i fase 2–6. Alt kjørte lokalt.

**Fra fase 7:**
- **Open Food Facts** får strekkoden når den ikke er kjent fra før. Den sendes fra serveren, ikke fra brukerens
  nettleser, så OFF får ikke brukerens IP-adresse eller cookie. OFF får serverens IP-adresse og kontaktadressen i
  User-Agent. En strekkode alene sier ikke hvem som skannet den. Det mellomlagrede svaret (`products`) har ingen
  data om brukere.
- **Det lukkede testmiljøet** (ADR-0015, ikke satt opp per 2026-10-22):
  - Behandlingsansvarlige er studentene (Ferdinand Risan, Linus Saxe Huseby og Hasan Alhafni), etter Ferdinands svar i chat
    2026-10-22.
  - Serveren står i Tyskland (EØS) og driftes av Ferdinand. Leverandøren av serveren er dermed databehandler. Om det
    finnes en databehandleravtale, er ikke undersøkt.
  - Det er bare teamets egne kontoer og testdata der. Banneret ber om at ingen ekte allergier legges inn, så
    helseopplysninger (art. 9) skal ikke finnes der. Det håndheves ikke teknisk.
  - Lokalt er ingenting endret: alt kjører fortsatt på maskinen.

**Fra fase 8 (kvitteringer):**
- Bildet behandles bare på vår egen server, av Tesseract. Ingen skytjeneste brukes (ADR-0011, ADR-0017).
- **Pilotmålingen** brukte teamets egne 3 kvitteringer. De ligger utenfor repoet, i en mappe bare eieren kan lese.
  Bildene ble også vist til KI-assistenten (Claude, Anthropic) i chatten, fordi teamet ba om det for å lage
  fasiten. De er ikke lagt i Git, tester, logger eller dokumentasjon, og bare samlede tall er lagret.
  **Slettefrist:** når ADR-0017 er godkjent, senest 2026-11-23. Bildene (3 kvitteringer og 3 utsnitt) ble slettet 2026-10-29 på Ferdinands forespørsel («slett bildene til nå»). Fasiten og måleresultatene (tekst) ligger fortsatt der.
- En kvittering kan vise de siste sifrene i et kortnummer og autorisasjonskoden. Bildet beholdes bare til kjøpet er
  bekreftet. Råteksten lagres uten slike linjer.

**Fra fase 12 (priser):**
- **Kassalapp** (Liseth Solutions AS, servere i Finland) får strekkoden når den ikke er slått opp de siste 6 timene.
  Den sendes fra serveren med teamets API-nøkkel. Kassalapp får ikke brukerens IP-adresse, cookie, husholdning, navn,
  fritekst eller egne priser. Ifølge FAQ-en (lest 2026-10-25) logger Kassalapp kall med endepunkt, parametere (også
  strekkoder) og tidspunkt. Kallet er knyttet til API-nøkkelen vår. En strekkode alene sier ikke hvem som skannet den.
- **Forslag (KI-ens tolkning, ikke vurdert av teamet):** Kassalapp er ikke databehandler for SmartMat, fordi ingen
  personopplysninger om brukerne sendes. Kontoen hos Kassalapp er personlig for den i teamet som lager den, og
  Kassalapps personvernerklæring gjelder den personen.
- **Uten nøkkel** (som per 2026-10-25) sendes ingenting.
- **Det som lagres** (`price_observations`, `price_lookups`) er globale priser uten brukerdata. Det slettes etter 30
  dager uten nytt oppslag.
- **Egne priser** er husholdningens data fra før (partier og kjøp). De vises bare for medlemmer og sendes aldri ut.

**Fra fase 13:**
- **Have I Been Pwned** (Pwned Passwords) får de 5 første tegnene i SHA-1 av et nytt passord, fra serveren. Ut fra
  det kan ingen finne passordet (k-anonymitet, 800–1000 svar med polstring). HIBP kan logge serverens adresse og
  User-Agent i opptil 31 dager (personvernerklæringen deres, lest 2026-10-25). **KI-ens tolkning:** HIBP får ingen
  personopplysninger om brukeren. Se [integrations/pwned-passwords.md](../development/integrations/pwned-passwords.md).
- **Eksport** (FR-PRIV-001): brukeren kan laste ned alt om seg selv som én JSON-fil. Den sendes bare til brukeren
  selv.
- **Sikkerhetskopier** (ADR-0021) ligger på samme server, kryptert. En slettet konto kan ligge i en kopi i opptil 7
  dager. Kvitteringsbilder og OCR-tekst er aldri med.

## Svinn, kjøp og varsler (fase 11)

**Dette er KI-ens forslag og ikke en juridisk vurdering. Teamet må vurdere det selv.**

- **Svinn og kjøp sier noe om vaner.** Hva som kastes og hvorfor, sammen med kjøpene, kan si noe om kosthold, økonomi,
  hvor ofte noen er hjemme og hvor mange som bor der. Statistikken lager ingen nye opplysninger: den summerer
  svinnloggen fra fase 3 når siden åpnes, og ingenting lagres.
- **Ingen tall per person.** Statistikken gjelder hele husholdningen. Hvem som kastet hva, står bare i historikken på
  varen, som før (med navn bare for nåværende medlemmer).
- **Varsler lagres ikke** (ADR-0019). Det som lagres, er en nøkkel per varsel brukeren har sett eller avvist, uten
  tekst eller varenavn. Nøkkelen inneholder parti-ID og dato, og den slettes etter 45 dager eller når medlemskapet
  opphører.
- **Hva andre medlemmer ser:**

  | Opplysning | Andre medlemmer ser det? |
  |---|---|
  | Svinnstatistikken | Ja, den er for husholdningen |
  | Varsler om datoer og budsjett | Ja, hver for seg, med egne innstillinger |
  | At du har lagt til noe på handlelisten | Ja, i et varsel med navnet ditt, men bare mens du er medlem |
  | Hvilke varsler du har sett eller avvist | Nei |
  | Innstillingene dine for varsler | Nei |

- **Behandlingsgrunnlag (forslag):** avtale (art. 6 nr. 1 b), som for resten av husholdningens data. Varsler bruker
  ikke allergier.
- **Ikke håndtert:** varsel på e-post eller telefon (FR-AUTH-006), og om andre skal få beskjed når noen går ut.

## Delte husholdninger (fase 10)

**Dette er KI-ens forslag og ikke en juridisk vurdering. Teamet må vurdere det selv.**

### Hva andre medlemmer ser

| Opplysning | Andre medlemmer ser det? |
|---|---|
| Matlager, kjøp, budsjett, handleliste, måltidsplan og kvitteringer | Ja. Det er husholdningens data, og det er formålet med å dele. |
| Visningsnavn og rolle, og når man ble med | Ja (medlemslisten) |
| E-postadresse | Nei |
| Hvem som la til noe | Ja, navnet, men bare mens personen er medlem. Etter utmelding står det «Tidligere medlem». |
| Allergier | Bare hvis medlemmet har slått på deling, og da bare *hvilke* allergener som er registrert i husholdningen, aldri *hvem* sine. I en husholdning med to personer kan det likevel skjønnes. Teksten sier det. |
| Andre husholdninger man er med i | Nei |

### Behandlingsgrunnlag (forslag)
- **Kontoen og husholdningens data:** avtale (art. 6 nr. 1 b). Brukeren har bedt om tjenesten, også om å dele den.
- **Allergier** kan være helseopplysninger (art. 9). Å dele dem med andre er en ny behandling, så forslaget er
  **uttrykkelig samtykke** (art. 9 nr. 2 a):
  - eget valg per husholdning
  - av som standard
  - med en forklaring av hva som deles
  - kan trekkes tilbake med ett klikk, og virker straks (ingen hurtiglager)

  Teamet har ikke vurdert om dette holder, og per 2026-10-24 er det ingen ekte brukere.
- **Det andre har lagt inn:** et medlem ser det andre medlemmer har registrert. Det er en del av tjenesten de har
  valgt å dele, og ingen får se noe fra en husholdning de ikke er med i.

### Innsyn
- Hver bruker ser sine egne opplysninger på profilsiden, og alt i husholdningene sine i appen.
- En egen eksport (art. 15 og 20) finnes ikke ennå. Den hører til fase 13.

### Utmelding, fjerning og sletting
- **Forlate eller bli fjernet:** tilgangen forsvinner straks. Det personen har lagt inn, blir i husholdningen, fordi
  det er husholdningens historikk og budsjett, men navnet vises ikke lenger. Delte allergier slutter å telle med en
  gang.
- **Slette husholdningen** (bare eieren, med passord): alt i den slettes for alle. Alle beholder kontoen sin, og den
  som ikke har en annen husholdning, får en ny og tom.
- **Slette kontoen som eier av en delt husholdning:** eierskapet går til medlemmet som har vært med lengst, og
  husholdningen blir værende. Dialogen sier det før brukeren bekrefter. Retten til sletting (art. 17) blir altså
  ikke blokkert av at andre bruker husholdningen. Kontoen, sesjonene og medlemskapene slettes, og `created_by` blir
  tom («Ukjent»).
- **Ikke håndtert:** om de andre medlemmene skal få beskjed når noen går ut eller sletter kontoen. Det ble ikke tatt
  med i fase 11 (avgjørelse 6 i spesifikasjon 11).

### Matvarer brukeren ikke tåler og egne oppskrifter (fase 15)

- **Matvarer brukeren ikke tåler** (for eksempel kiwi) kan si noe om helse, som allergiene. De behandles likt:
  frivillig, slettes med kontoen, med i eksporten, deles bare når brukeren har slått på delingen, vises aldri med navn
  og kommer aldri i logger (testet i `avoidedIngredients.api.test.ts`). Behandlingsgrunnlaget (GDPR art. 9) er ikke
  vurdert av teamet.
- **Delingen er av som standard** (spesifikasjon 16, avgjørelse 3). KI-ens begrunnelse: uttrykkelig samtykke etter
  art. 9 nr. 2 bokstav a må være et aktivt valg, så en deling som står på fra start, er trolig ikke gyldig samtykke.
  Teamet bør ta spørsmålet med veilederen.
- **Egne oppskrifter** er husholdningsdata. En annen husholdning får 404 på alle rutene, og databasen stopper
  kryssreferanser (ADR-0023). Tekst i oppskriftene vises som ren tekst og logges ikke.

## Sletting

- «Slett konto» på profilsiden sletter brukeren og husholdninger der brukeren er eneste medlem, i én transaksjon.
  Det samme gjelder alt som hører til, på grunn av `ON DELETE CASCADE` (FR-AUTH-005). Fra fase 3 omfatter
  det hele matlageret og svinnloggen, fra fase 4 kjøp, linjer og budsjett, fra fase 5 allergiene og fra fase 8
  kvitteringer, bilder og uttrekk, og fra fase 11 innstillingene og tilstandene for varsler. Dette er testet.
- **Kvitteringer** (fase 8): bilde og uttrekk slettes når kjøpet bekreftes eller kvitteringen forkastes. Ellers
  slettes alt etter 7 dager av en jobb hver 15. minutt, og utløpte kvitteringer vises ikke selv før jobben har
  kjørt. Slettes kjøpet, slettes også kvitteringsraden. Dette er testet (unntatt selve tidsplanen i pg-boss).
- Etter slettingen virker ingen gamle sesjoner, og e-postadressen kan brukes på nytt. Dette er testet.
- **Fra fase 10:** eierskap i delte husholdninger (se over).
- **Fra fase 13:** utløpte økter og utfordringer slettes hver natt av workeren. Gjenopprettingskoder og utfordringer
  slettes med kontoen (`ON DELETE CASCADE`, testet).
- **Sikkerhetskopier** (fase 13, bare testmiljøet): en slettet konto kan ligge i en kryptert kopi i opptil 7 dager,
  til kopien roteres bort. Kvitteringsbilder er aldri med. Lokalt finnes ingen kopier.

## Lagringstider samlet (fase 13, FR-PRIV-002)

| Hva | Hvor lenge | Hvordan det håndheves |
|---|---|---|
| Konto, husholdning og alt brukeren har lagt inn | Til brukeren sletter det (eller kontoen) | Sletting i appen, `ON DELETE CASCADE` (testet) |
| Økter | 14 dager uten bruk, høyst 30 dager | Sjekkes ved hver forespørsel; utløpte slettes hver natt (workeren, fase 13) |
| Utfordringer mellom passord og kode | 5 minutter | Sjekkes ved bruk; slettes når brukt og hver natt |
| Kvitteringsbilder og OCR-tekst | Til kjøpet er bekreftet eller forkastet, høyst 7 dager | Workeren hvert 15. minutt (fase 8) |
| Tilstand for varsler | 45 dager | Lat sletting: eldre rader slettes neste gang samme bruker skriver en tilstand i husholdningen (fase 11). En bruker som slutter å bruke appen, beholder dem til kontoen slettes. |
| Invitasjoner | 30 dager | Lat sletting: eldre rader slettes neste gang eieren lager en invitasjon (fase 10). Ellers til husholdningen slettes. |
| Globale priser (ingen brukerdata) | 30 dager uten nytt oppslag | Workeren (fase 12) |
| Produktmellomlager fra Open Food Facts (ingen brukerdata) | Slettes ikke; hentes på nytt etter 30 dager. «Fant ikke» gjelder i 24 timer. | Ingen sletting. Det er offentlige produktdata, ikke personopplysninger. |
| Sikkerhetskopier | De 7 siste nettene | `backup.sh` sletter de eldre |
| Serverlogg for SmartMat | Uten personopplysninger (testet). Hvor lenge Docker beholder loggen, er ikke satt (standard: til containeren lages på nytt). | Ikke styrt av appen. Teamet bør vurdere en grense. |
| Pilotdata for OCR (utenfor appen) | Bildene slettet 2026-10-29. Fasit og måleresultater til ADR-0017 er godkjent, senest 2026-11-23 | Manuelt, av teamet |

## Lovtekst og tolkning (fase 13)

**Dette er KI-ens lesing og ikke juridisk rådgivning.** Teamet bør spørre veilederen om punktene merket «Teamet».

| Tema | Hva lovteksten sier (personvernforordningen) | KI-ens tolkning for SmartMat | Teamet må |
|---|---|---|---|
| Innsyn (art. 15) | Den registrerte har rett til en kopi av opplysningene. | «Last ned mine data» gir alt om brukeren, og alt i husholdningene hen er med i, slik appen viser det. | Bekrefte at det er nok |
| Dataportabilitet (art. 20) | Opplysninger brukeren selv har gitt, i et strukturert, vanlig og maskinlesbart format, når behandlingen bygger på samtykke eller avtale. | JSON oppfyller formatkravet. Husholdningsdata som andre medlemmer har lagt inn, er også deres opplysninger. KI-en har tatt dem med fordi brukeren uansett ser dem i appen. | Ta stilling til om andre medlemmers innlegg skal være med |
| Informasjon (art. 13) | Hvem som er ansvarlig og kontakt, formål og grunnlag, mottakere, lagringstid, rettigheter og klagerett. | `/personvern` dekker punktene, men kontaktadressen er en plassholder, og grunnlaget for allergier er ikke avgjort. | Fylle inn kontakt og avgjøre grunnlaget |
| Helseopplysninger (art. 9) | Behandling av helseopplysninger er forbudt, med unntak som uttrykkelig samtykke (nr. 2 a). | Allergier kan være helseopplysninger. Uttrykkelig samtykke er det nærliggende unntaket. Ikke avgjort. | Avgjøre, gjerne med veilederen |
| Lagringsbegrensning (art. 5 nr. 1 e) | Ikke lagre lenger enn nødvendig. | Tabellen over. Kjøp og lager lagres til brukeren sletter dem. | Vurdere automatisk sletting av gamle data |
| Databehandler (art. 28) | Avtale med den som behandler opplysninger på våre vegne. | Serverleverandøren (Tyskland) er databehandler. Om det finnes en avtale, er ikke undersøkt. Kassalapp og HIBP får ikke personopplysninger om brukerne, og er etter KI-ens forståelse ikke databehandlere. | Sjekke avtalen med serverleverandøren |
| Informasjonskapsler (ekomloven § 3-15) | Samtykke, unntatt for det som er nødvendig for en tjeneste brukeren har bedt om. | Den ene cookien er nødvendig for innlogging, så det trengs ikke samtykke. | Bekrefte |
| Sikkerhet (art. 32) | Egnede tekniske tiltak, blant annet evne til å gjenopprette tilgang etter en hendelse. | Kryptert sikkerhetskopi med testet gjenoppretting (ADR-0021). Kopiene ligger på samme server. | Vurdere kopi et annet sted |

## Kjente svakheter og utsatte tiltak

- **E-post som allerede finnes:** Registrering sier ærlig fra om dette. Da kan noen finne ut om en adresse har konto.
  Rate limiting begrenser det. Ordentlig løsning (svar «sjekk e-posten din») krever e-postverifisering
  (FR-AUTH-006, fase 13).
- **Grensen per IP-adresse** er i praksis felles for alle lokalt, fordi alt går via Vite-proxyen fra 127.0.0.1. I
  testmiljøet hentes klientens adresse fra Caddy (`TRUST_PROXY`). Restrisikoen fra `ghostweb` (andre containere kunne
  sende et falskt `X-Forwarded-For`) er **fjernet i fase 13**: appen er på et eget nett med bare Caddy (ADR-0022).
- **Basic auth i testmiljøet** er ett felles passord for teamet. Det er et ekstra lag foran innloggingen, ikke en
  erstatning for den.
- **Open Food Facts-data kan være feil** («must not be used for medical purposes»). Allergener hentes derfor ikke fra
  OFF, og alt fra OFF er bare et forslag brukeren retter.
- **Sperre som angrep:** Noen som kjenner en e-postadresse, kan sperre kontoen i 15 minutter om gangen. Sperren er
  kort med vilje.
- **Samtidige forsøk:** Forespørsler som allerede er i gang når sperren slår inn, blir fortsatt sjekket. Dette
  begrenses av grensen per IP-adresse.
- **Andre forsøk:** Passordbytte og sletting teller ikke mot sperren per konto, bare mot grensen per IP-adresse.
- **Kjøpsdata kan si mye om en person.** Butikk, dato og hva som kjøpes, kan avsløre vaner, bosted og helse
  (for eksempel kosthold). Dataene vises bare for medlemmer av husholdningen, logges ikke og sendes ikke ut av
  maskinen. **Vurdert i fase 13 (KI-ens forslag):**
  - Ingen egen kryptering av kolonner: nøkkelen måtte ligget på samme server som databasen, og det ville gitt lite
    vern mot det som er mest sannsynlig (feil i appen).
  - Disken og kopiene: kopiene er kryptert, men databasens disk er ikke kryptert av appen.
  - Ingen automatisk sletting av gamle kjøp: brukeren vil se historikken, og kan slette kjøp eller hele kontoen selv.
  - Teamet bør ta stilling til om eldre data (for eksempel over to år) skal slettes automatisk.
- **Allergier kan være helseopplysninger** (særlige kategorier, GDPR art. 9). I SmartMat er de frivillige, brukes
  bare til å skjule eller varsle om oppskrifter, vises bare for brukeren selv, logges ikke (testet) og slettes med
  kontoen. Fra fase 10 kan brukeren velge å dele dem med en husholdning (se «Delte husholdninger»). **Behandlingsgrunnlaget er ikke vurdert av teamet.** Uttrykkelig samtykke (art. 9 nr. 2 a) er den
  nærliggende løsningen, men det er en vurdering teamet må gjøre selv, og den er ikke gjort per 2026-10-21. Appen
  kjører bare lokalt og har ingen ekte brukere.
- **Allergenmerkingen er et KI-utkast som ikke er kontrollert** (`prisma/seed/ingredients.json`). Forbeholdet sier
  at informasjonen er veiledende, men det erstatter ikke at teamet kontrollerer merkingen.
- **Retting av samme kjøp fra to steder:** rettet i fase 13 (FR-BUD-006). Kjøpet har en versjon, og den som lagrer
  sist, får en melding i stedet for å overskrive. Varer, handleliste og måltidsplan har ikke dette: der gjelder
  fortsatt «siste lagring vinner», men endringene der er små og gjelder én rad om gangen.
- **Invitasjonslenken kan videresendes.** Den som har lenken, kan bli med. Den virker bare én gang og i 48 timer,
  kan trekkes tilbake, og eieren ser hvem som brukte den og kan fjerne vedkommende. Uten e-posttjeneste kan lenken
  ikke knyttes til en bestemt adresse.
- **Ingen sanntid:** et medlem ser endringer fra andre først når siden henter data på nytt (ved fokus, eller etter
  30 sekunder). En som er fjernet, kan se data som allerede er lastet inn, til neste forespørsel. Serveren gir ingen
  nye data.
- **Kvitteringsbilder i databasen:** bildene ligger i Postgres i opptil 7 dager. Sikkerhetskopiene (fase 13) tar
  ikke med `receipt_images` eller `receipt_extractions`. Det er testet ved å dekryptere en kopi og lete etter
  innholdet.
- **OCR-teksten kan være feil.** Appen fyller bare inn butikk, dato og total som standard (ADR-0017), og ingenting
  lagres før brukeren har bekreftet.
- **Gjort i fase 13:** tofaktorinnlogging, varsel om ny innlogging, sjekk mot lekkede passord, og sikkerhetsheadere
  for nettsiden (kontrollert i API-testene og mot domenet). Testmiljøet svarer med HTTPS og basic auth fra
  2026-10-27.
- **Glemt passord:** uten e-posttjeneste (FR-AUTH-006) kan en bruker som har glemt passordet, ikke tilbakestille det
  selv. Det samme gjelder den som har tofaktor på og har mistet både telefonen og gjenopprettingskodene. Teamet må
  da gjøre det manuelt på serveren. Det er greit i et lukket testmiljø, men ikke for åpen bruk.
- **Varsel om ny innlogging gjelder hver innlogging:** vi lagrer ingen historikk over enheter ut over aktive økter, så
  vi vet ikke hva som er en «ny» enhet. Det gir flere varsler enn nødvendig, men aldri færre.
- **Sjekken mot lekkede passord er åpen ved feil:** er tjenesten nede, godtas passordet. Det er valgt så
  registreringen virker uten HIBP (NFR-REL-001).
- **Sikkerhetskopiene ligger på samme server** som databasen (ADR-0021). De beskytter mot feil og sletting, ikke mot
  at serveren går tapt. Passfrasen og `TOTP_ENCRYPTION_KEY` må tas vare på et annet sted, ellers kan kopiene ikke
  brukes. Det er ikke gjort per 2026-10-27.
- **Tofaktor uten QR-kode:** for å slippe en ny avhengighet viser appen nøkkelen som tekst og en `otpauth://`-lenke.
  På en datamaskin må nøkkelen skrives inn i appen på telefonen for hånd.

## Kilder i prosjektet

- [ADR-0005](../development/architecture-decisions/0005-sesjoner-og-argon2id.md)
- [Fasespesifikasjon 02](../development/requirements/02-database-og-autentisering.md) (NFR-SEC-001–005)
- [API-tester (bevis)](../evidence/test-results/fase-2/05-api-tests.txt),
  [kontroll av sikkerhetstestene](../evidence/test-results/fase-2/10-mutation-check.txt)
- OWASP Password Storage Cheat Sheet (argon2id-parametere) og NIST SP 800-63B (passordlengde). Disse er brukt som
  bakgrunn av KI-verktøyet. Teamet har ikke lest dem i denne fasen, og de må legges inn i kildelisten (kapittel 19)
  med lenke og dato når de faktisk er sjekket.
