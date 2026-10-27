# Systemarkitektur

> **Status: Kontrollert mot systemet av KI 2026-10-27 – ikke godkjent av teamet.** (Fase 14: filstier, kodenavn og tall
> er sjekket mot repoet og de lagrede utdataene, og det som var utdatert, er rettet. Se kapittel 20.)
> Historikk: Første del skrevet etter fase 2 (2026-10-20), utvidet i fase 7 (2026-10-22), fase 12 (2026-10-25) og fase 14
> (2026-10-27, fase 10, 11 og 13). Arkitekturen og teksten er laget av KI (Claude) og
> ikke gjennomgått av teamet ennå. Kapittelet utvides når flere deler kommer til. Offisielle APP2000-krav til rapporten er
> ikke verifisert.

## Oversikt

Under utvikling består SmartMat av tre deler som kjører lokalt (ADR-0012). Fra fase 8 kommer en bakgrunnsprosess
(workeren) i tillegg, og fra fase 7 og 13 et testmiljø på serveren (se under).

```mermaid
flowchart LR
  B[Nettleser<br/>React-app] -- "/ og /api/*<br/>samme opprinnelse" --> V[Vite<br/>127.0.0.1:5173]
  V -- "/api/* videresendes" --> A[API – Fastify<br/>127.0.0.1:3100]
  A -- "Prisma (SQL)" --> D[(PostgreSQL 16<br/>127.0.0.1:55432)]
  S[packages/shared<br/>Zod-skjemaer] -. brukes av .-> B
  S -. brukes av .-> A
```

| Del | Mappe | Teknologi | Ansvar |
|---|---|---|---|
| Web | `apps/web` | React, Vite, React Router, TanStack Query, i18next | Sider, skjemaer, validering for brukeren, visning |
| API | `apps/api` | Fastify, Zod, Prisma, argon2 | Forretningsregler, autorisasjon, validering (den som gjelder), sesjoner |
| Delt | `packages/shared` | Zod | Skjemaer, typer for API-svar, feilkoder, øre-hjelpere |
| Worker | `apps/api/src/worker.ts` (fase 8) | pg-boss, Tesseract | Kvitteringslesing, opprydding hvert 15. minutt (kvitteringer, priser eldre enn 30 dager) og hver natt (utløpte økter og innloggingsutfordringer) |
| Database | `prisma/`, `docker/` | PostgreSQL 16 i Docker | Lagring, fremmednøkler, unike og CHECK-begrensninger |

## Hvorfor én opprinnelse

Nettleseren snakker bare med Vite-serveren, som videresender `/api` til API-et. Sett fra nettleseren kommer appen og
API-et fra samme sted. Det gir tre fordeler:

- Sesjons-cookien er en vanlig førstepartscookie med `SameSite=Lax`.
- Vi trenger ikke CORS, som er en vanlig kilde til feil og sikkerhetshull.
- Origin-sjekken på serveren blir enkel: bare appens egen adresse er tillatt.

## API-et: ruter, service og repo (ADR-0002)

Hver modul i `apps/api/src/modules/` har tre lag:

| Lag | Fil | Ansvar | Vet om HTTP? | Vet om databasen? |
|---|---|---|---|---|
| Ruter | `routes.ts` | URL, skjema for inn/ut, statuskoder, cookie | ja | nei |
| Service | `service.ts` | Forretningsregler (sperre, utløp, passordsjekk) | nei | nei (bruker et repo-grensesnitt) |
| Repo | `repo.ts` | Prisma-spørringer og transaksjoner | nei | ja |

Fordi servicen bare kjenner et grensesnitt for repoet, kan reglene testes uten database. Det gjøres med falske repoer i
minnet (`src/test/fakes.ts`). Samme kode testes også mot en ekte database (`apps/api/test/`).

Felles deler ligger utenfor modulene:

- `plugins/origin.ts` (Origin-sjekk)
- `plugins/auth.ts` (sesjon, cookie og CSRF-token)
- `plugins/errors.ts` (ett feilformat)
- `authz/household.ts` (autorisasjon for husholdningsdata)

## Dataflyt: innlogging

```mermaid
sequenceDiagram
  participant N as Nettleser
  participant A as API
  participant D as Database
  N->>A: POST /api/v1/auth/login {email, password} + Origin
  A->>A: Origin på tillatelseslisten? Rate limit per IP? Zod-validering
  A->>D: finn bruker (e-post)
  A->>A: sperret? argon2id-sjekk (dummy-hash hvis ukjent/sperret)
  A->>D: lagre sesjon (SHA-256 av token, CSRF-token, utløp)
  A-->>N: 200 {user, csrfToken} + Set-Cookie (HttpOnly, Secure, SameSite=Lax)
  N->>A: PATCH /api/v1/me + cookie + X-CSRF-Token + Origin
  A->>D: finn sesjon (hash av cookie)
  A->>A: sjekk CSRF-token mot sesjonen
  A-->>N: 200 {oppdatert bruker}
```

## Eksterne tjenester bak et grensesnitt (fase 7)

