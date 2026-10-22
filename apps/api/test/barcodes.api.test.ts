import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { HistoryResponse, ItemResponse, RecipeDetail } from '@smartmat/shared';
import {
  BROKEN,
  KNOWN,
  SLOW,
  STORE_CODE,
  UNKNOWN,
  barcodePath,
  clearProductCache,
  confirmBody,
  confirmCode,
  fakeOffFetch,
  lookupCode,
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
import { inventoryPath, locationsOf } from './inventoryHelpers';
import { ingredientIds, recipeIdOf } from './shoppingHelpers';
import { applySeed, readSeedDirectory } from '../src/modules/recipes/seed';
import { FIXTURE_SEED_DIR, seedFixtureRecipes } from './fixtureSeed';

/*
 * FR-SCAN-002/-004/-005 and NFR-REL-001 against the real test database. Open Food Facts is the real provider
 * with a fake fetch (barcodeHelpers.ts): nothing leaves the machine.
 */

const db = useTestDatabase();
const off = fakeOffFetch();
const log = captureLog();
let app: FastifyInstance;
let kari: Client;
let fridge: string;
let freezer: string;

beforeAll(async () => {
  app = await createTestApp(db, {
    barcodeProvider: testBarcodeProvider(off.fetchFn as typeof fetch),
    logStream: log.stream,
    config: { logLevel: 'info' },
  });
});
afterAll(() => app.close());

beforeEach(async () => {
  await clearProductCache(db);
  off.asked.length = 0;
  kari = await registerUser(app, { displayName: 'Kari' });
  ({ fridge, freezer } = await locationsOf(app, kari));
});

async function inventory(client: Client) {
  return (await call(app, 'GET', inventoryPath(client), { client })).json<{
    items: ItemResponse[];
  }>().items;
}

describe('FR-SCAN-003 the code in the URL', () => {
  it.each(['123', '4006381333932', 'abc', '70380100007370000'])(
    '%s → 400 on gtin',
    async (code) => {
      const response = await call(app, 'GET', barcodePath(kari, code), { client: kari });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'errors.validation' } });
      expect(Object.values(response.json().error.fields ?? {})[0]).toMatch(
        /^validation\.barcode\./,
      );
      expect(off.asked).toEqual([]);
    },
  );

  it('UPC-A is normalized before anything else', async () => {
    const body = await lookupCode(app, kari, '036000291452'.padStart(12, '0'));
    expect(body.gtin).toBe('0036000291452');
  });
});

describe('FR-SCAN-002 lookup', () => {
  it('known code: suggestion from Open Food Facts, then from the cache', async () => {
    const first = await lookupCode(app, kari, KNOWN);
    expect(first).toEqual({
      gtin: KNOWN,
      storeCode: false,
      source: 'openFoodFacts',
      providerStatus: 'found',
      suggestion: {
        name: 'Testmeieriet Lettmelk 1 %',
        brand: 'Testmeieriet',
        categoryKey: 'dairy',
        unit: 'ml',
        quantityBase: 1000,
        ingredient: null,
        locationId: null,
        expiryKind: null,
      },
      existingItem: null,
    });
    const other = await registerUser(app);
    expect((await lookupCode(app, other, KNOWN)).providerStatus).toBe('found');
    expect(off.asked).toEqual([KNOWN]);
  });

  it('a lookup saves nothing for the household', async () => {
    await lookupCode(app, kari, KNOWN);
    expect(await inventory(kari)).toEqual([]);
    expect(await db.householdBarcode.count()).toBe(0);
  });

  it('unknown code: not found, and not asked again within 24 hours', async () => {
    expect(await lookupCode(app, kari, UNKNOWN)).toMatchObject({
      source: 'none',
      providerStatus: 'notFound',
    });
    await lookupCode(app, kari, UNKNOWN);
    expect(off.asked).toEqual([UNKNOWN]);
  });

  it('NFR-REL-001 timeout: unavailable, nothing cached, the reason (not the code) is logged', async () => {
    const started = Date.now();
    expect(await lookupCode(app, kari, SLOW)).toMatchObject({
      source: 'none',
      providerStatus: 'unavailable',
    });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(await db.product.count()).toBe(0);
    expect(await db.productLookupMiss.count()).toBe(0);
    expect(log.text()).toContain('"reason":"timeout"');
    expect(log.text()).toContain('/barcodes/[gtin]');
    expect(log.text()).not.toContain(SLOW);
  });

  it('NFR-REL-001 invalid answer: unavailable, nothing cached', async () => {
    expect((await lookupCode(app, kari, BROKEN)).providerStatus).toBe('unavailable');
    expect(log.text()).toContain('"reason":"invalidResponse"');
    expect(await db.productLookupMiss.count()).toBe(0);
  });

  it('store code: never sent to Open Food Facts', async () => {
    expect(await lookupCode(app, kari, STORE_CODE)).toMatchObject({
      storeCode: true,
      source: 'none',
      providerStatus: 'notAsked',
    });
    expect(off.asked).toEqual([]);
  });
});

