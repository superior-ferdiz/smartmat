import { describe, expect, it, vi } from 'vitest';
import type { ConfirmScanBody, ItemResponse } from '@smartmat/shared';
import { AppError } from '../../lib/errors';
import { WindowLimiter } from '../../lib/windowLimiter';
import type { BarcodeLookupResult, ProviderProduct } from '../../providers/barcode/types';
import type { BarcodeRepo, ConfirmWrite, RememberedBarcode } from './repo';
import { BarcodeService, MISS_TTL_MS, PRODUCT_TTL_MS } from './service';

/* Spec 07 rules with an in-memory repo and a fake provider. The real database is tested in test/barcodes.*. */

const H = '0199f0a0-0000-7000-8000-00000000000a';
const USER = '0199f0a0-0000-7000-8000-00000000000b';
const LOCATION = '0199f0a0-0000-7000-8000-00000000000c';
const ITEM = '0199f0a0-0000-7000-8000-00000000000d';
const REQUEST = '0199f0a0-0000-7000-8000-00000000000e';
const INGREDIENT = '0199f0a0-0000-7000-8000-00000000000f';
const CODE = { gtin: '7038010000737', storeCode: false };

const PRODUCT: ProviderProduct = {
  name: 'Testmelk',
  brand: 'Testmeieriet',
  packageQuantityBase: 1000,
  packageUnit: 'ml',
  categoryKey: 'dairy',
};

function setup(options: { result?: BarcodeLookupResult; perUser?: number } = {}) {
  let time = new Date('2026-10-22T12:00:00Z');
  const products = new Map<string, { product: ProviderProduct; fetchedAt: Date }>();
  const misses = new Map<string, Date>();
  const remembered = new Map<string, RememberedBarcode>();
  const dedupe = new Map<string, string>();
  const writes: ConfirmWrite[] = [];

  const repo: BarcodeRepo = {
    remembered: async (h, gtin) => remembered.get(`${h}:${gtin}`) ?? null,
    itemSummary: async (_h, id) => ({ id, name: 'Testmelk', unit: 'ml' }),
    cachedProduct: async (gtin) => products.get(gtin) ?? null,
    missCheckedAt: async (gtin) => misses.get(gtin) ?? null,
    saveProduct: vi.fn(async (gtin, product, fetchedAt) => {
      products.set(gtin, { product, fetchedAt });
      misses.delete(gtin);
    }),
    saveMiss: vi.fn(async (gtin, at) => {
      misses.set(gtin, at);
    }),
    itemIdByDedupeKey: async (h, key) => dedupe.get(`${h}:${key}`) ?? null,
    confirm: vi.fn(async (h, _actor, write) => {
      writes.push(write);
      const itemId = write.target.kind === 'existingItem' ? write.target.itemId : ITEM;
      dedupe.set(`${h}:${write.dedupeKey}`, itemId);
      return { kind: 'ok' as const, itemId };
    }),
  };
  const provider = {
    lookup: vi.fn(
      async (): Promise<BarcodeLookupResult> =>
        options.result ?? { status: 'found', product: PRODUCT },
    ),
  };
  const locationsExist = vi.fn(async (h: string, id: string) => h === H && id === LOCATION);
  const service = new BarcodeService({
    repo,
    provider,
    inventory: {
      getItem: async (_h, id) => ({ id, name: 'Testmelk' }) as unknown as ItemResponse,
    },
    locations: { exists: locationsExist },
    ingredients: { exists: async (id) => id === INGREDIENT },
    userLimiter: new WindowLimiter(options.perUser ?? 100, 60_000, () => time),
    now: () => time,
  });
  return {
    service,
    repo,
    provider,
    products,
    misses,
    remembered,
    writes,
    advance(ms: number) {
      time = new Date(time.getTime() + ms);
    },
  };
}

const lookup = (s: ReturnType<typeof setup>, code = CODE) => s.service.lookup(H, USER, code);

