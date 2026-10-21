import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  API_ERRORS,
  type DeletePurchaseResponse,
  type PurchaseListResponse,
  type PurchaseResponse,
} from '@smartmat/shared';
import { createPurchaseRepo } from '../src/modules/purchases/repo';
import { createFakeClock } from '../src/test/fakes';
import {
  call,
  createTestApp,
  PASSWORD,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { createItem, inventoryPath, locationsOf } from './inventoryHelpers';
import {
  budgetPath,
  createPurchase,
  inventoryOf,
  milkLine,
  minceLine,
  purchasesPath,
  soapLine,
  summaryOf,
} from './purchaseHelpers';

/*
 * Phase 4 against the real test database: FR-BUD-001–005, NFR-DATA-001/002.
 * The clock is fixed at 21 October 2026, 12:00 in Norway.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
});
afterAll(() => app.close());

async function setup() {
  const client = await registerUser(app);
  const places = await locationsOf(app, client);
  return { client, ...places };
}

describe('FR-BUD-001 register a purchase', () => {
  it('with lines: the server computes the total; lines keep their order', async () => {
    const { client } = await setup();
    const purchase = await createPurchase(app, client, {
      storeName: '  Rema 1000 ',
      purchasedOn: '2026-10-20',
      lines: [milkLine, minceLine, soapLine],
    });
    expect(purchase).toMatchObject({
      storeName: 'Rema 1000',
      purchasedOn: '2026-10-20',
      totalOre: 2490 + 5990 + 3990,
      source: 'manual',
    });
    expect(purchase.lines.map((l) => [l.position, l.description, l.kind, l.categoryKey])).toEqual([
      [0, 'Lettmelk', 'food', 'dairy'],
      [1, 'Kjøttdeig', 'food', 'meat'],
      [2, 'Oppvaskmiddel', 'nonFood', null],
    ]);
    const read = await call(app, 'GET', purchasesPath(client, `/${purchase.id}`), { client });
    expect(read.json()).toEqual(purchase);
  });

  it('with only a total: no lines, and no store is fine', async () => {
    const { client } = await setup();
    const purchase = await createPurchase(app, client, {
      purchasedOn: '2026-10-21',
      totalOre: 45_000,
    });
    expect(purchase).toMatchObject({ storeName: null, totalOre: 45_000, lines: [] });
  });

  it('refuses a total sent together with lines (the total would be the client’s word against the lines)', async () => {
    const { client } = await setup();
    const response = await call(app, 'POST', purchasesPath(client), {
      client,
      body: { purchasedOn: '2026-10-21', lines: [milkLine], totalOre: 1 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      totalOre: 'validation.purchase.totalWithLines',
    });
    expect(await db.purchase.count()).toBe(0);
  });

  it('the date may be today in Norway, not tomorrow', async () => {
    const { client } = await setup();
    const tomorrow = await call(app, 'POST', purchasesPath(client), {
      client,
      body: { purchasedOn: '2026-10-22', totalOre: 100 },
    });
    expect(tomorrow.statusCode).toBe(400);
    expect(tomorrow.json().error.fields).toEqual({
      purchasedOn: 'validation.purchase.dateInFuture',
    });
    await createPurchase(app, client, { purchasedOn: '2026-10-21', totalOre: 100 });
  });

  it('"today" is Norwegian time: at 00:30 on 1 November in Norway, 1 November is allowed', async () => {
    const lateClock = createFakeClock(new Date('2026-10-31T23:30:00Z'));
    const lateApp = await createTestApp(db, { now: lateClock.now });
    try {
      const client = await registerUser(lateApp);
      const purchase = await createPurchase(lateApp, client, {
        purchasedOn: '2026-11-01',
        totalOre: 100,
      });
      expect(purchase.purchasedOn).toBe('2026-11-01');
      expect((await summaryOf(lateApp, client)).month).toBe('2026-11');
    } finally {
      await lateApp.close();
    }
  });

  it('error responses do not repeat what was typed (NFR-SEC-004)', async () => {
    const { client } = await setup();
    const secret = 'Apotek 1 Hemmeligveien 7';
    const response = await call(app, 'POST', purchasesPath(client), {
      client,
      body: { storeName: secret.repeat(5), purchasedOn: '2026-10-21', totalOre: 100 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('Hemmeligveien');
  });
});

describe('NFR-DATA-002 the same form sent twice gives one purchase', () => {
  it('a repeated client request id answers 200 with the first purchase', async () => {
    const { client } = await setup();
    const body = { purchasedOn: '2026-10-21', totalOre: 12_345, clientRequestId: randomUUID() };
    const first = await call(app, 'POST', purchasesPath(client), { client, body });
    const second = await call(app, 'POST', purchasesPath(client), { client, body });
    expect([first.statusCode, second.statusCode]).toEqual([201, 200]);
    expect(second.json().id).toBe(first.json().id);
    expect(await db.purchase.count()).toBe(1);
  });

  it('also when the requests arrive at the same moment (unique key in the database)', async () => {
    const { client, fridge } = await setup();
    const body = {
      purchasedOn: '2026-10-21',
      clientRequestId: randomUUID(),
      lines: [
        {
          ...milkLine,
          toInventory: { unit: 'ml', quantityBase: 1000, locationId: fridge },
        },
      ],
    };
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => call(app, 'POST', purchasesPath(client), { client, body })),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => r.json().id)).size).toBe(1);
    expect(await db.purchase.count()).toBe(1);
    // The losers' transactions were rolled back completely: one batch, one item.
    expect(await db.inventoryBatch.count()).toBe(1);
    expect(await db.inventoryItem.count()).toBe(1);
  });

  it('the same id in another household is a different purchase', async () => {
    const a = await setup();
    const b = await setup();
    const body = { purchasedOn: '2026-10-21', totalOre: 100, clientRequestId: randomUUID() };
    await createPurchase(app, a.client, body);
    await createPurchase(app, b.client, body);
    expect(await db.purchase.count()).toBe(2);
  });
});

describe('FR-BUD-002 from purchase to inventory, in one transaction', () => {
  it('a food line becomes a new item with a batch: price from the line, date from the purchase', async () => {
    const { client, fridge } = await setup();
    const purchase = await createPurchase(app, client, {
      storeName: 'Kiwi',
      purchasedOn: '2026-10-20',
      lines: [
        {
          ...milkLine,
          toInventory: {
            unit: 'ml',
            quantityBase: 1750,
            locationId: fridge,
            expiry: { kind: 'best_before', date: '2026-10-28' },
          },
        },
        soapLine,
      ],
    });
    const items = await inventoryOf(app, client);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Lettmelk', categoryKey: 'dairy', unit: 'ml' });
    expect(items[0]!.batches[0]).toMatchObject({
      quantityBase: 1750,
      locationId: fridge,
      expiryKind: 'best_before',
      expiryDate: '2026-10-28',
      priceOre: 2490,
      purchasedOn: '2026-10-20',
      purchaseId: purchase.id,
    });
    expect(purchase.lines[0]!.batch).toEqual({
      id: items[0]!.batches[0]!.id,
      itemId: items[0]!.id,
      itemName: 'Lettmelk',
      untouched: true,
    });
    expect(purchase.lines[1]!.batch).toBeNull();
    const history = await call(
      app,
      'GET',
      inventoryPath(client, `/items/${items[0]!.id}/history`),
      {
        client,
      },
    );
    expect(history.json().events.map((e: { type: string }) => e.type)).toEqual(['add']);
  });

  it('onto an existing item: a new batch in the item’s own unit', async () => {
    const { client, pantry } = await setup();
    const rice = await createItem(app, client, { name: 'Ris', unit: 'g', quantityBase: 200 });
    await createPurchase(app, client, {
      purchasedOn: '2026-10-21',
      lines: [
        {
          description: 'Jasminris 1 kg',
          kind: 'food',
          categoryKey: 'dryGoods',
          amountOre: 3490,
          toInventory: { itemId: rice.id, quantityBase: 1000, locationId: pantry },
        },
      ],
    });
    const items = await inventoryOf(app, client);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Ris');
    expect(items[0]!.batches.map((b) => b.quantityBase).sort()).toEqual([1000, 200]);
  });

  it('a place from another household: 400 on that field, and NOTHING is saved', async () => {
    const { client, fridge } = await setup();
    const other = await setup();
    const response = await call(app, 'POST', purchasesPath(client), {
      client,
      body: {
        purchasedOn: '2026-10-21',
        lines: [
          { ...milkLine, toInventory: { unit: 'ml', quantityBase: 1000, locationId: fridge } },
          { ...minceLine, toInventory: { unit: 'g', quantityBase: 400, locationId: other.fridge } },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'lines.1.toInventory.locationId': 'validation.location.notFound',
    });
    expect(await db.purchase.count()).toBe(0);
    expect(await db.inventoryItem.count()).toBe(0);
  });

  it('an item from another household: 400, nothing saved', async () => {
    const { client, fridge } = await setup();
    const other = await setup();
    const theirs = await createItem(app, other.client);
    const response = await call(app, 'POST', purchasesPath(client), {
      client,
      body: {
        purchasedOn: '2026-10-21',
        lines: [
          { ...milkLine, toInventory: { itemId: theirs.id, quantityBase: 1, locationId: fridge } },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'lines.0.toInventory.itemId': 'validation.purchase.itemNotFound',
    });
    expect(await db.purchase.count()).toBe(0);
    expect(await db.inventoryBatch.count()).toBe(1); // only theirs
  });

  it('ADR-0007: when a write fails half-way, the purchase and the lines before it are rolled back', async () => {
    // Straight to the repo, past the service's checks: the second line's place does not exist, so the
    // database refuses the batch after the purchase, the first line and its batch were already written.
    const { client, fridge } = await setup();
    const repo = createPurchaseRepo(db);
    const batch = (locationId: string) => ({
      quantityBase: 1,
      locationId,
      expiryKind: null,
      expiryDate: null,
      priceOre: 100,
      purchasedOn: '2026-10-21',
    });
    const line = (position: number, locationId: string) => ({
      position,
      description: `Vare ${position}`,
      kind: 'food' as const,
      categoryKey: 'other' as const,
      amountOre: 100,
      toInventory: {
        itemId: null,
        newItem: { name: `Vare ${position}`, categoryKey: 'other' as const, unit: 'stk' as const },
        batch: batch(locationId),
      },
    });
    await expect(
      repo.create(
        client.user.householdId,
        client.user.id,
        {
          storeName: null,
          purchasedOn: '2026-10-21',
          totalOre: 200,
          lines: [line(0, fridge), line(1, randomUUID())],
        },
        null,
      ),
    ).rejects.toThrow();
    expect(await db.purchase.count()).toBe(0);
    expect(await db.purchaseLine.count()).toBe(0);
    expect(await db.inventoryItem.count()).toBe(0);
    expect(await db.inventoryBatch.count()).toBe(0);
    expect(await db.inventoryEvent.count()).toBe(0);
  });
});

describe('FR-BUD-003 monthly food budget', () => {
  it('none at first; set it; it applies from the first of the current month', async () => {
    const { client } = await setup();
    const empty = await call(app, 'GET', budgetPath(client), { client });
    expect(empty.json()).toEqual({ amountOre: null, validFrom: null });
    const set = await call(app, 'PUT', budgetPath(client), {
      client,
      body: { amountOre: 500_000 },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({ amountOre: 500_000, validFrom: '2026-10-01' });
    expect((await summaryOf(app, client)).budgetOre).toBe(500_000);
  });

  it('limits: 1 kr – 1 000 000 kr in whole øre', async () => {
    const { client } = await setup();
    for (const [amountOre, message] of [
      [0, 'validation.budget.tooSmall'],
      [100_000_001, 'validation.budget.tooLarge'],
      [4999.5, 'validation.ore.integer'],
    ] as const) {
      const response = await call(app, 'PUT', budgetPath(client), { client, body: { amountOre } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.fields).toEqual({ amountOre: message });
    }
  });

  it('decision 4: changing the budget does not rewrite earlier months', async () => {
    const monthClock = createFakeClock(new Date('2026-10-15T10:00:00Z'));
    const monthApp = await createTestApp(db, { now: monthClock.now });
    try {
      const client = await registerUser(monthApp);
      const put = (amountOre: number | null) =>
        call(monthApp, 'PUT', budgetPath(client), { client, body: { amountOre } });
      await put(400_000);
      await put(500_000); // same month: replaces October's value
      // To 4 November in two steps: a session expires after 14 days without use (phase 2).
      monthClock.advance(10 * 24 * 3600_000);
      expect((await summaryOf(monthApp, client)).budgetOre).toBe(500_000);
      monthClock.advance(10 * 24 * 3600_000);
      await put(600_000);
      expect((await summaryOf(monthApp, client, '2026-09')).budgetOre).toBeNull();
      expect((await summaryOf(monthApp, client, '2026-10')).budgetOre).toBe(500_000);
      expect((await summaryOf(monthApp, client, '2026-11')).budgetOre).toBe(600_000);
      expect((await summaryOf(monthApp, client, '2027-03')).budgetOre).toBe(600_000);
      await put(null); // removed from November on
      expect((await summaryOf(monthApp, client, '2026-11')).budgetOre).toBeNull();
      expect((await summaryOf(monthApp, client, '2026-10')).budgetOre).toBe(500_000);
      expect((await call(monthApp, 'GET', budgetPath(client), { client })).json()).toEqual({
        amountOre: null,
        validFrom: null,
      });
    } finally {
      await monthApp.close();
    }
  });
});

describe('FR-BUD-004 the month’s figures', () => {
  async function seedMonth() {
    const ctx = await setup();
    const { client } = ctx;
    await call(app, 'PUT', budgetPath(client), { client, body: { amountOre: 400_000 } });
    // September 30 and November are outside October; October 1 and 21 are inside.
    await createPurchase(app, client, { purchasedOn: '2026-09-30', totalOre: 99_900 });
    await createPurchase(app, client, {
      storeName: 'Rema 1000',
      purchasedOn: '2026-10-01',
      lines: [
        milkLine,
        minceLine,
        soapLine,
        { ...milkLine, description: 'Yoghurt', amountOre: 1990 },
      ],
    });
    await createPurchase(app, client, { purchasedOn: '2026-10-21', totalOre: 25_050 });
    return ctx;
  }

  it('spent = food lines + purchases with only a total; non-food is separate', async () => {
    const { client } = await seedMonth();
    const summary = await summaryOf(app, client);
    expect(summary).toEqual({
      month: '2026-10',
      budgetOre: 400_000,
      spentOre: 2490 + 5990 + 1990 + 25_050,
      remainingOre: 400_000 - 35_520,
      usedPercent: 8, // 8,88 % rounded down
      byCategory: [
        { categoryKey: 'meat', amountOre: 5990 },
        { categoryKey: 'dairy', amountOre: 4480 },
      ],
      unallocatedOre: 25_050,
      nonFoodOre: 3990,
      purchaseCount: 2,
    });
  });

  it('check sum: spent + non-food = the sum of the month’s purchase totals', async () => {
    const { client } = await seedMonth();
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      const summary = await summaryOf(app, client, month);
      const list = (
        await call(app, 'GET', purchasesPath(client, `?month=${month}`), { client })
      ).json<PurchaseListResponse>();
      const totals = list.purchases.reduce((sum, p) => sum + p.totalOre, 0);
      expect(summary.spentOre + summary.nonFoodOre, month).toBe(totals);
      expect(summary.purchaseCount, month).toBe(list.purchases.length);
    }
  });

  it('the list: latest date first, with number of lines and batches', async () => {
    const { client, fridge } = await seedMonth();
    await createPurchase(app, client, {
      purchasedOn: '2026-10-10',
      lines: [{ ...milkLine, toInventory: { unit: 'ml', quantityBase: 1000, locationId: fridge } }],
    });
    const list = (
      await call(app, 'GET', purchasesPath(client), { client })
    ).json<PurchaseListResponse>();
    expect(list.month).toBe('2026-10');
    expect(list.purchases.map((p) => [p.purchasedOn, p.lineCount, p.batchCount])).toEqual([
      ['2026-10-21', 0, 0],
      ['2026-10-10', 1, 1],
      ['2026-10-01', 4, 0],
    ]);
  });

  it('an invalid month is a 400', async () => {
    const { client } = await setup();
    for (const path of [
      budgetPath(client, '/summary?month=2026-13'),
      purchasesPath(client, '?month=okt'),
    ]) {
      const response = await call(app, 'GET', path, { client });
      expect(response.statusCode, path).toBe(400);
      expect(response.json().error.fields).toEqual({ month: 'validation.month.invalid' });
    }
  });
});

describe('FR-BUD-005 correcting and deleting update every figure', () => {
  async function seedLinked() {
    const ctx = await setup();
    const purchase = await createPurchase(app, ctx.client, {
      storeName: 'Coop Extra',
      purchasedOn: '2026-10-20',
      lines: [
        { ...milkLine, toInventory: { unit: 'ml', quantityBase: 1000, locationId: ctx.fridge } },
        { ...minceLine, toInventory: { unit: 'g', quantityBase: 400, locationId: ctx.fridge } },
        soapLine,
      ],
    });
    return { ...ctx, purchase };
  }

  const asInput = (p: PurchaseResponse) =>
    p.lines.map(({ id, description, kind, categoryKey, amountOre }) => ({
      id,
      description,
      kind,
      ...(categoryKey ? { categoryKey } : {}),
      amountOre,
    }));

  async function put(client: Client, purchaseId: string, body: Record<string, unknown>) {
    return call(app, 'PUT', purchasesPath(client, `/${purchaseId}`), { client, body });
  }

  it('a new amount and date: total, summary and the linked batch follow', async () => {
    const { client, purchase } = await seedLinked();
    const lines = asInput(purchase);
    lines[0]!.amountOre = 2990;
    const response = await put(client, purchase.id, { purchasedOn: '2026-10-19', lines });
    expect(response.statusCode, response.body).toBe(200);
    const updated = response.json<PurchaseResponse>();
    expect(updated.totalOre).toBe(2990 + 5990 + 3990);
    expect(updated.lines.map((l) => l.id)).toEqual(purchase.lines.map((l) => l.id));
    expect((await summaryOf(app, client)).spentOre).toBe(2990 + 5990);
    const milk = (await inventoryOf(app, client)).find((i) => i.name === 'Lettmelk')!;
    expect(milk.batches[0]).toMatchObject({ priceOre: 2990, purchasedOn: '2026-10-19' });
  });

  it('waste already registered keeps its value; later discards use the new price', async () => {
    const { client, purchase } = await seedLinked();
    const milkBatch = purchase.lines[0]!.batch!.id;
    const discard = () =>
      call(app, 'POST', inventoryPath(client, `/batches/${milkBatch}/discard`), {
        client,
        body: { quantityBase: 500, reason: 'spoiled' },
      });
    await discard(); // half of 24,90 kr → 12,45 kr
    const lines = asInput(purchase);
    lines[0]!.amountOre = 4000;
    await put(client, purchase.id, { purchasedOn: '2026-10-20', lines });
    await discard(); // half of 40,00 kr → 20,00 kr
    const events = await db.inventoryEvent.findMany({
      where: { batchId: milkBatch, type: 'discard' },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((e) => e.wasteValueOre)).toEqual([1245, 2000]);
  });

  it('decision 2: a removed line takes an untouched batch (and the item it created) with it', async () => {
    const { client, purchase } = await seedLinked();
    const response = await put(client, purchase.id, {
      purchasedOn: '2026-10-20',
      lines: asInput(purchase).filter((l) => l.description !== 'Kjøttdeig'),
    });
    expect(response.statusCode).toBe(200);
    expect((await inventoryOf(app, client)).map((i) => i.name)).toEqual(['Lettmelk']);
    expect(await db.inventoryEvent.count({ where: { householdId: client.user.householdId } })).toBe(
      1,
    );
  });

  it('decision 2: a batch that has been used stays, with its history, but loses the link', async () => {
    const { client, purchase } = await seedLinked();
    const mince = purchase.lines[1]!.batch!;
    await call(app, 'POST', inventoryPath(client, `/batches/${mince.id}/consume`), {
      client,
      body: { quantityBase: 100 },
    });
    const response = await put(client, purchase.id, {
      purchasedOn: '2026-10-20',
      lines: asInput(purchase).filter((l) => l.description !== 'Kjøttdeig'),
    });
    expect(response.statusCode).toBe(200);
    const item = (await inventoryOf(app, client)).find((i) => i.name === 'Kjøttdeig')!;
    expect(item.batches[0]).toMatchObject({ quantityBase: 300, priceOre: 5990, purchaseId: null });
    expect(await db.inventoryEvent.count({ where: { batchId: mince.id } })).toBe(2);
  });

  it('the user can keep untouched batches when removing a line', async () => {
    const { client, purchase } = await seedLinked();
    await put(client, purchase.id, {
      purchasedOn: '2026-10-20',
      lines: asInput(purchase).filter((l) => l.description !== 'Kjøttdeig'),
      removeUntouchedBatches: false,
    });
    const item = (await inventoryOf(app, client)).find((i) => i.name === 'Kjøttdeig')!;
    expect(item.batches[0]).toMatchObject({ quantityBase: 400, purchaseId: null });
  });

  it('a line changed to non-food keeps its batch in the inventory, unlinked', async () => {
    const { client, purchase } = await seedLinked();
    const lines = asInput(purchase).map((l) =>
      l.description === 'Lettmelk'
        ? { id: l.id, description: 'Melk (gave)', kind: 'nonFood', amountOre: 2490 }
        : l,
    );
    const updated = (
      await put(client, purchase.id, { purchasedOn: '2026-10-20', lines })
    ).json<PurchaseResponse>();
    expect(updated.lines[0]).toMatchObject({ kind: 'nonFood', categoryKey: null, batch: null });
    const milk = (await inventoryOf(app, client)).find((i) => i.name === 'Lettmelk')!;
    expect(milk.batches[0]!.purchaseId).toBeNull();
  });

  it('new lines can be added and put into the inventory; a line already there cannot be added twice', async () => {
    const { client, fridge, purchase } = await seedLinked();
    const ok = await put(client, purchase.id, {
      purchasedOn: '2026-10-20',
      lines: [
        ...asInput(purchase),
        {
          description: 'Smør',
          kind: 'food',
          categoryKey: 'dairy',
          amountOre: 4590,
          toInventory: { unit: 'g', quantityBase: 500, locationId: fridge },
        },
      ],
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json<PurchaseResponse>().lines[3]!.batch?.itemName).toBe('Smør');

    const lines = asInput(purchase);
    const twice = await put(client, purchase.id, {
      purchasedOn: '2026-10-20',
      lines: [
        { ...lines[0], toInventory: { unit: 'ml', quantityBase: 1, locationId: fridge } },
        ...lines.slice(1),
      ],
    });
    expect(twice.statusCode).toBe(400);
    expect(twice.json().error.fields).toEqual({
      'lines.0.toInventory': 'validation.purchase.alreadyInInventory',
    });
  });

  it('from lines to only a total: the lines go, the summary shows it as not allocated', async () => {
    const { client, purchase } = await seedLinked();
    const response = await put(client, purchase.id, {
      purchasedOn: '2026-10-20',
      totalOre: 10_000,
    });
    expect(response.json()).toMatchObject({ totalOre: 10_000, lines: [] });
    const summary = await summaryOf(app, client);
    expect(summary).toMatchObject({
      spentOre: 10_000,
      unallocatedOre: 10_000,
      nonFoodOre: 0,
      byCategory: [],
    });
    expect(await inventoryOf(app, client)).toEqual([]);
  });

  it('a line id that is not one of this purchase’s lines is refused, and nothing changes', async () => {
    const { client, purchase } = await seedLinked();
    const other = await createPurchase(app, client, {
      purchasedOn: '2026-10-20',
      lines: [milkLine],
    });
    const before = await call(app, 'GET', purchasesPath(client, `/${purchase.id}`), { client });
    const response = await put(client, purchase.id, {
      purchasedOn: '2026-10-20',
      lines: [{ ...milkLine, id: other.lines[0]!.id }],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'lines.0.id': 'validation.purchase.unknownLine',
    });
    const after = await call(app, 'GET', purchasesPath(client, `/${purchase.id}`), { client });
    expect(after.json()).toEqual(before.json());
  });

  it('delete: untouched batches go, used ones stay; the summary drops the purchase', async () => {
    const { client, purchase } = await seedLinked();
    await call(
      app,
      'POST',
      inventoryPath(client, `/batches/${purchase.lines[1]!.batch!.id}/consume`),
      {
        client,
        body: { quantityBase: 400 },
      },
    );
    const response = await call(app, 'DELETE', purchasesPath(client, `/${purchase.id}`), {
      client,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<DeletePurchaseResponse>()).toEqual({ removedBatches: 1, keptBatches: 1 });
    expect(await db.purchaseLine.count()).toBe(0);
    expect((await summaryOf(app, client)).spentOre).toBe(0);
    // The used-up mince is kept (hidden as empty), with its history.
    const items = await inventoryOf(app, client);
    expect(items.map((i) => [i.name, i.batches.length])).toEqual([['Kjøttdeig', 0]]);
    const gone = await call(app, 'GET', purchasesPath(client, `/${purchase.id}`), { client });
    expect(gone.statusCode).toBe(404);
  });

  it('a batch that was only moved is not untouched: it stays when the purchase is deleted', async () => {
    const { client, pantry, purchase } = await seedLinked();
    const milk = purchase.lines[0]!.batch!;
    const moved = await call(app, 'PATCH', inventoryPath(client, `/batches/${milk.id}`), {
      client,
      body: { locationId: pantry },
    });
    expect(moved.statusCode).toBe(200);
    const response = await call(app, 'DELETE', purchasesPath(client, `/${purchase.id}`), {
      client,
    });
    // The mince is untouched and goes; the milk has the same quantity but a "move" event, so it stays.
    expect(response.json()).toEqual({ removedBatches: 1, keptBatches: 1 });
    const kept = await db.inventoryBatch.findUnique({ where: { id: milk.id } });
    expect(kept).toMatchObject({ quantityBase: 1000, locationId: pantry, purchaseLineId: null });
  });

  it('delete with removeUntouchedBatches=false keeps every batch', async () => {
    const { client, purchase } = await seedLinked();
    const response = await call(
      app,
      'DELETE',
      purchasesPath(client, `/${purchase.id}?removeUntouchedBatches=false`),
      { client },
    );
    expect(response.json()).toEqual({ removedBatches: 0, keptBatches: 2 });
    const items = await inventoryOf(app, client);
    expect(items.flatMap((i) => i.batches.map((b) => b.purchaseId))).toEqual([null, null]);
  });

  it('delete and use at the same moment: the batch is either removed or kept with the use – never lost', async () => {
    for (let round = 0; round < 8; round++) {
      const { client, purchase } = await seedLinked();
      const milk = purchase.lines[0]!.batch!;
      const [, consumed] = await Promise.all([
        call(app, 'DELETE', purchasesPath(client, `/${purchase.id}`), { client }),
        call(app, 'POST', inventoryPath(client, `/batches/${milk.id}/consume`), {
          client,
          body: { quantityBase: 250 },
        }),
      ]);
      const batch = await db.inventoryBatch.findUnique({ where: { id: milk.id } });
      if (consumed.statusCode === 200) {
        // The use happened first: the batch is no longer untouched and must still be there.
        expect(batch, `round ${round}`).toMatchObject({ quantityBase: 750, purchaseLineId: null });
      } else {
        expect(batch, `round ${round}`).toBeNull();
        expect([404, 409]).toContain(consumed.statusCode);
      }
    }
  });
});

describe('database rules (CHECK) behind the API', () => {
  it('refuses rows the API would never write', async () => {
    const { client } = await setup();
    const householdId = client.user.householdId;
    const purchase = await createPurchase(app, client, {
      purchasedOn: '2026-10-21',
      totalOre: 100,
    });
    const line = {
      householdId,
      purchaseId: purchase.id,
      position: 0,
      description: 'x',
      amountOre: 1,
    };
    await expect(
      db.purchase.create({
        data: { householdId, purchasedOn: new Date('2026-10-21'), totalOre: 100_000_001 },
      }),
    ).rejects.toThrow();
    await expect(
      db.purchase.create({
        data: { householdId, purchasedOn: new Date('2026-10-21'), totalOre: 1, currency: 'SEK' },
      }),
    ).rejects.toThrow();
    await expect(db.purchaseLine.create({ data: { ...line, kind: 'food' } })).rejects.toThrow();
    await expect(
      db.purchaseLine.create({ data: { ...line, kind: 'nonFood', categoryKey: 'dairy' } }),
    ).rejects.toThrow();
    await expect(
      db.purchaseLine.create({ data: { ...line, kind: 'nonFood', amountOre: -1 } }),
    ).rejects.toThrow();
    await expect(
      db.foodBudget.create({
        data: { householdId, validFrom: new Date('2026-10-02'), amountOre: 100 },
      }),
    ).rejects.toThrow();
  });

  it('a line cannot point to a purchase in another household (composite foreign key)', async () => {
    const a = await setup();
    const b = await setup();
    const theirs = await createPurchase(app, b.client, {
      purchasedOn: '2026-10-21',
      totalOre: 100,
    });
    await expect(
      db.purchaseLine.create({
        data: {
          householdId: a.client.user.householdId,
          purchaseId: theirs.id,
          position: 0,
          description: 'x',
          kind: 'nonFood',
          amountOre: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it('deleting the account deletes the household’s purchases, lines and budget', async () => {
    const { client, fridge } = await setup();
    await call(app, 'PUT', budgetPath(client), { client, body: { amountOre: 500_000 } });
    await createPurchase(app, client, {
      purchasedOn: '2026-10-21',
      lines: [{ ...milkLine, toInventory: { unit: 'ml', quantityBase: 1, locationId: fridge } }],
    });
    const response = await call(app, 'DELETE', '/me', { client, body: { password: PASSWORD } });
    expect(response.statusCode).toBe(204);
    expect(await db.purchase.count()).toBe(0);
    expect(await db.purchaseLine.count()).toBe(0);
    expect(await db.foodBudget.count()).toBe(0);
    expect(await db.inventoryBatch.count()).toBe(0);
  });

  it('an unknown purchase is a 404 with the usual body', async () => {
    const { client } = await setup();
    const response = await call(app, 'GET', purchasesPath(client, `/${randomUUID()}`), { client });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: API_ERRORS.notFound } });
  });
});
