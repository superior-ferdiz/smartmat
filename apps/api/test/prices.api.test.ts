import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { osloDate, type RecipePriceEstimate } from '@smartmat/shared';
import { createPriceRepo } from '../src/modules/prices/repo';
import {
  STORE_CODE,
  clearProductCache,
  confirmBody,
  confirmCode,
  fakeOffFetch,
  testBarcodeProvider,
  type ConfirmScanResponse,
} from './barcodeHelpers';
import {
  call,
  captureLog,
  createTestApp,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { createItem, locationsOf } from './inventoryHelpers';
import {
  FAKE_KASSALAPP_KEY,
  LIST_FORMAT,
  NO_PRICES,
  PRICED,
  SLOW,
  UNKNOWN,
  barcodePrices,
  clearPriceCache,
  estimatePath,
  fakeKassalappFetch,
  itemPrices,
  itemPricesPath,
  pricesPath,
  shoppingEstimate,
  switchable,
  testPriceProvider,
} from './priceHelpers';
import { budgetPath, createPurchase, milkLine } from './purchaseHelpers';
import { createOwnRecipe, ingredientIdsByKey, ownRecipeBody } from './recipeHelpers';
import { addLine, shoppingPath } from './shoppingHelpers';

/*
 * Spec 12 against the test database: FR-PRICE-001–006 and NFR-REL-001. Kassalapp is the fake in fakeKassalapp.ts
 * (made-up prices, made-up key), used with the real provider and a fake clock.
 */

const db = useTestDatabase();
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** Reset to the real time before each test: batches get created_at from the database clock. */
let current = Date.now();
const clock = {
  now: () => new Date(current),
  advance(ms: number) {
    current += ms;
  },
};
const kassalapp = fakeKassalappFetch(clock.now);
const net = switchable(kassalapp.fetchFn as typeof fetch);
const log = captureLog();
let app: FastifyInstance;
let kari: Client;

beforeAll(async () => {
  app = await createTestApp(db, {
    now: clock.now,
    logStream: log.stream,
    config: { logLevel: 'info' },
    barcodeProvider: testBarcodeProvider(fakeOffFetch().fetchFn as typeof fetch, clock.now),
    priceProvider: testPriceProvider(net.fetchFn, clock.now),
  });
});
afterAll(() => app.close());

beforeEach(async () => {
  current = Date.now();
  await clearPriceCache(db);
  await clearProductCache(db);
  net.state.down = false;
  kassalapp.calls.length = 0;
  kari = await registerUser(app, { displayName: 'Kari' });
});

const today = () => osloDate(clock.now());

/** Scans `gtin` into the inventory as a new item, with an optional price on the batch. */
async function scanIn(
  client: Client,
  gtin: string,
  overrides: Record<string, unknown> = {},
  priceOre: number | null = null,
) {
  const { fridge } = await locationsOf(app, client);
  const body = confirmBody(fridge, overrides);
  const response = await confirmCode(app, client, gtin, {
    ...body,
    batch: { ...(body.batch as object), priceOre },
  });
  if (response.statusCode !== 201) throw new Error(`scan failed: ${response.body}`);
  return response.json<ConfirmScanResponse>().item;
}

describe('FR-PRICE-001 external prices for a scanned barcode', () => {
  it('shows each chain with price, unit price and date; fresh first, then old and uncollected ones', async () => {
    const prices = await barcodePrices(app, kari, PRICED);
    expect(prices.external.status).toBe('found');
    expect(prices.external.fetchedAt).toBe(clock.now().toISOString());
    expect(
      prices.external.observations.map((o) => [
        o.chainCode,
        o.priceOre,
        o.fresh,
        o.stale,
        o.uncollected,
      ]),
    ).toEqual([
      ['SPAR_NO', 2490, true, false, false],
      ['MENY_NO', 2690, true, false, false],
      ['ODA_NO', 1990, false, true, false], // 20 days old
      ['KIWI', 1790, false, true, true], // 2024, Kassalapp no longer collects Kiwi
    ]);
    expect(prices.external.observations[0]).toMatchObject({
      source: 'kassalapp',
      chainName: 'Spar',
      packageQuantityBase: 1000,
      packageUnit: 'ml',
      unitPrice: { ore: 2490, per: 'l' },
      sourceUrl: 'https://kassal.app/vare/1-testmeieriet-lettmelk-spar_no',
    });
    expect(prices.external.freshCount).toBe(2);
  });

  it('FR-PRICE-004: the cheapest is among fresh prices only (not the old Oda or Kiwi prices)', async () => {
    const prices = await barcodePrices(app, kari, PRICED);
    expect(prices.external.cheapest).toMatchObject({ chainCode: 'SPAR_NO', priceOre: 2490 });
  });

  it('found without any priced chain', async () => {
    const prices = await barcodePrices(app, kari, NO_PRICES);
    expect(prices.external).toMatchObject({
      status: 'found',
      observations: [],
      cheapest: null,
      freshCount: 0,
    });
  });

  it('not found', async () => {
    expect((await barcodePrices(app, kari, UNKNOWN)).external.status).toBe('notFound');
  });

  it('a store’s own code is never sent to Kassalapp', async () => {
    const prices = await barcodePrices(app, kari, STORE_CODE);
    expect(prices).toMatchObject({ storeCode: true, external: { status: 'notAsked' } });
    expect(kassalapp.calls).toHaveLength(0);
  });

  it('an invalid code is a 400 on gtin, and nothing is asked', async () => {
    const response = await call(app, 'GET', pricesPath(kari, '7038010000738'), { client: kari });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({ gtin: 'validation.barcode.checkDigit' });
    expect(kassalapp.calls).toHaveLength(0);
  });
});

describe('spec 12 the six-hour cache', () => {
  it('asks Kassalapp once in six hours, for every household', async () => {
    const ola = await registerUser(app, { displayName: 'Ola' });
    await barcodePrices(app, kari, PRICED);
    await barcodePrices(app, ola, PRICED);
    clock.advance(6 * HOUR - 1);
    await barcodePrices(app, kari, PRICED);
    expect(kassalapp.asked()).toEqual([PRICED]);
    clock.advance(1);
    const again = await barcodePrices(app, kari, PRICED);
    expect(kassalapp.asked()).toEqual([PRICED, PRICED]);
    expect(again.external.fetchedAt).toBe(clock.now().toISOString());
  });

  it('“not found” is cached too', async () => {
    await barcodePrices(app, kari, UNKNOWN);
    await barcodePrices(app, kari, UNKNOWN);
    expect(kassalapp.asked()).toEqual([UNKNOWN]);
  });

  it('a new answer replaces what was stored (one row per chain, never duplicates)', async () => {
    await barcodePrices(app, kari, PRICED);
    clock.advance(7 * HOUR);
    await barcodePrices(app, kari, PRICED);
    expect(await db.priceObservation.count({ where: { gtin: PRICED } })).toBe(4);
    expect(await db.priceLookup.count()).toBe(1);
  });
});

describe('spec 12 requests at the same moment', () => {
  it('10 at once for the same barcode: one call to Kassalapp, all answer 200, one row per chain', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        call(app, 'GET', pricesPath(kari, PRICED), { client: kari }),
      ),
    );
    expect(responses.map((r) => r.statusCode)).toEqual(Array(10).fill(200));
    expect(kassalapp.asked()).toEqual([PRICED]);
    expect(await db.priceObservation.count({ where: { gtin: PRICED } })).toBe(4);
  });

  it('two servers saving the same answer at once: the second save is dropped, not an error', async () => {
    const repo = createPriceRepo(db);
    const observation = {
      chainCode: 'MENY_NO',
      chainName: 'Meny',
      priceOre: 2490,
      packageQuantityBase: 1000,
      packageUnit: 'ml' as const,
      observedAt: clock.now(),
      sourceUrl: null,
    };
    for (let round = 0; round < 5; round++) {
      await expect(
        Promise.all(
          Array.from({ length: 5 }, () =>
            repo.saveFound('kassalapp', PRICED, [observation], clock.now()),
          ),
        ),
      ).resolves.toBeDefined();
    }
    expect(await db.priceObservation.count()).toBe(1);
    expect(await db.priceLookup.count()).toBe(1);
  });
});

