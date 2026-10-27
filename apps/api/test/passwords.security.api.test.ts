import { describe, expect, it } from 'vitest';
import { API_ERRORS } from '@smartmat/shared';
import { sha1Hex } from '../src/providers/passwords/pwnedPasswords';
import {
  fakePwnedCheck,
  fakePwnedFetch,
  LEAKED_PASSWORD,
  PWNED_DOWN_PASSWORD,
  PWNED_ODD_PASSWORD,
  PWNED_SLOW_PASSWORD,
} from './fakePwned';
import {
  call,
  captureLog,
  createTestApp,
  login,
  PASSWORD,
  registerUser,
  useTestDatabase,
} from './helpers';

/*
 * Spec 13 (FR-AUTH-008): passwords known from breaches are refused at registration and password change, with the
 * real check against a fake Pwned Passwords (apps/api/test/fakePwned.ts). Nothing here reaches the network.
 */

const db = useTestDatabase();

async function appWithPwned(fake = fakePwnedFetch(), log?: ReturnType<typeof captureLog>) {
  return createTestApp(db, {
    pwnedPasswords: fakePwnedCheck(fake),
    config: {
      pwnedPasswords: { enabled: true, baseUrl: 'https://api.pwnedpasswords.com', timeoutMs: 200 },
      ...(log ? { logLevel: 'info' as const } : {}),
    },
    ...(log ? { logStream: log.stream } : {}),
  });
}

const register = (app: Awaited<ReturnType<typeof createTestApp>>, password: string) =>
  call(app, 'POST', '/auth/register', {
    body: { displayName: 'Kari', email: 'kari@example.test', password },
  });

describe('FR-AUTH-008 leaked passwords', () => {
  it('registration with a leaked password: 400 at the password field, and no account is made', async () => {
    const app = await appWithPwned();
    try {
      const response = await register(app, LEAKED_PASSWORD);
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual({
        code: API_ERRORS.passwordPwned,
        fields: { password: API_ERRORS.passwordPwned },
      });
      expect(await db.user.count()).toBe(0);
      expect((await register(app, PASSWORD)).statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it('password change to a leaked password: 400 at the new-password field; the old password still works', async () => {
    const app = await appWithPwned();
    try {
      const kari = await registerUser(app, { email: 'kari@example.test' });
      const change = await call(app, 'POST', '/me/password', {
        client: kari,
        body: { currentPassword: PASSWORD, newPassword: LEAKED_PASSWORD },
      });
      expect(change.statusCode).toBe(400);
      expect(change.json().error.fields).toEqual({ newPassword: API_ERRORS.passwordPwned });
      expect((await login(app, 'kari@example.test')).statusCode).toBe(200);
      expect((await login(app, 'kari@example.test', LEAKED_PASSWORD)).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('the wrong current password is reported before the leak check (no free oracle without the password)', async () => {
    const fake = fakePwnedFetch();
    const app = await appWithPwned(fake);
    try {
      const kari = await registerUser(app, { email: 'kari@example.test' });
      const before = fake.urls.length;
      const change = await call(app, 'POST', '/me/password', {
        client: kari,
        body: { currentPassword: 'feil nåværende passord', newPassword: LEAKED_PASSWORD },
      });
      expect(change.json().error.code).toBe(API_ERRORS.wrongPassword);
      expect(fake.urls.length).toBe(before);
    } finally {
      await app.close();
    }
  });

  it.each([
    ['answers 503', PWNED_DOWN_PASSWORD],
    ['answers with HTML', PWNED_ODD_PASSWORD],
    ['does not answer in time', PWNED_SLOW_PASSWORD],
  ])('the service %s → the password is accepted (NFR-REL-001)', async (_name, password) => {
    const app = await appWithPwned();
    try {
      expect((await register(app, password)).statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it('login is never checked: an account made before the check keeps working', async () => {
    const plain = await createTestApp(db);
    await registerUser(plain, { email: 'kari@example.test', password: LEAKED_PASSWORD });
    await plain.close();
    const fake = fakePwnedFetch();
    const app = await appWithPwned(fake);
    try {
      expect((await login(app, 'kari@example.test', LEAKED_PASSWORD)).statusCode).toBe(200);
      expect(fake.urls).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('only 5 characters of the hash leave, and the log has no password, hash or prefix', async () => {
    const fake = fakePwnedFetch();
    const log = captureLog();
    const app = await appWithPwned(fake, log);
    try {
      await register(app, LEAKED_PASSWORD);
      await register(app, PWNED_DOWN_PASSWORD);
    } finally {
      await app.close();
    }
    for (const url of fake.urls) expect(url).toMatch(/\/range\/[0-9A-F]{5}$/);
    expect(fake.lastHeaders?.get('add-padding')).toBe('true');
    const text = log.text();
    expect(text).toContain('pwned password check skipped');
    for (const password of [LEAKED_PASSWORD, PWNED_DOWN_PASSWORD]) {
      const hash = sha1Hex(password);
      for (const secret of [password, hash, hash.slice(0, 5), hash.slice(5)]) {
        expect(text).not.toContain(secret);
      }
    }
  });

  it('switched off (the default): nothing is asked, a leaked password is accepted', async () => {
    const fake = fakePwnedFetch();
    const app = await createTestApp(db, { pwnedPasswords: undefined });
    try {
      expect((await register(app, LEAKED_PASSWORD)).statusCode).toBe(201);
      expect(fake.urls).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
