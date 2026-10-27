import { afterEach, describe, expect, it } from 'vitest';
import { API_ERRORS, type SessionResponse } from '@smartmat/shared';
import { base32Decode, stepAt, totpCode } from '../src/lib/totp';
import { SESSION_COOKIE } from '../src/plugins/auth';
import {
  call,
  captureLog,
  createTestApp,
  login,
  PASSWORD,
  registerUser,
  toClient,
  useTestDatabase,
  type Client,
} from './helpers';

/*
 * Spec 13 (FR-AUTH-010): two-factor login with TOTP and recovery codes, against the test database with a fake clock
 * (every code belongs to a 30-second step). Covers: setup needs the password, the secret is stored encrypted, a code
 * works once, wrong codes lock the account like wrong passwords (and the right password does not reset that),
 * challenges are single-use and expire, and without the server key it fails closed.
 */

const db = useTestDatabase();
let current = Date.now();
const clock = { now: () => new Date(current), advance: (ms: number) => (current += ms) };
afterEach(() => {
  current = Date.now();
});

type App = Awaited<ReturnType<typeof createTestApp>>;
const EMAIL = 'tofaktor@example.test';

function code(secret: string, offsetSteps = 0) {
  return totpCode(base32Decode(secret), stepAt(clock.now()) + offsetSteps);
}

/** Registers, sets up and turns on two-factor. Returns the secret and the recovery codes. */
async function withTwoFactor(app: App) {
  const kari = await registerUser(app, { email: EMAIL });
  const setup = await call(app, 'POST', '/me/two-factor/setup', {
    client: kari,
    body: { password: PASSWORD },
  });
  expect(setup.statusCode, setup.body).toBe(200);
  const { secret } = setup.json<{ secret: string }>();
  const enable = await call(app, 'POST', '/me/two-factor/enable', {
    client: kari,
    body: { code: code(secret) },
  });
  expect(enable.statusCode, enable.body).toBe(200);
  clock.advance(30_000); // the code used to turn it on cannot be used again
  return { kari, secret, recoveryCodes: enable.json<{ recoveryCodes: string[] }>().recoveryCodes };
}

async function challengeFor(app: App, password = PASSWORD) {
  const response = await login(app, EMAIL, password);
  expect(response.statusCode, response.body).toBe(200);
  const body = response.json<{ twoFactorRequired?: boolean; challenge?: string }>();
  expect(body.twoFactorRequired).toBe(true);
  expect(response.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
  return body.challenge!;
}

const secondStep = (app: App, challenge: string, value: string) =>
  call(app, 'POST', '/auth/login/two-factor', { body: { challenge, code: value } });

describe('FR-AUTH-010 setting up two-factor', () => {
  it('setup needs the password; nothing changes for login until a code turns it on', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const kari = await registerUser(app, { email: EMAIL });
      const wrong = await call(app, 'POST', '/me/two-factor/setup', {
        client: kari,
        body: { password: 'feil passord her' },
      });
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json().error.fields).toEqual({ password: API_ERRORS.wrongPassword });
      const setup = await call(app, 'POST', '/me/two-factor/setup', {
        client: kari,
        body: { password: PASSWORD },
      });
      const { secret, otpauthUri } = setup.json<{ secret: string; otpauthUri: string }>();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(otpauthUri).toContain(`secret=${secret}`);
      expect((await call(app, 'GET', '/me/two-factor', { client: kari })).json()).toEqual({
        available: true,
        enabled: false,
        recoveryCodesLeft: 0,
      });
      // Still one step: a session straight away.
      expect((await login(app, EMAIL)).json().user).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('a wrong code does not turn it on; the right one does and gives 10 recovery codes once', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const kari = await registerUser(app, { email: EMAIL });
      const { secret } = (
        await call(app, 'POST', '/me/two-factor/setup', {
          client: kari,
          body: { password: PASSWORD },
        })
      ).json<{ secret: string }>();
      const wrong = await call(app, 'POST', '/me/two-factor/enable', {
        client: kari,
        body: { code: code(secret, 5) },
      });
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json().error.code).toBe(API_ERRORS.twoFactorInvalid);
      const right = await call(app, 'POST', '/me/two-factor/enable', {
        client: kari,
        body: { code: code(secret) },
      });
      const { recoveryCodes } = right.json<{ recoveryCodes: string[] }>();
      expect(recoveryCodes).toHaveLength(10);
      for (const c of recoveryCodes) expect(c).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
      expect(new Set(recoveryCodes).size).toBe(10);
      expect((await call(app, 'GET', '/me/two-factor', { client: kari })).json()).toMatchObject({
        enabled: true,
        recoveryCodesLeft: 10,
      });
      // Again: already on.
      const again = await call(app, 'POST', '/me/two-factor/setup', {
        client: kari,
        body: { password: PASSWORD },
      });
      expect(again.json().error.code).toBe(API_ERRORS.twoFactorAlreadyOn);
    } finally {
      await app.close();
    }
  });

  it('the database has the secret only encrypted and the recovery codes only as hashes', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { secret, recoveryCodes } = await withTwoFactor(app);
      const user = await db.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.totpSecret).toMatch(/^v1:/);
      expect(user.totpSecret).not.toContain(secret);
      expect(user.totpSecret).not.toContain(base32Decode(secret).toString('base64'));
      const stored = JSON.stringify(await db.userRecoveryCode.findMany());
      for (const c of recoveryCodes) {
        expect(stored).not.toContain(c);
        expect(stored).not.toContain(c.replace('-', ''));
      }
    } finally {
      await app.close();
    }
  });
});

