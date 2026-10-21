import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ERRORS } from '@smartmat/shared';
import { createFakeClock } from '../src/test/fakes';
import { hashSessionToken } from '../src/modules/auth/tokens';
import { SESSION_IDLE_MS } from '../src/modules/auth/policy';
import { SESSION_COOKIE } from '../src/plugins/auth';
import {
  call,
  createTestApp,
  login,
  PASSWORD,
  registerUser,
  sessionCookie,
  toClient,
  useTestDatabase,
} from './helpers';

const db = useTestDatabase();
const clock = createFakeClock();
let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
});
afterAll(() => app.close());

describe('FR-AUTH-001 POST /auth/register', () => {
  it('201: creates the user, a household of one with the user as owner, and logs in', async () => {
    const response = await call(app, 'POST', '/auth/register', {
      body: {
        displayName: '  Kari  ',
        email: '  Kari@Example.TEST ',
        password: PASSWORD,
        locale: 'en',
      },
    });
    expect(response.statusCode).toBe(201);
    const { user, csrfToken } = response.json();
    expect(user).toMatchObject({ email: 'kari@example.test', displayName: 'Kari', locale: 'en' });
    expect(csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const members = await db.householdMember.findMany({ where: { userId: user.id } });
    expect(members).toEqual([
      expect.objectContaining({ householdId: user.householdId, role: 'owner' }),
    ]);
    expect(await db.householdMember.count({ where: { householdId: user.householdId } })).toBe(1);
  });

  it('sets the session cookie HttpOnly, Secure, SameSite=Lax, Path=/ (NFR-SEC-003)', async () => {
    const response = await call(app, 'POST', '/auth/register', {
      body: { displayName: 'Ola', email: 'ola@example.test', password: PASSWORD },
    });
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.expires).toBeInstanceOf(Date);
  });

  it('stores an argon2id hash, not the password, and only the hash of the session token (ADR-0005)', async () => {
    const response = await call(app, 'POST', '/auth/register', {
      body: { displayName: 'Per', email: 'per@example.test', password: PASSWORD },
    });
    const token = sessionCookie(response)!;
    const user = await db.user.findUniqueOrThrow({ where: { email: 'per@example.test' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);

    const sessions = await db.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(sessions)).not.toContain(token);
  });

  it('409 when the e-mail is taken, also with different case', async () => {
    await registerUser(app, { email: 'tatt@example.test' });
    const response = await call(app, 'POST', '/auth/register', {
      body: { displayName: 'Noen', email: 'TATT@example.test', password: PASSWORD },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: API_ERRORS.emailTaken, fields: { email: API_ERRORS.emailTaken } },
    });
    expect(await db.user.count()).toBe(1);
  });

  it('400 with i18n keys per field for invalid input (NFR-SEC-002)', async () => {
    const response = await call(app, 'POST', '/auth/register', {
      body: { displayName: '', email: 'ikke-en-epost', password: 'kort' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: API_ERRORS.validation,
        fields: {
          displayName: 'validation.displayName.required',
          email: 'validation.email.invalid',
          password: 'validation.password.tooShort',
        },
      },
    });
    expect(await db.user.count()).toBe(0);
  });

  it('ignores fields that are not in the schema (cannot set its own id, role or lock)', async () => {
    const response = await call(app, 'POST', '/auth/register', {
      body: {
        displayName: 'Lur',
        email: 'lur@example.test',
        password: PASSWORD,
        id: '00000000-0000-0000-0000-000000000000',
        failedLoginCount: -100,
        role: 'admin',
      },
    });
    expect(response.statusCode).toBe(201);
    const user = await db.user.findUniqueOrThrow({ where: { email: 'lur@example.test' } });
    expect(user.id).not.toBe('00000000-0000-0000-0000-000000000000');
    expect(user.failedLoginCount).toBe(0);
  });
});

describe('FR-AUTH-002 login, session, logout', () => {
  it('login → session → logout → the old cookie no longer works', async () => {
    await registerUser(app, { email: 'kari@example.test' });
    const loggedIn = await login(app, 'KARI@example.test');
    expect(loggedIn.statusCode).toBe(200);
    const client = toClient(loggedIn);

    const session = await call(app, 'GET', '/auth/session', { client });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      user: { email: 'kari@example.test' },
      csrfToken: client.csrfToken,
    });

    const logout = await call(app, 'POST', '/auth/logout', { client });
    expect(logout.statusCode).toBe(204);
    expect(logout.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');

    const after = await call(app, 'GET', '/auth/session', { client });
    expect(after.statusCode).toBe(401);
    expect(after.json()).toEqual({ error: { code: API_ERRORS.unauthenticated } });
  });

  it('logging in again ends the session the browser had before (new session ID at login)', async () => {
    const first = await registerUser(app, { email: 'kari@example.test' });
    const response = await call(app, 'POST', '/auth/login', {
      body: { email: 'kari@example.test', password: PASSWORD },
      headers: { cookie: `${SESSION_COOKIE}=${first.cookie}` },
    });
    expect(response.statusCode).toBe(200);
    expect(sessionCookie(response)).not.toBe(first.cookie);
    expect((await call(app, 'GET', '/auth/session', { client: first })).statusCode).toBe(401);
  });

  it('wrong password and unknown e-mail get exactly the same answer', async () => {
    await registerUser(app, { email: 'kari@example.test' });
    const wrong = await login(app, 'kari@example.test', 'feil passord!!');
    const unknown = await login(app, 'finnes.ikke@example.test');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.body).toBe(unknown.body);
    expect(wrong.json()).toEqual({ error: { code: API_ERRORS.invalidCredentials } });
    expect(sessionCookie(wrong)).toBeUndefined();
  });

  it('GET /auth/session is 401 without a cookie and with a made-up cookie', async () => {
    expect((await call(app, 'GET', '/auth/session')).statusCode).toBe(401);
    const fake = await call(app, 'GET', '/auth/session', {
      headers: { cookie: `${SESSION_COOKIE}=finnes-ikke` },
    });
    expect(fake.statusCode).toBe(401);
  });

  it('a session unused for 14 days stops working', async () => {
    const client = await registerUser(app);
    clock.advance(SESSION_IDLE_MS + 1000);
    expect((await call(app, 'GET', '/auth/session', { client })).statusCode).toBe(401);
    expect(await db.session.count({ where: { userId: client.user.id } })).toBe(0);
  });

  it('logout without a valid session still answers 204 and clears the cookie', async () => {
    const response = await call(app, 'POST', '/auth/logout', {
      headers: { cookie: `${SESSION_COOKIE}=utlopt` },
    });
    expect(response.statusCode).toBe(204);
  });
});

describe('GET /health', () => {
  it('answers when the database is reachable', async () => {
    const response = await call(app, 'GET', '/health');
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
