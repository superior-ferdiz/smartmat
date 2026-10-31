import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import {
  API_ERRORS,
  CSRF_HEADER,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationsResponse,
  type WasteStats,
} from '@smartmat/shared';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { householdPath, join } from './householdHelpers';
import { createItem, inventoryPath } from './inventoryHelpers';
import { addLine } from './shoppingHelpers';

/*
 * NFR-SEC-001 for spec 11. Kari owns household K with Per as a member; Ola owns household O and is not in K.
 *   A) Ola uses K's id in the URL                      → 404 on every endpoint, nothing changes
 *   B) Ola uses his own household with K's batch ids   → 404, no state row, nothing from K in O's figures
 *   C) Per (member) sees the household's data; roles do not matter here, states are per person
 *   D) not logged in / no CSRF token                   → 401 / 403
 */

const db = useTestDatabase();
let app: FastifyInstance;
let kari: Client;
let per: Client;
let ola: Client;
let K: string;
let O: string;
let kBatch: string;
let kKey: string;

beforeAll(async () => {
  app = await createTestApp(db, { now: () => new Date('2026-10-25T10:00:00Z') });
});
afterAll(() => app.close());

beforeEach(async () => {
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  K = kari.user.householdId;
  O = ola.user.householdId;
  per = await join(app, kari, await registerUser(app, { displayName: 'Per' }));
  const item = await createItem(app, kari, {
    name: 'Kyllingfilet',
    expiry: { kind: 'use_by', date: '2026-10-25' },
  });
  kBatch = item.batches[0]!.id;
  kKey = `useBy:today:${kBatch}:2026-10-25`;
  await call(app, 'POST', inventoryPath(kari, `/batches/${kBatch}/discard`), {
    client: kari,
    body: { quantityBase: 100, reason: 'expired', valueOre: 1234 },
  });
  await addLine(app, per, { text: 'Melk' });
});

async function snapshot() {
  const [states, settings, members] = await Promise.all([
    db.notificationState.findMany({ orderBy: [{ userId: 'asc' }, { key: 'asc' }] }),
    db.notificationSettings.findMany({ orderBy: { userId: 'asc' } }),
    db.householdMember.findMany({
      orderBy: [{ householdId: 'asc' }, { userId: 'asc' }],
      select: { householdId: true, userId: true, shoppingSeenAt: true },
    }),
  ]);
  return JSON.stringify({ states, settings, members });
}

type Endpoint = [InjectOptions['method'], (householdId: string) => string, unknown?];

const householdEndpoints = (): Endpoint[] => [
  ['GET', (h) => householdPath(h, '/waste-stats')],
  ['GET', (h) => householdPath(h, '/notifications')],
  ['POST', (h) => householdPath(h, '/notifications/seen'), { keys: [kKey] }],
  ['POST', (h) => householdPath(h, '/notifications/dismiss'), { key: kKey }],
  ['POST', (h) => householdPath(h, '/shopping-list/seen')],
];

describe('A) another household in the URL', () => {
  it('gives 404 on every new endpoint and changes nothing', async () => {
    const before = await snapshot();
    for (const [method, path, body] of householdEndpoints()) {
      const response = await call(app, method, path(K), { client: ola, body });
      expect(response.statusCode, `${method} ${path(K)}`).toBe(404);
      expect(response.json().error.code).toBe(API_ERRORS.notFound);
    }
    expect(await snapshot()).toBe(before);
  });
});

describe("B) Ola's own household with K's ids", () => {
  it("cannot mark or dismiss a notification about K's batch", async () => {
    const before = await snapshot();
    const seen = await call(app, 'POST', householdPath(O, '/notifications/seen'), {
      client: ola,
      body: { keys: [kKey] },
    });
    expect(seen.json()).toEqual({ marked: 0 });
    const dismiss = await call(app, 'POST', householdPath(O, '/notifications/dismiss'), {
      client: ola,
      body: { key: kKey },
    });
    expect(dismiss.statusCode).toBe(404);
    expect(await snapshot()).toBe(before);
  });

  it("sees nothing of K's inventory, waste or shopping list in his own figures", async () => {
    const notifications = await call(app, 'GET', householdPath(O, '/notifications'), {
      client: ola,
    });
    expect(notifications.json<NotificationsResponse>()).toEqual({ items: [], unseenCount: 0 });
    const stats = (
      await call(app, 'GET', householdPath(O, '/waste-stats'), { client: ola })
    ).json<WasteStats>();
    expect(stats).toMatchObject({ count: 0, knownOre: 0, topItems: [] });
    expect(JSON.stringify(stats)).not.toContain('Kyllingfilet');
  });

  it("cannot change someone else's settings: /me is always the caller", async () => {
    const before = await snapshot();
    await call(app, 'PUT', '/me/notification-settings', {
      client: ola,
      body: { ...DEFAULT_NOTIFICATION_SETTINGS, useBy: false, userId: kari.user.id },
    });
    const rows = await db.notificationSettings.findMany();
    expect(rows.map((r) => r.userId)).toEqual([ola.user.id]);
    expect(before).not.toBe(await snapshot());
  });
});

describe('C) members of K', () => {
  it("both see the household's waste and date notifications, each with their own state", async () => {
    for (const client of [kari, per]) {
      const stats = (
        await call(app, 'GET', householdPath(K, '/waste-stats'), { client })
      ).json<WasteStats>();
      expect(stats).toMatchObject({ count: 1, actualOre: 1234 });
      const keys = (await call(app, 'GET', householdPath(K, '/notifications'), { client }))
        .json<NotificationsResponse>()
        .items.map((n) => n.key);
      expect(keys).toContain(kKey);
    }
    await call(app, 'POST', householdPath(K, '/notifications/dismiss'), {
      client: per,
      body: { key: kKey },
    });
    const states = await db.notificationState.findMany();
    expect(states.map((s) => s.userId)).toEqual([per.user.id]);
  });
});

describe('D) not logged in, no CSRF token', () => {
  it('401 without a session on every endpoint', async () => {
    const before = await snapshot();
    const all: Endpoint[] = [
      ...householdEndpoints(),
      ['GET', () => '/me/notification-settings'],
      ['PUT', () => '/me/notification-settings', DEFAULT_NOTIFICATION_SETTINGS],
    ];
    for (const [method, path, body] of all) {
      const response = await call(app, method, path(K), { body });
      expect(response.statusCode, `${method} ${path(K)}`).toBe(401);
    }
    expect(await snapshot()).toBe(before);
  });

  it('403 for changes with a wrong CSRF token', async () => {
    const before = await snapshot();
    const changes: Endpoint[] = [
      ...householdEndpoints().filter(([method]) => method !== 'GET'),
      ['PUT', () => '/me/notification-settings', DEFAULT_NOTIFICATION_SETTINGS],
    ];
    for (const [method, path, body] of changes) {
      const response = await call(app, method, path(K), {
        client: kari,
        body,
        headers: { [CSRF_HEADER]: 'feil' },
      });
      expect(response.statusCode, `${method} ${path(K)}`).toBe(403);
    }
    expect(await snapshot()).toBe(before);
  });
});
