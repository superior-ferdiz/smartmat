# Endringslogg

## [Ikke utgitt]

### Fase 1 – 2026-10-20
- npm workspaces-monorepo med `apps/web` og `packages/shared`, felles TypeScript-, ESLint- og Prettier-oppsett.
- Designsystem i ren CSS: tokens for farger (lyst og mørkt tema), typografi, avstand, radius, skygger og brytepunkter.
- App-skall med bunnmeny (mobil) og sidemeny (≥ 900 px), 9 seksjoner med plassholdersider, «Mer»-side og 404.
- Forside med CSS Grid-kort merket som eksempeldata.
- Grunnkomponenter: Button/LinkButton, TextField, NumberField, Select, DateField, Checkbox, FormError/FormErrorSummary,
  Card, Tag, EmptyState, LoadingState, ErrorState, Alert, Toast.
- Innstillinger for språk (bokmål/engelsk) og tema (automatisk/lyst/mørkt), designsystem-side med eksempelskjema.
- `packages/shared`: `parseOre`/`formatOre` og første Zod-skjemaer.
- Testoppsett: Vitest + Testing Library (233 tester), Playwright på 360 px og 1280 px med axe (63 tester).

### Fase 0 – 2026-10-19
- Prosjektmappe og dokumentasjonsstruktur opprettet.
- ADR-0001–0012, veikart, kravoversikt og datamodellutkast.
- Ingen applikasjonskode ennå.