describe('FR-AUTH-010 logging in with two-factor', () => {
  it('password → challenge (no session); the right code → a session', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { secret } = await withTwoFactor(app);
      const challenge = await challengeFor(app);
      const done = await secondStep(app, challenge, code(secret).replace(/(\d{3})/, '$1 '));
      expect(done.statusCode, done.body).toBe(200);
      const client = toClient(done);
      expect((await call(app, 'GET', '/me', { client })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('a code works once: the same code in a new login is refused (no replay)', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { secret } = await withTwoFactor(app);
      const value = code(secret);
      expect((await secondStep(app, await challengeFor(app), value)).statusCode).toBe(200);
      const replay = await secondStep(app, await challengeFor(app), value);
      expect(replay.statusCode).toBe(401);
      expect(replay.json().error.code).toBe(API_ERRORS.twoFactorInvalid);
      // The same code sent twice at the same moment: one session. Both challenges are made first, so the two second
      // steps really run at the same time (an `await` inside the array would run them one after the other).
      clock.advance(30_000);
      for (let round = 0; round < 5; round++) {
        clock.advance(30_000);
        const [first, second] = [await challengeFor(app), await challengeFor(app)];
        const value = code(secret);
        const answers = await Promise.all([
          secondStep(app, first, value),
          secondStep(app, second, value),
        ]);
        expect(answers.map((a) => a.statusCode).sort()).toEqual([200, 401]);
      }
    } finally {
      await app.close();
    }
  });

  it('a challenge is single use, belongs to its login, and expires after 5 minutes', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { secret } = await withTwoFactor(app);
      const challenge = await challengeFor(app);
      expect((await secondStep(app, challenge, code(secret))).statusCode).toBe(200);
      clock.advance(30_000);
      const reused = await secondStep(app, challenge, code(secret));
      expect(reused.json().error.code).toBe(API_ERRORS.twoFactorChallengeInvalid);

      const late = await challengeFor(app);
      clock.advance(5 * 60_000 + 1000);
      const expired = await secondStep(app, late, code(secret));
      expect(expired.statusCode).toBe(401);
      expect(expired.json().error.code).toBe(API_ERRORS.twoFactorChallengeInvalid);

      const made = await secondStep(app, 'en-utfordring-som-ikke-finnes', code(secret));
      expect(made.json().error.code).toBe(API_ERRORS.twoFactorChallengeInvalid);
    } finally {
      await app.close();
    }
  });

  it('5 wrong codes lock the account for 15 minutes, like 5 wrong passwords', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { secret } = await withTwoFactor(app);
      const challenge = await challengeFor(app);
      for (let i = 0; i < 5; i++) {
        expect((await secondStep(app, challenge, String(100000 + i))).statusCode).toBe(401);
      }
      // Locked: the right password gives the general "wrong e-mail or password", the right code nothing.
      const locked = await login(app, EMAIL);
      expect(locked.statusCode).toBe(401);
      expect(locked.json().error.code).toBe(API_ERRORS.invalidCredentials);
      expect((await secondStep(app, challenge, code(secret))).statusCode).toBe(401);
      clock.advance(15 * 60_000 + 1000);
      expect((await secondStep(app, await challengeFor(app), code(secret))).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('a challenge made before the lock cannot be used while the account is locked', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { secret } = await withTwoFactor(app);
      const waiting = await challengeFor(app);
      const guessing = await challengeFor(app);
      for (let i = 0; i < 5; i++) await secondStep(app, guessing, String(300000 + i));
      // Locked now. The other challenge is still in the table, but the lock must stop it.
      const response = await secondStep(app, waiting, code(secret));
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe(API_ERRORS.twoFactorChallengeInvalid);
      expect(response.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('the right password does NOT reset the count of wrong codes (no endless guessing)', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      await withTwoFactor(app);
      for (let i = 0; i < 4; i++)
        await secondStep(app, await challengeFor(app), String(200000 + i));
      // A fresh password login, then one more wrong code: that is the fifth.
      await secondStep(app, await challengeFor(app), '299999');
      const user = await db.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.loginLockedUntil).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  it('a recovery code works once, in any case and with or without the dash', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { kari, recoveryCodes } = await withTwoFactor(app);
      const first = recoveryCodes[0]!;
      const typed = first.replace('-', '').toLowerCase();
      expect((await secondStep(app, await challengeFor(app), typed)).statusCode).toBe(200);
      const again = await secondStep(app, await challengeFor(app), first);
      expect(again.statusCode).toBe(401);
      const status = await call(app, 'GET', '/me/two-factor', { client: kari });
      expect(status.json().recoveryCodesLeft).toBe(9);
    } finally {
      await app.close();
    }
  });
});

describe('FR-AUTH-010 turning off, new codes, missing key, other users', () => {
  it('turning off needs the password and a code; afterwards login is one step again', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { kari, secret } = await withTwoFactor(app);
      const noCode = await call(app, 'POST', '/me/two-factor/disable', {
        client: kari,
        body: { password: PASSWORD, code: '000000' },
      });
      expect(noCode.statusCode).toBe(400);
      const wrongPassword = await call(app, 'POST', '/me/two-factor/disable', {
        client: kari,
        body: { password: 'feil passord her', code: code(secret) },
      });
      expect(wrongPassword.json().error.code).toBe(API_ERRORS.wrongPassword);
      const off = await call(app, 'POST', '/me/two-factor/disable', {
        client: kari,
        body: { password: PASSWORD, code: code(secret) },
      });
      expect(off.statusCode).toBe(204);
      expect((await login(app, EMAIL)).json<SessionResponse>().user.email).toBe(EMAIL);
      expect(await db.userRecoveryCode.count()).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('new recovery codes replace the old ones', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { kari, secret, recoveryCodes } = await withTwoFactor(app);
      const fresh = await call(app, 'POST', '/me/two-factor/recovery-codes', {
        client: kari,
        body: { password: PASSWORD, code: code(secret) },
      });
      const next = fresh.json<{ recoveryCodes: string[] }>().recoveryCodes;
      expect(next).toHaveLength(10);
      expect(next).not.toContain(recoveryCodes[1]);
      expect((await secondStep(app, await challengeFor(app), recoveryCodes[1]!)).statusCode).toBe(
        401,
      );
      expect((await secondStep(app, await challengeFor(app), next[1]!)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('without the server key: setup answers 503, and an account with two-factor cannot log in (fails closed)', async () => {
    const withKey = await createTestApp(db, { now: clock.now });
    await withTwoFactor(withKey);
    await withKey.close();
    const app = await createTestApp(db, { now: clock.now, config: { totpEncryptionKey: null } });
    try {
      const response = await login(app, EMAIL);
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe(API_ERRORS.twoFactorUnavailable);
      expect(response.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
      const ola = await registerUser(app, { email: 'ola@example.test' });
      const setup = await call(app, 'POST', '/me/two-factor/setup', {
        client: ola,
        body: { password: PASSWORD },
      });
      expect(setup.statusCode).toBe(503);
      expect((await call(app, 'GET', '/me/two-factor', { client: ola })).json().available).toBe(
        false,
      );
    } finally {
      await app.close();
    }
  });

  it("one user's codes and challenges do nothing for another", async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { secret, recoveryCodes } = await withTwoFactor(app);
      const ola: Client = await registerUser(app, { email: 'ola@example.test' });
      const olaSetup = await call(app, 'POST', '/me/two-factor/setup', {
        client: ola,
        body: { password: PASSWORD },
      });
      const olaSecret = olaSetup.json<{ secret: string }>().secret;
      await call(app, 'POST', '/me/two-factor/enable', {
        client: ola,
        body: { code: code(olaSecret) },
      });
      clock.advance(30_000);
      // Kari's challenge with Ola's code or Kari's recovery code used by Ola's login: refused.
      expect((await secondStep(app, await challengeFor(app), code(olaSecret))).statusCode).toBe(
        401,
      );
      const olaChallenge = (await login(app, 'ola@example.test')).json<{ challenge: string }>()
        .challenge;
      expect((await secondStep(app, olaChallenge, recoveryCodes[2]!)).statusCode).toBe(401);
      expect((await secondStep(app, olaChallenge, code(secret))).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('deleting the account removes the recovery codes and challenges (CASCADE)', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const { kari } = await withTwoFactor(app);
      await challengeFor(app);
      const response = await call(app, 'DELETE', '/me', {
        client: kari,
        body: { password: PASSWORD },
      });
      expect(response.statusCode).toBe(204);
      expect(await db.userRecoveryCode.count()).toBe(0);
      expect(await db.loginChallenge.count()).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('the log has no secret, code, recovery code or challenge', async () => {
    const log = captureLog();
    const app = await createTestApp(db, {
      now: clock.now,
      logStream: log.stream,
      config: { logLevel: 'info' },
    });
    let secrets: string[] = [];
    try {
      const { secret, recoveryCodes } = await withTwoFactor(app);
      const challenge = await challengeFor(app);
      const value = code(secret);
      await secondStep(app, challenge, value);
      secrets = [secret, challenge, value, ...recoveryCodes];
    } finally {
      await app.close();
    }
    const text = log.text();
    expect(text).toContain('/api/v1/auth/login/two-factor');
    expect(secrets.filter((s) => text.includes(s))).toEqual([]);
  });
});
