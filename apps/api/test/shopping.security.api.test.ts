import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ERRORS, CSRF_HEADER } from '@smartmat/shared';
import { createFakeClock } from '../src/test/fakes';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { createItem, locationsOf } from './inventoryHelpers';
import { addLine, ingredientIds, recipeIdOf, shoppingList } from './shoppingHelpers';

/*
 * NFR-SEC-001 for the shopping list (spec 06). Ola tries to reach Kari's list in every way:
 *   A) Kari's household id in the URL        → 404 on all seven endpoints, nothing changes
 *   B) Ola's own household, Kari's line id   → 404 (PATCH/DELETE), 409 (to-inventory), nothing changes
 *   C) Ola's own lines with Kari's place or item in "to the inventory" → 400, nothing changes
 *   D) what Ola does to his own list never touches Kari's (clear checked, merge from a recipe)
 *   E) not logged in / no CSRF token          → 401 / 403
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let kariLine: string;
let kariItem: string;
let kariFridge: string;
let recipeId: string;
let melk: string;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
});
afterAll(() => app.close());

async function seed() {
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  melk = (await ingredientIds(app, kari)).get('melk')!;
  recipeId = await recipeIdOf(app, kari, 'testrett-pannekaker');
  kariLine = (await addLine(app, kari, { text: 'Melk' })).item.id;
  await call(app, 'PATCH', `/households/${kari.user.householdId}/shopping-list/items/${kariLine}`, {
    client: kari,
    body: { checked: true },
  });
  await addLine(app, kari, { text: 'Egg' });
  kariItem = (await createItem(app, kari, { name: 'Lettmelk' })).id;
  kariFridge = (await locationsOf(app, kari)).fridge;
}

async function snapshot() {
  const [lists, items, shares, inventory, batches] = await Promise.all([
    db.shoppingList.findMany({ orderBy: { id: 'asc' } }),
    db.shoppingListItem.findMany({ orderBy: { id: 'asc' } }),
    db.shoppingListItemRecipe.findMany({ orderBy: [{ itemId: 'asc' }, { recipeId: 'asc' }] }),
    db.inventoryItem.findMany({ orderBy: { id: 'asc' } }),
    db.inventoryBatch.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return JSON.stringify({ lists, items, shares, inventory, batches });
}

const stockLine = (shoppingItemId: string, locationId: string, target: unknown) => ({
  shoppingItemId,
  quantityBase: 1000,
  locationId,
  target,
});

describe('NFR-SEC-001 shopping list: no access to another household', () => {
  it("A) Kari's household id in the URL: 404 on every endpoint, and nothing changes", async () => {
    await seed();
    const before = await snapshot();
    const base = `/households/${kari.user.householdId}/shopping-list`;
    const requests = [
      ['GET', base, undefined],
      ['POST', `${base}/items`, { text: 'Fra Ola' }],
      ['PATCH', `${base}/items/${kariLine}`, { checked: false }],
      ['DELETE', `${base}/items/${kariLine}`, undefined],
      ['POST', `${base}/clear-checked`, undefined],
      [
        'POST',
        `${base}/from-recipe/${recipeId}`,
        { lines: [{ ingredientId: melk, quantityBase: 1 }] },
      ],
      [
        'POST',
        `${base}/to-inventory`,
        {
          lines: [stockLine(kariLine, kariFridge, { kind: 'existing', itemId: kariItem })],
        },
      ],
    ] as const;
    expect(requests).toHaveLength(7);
    for (const [method, path, body] of requests) {
      const response = await call(app, method, path, { client: ola, body });
      expect(response.statusCode, `${method} ${path}`).toBe(404);
      expect(response.json(), `${method} ${path}`).toEqual({
        error: { code: API_ERRORS.notFound },
      });
    }
    expect(await snapshot()).toBe(before);
  });

  it("B) Ola's own household with Kari's line id: 404 / 409, and nothing changes", async () => {
    await seed();
    const { fridge } = await locationsOf(app, ola);
    const before = await snapshot();
    const base = `/households/${ola.user.householdId}/shopping-list`;
    const edit = await call(app, 'PATCH', `${base}/items/${kariLine}`, {
      client: ola,
      body: { text: 'Overtatt', checked: false },
    });
    expect(edit.statusCode).toBe(404);
    const del = await call(app, 'DELETE', `${base}/items/${kariLine}`, { client: ola });
    expect(del.statusCode).toBe(404);
    const stock = await call(app, 'POST', `${base}/to-inventory`, {
      client: ola,
      body: {
        lines: [
          stockLine(kariLine, fridge, {
            kind: 'new',
            name: 'Melk',
            categoryKey: 'dairy',
            unit: 'ml',
          }),
        ],
      },
    });
    expect(stock.statusCode).toBe(409);
    expect(stock.json().error.code).toBe(API_ERRORS.shoppingChangedMeanwhile);
    expect(await snapshot()).toBe(before);
  });

  it("C) Ola's own checked line with Kari's place or item: 400, and nothing changes", async () => {
    await seed();
    const base = `/households/${ola.user.householdId}/shopping-list`;
    const olaLine = (await addLine(app, ola, { text: 'Melk' })).item.id;
    await call(app, 'PATCH', `${base}/items/${olaLine}`, { client: ola, body: { checked: true } });
    const { fridge } = await locationsOf(app, ola);
    const before = await snapshot();

    const foreignPlace = await call(app, 'POST', `${base}/to-inventory`, {
      client: ola,
      body: {
        lines: [
          stockLine(olaLine, kariFridge, {
            kind: 'new',
            name: 'Melk',
            categoryKey: 'dairy',
            unit: 'ml',
          }),
        ],
      },
    });
    expect(foreignPlace.statusCode).toBe(400);
    expect(foreignPlace.json().error.fields).toEqual({
      'lines.0.locationId': 'validation.location.notFound',
    });

    const foreignItem = await call(app, 'POST', `${base}/to-inventory`, {
      client: ola,
      body: { lines: [stockLine(olaLine, fridge, { kind: 'existing', itemId: kariItem })] },
    });
    expect(foreignItem.statusCode).toBe(400);
    expect(foreignItem.json().error.fields).toEqual({
      'lines.0.target.itemId': 'validation.shopping.itemNotFound',
    });
    expect(await snapshot()).toBe(before);
  });

  it("D) Ola's own clear-checked and recipe merge never touch Kari's lines", async () => {
    await seed();
    const kariBefore = await shoppingList(app, kari);
    const base = `/households/${ola.user.householdId}/shopping-list`;
    const cleared = await call(app, 'POST', `${base}/clear-checked`, { client: ola });
    expect(cleared.json()).toEqual({ removed: 0 });
    // Kari has an open line for egg; Ola's recipe must make his own line, not merge into hers.
    const merged = await call(app, 'POST', `${base}/from-recipe/${recipeId}`, {
      client: ola,
      body: {
        lines: [{ ingredientId: (await ingredientIds(app, ola)).get('egg')!, quantityBase: 3 }],
      },
    });
    expect(merged.json()).toEqual({ created: 1, merged: 0, skipped: 0 });
    expect(await shoppingList(app, kari)).toEqual(kariBefore);
    expect((await shoppingList(app, ola)).map((l) => l.text)).toEqual(['Egg']);
  });

  it('E) every endpoint needs a session; changes need the CSRF token', async () => {
    await seed();
    const base = `/households/${kari.user.householdId}/shopping-list`;
    const before = await snapshot();
    // Valid bodies, so the request gets past validation and is stopped by the session/CSRF check itself.
    for (const [method, path, body] of [
      ['GET', base, undefined],
      ['POST', `${base}/items`, { text: 'Melk' }],
      ['PATCH', `${base}/items/${kariLine}`, { checked: false }],
      ['DELETE', `${base}/items/${kariLine}`, undefined],
      ['POST', `${base}/clear-checked`, undefined],
      [
        'POST',
        `${base}/from-recipe/${recipeId}`,
        { lines: [{ ingredientId: melk, quantityBase: 1 }] },
      ],
      [
        'POST',
        `${base}/to-inventory`,
        { lines: [stockLine(kariLine, kariFridge, { kind: 'existing', itemId: kariItem })] },
      ],
    ] as const) {
      const response = await call(app, method, path, { body });
      expect(response.statusCode, `${method} ${path}`).toBe(401);
      if (method === 'GET') continue;
      const noCsrf = await call(app, method, path, {
        client: kari,
        body,
        headers: { [CSRF_HEADER]: 'wrong' },
      });
      expect(noCsrf.statusCode, `${method} ${path} without CSRF`).toBe(403);
    }
    expect(await snapshot()).toBe(before);
  });
});
