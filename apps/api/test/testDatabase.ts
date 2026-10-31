import { loadRootEnvFile } from '../src/config';

/**
 * The URL of a database the tests may empty. Refuses anything not named *_test or *_e2e,
 * so a wrong .env can never wipe the development database.
 */
export function testDatabaseUrl(
  variable: 'TEST_DATABASE_URL' | 'E2E_DATABASE_URL' = 'TEST_DATABASE_URL',
): string {
  loadRootEnvFile();
  const url = process.env[variable];
  if (!url) throw new Error(`${variable} is not set (see .env.example)`);
  const name = new URL(url).pathname.slice(1);
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(
      `Refusing to use database "${name}" for tests: the name must end in _test or _e2e`,
    );
  }
  return url;
}
