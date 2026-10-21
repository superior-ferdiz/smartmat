# Endringslogg

## [Ikke utgitt]

### Fase 5 – 2026-10-21 (grenen `fase-5`)
- **Oppskrifter:**
  - bla i og åpne oppskrifter, med søk (tittel og ingrediens) og tagg i URL-en
  - rangering etter matlageret med forklart poengsum: dekning (0–100) + «går snart ut» (0–30)
  - per ingrediens: har, for lite (hvor mye som mangler), usikker mengde, mangler, basisvare. Siste forbruksdag
    passert regnes aldri med.
  - kobling vare → ingrediens med aliaser (hele ord), og manuell kobling eller «ikke en ingrediens» på varesiden
- **Allergier:** 14 allergener på profilen. Oppskrifter med dem skjules som standard eller vises med advarsel.
  Forbeholdet vises alltid, og ingen tekst sier «allergenfri».
- **Forsiden:** middagsforslaget viser den best rangerte oppskriften. Ingenting er eksempeldata lenger.
- **Migrering:** `recipes` (7 tabeller, 3 enums, `ingredient_match`/`ingredient_id` på varer, CHECK).
- **Frødata:** `npm run db:seed` fra `prisma/seed/` med sjekk av alle filer. KI-utkast til 61 ingredienser (ikke
  kontrollert). Ingen oppskrifter fra teamet ennå. Tre fiktive testoppskrifter bare i test-databasene.
- **API:** `GET /households/:h/recipes`, `GET /households/:h/recipes/:id`, `GET /ingredients`,
  `GET`/`PUT /me/allergens`. `PATCH` av vare tar `ingredient`.
- **`packages/shared`:** matching, poengsum, frødataskjemaer, allergener, API-skjemaer.
- **Tester:** 637 enhetstester (+132), 158 API-tester (+29), 125 Playwright-tester (+10), og kontroll av testene.
  Felles frist på 3 s for `findBy` i webtestene. Axe på telefon med vindu like høyt som siden.

### Fase 4 – 2026-10-21 (grenen `fase-4`)
- **Kjøp og budsjett:**
  - registrere kjøp manuelt med linjer (mat med kategori, eller ikke mat) eller bare totalsum
  - matlinjer kan legges rett i matlageret som partier, på en ny eller eksisterende vare, i samme transaksjon
  - månedlig matbudsjett som gjelder fra en måned og fremover
  - månedsoversikt: brukt, gjenstående, andel, per kategori, «ikke fordelt» og ikke-mat for seg
  - retting og sletting av kjøp. Urørte partier fjernes, brukte beholdes.
  - samme skjema sendt to ganger gir ett kjøp (`clientRequestId`)
- **Migrering:** `purchases_budget` (`purchases`, `purchase_lines`, `food_budgets`, `purchase_line_id` på partier,
  sammensatte fremmednøkler, CHECK).
- **API:** 8 nye endepunkter under `/households/:householdId/` (`purchases`, `budget`). Partier har nå `purchaseId`.
- **`packages/shared`:** skjemaer for kjøp og budsjett, `sumOre`, `usedPercent` (BigInt), `monthFigures`,
  `addMonths`/`firstOfMonth`, ny feilkode `errors.purchase.changedMeanwhile`.
- **Web:**
  - `/budsjett` med månedsvelger i URL-en, `/budsjett/kjop/ny`, `/budsjett/kjop/:id` og `/budsjett/kjop/:id/rett`
  - forsidens budsjettkort viser ekte data. Bare middagsforslaget er fortsatt eksempeldata.
  - varesiden lenker til kjøpet et parti kom fra
  - `apiFetch` støtter `PUT`
- **Tester:** 505 enhetstester (+79), 127 API-tester (+46), 115 Playwright-tester (+8), og kontroll av testene.

### Fase 3 – 2026-10-21 (grenen `fase-3`)
- **Matlager:**
  - varer med partier (egen mengde, eget sted, best før *eller* siste forbruksdag, pris, kjøpsdato)
  - lagringssteder (Kjøleskap/Fryser/Skap og egne), 12 kategorier
  - forbruk og kassering (helt eller delvis), med årsak og verdi (faktisk, estimert fra pris, ukjent) i svinnloggen
  - historikk med «Angre siste endring»
- **Migreringer:** `inventory` (5 tabeller, sammensatte fremmednøkler, CHECK, kategorier, standardsteder) og
  `inventory_event_seq`. Registrering lager nå tre standardsteder.
- **API:** 15 nye endepunkter under `/households/:householdId/`, og `GET /categories`.
- **`packages/shared`:**
  - mengder i grunnenhet (`parseQuantity`/`formatQuantity`)
  - holdbarhetsstatus og «i dag» i Europe/Oslo
  - verdiestimat med BigInt, skjemaer og typer for matlageret
- **Web:**
  - `/matlager` med oppsummering, søk, filtre og sortering i URL-en
  - `/matlager/ny`, `/matlager/:id` med dialoger og historikk, `/matlager/steder`
  - ny `Dialog`-komponent (`<dialog>`)
  - forsiden viser ekte «Går ut snart» og «Kastet denne måneden»
- **Tester:** 426 enhetstester (+95), 81 API-tester (+34), 107 Playwright-tester (+12), og kontroll av testene.

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
