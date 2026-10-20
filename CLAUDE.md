# SmartMat — instructions for Claude

SmartMat is a Norwegian-first web app that helps households reduce food waste and grocery spending
(inventory + expiry, purchases/budget, recipe suggestions, barcode/receipt scanning).
It is also the group project in **APP2000 – Applikasjonsutvikling for web (USN Bø, 2026/2027)**.

- **Team:** Ferdinand Risan and Linus Saxe Huseby. Never name anyone else as a contributor.
- **Environment:** local development only (no hosting, no domain yet). Git since 2026-10-20 (ADR-0013): private repo
  `git@github.com:superior-ferdiz/smartmat.git`, branch `main`. Commits from this server carry Ferdinand's identity, so
  AI-written changes must include a `Co-Authored-By: Claude` trailer. Commit/push only when asked; never commit secrets.
- **Server note:** this machine also hosts other production sites. Never `pkill` by name, never touch other
  projects' containers, check `df -h /` before Docker builds (disk has been full before).

## How work is organized

Each phase runs in its **own chat**. At the start of a phase chat:

1. Read this file, [docs/development/roadmap.md](docs/development/roadmap.md) (phase status + scope),
   the ADRs in [docs/development/architecture-decisions/](docs/development/architecture-decisions/),
   [docs/development/requirements/](docs/development/requirements/) and the latest entries of
   [docs/development/development-journal.md](docs/development/development-journal.md).
2. Respond with the phase template (Goal, Current state, Requirements, Proposed implementation, Files affected,
   Dependencies, Security considerations, Tests to perform, Academic documentation to update, Risks/open questions)
   and **wait for approval** before writing code.
3. Write/refine the phase's spec in `docs/development/requirements/` (requirement IDs like `FR-INV-003`)
   before implementing. Tests reference those IDs.
4. At the end of the phase: run build/typecheck/tests for real, save the actual output under
   `docs/evidence/test-results/`, update roadmap status, changelog, development journal, AI log, and the
   affected `docs/academic/` chapters. Then report: what was implemented, files changed, tests actually run,
   results, known limitations, docs updated, what the students should review, next phase.

## Approved decisions (see ADRs for reasons)

- npm workspaces monorepo: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `prisma/`, `e2e/`, `docker/`.
- Frontend: React + TypeScript + Vite + React Router + TanStack Query + react-i18next (nb-NO default, en second).
- Styling: plain CSS — design tokens as CSS custom properties + CSS Modules. **No Tailwind.** Use CSS Grid/Flexbox visibly.
- Backend: Fastify + TypeScript + Zod (`fastify-type-provider-zod`), REST under `/api/v1`.
- Shared Zod schemas in `packages/shared` validate on both client and server.
- PostgreSQL 16 + Prisma migrations. Background jobs via pg-boss (no Redis until justified).
- Auth: server-side sessions in Postgres, httpOnly/Secure/SameSite=Lax cookie, argon2id, Origin check + CSRF token
  on mutations, rate limiting. Never JWT in localStorage.
- **Money = integer øre. Quantities = integer base units (g, ml, stk).** No floats for either.
- **`Purchase` is the single source of spending** in the MVP (no separate FinancialTransaction table).
- **Every household-owned row has `household_id`** from the first migration; a single user gets a household of one.
  Every query on household data filters by the caller's membership — server-side.
- Recipes: team-authored Norwegian seed recipes (`source=team`). No TheMealDB in MVP.
- Prices: no scraping. Kassalapp only after its terms are verified and documented.
- OCR: decided by a measured spike on real receipts; Tesseract (server-side) first for privacy.
  Automated extraction is never saved without user confirmation.
- External providers (OCR, barcode, prices, recipes, notifications) sit behind interfaces in `apps/api/src/providers/`
  with timeouts, validated responses and a working app when they are down.

## Code conventions (established in phase 1)

- Commands: `npm run typecheck | lint | test | build | test:e2e | check` from the repo root. Dev server binds `127.0.0.1:5173`.
- Exact versions pinned. TypeScript 6.0 (typescript-eslint needs <6.1), ESLint 9 (jsx-a11y lacks ESLint 10 support),
  react-router 7 (v8 needs Node ≥22.22), Vite 7 forced via root `overrides` (vitest let npm pull Vite 8 → npm crash),
  Playwright 1.63.0 (matches the cached Chromium; `playwright-core` also overridden).
- Colours/sizes only via tokens in `apps/web/src/styles/tokens.css`; the two dark-theme blocks must stay identical
  (`tokens.test.ts` checks this and WCAG contrast). Breakpoints 600/900/1200 are written out in media queries.
- No literal UI text in JSX (ESLint `i18next/no-literal-string`); keys are typed. nb-NO and en must have the same keys.
- Shared Zod schemas return **i18n keys** as messages (`validation.*`); `locales.test.ts` checks they all exist.
- Form controls go through `components/Field` (label, hint, error, `aria-describedby`, `aria-required` – not `required`).
- Sections/menus come from `apps/web/src/app/navigation.ts`.
- Write `\u00A0`/`\u2212` escapes in source, never the literal invisible characters.
- Evidence: save real output under `docs/evidence/test-results/fase-N/`; screenshots via `SCREENSHOTS=1 npx playwright test screenshots`.

## Integrity rules (non-negotiable)

- Never fabricate dates, meetings, tests, test results, screenshots, user feedback, sources or authorship.
- Never mark planned tests as executed. Evidence = real command output saved to `docs/evidence/`.
- Never claim the students wrote AI-generated code, or that they reviewed something they have not.
  Record review/approval only when it actually happens in the conversation (who, date, what).
- Academic templates stay marked `Status: UTKAST` until their content reflects the implemented system.
- Official APP2000 requirements have **not** been provided; course-related requirements are inferred and must be
  labelled as such. Do not ask for the documents again unless the team brings them up.
- Log every non-trivial AI contribution in [docs/evidence/ai-usage/ai-logg.md](docs/evidence/ai-usage/ai-logg.md).

## Writing conventions

- Documentation in `docs/` is written in natural Norwegian Bokmål. Code, identifiers and commit-style messages in English.
- UI text is Norwegian first, via i18n keys (no hard-coded strings in components).
- "Best før" and "Siste forbruksdag" are different concepts — never treat them the same, never advise eating
  food past a use-by date, never claim a recipe/product is allergen-free.