describe('FR-SCAN-005 confirm', () => {
  it('known code → confirm → the item is in the inventory, with its "add" event', async () => {
    const response = await confirmCode(app, kari, KNOWN, confirmBody(fridge));
    expect(response.statusCode).toBe(201);
    const { item } = response.json<ConfirmScanResponse>();
    expect(item).toMatchObject({
      name: 'Testmeieriet Lettmelk 1 %',
      categoryKey: 'dairy',
      unit: 'ml',
      ingredientMatch: 'auto',
      batches: [{ quantityBase: 1000, locationId: fridge, expiryKind: null, priceOre: null }],
    });
    expect((await inventory(kari)).map((i) => i.id)).toEqual([item.id]);
    const history = await call(app, 'GET', inventoryPath(kari, `/items/${item.id}/history`), {
      client: kari,
    });
    expect(history.json<HistoryResponse>().events.map((e) => e.type)).toEqual(['add']);
  });

  it('spec 05 still works: the scanned item counts as an ingredient by its name', async () => {
    await confirmCode(app, kari, KNOWN, confirmBody(fridge));
    const recipeId = await recipeIdOf(app, kari, 'testrett-pannekaker');
    const recipe = (
      await call(app, 'GET', `/households/${kari.user.householdId}/recipes/${recipeId}`, {
        client: kari,
      })
    ).json<RecipeDetail>();
    const line = recipe.lines.find((l) => l.itemNames.includes('Testmeieriet Lettmelk 1 %'));
    expect(line).toBeDefined();
    expect(line?.status).not.toBe('missing');
  });

  it('the answers are remembered: next lookup comes from the household and offers the same item', async () => {
    const first = await confirmCode(
      app,
      kari,
      UNKNOWN,
      confirmBody(freezer, {
        name: 'Hjemmelaget syltetøy',
        categoryKey: 'spreads',
        unit: 'g',
        batch: {
          quantityBase: 450,
          locationId: freezer,
          expiry: { kind: 'best_before', date: '2027-01-01' },
        },
      }),
    );
    const itemId = first.json<ConfirmScanResponse>().item.id;
    off.asked.length = 0;

    const next = await lookupCode(app, kari, UNKNOWN);
    expect(next).toEqual({
      gtin: UNKNOWN,
      storeCode: false,
      source: 'household',
      providerStatus: 'notAsked',
      suggestion: {
        name: 'Hjemmelaget syltetøy',
        brand: null,
        categoryKey: 'spreads',
        unit: 'g',
        quantityBase: 450,
        ingredient: { match: 'auto', ingredientId: null },
        locationId: freezer,
        expiryKind: 'best_before',
      },
      existingItem: { id: itemId, name: 'Hjemmelaget syltetøy', unit: 'g' },
    });
    expect(off.asked).toEqual([]);

    // FR-INV-002: a second pack becomes a new batch on the same item.
    const second = await confirmCode(app, kari, UNKNOWN, {
      mode: 'existingItem',
      clientRequestId: crypto.randomUUID(),
      itemId,
      batch: { quantityBase: 450, locationId: fridge },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json<ConfirmScanResponse>().item.batches).toHaveLength(2);
    expect(await inventory(kari)).toHaveLength(1);
    // The place is remembered from the latest confirmation.
    expect((await lookupCode(app, kari, UNKNOWN)).suggestion.locationId).toBe(fridge);
  });

  it('a chosen ingredient is saved on the item and remembered', async () => {
    const egg = (await ingredientIds(app, kari)).get('egg')!;
    const response = await confirmCode(
      app,
      kari,
      KNOWN,
      confirmBody(fridge, { ingredient: { match: 'manual', ingredientId: egg } }),
    );
    expect(response.json<ConfirmScanResponse>().item).toMatchObject({
      ingredientMatch: 'manual',
      ingredientId: egg,
    });
    expect((await lookupCode(app, kari, KNOWN)).suggestion.ingredient).toEqual({
      match: 'manual',
      ingredientId: egg,
    });
  });

  it('an unknown ingredient id is a field error and nothing is saved', async () => {
    const response = await confirmCode(
      app,
      kari,
      KNOWN,
      confirmBody(fridge, {
        ingredient: { match: 'manual', ingredientId: '0199f0a0-0000-7000-8000-000000000001' },
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'ingredient.ingredientId': 'validation.ingredient.unknown',
    });
    expect(await inventory(kari)).toEqual([]);
  });

  it('a store code is added but not remembered', async () => {
    const response = await confirmCode(
      app,
      kari,
      STORE_CODE,
      confirmBody(fridge, { name: 'Kjøttdeig fra disken' }),
    );
    expect(response.statusCode).toBe(201);
    expect(await db.householdBarcode.count()).toBe(0);
    expect((await lookupCode(app, kari, STORE_CODE)).source).toBe('none');
  });

  it('NFR-DATA-002: the same confirmation twice gives one item and one batch (200 the second time)', async () => {
    const body = confirmBody(fridge);
    const first = await confirmCode(app, kari, KNOWN, body);
    const second = await confirmCode(app, kari, KNOWN, body);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json<ConfirmScanResponse>().item.id).toBe(
      first.json<ConfirmScanResponse>().item.id,
    );
    const items = await inventory(kari);
    expect(items).toHaveLength(1);
    expect(items[0]?.batches).toHaveLength(1);
  });

  it('NFR-DATA-002: the same confirmation at the same moment gives one batch', async () => {
    const body = confirmBody(fridge);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => confirmCode(app, kari, KNOWN, body)),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => r.json<ConfirmScanResponse>().item.id)).size).toBe(1);
    expect(await db.inventoryBatch.count({ where: { householdId: kari.user.householdId } })).toBe(
      1,
    );
  });

  it('a body that does not match the schema is refused', async () => {
    for (const body of [
      { ...confirmBody(fridge), clientRequestId: undefined },
      { ...confirmBody(fridge), mode: 'other' },
      { ...confirmBody(fridge), name: '' },
      { ...confirmBody(fridge), batch: { quantityBase: 1.5, locationId: fridge } },
    ]) {
      expect((await confirmCode(app, kari, KNOWN, body)).statusCode).toBe(400);
    }
    expect(await inventory(kari)).toEqual([]);
  });
});