describe('FR-SCAN-002 lookup order', () => {
  it('unknown to the household: asks OFF and caches the answer', async () => {
    const s = setup();
    const { response, unavailable } = await lookup(s);
    expect(response).toMatchObject({
      source: 'openFoodFacts',
      providerStatus: 'found',
      suggestion: {
        name: 'Testmelk',
        brand: 'Testmeieriet',
        unit: 'ml',
        quantityBase: 1000,
        categoryKey: 'dairy',
      },
      existingItem: null,
    });
    // OFF never decides the date, place or ingredient (spec 07, decision 2).
    expect(response.suggestion).toMatchObject({
      locationId: null,
      expiryKind: null,
      ingredient: null,
    });
    expect(unavailable).toBeNull();
    expect(s.repo.saveProduct).toHaveBeenCalledOnce();
  });

  it('cached for 30 days: OFF is not asked again until then', async () => {
    const s = setup();
    await lookup(s);
    s.advance(PRODUCT_TTL_MS - 1);
    expect((await lookup(s)).response.providerStatus).toBe('found');
    expect(s.provider.lookup).toHaveBeenCalledTimes(1);
    s.advance(1);
    await lookup(s);
    expect(s.provider.lookup).toHaveBeenCalledTimes(2);
  });

  it('not found: remembered for 24 hours', async () => {
    const s = setup({ result: { status: 'notFound' } });
    expect((await lookup(s)).response).toMatchObject({
      source: 'none',
      providerStatus: 'notFound',
    });
    s.advance(MISS_TTL_MS - 1);
    expect((await lookup(s)).response.providerStatus).toBe('notFound');
    expect(s.provider.lookup).toHaveBeenCalledTimes(1);
    s.advance(1);
    await lookup(s);
    expect(s.provider.lookup).toHaveBeenCalledTimes(2);
  });

  it('NFR-REL-001: OFF unavailable → empty form, nothing cached, the reason is passed on for the log', async () => {
    const s = setup({ result: { status: 'unavailable', reason: 'timeout' } });
    const { response, unavailable } = await lookup(s);
    expect(response).toMatchObject({ source: 'none', providerStatus: 'unavailable' });
    expect(response.suggestion.name).toBeNull();
    expect(unavailable).toBe('timeout');
    expect(s.repo.saveProduct).not.toHaveBeenCalled();
    expect(s.repo.saveMiss).not.toHaveBeenCalled();
    // The next scan asks again.
    await lookup(s);
    expect(s.provider.lookup).toHaveBeenCalledTimes(2);
  });

  it('NFR-REL-001: OFF unavailable but an old cached answer exists → the old answer', async () => {
    const s = setup({ result: { status: 'unavailable', reason: 'httpError' } });
    s.products.set(CODE.gtin, { product: PRODUCT, fetchedAt: new Date('2025-01-01T00:00:00Z') });
    const { response, unavailable } = await lookup(s);
    expect(response).toMatchObject({ source: 'openFoodFacts', providerStatus: 'found' });
    expect(unavailable).toBe('httpError');
  });

  it("the household's own answer wins, and OFF is not asked", async () => {
    const s = setup();
    s.remembered.set(`${H}:${CODE.gtin}`, {
      name: 'Melka vår',
      categoryKey: 'dairy',
      unit: 'ml',
      quantityBase: 1750,
      ingredientMatch: 'manual',
      ingredientId: INGREDIENT,
      locationId: LOCATION,
      expiryKind: 'use_by',
      itemId: ITEM,
    });
    const { response } = await lookup(s);
    expect(response).toEqual({
      gtin: CODE.gtin,
      storeCode: false,
      source: 'household',
      providerStatus: 'notAsked',
      suggestion: {
        name: 'Melka vår',
        brand: null,
        categoryKey: 'dairy',
        unit: 'ml',
        quantityBase: 1750,
        ingredient: { match: 'manual', ingredientId: INGREDIENT },
        locationId: LOCATION,
        expiryKind: 'use_by',
      },
      existingItem: { id: ITEM, name: 'Testmelk', unit: 'ml' },
    });
    expect(s.provider.lookup).not.toHaveBeenCalled();
  });

  it("another household's answer is not used", async () => {
    const s = setup();
    s.remembered.set(`other-household:${CODE.gtin}`, {
      name: 'Hemmelig',
      categoryKey: 'dairy',
      unit: 'ml',
      quantityBase: null,
      ingredientMatch: 'auto',
      ingredientId: null,
      locationId: null,
      expiryKind: null,
      itemId: null,
    });
    expect((await lookup(s)).response.source).toBe('openFoodFacts');
  });

  it('a store code is never looked up', async () => {
    const s = setup();
    const { response } = await lookup(s, { gtin: '2312345000125', storeCode: true });
    expect(response).toMatchObject({ storeCode: true, source: 'none', providerStatus: 'notAsked' });
    expect(s.provider.lookup).not.toHaveBeenCalled();
  });

  it('30 lookups per user and minute (spec 07), then 429', async () => {
    const s = setup({ perUser: 2 });
    await lookup(s);
    await lookup(s);
    await expect(lookup(s)).rejects.toMatchObject({ statusCode: 429, code: 'errors.rateLimited' });
    s.advance(60_000);
    await expect(lookup(s)).resolves.toBeDefined();
  });
});