describe('NFR-REL-001 when Kassalapp is down', () => {
  it('a timeout gives “unavailable”, and nothing is stored', async () => {
    const prices = await barcodePrices(app, kari, SLOW);
    expect(prices.external).toMatchObject({
      status: 'unavailable',
      observations: [],
      fetchedAt: null,
    });
    expect(await db.priceLookup.count()).toBe(0);
    expect(await db.priceObservation.count()).toBe(0);
  });

  it('after the cache has run out, stored prices are shown with their date and status “unavailable”', async () => {
    const first = await barcodePrices(app, kari, PRICED);
    clock.advance(7 * HOUR);
    net.state.down = true;
    const down = await barcodePrices(app, kari, PRICED);
    expect(down.external.status).toBe('unavailable');
    expect(down.external.fetchedAt).toBe(first.external.fetchedAt);
    expect(down.external.observations).toHaveLength(4);
  });

  it('stored prices older than 30 days are not shown', async () => {
    await barcodePrices(app, kari, PRICED);
    net.state.down = true;
    clock.advance(30 * DAY + 1);
    // Sessions last at most 30 days: a new user (the stored prices are global anyway).
    const later = await registerUser(app);
    const down = await barcodePrices(app, later, PRICED);
    expect(down.external).toMatchObject({ status: 'unavailable', observations: [] });
  });

  it('without a key: status “off”, no request at all, and own prices still work', async () => {
    const plain = await createTestApp(db);
    try {
      const item = await createItem(plain, kari, { priceOre: 2490 });
      expect((await barcodePrices(plain, kari, PRICED)).external.status).toBe('off');
      const forItem = await itemPrices(plain, kari, item.id);
      expect(forItem.own.entries).toHaveLength(1);
      expect(kassalapp.calls).toHaveLength(0);
    } finally {
      await plain.close();
    }
  });

  it('over the per-user limit: external prices are “unavailable”, the page still answers 200', async () => {
    const limited = await createTestApp(db, {
      now: clock.now,
      config: { prices: { ...testPricesConfig(), lookupsPerUserPerMinute: 2 } },
      priceProvider: testPriceProvider(net.fetchFn, clock.now),
    });
    try {
      await barcodePrices(limited, kari, PRICED);
      await barcodePrices(limited, kari, NO_PRICES);
      const third = await call(limited, 'GET', pricesPath(kari, LIST_FORMAT), { client: kari });
      expect(third.statusCode).toBe(200);
      expect(third.json()).toMatchObject({ external: { status: 'unavailable' } });
      // A cached answer does not count against the limit.
      expect((await barcodePrices(limited, kari, PRICED)).external.status).toBe('found');
      expect(kassalapp.asked()).toEqual([PRICED, NO_PRICES]);
    } finally {
      await limited.close();
    }
  });
});

