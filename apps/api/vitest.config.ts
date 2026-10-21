import { defineProject } from 'vitest/config';

/** Unit tests: business rules with in-memory fakes. No database needed (`npm test`). */
export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
