import { describe, expect, it } from 'vitest';
import { API_ERRORS, type AccountSessionsResponse } from '@smartmat/shared';
import { createSessionsRepo } from '../src/modules/sessions/repo';
import { CSRF_HEADER } from '@smartmat/shared';
import {
  call,
  createTestApp,
  PASSWORD,
  registerUser,
  toClient,
  useTestDatabase,
  type Client,
} from './helpers';

/*
 * Spec 13 (FR-AUTH-009): the list of active sessions and the notice about new logins. Every route is under /me, and
 * a session id that is not the caller's answers 404 (NFR-SEC-001).
 */

const db = useTestDatabase();

const FIREFOX_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

type App = Awaited<ReturnType<typeof createTestApp>>;

async function loginFrom(app: App, email: string, userAgent: string): Promise<Client> {
  const response = await call(app, 'POST', '/auth/login', {
    body: { email, password: PASSWORD },
    headers: { 'user-agent': userAgent },
  });
  expect(response.statusCode).toBe(200);
  return toClient(response);
}

async function sessions(app: App, client: Client) {
  const response = await call(app, 'GET', '/me/sessions', { client });
  expect(response.statusCode).toBe(200);
  return response.json<AccountSessionsResponse>().items;
}

async function currentId(app: App, client: Client) {
  const id = (await sessions(app, client)).find((s) => s.current)?.id;
  if (!id) throw new Error('no current session');
  return id;
}

const notices = async (app: App, client: Client) =>
  (await call(app, 'GET', '/me/login-notices', { client })).json<{
    items: { sessionId: string }[];
  }>().items;

