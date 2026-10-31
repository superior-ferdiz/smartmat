import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  addDays,
  API_ERRORS,
  DEFAULT_NOTIFICATION_SETTINGS,
  osloDate,
  type NotificationResponse,
  type NotificationsResponse,
} from '@smartmat/shared';
import {
  call,
  captureLog,
  createTestApp,
  PASSWORD,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { householdPath, join } from './householdHelpers';
import { createItem, inventoryPath } from './inventoryHelpers';
import { budgetPath, createPurchase, purchasesPath } from './purchaseHelpers';
import { addLine } from './shoppingHelpers';

/*
 * Spec 11 (FR-NOTIF-001–006, ADR-0019) against the real database: notifications are computed on every read,
 * only the user's state is stored, the same notification never comes back once dismissed, and nothing is
 * left after leaving a household. "Today" is 2026-10-25 in Norway unless a test says otherwise.
 */

const db = useTestDatabase();
const log = captureLog();
let app: FastifyInstance;
const NOW = new Date('2026-10-25T10:00:00Z');
let clock: () => Date = () => NOW;

beforeAll(async () => {
  app = await createTestApp(db, { now: () => clock(), logStream: log.stream });
});
afterAll(() => app.close());
beforeEach(() => {
  clock = () => NOW;
});

const notificationsPath = (householdId: string, path = '') =>
  householdPath(householdId, `/notifications${path}`);

async function notificationsOf(client: Client, householdId = client.user.householdId) {
  const response = await call(app, 'GET', notificationsPath(householdId), { client });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<NotificationsResponse>();
}

function dismiss(client: Client, key: string, householdId = client.user.householdId) {
  return call(app, 'POST', notificationsPath(householdId, '/dismiss'), { client, body: { key } });
}

function markSeen(client: Client, keys: string[], householdId = client.user.householdId) {
  return call(app, 'POST', notificationsPath(householdId, '/seen'), { client, body: { keys } });
}

const useByTomorrow = { kind: 'use_by', date: '2026-10-26' };

describe('FR-NOTIF-001 dates', () => {
  it('a use-by date tomorrow gives one notification with a fixed key', async () => {
    const client = await registerUser(app);
    const item = await createItem(app, client, {
      name: 'Kyllingfilet',
      unit: 'g',
      expiry: useByTomorrow,
    });
    const { items, unseenCount } = await notificationsOf(client);
    expect(items).toEqual([
      {
        kind: 'useBySoon',
        key: `useBy:soon:${item.batches[0]!.id}:2026-10-26`,
        itemId: item.id,
        itemName: 'Kyllingfilet',
        expiryDate: '2026-10-26',
        daysLeft: 1,
        seen: false,
      },
    ]);
    expect(unseenCount).toBe(1);
    // Reading again gives the same notification, not a second one.
    expect((await notificationsOf(client)).items.map((n) => n.key)).toEqual([items[0]!.key]);
  });

  it('best before and use by are different notifications; no best-before notification after the date', async () => {
    const client = await registerUser(app);
    await createItem(app, client, {
      name: 'Melk',
      expiry: { kind: 'best_before', date: '2026-10-25' },
    });
    await createItem(app, client, {
      name: 'Yoghurt',
      expiry: { kind: 'best_before', date: '2026-10-20' },
    });
    await createItem(app, client, { name: 'Laks', expiry: { kind: 'use_by', date: '2026-10-24' } });
    await createItem(app, client, {
      name: 'Pålegg',
      expiry: { kind: 'use_by', date: '2026-10-20' },
    });
    const kinds = (await notificationsOf(client)).items.map((n) => [
      n.kind,
      'itemName' in n && n.itemName,
    ]);
    expect(kinds).toEqual([
      ['useByPassed', 'Laks'],
      ['bestBeforeToday', 'Melk'],
    ]);
  });

  it('disappears when the batch is used up, and comes when the clock reaches the day', async () => {
    const client = await registerUser(app);
    const item = await createItem(app, client, { expiry: { kind: 'use_by', date: '2026-10-28' } });
    expect((await notificationsOf(client)).items).toEqual([]);
    clock = () => new Date('2026-10-26T23:30:00Z'); // 00:30 on 27 October in Norway
    expect((await notificationsOf(client)).items.map((n) => n.kind)).toEqual(['useBySoon']);
    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/consume`), {
      client,
      body: { quantityBase: 1000 },
    });
    expect((await notificationsOf(client)).items).toEqual([]);
  });

  it('a corrected date is a new notification', async () => {
    const client = await registerUser(app);
    const item = await createItem(app, client, { expiry: useByTomorrow });
    const [first] = (await notificationsOf(client)).items;
    expect((await dismiss(client, first!.key)).statusCode).toBe(204);
    await call(app, 'PATCH', inventoryPath(client, `/batches/${item.batches[0]!.id}`), {
      client,
      body: { expiry: { kind: 'use_by', date: '2026-10-25' } },
    });
    const [second] = (await notificationsOf(client)).items;
    expect(second?.kind).toBe('useByToday');
    expect(second?.key).not.toBe(first!.key);
  });
});

describe('FR-NOTIF-004 seen and dismissed', () => {
  it('marks as seen (badge goes to 0), and a dismissed notification never comes back', async () => {
    const client = await registerUser(app);
    await createItem(app, client, { expiry: useByTomorrow });
    const [n] = (await notificationsOf(client)).items;

    const seen = await markSeen(client, [n!.key]);
    expect(seen.json()).toEqual({ marked: 1 });
    expect(await notificationsOf(client)).toMatchObject({
      unseenCount: 0,
      items: [{ seen: true }],
    });
    expect((await markSeen(client, [n!.key])).json()).toEqual({ marked: 0 });

    expect((await dismiss(client, n!.key)).statusCode).toBe(204);
    expect((await notificationsOf(client)).items).toEqual([]);
    // A second dismissal is harmless (still one row, still dismissed).
    expect((await dismiss(client, n!.key)).statusCode).toBe(204);
    const rows = await db.notificationState.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dismissedAt).not.toBeNull();
  });

  it('skips keys that are not active when marking as seen, and refuses them when dismissing', async () => {
    const client = await registerUser(app);
    const made = `useBy:today:${crypto.randomUUID()}:2026-10-25`;
    expect((await markSeen(client, [made])).json()).toEqual({ marked: 0 });
    const response = await dismiss(client, made);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe(API_ERRORS.notificationNotFound);
    expect(await db.notificationState.count()).toBe(0);
  });

  it('validates keys and the list of keys', async () => {
    const client = await registerUser(app);
    for (const body of [
      { keys: [] },
      { keys: ['ingen kolon'] },
      { keys: ['a:<script>'] },
      { keys: Array.from({ length: 101 }, (_, i) => `x:${i}`) },
      { keys: [`a:${'b'.repeat(130)}`] },
    ]) {
      const response = await call(
        app,
        'POST',
        notificationsPath(client.user.householdId, '/seen'),
        {
          client,
          body,
        },
      );
      expect(response.statusCode, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    expect((await dismiss(client, 'mangler-kolon')).statusCode).toBe(400);
  });

  it('10 simultaneous dismissals give one row and no errors', async () => {
    const client = await registerUser(app);
    await createItem(app, client, { expiry: useByTomorrow });
    const [n] = (await notificationsOf(client)).items;
    const responses = await Promise.all(Array.from({ length: 10 }, () => dismiss(client, n!.key)));
    expect(responses.map((r) => r.statusCode)).toEqual(Array(10).fill(204));
    expect(await db.notificationState.count()).toBe(1);
    expect((await notificationsOf(client)).items).toEqual([]);
  });

  it('simultaneous "seen" and "dismiss" for the same key give one row that stays dismissed', async () => {
    const client = await registerUser(app);
    await createItem(app, client, { expiry: useByTomorrow });
    const [n] = (await notificationsOf(client)).items;
    const responses = await Promise.all([
      ...Array.from({ length: 5 }, () => markSeen(client, [n!.key])),
      dismiss(client, n!.key),
      ...Array.from({ length: 5 }, () => markSeen(client, [n!.key])),
    ]);
    expect(responses.every((r) => r.statusCode < 300)).toBe(true);
    const rows = await db.notificationState.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dismissedAt).not.toBeNull();
  });

  it('deletes states older than 45 days when a new one is written', async () => {
    const client = await registerUser(app);
    const householdId = client.user.householdId;
    await db.notificationState.createMany({
      data: [
        {
          userId: client.user.id,
          householdId,
          key: 'useBy:today:old',
          seenAt: new Date('2026-09-01T00:00:00Z'),
        },
        {
          userId: client.user.id,
          householdId,
          key: 'useBy:today:recent',
          seenAt: new Date('2026-09-20T00:00:00Z'),
        },
      ],
    });
    await createItem(app, client, { expiry: useByTomorrow });
    const [n] = (await notificationsOf(client)).items;
    await markSeen(client, [n!.key]);
    expect((await db.notificationState.findMany()).map((r) => r.key).sort()).toEqual(
      [n!.key, 'useBy:today:recent'].sort(),
    );
  });
});

describe('FR-NOTIF-005 settings per user', () => {
  it('defaults without a row; saved settings change what is shown', async () => {
    const client = await registerUser(app);
    const get = await call(app, 'GET', '/me/notification-settings', { client });
    expect(get.json()).toEqual(DEFAULT_NOTIFICATION_SETTINGS);

    await createItem(app, client, { expiry: { kind: 'use_by', date: '2026-10-28' } });
    expect((await notificationsOf(client)).items).toEqual([]);
    const put = await call(app, 'PUT', '/me/notification-settings', {
      client,
      body: { ...DEFAULT_NOTIFICATION_SETTINGS, daysBefore: 3 },
    });
    expect(put.statusCode).toBe(200);
    expect((await notificationsOf(client)).items.map((n) => n.kind)).toEqual(['useBySoon']);

    await call(app, 'PUT', '/me/notification-settings', {
      client,
      body: { ...DEFAULT_NOTIFICATION_SETTINGS, daysBefore: 3, useBy: false },
    });
    expect((await notificationsOf(client)).items).toEqual([]);
  });

  it('validates on the server, and a userId in the body is ignored', async () => {
    const client = await registerUser(app);
    const other = await registerUser(app);
    for (const daysBefore of [-1, 8, 1.5, '2']) {
      const response = await call(app, 'PUT', '/me/notification-settings', {
        client,
        body: { ...DEFAULT_NOTIFICATION_SETTINGS, daysBefore },
      });
      expect(response.statusCode, String(daysBefore)).toBe(400);
      expect(response.json().error.fields.daysBefore).toBe('validation.notification.daysBefore');
    }
    await call(app, 'PUT', '/me/notification-settings', {
      client,
      body: { ...DEFAULT_NOTIFICATION_SETTINGS, budget: false, userId: other.user.id },
    });
    expect(
      await db.notificationSettings.findUnique({ where: { userId: other.user.id } }),
    ).toBeNull();
    expect(
      (await db.notificationSettings.findUniqueOrThrow({ where: { userId: client.user.id } }))
        .budget,
    ).toBe(false);
  });
});

describe('FR-NOTIF-002 budget', () => {
  it('80 % gives "nearly used", 100 % "exceeded", and deleting the purchase removes it', async () => {
    const client = await registerUser(app);
    await call(app, 'PUT', budgetPath(client), { client, body: { amountOre: 100_000 } });
    const first = await createPurchase(app, client, {
      purchasedOn: '2026-10-20',
      totalOre: 85_000,
    });
    expect((await notificationsOf(client)).items).toMatchObject([
      { kind: 'budgetNearlyUsed', key: 'budget:2026-10:80', usedPercent: 85 },
    ]);
    await createPurchase(app, client, { purchasedOn: '2026-10-21', totalOre: 15_000 });
    expect((await notificationsOf(client)).items).toMatchObject([
      { kind: 'budgetExceeded', key: 'budget:2026-10:100', usedPercent: 100 },
    ]);
    await call(app, 'DELETE', purchasesPath(client, `/${first.id}`), { client, body: {} });
    expect((await notificationsOf(client)).items).toEqual([]);
  });

  it('a purchase last month does not count', async () => {
    const client = await registerUser(app);
    await call(app, 'PUT', budgetPath(client), { client, body: { amountOre: 100_000 } });
    await createPurchase(app, client, { purchasedOn: '2026-09-30', totalOre: 99_000 });
    expect((await notificationsOf(client)).items).toEqual([]);
  });
});

describe('FR-NOTIF-003/006 shared households', () => {
  let kari: Client;
  let per: Client;
  let K: string;

  beforeEach(async () => {
    // The shopping list compares the database's created_at with the app clock: use the real time here.
    clock = () => new Date();
    kari = await registerUser(app, { displayName: 'Kari' });
    K = kari.user.householdId;
    per = await join(app, kari, await registerUser(app, { displayName: 'Per' }));
  });

  // This block runs on the real clock (above), so "tomorrow" must come from it too. A fixed date (2026-10-26) made
  // the date test fail from 2026-10-27 on (found in phase 13).
  const useByTomorrowReal = () => ({ kind: 'use_by', date: addDays(osloDate(new Date()), 1) });

  function shoppingOf(items: NotificationResponse[]) {
    return items.find((n) => n.kind === 'shoppingAdded');
  }

  it('lines Per adds give Kari a notification with his name; Per gets none for his own', async () => {
    await addLine(app, per, { text: 'Melk' });
    await addLine(app, per, { text: 'Egg' });
    expect(shoppingOf((await notificationsOf(kari)).items)).toMatchObject({
      count: 2,
      texts: ['Egg', 'Melk'],
      addedBy: [{ kind: 'member', displayName: 'Per' }],
    });
    expect(shoppingOf((await notificationsOf(per)).items)).toBeUndefined();
  });

  it('opening the list clears it; dismissing keeps a line added afterwards', async () => {
    await addLine(app, per, { text: 'Melk' });
    expect(
      (await call(app, 'POST', householdPath(K, '/shopping-list/seen'), { client: kari }))
        .statusCode,
    ).toBe(204);
    expect(shoppingOf((await notificationsOf(kari)).items)).toBeUndefined();

    await addLine(app, per, { text: 'Egg' });
    const shown = shoppingOf((await notificationsOf(kari)).items)!;
    await addLine(app, per, { text: 'Brød' }); // after Kari's page was loaded
    expect((await dismiss(kari, shown.key)).statusCode).toBe(204);
    expect(shoppingOf((await notificationsOf(kari)).items)).toMatchObject({
      count: 1,
      texts: ['Brød'],
    });

    // A time later than the newest line, or not a time at all, is refused.
    const latest = Date.parse(shoppingOf((await notificationsOf(kari)).items)!.latestAt);
    expect((await dismiss(kari, `shopping:${latest + 1}`)).statusCode).toBe(404);
    expect((await dismiss(kari, 'shopping:abc')).statusCode).toBe(404);
    expect((await dismiss(kari, `shopping:${latest}`)).statusCode).toBe(204);
    expect(shoppingOf((await notificationsOf(kari)).items)).toBeUndefined();
  });

  it('a stale key from an old page never moves the "seen" mark back', async () => {
    await addLine(app, per, { text: 'Melk' });
    const old = shoppingOf((await notificationsOf(kari)).items)!;
    await addLine(app, per, { text: 'Brød' });
    // Kari opens the list: Melk and Brød are seen.
    await call(app, 'POST', householdPath(K, '/shopping-list/seen'), { client: kari });
    await addLine(app, per, { text: 'Egg' });
    // The page from before Kari opened the list sends its old key (Melk's time). Brød must stay seen.
    expect((await dismiss(kari, old.key)).statusCode).toBe(204);
    expect(shoppingOf((await notificationsOf(kari)).items)).toMatchObject({
      count: 1,
      texts: ['Egg'],
    });
  });

  it('a former member is never named', async () => {
    await addLine(app, per, { text: 'Melk' });
    await call(app, 'POST', householdPath(K, '/leave'), { client: per });
    const n = shoppingOf((await notificationsOf(kari)).items);
    expect(n?.addedBy).toEqual([{ kind: 'former', displayName: null }]);
    expect(JSON.stringify(n)).not.toContain('Per');
  });

  it('both members see a date notification; dismissing it is per person', async () => {
    await createItem(app, kari, { expiry: useByTomorrowReal() });
    const [n] = (await notificationsOf(kari)).items.filter((x) => x.kind === 'useBySoon');
    expect((await notificationsOf(per)).items.map((x) => x.key)).toContain(n!.key);
    await dismiss(per, n!.key);
    expect((await notificationsOf(per)).items.map((x) => x.key)).not.toContain(n!.key);
    expect((await notificationsOf(kari)).items.map((x) => x.key)).toContain(n!.key);
  });

  it('after leaving: 404 at once, and the states are gone (CASCADE)', async () => {
    await createItem(app, kari, { expiry: useByTomorrowReal() });
    const [n] = (await notificationsOf(per)).items;
    await markSeen(per, [n!.key]);
    expect(
      await db.notificationState.count({ where: { userId: per.user.id, householdId: K } }),
    ).toBe(1);

    await call(app, 'POST', householdPath(K, '/leave'), { client: per });
    const response = await call(app, 'GET', notificationsPath(K), { client: per });
    expect(response.statusCode).toBe(404);
    expect(
      await db.notificationState.count({ where: { userId: per.user.id, householdId: K } }),
    ).toBe(0);
    expect((await dismiss(per, n!.key, K)).statusCode).toBe(404);
  });

  it('being removed by the owner also deletes the states', async () => {
    await createItem(app, kari, { expiry: useByTomorrowReal() });
    const [n] = (await notificationsOf(per)).items;
    await dismiss(per, n!.key);
    await call(app, 'DELETE', householdPath(K, `/members/${per.user.id}`), { client: kari });
    expect(await db.notificationState.count({ where: { userId: per.user.id } })).toBe(0);
  });
});

describe('FR-AUTH-005 deleting the account', () => {
  it('deletes the notification settings and states with it', async () => {
    const client = await registerUser(app);
    await call(app, 'PUT', '/me/notification-settings', {
      client,
      body: { ...DEFAULT_NOTIFICATION_SETTINGS, daysBefore: 3 },
    });
    await createItem(app, client, { expiry: useByTomorrow });
    const [n] = (await notificationsOf(client)).items;
    await dismiss(client, n!.key);
    expect(await db.notificationState.count({ where: { userId: client.user.id } })).toBe(1);

    const response = await call(app, 'DELETE', '/me', { client, body: { password: PASSWORD } });
    expect(response.statusCode).toBe(204);
    expect(await db.notificationState.count({ where: { userId: client.user.id } })).toBe(0);
    expect(await db.notificationSettings.count({ where: { userId: client.user.id } })).toBe(0);
  });
});

describe('NFR-SEC-004 the log', () => {
  it('contains no item names, keys or shopping texts', async () => {
    const client = await registerUser(app);
    const item = await createItem(app, client, { name: 'Hemmelig medisin', expiry: useByTomorrow });
    const [n] = (await notificationsOf(client)).items;
    await markSeen(client, [n!.key]);
    await dismiss(client, n!.key);
    await dismiss(client, `useBy:today:${item.batches[0]!.id}:2026-10-25`);
    const text = log.text();
    expect(text).not.toContain('Hemmelig');
    expect(text).not.toContain(item.batches[0]!.id);
  });
});
