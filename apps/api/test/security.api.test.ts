import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ERRORS, CSRF_HEADER } from '@smartmat/shared';
import { buildApp } from '../src/app';
import { createFakeClock } from '../src/test/fakes';
import { LOGIN_LOCK_MS, LOGIN_MAX_FAILURES } from '../src/modules/auth/policy';
import { SESSION_COOKIE } from '../src/plugins/auth';
import {
  call,
  captureLog,
  createTestApp,
  login,
  PASSWORD,
  registerUser,
  testConfig,
  toClient,
  useTestDatabase,
} from './helpers';

/*
 * Security tests asked for in phase 2: brute force, CSRF, no access to another user's data,
 * nothing personal in logs or error messages. IDs: FR-AUTH-003, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005.
 */

const db = useTestDatabase();

describe('FR-AUTH-003 brute force: lockout per account', () => {
  const clock = createFakeClock();
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp(db, { now: clock.now });
  });
  afterAll(() => app.close());

  it(`after ${LOGIN_MAX_FAILURES} wrong passwords even the right one is refused, with the same answer`, async () => {
    await registerUser(app, { email: 'offer@example.test' });
    const answers = [];
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      // Different IP addresses: the lock is per account, so spreading the attack does not help.
      const response = await call(app, 'POST', '/auth/login', {
        body: { email: 'offer@example.test', password: `gjetning nummer ${i}` },
        remoteAddress: `10.0.0.${i + 1}`,
      });
      answers.push(response.statusCode);
    }
    expect(answers).toEqual(Array(LOGIN_MAX_FAILURES).fill(401));

    const locked = await login(app, 'offer@example.test');
    const unknown = await login(app, 'finnes.ikke@example.test');
    expect(locked.statusCode).toBe(401);
    expect(locked.body).toBe(unknown.body); // does not reveal that the account exists or is locked

    const user = await db.user.findUniqueOrThrow({ where: { email: 'offer@example.test' } });
    expect(user.loginLockedUntil?.getTime()).toBe(clock.now().getTime() + LOGIN_LOCK_MS);
  });

  it('the lock lifts after 15 minutes', async () => {
    await registerUser(app, { email: 'offer@example.test' });
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++)
      await login(app, 'offer@example.test', `gjetning ${i}!!`);
    clock.advance(LOGIN_LOCK_MS + 1000);
    const response = await login(app, 'offer@example.test');
    expect(response.statusCode).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email: 'offer@example.test' } });
    expect(user).toMatchObject({ failedLoginCount: 0, loginLockedUntil: null });
  });

  it('locking one account does not affect another', async () => {
    await registerUser(app, { email: 'offer@example.test' });
    await registerUser(app, { email: 'annen@example.test' });
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++)
      await login(app, 'offer@example.test', `gjetning ${i}!!`);
    expect((await login(app, 'annen@example.test')).statusCode).toBe(200);
  });
});

