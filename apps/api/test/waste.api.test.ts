import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ItemResponse, WasteStats } from '@smartmat/shared';
import {
  call,
  captureLog,
  createTestApp,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { createItem, inventoryPath } from './inventoryHelpers';

/*
 * Spec 11 (FR-WASTE-001–004) against the real database: what counts, Norwegian month boundaries (also
 * across the change from summer to winter time), actual/estimated/unknown kept apart, quantities per unit.
 * The fake clock only decides the default month; the events get their created_at set directly.
 */

const db = useTestDatabase();
const log = captureLog();
let app: FastifyInstance;
const NOW = new Date('2026-10-25T10:00:00Z');

beforeAll(async () => {
  app = await createTestApp(db, { now: () => NOW, logStream: log.stream });
});
afterAll(() => app.close());

function statsPath(client: Client, month?: string) {
  return `/households/${client.user.householdId}/waste-stats${month ? `?month=${month}` : ''}`;
}

async function stats(client: Client, month?: string): Promise<WasteStats> {
  const response = await call(app, 'GET', statsPath(client, month), { client });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<WasteStats>();
}

async function discard(
  client: Client,
  item: ItemResponse,
  body: { quantityBase: number; reason: string; valueOre?: number },
  at?: string,
) {
  const response = await call(
    app,
    'POST',
    inventoryPath(client, `/batches/${item.batches[0]!.id}/discard`),
    { client, body },
  );
  expect(response.statusCode, response.body).toBe(200);
  if (at) {
    const last = await db.inventoryEvent.findFirstOrThrow({
      where: { itemId: item.id, type: 'discard' },
      orderBy: { seq: 'desc' },
    });
    await db.inventoryEvent.update({ where: { id: last.id }, data: { createdAt: new Date(at) } });
  }
}

describe('FR-WASTE-001/004 the month: actual, estimated and unknown kept apart', () => {
  it('sums known values, counts unknown ones without a value, and gives the estimated share', async () => {
    const client = await registerUser(app);
    const priced = await createItem(app, client, {
      name: 'Lettmelk',
      quantityBase: 1000,
      priceOre: 2490,
    });
    const actual = await createItem(app, client, {
      name: 'Kjøttdeig',
      unit: 'g',
      quantityBase: 400,
      priceOre: 5990,
    });
    const unpriced = await createItem(app, client, {
      name: 'Agurk',
      unit: 'stk',
      quantityBase: 2,
      priceOre: null,
    });
    await discard(client, priced, { quantityBase: 250, reason: 'spoiled' }); // estimated 623
    await discard(client, actual, { quantityBase: 400, reason: 'expired', valueOre: 5000 });
    await discard(client, unpriced, { quantityBase: 1, reason: 'tooMuch' });

    const result = await stats(client);
    expect(result).toMatchObject({
      month: '2026-10',
      count: 3,
      actualOre: 5000,
      estimatedOre: 623,
      knownOre: 5623,
      unknownCount: 1,
      estimatedPercent: 11, // 623 / 5623 = 11,08 %
      quantities: [
        { unit: 'g', quantityBase: 400 },
        { unit: 'ml', quantityBase: 250 },
        { unit: 'stk', quantityBase: 1 },
      ],
    });
    expect(result.byReason.reduce((sum, r) => sum + r.percent, 0)).toBe(100);
    expect(result.byReason.find((r) => r.reason === 'tooMuch')).toMatchObject({
      count: 1,
      knownOre: 0,
      unknownCount: 1,
    });
    expect(result.trend).toHaveLength(12);
    expect(result.trend.at(-1)).toMatchObject({ month: '2026-10', count: 3, knownOre: 5623 });
  });

  it('does not count undone discards or food that was used', async () => {
    const client = await registerUser(app);
    const a = await createItem(app, client, { name: 'A' });
    const b = await createItem(app, client, { name: 'B' });
    await discard(client, a, { quantityBase: 100, reason: 'expired' });
    await call(app, 'POST', inventoryPath(client, `/items/${a.id}/undo`), { client });
    await call(app, 'POST', inventoryPath(client, `/batches/${b.batches[0]!.id}/consume`), {
      client,
      body: { quantityBase: 500 },
    });
    expect(await stats(client)).toMatchObject({
      count: 0,
      knownOre: 0,
      byReason: [],
      topItems: [],
    });
  });

  it('loses the discards of an item that is deleted (spec 11 decision 5)', async () => {
    const client = await registerUser(app);
    const item = await createItem(app, client);
    await discard(client, item, { quantityBase: 100, reason: 'expired' });
    expect((await stats(client)).count).toBe(1);
    await call(app, 'DELETE', inventoryPath(client, `/items/${item.id}`), { client });
    expect((await stats(client)).count).toBe(0);
  });
});

describe('FR-WASTE-001/003 months in Norwegian time', () => {
  it('puts a discard at 00:01 on 1 October in October, and 23:59 on 30 September in September', async () => {
    const client = await registerUser(app);
    const sept = await createItem(app, client, { name: 'September' });
    const oct = await createItem(app, client, { name: 'Oktober' });
    await discard(client, sept, { quantityBase: 100, reason: 'expired' }, '2026-09-30T21:59:00Z'); // 23:59 CEST
    await discard(client, oct, { quantityBase: 100, reason: 'expired' }, '2026-09-30T22:01:00Z'); // 00:01 CEST

    expect((await stats(client, '2026-09')).topItems.map((i) => i.name)).toEqual(['September']);
    expect((await stats(client, '2026-10')).topItems.map((i) => i.name)).toEqual(['Oktober']);
    const trend = (await stats(client, '2026-10')).trend;
    expect(trend.find((m) => m.month === '2026-09')?.count).toBe(1);
    expect(trend.find((m) => m.month === '2026-10')?.count).toBe(1);
  });

  it('uses winter time after the change: 23:59 on 31 October is 22:59 UTC', async () => {
    const client = await registerUser(app);
    const oct = await createItem(app, client, { name: 'Siste oktober' });
    const nov = await createItem(app, client, { name: 'Første november' });
    await discard(client, oct, { quantityBase: 100, reason: 'expired' }, '2026-10-31T22:59:00Z');
    await discard(client, nov, { quantityBase: 100, reason: 'expired' }, '2026-10-31T23:01:00Z');
    expect((await stats(client, '2026-10')).topItems.map((i) => i.name)).toEqual(['Siste oktober']);
    expect((await stats(client, '2026-11')).topItems.map((i) => i.name)).toEqual([
      'Første november',
    ]);
  });

  it('leaves out discards older than the 12 months of the trend', async () => {
    const client = await registerUser(app);
    const old = await createItem(app, client, { name: 'Gammel' });
    await discard(client, old, { quantityBase: 100, reason: 'expired' }, '2025-10-15T12:00:00Z');
    const result = await stats(client, '2026-10');
    expect(result.trend[0]?.month).toBe('2025-11');
    expect(result.trend.every((m) => m.count === 0)).toBe(true);
    expect((await stats(client, '2025-10')).count).toBe(1);
  });
});

describe('FR-WASTE-002 most thrown away', () => {
  it('orders by count, then known value, at most 5', async () => {
    const client = await registerUser(app);
    const items: ItemResponse[] = [];
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
      items.push(await createItem(app, client, { name, quantityBase: 1000, priceOre: 1000 }));
    }
    // C twice, then B (higher value) before A, D, E and F.
    await discard(client, items[2]!, { quantityBase: 100, reason: 'expired' });
    await discard(client, items[2]!, { quantityBase: 100, reason: 'expired' });
    await discard(client, items[1]!, { quantityBase: 500, reason: 'expired' });
    for (const i of [0, 3, 4, 5])
      await discard(client, items[i]!, { quantityBase: 100, reason: 'expired' });

    const top = (await stats(client)).topItems;
    expect(top.map((i) => [i.name, i.count])).toEqual([
      ['C', 2],
      ['B', 1],
      ['A', 1],
      ['D', 1],
      ['E', 1],
    ]);
    expect(top[0]).toMatchObject({ quantityBase: 200, knownOre: 200, unit: 'ml' });
  });
});

describe('validation and the log', () => {
  it('refuses a month that is not "YYYY-MM"', async () => {
    const client = await registerUser(app);
    for (const month of ['2026-13', '2026-1', 'oktober', '2026-10-01']) {
      const response = await call(app, 'GET', statsPath(client, month), { client });
      expect(response.statusCode, month).toBe(400);
    }
  });

  it('never logs item names', async () => {
    const client = await registerUser(app);
    const item = await createItem(app, client, { name: 'Hemmelig graviditetstest' });
    await discard(client, item, { quantityBase: 100, reason: 'other' });
    await stats(client);
    expect(log.text()).not.toContain('Hemmelig');
  });
});
