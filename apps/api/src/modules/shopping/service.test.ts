import { describe, expect, it, vi } from 'vitest';
import {
  addFromRecipeSchema,
  createShoppingItemSchema,
  toInventorySchema,
  updateShoppingItemSchema,
  type ShoppingItemResponse,
} from '@smartmat/shared';
import { AppError } from '../../lib/errors';
import { createFakeClock } from '../../test/fakes';
import type { RecipeLineWrite, ShoppingRepo, StockWrite } from './repo';
import { ShoppingService, type CatalogEntry } from './service';

const H = '0199f0a0-0000-7000-8000-000000000001';
const FRIDGE = '0199f0a0-0000-7000-8000-00000000f001';
const ITEM = '0199f0a0-0000-7000-8000-00000000a001';
const RECIPE = '0199f0a0-0000-7000-8000-00000000c001';
const LINE_MELK = '0199f0a0-0000-7000-8000-00000000d001';
const LINE_OPEN = '0199f0a0-0000-7000-8000-00000000d002';
const MELK = '0199f0a0-0000-7000-8000-00000000e001';
const EGG = '0199f0a0-0000-7000-8000-00000000e002';
const SALT = '0199f0a0-0000-7000-8000-00000000e003';

const catalog: CatalogEntry[] = [
  { id: MELK, name: 'Melk', aliases: ['lettmelk'], baseUnit: 'ml' },
  { id: EGG, name: 'Egg', aliases: [], baseUnit: 'stk' },
  { id: SALT, name: 'Salt', aliases: [], baseUnit: 'g' },
];

function line(over: Partial<ShoppingItemResponse>): ShoppingItemResponse {
  return {
    id: LINE_MELK,
    text: 'Melk',
    ingredientId: MELK,
    quantityBase: 500,
    unit: 'ml',
    checked: true,
    checkedAt: '2026-10-21T09:00:00.000Z',
    createdAt: '2026-10-21T08:00:00.000Z',
    recipes: [],
    meals: [],
    ...over,
  };
}

function setup(
  lines: ShoppingItemResponse[] = [line({}), line({ id: LINE_OPEN, checked: false })],
) {
  const stockWrites: StockWrite[][] = [];
  const recipeWrites: RecipeLineWrite[][] = [];
  const repo: ShoppingRepo = {
    list: vi.fn(async () => lines),
    get: vi.fn(async (_h, id: string) => lines.find((l) => l.id === id) ?? null),
    findByDedupeKey: vi.fn(async () => null),
    create: vi.fn(async () => ({ kind: 'created' as const, id: LINE_MELK, similarItemId: null })),
    update: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    clearChecked: vi.fn(async () => 2),
    addFromRecipe: vi.fn(async (_h, _a, _r, write: RecipeLineWrite[]) => {
      recipeWrites.push(write);
      return { created: write.length, merged: 0, skipped: 0 };
    }),
    mealContributions: vi.fn(async () => []),
    addFromMealPlan: vi.fn(async () => ({ created: 0, merged: 0, skipped: 0 })),
    itemUnits: vi.fn(
      async (_h, ids: string[]) =>
        new Map(ids.filter((id) => id === ITEM).map((id) => [id, 'ml' as const])),
    ),
    toInventory: vi.fn(async (_h, _a, writes: StockWrite[]) => {
      stockWrites.push(writes);
      return writes.map(() => ITEM);
    }),
  };
  const recipes = {
    catalog: vi.fn(async () => catalog),
    recipe: vi.fn(async (id: string) =>
      id === RECIPE ? { lines: [{ ingredientId: MELK }, { ingredientId: EGG }] } : null,
    ),
  };
  const locations = { exists: vi.fn(async (_h: string, id: string) => id === FRIDGE) };
  const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
  const service = new ShoppingService({ repo, locations, recipes, now: clock.now });
  return { service, repo, stockWrites, recipeWrites };
}

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof AppError)) throw new Error('expected an AppError');
  return error;
}