function testPricesConfig() {
  return {
    kassalappBaseUrl: 'https://kassal.app/api/v1',
    kassalappApiKey: null,
    kassalappTimeoutMs: 3000,
    kassalappMaxPerMinute: 30,
    lookupsPerUserPerMinute: 1000,
  };
}

describe('FR-PRICE-002 own prices', () => {
  it('the scan page shows what the household paid for the item it put the barcode on', async () => {
    const item = await scanIn(kari, PRICED, {}, 2490);
    const { fridge } = await locationsOf(app, kari);
    const purchase = await createPurchase(app, kari, {
      storeName: 'Testbutikken',
      purchasedOn: today(),
      lines: [
        {
          ...milkLine,
          amountOre: 2690,
          toInventory: { itemId: item.id, quantityBase: 1000, locationId: fridge },
        },
      ],
    });

    const prices = await barcodePrices(app, kari, PRICED);
    expect(prices.own.item).toEqual({ id: item.id, name: 'Testmeieriet Lettmelk 1 %' });
    expect(prices.own.entries).toHaveLength(2);
    expect(prices.own.entries[0]).toMatchObject({
      priceOre: 2690,
      quantityBase: 1000,
      unit: 'ml',
      unitPrice: { ore: 2690, per: 'l' },
      date: today(),
      old: false,
      origin: 'purchase',
      storeName: 'Testbutikken',
      purchaseId: purchase.id,
    });
    expect(prices.own.entries[1]).toMatchObject({
      priceOre: 2490,
      origin: 'item',
      storeName: null,
    });
    // Own and external prices are separate lists.
    expect(prices.external.observations.every((o) => o.source === 'kassalapp')).toBe(true);
  });

  it('a used-up batch keeps its price in the list; batches without a price are not there', async () => {
    const item = await createItem(app, kari, {
      priceOre: 3990,
      quantityBase: 500,
      unit: 'g',
      name: 'Kaffe',
    });
    await createItem(app, kari, { priceOre: null, name: 'Kaffe uten pris' });
    const batchId = item.batches[0]!.id;
    await call(
      app,
      'POST',
      `/households/${kari.user.householdId}/inventory/batches/${batchId}/consume`,
      {
        client: kari,
        body: { quantityBase: 500 },
      },
    );
    const prices = await itemPrices(app, kari, item.id);
    expect(prices.own.entries).toEqual([
      expect.objectContaining({ batchId, priceOre: 3990, unitPrice: { ore: 7980, per: 'kg' } }),
    ]);
  });

  it('prices more than 90 days old are marked', async () => {
    const item = await createItem(app, kari, { priceOre: 2490 });
    const { fridge } = await locationsOf(app, kari);
    await call(
      app,
      'POST',
      `/households/${kari.user.householdId}/inventory/items/${item.id}/batches`,
      {
        client: kari,
        body: { quantityBase: 1000, locationId: fridge, priceOre: 1990, purchasedOn: '2025-01-15' },
      },
    );
    const entries = (await itemPrices(app, kari, item.id)).own.entries;
    expect(entries.map((e) => [e.priceOre, e.old])).toEqual([
      [2490, false],
      [1990, true],
    ]);
  });

  it('at most the 10 newest', async () => {
    const item = await createItem(app, kari, { priceOre: 100 });
    const { fridge } = await locationsOf(app, kari);
    for (let i = 1; i <= 11; i++) {
      await call(
        app,
        'POST',
        `/households/${kari.user.householdId}/inventory/items/${item.id}/batches`,
        {
          client: kari,
          body: {
            quantityBase: 1000,
            locationId: fridge,
            priceOre: 100 + i,
            purchasedOn: `2026-01-${String(i).padStart(2, '0')}`,
          },
        },
      );
    }
    const entries = (await itemPrices(app, kari, item.id)).own.entries;
    expect(entries).toHaveLength(10);
    expect(entries[0]?.priceOre).toBe(100); // added today: newest
    expect(entries.at(-1)?.priceOre).toBe(103);
  });

  it('a barcode the household has not used shows no own prices', async () => {
    expect((await barcodePrices(app, kari, PRICED)).own).toEqual({ item: null, entries: [] });
  });
});