Open Food Facts er den første eksterne tjenesten. API-et snakker bare med den gjennom `BarcodeProvider`
(`apps/api/src/providers/barcode/`). Nettleseren snakker aldri med den direkte, og kamerabildet forlater aldri
nettleseren.

```mermaid
flowchart LR
  K[Kamera<br/>i nettleseren] -- "bilde (bare lokalt)" --> L[Strekkodeleser<br/>BarcodeDetector / zxing-wasm]
  L -- "bare tallene" --> A[API]
  A --> H[(household_barcodes)]
  A --> C[(products<br/>mellomlager)]
  A -- "GTIN, User-Agent,<br/>3 s tidsavbrudd" --> O[Open Food Facts]
```

Rekkefølgen er husholdningens egne svar, så mellomlageret, så OFF. Er OFF nede, får brukeren det tomme skjemaet, og
resten av appen merker ingenting (NFR-REL-001). I testene erstattes `fetch`, så OFF aldri kalles.

## Testmiljøet (fase 7, ADR-0015, endret i fase 13)

Et lukket testmiljø på `smartmat.risansolutions.no` gjør det mulig å teste kameraet på en ekte telefon. Kameraet
krever HTTPS.
- **2026-10-22:** bygd, men ikke satt opp, fordi DNS manglet.
- **Fase 13:** DNS er på plass, og containerne kjører. Caddy-blokken med basic auth er live fra 2026-10-27
  ([`26-caddy-https.txt`](../evidence/test-results/fase-13/26-caddy-https.txt)). Appen er flyttet til et eget nett med bare Caddy (ADR-0022), og databasen får en kryptert kopi hver natt (ADR-0021).

```mermaid
flowchart LR
  T[Telefon] -- "HTTPS + passord<br/>(basic auth)" --> Y[Caddy<br/>ghostwebsite-caddy-1]
  Y -- "smartmat-edge (bare Caddy og appen),<br/>X-Forwarded-For overskrevet" --> P[smartmat-staging-app<br/>API + ferdig webapp]
  P -- "internt nett<br/>uten internett" --> Q[(smartmat-staging-db)]
  W[smartmat-staging-worker] -- "internt nett" --> Q
  P --> O[Open Food Facts / Kassalapp /<br/>Have I Been Pwned]
  B[systemd-timer på verten<br/>backup.sh] -- "pg_dump → gpg" --> K[(/var/backups/smartmat<br/>kryptert, 7 netter)]
  B -.-> Q
  B -- "status.json (bare tider)" --> P
```

Her serverer API-et også webappen, så det er fortsatt én opprinnelse. `trustProxy` stoler bare på `smartmat-edge`,
der bare Caddy kan sende forespørsler. Ellers ville alle brukere hatt samme IP-adresse (Caddy sin) og delt én rate
limit. Før fase 13 var det `ghostweb`, der 17 containere fra andre prosjekter også kunne sende et falskt hode.

## Kvitteringer i bakgrunnen (fase 8)

Å lese en kvittering tar 2–10 sekunder og rundt 50 MB minne. Det skjer derfor ikke i forespørselen, men i en egen
prosess, **workeren** (`apps/api/src/worker.ts`). API-et lagrer bildet og legger kvitteringens id i en kø
(pg-boss, i samme Postgres). Siden spør etter status hvert 2. sekund.

```mermaid
flowchart LR
  T[Telefon] -- "bilde (multipart)" --> A[API]
  A -- "skrives om uten metadata" --> I[(receipt_images)]
  A -- "bare id" --> Q[[pg-boss-kø]]
  Q --> W[Worker]
  W -- "bilde på stdin,<br/>uten nettverk" --> X[Tesseract]
  W -- "tekst uten betalingslinjer<br/>+ tolkede linjer" --> E[(receipt_extractions)]
  T -- "status / gjennomgang / bekreft" --> A
  A -- "én transaksjon" --> P[(purchases, lines,<br/>batches)]
```

Workeren er et eget startpunkt i API-pakken, fordi den bruker samme databasekode. I testmiljøet er den en egen
container på det interne nettverket uten internett. Uten OCR (`OCR_PROVIDER=off`) tar API-et ikke imot kvitteringer,
og siden viser det vanlige skjemaet (NFR-REL-002).

## Oppskrifter fra åpne kilder og måltidsplan (fase 9)

**Oppskriftene** hentes ikke mens appen kjører. En utvikler kjører et importskript som henter sider fra Wikibooks
(CC BY-SA 4.0) og lagrer originalen med revisjons-id. KI oversetter dem til oppskriftsfiler, og `npm run db:seed`
legger dem inn som før (ADR-0016). Appen er derfor ikke avhengig av en ekstern tjeneste, og hver oppskrift kan
spores til akkurat den versjonen den er oversatt fra.

```mermaid
flowchart LR
  WB[(Wikibooks)] -- "MediaWiki-API,<br/>1 per sekund" --> S[Importskript]
  S --> O[sources/wikibooks/*.json<br/>original + revisjon]
  O -- "KI oversetter,<br/>teamet kontrollerer" --> R[recipes/*.json]
  R -- "db:seed (checkSeed)" --> DB[(recipes)]
  DB --> A[API: rangering, plan, handleliste]
```

