import { defineConfig } from 'vitest/config';

// One test run for the whole monorepo: each workspace has its own config.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/web', 'apps/api'],
  },
});
