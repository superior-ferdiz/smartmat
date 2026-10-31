import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { API_ERRORS, PASSWORD_RESET_PATH, type SessionResponse } from '@smartmat/shared';
import { base32Decode, stepAt, totpCode } from '../src/lib/totp';
import { SESSION_COOKIE } from '../src/plugins/auth';
import {
  call,
  captureLog,
  createTestApp,
  login,
  ORIGIN,
  PASSWORD,
  registerUser,
  useTestDatabase,
} from './helpers';
import { fakeMailQueue, fakeMailSender, runMailJobs, tokenFromMail } from './fakeMail';
import { fakePwnedCheck, LEAKED_PASSWORD } from './fakePwned';

/*
 * Spec 17 (FR-AUTH-006a–e): "Glemt passord" against the test database, with a fake mail queue, the mailer's job run
 * in the test with a fake sender, and a fake clock. No test connects to an SMTP server.
 */

const db = useTestDatabase();
let current = Date.now();
const clock = { now: () => new Date(current), advance: (ms: number) => (current += ms) };
afterEach(() => {
  current = Date.now();
});

const EMAIL = 'glemsk@example.test';
const NEW_PASSWORD = 'et helt nytt passord';
const MINUTE = 60_000;

async function setup(options: Parameters<typeof createTestApp>[1] = {}) {
  const mail = fakeMailQueue();
  const sender = fakeMailSender();
  const app = await createTestApp(db, { now: clock.now, mailQueue: mail.queue, ...options });
  const ask = (email = EMAIL) => call(app, 'POST', '/auth/password-reset', { body: { email } });
  const confirm = (token: string, newPassword = NEW_PASSWORD) =>
    call(app, 'POST', '/auth/password-reset/confirm', { body: { token, newPassword } });
  const deliver = () => runMailJobs(db, mail.jobs, sender.sender, clock.now);
  /** Asks for a link, runs the mailer and returns the token from the e-mail. */
  const linkToken = async (email = EMAIL) => {
    expect((await ask(email)).statusCode).toBe(202);
    await deliver();
    return tokenFromMail(sender.sent.at(-1));
  };
  return { app, mail, sender, ask, confirm, deliver, linkToken };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('FR-AUTH-006a asking for a link', () => {
  it('answers 202 the same way whether the address has an account; only an account gets a job', async () => {
    const { app, mail, ask } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL });
      const known = await ask(EMAIL);
      const unknown = await ask('finnes.ikke@example.test');
      expect(known.statusCode).toBe(202);
      expect(unknown.statusCode).toBe(202);
      expect(known.body).toBe(unknown.body);
      expect(known.body).toBe('');
      // The job has only the account id and the time: no address, no token.
      expect(mail.jobs).toEqual([
        { kind: 'passwordReset', userId: kari.user.id, requestedAt: clock.now().toISOString() },
      ]);
    } finally {
      await app.close();
    }
  });

  it('upper case and spaces find the same account (addresses are stored trimmed and in lower case)', async () => {
    const { app, mail, ask } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      expect((await ask(`  ${EMAIL.toUpperCase()} `)).statusCode).toBe(202);
      expect(mail.jobs).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('an invalid address is a field error, as at login', async () => {
    const { app, ask } = await setup();
    try {
      const response = await ask('ikke en adresse');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.fields).toEqual({ email: 'validation.email.invalid' });
    } finally {
      await app.close();
    }
  });

  it('is limited per IP address (429)', async () => {
    const { app, ask } = await setup({
      config: {
        rateLimits: {
          login: { max: 1000, windowMs: MINUTE },
          register: { max: 1000, windowMs: MINUTE },
          sensitive: { max: 1000, windowMs: MINUTE },
          invitation: { max: 1000, windowMs: MINUTE },
          export: { max: 1000, windowMs: MINUTE },
          passwordReset: { max: 2, windowMs: MINUTE },
        },
      },
    });
    try {
      expect((await ask()).statusCode).toBe(202);
      expect((await ask()).statusCode).toBe(202);
      const third = await ask();
      expect(third.statusCode).toBe(429);
      expect(third.json().error.code).toBe(API_ERRORS.rateLimited);
    } finally {
      await app.close();
    }
  });

  it('sends at most 3 e-mails per account per hour; more requests get the same 202 and no e-mail', async () => {
    const { app, ask, deliver, sender } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      for (let i = 0; i < 5; i++) expect((await ask()).statusCode).toBe(202);
      expect(await deliver()).toEqual(['sent', 'sent', 'sent', 'overLimit', 'overLimit']);
      expect(sender.sent).toHaveLength(3);
      clock.advance(61 * MINUTE);
      await ask();
      expect(await deliver()).toEqual(['sent']);
    } finally {
      await app.close();
    }
  });

  it('a job not sent within 30 minutes of the request is dropped (nobody is waiting for it)', async () => {
    const { app, ask, deliver, sender } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      await ask();
      clock.advance(31 * MINUTE);
      expect(await deliver()).toEqual(['stale']);
      expect(sender.sent).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('a job for an account deleted after the request sends nothing', async () => {
    const { app, ask, deliver, sender } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL });
      await ask();
      await call(app, 'DELETE', '/me', { client: kari, body: { password: PASSWORD } });
      expect(await deliver()).toEqual(['noAccount']);
      expect(sender.sent).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

describe('FR-AUTH-006b the one-time link', () => {
  it('is sent to the account in its language, points to our origin with the token after #, and only its hash is stored', async () => {
    const { app, sender, linkToken } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL, displayName: 'Kari' });
      const token = await linkToken();
      const message = sender.sent[0]!;
      expect(message.to).toBe(EMAIL);
      expect(message.subject).toBe('Nytt passord til SmartMat');
      expect(message.text).toContain('Hei, Kari!');
      expect(message.text).toContain(`${ORIGIN}${PASSWORD_RESET_PATH}#${token}`);
      expect(message.text).toContain('30 minutter');
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const rows = await db.passwordResetToken.findMany({ where: { userId: kari.user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.tokenHash).toBe(sha256(token));
      const dump = JSON.stringify(await db.$queryRawUnsafe('SELECT * FROM password_reset_tokens'));
      expect(dump).not.toContain(token);
      expect(rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime()).toBe(30 * MINUTE);
    } finally {
      await app.close();
    }
  });

  it('an English account gets the e-mail in English', async () => {
    const { app, sender, linkToken } = await setup();
    try {
      const response = await call(app, 'POST', '/auth/register', {
        body: { displayName: 'Kari', email: EMAIL, password: PASSWORD, locale: 'en' },
      });
      expect(response.statusCode).toBe(201);
      await linkToken();
      expect(sender.sent[0]!.subject).toBe('New password for SmartMat');
      expect(sender.sent[0]!.text).toContain('30 minutes');
    } finally {
      await app.close();
    }
  });

  it('a new link makes the older ones stop working', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      const first = await linkToken();
      const second = await linkToken();
      expect(first).not.toBe(second);
      const old = await confirm(first);
      expect(old.statusCode).toBe(400);
      expect(old.json().error.code).toBe(API_ERRORS.resetLinkInvalid);
      expect((await confirm(second)).statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('stops working after 30 minutes', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      const token = await linkToken();
      clock.advance(30 * MINUTE);
      const response = await confirm(token);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe(API_ERRORS.resetLinkInvalid);
      expect((await login(app, EMAIL)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('a failed send removes the link (nobody has it, it does not count) and fails the job so it is tried again', async () => {
    const { app, ask, deliver, sender } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL });
      await ask();
      sender.state.failWith = 'ECONNECTION';
      await expect(deliver()).rejects.toMatchObject({ code: 'ECONNECTION' });
      expect(await db.passwordResetToken.count({ where: { userId: kari.user.id } })).toBe(0);
    } finally {
      await app.close();
    }
  });
});

describe('FR-AUTH-006c setting the new password', () => {
  it('unknown, malformed, used and expired links all get the same 400', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      const token = await linkToken();
      expect((await confirm(token)).statusCode).toBe(204);
      const answers = await Promise.all([confirm('A'.repeat(43)), confirm('kort'), confirm(token)]);
      for (const response of answers) {
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe(API_ERRORS.resetLinkInvalid);
      }
    } finally {
      await app.close();
    }
  });

  it('a too short password is a field error, and the link still works afterwards', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      const token = await linkToken();
      const short = await confirm(token, 'kort');
      expect(short.statusCode).toBe(400);
      expect(short.json().error.fields).toEqual({ newPassword: 'validation.password.tooShort' });
      expect((await confirm(token)).statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('FR-AUTH-008: a leaked password is refused at the field, and the link still works afterwards', async () => {
    const { app, confirm, linkToken } = await setup({ pwnedPasswords: fakePwnedCheck() });
    try {
      await registerUser(app, { email: EMAIL });
      const token = await linkToken();
      const leaked = await confirm(token, LEAKED_PASSWORD);
      expect(leaked.statusCode).toBe(400);
      expect(leaked.json().error.fields).toEqual({ newPassword: API_ERRORS.passwordPwned });
      expect((await confirm(token)).statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('gives no session: the new password logs in, the old one does not', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      const response = await confirm(await linkToken());
      expect(response.statusCode).toBe(204);
      expect(response.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
      expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(401);
      expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('FR-AUTH-006d after the change', () => {
  it('every session is logged out, also the one in this browser', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL });
      const other = await login(app, EMAIL);
      expect(other.statusCode).toBe(200);
      expect(await db.session.count({ where: { userId: kari.user.id } })).toBe(2);
      expect((await confirm(await linkToken())).statusCode).toBe(204);
      expect(await db.session.count({ where: { userId: kari.user.id } })).toBe(0);
      expect((await call(app, 'GET', '/auth/session', { client: kari })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('FR-AUTH-003: a locked account can log in with the new password at once', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      for (let i = 0; i < 5; i++) await login(app, EMAIL, 'feil passord her');
      expect((await login(app, EMAIL)).statusCode).toBe(401);
      expect((await confirm(await linkToken())).statusCode).toBe(204);
      expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('FR-AUTH-010: two-factor stays on, and a pending challenge stops working', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL });
      const setupResponse = await call(app, 'POST', '/me/two-factor/setup', {
        client: kari,
        body: { password: PASSWORD },
      });
      const { secret } = setupResponse.json<{ secret: string }>();
      const code = () => totpCode(base32Decode(secret), stepAt(clock.now()));
      expect(
        (await call(app, 'POST', '/me/two-factor/enable', { client: kari, body: { code: code() } }))
          .statusCode,
      ).toBe(200);
      clock.advance(30_000);
      const pending = (await login(app, EMAIL)).json<{ challenge: string }>().challenge;

      expect((await confirm(await linkToken())).statusCode).toBe(204);
      const stale = await call(app, 'POST', '/auth/login/two-factor', {
        body: { challenge: pending, code: code() },
      });
      expect(stale.statusCode).toBe(401);
      expect(stale.json().error.code).toBe(API_ERRORS.twoFactorChallengeInvalid);

      const fresh = await login(app, EMAIL, NEW_PASSWORD);
      expect(fresh.json()).toMatchObject({ twoFactorRequired: true });
      const second = await call(app, 'POST', '/auth/login/two-factor', {
        body: { challenge: fresh.json<{ challenge: string }>().challenge, code: code() },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json<SessionResponse>().user.email).toBe(EMAIL);
    } finally {
      await app.close();
    }
  });

  it('two requests with the same link at the same time: one change, one refusal', async () => {
    const { app, confirm, linkToken } = await setup();
    try {
      await registerUser(app, { email: EMAIL });
      const token = await linkToken();
      const answers = await Promise.all([
        confirm(token, NEW_PASSWORD),
        confirm(token, `${NEW_PASSWORD}!`),
      ]);
      expect(answers.map((r) => r.statusCode).sort()).toEqual([204, 400]);
    } finally {
      await app.close();
    }
  });

  it('the account gets a "password changed" e-mail', async () => {
    const { app, confirm, linkToken, mail, deliver, sender } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL, displayName: 'Kari' });
      expect((await confirm(await linkToken())).statusCode).toBe(204);
      expect(mail.jobs).toEqual([
        { kind: 'passwordChanged', userId: kari.user.id, requestedAt: clock.now().toISOString() },
      ]);
      expect(await deliver()).toEqual(['sent']);
      const message = sender.sent.at(-1)!;
      expect(message.to).toBe(EMAIL);
      expect(message.subject).toBe('Passordet ditt i SmartMat er endret');
      expect(message.text).toContain(`${ORIGIN}/glemt-passord`);
      expect(message.text).not.toMatch(/nytt-passord#/);
    } finally {
      await app.close();
    }
  });

  it('the password is changed even if the "changed" e-mail cannot be queued', async () => {
    const queue = fakeMailQueue();
    const state = { fail: false };
    const app = await createTestApp(db, {
      now: clock.now,
      mailQueue: {
        enqueue: (job) =>
          state.fail ? Promise.reject(new Error('queue down')) : queue.queue.enqueue(job),
      },
    });
    try {
      await registerUser(app, { email: EMAIL });
      await call(app, 'POST', '/auth/password-reset', { body: { email: EMAIL } });
      const sender = fakeMailSender();
      await runMailJobs(db, queue.jobs, sender.sender, clock.now);
      state.fail = true;
      const response = await call(app, 'POST', '/auth/password-reset/confirm', {
        body: { token: tokenFromMail(sender.sent[0]), newPassword: NEW_PASSWORD },
      });
      expect(response.statusCode).toBe(204);
      expect((await login(app, EMAIL, NEW_PASSWORD)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('FR-PRIV-001: the data export does not contain the links (short-lived security data, only a hash)', async () => {
    const { app, linkToken } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL });
      const token = await linkToken();
      const exported = await call(app, 'GET', '/me/export', { client: kari });
      expect(exported.statusCode).toBe(200);
      expect(exported.body).not.toContain(sha256(token));
      expect(exported.body).not.toMatch(/password_reset|passwordReset/);
    } finally {
      await app.close();
    }
  });

  it('deleting the account deletes its links (CASCADE)', async () => {
    const { app, linkToken } = await setup();
    try {
      const kari = await registerUser(app, { email: EMAIL });
      await linkToken();
      await call(app, 'DELETE', '/me', { client: kari, body: { password: PASSWORD } });
      expect(await db.passwordResetToken.count()).toBe(0);
    } finally {
      await app.close();
    }
  });
});

describe('FR-AUTH-006e off without e-mail settings', () => {
  it('without SMTP settings both steps answer 503, and login still works', async () => {
    const { app, ask, confirm, mail } = await setup({ config: { mail: null } });
    try {
      await registerUser(app, { email: EMAIL });
      const asked = await ask();
      expect(asked.statusCode).toBe(503);
      expect(asked.json().error.code).toBe(API_ERRORS.passwordResetUnavailable);
      expect((await confirm('A'.repeat(43))).statusCode).toBe(503);
      expect(mail.jobs).toEqual([]);
      expect((await login(app, EMAIL)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('without a mail queue (the API started without e-mail) it is off too', async () => {
    const app = await createTestApp(db, { now: clock.now });
    try {
      const response = await call(app, 'POST', '/auth/password-reset', { body: { email: EMAIL } });
      expect(response.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
});

describe('NFR-SEC-004 nothing personal in the log', () => {
  it('the log has neither the address nor the token nor the new password', async () => {
    const log = captureLog();
    const { app, confirm, linkToken } = await setup({
      logStream: log.stream,
      config: { logLevel: 'info' },
    });
    try {
      await registerUser(app, { email: EMAIL });
      const token = await linkToken();
      await confirm(token);
      await confirm(token);
      const text = log.text();
      expect(text).toContain('/auth/password-reset');
      for (const secret of [EMAIL, token, NEW_PASSWORD]) expect(text).not.toContain(secret);
    } finally {
      await app.close();
    }
  });
});
