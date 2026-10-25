import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { API_ERRORS, CSRF_HEADER } from '@smartmat/shared';
import {
  call,
  createTestApp,
  PASSWORD,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { householdPath, invite, join } from './householdHelpers';

/*
 * NFR-SEC-001 and FR-HH-003 for shared households (spec 10). Kari owns household K with Per as a member;
 * Ola owns household O and is not in K.
 *   A) Ola uses K's id in the URL                 → 404 on every endpoint, nothing changes
 *   B) Per (a member of K) tries owner actions    → 403, nothing changes
 *   C) Ola uses his own household with K's ids    → 404 / 400, nothing changes in K
 *   D) not logged in / no CSRF token              → 401 / 403
 */

const db = useTestDatabase();
let app: FastifyInstance;
let kari: Client;
let per: Client;
let ola: Client;
let K: string;
let O: string;
let kariInvitation: string;

beforeAll(async () => {
  app = await createTestApp(db);
});
afterAll(() => app.close());

beforeEach(async () => {
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  K = kari.user.householdId;
  O = ola.user.householdId;
  per = await join(app, kari, await registerUser(app, { displayName: 'Per' }));
  kariInvitation = (await invite(app, kari)).invitation.id;
});

async function snapshot() {
  const [households, members, invitations, users] = await Promise.all([
    db.household.findMany({ orderBy: { id: 'asc' } }),
    db.householdMember.findMany({ orderBy: [{ householdId: 'asc' }, { userId: 'asc' }] }),
    db.householdInvitation.findMany({ orderBy: { id: 'asc' } }),
    db.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, activeHouseholdId: true } }),
  ]);
  return JSON.stringify({ households, members, invitations, users });
}

type Endpoint = [InjectOptions['method'], (householdId: string) => string, unknown?];

/** Every endpoint under /households/:householdId added in phase 10 (and the read from phase 2). */
const memberEndpoints: Endpoint[] = [
  ['GET', (h) => householdPath(h)],
  ['GET', (h) => householdPath(h, '/members')],
  ['PATCH', (h) => householdPath(h, '/members/me'), { shareAllergens: true }],
  ['POST', (h) => householdPath(h, '/leave')],
];
const ownerEndpoints = (): Endpoint[] => [
  ['PATCH', (h) => householdPath(h), { name: 'Overtatt' }],
  ['DELETE', (h) => householdPath(h), { password: PASSWORD }],
  ['DELETE', (h) => householdPath(h, `/members/${kari.user.id}`)],
  ['DELETE', (h) => householdPath(h, `/members/${per.user.id}`)],
  [
    'POST',
    (h) => householdPath(h, '/transfer-ownership'),
    { userId: per.user.id, password: PASSWORD },
  ],
  ['GET', (h) => householdPath(h, '/invitations')],
  ['POST', (h) => householdPath(h, '/invitations')],
  ['DELETE', (h) => householdPath(h, `/invitations/${kariInvitation}`)],
];

describe('A) another household in the URL', () => {
  it('gives 404 on every endpoint and changes nothing', async () => {
    const before = await snapshot();
    for (const [method, path, body] of [...memberEndpoints, ...ownerEndpoints()]) {
      const response = await call(app, method, path(K), { client: ola, body });
      expect(response.statusCode, `${method} ${path(K)}`).toBe(404);
      expect(response.json().error.code).toBe(API_ERRORS.notFound);
    }
    expect(await snapshot()).toBe(before);
  });

  it('cannot make another household the active one', async () => {
    const before = await snapshot();
    const response = await call(app, 'PUT', '/me/active-household', {
      client: ola,
      body: { householdId: K },
    });
    expect(response.statusCode).toBe(404);
    expect(await snapshot()).toBe(before);
  });
});

describe('B) a member tries the owner actions', () => {
  it('gives 403 on every owner endpoint and changes nothing', async () => {
    const before = await snapshot();
    for (const [method, path, body] of ownerEndpoints()) {
      const response = await call(app, method, path(K), { client: per, body });
      expect(response.statusCode, `${method} ${path(K)}`).toBe(403);
      expect(response.json().error.code).toBe(API_ERRORS.householdOwnerOnly);
    }
    expect(await snapshot()).toBe(before);
  });

  it('may do what every member may (read, own sharing choice)', async () => {
    for (const [method, path, body] of memberEndpoints.filter(([m]) => m !== 'POST')) {
      expect((await call(app, method, path(K), { client: per, body })).statusCode).toBe(200);
    }
  });
});

describe("C) Ola's own household with K's ids", () => {
  it("cannot remove a member of K, revoke K's invitation or hand O to someone in K", async () => {
    const before = await snapshot();
    const remove = await call(app, 'DELETE', householdPath(O, `/members/${per.user.id}`), {
      client: ola,
    });
    expect(remove.statusCode).toBe(404);
    const revoke = await call(app, 'DELETE', householdPath(O, `/invitations/${kariInvitation}`), {
      client: ola,
    });
    expect(revoke.statusCode).toBe(404);
    const transfer = await call(app, 'POST', householdPath(O, '/transfer-ownership'), {
      client: ola,
      body: { userId: per.user.id, password: PASSWORD },
    });
    expect(transfer.statusCode).toBe(400);
    expect(transfer.json().error.fields).toEqual({ userId: API_ERRORS.householdNotAMember });
    expect(await snapshot()).toBe(before);
  });

  it("O's invitation list never shows K's invitations", async () => {
    const response = await call(app, 'GET', householdPath(O, '/invitations'), { client: ola });
    expect(response.json()).toEqual({ invitations: [] });
  });

  it('a userId or householdId in the body is ignored where the URL decides', async () => {
    const response = await call(app, 'PATCH', householdPath(O, '/members/me'), {
      client: ola,
      body: { shareAllergens: true, userId: per.user.id, householdId: K },
    });
    expect(response.statusCode).toBe(200);
    const perRow = await db.householdMember.findUniqueOrThrow({
      where: { householdId_userId: { householdId: K, userId: per.user.id } },
    });
    expect(perRow.shareAllergens).toBe(false);
  });
});

describe('D) not logged in, no CSRF token', () => {
  it('401 without a session on every endpoint, including the invitation ones', async () => {
    const before = await snapshot();
    const all: Endpoint[] = [
      ...memberEndpoints,
      ...ownerEndpoints(),
      ['POST', () => '/invitations/preview', { token: 'A'.repeat(43) }],
      ['POST', () => '/invitations/accept', { token: 'A'.repeat(43) }],
      ['PUT', () => '/me/active-household', { householdId: K }],
    ];
    for (const [method, path, body] of all) {
      const response = await call(app, method, path(K), { body });
      expect(response.statusCode, `${method} ${path(K)}`).toBe(401);
    }
    expect(await snapshot()).toBe(before);
  });

  it('403 without the CSRF token on every change', async () => {
    const before = await snapshot();
    const changes = [...memberEndpoints, ...ownerEndpoints()].filter(([m]) => m !== 'GET');
    for (const [method, path, body] of changes) {
      const response = await call(app, method, path(K), {
        client: kari,
        body,
        headers: { [CSRF_HEADER]: 'feil' },
      });
      expect(response.statusCode, `${method} ${path(K)}`).toBe(403);
    }
    const accept = await call(app, 'POST', '/invitations/accept', {
      client: ola,
      body: { token: 'A'.repeat(43) },
      headers: { [CSRF_HEADER]: 'feil' },
    });
    expect(accept.statusCode).toBe(403);
    expect(await snapshot()).toBe(before);
  });
});
