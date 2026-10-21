# SmartMat

SmartMat er en norsk webapplikasjon som skal hjelpe husholdninger å redusere matsvinn og ha kontroll på
matbudsjettet: digitalt matlager med holdbarhetsdatoer, registrering av kjøp, budsjett, oppskriftsforslag
basert på det man har, og etter hvert strekkode- og kvitteringsskanning.

Prosjektet utvikles av Ferdinand Risan og Linus Saxe Huseby som gruppeprosjekt i APP2000 –
Applikasjonsutvikling for web (USN, 2026/2027), med KI-assistert og spesifikasjonsdrevet utvikling (SDD).

## Status

**Fase 4 – kjøp og budsjett** er implementert (2026-10-21, grenen `fase-4`). Appen har innlogging, et ekte
matlager (partier, holdbarhet, forbruk, kassering og angre), registrering av kjøp som kan legge varene rett i lageret,
månedlig matbudsjett med forbruk per kategori, og en forside med ekte data. Oppskrifter, handleliste osv. er
fortsatt plassholdere. Se [veikartet](docs/development/roadmap.md).

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

Krever Node 22.12 eller nyere og Docker.

```bash
cp .env.example .env # fyll inn et eget passord for databasen (to steder: POSTGRES_PASSWORD og URL-ene)
npm install          # installerer alle pakker og genererer Prisma-klienten
npm run db:up        # starter PostgreSQL 16 i Docker på 127.0.0.1:55432
npm run db:migrate   # oppretter tabellene
npm run dev          # API på 127.0.0.1:3100 og web på http://127.0.0.1:5173
```

| Kommando | Hva den gjør |
|---|---|
| `npm run typecheck` | TypeScript-sjekk av alle pakker |
| `npm run lint` | ESLint (inkl. tilgjengelighet og hardkodet tekst) |
| `npm run format` | Formaterer koden med Prettier |
| `npm run test` | Enhets- og komponenttester (Vitest), uten database |
| `npm run test:api` | API-tester mot testdatabasen (krever `db:up`) |
| `npm run db:stop` | Stopper databasecontaineren (dataene beholdes) |
| `npm run build` | Produksjonsbygg av webappen til `apps/web/dist` |
| `npm run test:e2e` | Playwright-tester på 360 px og 1280 px med axe (bygger appen og starter et eget API) |
| `npm run check` | typecheck + lint + test + test:api + build |

Designsystemet kan ses på `/designsystem` i appen (lenke fra Innstillinger).
