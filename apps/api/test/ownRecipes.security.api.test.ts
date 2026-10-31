import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CSRF_HEADER, type RecipeListResponse } from '@smartmat/shared';
import { createFakeClock } from '../src/test/fakes';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { householdPath } from './householdHelpers';
import { createOwnRecipe, ingredientIdsByKey, ownRecipeBody, recipesPath } from './recipeHelpers';
import { shoppingPath } from './shoppingHelpers';

/*
 * Spec 16, FR-REC-009 (ADR-0023): no household can ever see, change, rank, plan or put on its shopping list
 * another household's own recipe. Kari owns the recipe; Ola is in his own household and uses *his own*
 * household id in every URL – the recipe id is the only thing that points at Kari's data. Every route answers
 * 404 (the same as a recipe that does not exist), and nothing changes in the database.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let ids: Map<string, string>;
let recipeId: string;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
});
afterAll(() => app.close());

beforeEach(async () => {
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  ids = await ingredientIdsByKey(app, kari);
  recipeId = (await createOwnRecipe(app, kari, ownRecipeBody(ids))).id;
});

async function snapshot() {
  const [recipe, lines, entries, shopping, shares] = await Promise.all([
    db.recipe.findUniqueOrThrow({ where: { id: recipeId } }),
    db.recipeIngredient.findMany({ where: { recipeId }, orderBy: { position: 'asc' } }),
    db.mealPlanEntry.count(),
    db.shoppingListItem.count(),
    db.shoppingListItemRecipe.count(),
  ]);
  return { recipe, lines, entries, shopping, shares };
}

const listIds = async (client: Client, query = '') =>
  (await call(app, 'GET', recipesPath(client, query), { client }))
    .json<RecipeListResponse>()
    .recipes.map((r) => r.id);

describe('FR-REC-009 another household gets 404 on every route', () => {
  it('list: the recipe is not in Ola’s list – but it is in Kari’s', async () => {
    expect(await listIds(kari)).toContain(recipeId);
    expect(await listIds(ola)).not.toContain(recipeId);
  });

  it('ranking for a planned day: the recipe is not in Ola’s ranking', async () => {
    expect(await listIds(kari, '?for=2026-10-23')).toContain(recipeId);
    expect(await listIds(ola, '?for=2026-10-23')).not.toContain(recipeId);
  });

  it.each([
    ['detail', 'GET', '', undefined],
    ['edit form', 'GET', '/edit', undefined],
    ['change', 'PUT', '', 'update'],
    ['delete', 'DELETE', '', undefined],
    ['price estimate', 'GET', '/price-estimate', undefined],
  ] as const)('%s: 404, and nothing changes', async (_name, method, rest, body) => {
    const before = await snapshot();
    const path =
      rest === '/price-estimate'
        ? householdPath(ola.user.householdId, `/recipes/${recipeId}/price-estimate`)
        : recipesPath(ola, `/${recipeId}${rest}`);
    const response = await call(app, method, path, {
      client: ola,
      body: body ? { ...ownRecipeBody(ids, { title: 'Testrett: kapret' }), version: 1 } : undefined,
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('omelett');
    expect(await snapshot()).toEqual(before);
  });

  it('meal plan: planning it is 404, and no entry is made', async () => {
    const before = await snapshot();
    const response = await call(
      app,
      'POST',
      householdPath(ola.user.householdId, '/meal-plan/entries'),
      {
        client: ola,
        body: { kind: 'recipe', recipeId, servings: 2, date: '2026-10-22', meal: 'dinner' },
      },
    );
    expect(response.statusCode).toBe(404);
    expect(await snapshot()).toEqual(before);
  });

  it('shopping list: adding it is 404, and the list is unchanged', async () => {
    const before = await snapshot();
    const response = await call(app, 'POST', shoppingPath(ola, `/from-recipe/${recipeId}`), {
      client: ola,
      body: { lines: [{ ingredientId: ids.get('egg'), quantityBase: 3 }] },
    });
    expect(response.statusCode).toBe(404);
    expect(await snapshot()).toEqual(before);
  });

  it('Kari’s own household id in Ola’s URL is 404 too (not a member)', async () => {
    const response = await call(app, 'GET', recipesPath(kari, `/${recipeId}`), { client: ola });
    expect(response.statusCode).toBe(404);
  });
});

describe('ADR-0023: the database refuses a cross-household reference, whatever the code does', () => {
  it('a meal plan entry in Ola’s household pointing at Kari’s recipe is refused by the trigger', async () => {
    await expect(
      db.$executeRaw`INSERT INTO meal_plan_entries (id, household_id, date, meal, recipe_id, recipe_title, servings)
        VALUES (gen_random_uuid(), ${ola.user.householdId}::uuid, DATE '2026-10-22', 'dinner', ${recipeId}::uuid,
                'Kapret', 2)`,
    ).rejects.toThrow(/another household/);
    expect(await db.mealPlanEntry.count()).toBe(0);
  });

  it('a shopping list share in Ola’s household pointing at Kari’s recipe is refused by the trigger', async () => {
    const line = await call(app, 'POST', shoppingPath(ola, '/items'), {
      client: ola,
      body: { text: 'Egg' },
    });
    const itemId = line.json().item.id as string;
    await expect(
      db.$executeRaw`INSERT INTO shopping_list_item_recipes (item_id, recipe_id, household_id)
        VALUES (${itemId}::uuid, ${recipeId}::uuid, ${ola.user.householdId}::uuid)`,
    ).rejects.toThrow(/another household/);
  });

  it('a free-text line is refused in a global recipe, and a line always gets its recipe’s household', async () => {
    const global = await db.recipe.findFirstOrThrow({ where: { householdId: null } });
    await expect(
      db.$executeRaw`INSERT INTO recipe_ingredients (recipe_id, position, display_text)
        VALUES (${global.id}::uuid, 99, 'Fritekst')`,
    ).rejects.toThrow(/recipe_ingredients_free_text/);
    // Trying to put Kari's line in Ola's household: the trigger copies the recipe's household instead.
    await db.$executeRaw`UPDATE recipe_ingredients SET household_id = ${ola.user.householdId}::uuid
      WHERE recipe_id = ${recipeId}::uuid`;
    const lines = await db.recipeIngredient.findMany({ where: { recipeId } });
    expect(new Set(lines.map((l) => l.householdId))).toEqual(new Set([kari.user.householdId]));
  });

  it('source and household_id are bound together (CHECK)', async () => {
    await expect(
      db.$executeRaw`UPDATE recipes SET household_id = NULL WHERE id = ${recipeId}::uuid`,
    ).rejects.toThrow(/recipes_household/);
    const global = await db.recipe.findFirstOrThrow({ where: { householdId: null } });
    await expect(
      db.$executeRaw`UPDATE recipes SET household_id = ${ola.user.householdId}::uuid WHERE id = ${global.id}::uuid`,
    ).rejects.toThrow(/recipes_household/);
  });
});

describe('NFR-SEC-001 own recipes: logged in, and CSRF on writes', () => {
  it('without a session: 401; with a wrong CSRF token: 403', async () => {
    // Valid for every route below (unknown keys are dropped), so the answer is about the session, not the body.
    const body = { ...ownRecipeBody(ids), version: 1, ingredientIds: [] };
    for (const [method, path] of [
      ['POST', recipesPath(kari)],
      ['PUT', recipesPath(kari, `/${recipeId}`)],
      ['DELETE', recipesPath(kari, `/${recipeId}`)],
      ['GET', recipesPath(kari, `/${recipeId}/edit`)],
      ['GET', '/me/avoided-ingredients'],
      ['PUT', '/me/avoided-ingredients'],
    ] as const) {
      const response = await call(app, method, path, { body });
      expect(response.statusCode, `${method} ${path}`).toBe(401);
    }
    const noCsrf = await call(app, 'POST', recipesPath(kari), {
      client: kari,
      body,
      headers: { [CSRF_HEADER]: 'wrong' },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(await db.recipe.count({ where: { householdId: { not: null } } })).toBe(1);
  });
});