describe('FR-PRICE-002 the item page', () => {
  it('own prices, and external ones for the barcode the item was scanned with', async () => {
    const item = await scanIn(kari, PRICED, {}, 2490);
    const prices = await itemPrices(app, kari, item.id);
    expect(prices.gtin).toBe(PRICED);
    expect(prices.own.entries).toHaveLength(1);
    expect(prices.external).toMatchObject({ status: 'found', freshCount: 2 });
  });

  it('an item without a barcode: no external lookup', async () => {
    const item = await createItem(app, kari);
    const prices = await itemPrices(app, kari, item.id);
    expect(prices).toMatchObject({ gtin: null, external: { status: 'notAsked' } });
    expect(kassalapp.calls).toHaveLength(0);
  });

  it('an unknown item is a 404', async () => {
    const response = await call(
      app,
      'GET',
      itemPricesPath(kari, '019a0000-0000-7000-8000-000000000000'),
      {
        client: kari,
      },
    );
    expect(response.statusCode).toBe(404);
  });
});

describe('FR-PRICE-003 the shopping list estimate', () => {
  it('own price first (scaled or “as last time”); unknown lines are counted, never 0', async () => {
    await createItem(app, kari, {
      name: 'Lettmelk',
      priceOre: 2490,
      quantityBase: 1000,
      unit: 'ml',
    });
    await createItem(app, kari, { name: 'Egg', priceOre: null, quantityBase: 6, unit: 'stk' });
    const melk = (
      await addLine(app, kari, { text: 'Melk', quantity: { quantityBase: 500, unit: 'ml' } })
    ).item;
    const again = (await addLine(app, kari, { text: 'Lettmelk' })).item; // no ingredient: matched by its name
    const egg = (
      await addLine(app, kari, { text: 'Egg', quantity: { quantityBase: 6, unit: 'stk' } })
    ).item;
    const paste = (await addLine(app, kari, { text: 'Tannkrem' })).item;
    const pieces = (
      await addLine(app, kari, { text: 'Lettmelk', quantity: { quantityBase: 2, unit: 'stk' } })
    ).item;

    const estimate = await shoppingEstimate(app, kari);
    const byId = new Map(estimate.lines.map((l) => [l.shoppingItemId, l]));
    expect(byId.get(melk.id)).toMatchObject({
      estimateOre: 1245,
      source: 'own',
      basis: 'scaled',
      date: today(),
    });
    expect(byId.get(again.id)).toMatchObject({
      estimateOre: 2490,
      source: 'own',
      basis: 'lastTime',
    });
    expect(byId.get(egg.id)).toMatchObject({ estimateOre: null, missing: 'noPrice' });
    expect(byId.get(paste.id)).toMatchObject({ estimateOre: null, missing: 'noMatch' });
    expect(byId.get(pieces.id)).toMatchObject({ estimateOre: null, missing: 'unitMismatch' });
    expect(estimate.summary).toEqual({
      openLines: 5,
      estimatedLines: 2,
      missingLines: 3,
      estimatedOre: 1245 + 2490,
      fromOwn: 2,
      fromKassalapp: 0,
    });
  });

  it('Kassalapp prices already stored are used when there is no own price – without asking Kassalapp', async () => {
    await scanIn(kari, LIST_FORMAT, { name: 'Testkaffe', categoryKey: 'drinks', unit: 'g' });
    await barcodePrices(app, kari, LIST_FORMAT); // stores Joker: 39,90 for 500 g
    kassalapp.calls.length = 0;
    const line = (
      await addLine(app, kari, { text: 'Testkaffe', quantity: { quantityBase: 250, unit: 'g' } })
    ).item;
    const estimate = await shoppingEstimate(app, kari);
    expect(estimate.lines).toEqual([
      expect.objectContaining({
        shoppingItemId: line.id,
        estimateOre: 1995,
        source: 'kassalapp',
        basis: 'scaled',
      }),
    ]);
    expect(estimate.summary).toMatchObject({ estimatedLines: 1, fromKassalapp: 1 });
    expect(kassalapp.calls).toHaveLength(0);
  });

  it('nothing stored yet: no estimate, and still no request to Kassalapp', async () => {
    await scanIn(kari, LIST_FORMAT, { name: 'Testkaffe', categoryKey: 'drinks', unit: 'g' });
    await addLine(app, kari, { text: 'Testkaffe' });
    const estimate = await shoppingEstimate(app, kari);
    expect(estimate.lines[0]).toMatchObject({ estimateOre: null, missing: 'noPrice' });
    expect(kassalapp.calls).toHaveLength(0);
  });

  it('stored prices that have gone stale are not used', async () => {
    await scanIn(kari, LIST_FORMAT, { name: 'Testkaffe', categoryKey: 'drinks', unit: 'g' });
    await barcodePrices(app, kari, LIST_FORMAT); // checked 3 days ago
    await addLine(app, kari, { text: 'Testkaffe' });
    expect((await shoppingEstimate(app, kari)).summary.estimatedLines).toBe(1);
    clock.advance(11 * DAY + HOUR); // now 14 days and 1 hour
    expect((await shoppingEstimate(app, kari)).lines[0]).toMatchObject({ missing: 'noPrice' });
  });

  it('only open lines count', async () => {
    await createItem(app, kari, { name: 'Lettmelk', priceOre: 2490 });
    const line = (await addLine(app, kari, { text: 'Lettmelk' })).item;
    await call(app, 'PATCH', shoppingPath(kari, `/items/${line.id}`), {
      client: kari,
      body: { checked: true },
    });
    expect(await shoppingEstimate(app, kari)).toEqual({
      lines: [],
      summary: {
        openLines: 0,
        estimatedLines: 0,
        missingLines: 0,
        estimatedOre: 0,
        fromOwn: 0,
        fromKassalapp: 0,
      },
    });
  });

  it('without a key, stored Kassalapp prices are not used either', async () => {
    await scanIn(kari, LIST_FORMAT, { name: 'Testkaffe', categoryKey: 'drinks', unit: 'g' });
    await barcodePrices(app, kari, LIST_FORMAT);
    await addLine(app, kari, { text: 'Testkaffe' });
    const plain = await createTestApp(db);
    try {
      expect((await shoppingEstimate(plain, kari)).lines[0]).toMatchObject({ missing: 'noPrice' });
    } finally {
      await plain.close();
    }
  });
});

