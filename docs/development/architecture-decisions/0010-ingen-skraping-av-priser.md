# ADR-0010: Ingen skraping av priser

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Skraping av kjedenes nettsider kan bryte bruksvilkår og databasevernet i åndsverkloven. Prisdata er ikke nødvendig for MVP.

## Beslutning
Vi skraper ikke. Kassalapp API vurderes i fase 12, først etter at vilkår, kostnad, attribusjon, dekning og rate limits er lest og dokumentert
i `docs/development/integrations/`. Alle prisobservasjoner lagrer kilde og tidspunkt. Grensesnittet viser aldri ufullstendig dekning som en komplett sammenligning.

## Konsekvenser
Prissammenligning kommer sent. Kostnadsestimater før det bygger bare på brukerens egne kjøp, og merkes som estimater.
