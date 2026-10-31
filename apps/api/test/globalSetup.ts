import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDb } from '../src/db';
import { seedFixtureRecipes } from './fixtureSeed';
import { testDatabaseUrl } from './testDatabase';

/**
 * Brings the test database up to the latest migration before any test runs, and fills the global recipe
 * tables with the fictional test recipes (the tests empty only user and household tables).
 */
export default async function setup() {
  const url = testDatabaseUrl();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  const db = createDb(url);
  try {
    await seedFixtureRecipes(db);
  } finally {
    await db.$disconnect();
  }
}