describe('FR-PRICE-005 an estimate is never spending', () => {
  it('price lookups and estimates change no purchase, batch, budget or waste figure', async () => {
    const item = await scanIn(kari, PRICED, {}, 2490);
    await addLine(app, kari, { text: 'Melk', quantity: { quantityBase: 1000, unit: 'ml' } });
    const before = {
      purchases: await db.purchase.count(),
      batches: await db.inventoryBatch.findMany({
        select: { id: true, priceOre: true, quantityBase: true },
      }),
      events: await db.inventoryEvent.count(),
      budget: (await call(app, 'GET', budgetPath(kari, '/summary'), { client: kari })).body,
    };
    await barcodePrices(app, kari, PRICED);
    await itemPrices(app, kari, item.id);
    await shoppingEstimate(app, kari);
    expect(await db.purchase.count()).toBe(before.purchases);
    expect(
      await db.inventoryBatch.findMany({
        select: { id: true, priceOre: true, quantityBase: true },
      }),
    ).toEqual(before.batches);
    expect(await db.inventoryEvent.count()).toBe(before.events);
    expect((await call(app, 'GET', budgetPath(kari, '/summary'), { client: kari })).body).toBe(
      before.budget,
    );
  });
});

describe('NFR-SEC-004 the log', () => {
  it('has no barcode and never the key; why Kassalapp did not answer is logged without the code', async () => {
    const item = await scanIn(kari, PRICED, {}, 2490);
    await barcodePrices(app, kari, PRICED);
    await barcodePrices(app, kari, SLOW);
    await itemPrices(app, kari, item.id);
    await call(app, 'GET', estimatePath(kari), { client: kari });
    const text = log.text();
    expect(text).toContain('/prices/[gtin]');
    expect(text).toContain('"reason":"timeout"');
    expect(text).not.toContain(PRICED);
    expect(text).not.toContain(SLOW);
    expect(text).not.toContain(FAKE_KASSALAPP_KEY);
  });

  it('the key is never in an answer', async () => {
    const response = await call(app, 'GET', pricesPath(kari, PRICED), { client: kari });
    expect(response.body).not.toContain(FAKE_KASSALAPP_KEY);
    expect(response.body).not.toContain('Bearer');
  });
});

