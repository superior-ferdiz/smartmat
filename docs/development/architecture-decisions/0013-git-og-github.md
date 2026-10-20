# ADR-0013: Versjonskontroll med Git og privat repo på GitHub

**Status:** Akseptert 2026-10-20. Ferdinand Risan opprettet repoet og ba om at Git tas i bruk (i chat med Claude).
Ikke gjennomgått av Linus Saxe Huseby ennå. Erstatter delen om Git i [ADR-0012](0012-lokal-utvikling-forst.md).

## Kontekst
ADR-0012 utsatte Git. Uten Git finnes det ingen historikk over hvem som endret hva, og ingen måte å rulle tilbake en
feil på. Fase 2 innfører innlogging og sesjoner, som er sikkerhetskritisk kode, så det er viktig å kunne se og
reversere endringer.

## Beslutning
- Git med et **privat** repo på GitHub: `git@github.com:superior-ferdiz/smartmat.git`. Hovedgren er `main`.
- Første commit inneholder fase 0 og fase 1 slik de var 2026-10-20. Historikken før det finnes bare i
  utviklingsloggen og KI-loggen.
- **Forfatterskap:** commits som lages fra utviklingsserveren, får Git-identiteten til Ferdinand Risan. Når koden er
  skrevet av KI, får commit-meldingen en `Co-Authored-By: Claude`-linje. Commit-historikken alene beviser derfor
  ikke hvem som har skrevet koden – KI-loggen gjør det.
- Linus Saxe Huseby er invitert som samarbeidspartner og committer fra egen maskin med egen identitet.
- Hemmeligheter (`.env`, nøkler, passord) skal aldri inn i repoet. `.gitignore` utelater dem, og `.env.example`
  brukes til å vise hvilke variabler som trengs.
- Genererte filer (`node_modules`, `dist`, testrapporter fra Playwright) commites ikke. Lagrede testbevis i
  `docs/evidence/` commites.

## Alternativer
- Fortsette uten Git: ingen historikk og ingen angremulighet. Forkastet.
- Offentlig repo: kan gjøre det vanskeligere å vise at arbeidet er eget før innlevering, og eksponerer
  arbeid i utvikling. Kan vurderes etter innlevering.
- GitLab/USN-tjenester: ingen konto var satt opp. GitHub var allerede i bruk.

## Konsekvenser
- Endringer kan spores og rulles tilbake. Fase 2 og senere kan bruke grener for større endringer.
- Teamet må bli enige om arbeidsflyt (direkte på `main` eller via pull requests). Ikke avklart per 2026-10-20.