describe('FR-SHOP-001 create', () => {
  it('links the text to the ingredient it matches, and stores the quantity in base units', async () => {
    const { service, repo } = setup();
    const body = createShoppingItemSchema.parse({
      text: 'Tine lettmelk',
      quantity: { quantityBase: 1000, unit: 'ml' },
    });
    await service.create(H, 'u1', body);
    expect(repo.create).toHaveBeenCalledWith(
      H,
      'u1',
      { text: 'Tine lettmelk', ingredientId: MELK, quantityBase: 1000, unit: 'ml' },
      null,
    );
  });

  it('a text that matches nothing is not linked', async () => {
    const { service, repo } = setup();
    await service.create(H, 'u1', createShoppingItemSchema.parse({ text: 'Tannkrem' }));
    expect(vi.mocked(repo.create).mock.calls[0]?.[2]).toMatchObject({
      ingredientId: null,
      quantityBase: null,
      unit: null,
    });
  });

  it('the same clientRequestId again answers with the saved line and creates nothing', async () => {
    const { service, repo } = setup();
    vi.mocked(repo.findByDedupeKey).mockResolvedValue(LINE_MELK);
    const body = createShoppingItemSchema.parse({
      text: 'Melk',
      clientRequestId: '0199f0a0-0000-7000-8000-0000000000aa',
    });
    const { created, response } = await service.create(H, 'u1', body);
    expect(created).toBe(false);
    expect(response.item.id).toBe(LINE_MELK);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('a lost race on the dedupe key answers with the line that won', async () => {
    const { service, repo } = setup();
    vi.mocked(repo.findByDedupeKey).mockResolvedValueOnce(null).mockResolvedValueOnce(LINE_MELK);
    vi.mocked(repo.create).mockResolvedValue({ kind: 'duplicate' });
    const body = createShoppingItemSchema.parse({
      text: 'Melk',
      clientRequestId: '0199f0a0-0000-7000-8000-0000000000aa',
    });
    expect((await service.create(H, 'u1', body)).created).toBe(false);
  });
});

describe('FR-SHOP-001 update', () => {
  it('sets checked with a time, and clears the time when unchecked', async () => {
    const { service, repo } = setup();
    await service.update(H, LINE_OPEN, updateShoppingItemSchema.parse({ checked: true }));
    expect(repo.update).toHaveBeenLastCalledWith(H, LINE_OPEN, {
      checked: true,
      checkedAt: new Date('2026-10-21T10:00:00Z'),
    });
    await service.update(H, LINE_MELK, updateShoppingItemSchema.parse({ checked: false }));
    expect(repo.update).toHaveBeenLastCalledWith(H, LINE_MELK, { checked: false, checkedAt: null });
  });

  it('null clears both quantity and unit', async () => {
    const { service, repo } = setup();
    await service.update(H, LINE_MELK, updateShoppingItemSchema.parse({ quantity: null }));
    expect(repo.update).toHaveBeenLastCalledWith(H, LINE_MELK, { quantityBase: null, unit: null });
  });

  it('a line that is not in the household is 404', async () => {
    const { service, repo } = setup();
    vi.mocked(repo.update).mockResolvedValue(false);
    expect((await errorOf(service.update(H, ITEM, { checked: true }))).statusCode).toBe(404);
  });

  it('a second open line for the same ingredient is 409 alreadyOnList', async () => {
    const { service, repo } = setup();
    vi.mocked(repo.update).mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const error = await errorOf(service.update(H, LINE_MELK, { checked: false }));
    expect([error.statusCode, error.code]).toEqual([409, 'errors.shopping.alreadyOnList']);
  });
});

describe('FR-SHOP-002 addFromRecipe', () => {
  it('uses the ingredient name as text and its base unit', async () => {
    const { service, recipeWrites } = setup();
    const body = addFromRecipeSchema.parse({
      lines: [
        { ingredientId: MELK, quantityBase: 500 },
        { ingredientId: EGG, quantityBase: null },
      ],
    });
    await service.addFromRecipe(H, 'u1', RECIPE, body);
    expect(recipeWrites[0]).toEqual([
      { ingredientId: MELK, text: 'Melk', quantityBase: 500, unit: 'ml' },
      { ingredientId: EGG, text: 'Egg', quantityBase: null, unit: 'stk' },
    ]);
  });

  it('an ingredient that is not in the recipe is refused, and nothing is written', async () => {
    const { service, repo } = setup();
    const body = addFromRecipeSchema.parse({ lines: [{ ingredientId: SALT, quantityBase: 5 }] });
    const error = await errorOf(service.addFromRecipe(H, 'u1', RECIPE, body));
    expect(error.fields).toEqual({ 'lines.0.ingredientId': 'validation.shopping.notInRecipe' });
    expect(repo.addFromRecipe).not.toHaveBeenCalled();
  });

  it('an unknown recipe is 404', async () => {
    const { service } = setup();
    const body = addFromRecipeSchema.parse({ lines: [{ ingredientId: MELK, quantityBase: 5 }] });
    expect((await errorOf(service.addFromRecipe(H, 'u1', ITEM, body))).statusCode).toBe(404);
  });
});

describe('FR-SHOP-003 toInventory', () => {
  const stock = (over: Record<string, unknown>) =>
    toInventorySchema.parse({
      lines: [
        {
          shoppingItemId: LINE_MELK,
          quantityBase: 500,
          locationId: FRIDGE,
          target: { kind: 'existing', itemId: ITEM },
          ...over,
        },
      ],
    });

  it('writes a batch without price or purchase (ADR-0007, decision 4)', async () => {
    const { service, stockWrites } = setup();
    const result = await service.toInventory(
      H,
      'u1',
      stock({ expiry: { kind: 'use_by', date: '2026-10-25' } }),
    );
    expect(result).toEqual({ added: 1, itemIds: [ITEM] });
    expect(stockWrites[0]?.[0]).toEqual({
      shoppingItemId: LINE_MELK,
      itemId: ITEM,
      newItem: null,
      batch: {
        quantityBase: 500,
        locationId: FRIDGE,
        expiryKind: 'use_by',
        expiryDate: '2026-10-25',
        priceOre: null,
        purchasedOn: null,
      },
    });
  });

  it('a new item keeps the automatic link when its name matches the line ingredient', async () => {
    const { service, stockWrites } = setup();
    await service.toInventory(
      H,
      'u1',
      stock({ target: { kind: 'new', name: 'Lettmelk', categoryKey: 'dairy', unit: 'ml' } }),
    );
    expect(stockWrites[0]?.[0]?.newItem).toEqual({
      name: 'Lettmelk',
      categoryKey: 'dairy',
      unit: 'ml',
      ingredientMatch: 'auto',
      ingredientId: null,
    });
  });

  it('a new item with another name is linked by hand, so the recipe matches it again', async () => {
    const { service, stockWrites } = setup();
    await service.toInventory(
      H,
      'u1',
      stock({ target: { kind: 'new', name: 'Q Gårdsmelk', categoryKey: 'dairy', unit: 'ml' } }),
    );
    expect(stockWrites[0]?.[0]?.newItem).toMatchObject({
      ingredientMatch: 'manual',
      ingredientId: MELK,
    });
  });

  it('an open, unknown or foreign line is 409, and nothing is written', async () => {
    for (const shoppingItemId of [LINE_OPEN, ITEM]) {
      const { service, repo } = setup();
      const error = await errorOf(service.toInventory(H, 'u1', stock({ shoppingItemId })));
      expect([error.statusCode, error.code]).toEqual([409, 'errors.shopping.changedMeanwhile']);
      expect(repo.toInventory).not.toHaveBeenCalled();
    }
  });

  it('a place or item from another household is a field error', async () => {
    const { service, repo } = setup();
    const error = await errorOf(
      service.toInventory(
        H,
        'u1',
        stock({ locationId: RECIPE, target: { kind: 'existing', itemId: RECIPE } }),
      ),
    );
    expect(error.fields).toEqual({
      'lines.0.locationId': 'validation.location.notFound',
      'lines.0.target.itemId': 'validation.shopping.itemNotFound',
    });
    expect(repo.toInventory).not.toHaveBeenCalled();
  });

  it('lines that changed during the write (repo returns null) are 409', async () => {
    const { service, repo } = setup();
    vi.mocked(repo.toInventory).mockResolvedValue(null);
    expect((await errorOf(service.toInventory(H, 'u1', stock({})))).statusCode).toBe(409);
  });

  it('a place deleted during the write (foreign key) is 409', async () => {
    const { service, repo } = setup();
    vi.mocked(repo.toInventory).mockRejectedValue(
      Object.assign(new Error('fk'), { code: 'P2003' }),
    );
    expect((await errorOf(service.toInventory(H, 'u1', stock({})))).statusCode).toBe(409);
  });
});
