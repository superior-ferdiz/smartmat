import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CSRF_HEADER } from '@smartmat/shared';
import {
  clearProductCache,
  confirmBody,
  confirmCode,
  fakeOffFetch,
  testBarcodeProvider,
  type ConfirmScanResponse,
} from './barcodeHelpers';
import { ORIGIN, call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { createItem, locationsOf } from './inventoryHelpers';
import {
  LIST_FORMAT,
  PRICED,
  barcodePrices,
  clearPriceCache,
  estimatePath,
  fakeKassalappFetch,
  itemPrices,
  itemPricesPath,
  pricesPath,
  shoppingEstimate,
  testPriceProvider,
} from './priceHelpers';
import { addLine } from './shoppingHelpers';
import { createPriceRepo } from '../src/modules/prices/repo';

/*
 * NFR-SEC-001 for prices (spec 12). Ola tries to reach Kari's data in every way:
 *   A) Kari's household id in the URL                         → 404 on all three endpoints, nothing is asked
 *   B) Ola's household with Kari's item id                     → 404
 *   C) Kari's own prices, items and lines never show up for Ola (same barcode, same names)
 *   D) not logged in / foreign Origin                          → 401 / 403
 */

const db = useTestDatabase();
const kassalapp = fakeKassalappFetch();
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let kariItem: string;

beforeAll(async () => {
  app = await createTestApp(db, {
    barcodeProvider: testBarcodeProvider(fakeOffFetch().fetchFn as typeof fetch),
    priceProvider: testPriceProvider(kassalapp.fetchFn as typeof fetch),
  });
});
afterAll(() => app.close());

beforeEach(async () => {
  await clearPriceCache(db);
  await clearProductCache(db);
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  const { fridge } = await locationsOf(app, kari);
  const body = confirmBody(fridge, { name: 'Karis hemmelige melk' });
  const scanned = await confirmCode(app, kari, PRICED, {
    ...body,
    batch: { ...(body.batch as object), priceOre: 4321 },
  });
  kariItem = scanned.json<ConfirmScanResponse>().item.id;
  await addLine(app, kari, { text: 'Karis hemmelige melk' });
  kassalapp.calls.length = 0;
});

describe("A) Kari's household id in the URL", () => {
  it.each([
    ['prices for a barcode', () => pricesPath(kari, PRICED)],
    ['prices for an item', () => itemPricesPath(kari, kariItem)],
    ['the shopping list estimate', () => estimatePath(kari)],
  ])('%s → 404, nothing leaks and nothing is asked', async (_name, path) => {
    const response = await call(app, 'GET', path(), { client: ola });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('hemmelige');
    expect(response.body).not.toContain('4321');
    expect(kassalapp.calls).toHaveLength(0);
  });
});

describe("B) Ola's household with Kari's item id", () => {
  it('→ 404, and Kari’s price is not in the answer', async () => {
    const response = await call(app, 'GET', itemPricesPath(ola, kariItem), { client: ola });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('4321');
    expect(kassalapp.calls).toHaveLength(0);
  });
});

describe("C) Kari's data never shows up for Ola", () => {
  it('the same barcode: the external prices are shared, Kari’s own price and item are not', async () => {
    const prices = await barcodePrices(app, ola, PRICED);
    expect(prices.own).toEqual({ item: null, entries: [] });
    expect(prices.external.status).toBe('found');
    expect(JSON.stringify(prices)).not.toContain('hemmelige');
  });

  it('Ola’s estimate does not use Kari’s items, prices or lines', async () => {
    await addLine(app, ola, { text: 'Karis hemmelige melk' });
    const estimate = await shoppingEstimate(app, ola);
    expect(estimate.lines).toHaveLength(1);
    expect(estimate.lines[0]).toMatchObject({ estimateOre: null, missing: 'noMatch' });
  });

  it('Ola’s own item with the same name gets Ola’s price, never Kari’s', async () => {
    const own = await createItem(app, ola, { name: 'Karis hemmelige melk', priceOre: 1000 });
    await addLine(app, ola, { text: 'Karis hemmelige melk' });
    expect((await shoppingEstimate(app, ola)).lines[0]?.estimateOre).toBe(1000);
    expect((await itemPrices(app, ola, own.id)).own.entries.map((e) => e.priceOre)).toEqual([1000]);
  });

  it('stored Kassalapp prices only reach Ola’s estimate through Ola’s own barcodes', async () => {
    const { fridge } = await locationsOf(app, kari);
    await confirmCode(
      app,
      kari,
      LIST_FORMAT,
      confirmBody(fridge, { name: 'Testkaffe', categoryKey: 'drinks', unit: 'g' }),
    );
    await barcodePrices(app, kari, LIST_FORMAT);
    await createItem(app, ola, { name: 'Testkaffe', priceOre: null, unit: 'g', quantityBase: 500 });
    await addLine(app, ola, { text: 'Testkaffe' });
    expect((await shoppingEstimate(app, ola)).lines[0]).toMatchObject({ missing: 'noPrice' });
  });
});

describe('C) the repo itself filters on the household (not only the service)', () => {
  it('Kari’s priced batch is not returned for Ola’s household, also when asked by item id', async () => {
    const repo = createPriceRepo(db);
    expect(await repo.pricedBatches(ola.user.householdId, [kariItem])).toEqual([]);
    expect(await repo.pricedBatches(ola.user.householdId)).toEqual([]);
    expect(await repo.item(ola.user.householdId, kariItem)).toBeNull();
    expect(await repo.gtinForItem(ola.user.householdId, kariItem)).toBeNull();
    expect(await repo.openShoppingLines(ola.user.householdId)).toEqual([]);
    expect(await repo.barcodesByItem(ola.user.householdId)).toEqual(new Map());
    // And Kari gets her own.
    expect(
      (await repo.pricedBatches(kari.user.householdId, [kariItem])).map((b) => b.priceOre),
    ).toEqual([4321]);
  });
});

describe('D) not logged in or from another site', () => {
  it.each([
    ['prices for a barcode', () => pricesPath(kari, PRICED)],
    ['prices for an item', () => itemPricesPath(kari, kariItem)],
    ['the shopping list estimate', () => estimatePath(kari)],
  ])('%s without a session → 401', async (_name, path) => {
    const response = await call(app, 'GET', path());
    expect(response.statusCode).toBe(401);
    expect(kassalapp.calls).toHaveLength(0);
  });

  it('there are no changing price endpoints to send a forged request to', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await call(app, method, pricesPath(kari, PRICED), {
        client: kari,
        headers: { origin: ORIGIN, [CSRF_HEADER]: kari.csrfToken },
        body: {},
      });
      expect(response.statusCode, method).toBe(404);
    }
  });
});
