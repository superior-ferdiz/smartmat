# Sikkerhet og personvern

> **Status: UTKAST.** Skrevet etter fase 2 (2026-10-20), fase 3 og fase 4 (2026-10-21). Tiltakene og teksten er laget av KI (Claude) og
> ikke gjennomgått av teamet ennå. **Kapittelet er ingen juridisk vurdering.** Samsvar med GDPR og
> personopplysningsloven er ikke vurdert av noen med kompetanse på det. Offisielle APP2000-krav er ikke verifisert.

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

Testene er kontrollert ved å slå av hver beskyttelse i koden én om gangen
([fase 2](../evidence/test-results/fase-2/10-mutation-check.txt),
[fase 3](../evidence/test-results/fase-3/10-mutation-check.txt),
[fase 4](../evidence/test-results/fase-4/10-mutation-check.txt),
[fase 5](../evidence/test-results/fase-5/10-mutation-check.txt),
[fase 6](../evidence/test-results/fase-6/10-mutation-check.txt),
[fase 7](../evidence/test-results/fase-7/10-mutation-check.txt)). Resultatene står i kapittel 11.

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

Det ble ikke brukt noen eksterne tjenester eller databehandlere i fase 2–6. Alt kjørte lokalt.

**Fra fase 7:**
- **Open Food Facts** får strekkoden når den ikke er kjent fra før. Den sendes fra serveren, ikke fra brukerens
  nettleser, så OFF får ikke brukerens IP-adresse eller cookie. OFF får serverens IP-adresse og kontaktadressen i
  User-Agent. En strekkode alene sier ikke hvem som skannet den. Det mellomlagrede svaret (`products`) har ingen
  data om brukere.
- **Det lukkede testmiljøet** (ADR-0015, ikke satt opp per 2026-10-22):
  - Behandlingsansvarlige er studentene (Ferdinand Risan og Linus Saxe Huseby), etter Ferdinands svar i chat
    2026-10-22.
  - Serveren står i Tyskland (EØS) og driftes av Ferdinand. Leverandøren av serveren er dermed databehandler. Om det
    finnes en databehandleravtale, er ikke undersøkt.
  - Det er bare teamets egne kontoer og testdata der. Banneret ber om at ingen ekte allergier legges inn, så
    helseopplysninger (art. 9) skal ikke finnes der. Det håndheves ikke teknisk.
  - Lokalt er ingenting endret: alt kjører fortsatt på maskinen.

## Sletting

- «Slett konto» på profilsiden sletter brukeren og husholdninger der brukeren er eneste medlem, i én transaksjon.
  Det samme gjelder alt som hører til, på grunn av `ON DELETE CASCADE` (FR-AUTH-005). Fra fase 3 omfatter
  det hele matlageret og svinnloggen, fra fase 4 kjøp, linjer og budsjett, og fra fase 5 allergiene. Dette er testet.
- Etter slettingen virker ingen gamle sesjoner, og e-postadressen kan brukes på nytt. Dette er testet.
- **Ikke håndtert ennå:** sikkerhetskopier (finnes ikke lokalt) og eierskap i delte husholdninger (fase 10).

## Kjente svakheter og utsatte tiltak

- **E-post som allerede finnes:** Registrering sier ærlig fra om dette. Da kan noen finne ut om en adresse har konto.
  Rate limiting begrenser det. Ordentlig løsning (svar «sjekk e-posten din») krever e-postverifisering
  (FR-AUTH-006, fase 13).
- **Grensen per IP-adresse** er i praksis felles for alle lokalt, fordi alt går via Vite-proxyen fra 127.0.0.1. I
  testmiljøet hentes klientens adresse fra Caddy (`TRUST_PROXY`). **Restrisiko:** andre containere på `ghostweb`-nettet
  (andre nettsteder på serveren, samme eier) kan sende et falskt `X-Forwarded-For`. Et eget nett bare for Caddy og
  SmartMat ville fjernet det, men krever endring i et annet prosjekt.
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
  maskinen. En vurdering av behovet for kryptering eller kortere lagringstid hører til fase 13.
- **Allergier kan være helseopplysninger** (særlige kategorier, GDPR art. 9). I SmartMat er de frivillige, brukes
  bare til å skjule eller varsle om oppskrifter, vises bare for brukeren selv, logges ikke (testet) og slettes med
  kontoen. **Behandlingsgrunnlaget er ikke vurdert av teamet.** Uttrykkelig samtykke (art. 9 nr. 2 a) er den
  nærliggende løsningen, men det er en vurdering teamet må gjøre selv, og den er ikke gjort per 2026-10-21. Appen
  kjører bare lokalt og har ingen ekte brukere.
- **Allergenmerkingen er et KI-utkast som ikke er kontrollert** (`prisma/seed/ingredients.json`). Forbeholdet sier
  at informasjonen er veiledende, men det erstatter ikke at teamet kontrollerer merkingen.
- **Retting av samme kjøp fra to steder:** siste lagring vinner, uten varsel. Betyr lite før husholdninger kan ha
  flere medlemmer (fase 10).
- **Ikke gjort:** tofaktorinnlogging, varsel om innlogging fra ny enhet, sjekk mot lister over lekkede passord,
  HTTPS og sikkerhetsheadere for selve nettsiden (fase 13).

## Kilder i prosjektet

- [ADR-0005](../development/architecture-decisions/0005-sesjoner-og-argon2id.md)
- [Fasespesifikasjon 02](../development/requirements/02-database-og-autentisering.md) (NFR-SEC-001–005)
- [API-tester (bevis)](../evidence/test-results/fase-2/05-api-tests.txt),
  [kontroll av sikkerhetstestene](../evidence/test-results/fase-2/10-mutation-check.txt)
- OWASP Password Storage Cheat Sheet (argon2id-parametere) og NIST SP 800-63B (passordlengde). Disse er brukt som
  bakgrunn av KI-verktøyet. Teamet har ikke lest dem i denne fasen, og de må legges inn i kildelisten (kapittel 19)
  med lenke og dato når de faktisk er sjekket.
