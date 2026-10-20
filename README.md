# SmartMat

SmartMat er en norsk webapplikasjon som skal hjelpe husholdninger å redusere matsvinn og ha kontroll på
matbudsjettet: digitalt matlager med holdbarhetsdatoer, registrering av kjøp, budsjett, oppskriftsforslag
basert på det man har, og etter hvert strekkode- og kvitteringsskanning.

Prosjektet utvikles av Ferdinand Risan og Linus Saxe Huseby som gruppeprosjekt i APP2000 –
Applikasjonsutvikling for web (USN, 2026/2027), med KI-assistert og spesifikasjonsdrevet utvikling (SDD).

## Status

**Fase 1 – designsystem og app-skall** er implementert (2026-10-20). Appen har navigasjon, plassholdersider og
grunnkomponenter, men ingen backend eller database ennå. Se [veikartet](docs/development/roadmap.md).

## Dokumentasjon

| Hva                          | Hvor                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Veikart og fasestatus        | [docs/development/roadmap.md](docs/development/roadmap.md)                           |
| Arkitekturbeslutninger (ADR) | [docs/development/architecture-decisions/](docs/development/architecture-decisions/) |
| Krav                         | [docs/development/requirements/](docs/development/requirements/)                     |
| Datamodell                   | [docs/development/data-model.md](docs/development/data-model.md)                     |
| Utviklingslogg               | [docs/development/development-journal.md](docs/development/development-journal.md)   |
| KI-logg                      | [docs/evidence/ai-usage/ai-logg.md](docs/evidence/ai-usage/ai-logg.md)               |
| Akademisk rapport (utkast)   | [docs/academic/](docs/academic/)                                                     |

## Kjøre appen lokalt

Krever Node 22.12 eller nyere.

```bash
npm install          # installerer alle pakker (rot + apps/web + packages/shared)
npm run dev          # utviklingsserver på http://127.0.0.1:5173
```

| Kommando | Hva den gjør |
|---|---|
| `npm run typecheck` | TypeScript-sjekk av alle pakker |
| `npm run lint` | ESLint (inkl. tilgjengelighet og hardkodet tekst) |
| `npm run format` | Formaterer koden med Prettier |
| `npm run test` | Enhets- og komponenttester (Vitest) |
| `npm run build` | Produksjonsbygg av webappen til `apps/web/dist` |
| `npm run test:e2e` | Playwright-tester på 360 px og 1280 px med axe (bygger appen selv) |
| `npm run check` | typecheck + lint + test + build |

Designsystemet kan ses på `/designsystem` i appen (lenke fra Innstillinger).
