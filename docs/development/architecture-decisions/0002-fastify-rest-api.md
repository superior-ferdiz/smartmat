# ADR-0002: Fastify + Zod, REST under /api/v1

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Vi trenger et typet API med validering av all input og tydelig struktur.

## Beslutning
Fastify med TypeScript og `fastify-type-provider-zod`. REST-endepunkter under `/api/v1`. Kode organiseres per modul:
`routes.ts` (HTTP), `service.ts` (forretningsregler), `repo.ts` (databasetilgang).

## Alternativer
- Express: mest kjent, men validering, typer og feilhåndtering må settes sammen manuelt.
- tRPC/GraphQL: tett kobling til frontend eller mer kompleksitet enn behovet tilsier.

## Konsekvenser
Validering skjer før rutekoden kjører. Versjonering i URL gjør det mulig å endre API-et senere uten å knekke klienter.
