# SmartMat — instructions for Claude

SmartMat is a Norwegian-first web app that helps households reduce food waste and grocery spending
(inventory + expiry, purchases/budget, recipe suggestions, barcode/receipt scanning).
It is also the group project in **APP2000 – Applikasjonsutvikling for web (USN Bø, 2026/2027)**.

- **Team:** Ferdinand Risan and Linus Saxe Huseby. Never name anyone else as a contributor.
- **Environment:** local development only (no hosting, no domain yet). Git since 2026-10-20 (ADR-0013): private repo
  `git@github.com:superior-ferdiz/smartmat.git`, branch `main`; one branch per phase (`fase-2`), the team opens and
  approves the pull request on GitHub. Commits from this server carry Ferdinand's identity, so
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

## Code conventions (added in phase 2)

- Local services: Postgres `127.0.0.1:55432` (container `smartmat-postgres`, volume `smartmat_pgdata`, DBs `smartmat`,
  `smartmat_test`, `smartmat_e2e`), API `127.0.0.1:3100` (Playwright's own API on 3101), web 5173 proxies `/api`.
  Secrets only in `.env` (see `.env.example`). `npm run db:up` / `db:stop` / `db:migrate`; never `down -v`.
- Prisma 7.10.1 (`prisma@latest` was an 8.0 RC): `prisma.config.ts` at the root, driver adapter `@prisma/adapter-pg`,
  client generated to `apps/api/src/generated/` (git-ignored, `postinstall` runs `prisma generate`).
  CHECK constraints go as raw SQL at the end of a migration.
- API modules: `routes.ts` (HTTP) / `service.ts` (rules, depends on a repo *interface*) / `repo.ts` (Prisma).
  Unit-test services with `src/test/fakes.ts`; API tests in `apps/api/test/` use the real test DB (`npm run test:api`).
- **Household data:** every route uses `preHandler: [requireAuth, householdAccess]` with `:householdId` in the URL and
  reads `householdOf(request).id`; non-member → 404. Repos take `householdId` as a required argument.
- Errors: throw `AppError(status, API_ERRORS.x, fields?)`; codes are i18n keys in `packages/shared/src/api/errors.ts`
  and must exist in both locale files (tested). Never put input values/PII in errors or logs.
- Web: `apiFetch` (`api/client.ts`) adds the CSRF header; session via `useSession`; pages with user data go under
  `RequireAuth` in `routes.tsx`. Web unit tests: `renderApp(path, { session })` + `mockApi()` for fetch.
- E2E: import `test` from `e2e/fixtures.ts` (logged-in worker user); use `isolatedAccount: true` for tests that change
  the account and `storageState: LOGGED_OUT` for logged-out tests.

## Code conventions (added in phase 3)

- Prisma refuses `migrate reset` when run by Claude (data loss) and `migrate dev` fails non-interactively on some
  changes: write the migration with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
  --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `npx prisma migrate deploy`.
- Child tables of household data repeat `household_id` and use composite FKs `(parent_id, household_id)`; parents
  need `@@unique([id, householdId])`. Use `onDelete: NoAction` (not Restrict) where a household cascade also deletes
  the referenced rows. Quantity changes use conditional `updateMany` (`quantityBase: { gte: x }`), never read-then-write.
- Dates are `YYYY-MM-DD` strings; "today" = `osloDate()` from `packages/shared` (Europe/Oslo). Convert at the DB
  boundary with `lib/dbDates.ts`. In shared code avoid `| 'x'` string unions (locales.test.ts reads them as øre
  error codes) – use `as const` arrays.
- Web: inventory server state in `apps/web/src/inventory/api.ts` (invalidate `['household', id]`); component files
  export only components (helpers go in `.ts` files, react-refresh rule). Modal UI = `components/Dialog` (native
  `<dialog>`; jsdom stand-in in `test/setup.ts`). `mockApi` falls back to `defaultApi` (empty inventory etc.).
- E2E: `apiAs(playwright, account)` seeds data via the API (sets the cookie header itself: Playwright's request context
  drops Secure cookies over http). On phones run axe with a tall viewport (sticky bottom nav, see chapter 11).
- After writing files with `\u00A0` in them, check for literal U+00A0 – but only fix files you just wrote (a blanket
  fix changed a comment in `ore.ts` once).

## Code conventions (added in phase 4)

- Spending is never stored: budget figures are summed from `purchases`/`purchase_lines` on every read (ADR-0007).
  A purchase has lines OR a total; with lines the server computes `total_ore` (`purchaseTotal`). Non-food lines are
  recorded but not counted as food spending.
- Writes that span tables go in one `db.$transaction`; reuse `insertBatchWithEvent` (inventory repo) for any new
  batch so it gets its "add" event. A composite FK on a nullable column (`purchase_line_id`) is `NoAction` and the code
  clears it before deleting the parent (SET NULL would also clear `household_id`).
- Idempotent creates: the form sends a random `clientRequestId`, stored as a `dedupe_key` unique per household;
  a repeat answers 200 with the existing row (P2002 race handled in the repo).
- Web: `apiFetch` supports PUT; purchase/budget hooks in `apps/web/src/purchases/api.ts`. Form logic lives in `.ts`
  files and uses the API's field names as error keys (`lines.0.amountOre`) so server errors land on the right field.
- API tests that move a fake clock more than 14 days must make a request in between (sessions expire after 14 idle days).

## Code conventions (added in phase 5)

- Recipe/ingredient tables are **global** (no `household_id`), written only by `npm run db:seed` from
  `prisma/seed/` (checked by `checkSeed` in `packages/shared/src/recipes/seed.ts`; `-- --check` only validates).
  Test and e2e databases get the fictional fixtures in `apps/api/test/fixtures/seed/` (`source=test`) via
  `globalSetup` / `e2e-server.ts` – never the team's recipes. Never write recipes as `source=team` (ADR-0009).
- Matching and scoring are pure functions in `packages/shared/src/recipes/` (used by API and web). Whole-word aliases,
  most words wins, a tie is "ambiguous" (no guess). Conversions round **down**; use-by-passed batches never count.
- Allergen wording: only "registered", never "free of"; `AllergenDisclaimer` wherever recipes are shown;
  `locales.test.ts` blocks forbidden phrases. Allergies are `/me/allergens` (user, not household).
- Recipe queries live under `['household', id, 'recipes']`, so inventory/purchase invalidation re-ranks them.
- A shared type like `Pick<T, 'a' | 'b'>` also trips the øre-code regex in `locales.test.ts` (`| 'x'`): split into
  `Pick<T,'a'> & Pick<T,'b'>`.
- URL-controlled checkboxes update a tick after the click: in Playwright use `click()` + `toBeChecked()`, not `check()`.

## Code conventions (added in phase 6)

- Shopping list: one per household (`shopping_lists.household_id` unique, created at registration). A partial unique
  index allows one OPEN line per ingredient; writes that merge lock the list row (`lockList`, `FOR UPDATE`).
  Pure rules in `packages/shared/src/shopping/list.ts`. `checked` is always *set*, never toggled.
- "To inventory" deletes the checked lines first with a condition and rolls back if the count differs – that is the
  double-submit guard. Shopping batches have no price and no purchase (ADR-0007).
- Shopping queries live under `['household', id, 'shopping-list']`; list edits refetch only the list, stocking
  refetches the whole household.
- The list rows use one delegated native listener (`shopping/listEvents.ts`) and uncontrolled checkboxes keyed on
  their state plus a `version` bumped on rollback. Playwright: tick with `click()`, not `check()`.
- Testing Library normalises `\u00A0` in the DOM but not in the matcher: write plain spaces in `getByText`.
  Bash heredocs/python edits have produced literal U+00A0 three times now – grep the files you wrote.

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
