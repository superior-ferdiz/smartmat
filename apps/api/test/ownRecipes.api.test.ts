import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  API_ERRORS,
  HOUSEHOLD_RECIPES_MAX,
  type HouseholdRecipeEdit,
  type MealEntryResponse,
  type RecipeDetail,
  type RecipeListResponse,
  type ShoppingListResponse,
} from '@smartmat/shared';
import { applySeed, readSeedDirectory } from '../src/modules/recipes/seed';
import { createFakeClock } from '../src/test/fakes';
import { FIXTURE_SEED_DIR, seedFixtureRecipes } from './fixtureSeed';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { householdPath, join } from './householdHelpers';
import { createItem } from './inventoryHelpers';
import { createOwnRecipe, ingredientIdsByKey, ownRecipeBody, recipesPath } from './recipeHelpers';
import { shoppingPath } from './shoppingHelpers';

/*
 * Spec 16 (FR-REC-007–010) against the test database: a household's own recipes, with the fictional
 * ingredients in test/fixtures/seed/. "Today" is 2026-10-21 in Norway.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
let app: FastifyInstance;
let kari: Client;
let ids: Map<string, string>;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
});
afterAll(() => app.close());

beforeEach(async () => {
  kari = await registerUser(app, { displayName: 'Kari' });
  ids = await ingredientIdsByKey(app, kari);
});

const id = (key: string) => {
  const found = ids.get(key);
  if (!found) throw new Error(`no ingredient ${key}`);
  return found;
};

async function detail(client: Client, recipeId: string) {
  const response = await call(app, 'GET', recipesPath(client, `/${recipeId}`), { client });
  expect(response.statusCode).toBe(200);
  return response.json<RecipeDetail>();
}

async function list(client: Client) {
  const response = await call(app, 'GET', recipesPath(client), { client });
  expect(response.statusCode).toBe(200);
  return response.json<RecipeListResponse>();
}

describe('FR-REC-007 create, change and delete an own recipe', () => {
  it('creates it as "household" with who added it, converted amounts and free text kept apart', async () => {
    const saved = await createOwnRecipe(app, kari, ownRecipeBody(ids));
    expect(saved.version).toBe(1);

    const recipe = await detail(kari, saved.id);
    expect(recipe).toMatchObject({
      title: 'Testrett: egen omelett',
      source: 'household',
      slug: null,
      origin: null,
      license: null,
      authors: [],
      createdBy: { kind: 'member', displayName: 'Kari' },
      freeTextCount: 1,
      freeTextLines: [{ position: 3, displayText: 'Litt gressløk fra hagen' }],
    });
    // 3 stk egg, 1 dl = 100 ml milk, salt without an amount; the empty text became "3 stk Egg".
    expect(recipe.lines.map((l) => [l.position, l.displayText, l.quantityBase])).toEqual([
      [0, '3 stk Egg', 3],
      [1, '1 dl lettmelk', 100],
      [2, 'Salt', null],
    ]);
    // The row in the database says the same (ADR-0023): own household, no slug, the trigger copied household_id.
    const row = await db.recipe.findUniqueOrThrow({
      where: { id: saved.id },
      include: { ingredients: { orderBy: { position: 'asc' } } },
    });
    expect(row).toMatchObject({
      householdId: kari.user.householdId,
      slug: null,
      source: 'household',
    });
    expect(row.ingredients.every((l) => l.householdId === kari.user.householdId)).toBe(true);
    expect(row.ingredients[3]).toMatchObject({ ingredientId: null, quantityBase: null });
  });

  it('is in the list and ranked with the inventory like the others; the free text never counts', async () => {
    await createItem(app, kari, { name: 'Lettmelk', unit: 'ml', quantityBase: 1000 });
    const saved = await createOwnRecipe(app, kari, ownRecipeBody(ids));
    const own = (await list(kari)).recipes.find((r) => r.id === saved.id);
    expect(own).toMatchObject({ source: 'household', freeTextCount: 1 });
    // Required: egg and milk (salt is a staple). Milk is there, egg is not: (2 + 0) / 4 = 50.
    expect(own?.score).toMatchObject({ requiredCount: 2, enoughCount: 1, missingCount: 1 });
    expect(own?.ingredientNames).toEqual(['Egg', 'Melk', 'Salt']);
  });

  it('the edit form gets back what was typed; PUT with the version changes it and bumps the version', async () => {
    const saved = await createOwnRecipe(app, kari, ownRecipeBody(ids));
    const edit = await call(app, 'GET', recipesPath(kari, `/${saved.id}/edit`), { client: kari });
    expect(edit.statusCode).toBe(200);
    const form = edit.json<HouseholdRecipeEdit>();
    expect(form.lines).toEqual([
      {
        kind: 'ingredient',
        ingredientId: id('egg'),
        amount: '3',
        unit: 'stk',
        text: '3 stk Egg',
        optional: false,
      },
      {
        kind: 'ingredient',
        ingredientId: id('melk'),
        amount: '1',
        unit: 'dl',
        text: '1 dl lettmelk',
        optional: false,
      },
      {
        kind: 'ingredient',
        ingredientId: id('salt'),
        amount: null,
        unit: null,
        text: 'Salt',
        optional: false,
      },
      { kind: 'freeText', text: 'Litt gressløk fra hagen' },
    ]);

    const put = await call(app, 'PUT', recipesPath(kari, `/${saved.id}`), {
      client: kari,
      body: {
        ...ownRecipeBody(ids, {
          title: 'Testrett: stor omelett',
          servings: 4,
          lines: [{ kind: 'ingredient', ingredientId: id('egg'), amount: '1,5', unit: 'stk' }],
        }),
        version: form.version,
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ id: saved.id, version: 2 });
    const changed = await detail(kari, saved.id);
    expect(changed).toMatchObject({
      title: 'Testrett: stor omelett',
      servings: 4,
      freeTextCount: 0,
    });
    expect(changed.lines.map((l) => l.quantityBase)).toEqual([2]); // 1,5 stk rounds to 2 like the seed files
  });

  it('a stale version is 409 and nothing changes', async () => {
    const saved = await createOwnRecipe(app, kari, ownRecipeBody(ids));
    const body = { ...ownRecipeBody(ids, { title: 'Testrett: endret' }), version: 1 };
    expect(
      (await call(app, 'PUT', recipesPath(kari, `/${saved.id}`), { client: kari, body }))
        .statusCode,
    ).toBe(200);
    const stale = await call(app, 'PUT', recipesPath(kari, `/${saved.id}`), {
      client: kari,
      body: { ...body, title: 'Testrett: for sent' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe(API_ERRORS.recipeChangedMeanwhile);
    expect((await detail(kari, saved.id)).title).toBe('Testrett: endret');
  });

  it('NFR-DATA-002: the same clientRequestId twice gives one recipe (200 the second time)', async () => {
    const body = { ...ownRecipeBody(ids), clientRequestId: '0199f0a0-0000-7000-8000-00000000c0de' };
    const first = await call(app, 'POST', recipesPath(kari), { client: kari, body });
    const second = await call(app, 'POST', recipesPath(kari), { client: kari, body });
    expect([first.statusCode, second.statusCode]).toEqual([201, 200]);
    expect(second.json()).toEqual(first.json());
    expect(await db.recipe.count({ where: { householdId: kari.user.householdId } })).toBe(1);
  });

  it('deletes it (204, then 404); a planned meal keeps its title, the shopping share goes', async () => {
    const saved = await createOwnRecipe(app, kari, ownRecipeBody(ids));
    const entry = await call(
      app,
      'POST',
      householdPath(kari.user.householdId, '/meal-plan/entries'),
      {
        client: kari,
        body: {
          kind: 'recipe',
          recipeId: saved.id,
          servings: 2,
          date: '2026-10-22',
          meal: 'dinner',
        },
      },
    );
    expect(entry.statusCode).toBe(201);
    await call(app, 'POST', shoppingPath(kari, `/from-recipe/${saved.id}`), {
      client: kari,
      body: { lines: [{ ingredientId: id('egg'), quantityBase: 3 }] },
    });

    const removed = await call(app, 'DELETE', recipesPath(kari, `/${saved.id}`), { client: kari });
    expect(removed.statusCode).toBe(204);
    expect(
      (await call(app, 'GET', recipesPath(kari, `/${saved.id}`), { client: kari })).statusCode,
    ).toBe(404);
    expect(
      (await call(app, 'DELETE', recipesPath(kari, `/${saved.id}`), { client: kari })).statusCode,
    ).toBe(404);
    const kept = await db.mealPlanEntry.findUniqueOrThrow({
      where: { id: entry.json<MealEntryResponse>().id },
    });
    expect(kept).toMatchObject({ recipeId: null, recipeTitle: 'Testrett: egen omelett' });
    expect(await db.shoppingListItemRecipe.count()).toBe(0);
    expect(await db.shoppingListItem.count()).toBe(1); // the line itself stays (spec 06)
  });

  it(`at most ${HOUSEHOLD_RECIPES_MAX} own recipes per household (409), but a repeat of a saved form is still 200`, async () => {
    const body = { ...ownRecipeBody(ids), clientRequestId: '0199f0a0-0000-7000-8000-00000000beef' };
    const first = await call(app, 'POST', recipesPath(kari), { client: kari, body });
    expect(first.statusCode).toBe(201);
    await db.recipe.createMany({
      data: Array.from({ length: HOUSEHOLD_RECIPES_MAX - 1 }, (_, i) => ({
        title: `Testrett ${i}`,
        description: '',
        servings: 1,
        prepMinutes: 0,
        cookMinutes: 0,
        steps: ['Lag den.'],
        tags: [],
        source: 'household' as const,
        authors: [],
        householdId: kari.user.householdId,
      })),
    });
    const full = await call(app, 'POST', recipesPath(kari), {
      client: kari,
      body: ownRecipeBody(ids),
    });
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe(API_ERRORS.recipeTooMany);
    const repeat = await call(app, 'POST', recipesPath(kari), { client: kari, body });
    expect(repeat.statusCode).toBe(200);
    expect(await db.recipe.count({ where: { householdId: kari.user.householdId } })).toBe(
      HOUSEHOLD_RECIPES_MAX,
    );
  });
});

describe('FR-REC-008 lines are checked on the server (NFR-SEC-002)', () => {
  it.each([
    [
      'an unknown ingredient',
      { kind: 'ingredient', ingredientId: '0199f0a0-0000-7000-8000-000000000001' },
      'lines.0.ingredientId',
    ],
    [
      'a unit that cannot be converted',
      { kind: 'ingredient', ingredientKey: 'kyllingfilet', amount: '2', unit: 'dl' },
      'lines.0.unit',
    ],
    [
      'an amount that is not a number',
      { kind: 'ingredient', ingredientKey: 'melk', amount: 'mye', unit: 'dl' },
      'lines.0.amount',
    ],
    [
      'an amount without a unit',
      { kind: 'ingredient', ingredientKey: 'melk', amount: '2' },
      'lines.0.amount',
    ],
    ['an empty free-text line', { kind: 'freeText', text: '  ' }, 'lines.0.text'],
  ])('refuses %s', async (_name, line, field) => {
    const { ingredientKey, ...rest } = line as Record<string, unknown> & { ingredientKey?: string };
    const body = ownRecipeBody(ids, {
      lines: [ingredientKey ? { ...rest, ingredientId: id(ingredientKey) } : rest] as never,
    });
    const response = await call(app, 'POST', recipesPath(kari), { client: kari, body });
    expect(response.statusCode).toBe(400);
    expect(Object.keys(response.json().error.fields ?? {})).toContain(field);
    expect(await db.recipe.count({ where: { householdId: { not: null } } })).toBe(0);
  });

  it('refuses the same ingredient twice, no lines, no steps and a blank title', async () => {
    const twice = ownRecipeBody(ids, {
      lines: [
        { kind: 'ingredient', ingredientId: id('egg') },
        { kind: 'ingredient', ingredientId: id('egg'), amount: '2', unit: 'stk' },
      ],
    });
    for (const [body, field] of [
      [twice, 'lines.1.ingredientId'],
      [ownRecipeBody(ids, { lines: [] }), 'lines'],
      [ownRecipeBody(ids, { steps: [] }), 'steps'],
      [ownRecipeBody(ids, { title: '  ' }), 'title'],
    ] as const) {
      const response = await call(app, 'POST', recipesPath(kari), { client: kari, body });
      expect(response.statusCode, field).toBe(400);
      expect(Object.keys(response.json().error.fields ?? {})).toContain(field);
    }
  });

  it('GET /ingredients says which units each ingredient may be written in', async () => {
    const response = await call(app, 'GET', '/ingredients', { client: kari });
    const byKey = new Map(
      response.json<{ key: string; units: string[] }[]>().map((i) => [i.key, i.units]),
    );
    expect(byKey.get('kyllingfilet')).toEqual(['g', 'kg']);
    expect(byKey.get('melk')).toEqual(['ml', 'dl', 'l', 'ss', 'ts', 'krm']);
    expect(byKey.get('egg')).toEqual(['g', 'kg', 'stk']);
  });
});

describe('FR-REC-009 shared within the household, and it stays there', () => {
  it('every member sees and uses it; when the one who added it leaves, it stays as "former member"', async () => {
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    const saved = await createOwnRecipe(app, kari, ownRecipeBody(ids));
    expect((await detail(ola, saved.id)).createdBy).toEqual({
      kind: 'member',
      displayName: 'Kari',
    });

    // Ola changes it and plans it: all members may (spec 16, decision 2).
    const put = await call(app, 'PUT', recipesPath(ola, `/${saved.id}`), {
      client: ola,
      body: { ...ownRecipeBody(ids, { title: 'Testrett: Olas omelett' }), version: 1 },
    });
    expect(put.statusCode).toBe(200);

    const leave = await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), {
      client: kari,
    });
    expect(leave.statusCode).toBe(409); // the owner must transfer first
    await call(app, 'POST', householdPath(kari.user.householdId, '/transfer-ownership'), {
      client: kari,
      body: { userId: ola.user.id, password: 'riktig hest batteri' },
    });
    expect(
      (await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: kari }))
        .statusCode,
    ).toBe(204);
    const after = await detail(ola, saved.id);
    expect(after).toMatchObject({ title: 'Testrett: Olas omelett', createdBy: { kind: 'former' } });
  });

  it('can be planned and put on the shopping list; free text is never added', async () => {
    const saved = await createOwnRecipe(app, kari, ownRecipeBody(ids));
    const plan = await call(
      app,
      'POST',
      householdPath(kari.user.householdId, '/meal-plan/entries'),
      {
        client: kari,
        body: {
          kind: 'recipe',
          recipeId: saved.id,
          servings: 4,
          date: '2026-10-22',
          meal: 'dinner',
        },
      },
    );
    expect(plan.statusCode).toBe(201);
    const needs = await call(
      app,
      'GET',
      householdPath(kari.user.householdId, '/meal-plan/needs?from=2026-10-19&to=2026-10-25'),
      { client: kari },
    );
    expect(needs.statusCode).toBe(200);
    const names = (needs.json().ingredients as { ingredientName: string; needBase: number }[]).map(
      (i) => [i.ingredientName, i.needBase],
    );
    expect(names).toEqual(
      expect.arrayContaining([
        ['Egg', 6],
        ['Melk', 200],
      ]),
    );
    expect(JSON.stringify(needs.json())).not.toContain('gressløk');

    const added = await call(app, 'POST', shoppingPath(kari, `/from-recipe/${saved.id}`), {
      client: kari,
      body: { lines: [{ ingredientId: id('egg'), quantityBase: 3 }] },
    });
    expect(added.statusCode).toBe(200);
    const listed = await call(app, 'GET', shoppingPath(kari), { client: kari });
    expect(listed.json<ShoppingListResponse>().items.map((i) => i.text)).toEqual(['Egg']);
  });
});

describe('FR-REC-010 the seed script never touches own recipes, and the export has them', () => {
  it('a re-seed keeps the own recipe and its lines, and keeps an ingredient only it uses', async () => {
    const saved = await createOwnRecipe(
      app,
      kari,
      ownRecipeBody(ids, {
        lines: [{ kind: 'ingredient', ingredientId: id('sesamfro'), amount: '1', unit: 'ss' }],
      }),
    );
    const seed = readSeedDirectory(FIXTURE_SEED_DIR);
    try {
      const summary = await applySeed(db, {
        ingredients: seed.ingredients.filter((i) => i.key !== 'sesamfro'),
        recipes: seed.recipes.filter((r) =>
          r.ingredients.every((l) => l.ingredientKey !== 'sesamfro'),
        ),
      });
      expect(summary.keptIngredients).toEqual(['sesamfro']);
      // Only the global test recipe with sesame left the files; the own recipe is not counted or removed.
      expect(summary.removedRecipes).toBe(1);
      expect(await db.recipe.count({ where: { householdId: kari.user.householdId } })).toBe(1);
      const recipe = await detail(kari, saved.id);
      expect(recipe.lines.map((l) => l.ingredientId)).toEqual([id('sesamfro')]);
    } finally {
      await seedFixtureRecipes(db);
    }
    expect(await db.recipe.count({ where: { householdId: null } })).toBe(3);
  });

  it('/me/export has the recipe and its lines for the household', async () => {
    const saved = await createOwnRecipe(app, kari, ownRecipeBody(ids));
    const response = await call(app, 'GET', '/me/export', { client: kari });
    expect(response.statusCode).toBe(200);
    const tables = response.json().households[0].tables as Record<
      string,
      Record<string, unknown>[]
    >;
    expect(tables.recipes?.map((r) => r.id)).toEqual([saved.id]);
    expect(tables.recipe_ingredients?.map((l) => l.display_text)).toEqual([
      '3 stk Egg',
      '1 dl lettmelk',
      'Salt',
      'Litt gressløk fra hagen',
    ]);
  });
});
