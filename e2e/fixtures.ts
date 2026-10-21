import {
  test as base,
  expect,
  type BrowserContext,
  type PlaywrightWorkerArgs,
} from '@playwright/test';

/*
 * Logged-in pages for Playwright. Every worker registers its own user through the real API, and the
 * tests in that worker reuse the session. Tests that change the account (language, password, delete)
 * set `isolatedAccount: true` and get a fresh user of their own, so they cannot disturb other tests.
 * Tests that need a logged-out browser use `test.use({ storageState: LOGGED_OUT })`.
 */

export const BASE_URL = 'http://127.0.0.1:4173';
export const PASSWORD = 'riktig hest batteri';
export const LOGGED_OUT = { cookies: [], origins: [] };

type Playwright = PlaywrightWorkerArgs['playwright'];
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface Account {
  email: string;
  password: string;
  displayName: string;
  storageState: StorageState;
}

let counter = 0;

export function uniqueEmail(prefix: string) {
  counter++;
  return `${prefix}-${process.pid}-${Date.now()}-${counter}@example.test`;
}

export async function registerAccount(playwright: Playwright, prefix = 'e2e'): Promise<Account> {
  const api = await playwright.request.newContext({
    baseURL: BASE_URL,
    // What a browser sends on a request from our own page (the API checks Origin, NFR-SEC-005).
    extraHTTPHeaders: { origin: BASE_URL },
  });
  const account = { email: uniqueEmail(prefix), password: PASSWORD, displayName: 'Testbruker' };
  const response = await api.post('/api/v1/auth/register', { data: account });
  expect(response.status(), await response.text()).toBe(201);
  const storageState = await api.storageState();
  await api.dispose();
  return { ...account, storageState };
}

/** Logs in through the API: a new, separate session – like logging in on another device. */
export async function loginAccount(playwright: Playwright, email: string): Promise<StorageState> {
  const api = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  });
  const response = await api.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(response.status(), await response.text()).toBe(200);
  const storageState = await api.storageState();
  await api.dispose();
  return storageState;
}

export const test = base.extend<
  { isolatedAccount: boolean; account: Account },
  { workerAccount: Account }
>({
  isolatedAccount: [false, { option: true }],

  workerAccount: [
    async ({ playwright }, use) => {
      await use(await registerAccount(playwright, 'worker'));
    },
    { scope: 'worker' },
  ],

  account: async ({ isolatedAccount, workerAccount, playwright }, use) => {
    await use(isolatedAccount ? await registerAccount(playwright, 'isolated') : workerAccount);
  },

  storageState: async ({ account }, use) => {
    await use(account.storageState);
  },
});

export { expect };