const batch = {
  quantityBase: 1000,
  locationId: LOCATION,
  expiry: null,
  priceOre: null,
  purchasedOn: null,
};
const newItem: ConfirmScanBody = {
  mode: 'newItem',
  clientRequestId: REQUEST,
  name: 'Testmelk',
  categoryKey: 'dairy',
  unit: 'ml',
  ingredient: { match: 'auto' },
  batch,
};

describe('FR-SCAN-005 confirm', () => {
  it('saves a new item, its batch and the answers (remembered) with the dedupe key', async () => {
    const s = setup();
    const result = await s.service.confirm(H, USER, CODE, newItem);
    expect(result.created).toBe(true);
    expect(s.writes).toEqual([
      {
        gtin: CODE.gtin,
        remember: true,
        dedupeKey: `scan:${REQUEST}`,
        batch: {
          quantityBase: 1000,
          locationId: LOCATION,
          expiryKind: null,
          expiryDate: null,
          priceOre: null,
          purchasedOn: null,
        },
        target: {
          kind: 'newItem',
          item: {
            name: 'Testmelk',
            categoryKey: 'dairy',
            unit: 'ml',
            ingredientMatch: 'auto',
            ingredientId: null,
          },
        },
      },
    ]);
  });

  it('the same clientRequestId again: answers with the item, saves nothing', async () => {
    const s = setup();
    await s.service.confirm(H, USER, CODE, newItem);
    const again = await s.service.confirm(H, USER, CODE, newItem);
    expect(again.created).toBe(false);
    expect(s.repo.confirm).toHaveBeenCalledTimes(1);
  });

  it('lost race on the dedupe key: answers with the one that won', async () => {
    const s = setup();
    vi.mocked(s.repo.confirm).mockImplementationOnce(async () => ({ kind: 'duplicate' }));
    s.repo.itemIdByDedupeKey = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(ITEM);
    const result = await s.service.confirm(H, USER, CODE, newItem);
    expect(result).toMatchObject({ created: false, item: { id: ITEM } });
  });

  it('a store code is added but not remembered', async () => {
    const s = setup();
    await s.service.confirm(H, USER, { gtin: '2312345000125', storeCode: true }, newItem);
    expect(s.writes[0]?.remember).toBe(false);
  });

  it('a chosen ingredient is kept; an unknown one is a field error', async () => {
    const s = setup();
    await s.service.confirm(H, USER, CODE, {
      ...newItem,
      ingredient: { match: 'manual', ingredientId: INGREDIENT },
    });
    expect(s.writes[0]?.target).toMatchObject({
      item: { ingredientMatch: 'manual', ingredientId: INGREDIENT },
    });
    const error = await s.service
      .confirm(H, USER, CODE, {
        ...newItem,
        clientRequestId: '0199f0a0-0000-7000-8000-000000000099',
        ingredient: { match: 'manual', ingredientId: ITEM },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 400,
      fields: { 'ingredient.ingredientId': 'validation.ingredient.unknown' },
    });
  });

  it("'none' is saved as none, without an ingredient id", async () => {
    const s = setup();
    await s.service.confirm(H, USER, CODE, { ...newItem, ingredient: { match: 'none' } });
    expect(s.writes[0]?.target).toMatchObject({
      item: { ingredientMatch: 'none', ingredientId: null },
    });
  });

  it("a location that is not the household's is a field error, and nothing is saved", async () => {
    const s = setup();
    const other = '0199f0a0-0000-7000-8000-000000000077';
    await expect(
      s.service.confirm(H, USER, CODE, { ...newItem, batch: { ...batch, locationId: other } }),
    ).rejects.toMatchObject({
      statusCode: 400,
      fields: { 'batch.locationId': 'validation.location.notFound' },
    });
    expect(s.repo.confirm).not.toHaveBeenCalled();
  });

  it('a new batch on an existing item; an item that is gone is 404', async () => {
    const s = setup();
    const body: ConfirmScanBody = {
      mode: 'existingItem',
      clientRequestId: REQUEST,
      itemId: ITEM,
      batch,
    };
    await s.service.confirm(H, USER, CODE, body);
    expect(s.writes[0]?.target).toEqual({ kind: 'existingItem', itemId: ITEM });

    vi.mocked(s.repo.confirm).mockImplementationOnce(async () => ({ kind: 'itemGone' }));
    await expect(
      s.service.confirm(H, USER, CODE, {
        ...body,
        clientRequestId: '0199f0a0-0000-7000-8000-000000000098',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
