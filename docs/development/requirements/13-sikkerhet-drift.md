# 13 – Sikkerhet, personvern, backup, hosting, ytelse og tilgjengelighet (fase 13)

**Status:** Implementert og testet 2026-10-25/27 (se kapittel 11). Planen ble godkjent av Ferdinand Risan i chat 2026-10-25 («Godkjennt i plenum, vennligst fortsett!»). De
åtte åpne spørsmålene ble ikke besvart enkeltvis, så anbefalingene i planen gjelder (se under). «I plenum» er
registrert som Ferdinands erklæring; Linus Saxe Huseby har ikke bekreftet selv. Spesifikasjonen er skrevet av KI
(Claude) før implementeringen.

**Bygger på:** FR-AUTH-001–006, FR-BUD-001/005, NFR-SEC-001–005, NFR-UX-001–003 og NFR-REL-001 i
[00-kravoversikt.md](00-kravoversikt.md), ADR-0005, ADR-0015, ADR-0019, og de nye
[ADR-0021](../architecture-decisions/0021-sikkerhetskopi-og-gjenoppretting.md) og
[ADR-0022](../architecture-decisions/0022-eget-nett-for-caddy-og-smartmat.md). Vilkårene til Have I Been Pwned er
lest og dokumentert i [integrations/pwned-passwords.md](../integrations/pwned-passwords.md).

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Committe og pushe fase 12 før `fase-13` | Fase 12 er committet lokalt (18f0789) før grenen ble laget. **Pushen ble stoppet** av verktøyets sikkerhetssperre, fordi prompten sier «commit og push bare når jeg ber om det». Den venter på et uttrykkelig ja. |
| 2 | Eget nett for Caddy og SmartMat | Ja: `smartmat-edge` (ADR-0022). Én linje i GhostWebsite-prosjektets compose-fil og `docker network connect`, uten omstart av Caddy. |
| 3 | Testmiljøet nå | Ja. Caddy-blokken legges inn når passordhashen til basic auth finnes i den private mappen. |
| 4 | Varsel om gammel backup uten e-post | Sjekken feiler (systemd-enheten blir «failed» og skriver i journalen), og et banner i testmiljøet sier fra. |
| 5 | Backup et annet sted | Nei, bare på samme server foreløpig. Det er en dokumentert begrensning. |
| 6 | Lekkede passord | Have I Been Pwned (range-API, k-anonymitet), etter at vilkårene er lest. |
| 7 | Tofaktor | Sist i fasen, hvis resten er ferdig og grønt. |
| 8 | Kontakt i personvernerklæringen | Ikke oppgitt. Plassholderen er tydelig merket og må fylles inn av teamet. |
| 9 | Plassholderne i prompten | Gjennomgang siden fase 12: ingen. Kassalapps vilkår lest av teamet: nei. Nøkkel: har vi ikke. Ordlyden i varsler og priser: ikke lest. Art. 9 og tolkningen om Kassalapp: ikke vurdert. Oppskriftene og `ingredients.json`: ingen kontroll. ADR-0017: ikke godkjent. DNS: **satt opp** (A og AAAA peker på serveren, sjekket 2026-10-25). Passord til basic auth: ikke valgt. Produksjon: ikke bestemt. E-posttjeneste: har ingen. |

## Utenfor fasen (venter på teamet)

- **E-post (FR-AUTH-006):** ingen tjeneste, så ingen kode. Se «Hva e-post krever» nederst.
- **Produksjon:** ikke bestemt, så ingen ADR og ikke noe oppsett. Bare det lukkede testmiljøet.
- **Varsler på e-post eller push:** krever egen ADR (ADR-0019).

## Krav og akseptansekriterier

