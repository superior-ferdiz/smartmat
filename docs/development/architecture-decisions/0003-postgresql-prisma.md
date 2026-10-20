# ADR-0003: PostgreSQL 16 + Prisma

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Dataene er relasjonelle (husholdning → lager → partier → kjøp) og krever fremmednøkler, unike begrensninger og transaksjoner.

## Beslutning
PostgreSQL 16 i Docker, Prisma som ORM og migreringsverktøy. Begrensninger Prisma ikke kan uttrykke (f.eks. CHECK)
legges inn som rå SQL i migreringene.

## Alternativer
- Drizzle/Knex: nærmere SQL, men Prisma-skjemaet er lettere å lese som datamodell for to studenter og i rapporten.
- MongoDB: passer dårlig til relasjonelle data og transaksjonell konsistens.

## Konsekvenser
Parametriserte spørringer som standard (beskytter mot SQL-injeksjon). Migreringer versjoneres sammen med koden.
