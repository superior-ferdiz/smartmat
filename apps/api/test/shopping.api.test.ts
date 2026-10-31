import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  API_ERRORS,
  type AddFromRecipeResponse,
  type ItemResponse,
  type RecipeDetail,
  type ShoppingItemResponse,
  type ToInventoryResponse,
} from '@smartmat/shared';
import { applySeed, readSeedDirectory } from '../src/modules/recipes/seed';
import { createShoppingRepo } from '../src/modules/shopping/repo';
import { createFakeClock } from '../src/test/fakes';
import { FIXTURE_SEED_DIR, seedFixtureRecipes } from './fixtureSeed';
import {
  call,
  captureLog,
  createTestApp,
  PASSWORD,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { createItem, inventoryPath, locationsOf } from './inventoryHelpers';
import { addLine, ingredientIds, recipeIdOf, shoppingList, shoppingPath } from './shoppingHelpers';

/*
 * FR-SHOP-001–003 against the real test database, with the fictional test recipes from
 * test/fixtures/seed/. "Today" is 2026-10-21 in Norway.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
const log = captureLog();
let app: FastifyInstance;
let kari: Client;
let ingredients: Map<string, string>;
let pancakes: string;

beforeAll(async () => {
  app = await createTestApp(db, {
    now: clock.now,
    logStream: log.stream,
    config: { logLevel: 'info' },
  });
});
afterAll(() => app.close());

beforeEach(async () => {
  kari = await registerUser(app, { displayName: 'Kari' });
  ingredients = await ingredientIds(app, kari);
  pancakes = await recipeIdOf(app, kari, 'testrett-pannekaker');
});

const id = (key: string) => {
  const found = ingredients.get(key);
  if (!found) throw new Error(`no ingredient ${key}`);
  return found;
};

const patch = (itemId: string, body: unknown, client = kari) =>
  call(app, 'PATCH', shoppingPath(client, `/items/${itemId}`), { client, body });

const fromRecipe = (recipeId: string, lines: unknown, client = kari) =>
  call(app, 'POST', shoppingPath(client, `/from-recipe/${recipeId}`), {
    client,
    body: { lines },
  });

const toInventory = (lines: unknown, client = kari) =>
  call(app, 'POST', shoppingPath(client, '/to-inventory'), { client, body: { lines } });

const byText = (items: ShoppingItemResponse[], text: string) => {
  const found = items.find((i) => i.text === text);
  if (!found) throw new Error(`no line ${text}`);
  return found;
};

async function recipe(recipeId: string) {
  const response = await call(
    app,
    'GET',
    `/households/${kari.user.householdId}/recipes/${recipeId}`,
    { client: kari },
  );
  return response.json<RecipeDetail>();
}

describe('spec 06 decision 1: one list per household', () => {
  it('a new household has one, empty list', async () => {
    expect(await shoppingList(app, kari)).toEqual([]);
    expect(await db.shoppingList.count({ where: { householdId: kari.user.householdId } })).toBe(1);
  });

  it('deleting the account deletes the list and its lines (cascade)', async () => {
    await addLine(app, kari, { text: 'Melk' });
    const response = await call(app, 'DELETE', '/me', {
      client: kari,
      body: { password: PASSWORD },
    });
    expect(response.statusCode).toBe(204);
    expect(await db.shoppingList.count()).toBe(0);
    expect(await db.shoppingListItem.count()).toBe(0);
  });
});

describe('FR-SHOP-001 manual list', () => {
  it('adds a line with a quantity in base units, linked to the ingredient its text matches', async () => {
    const { item, similarItemId } = await addLine(app, kari, {
      text: '  Tine lettmelk ',
      quantity: { quantityBase: 1500, unit: 'ml' },
    });
    expect(item).toMatchObject({
      text: 'Tine lettmelk',
      ingredientId: id('melk'),
      quantityBase: 1500,
      unit: 'ml',
      checked: false,
      checkedAt: null,
      recipes: [],
    });
    expect(similarItemId).toBeNull();
  });

  it('a text that matches no ingredient is saved without a link, and without a quantity', async () => {
    const { item } = await addLine(app, kari, { text: 'Tannkrem' });
    expect(item).toMatchObject({ ingredientId: null, quantityBase: null, unit: null });
  });

  it('a second line for an ingredient already open is added unlinked, pointing to the first', async () => {
    const first = await addLine(app, kari, { text: 'Melk' });
    const second = await addLine(app, kari, { text: 'Lettmelk' });
    expect(second.item.ingredientId).toBeNull();
    expect(second.similarItemId).toBe(first.item.id);
    expect(await shoppingList(app, kari)).toHaveLength(2);
  });

  it('NFR-DATA-002: the same clientRequestId twice gives one line (200 the second time)', async () => {
    const body = { text: 'Egg', clientRequestId: '0199f0a0-0000-7000-8000-0000000000aa' };
    const first = await call(app, 'POST', shoppingPath(kari, '/items'), { client: kari, body });
    const again = await call(app, 'POST', shoppingPath(kari, '/items'), { client: kari, body });
    expect([first.statusCode, again.statusCode]).toEqual([201, 200]);
    expect(again.json().item.id).toBe(first.json().item.id);
    expect(await db.shoppingListItem.count()).toBe(1);
  });

  it('NFR-DATA-002: the same clientRequestId at the same moment still gives one line', async () => {
    const body = { text: 'Egg', clientRequestId: '0199f0a0-0000-7000-8000-0000000000bb' };
    const responses = await Promise.all(
      [1, 2, 3].map(() => call(app, 'POST', shoppingPath(kari, '/items'), { client: kari, body })),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    expect(await db.shoppingListItem.count()).toBe(1);
  });

  it('checks and unchecks by setting the value; the same request twice changes nothing more', async () => {
    const { item } = await addLine(app, kari, { text: 'Melk' });
    const checked = await patch(item.id, { checked: true });
    expect(checked.statusCode).toBe(200);
    expect(checked.json()).toMatchObject({ checked: true, checkedAt: '2026-10-21T10:00:00.000Z' });
    clock.advance(60_000);
    expect((await patch(item.id, { checked: true })).json().checked).toBe(true);
    const unchecked = await patch(item.id, { checked: false });
    expect(unchecked.json()).toMatchObject({ checked: false, checkedAt: null });
  });

  it('unchecking when another open line has the ingredient is 409, and nothing changes', async () => {
    const { item: first } = await addLine(app, kari, { text: 'Melk' });
    await patch(first.id, { checked: true });
    await addLine(app, kari, { text: 'Lettmelk' }); // linked: the first one is checked now
    const response = await patch(first.id, { checked: false });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe(API_ERRORS.shoppingAlreadyOnList);
    expect((await shoppingList(app, kari)).find((i) => i.id === first.id)?.checked).toBe(true);
  });

  it('corrects the text and quantity, and null removes the quantity; the link stays', async () => {
    const { item } = await addLine(app, kari, {
      text: 'Melk',
      quantity: { quantityBase: 1000, unit: 'ml' },
    });
    const corrected = await patch(item.id, {
      text: 'Melk, laktosefri',
      quantity: { quantityBase: 2000, unit: 'ml' },
    });
    expect(corrected.json()).toMatchObject({
      text: 'Melk, laktosefri',
      quantityBase: 2000,
      ingredientId: id('melk'),
    });
    const cleared = await patch(item.id, { quantity: null });
    expect(cleared.json()).toMatchObject({ quantityBase: null, unit: null });
  });

  it('refuses invalid input on the server (NFR-SEC-002)', async () => {
    const { item } = await addLine(app, kari, { text: 'Melk' });
    for (const body of [
      { text: '' },
      { text: 'x'.repeat(101) },
      { text: 'Melk', quantity: { quantityBase: 1.5, unit: 'ml' } },
      { text: 'Melk', quantity: { quantityBase: 1 } },
    ]) {
      const response = await call(app, 'POST', shoppingPath(kari, '/items'), {
        client: kari,
        body,
      });
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await patch(item.id, {})).statusCode).toBe(400);
  });

  it('removes one line (204, then 404), and "clear checked" removes only checked lines', async () => {
    const a = await addLine(app, kari, { text: 'Melk' });
    const b = await addLine(app, kari, { text: 'Egg' });
    await addLine(app, kari, { text: 'Brød' });
    const del = () =>
      call(app, 'DELETE', shoppingPath(kari, `/items/${a.item.id}`), { client: kari });
    expect((await del()).statusCode).toBe(204);
    expect((await del()).statusCode).toBe(404);

    await patch(b.item.id, { checked: true });
    const cleared = await call(app, 'POST', shoppingPath(kari, '/clear-checked'), { client: kari });
    expect(cleared.json()).toEqual({ removed: 1 });
    expect((await shoppingList(app, kari)).map((i) => i.text)).toEqual(['Brød']);
  });

  it('lists open lines first (oldest first), then checked ones (last checked first)', async () => {
    const lines: ShoppingItemResponse[] = [];
    for (const text of ['A', 'B', 'C', 'D']) {
      lines.push((await addLine(app, kari, { text })).item);
      clock.advance(1000);
    }
    await patch(lines[0]!.id, { checked: true });
    clock.advance(1000);
    await patch(lines[2]!.id, { checked: true });
    expect((await shoppingList(app, kari)).map((i) => i.text)).toEqual(['B', 'D', 'C', 'A']);
  });
});

describe('FR-SHOP-002 from a recipe', () => {
  it('adds the chosen lines with the ingredient name, amount and base unit, and records the recipe', async () => {
    const response = await fromRecipe(pancakes, [
      { ingredientId: id('melk'), quantityBase: 500 },
      { ingredientId: id('egg'), quantityBase: 3 },
    ]);
    expect(response.statusCode).toBe(200);
    expect(response.json<AddFromRecipeResponse>()).toEqual({ created: 2, merged: 0, skipped: 0 });
    const items = await shoppingList(app, kari);
    expect(byText(items, 'Melk')).toMatchObject({
      ingredientId: id('melk'),
      quantityBase: 500,
      unit: 'ml',
      recipes: [{ recipeId: pancakes, title: 'Testrett: pannekaker', quantityBase: 500 }],
    });
    expect(byText(items, 'Egg')).toMatchObject({ quantityBase: 3, unit: 'stk' });
  });

  it('the same recipe again changes nothing (no doubled amounts)', async () => {
    const lines = [{ ingredientId: id('melk'), quantityBase: 500 }];
    await fromRecipe(pancakes, lines);
    const again = await fromRecipe(pancakes, lines);
    expect(again.json()).toEqual({ created: 0, merged: 0, skipped: 1 });
    expect(await shoppingList(app, kari)).toMatchObject([{ quantityBase: 500 }]);
  });

  it('merges into an open line for the same ingredient: same unit adds up', async () => {
    await addLine(app, kari, { text: 'Lettmelk', quantity: { quantityBase: 1000, unit: 'ml' } });
    const response = await fromRecipe(pancakes, [{ ingredientId: id('melk'), quantityBase: 500 }]);
    expect(response.json()).toEqual({ created: 0, merged: 1, skipped: 0 });
    const items = await shoppingList(app, kari);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      text: 'Lettmelk',
      quantityBase: 1500,
      recipes: [{ recipeId: pancakes, quantityBase: 500 }],
    });
  });

  it('an open line without an amount keeps having none; the recipe share is still recorded', async () => {
    await addLine(app, kari, { text: 'Melk' });
    await fromRecipe(pancakes, [{ ingredientId: id('melk'), quantityBase: 500 }]);
    expect(await shoppingList(app, kari)).toMatchObject([
      { quantityBase: null, unit: null, recipes: [{ quantityBase: 500 }] },
    ]);
  });

  it('a checked line is not merged into: a new open line is made', async () => {
    const { item } = await addLine(app, kari, { text: 'Melk' });
    await patch(item.id, { checked: true });
    expect(
      (await fromRecipe(pancakes, [{ ingredientId: id('melk'), quantityBase: 500 }])).json(),
    ).toMatchObject({ created: 1 });
    expect(await shoppingList(app, kari)).toHaveLength(2);
  });

  it('two recipes add to the same line', async () => {
    const chicken = await recipeIdOf(app, kari, 'testrett-kylling-og-ris');
    const detail = await recipe(chicken);
    const lok = detail.lines.find((l) => l.ingredientName === 'Løk');
    if (!lok) throw new Error('test recipe changed: no Løk');
    await addLine(app, kari, { text: 'Løk', quantity: { quantityBase: 100, unit: 'g' } });
    await fromRecipe(chicken, [{ ingredientId: id('lok'), quantityBase: 200 }]);
    expect(await shoppingList(app, kari)).toMatchObject([
      { quantityBase: 300, recipes: [{ recipeId: chicken, quantityBase: 200 }] },
    ]);
  });

  it('the same recipe sent twice at the same moment gives one line per ingredient, not doubled', async () => {
    const lines = [
      { ingredientId: id('melk'), quantityBase: 500 },
      { ingredientId: id('egg'), quantityBase: 3 },
    ];
    const responses = await Promise.all([1, 2, 3].map(() => fromRecipe(pancakes, lines)));
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    const items = await shoppingList(app, kari);
    expect(items).toHaveLength(2);
    expect(byText(items, 'Melk').quantityBase).toBe(500);
    expect(await db.shoppingListItemRecipe.count()).toBe(2);
  });

  it('an ingredient that is not in the recipe is 400, and nothing is added', async () => {
    const response = await fromRecipe(pancakes, [
      { ingredientId: id('melk'), quantityBase: 500 },
      { ingredientId: id('ris'), quantityBase: 100 },
    ]);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'lines.1.ingredientId': 'validation.shopping.notInRecipe',
    });
    expect(await db.shoppingListItem.count()).toBe(0);
  });

  it('an unknown recipe is 404', async () => {
    const response = await fromRecipe('0199f0a0-0000-7000-8000-0000000000cc', [
      { ingredientId: id('melk'), quantityBase: 500 },
    ]);
    expect(response.statusCode).toBe(404);
  });

  it('spec 06 seed rule: an ingredient used by a shopping line is kept when it leaves the seed files', async () => {
    await addLine(app, kari, { text: 'Sesamfrø' });
    expect((await shoppingList(app, kari))[0]?.ingredientId).toBe(id('sesamfro'));
    const seed = readSeedDirectory(FIXTURE_SEED_DIR);
    try {
      const summary = await applySeed(db, {
        ingredients: seed.ingredients.filter((i) => i.key !== 'sesamfro'),
        recipes: seed.recipes.filter((r) =>
          r.ingredients.every((l) => l.ingredientKey !== 'sesamfro'),
        ),
      });
      expect(summary.keptIngredients).toEqual(['sesamfro']);
      expect((await shoppingList(app, kari))[0]?.ingredientId).toBe(id('sesamfro'));
    } finally {
      await seedFixtureRecipes(db);
    }
  });
});

describe('FR-SHOP-003 checked lines into the inventory', () => {
  async function checkedLine(text: string, quantity?: unknown) {
    const { item } = await addLine(app, kari, quantity ? { text, quantity } : { text });
    await patch(item.id, { checked: true });
    return item;
  }

  it('a new item from a recipe line matches the recipe again, and the recipe ranks higher', async () => {
    const before = await recipe(pancakes);
    await fromRecipe(pancakes, [{ ingredientId: id('melk'), quantityBase: 500 }]);
    const line = (await shoppingList(app, kari))[0]!;
    await patch(line.id, { checked: true });
    const { fridge } = await locationsOf(app, kari);

    const response = await toInventory([
      {
        shoppingItemId: line.id,
        quantityBase: 500,
        locationId: fridge,
        expiry: { kind: 'use_by', date: '2026-10-28' },
        // A name the aliases do not know: the line's ingredient is set by hand.
        target: { kind: 'new', name: 'Gårdsmelk', categoryKey: 'dairy', unit: 'ml' },
      },
    ]);
    expect(response.statusCode).toBe(200);
    const { added, itemIds } = response.json<ToInventoryResponse>();
    expect(added).toBe(1);

    const item = (
      await call(app, 'GET', inventoryPath(kari, `/items/${itemIds[0]}`), { client: kari })
    ).json<ItemResponse>();
    expect(item).toMatchObject({
      name: 'Gårdsmelk',
      unit: 'ml',
      ingredientMatch: 'manual',
      ingredientId: id('melk'),
    });
    // ADR-0007, decision 4: stock only – no price and no purchase.
    expect(item.batches).toMatchObject([
      {
        quantityBase: 500,
        locationId: fridge,
        expiryKind: 'use_by',
        expiryDate: '2026-10-28',
        priceOre: null,
        purchasedOn: null,
        purchaseId: null,
      },
    ]);
    expect(await db.inventoryEvent.count({ where: { type: 'add' } })).toBe(1);
    expect(await db.purchase.count()).toBe(0);
    // Decision 5: the line left the list.
    expect(await shoppingList(app, kari)).toEqual([]);

    const after = await recipe(pancakes);
    expect(after.lines.find((l) => l.ingredientName === 'Melk')?.status).toBe('enough');
    expect(after.score.total).toBeGreaterThan(before.score.total);
  });

  it('a new item whose name matches by itself keeps the automatic link', async () => {
    const line = await checkedLine('Lettmelk', { quantityBase: 1000, unit: 'ml' });
    const { fridge } = await locationsOf(app, kari);
    const response = await toInventory([
      {
        shoppingItemId: line.id,
        quantityBase: 1000,
        locationId: fridge,
        target: { kind: 'new', name: 'Lettmelk', categoryKey: 'dairy', unit: 'ml' },
      },
    ]);
    const item = await db.inventoryItem.findUniqueOrThrow({
      where: { id: response.json<ToInventoryResponse>().itemIds[0]! },
    });
    expect([item.ingredientMatch, item.ingredientId]).toEqual(['auto', null]);
  });

  it('onto an existing item: a new batch, the item is not changed', async () => {
    const existing = await createItem(app, kari, { name: 'Lettmelk', quantityBase: 200 });
    const line = await checkedLine('Melk');
    const { fridge } = await locationsOf(app, kari);
    const response = await toInventory([
      {
        shoppingItemId: line.id,
        quantityBase: 1000,
        locationId: fridge,
        target: { kind: 'existing', itemId: existing.id },
      },
    ]);
    expect(response.json<ToInventoryResponse>().itemIds).toEqual([existing.id]);
    const batches = await db.inventoryBatch.findMany({ where: { itemId: existing.id } });
    expect(batches.map((b) => b.quantityBase).sort((a, b) => a - b)).toEqual([200, 1000]);
  });

  it('several lines in one request; everything or nothing', async () => {
    const a = await checkedLine('Melk');
    const b = await checkedLine('Egg');
    const { fridge } = await locationsOf(app, kari);
    const newItem = (name: string, unit: string) => ({
      kind: 'new',
      name,
      categoryKey: 'dairy',
      unit,
    });
    const bad = await toInventory([
      {
        shoppingItemId: a.id,
        quantityBase: 1000,
        locationId: fridge,
        target: newItem('Melk', 'ml'),
      },
      {
        shoppingItemId: b.id,
        quantityBase: 6,
        locationId: '0199f0a0-0000-7000-8000-0000000000dd',
        target: newItem('Egg', 'stk'),
      },
    ]);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields).toEqual({
      'lines.1.locationId': 'validation.location.notFound',
    });
    expect(await db.inventoryItem.count()).toBe(0);
    expect(await shoppingList(app, kari)).toHaveLength(2);

    const good = await toInventory([
      {
        shoppingItemId: a.id,
        quantityBase: 1000,
        locationId: fridge,
        target: newItem('Melk', 'ml'),
      },
      { shoppingItemId: b.id, quantityBase: 6, locationId: fridge, target: newItem('Egg', 'stk') },
    ]);
    expect(good.json()).toMatchObject({ added: 2 });
    expect(await db.inventoryBatch.count()).toBe(2);
  });

  it('an open (unchecked) line is refused with 409', async () => {
    const { item } = await addLine(app, kari, { text: 'Melk' });
    const { fridge } = await locationsOf(app, kari);
    const response = await toInventory([
      {
        shoppingItemId: item.id,
        quantityBase: 1000,
        locationId: fridge,
        target: { kind: 'new', name: 'Melk', categoryKey: 'dairy', unit: 'ml' },
      },
    ]);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe(API_ERRORS.shoppingChangedMeanwhile);
    expect(await db.inventoryBatch.count()).toBe(0);
  });

  it('sent twice: the second is 409 and there is still one batch', async () => {
    const line = await checkedLine('Melk');
    const { fridge } = await locationsOf(app, kari);
    const body = [
      {
        shoppingItemId: line.id,
        quantityBase: 1000,
        locationId: fridge,
        target: { kind: 'new', name: 'Melk', categoryKey: 'dairy', unit: 'ml' },
      },
    ];
    expect((await toInventory(body)).statusCode).toBe(200);
    expect((await toInventory(body)).statusCode).toBe(409);
    expect(await db.inventoryBatch.count()).toBe(1);
    expect(await db.inventoryItem.count()).toBe(1);
  });

  it('the write itself refuses a line that was unticked after the check (race), and saves nothing', async () => {
    // The service checks that every line is ticked; this is the second guard, inside the transaction, for a
    // line unticked on another phone between that check and the write.
    const { item } = await addLine(app, kari, { text: 'Melk' });
    const { fridge } = await locationsOf(app, kari);
    const saved = await createShoppingRepo(db).toInventory(kari.user.householdId, kari.user.id, [
      {
        shoppingItemId: item.id,
        itemId: null,
        newItem: {
          name: 'Melk',
          categoryKey: 'dairy',
          unit: 'ml',
          ingredientMatch: 'auto',
          ingredientId: null,
        },
        batch: {
          quantityBase: 1000,
          locationId: fridge,
          expiryKind: null,
          expiryDate: null,
          priceOre: null,
          purchasedOn: null,
        },
      },
    ]);
    expect(saved).toBeNull();
    expect(await db.inventoryItem.count()).toBe(0);
    expect(await shoppingList(app, kari)).toHaveLength(1);
  });

  it('sent at the same moment from two places: exactly one wins, one batch, one item', async () => {
    const line = await checkedLine('Melk');
    const { fridge } = await locationsOf(app, kari);
    const body = [
      {
        shoppingItemId: line.id,
        quantityBase: 1000,
        locationId: fridge,
        target: { kind: 'new', name: 'Melk', categoryKey: 'dairy', unit: 'ml' },
      },
    ];
    const responses = await Promise.all([1, 2, 3, 4].map(() => toInventory(body)));
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409, 409, 409]);
    expect(await db.inventoryBatch.count()).toBe(1);
    expect(await db.inventoryItem.count()).toBe(1);
    expect(await db.inventoryEvent.count()).toBe(1);
  });
});

describe('NFR-SEC-004 logging', () => {
  it('line texts never end up in the log', async () => {
    await addLine(app, kari, { text: 'Hemmelig handlevare' });
    await call(app, 'POST', shoppingPath(kari, '/items'), { client: kari, body: { text: '' } });
    expect(log.text()).not.toContain('Hemmelig handlevare');
  });
});
