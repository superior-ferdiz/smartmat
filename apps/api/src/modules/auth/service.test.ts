import { describe, expect, it } from 'vitest';
import { API_ERRORS } from '@smartmat/shared';
import { createFakeClock, createFakeHasher, createFakeStore } from '../../test/fakes';
import { AppError } from '../../lib/errors';
import { AuthService } from './service';
import {
  LOGIN_LOCK_MS,
  LOGIN_MAX_FAILURES,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from './policy';
import { hashSessionToken } from './tokens';

const PASSWORD = 'riktig hest batteri';
const EMAIL = 'kari@example.test';

function setup() {
  const store = createFakeStore();
  const { hasher, calls } = createFakeHasher();
  const clock = createFakeClock();
  const service = new AuthService({ repo: store.authRepo, hasher, now: clock.now });
  return { store, calls, clock, service };
}

async function registered() {
  const ctx = setup();
  const result = await ctx.service.register({
    displayName: 'Kari',
    email: EMAIL,
    password: PASSWORD,
  });
  return { ...ctx, ...result };
}

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode: status, code });
}

describe('FR-AUTH-001 register', () => {
  it('creates the user, returns the session user with a household, and starts a session', async () => {
    const { user, session, store } = await registered();
    expect(user).toMatchObject({ email: EMAIL, displayName: 'Kari', locale: 'nb-NO' });
    expect(user.householdId).toEqual(expect.any(String));
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.sessions.size).toBe(1);
  });

  it('stores the password only as a hash', async () => {
    const { store } = await registered();
    const stored = [...store.users.values()][0];
    expect(stored?.passwordHash).not.toBe(PASSWORD);
  });

  it('stores only the hash of the session token, never the token (ADR-0005)', async () => {
    const { session, store } = await registered();
    const stored = [...store.sessions.values()][0];
    expect(stored?.tokenHash).toBe(hashSessionToken(session.token));
    expect(JSON.stringify([...store.sessions.values()])).not.toContain(session.token);
  });

  it('keeps the chosen language', async () => {
    const { service } = setup();
    const { user } = await service.register({
      displayName: 'Ola',
      email: 'ola@example.test',
      password: PASSWORD,
      locale: 'en',
    });
    expect(user.locale).toBe('en');
  });

  it('refuses an e-mail address that is already registered (409)', async () => {
    const { service } = await registered();
    await expectAppError(
      service.register({ displayName: 'Andre', email: EMAIL, password: PASSWORD }),
      409,
      API_ERRORS.emailTaken,
    );
  });
});

describe('FR-AUTH-002 login, logout and sessions', () => {
  it('logs in with the right password and starts a new session', async () => {
    const { service, store } = await registered();
    const { session } = await service.login({ email: EMAIL, password: PASSWORD });
    expect(store.sessions.size).toBe(2);
    expect(await service.authenticate(session.token)).toMatchObject({
      csrfToken: session.csrfToken,
    });
  });

  it('gives the same error for an unknown e-mail and a wrong password', async () => {
    const { service } = await registered();
    await expectAppError(
      service.login({ email: 'ukjent@example.test', password: PASSWORD }),
      401,
      API_ERRORS.invalidCredentials,
    );
    await expectAppError(
      service.login({ email: EMAIL, password: 'feil passord!!' }),
      401,
      API_ERRORS.invalidCredentials,
    );
  });

  it('does password-hash work even when the e-mail is unknown (no timing difference)', async () => {
    const { service, calls } = await registered();
    const before = calls.verify;
    await service.login({ email: 'ukjent@example.test', password: PASSWORD }).catch(() => {});
    expect(calls.verify).toBe(before + 1);
  });

  it('logout ends the session', async () => {
    const { service, session } = await registered();
    await service.logout(session.token);
    expect(await service.authenticate(session.token)).toBeNull();
  });

  it('unknown or missing tokens are not authenticated', async () => {
    const { service } = await registered();
    expect(await service.authenticate(undefined)).toBeNull();
    expect(await service.authenticate('not-a-real-token')).toBeNull();
  });

  it('a session expires after 14 days without use, and is deleted', async () => {
    const { service, session, clock, store } = await registered();
    clock.advance(SESSION_IDLE_MS + 1);
    expect(await service.authenticate(session.token)).toBeNull();
    expect(store.sessions.size).toBe(0);
  });

  it('a session in use lives on, but never beyond 30 days after login', async () => {
    const { service, session, clock } = await registered();
    // Use the app every 10 days: the idle limit keeps moving forward …
    for (let day = 10; day < 30; day += 10) {
      clock.advance(10 * 24 * 60 * 60 * 1000);
      expect(await service.authenticate(session.token)).not.toBeNull();
    }
    // … but the absolute limit does not.
    clock.advance(SESSION_ABSOLUTE_MS - 20 * 24 * 60 * 60 * 1000);
    expect(await service.authenticate(session.token)).toBeNull();
  });

  it('writes "last used" at most every few minutes', async () => {
    const { service, session, clock, store } = await registered();
    const stored = () => [...store.sessions.values()][0]!;
    const firstSeen = stored().lastSeenAt;
    clock.advance(SESSION_TOUCH_INTERVAL_MS - 1000);
    await service.authenticate(session.token);
    expect(stored().lastSeenAt).toEqual(firstSeen);
    clock.advance(2000);
    await service.authenticate(session.token);
    expect(stored().lastSeenAt.getTime()).toBeGreaterThan(firstSeen.getTime());
  });
});

describe('FR-AUTH-003 lockout after repeated failed logins', () => {
  it(`locks the account after ${LOGIN_MAX_FAILURES} wrong passwords – even the right password is refused`, async () => {
    const { service } = await registered();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await expectAppError(
        service.login({ email: EMAIL, password: `feil-${i}-passord` }),
        401,
        API_ERRORS.invalidCredentials,
      );
    }
    await expectAppError(
      service.login({ email: EMAIL, password: PASSWORD }),
      401,
      API_ERRORS.invalidCredentials,
    );
  });

  it('a locked account does not run the real password check, but does the same amount of work', async () => {
    const { service, calls } = await registered();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++)
      await service.login({ email: EMAIL, password: `feil-${i}-passord` }).catch(() => {});
    const before = calls.verify;
    await service.login({ email: EMAIL, password: PASSWORD }).catch(() => {});
    expect(calls.verify).toBe(before + 1);
  });

  it('opens again after the lock period', async () => {
    const { service, clock } = await registered();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++)
      await service.login({ email: EMAIL, password: `feil-${i}-passord` }).catch(() => {});
    clock.advance(LOGIN_LOCK_MS - 1000);
    await expectAppError(
      service.login({ email: EMAIL, password: PASSWORD }),
      401,
      API_ERRORS.invalidCredentials,
    );
    clock.advance(1001);
    await expect(service.login({ email: EMAIL, password: PASSWORD })).resolves.toBeDefined();
  });

  it('a successful login resets the count', async () => {
    const { service, store } = await registered();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++)
      await service.login({ email: EMAIL, password: `feil-${i}-passord` }).catch(() => {});
    await service.login({ email: EMAIL, password: PASSWORD });
    expect([...store.users.values()][0]?.failedLoginCount).toBe(0);
    // A new run of mistakes starts from zero: one more wrong password does not lock.
    await service.login({ email: EMAIL, password: 'feil passord igjen' }).catch(() => {});
    await expect(service.login({ email: EMAIL, password: PASSWORD })).resolves.toBeDefined();
  });
});
