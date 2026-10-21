# Endringslogg

## [Ikke utgitt]

### Fase 2 – 2026-10-20 (grenen `fase-2`)
- Docker Compose med PostgreSQL 16 på `127.0.0.1:55432`, med egne databaser for utvikling, API-tester og Playwright.
- `apps/api`: Fastify + Zod + Prisma 7, REST under `/api/v1`, moduler med routes/service/repo.
- Prisma-skjema og første migrering: `users`, `households`, `household_members` og `sessions`, med CHECK-begrensninger.
- Registrering (med husholdning av én), innlogging, utlogging, profil (navn, språk, passord) og sletting av konto.
- Sikkerhet:
  - argon2id og sesjoner i Postgres der bare hash av tokenet lagres
  - cookie med HttpOnly/Secure/SameSite=Lax
  - Origin-sjekk og CSRF-token
  - sperre per konto og rate limit per IP-adresse
  - feilkoder som i18n-nøkler, ingen personopplysninger i loggen
- Felles autorisasjonsmønster for husholdningsdata (`authz/household.ts`).
- Web:
  - sidene `/logg-inn`, `/registrer` og `/profil`
  - beskyttede ruter, kontoseksjon i Innstillinger
  - språket lagres på kontoen
  - Vite videresender `/api`
- `packages/shared`: skjemaer for auth og profil, typer for API-svar og feilkoder.
- Tester: 331 enhetstester (+98), 47 API-tester mot database (nye), 95 Playwright-tester (+32).
- `.env.example`, nye skript: `db:up`, `db:stop`, `db:migrate`, `db:deploy`, `test:api`, `dev` (web + API).

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