describe('FR-AUTH-003 rate limiting per IP address', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp(db, {
      config: {
        rateLimits: {
          login: { max: 3, windowMs: 60_000 },
          register: { max: 2, windowMs: 60_000 },
          sensitive: { max: 2, windowMs: 60_000 },
        },
      },
    });
  });
  afterAll(() => app.close());

  it('login: the 4th attempt from the same address within the window gets 429', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const response = await call(app, 'POST', '/auth/login', {
        body: { email: `nr${i}@example.test`, password: 'hva som helst' },
        remoteAddress: '192.0.2.10',
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it('a 429 has our error format and says when to try again', async () => {
    let response;
    for (let i = 0; i < 4; i++) {
      response = await call(app, 'POST', '/auth/login', {
        body: { email: 'x@example.test', password: 'hva som helst' },
        remoteAddress: '192.0.2.11',
      });
    }
    expect(response?.json()).toEqual({ error: { code: API_ERRORS.rateLimited } });
    expect(response?.headers['retry-after']).toBeDefined();
  });

  it('a forged X-Forwarded-For header does not give a fresh limit', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const response = await call(app, 'POST', '/auth/login', {
        body: { email: 'x@example.test', password: 'hva som helst' },
        remoteAddress: '192.0.2.12',
        headers: { 'x-forwarded-for': `203.0.113.${i}` },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it('register: limited too', async () => {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const response = await call(app, 'POST', '/auth/register', {
        body: { displayName: 'Spam', email: `spam${i}@example.test`, password: PASSWORD },
        remoteAddress: '192.0.2.20',
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([201, 201, 429]);
  });

  it('password check on account deletion is limited too', async () => {
    const client = await registerUser(app);
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const response = await call(app, 'DELETE', '/me', {
        client,
        body: { password: `gjetning ${i}` },
        remoteAddress: '192.0.2.30',
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([400, 400, 429]);
  });
});

describe('NFR-SEC-005 CSRF: Origin check and CSRF token', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp(db);
  });
  afterAll(() => app.close());

  it('a changing request without the CSRF token is refused (403), and nothing changes', async () => {
    const client = await registerUser(app, { displayName: 'Kari' });
    const response = await call(app, 'PATCH', '/me', {
      client,
      body: { displayName: 'Hacket' },
      headers: { [CSRF_HEADER]: '' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: API_ERRORS.invalidCsrf } });
    expect((await call(app, 'GET', '/me', { client })).json().displayName).toBe('Kari');
  });

  it("a wrong token, or another user's valid token, is refused", async () => {
    const kari = await registerUser(app);
    const ola = await registerUser(app);
    for (const token of ['feil-token', ola.csrfToken]) {
      const response = await call(app, 'DELETE', '/me', {
        client: kari,
        body: { password: PASSWORD },
        headers: { [CSRF_HEADER]: token },
      });
      expect(response.statusCode).toBe(403);
    }
    expect(await db.user.count({ where: { id: kari.user.id } })).toBe(1);
  });

  it('a request from another site (foreign Origin) is refused even with a valid token', async () => {
    const client = await registerUser(app);
    const response = await call(app, 'POST', '/me/password', {
      client,
      body: { currentPassword: PASSWORD, newPassword: 'angriperens passord' },
      headers: { origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: API_ERRORS.forbiddenOrigin } });
  });

  it('a changing request without Origin is refused', async () => {
    const response = await call(app, 'POST', '/auth/register', {
      body: { displayName: 'X', email: 'x@example.test', password: PASSWORD },
      headers: { origin: '' },
    });
    expect(response.statusCode).toBe(403);
    expect(await db.user.count()).toBe(0);
  });

  it('login from another site is refused (login CSRF)', async () => {
    await registerUser(app, { email: 'kari@example.test' });
    const response = await call(app, 'POST', '/auth/login', {
      body: { email: 'kari@example.test', password: PASSWORD },
      headers: { origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('logout needs the token too, so another site cannot log the user out', async () => {
    const client = await registerUser(app);
    const response = await call(app, 'POST', '/auth/logout', {
      client,
      headers: { [CSRF_HEADER]: 'feil' },
    });
    expect(response.statusCode).toBe(403);
    expect((await call(app, 'GET', '/auth/session', { client })).statusCode).toBe(200);
  });

  it('reading (GET) needs no token', async () => {
    const client = await registerUser(app);
    const response = await call(app, 'GET', '/me', { client, headers: { [CSRF_HEADER]: '' } });
    expect(response.statusCode).toBe(200);
  });
});

describe("NFR-SEC-001 no access to another user's data", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp(db);
  });
  afterAll(() => app.close());

  it('a user can read their own household', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const response = await call(app, 'GET', `/households/${kari.user.householdId}`, {
      client: kari,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: kari.user.householdId,
      name: 'Kari',
      role: 'owner',
      memberCount: 1,
    });
  });

  it("another user's household gives 404 – exactly like one that does not exist", async () => {
    const kari = await registerUser(app);
    const ola = await registerUser(app);
    const foreign = await call(app, 'GET', `/households/${kari.user.householdId}`, { client: ola });
    const missing = await call(app, 'GET', '/households/0199f0a0-0000-7000-8000-000000000000', {
      client: ola,
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).toBe(missing.body);
    expect(foreign.body).not.toContain(kari.user.householdId);
  });

  it('not logged in → 401; a malformed id → 404', async () => {
    const kari = await registerUser(app);
    expect((await call(app, 'GET', `/households/${kari.user.householdId}`)).statusCode).toBe(401);
    expect(
      (await call(app, 'GET', `/households/'%20OR%201=1--`, { client: kari })).statusCode,
    ).toBe(404);
  });

  it("/me always means the caller: Ola's request cannot read or change Kari", async () => {
    const kari = await registerUser(app, { displayName: 'Kari', email: 'kari@example.test' });
    const ola = await registerUser(app, { displayName: 'Ola' });

    const read = await call(app, 'GET', '/me', { client: ola });
    expect(read.json().email).not.toBe('kari@example.test');

    // Even if Ola puts Kari's id in the body, only Ola changes.
    await call(app, 'PATCH', '/me', {
      client: ola,
      body: { id: kari.user.id, displayName: 'Endret' },
    });
    expect((await call(app, 'GET', '/me', { client: kari })).json().displayName).toBe('Kari');
  });

  it('a session cookie only works for the user it belongs to', async () => {
    const kari = await registerUser(app);
    const ola = await registerUser(app);
    // Ola's cookie with Kari's CSRF token: the token does not belong to that session.
    const mixed = await call(app, 'PATCH', '/me', {
      body: { displayName: 'Blandet' },
      headers: { cookie: `${SESSION_COOKIE}=${ola.cookie}`, [CSRF_HEADER]: kari.csrfToken },
    });
    expect(mixed.statusCode).toBe(403);
  });
});

describe('NFR-SEC-004 no personal data in logs or error responses', () => {
  it('the log has no e-mail, name, password, session token or CSRF token', async () => {
    const log = captureLog();
    const app = await createTestApp(db, { logStream: log.stream, config: { logLevel: 'info' } });
    const register = await call(app, 'POST', '/auth/register', {
      body: {
        displayName: 'Hemmelig Navnesen',
        email: 'hemmelig@example.test',
        password: PASSWORD,
      },
    });
    const client = toClient(register);
    await login(app, 'hemmelig@example.test', 'feil passord for logg');
    await login(app, 'hemmelig@example.test');
    await call(app, 'POST', '/me/password', {
      client,
      body: { currentPassword: PASSWORD, newPassword: 'nytt hemmelig passord' },
    });
    await call(app, 'POST', '/auth/register', {
      body: {
        displayName: 'Hemmelig Navnesen',
        email: 'hemmelig@example.test',
        password: PASSWORD,
      },
    });
    await app.close();

    const text = log.text();
    expect(text).toContain('request completed'); // the log is really captured
    for (const secret of [
      'hemmelig@example.test',
      'Hemmelig Navnesen',
      PASSWORD,
      'nytt hemmelig passord',
      'feil passord for logg',
      client.cookie,
      client.csrfToken,
      '127.0.0.1',
    ]) {
      expect(text, `log contains "${secret}"`).not.toContain(secret);
    }
  });

  it('an unexpected error gives a bare 500 and logs no message text', async () => {
    const log = captureLog();
    // Not ready yet, so a test route can be added: it fails the way a database error can,
    // with personal data in the message.
    const app = await buildApp({
      db,
      config: testConfig({ logLevel: 'info' }),
      logStream: log.stream,
    });
    app.get('/api/v1/boom', async () => {
      throw new Error('duplicate key value (email)=(ola@example.test)');
    });
    const response = await app.inject({ method: 'GET', url: '/api/v1/boom' });
    await app.close();

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: API_ERRORS.internal } });
    expect(response.body).not.toContain('ola@example.test');
    expect(log.text()).toContain('unhandled error');
    expect(log.text()).not.toContain('ola@example.test');
  });

  it('malformed JSON and unknown routes get our format without details', async () => {
    const app = await createTestApp(db);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' },
      payload: '{"email": "ola@example.test", ',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: { code: API_ERRORS.validation } });

    const missing = await app.inject({ method: 'GET', url: '/api/v1/finnes-ikke' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { code: API_ERRORS.notFound } });
    await app.close();
  });
});
