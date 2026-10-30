# ADR-0015: Lukket testmiljø med HTTPS på smartmat.risansolutions.no

**Status:** Akseptert 2026-10-22 — foreslått av KI (Claude) i planen for fase 7, godkjent av Ferdinand Risan i chat
(«godkjent»). Ikke gjennomgått av Linus Saxe Huseby. Erstatter delen om hosting i
[ADR-0012](0012-lokal-utvikling-forst.md) («ingen domene, ingen produksjonsoppsett»), men bare for et lukket
testmiljø. Produksjon, sikkerhetskopier og åpen registrering hører fortsatt til fase 13.
**Ikke satt opp per 2026-10-22:** DNS for domenet finnes ikke ennå, og Caddy er ikke endret.
**Fase 13 (2026-10-25/27):** DNS peker på serveren (A og AAAA, sjekket 2026-10-25), og containerne kjører. Appen er
flyttet fra `ghostweb` til et eget nett (`smartmat-edge`, [ADR-0022](0022-eget-nett-for-caddy-og-smartmat.md)), og
testmiljøet har nattlig, kryptert sikkerhetskopi ([ADR-0021](0021-sikkerhetskopi-og-gjenoppretting.md)). «Ingen
sikkerhetskopier» under gjelder ikke lenger. Caddy-blokken ble lagt inn 2026-10-27, og domenet svarer med HTTPS og
basic auth.

## Kontekst
Kameraet i nettleseren krever en sikker side (HTTPS eller localhost). Utviklingsserveren lytter bare på 127.0.0.1,
så skanning kan ikke testes på en ekte telefon. Serveren kjører også andre nettsteder bak én Caddy-container
(`ghostwebsite-caddy-1` på Docker-nettverket `ghostweb`), som henter sertifikater selv.

## Beslutning
- **Adresse:** `smartmat.risansolutions.no`. Ferdinand setter opp DNS. Alt går gjennom én opprinnelse: `/api` og
  nettsiden på samme vertsnavn, så cookien er førstepart og ingen CORS trengs.
- **Lukket:**
  - Caddy krever passord (`basic_auth`, bcrypt-hash i Caddyfile, aldri i SmartMat-repoet) og fjerner
    `Authorization` før forespørselen går videre (`header_up -Authorization`).
  - `REGISTRATION_OPEN=false` gjør at registreringen svarer 403, og lenken til den skjules. Kontoene lages med et
    skript (`npm run create-user`) via `docker exec`, bare for teamet.
  - **Endret 2026-10-30:** registreringen er åpnet (`REGISTRATION_OPEN=true`) på Ferdinands forespørsel («Tillat å
    registrere ny bruker»). Caddys passord gjelder fortsatt, så bare de som har det, kommer til registreringen.
  - `X-Robots-Tag: noindex, nofollow`.
- **Bare testdata:** et banner sier «Testmiljø – bruk bare testdata. Ikke legg inn ekte allergier.» Ingen
  sikkerhetskopier. Ingredienslisten (KI-utkast) legges inn, men ingen oppskrifter.
- **Kjøring:** `docker/staging/compose.yml` har to containere:
  - `smartmat-staging-app` (Node 22) kjører `prisma migrate deploy` ved oppstart og serverer både API-et og den
    ferdigbygde webappen.
  - `smartmat-staging-db` (Postgres 16) har eget volum `smartmat_staging_pgdata` på et internt nettverk uten
    nettilgang.

  Appen er også koblet til `ghostweb`, slik at Caddy når den og den kan nå Open Food Facts. Ingen porter er åpnet
  mot verden.
- **Klientens IP-adresse:** `TRUST_PROXY=172.26.0.0/16` (nettverket `ghostweb`). Fastify stoler bare på
  `X-Forwarded-For` fra den adressen, og Caddy overskriver hodet med den ekte adressen
  (`header_up X-Forwarded-For {remote_host}`, som de andre nettstedene på serveren). Ellers ville alle brukere delt
  samme rate limit. Lokalt er `trustProxy` fortsatt av.
- **Origin og cookie:**
  - `APP_ORIGINS=https://smartmat.risansolutions.no` og `COOKIE_SECURE=true`.
  - Cookien heter `__Host-smartmat_session` (`COOKIE_HOST_PREFIX=true`): den har ingen `Domain` og kan ikke
    overstyres av en cookie satt for `.risansolutions.no`.
  - risansolutions.no sender HSTS med `includeSubDomains`, så underdomenet må uansett ha HTTPS.
- **Sikkerhetshoder fra appen:**
  - CSP med `'wasm-unsafe-eval'`, ellers stopper nettleseren reserveskanneren.
  - `Permissions-Policy: camera=(self)`. Blokken for risansolutions i Caddyfile har `camera=()` og må ikke kopieres.
- **Endring av Caddy** gjøres først når Ferdinand sier at DNS peker til serveren:
  - Caddyfile er én fil som er montert inn i containeren. Den redigeres på stedet, så filen ikke byttes ut og
    containeren fortsatt ser den.
  - Først `caddy validate`, så `caddy reload`.
  - Ingen andre containere røres.

## Personvern (GDPR)
- **Behandlingsansvarlig:** studentene (Ferdinand Risan og Linus Saxe Huseby).
- **Server:** står i Tyskland (EØS) og driftes av Ferdinand. Leverandøren av serveren er databehandler. Det er ikke
  vurdert om det finnes en databehandleravtale.
- **Personopplysninger:** bare teamets egne kontoer (e-post, navn, sesjoner) og testdata. Dette er ikke en tjeneste
  for andre.
- **Allergier:** testmiljøet skal ikke ha ekte allergier. Banneret sier det. Spørsmålet om art. 9 er derfor ikke
  løst her, bare unngått.
- **Open Food Facts** får bare strekkoden, fra serveren. Ikke brukerens IP-adresse.
- **Logger:** det er ikke kontrollert om Caddy logger IP-adresser for andre nettsteder. Blokken for SmartMat får
  ingen `log`. API-et logger ikke IP-adresser.
- En fullstendig personvernerklæring hører til fase 13.

## Alternativer
- **`adb reverse` fra en Android-telefon til localhost:** virker for Android over USB, men ikke for iPhone, og bare
  for den som sitter ved serveren.
- **Tunneltjenester (ngrok o.l.):** en tredjepart ser all trafikk, og adressen endrer seg.
- **Eget Docker-nettverk bare for Caddy og SmartMat:** strammere `trustProxy`, men krever endring i
  compose-oppsettet til et annet prosjekt.

## Konsekvenser
- Teamet kan teste kameraet på egne telefoner over HTTPS.
- Restrisiko: andre containere på `ghostweb` kan forfalske `X-Forwarded-For`. De tilhører samme eier.
- Testmiljøet må tas ned eller lukkes helt hvis det ikke lenger brukes (`docker compose -f docker/staging/compose.yml
  down`; volumet slettes bare med vilje).