describe('FR-AUTH-009 active sessions', () => {
  it('a login stores the browser family and the system – not the User-Agent text and not the IP address', async () => {
    const app = await createTestApp(db);
    try {
      await registerUser(app, { email: 'kari@example.test' });
      const pc = await loginFrom(app, 'kari@example.test', FIREFOX_WINDOWS);
      const list = await sessions(app, pc);
      expect(list).toHaveLength(2);
      expect(list.find((s) => s.current)).toMatchObject({ browser: 'firefox', os: 'windows' });
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>('SELECT * FROM sessions');
      const stored = JSON.stringify(rows);
      expect(stored).not.toContain('Gecko');
      expect(stored).not.toContain('127.0.0.1');
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
        [
          'browser',
          'created_at',
          'csrf_token',
          'expires_at',
          'id',
          'last_seen_at',
          'login_notice_dismissed_at',
          'os',
          'token_hash',
          'user_id',
        ].sort(),
      );
    } finally {
      await app.close();
    }
  });

  it('ending another of my sessions logs that device out; this session cannot be ended here', async () => {
    const app = await createTestApp(db);
    try {
      const pc = await registerUser(app, { email: 'kari@example.test' });
      const phone = await loginFrom(app, 'kari@example.test', SAFARI_IPHONE);
      const phoneId = await currentId(app, phone);
      const pcId = await currentId(app, pc);

      expect((await call(app, 'DELETE', `/me/sessions/${pcId}`, { client: pc })).statusCode).toBe(
        404,
      );
      expect(
        (await call(app, 'DELETE', `/me/sessions/${phoneId}`, { client: pc })).statusCode,
      ).toBe(204);
      expect((await call(app, 'GET', '/me', { client: phone })).statusCode).toBe(401);
      expect((await call(app, 'GET', '/me', { client: pc })).statusCode).toBe(200);
      // Again: gone.
      expect(
        (await call(app, 'DELETE', `/me/sessions/${phoneId}`, { client: pc })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("another user's session: not listed, cannot be ended or dismissed (404), and keeps working", async () => {
    const app = await createTestApp(db);
    try {
      const kari = await registerUser(app, { email: 'kari@example.test' });
      const ola = await registerUser(app, { email: 'ola@example.test' });
      const olaId = await currentId(app, ola);
      expect((await sessions(app, kari)).map((s) => s.id)).not.toContain(olaId);

      const end = await call(app, 'DELETE', `/me/sessions/${olaId}`, { client: kari });
      expect(end.statusCode).toBe(404);
      expect(end.json().error.code).toBe(API_ERRORS.notFound);
      const dismiss = await call(app, 'POST', `/me/login-notices/${olaId}/dismiss`, {
        client: kari,
      });
      expect(dismiss.statusCode).toBe(404);
      expect((await call(app, 'POST', '/me/sessions/end-others', { client: kari })).json()).toEqual(
        {
          ended: 0,
        },
      );
      expect((await call(app, 'GET', '/me', { client: ola })).statusCode).toBe(200);
      const row = await db.session.findUnique({ where: { id: olaId } });
      expect(row?.loginNoticeDismissedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('"log out all others" keeps only this session', async () => {
    const app = await createTestApp(db);
    try {
      const pc = await registerUser(app, { email: 'kari@example.test' });
      const phone = await loginFrom(app, 'kari@example.test', SAFARI_IPHONE);
      const tablet = await loginFrom(app, 'kari@example.test', FIREFOX_WINDOWS);
      const ended = await call(app, 'POST', '/me/sessions/end-others', { client: phone });
      expect(ended.json()).toEqual({ ended: 2 });
      expect((await call(app, 'GET', '/me', { client: pc })).statusCode).toBe(401);
      expect((await call(app, 'GET', '/me', { client: tablet })).statusCode).toBe(401);
      expect(await sessions(app, phone)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('changing requests need the CSRF token', async () => {
    const app = await createTestApp(db);
    try {
      const pc = await registerUser(app, { email: 'kari@example.test' });
      const response = await call(app, 'POST', '/me/sessions/end-others', {
        client: pc,
        headers: { [CSRF_HEADER]: 'feil' },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('FR-AUTH-009 notice about a new login', () => {
  it('shown in the sessions that were there before, never in the new one; "Det var meg" clears it everywhere', async () => {
    const app = await createTestApp(db);
    try {
      const pc = await registerUser(app, { email: 'kari@example.test' });
      const laptop = await loginFrom(app, 'kari@example.test', FIREFOX_WINDOWS);
      // The laptop's own login is new for the pc.
      expect(await notices(app, pc)).toHaveLength(1);
      await call(app, 'POST', `/me/login-notices/${await currentId(app, laptop)}/dismiss`, {
        client: pc,
      });

      const phone = await loginFrom(app, 'kari@example.test', SAFARI_IPHONE);
      const phoneId = await currentId(app, phone);
      const seen = await call(app, 'GET', '/me/login-notices', { client: pc });
      expect(seen.json().items).toEqual([
        { sessionId: phoneId, browser: 'safari', os: 'ios', createdAt: expect.any(String) },
      ]);
      expect((await notices(app, laptop)).map((n) => n.sessionId)).toEqual([phoneId]);
      expect(await notices(app, phone)).toEqual([]);

      const dismiss = await call(app, 'POST', `/me/login-notices/${phoneId}/dismiss`, {
        client: laptop,
      });
      expect(dismiss.statusCode).toBe(204);
      expect(await notices(app, pc)).toEqual([]);
      expect(await notices(app, laptop)).toEqual([]);
      // Twice is fine.
      expect(
        (await call(app, 'POST', `/me/login-notices/${phoneId}/dismiss`, { client: pc }))
          .statusCode,
      ).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('a session cannot dismiss the notice about itself (404)', async () => {
    const app = await createTestApp(db);
    try {
      await registerUser(app, { email: 'kari@example.test' });
      const phone = await loginFrom(app, 'kari@example.test', SAFARI_IPHONE);
      const id = await currentId(app, phone);
      expect(
        (await call(app, 'POST', `/me/login-notices/${id}/dismiss`, { client: phone })).statusCode,
      ).toBe(404);
      expect((await db.session.findUnique({ where: { id } }))?.loginNoticeDismissedAt).toBeNull();
    } finally {
      await app.close();
    }
  });
});

describe('FR-PRIV-002 nightly clean-up of expired sessions', () => {
  it('deletes sessions past their expiry for everybody, and nothing else', async () => {
    const app = await createTestApp(db);
    try {
      const kari = await registerUser(app, { email: 'kari@example.test' });
      await registerUser(app, { email: 'ola@example.test' });
      const kariId = await currentId(app, kari);
      await db.session.updateMany({
        where: { id: { not: kariId } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await createSessionsRepo(db).deleteExpired(new Date())).toBe(1);
      expect((await db.session.findMany()).map((s) => s.id)).toEqual([kariId]);
    } finally {
      await app.close();
    }
  });
});
