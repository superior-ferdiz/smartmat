# ADR-0001: Monorepo med npm workspaces

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Frontend, API og bakgrunnsjobber deler typer og valideringsregler. Kurset vektlegger validering både på klient og server.

## Beslutning
Ett repo med npm workspaces: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`. Zod-skjemaer i
`packages/shared` brukes både i skjemaene i nettleseren og i API-ruttene.

## Alternativer
- Separate repoer: dobbelt vedlikehold av typer, lett at klient og server glir fra hverandre.
- pnpm/Turborepo: raskere, men er ikke installert og gir mer verktøy å forklare. npm er nok for denne størrelsen.

## Konsekvenser
Én kilde til sannhet for validering. Ulempe: delt pakke må bygges/typesjekkes før appene.
