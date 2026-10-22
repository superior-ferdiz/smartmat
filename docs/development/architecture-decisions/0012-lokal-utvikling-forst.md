# ADR-0012: Lokal utvikling først, ingen Git ennå

**Status:** Delvis erstattet 2026-10-20 – delen om Git er erstattet av [ADR-0013](0013-git-og-github.md). 2026-10-22: delen om hosting er erstattet av [ADR-0015](0015-lukket-testmiljo.md) for et lukket testmiljø. Lokal utvikling er fortsatt hovedmåten å jobbe på, og produksjonsoppsett hører fortsatt til fase 13. Opprinnelig akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Teamet ønsker å utsette hosting og versjonskontroll.

## Beslutning
SmartMat kjøres lokalt med Docker Compose (Postgres) og Vite-utviklingsserver. Ingen domene, ingen produksjonsoppsett, ingen Git foreløpig.

## Konsekvenser
- Uten Git finnes ingen commit-historikk som bevis på hvem som gjorde hva. Utviklingsloggen og KI-loggen er derfor eneste spor, og må føres nøye.
- **Anbefaling:** innfør Git (privat repo) før fase 2, slik at arbeidet kan spores og rulles tilbake. Krever ny ADR.
- Produksjonsoppsett (Caddy, HTTPS, backup) tas i fase 13.