describe('spec 12 cleanup (worker)', () => {
  it('deletes lookups and observations not fetched for 30 days, and keeps newer ones', async () => {
    await barcodePrices(app, kari, PRICED);
    clock.advance(13 * DAY);
    await barcodePrices(app, kari, LIST_FORMAT);
    clock.advance(17 * DAY + 1);
    const repo = createPriceRepo(db);
    const deleted = await repo.deleteFetchedBefore(new Date(clock.now().getTime() - 30 * DAY));
    expect(deleted).toEqual({ lookups: 1, observations: 4 });
    expect(await db.priceObservation.findMany({ select: { gtin: true } })).toEqual([
      { gtin: LIST_FORMAT },
    ]);
  });
});

describe('FR-PRICE-007 (spec 16) the estimate for a recipe', () => {
  const recipeEstimate = async (client: Client, recipeId: string) => {
    const response = await call(
      app,
      'GET',
      `/households/${client.user.householdId}/recipes/${recipeId}/price-estimate`,
      { client },
    );
    expect(response.statusCode).toBe(200);
    return response.json<RecipePriceEstimate>();
  };

  async function omelette() {
    const ids = await ingredientIdsByKey(app, kari);
    const id = (key: string) => ids.get(key) ?? '';
    return createOwnRecipe(
      app,
      kari,
      ownRecipeBody(ids, {
        lines: [
          { kind: 'ingredient', ingredientId: id('egg'), amount: '3', unit: 'stk' },
          { kind: 'ingredient', ingredientId: id('melk'), amount: '1', unit: 'dl' },
          { kind: 'ingredient', ingredientId: id('salt'), amount: '1', unit: 'ts' },
          { kind: 'ingredient', ingredientId: id('tomat') },
          { kind: 'freeText', text: 'Litt gressløk fra hagen' },
        ],
      }),
    );
  }

  it('own price as a share of what was paid; free text, staples and lines without an amount are left out', async () => {
    await createItem(app, kari, {
      name: 'Lettmelk',
      priceOre: 2490,
      quantityBase: 1000,
      unit: 'ml',
    });
    const { id } = await omelette();
    const before = await Promise.all([db.purchase.count(), db.inventoryBatch.count()]);

    const estimate = await recipeEstimate(kari, id);
    expect(
      estimate.lines.map((l) => [l.text, l.estimateOre, l.source, l.basis, l.missing, l.skipped]),
    ).toEqual([
      ['3 stk Egg', null, null, null, 'noMatch', null],
      ['1 dl Melk', 249, 'own', 'scaled', null, null],
      ['1 ts Salt', null, null, null, null, 'staple'],
      ['Tomat', null, null, null, null, 'noAmount'],
      ['Litt gressløk fra hagen', null, null, null, null, 'freeText'],
    ]);
    expect(estimate.lines[1]?.date).toBe(today());
    // Never a total: the sum is only of the lines that have an estimate, and the rest are counted.
    expect(estimate.summary).toEqual({
      pricedLines: 2,
      estimatedLines: 1,
      missingLines: 1,
      skippedLines: 3,
      estimatedOre: 249,
      fromOwn: 1,
      fromKassalapp: 0,
    });
    expect(estimate.externalEnabled).toBe(true);
    // FR-PRICE-005: an estimate is not spending – nothing was written.
    expect(await Promise.all([db.purchase.count(), db.inventoryBatch.count()])).toEqual(before);
    expect(kassalapp.calls).toHaveLength(0);
  });

  it('Kassalapp prices already stored are used without an own price – and Kassalapp is not asked', async () => {
    await scanIn(kari, PRICED, { name: 'Lettmelk', categoryKey: 'dairy', unit: 'ml' });
    await barcodePrices(app, kari, PRICED); // stores Meny 26,90 and Spar 24,90 (fresh) for 1000 ml
    kassalapp.calls.length = 0;
    const { id } = await omelette();
    const estimate = await recipeEstimate(kari, id);
    // Lower median of two fresh prices = the cheaper one: 24,90 kr per litre → 1 dl = 2,49 kr.
    expect(estimate.lines[1]).toMatchObject({
      estimateOre: 249,
      source: 'kassalapp',
      basis: 'scaled',
    });
    expect(estimate.summary).toMatchObject({ estimatedLines: 1, fromKassalapp: 1, fromOwn: 0 });
    expect(kassalapp.calls).toHaveLength(0);
  });

  it('without a Kassalapp key the estimate says external prices are off', async () => {
    const offApp = await createTestApp(db, { now: clock.now });
    try {
      const { id } = await omelette();
      const response = await call(
        offApp,
        'GET',
        `/households/${kari.user.householdId}/recipes/${id}/price-estimate`,
        { client: kari },
      );
      expect(response.json<RecipePriceEstimate>()).toMatchObject({
        externalEnabled: false,
        summary: { estimatedLines: 0, estimatedOre: 0 },
      });
    } finally {
      await offApp.close();
    }
  });

  it('a global recipe has an estimate too; an unknown recipe is 404', async () => {
    const list = await call(app, 'GET', `/households/${kari.user.householdId}/recipes`, {
      client: kari,
    });
    const pancakes = (list.json().recipes as { id: string; slug: string }[]).find(
      (r) => r.slug === 'testrett-pannekaker',
    );
    expect((await recipeEstimate(kari, pancakes?.id ?? '')).lines.length).toBeGreaterThan(0);
    const unknown = await call(
      app,
      'GET',
      `/households/${kari.user.householdId}/recipes/0199f0a0-0000-7000-8000-000000000001/price-estimate`,
      { client: kari },
    );
    expect(unknown.statusCode).toBe(404);
  });
});