describe('deleting what a remembered barcode points at', () => {
  it('deleting the item keeps the answers, without the item', async () => {
    const { item } = (
      await confirmCode(app, kari, KNOWN, confirmBody(fridge))
    ).json<ConfirmScanResponse>();
    const deleted = await call(app, 'DELETE', inventoryPath(kari, `/items/${item.id}`), {
      client: kari,
    });
    expect(deleted.statusCode).toBe(204);
    const next = await lookupCode(app, kari, KNOWN);
    expect(next).toMatchObject({ source: 'household', existingItem: null });
    expect(next.suggestion.name).toBe('Testmeieriet Lettmelk 1 %');
  });

  it('deleting the place keeps the answers, without the place', async () => {
    const created = await call(app, 'POST', `/households/${kari.user.householdId}/locations`, {
      client: kari,
      body: { name: 'Kjeller' },
    });
    const cellar = created.json<{ id: string }>().id;
    const { item } = (
      await confirmCode(app, kari, KNOWN, confirmBody(cellar))
    ).json<ConfirmScanResponse>();
    await call(app, 'DELETE', inventoryPath(kari, `/items/${item.id}`), { client: kari });
    const deleted = await call(
      app,
      'DELETE',
      `/households/${kari.user.householdId}/locations/${cellar}`,
      {
        client: kari,
      },
    );
    expect(deleted.statusCode).toBe(204);
    expect((await lookupCode(app, kari, KNOWN)).suggestion.locationId).toBeNull();
  });

  it('seed rule: an ingredient chosen for a remembered barcode is kept when it leaves the seed files', async () => {
    const sesam = (await ingredientIds(app, kari)).get('sesamfro')!;
    const { item } = (
      await confirmCode(
        app,
        kari,
        UNKNOWN,
        confirmBody(fridge, { name: 'Frø', ingredient: { match: 'manual', ingredientId: sesam } }),
      )
    ).json<ConfirmScanResponse>();
    // Only the remembered barcode uses the ingredient now.
    await call(app, 'DELETE', inventoryPath(kari, `/items/${item.id}`), { client: kari });
    const seed = readSeedDirectory(FIXTURE_SEED_DIR);
    try {
      const summary = await applySeed(db, {
        ingredients: seed.ingredients.filter((i) => i.key !== 'sesamfro'),
        recipes: seed.recipes.filter((r) =>
          r.ingredients.every((l) => l.ingredientKey !== 'sesamfro'),
        ),
      });
      expect(summary.keptIngredients).toEqual(['sesamfro']);
      expect((await lookupCode(app, kari, UNKNOWN)).suggestion.ingredient).toEqual({
        match: 'manual',
        ingredientId: sesam,
      });
    } finally {
      await seedFixtureRecipes(db);
    }
  });

  it('deleting the account deletes the remembered barcodes, not the shared cache', async () => {
    await lookupCode(app, kari, KNOWN);
    await confirmCode(app, kari, KNOWN, confirmBody(fridge));
    const response = await call(app, 'DELETE', '/me', {
      client: kari,
      body: { password: 'riktig hest batteri' },
    });
    expect(response.statusCode).toBe(204);
    expect(await db.householdBarcode.count()).toBe(0);
    expect(await db.product.count()).toBe(1);
  });
});