**Måltidsplanen** følger samme mønster som resten av API-et: ruter, service og repo, med de rene reglene i
`packages/shared/src/mealplan/`. Behovet lagres ikke. Det regnes ut ved hver forespørsel fra planen, oppskriftene,
matlageret og det planen allerede har lagt på handlelisten. Når noe legges på listen, skriver handlelistens repo både
linjen og bidraget i én transaksjon, med listen låst.

## Priser (fase 12)

Kassalapp er den andre eksterne tjenesten som spørres mens appen kjører, og den følger samme mønster som Open Food
Facts: et grensesnitt (`PriceProvider` i `apps/api/src/providers/prices/`), tidsavbrudd, Zod-validering, grenser og et
globalt hurtiglager. Uten nøkkel er provideren av, og appen viser bare husholdningens egne priser (ADR-0020).

```mermaid
flowchart LR
  W[Nettleser] -- "/prices/:gtin" --> A[API]
  A -- "egne priser<br/>(lest ved hver forespørsel)" --> B[(inventory_batches)]
  A --> C[(price_lookups<br/>price_observations<br/>6 timer)]
  A -- "bare GTIN + nøkkel,<br/>3 s, 30 per min" --> K[Kassalapp]
```

To regler holder dataene ærlige:
- **Egne og eksterne priser blandes aldri.** Egne priser kommer fra partiene (det husholdningen har betalt eller
  skrevet inn). Eksterne priser er anslag og skrives aldri til kjøp, partier, budsjett eller svinn (ADR-0007).
- **Anslaget på handlelisten spør ikke Kassalapp.** Det bruker bare det som allerede er lagret, så en lang liste ikke
  bruker opp grensen.

## Delte husholdninger og varsler (fase 10 og 11)

Lagt til i fase 14. Ingen av delene trengte en ny tjeneste eller prosess.

- **Delte husholdninger (ADR-0018):** datamodellen hadde `household_id` på alle rader fra fase 2 (ADR-0008), så deling
  er bare flere rader i `household_members`. Det som er nytt, er invitasjonen (en engangslenke der tokenet står i
  fragmentet `#…`, så det aldri når serveren i URL-en), roller (`requireOwner` etter `householdAccess`) og en aktiv
  husholdning på brukeren. Alle endringer i medlemskap låser husholdningsraden.
- **Varsler (ADR-0019)** lagres ikke som rader. De regnes ut ved hver forespørsel fra matlageret, budsjettet og
  handlelisten. Bare hva brukeren har sett og avvist, lagres. Nettleseren spør på nytt hvert 60. sekund. Det finnes
  ingen e-post eller push.

## Sikkerhetsgrenser

- **All tilgangskontroll skjer i API-et.** `RequireAuth` i React bestemmer bare hva som vises. Den beskytter ingenting.
- **Husholdningsdata:** ruter går gjennom `householdAccess`, som sjekker medlemskap i databasen (NFR-SEC-001).
  Mønsteret er beskrevet i [kapittel 10](10-teknisk-implementering.md#eksempel-6-autorisasjon-for-husholdningsdata).
- **Validering:** API-et validerer all input med de samme Zod-skjemaene som skjemaene i nettleseren (NFR-SEC-002).
- **Nettverk:** Lokalt lytter database og API bare på `127.0.0.1`. Maskinen kjører også andre nettsteder. I
  testmiljøet har ingen container en åpen port. Caddy når appen over Docker-nettet.

## Kilder i prosjektet

- [ADR-0001](../development/architecture-decisions/0001-monorepo-npm-workspaces.md),
  [ADR-0002](../development/architecture-decisions/0002-fastify-rest-api.md),
  [ADR-0003](../development/architecture-decisions/0003-postgresql-prisma.md),
  [ADR-0005](../development/architecture-decisions/0005-sesjoner-og-argon2id.md),
  [ADR-0008](../development/architecture-decisions/0008-husholdning-fra-start.md),
  [ADR-0012](../development/architecture-decisions/0012-lokal-utvikling-forst.md),
  [ADR-0014](../development/architecture-decisions/0014-produkter-og-strekkoder.md),
  [ADR-0015](../development/architecture-decisions/0015-lukket-testmiljo.md),
  [ADR-0018](../development/architecture-decisions/0018-delte-husholdninger-og-invitasjoner.md),
  [ADR-0019](../development/architecture-decisions/0019-varsler-beregnes-ved-lesing.md),
  [ADR-0020](../development/architecture-decisions/0020-priser-fra-kassalapp-som-anslag.md),
  [ADR-0021](../development/architecture-decisions/0021-sikkerhetskopi-og-gjenoppretting.md),
  [ADR-0022](../development/architecture-decisions/0022-eget-nett-for-caddy-og-smartmat.md)
- [Fasespesifikasjon 02](../development/requirements/02-database-og-autentisering.md)
- [API-dokumentasjon](../development/api-documentation.md)
