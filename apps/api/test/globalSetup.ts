import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from './testDatabase';

/** Brings the test database up to the latest migration before any test runs. */
export default function setup() {
  const url = testDatabaseUrl();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
