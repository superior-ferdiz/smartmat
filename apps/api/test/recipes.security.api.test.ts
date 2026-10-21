import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  API_ERRORS,
  CSRF_HEADER,
  type IngredientResponse,
  type RecipeDetail,
  type RecipeListResponse,
} from '@smartmat/shared';
import { createFakeClock } from '../src/test/fakes';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { createItem } from './inventoryHelpers';

/*
 * NFR-SEC-001 for recipes (spec 05). Recipes are global, but how they rank is built from one household's
 * inventory and one user's allergies. So:
 *   A) Kari's household id in the URL           → 404 on every recipe endpoint (householdAccess)
 *   B) Ola's own household                       → his ranking never uses Kari's inventory
 *   C) /me/allergens                             → always the caller's own list
 *   D) linking Kari's item to an ingredient      → 404, nothing changes
 *   E) not logged in / no CSRF token             → 401 / 403
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let recipeId: string;
let kariItemId: string;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
});
afterAll(() => app.close());

async function seed() {
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  const item = await createItem(app, kari, {
    name: 'Kyllingfilet',
    unit: 'g',
    quantityBase: 400,
    expiry: { kind: 'use_by', date: '2026-10-22' },
  });
  kariItemId = item.id;
  await call(app, 'PUT', '/me/allergens', { client: kari, body: { allergens: ['milk'] } });
  const list = await call(app, 'GET', `/households/${kari.user.householdId}/recipes`, {
    client: kari,
  });
  recipeId = list
    .json<RecipeListResponse>()
    .recipes.find((r) => r.slug === 'testrett-kylling-og-ris')!.id;
}

async function snapshot() {
  const [items, allergens] = await Promise.all([
    db.inventoryItem.findMany({ orderBy: { id: 'asc' } }),
    db.userAllergen.findMany({ orderBy: [{ userId: 'asc' }, { allergen: 'asc' }] }),
  ]);
  return JSON.stringify({ items, allergens });
}

describe('NFR-SEC-001 recipes: no access to another household', () => {
  it("A) Kari's household id in the URL: 404 on every recipe endpoint", async () => {
    await seed();
    const before = await snapshot();
    const h = kari.user.householdId;
    for (const path of [`/households/${h}/recipes`, `/households/${h}/recipes/${recipeId}`]) {
      const response = await call(app, 'GET', path, { client: ola });
      expect(response.statusCode, path).toBe(404);
      expect(response.json(), path).toEqual({ error: { code: API_ERRORS.notFound } });
    }
    expect(await snapshot()).toBe(before);
  });

  it("B) Ola's own ranking never uses Kari's inventory or Kari's allergies", async () => {
    await seed();
    const h = ola.user.householdId;
    const list = await call(app, 'GET', `/households/${h}/recipes`, { client: ola });
    const { recipes, userAllergens } = list.json<RecipeListResponse>();
    expect(recipes.every((r) => r.score.total === 0)).toBe(true);
    expect(recipes.every((r) => r.allergenWarnings.length === 0)).toBe(true);
    expect(userAllergens).toEqual([]);

    const detail = await call(app, 'GET', `/households/${h}/recipes/${recipeId}`, { client: ola });
    const recipe = detail.json<RecipeDetail>();
    expect(recipe.lines.every((l) => l.itemNames.length === 0 && l.haveBase === null)).toBe(true);
    expect(detail.body).not.toContain(kariItemId);

    // ...while Kari's own ranking does use it.
    const karis = await call(app, 'GET', `/households/${kari.user.householdId}/recipes`, {
      client: kari,
    });
    expect(karis.json<RecipeListResponse>().recipes[0]?.score.total).toBe(35);
  });

  it("C) /me/allergens is always the caller's own: Ola sees and changes only his", async () => {
    await seed();
    expect((await call(app, 'GET', '/me/allergens', { client: ola })).json()).toEqual({
      allergens: [],
    });
    await call(app, 'PUT', '/me/allergens', { client: ola, body: { allergens: ['fish'] } });
    expect((await call(app, 'GET', '/me/allergens', { client: kari })).json()).toEqual({
      allergens: ['milk'],
    });
    // There is no way to name another user: a userId in the body is not part of the schema.
    const withId = await call(app, 'PUT', '/me/allergens', {
      client: ola,
      body: { allergens: ['egg'], userId: kari.user.id },
    });
    expect(withId.statusCode).toBe(200);
    expect((await call(app, 'GET', '/me/allergens', { client: kari })).json()).toEqual({
      allergens: ['milk'],
    });
  });

  it("D) Ola cannot link Kari's item to an ingredient (either household id)", async () => {
    await seed();
    const ingredients = await call(app, 'GET', '/ingredients', { client: ola });
    const flote = ingredients.json<IngredientResponse[]>().find((i) => i.key === 'flote')!.id;
    const before = await snapshot();
    for (const h of [kari.user.householdId, ola.user.householdId]) {
      const response = await call(app, 'PATCH', `/households/${h}/inventory/items/${kariItemId}`, {
        client: ola,
        body: { ingredient: { match: 'manual', ingredientId: flote } },
      });
      expect(response.statusCode, h).toBe(404);
    }
    expect(await snapshot()).toBe(before);
  });

  it('E) every new endpoint needs a session; changing allergens needs the CSRF token', async () => {
    await seed();
    const h = kari.user.householdId;
    for (const [method, path] of [
      ['GET', `/households/${h}/recipes`],
      ['GET', `/households/${h}/recipes/${recipeId}`],
      ['GET', '/ingredients'],
      ['GET', '/me/allergens'],
      ['PUT', '/me/allergens'],
    ] as const) {
      const response = await call(app, method, path, { body: { allergens: [] } });
      expect(response.statusCode, `${method} ${path}`).toBe(401);
    }
    const before = await snapshot();
    const noCsrf = await call(app, 'PUT', '/me/allergens', {
      client: kari,
      body: { allergens: [] },
      headers: { [CSRF_HEADER]: 'wrong' },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(await snapshot()).toBe(before);
  });

  it('recipes and ingredients cannot be written through the API', async () => {
    await seed();
    const h = kari.user.householdId;
    for (const [method, path] of [
      ['POST', `/households/${h}/recipes`],
      ['PUT', `/households/${h}/recipes/${recipeId}`],
      ['PATCH', `/households/${h}/recipes/${recipeId}`],
      ['DELETE', `/households/${h}/recipes/${recipeId}`],
      ['POST', '/ingredients'],
    ] as const) {
      const response = await call(app, method, path, { client: kari, body: {} });
      expect(response.statusCode, `${method} ${path}`).toBe(404);
    }
    expect(await db.recipe.count()).toBe(3);
  });
});