### NFR-SEC-006 Sikkerhetsheadere for nettsiden
- Når API-et serverer nettsiden (testmiljøet), har alle svar: `Content-Security-Policy` (ingen `unsafe-inline`, ingen
  `unsafe-eval`, `frame-ancestors 'none'`, `object-src 'none'`), `Strict-Transport-Security` (minst ett år,
  `includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Cross-Origin-Opener-Policy:
  same-origin`, `Cross-Origin-Resource-Policy: same-origin` og `Permissions-Policy` med `camera=(self)`.
- `Server` og `X-Powered-By` sendes ikke.
- Kontrollert både i en API-test og med curl mot `https://smartmat.risansolutions.no` (bevis lagres).

### NFR-SEC-007 Bare Caddy kan sette klientens adresse
- Appen er bare på `smartmat-edge` (Caddy og appen) og det interne nettet, ikke på `ghostweb`.
- `TRUST_PROXY` er nettet til `smartmat-edge` (192.168.252.0/28).
- Et `X-Forwarded-For` fra en adresse utenfor `TRUST_PROXY` blir ikke trodd (testet).

### NFR-SEC-008 Ingen personopplysninger i loggene
- En API-test kjører registrering, innlogging, feil passord, varer, kjøp, strekkoder, priser, invitasjoner og eksport
  med kjente verdier, og feiler hvis loggen inneholder e-post, navn, varenavn, butikk, strekkode, token, passord,
  CSRF-token eller IP-adresse.
- Workerens logglinjer har bare id-er, antall og tider (gjennomgått).

### FR-AUTH-008 Sjekk mot lekkede passord
- Ved registrering og passordbytte spør serveren Pwned Passwords med de 5 første tegnene i SHA-1 av passordet
  (`GET https://api.pwnedpasswords.com/range/{prefiks}`, `Add-Padding: true`, User-Agent med kontakt).
- Finnes resten av hashen med antall ≥ 1, svarer API-et 400 `errors.auth.passwordPwned` ved passordfeltet.
- **Tjenesten nede, tidsavbrudd (2 s) eller ugyldig svar:** passordet godtas. Registreringen må virke uten tjenesten
  (NFR-REL-001). Det logges at sjekken ikke ble gjort, men aldri passordet, hashen eller prefikset.
- Av uten `PWNED_PASSWORDS=on`. Tester bruker et falskt svar og når aldri nettet.
- Innlogging sjekkes ikke (eksisterende brukere låses ikke ute).

### FR-AUTH-009 Aktive økter og varsel om ny innlogging
- Økten lagrer **nettleserfamilie og operativsystem** (for eksempel «Firefox» og «Android») fra User-Agent, med et
  fast alfabet (CHECK). Ikke IP-adresse og ikke hele User-Agent-teksten.
- Profilen viser aktive økter: nettleser, system, når den ble startet og sist brukt, og hvilken som er «denne».
  Hver annen økt kan logges ut, og «Logg ut alle andre» finnes. En annen brukers økt kan ikke logges ut (404).
- **Varsel om ny innlogging:** en innlogging vises i brukerens *andre* økter som en melding øverst på siden
  («Ny innlogging: Firefox på Windows, 25. okt. kl. 14.02»), med «Det var meg» og «Se aktive økter». Den nye økten
  selv viser ingen melding. «Det var meg» fjerner meldingen i alle økter.
- Tolkning: «ny enhet» krever at vi husker gamle enheter. Vi lagrer ingen historikk ut over aktive økter, så **hver
  innlogging** gir meldingen. Det er strengere, ikke svakere.

### FR-AUTH-010 Tofaktorinnlogging (TOTP), valgfritt
- Brukeren kan slå på TOTP (RFC 6238, SHA-1, 6 sifre, 30 s) med en QR-kode og en tekstnøkkel, bekreftet med en kode.
  Hemmeligheten lagres kryptert med en nøkkel fra miljøet (`TOTP_ENCRYPTION_KEY`, AES-256-GCM).
- Ti gjenopprettingskoder vises én gang og lagres bare som hash. Hver kan brukes én gang.
- Innlogging med TOTP på: riktig passord gir et kortvarig «andre steg» (5 min), og først en riktig kode gir økt.
  Samme kode kan ikke brukes to ganger (siste tidssteg lagres). Feil koder teller mot sperren per konto.
- Slå av og nye gjenopprettingskoder krever passord og en gyldig kode.
- Bygges bare hvis resten av fasen er ferdig og grønn (avgjørelse 7).

### FR-BUD-006 Samtidig retting av samme kjøp
- `purchases.version` (heltall, starter på 1, økes ved hver retting).
- Rettingen sender versjonen den ble lest med. Er versjonen en annen, svarer API-et 409 `errors.purchases.changed`,
  og ingenting endres. Siden sier «Noen andre har endret kjøpet. Last inn på nytt for å se endringene.»
- Testet med to samtidige rettinger: nøyaktig én lykkes.

### FR-PRIV-001 Eksport av egne data (art. 15 og 20)
- `GET /api/v1/me/export` gir en JSON-fil (`smartmat-eksport-ÅÅÅÅ-MM-DD.json`, `Content-Disposition: attachment`).
- Innhold: konto (e-post, navn, språk, opprettet), allergier og delingsvalg, varselinnstillinger, aktive økter
  (nettleser, system, tider), og for hver husholdning brukeren er med i: navn, rolle, medlemmer slik appen viser dem,
  lagringssteder, varer, partier, varehistorikk og svinn, kjøp med linjer, budsjett, handleliste, måltidsplan,
  husholdningens egne strekkoder, og kvitteringer (status og datoer).
- **Ikke med:** passordhash, sesjonstokens, CSRF-token, TOTP-hemmelighet, kvitteringsbilder og OCR-uttrekk (slettes
  uansett innen 7 dager), globale tabeller (oppskrifter, produkter, priser).
- Krever innlogging, egen rate limit (5 per time per IP). Loggen har bare URL og status.
- Knappen «Last ned mine data» på profilen.

### FR-PRIV-002 Lagringstider (håndheves)
- Utløpte økter slettes av workeren hver natt (i dag bare ved neste innlogging for samme bruker).
- Lagringstidene står samlet i kapittel 12 og i personvernerklæringen.

### FR-PRIV-003 Personvernerklæring
- `/personvern` er offentlig, lenket fra registrering, innlogging, profilen og «Mer».
- Den sier hvem som er behandlingsansvarlig, hva som lagres, hvorfor, hvor lenge, hvem som får hva (Open Food Facts,
  Kassalapp, Have I Been Pwned: bare strekkoder eller hashprefiks), hvor serveren står, rettighetene og hvordan de
  brukes, og klagerett til Datatilsynet.
- **Kontaktadressen er en merket plassholder** til teamet fyller den inn. Testmiljøet viser fortsatt banneret om
  testdata.

### NFR-OPS-001 Nattlig, kryptert sikkerhetskopi (ADR-0021)
- `pg_dump -Fc` av testmiljøets database hver natt (systemd-timer), **uten data** fra `receipt_images` og
  `receipt_extractions`. Strukturen til tabellene er med.
- Kryptert med `gpg --symmetric --cipher-algo AES256`. Passfrasen ligger i `/etc/smartmat-backup/passphrase` (0600,
  root), aldri i repoet, chatten eller loggen.
- Lagres i `/var/backups/smartmat/` (0700). De siste 7 kopiene beholdes.
- Pilotdataene for OCR ligger utenfor databasen og kommer aldri med.

### NFR-OPS-002 Test av gjenoppretting
- Skriptet dekrypterer nyeste kopi og gjenoppretter den i en midlertidig Postgres-container uten nettverk.
- For **hver tabell** sammenlignes antall rader og en md5 av hele innholdet (alle kolonner, sortert) med
  kildedatabasen tatt i samme øyeblikk. `receipt_images` og `receipt_extractions` skal være tomme.
- Containeren fjernes etterpå. En ødelagt fil (én endret byte) skal få testen til å feile.

### NFR-OPS-003 Varsel når kopien er gammel eller feiler
- Sjekken feiler hvis nyeste kopi er eldre enn 26 timer, ikke kan dekrypteres, eller backupen feilet. Den skriver
  status til `/var/lib/smartmat-backup/status.json`.
- Filen er montert skrivebeskyttet i appen. `GET /api/v1/ops/backup` (innlogget) gir `ok`, `stale`, `failed` eller
  `unknown`, og testmiljøet viser et banner når den ikke er `ok`.

### NFR-OPS-004 Testmiljøet på nett
- Caddy-blokken fra [testmiljo.md](../testmiljo.md), redigert på stedet, validert og lastet inn på nytt.
- Kontrollert med curl over IPv4 og IPv6: 401 uten passord, `noindex`, alle headere fra NFR-SEC-006.

### NFR-PERF-001 Ytelse
- Hver side lastes som egen del (`React.lazy`). Hovedfilen måles før og etter (`vite build`).
- EXPLAIN ANALYZE for svinn, varsler, oppskriftsrangering og prisanslag mot en egen database `smartmat_perf` med
  generert, realistisk datamengde. Indekser legges bare til der planen viser at de trengs.

### NFR-UX-005 WCAG 2.2 AA-gjennomgang
- Hver side gås gjennom mot kriteriene i [tilgjengelighet.md](../testing/tilgjengelighet.md), og funn rettes.
- Playwright-tester: hele siden kan brukes med tastatur (fokus synlig og ikke skjult bak menyer), 200 % zoom
  (1280 px vindu → 640 CSS-px) uten horisontal rulling, og `prefers-reduced-motion` slår av animasjoner.
- En sjekkliste for VoiceOver og TalkBack som teamet fyller ut. Det som bare kan testes av mennesker, står der.

## Hva e-post krever (FR-AUTH-006, beslutningsnotat)

Ingen kode før teamet har bestemt seg. Det som trengs:

1. **En leverandør** med servere i EØS og databehandleravtale (art. 28). Eksempler å vurdere (ikke lest):
   Brevo (Frankrike), Mailjet (Frankrike), eller SMTP fra et eget domene. Vilkårene må leses og dokumenteres i
   `integrations/` før bruk, som for Kassalapp.
2. **Avsenderadresse og DNS:** SPF, DKIM og DMARC for domenet, ellers havner e-posten i søppelpost.
3. **En ADR** for e-post, og en egen for e-postvarsler (ADR-0019).
4. **Flyten:** engangslenke med token i `#`-delen (som invitasjoner), 30 minutter, bare hash lagret, samme svar
   uansett om adressen finnes («Hvis adressen har en konto, har vi sendt en lenke»). Det løser også svakheten om
   e-post som allerede finnes ved registrering.

## Avvik og funn under implementeringen (2026-10-25/27)

| # | Hva | Følge |
|---|---|---|
| 1 | **Push av fase 12 ble stoppet** av verktøyets sikkerhetssperre (avgjørelse 1). Commiten (18f0789) er lokal. | Venter på et uttrykkelig «push» fra Ferdinand |
| 2 | **`.env.staging.example` virket aldri:** tomme linjer som `KASSALAPP_API_KEY=` stoppet appen ved oppstart («Invalid … variables»). Funnet da testmiljøet ble startet. | Tom verdi betyr nå «ikke satt» (`loadConfig`), med test |
| 3 | **To ulike `Referrer-Policy`:** Caddy-blokken i `testmiljo.md` og appen (helmet) ville sendt hver sin. | Fjernet fra Caddy-blokken. Appen sender `no-referrer`. |
| 4 | **Varsel om «ny enhet»** krever historikk over enheter. Vi lagrer ingen. | Varsel ved **hver** innlogging (strengere) |
| 5 | **Tofaktor uten QR-kode:** en QR-kode ville krevd en ny pakke. | Nøkkel som tekst i grupper på fire, og en `otpauth://`-lenke |
| 6 | **Svinnspørringen leste alle husholdningers hendelser** (Hash Right Anti Join over 102 000 rader) med realistiske data. | `u.household_id = e.household_id` i tre spørringer. 10–14 ms → 2,5–3,8 ms. |
| 7 | **Fokus skjult bak bunnmenyen** på telefon (6 sider), og **ingen fokusring** på kalenderknappen i datofelt. | `scroll-padding` og `:focus-within` (global.css) |
| 8 | **Påstand rettet i egen tekst:** KI skrev først at stedssidens knapper allerede brukte `aria-label`. Det stemte ikke. | Siden er rettet. Teksten i `tilgjengelighet.md` beskriver hva som faktisk ble gjort. |
| 9 | **Lagringstider:** varseltilstander og invitasjoner slettes «lat» (ved neste skriving), ikke av en jobb. Produktmellomlageret slettes aldri. | Dokumentert i kapittel 12. Ikke endret. |
| 10 | **Passordhashen til basic auth:** Ferdinands første forsøk (`docker exec -it … > fil`) skrev bare ledeteksten til filen. Kommandoen Claude ga etterpå, ga `EOF`: `printf '%s'` sendte ikke linjeskift. Ferdinand spurte hvorfor han måtte gjøre det. | Claude laget et tilfeldig passord rett i en privat fil og la inn blokken 2026-10-27. HTTPS, 401 uten passord og headere er kontrollert over IPv4 og IPv6. |
| 11 | **Kodedelingen brøt fokus ved sidebytte** (overskriften fantes ikke ennå). Funnet av Playwright. | `useFocusHeadingOnNavigate` venter på `<h1>` (MutationObserver), med egen test |
| 12 | **Tidsbombe i en varseltest fra fase 11** (fast dato med ekte klokke). | Datoen regnes fra klokken |
| 13 | **Tofaktor** ble tatt med (avgjørelse 7), sist i fasen. | Mutasjonssjekken: 26 av 27 fanget (den siste gir samme oppførsel) |

## Sporbarhet til tester

Se tabellen i [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-13).
