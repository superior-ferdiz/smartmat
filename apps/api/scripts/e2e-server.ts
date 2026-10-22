import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db';
import { fakeOffFetch, testBarcodeProvider } from '../test/fakeOff';
import { seedFixtureRecipes } from '../test/fixtureSeed';
import { testDatabaseUrl } from '../test/testDatabase';

/*
 * The API instance Playwright starts (playwright.config.ts): its own database (smartmat_e2e), emptied
 * at start and given the fictional test recipes, on port 3101, accepting requests from the preview server on 4173. Rate limits are raised
 * because every test registers users from the same address; the limits themselves are tested in
 * apps/api/test/security.api.test.ts.
 */
const databaseUrl = testDatabaseUrl('E2E_DATABASE_URL');
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: fileURLToPath(new URL('../../..', import.meta.url)),
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
});

const config = loadConfig({
  ...process.env,
  DATABASE_URL: databaseUrl,
  API_PORT: '3101',
  APP_ORIGINS: 'http://127.0.0.1:4173',
  LOG_LEVEL: 'warn',
  RATE_LIMIT_LOGIN_MAX: '10000',
  RATE_LIMIT_REGISTER_MAX: '10000',
  RATE_LIMIT_SENSITIVE_MAX: '10000',
});
const db = createDb(databaseUrl);
await db.$executeRawUnsafe(
  'TRUNCATE TABLE sessions, household_members, households, users RESTART IDENTITY CASCADE',
);
await db.$executeRawUnsafe('TRUNCATE TABLE products, product_lookup_misses');
// Spec 05: the fictional test recipes, never the team's (the e2e tests must not depend on real content).
await seedFixtureRecipes(db);
// Spec 07: never the real Open Food Facts. The fake one answers for the made-up codes in test/fakeOff.ts.
const app = await buildApp({
  config,
  db,
  barcodeProvider: testBarcodeProvider(fakeOffFetch().fetchFn as typeof fetch),
});
await app.listen({ host: config.host, port: config.port });
