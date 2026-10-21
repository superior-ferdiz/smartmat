import { defineConfig } from 'vitest/config';

/**
 * API tests against a real Postgres database (smartmat_test), through Fastify's inject (`npm run test:api`).
 * Needs the database container: `npm run db:up`.
 */
export default defineConfig({
  test: {
    name: 'api-db',
    root: import.meta.dirname,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    // All files share one database and empty it between tests, so they must not run at the same time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
