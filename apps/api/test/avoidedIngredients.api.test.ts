import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  AVOIDED_INGREDIENTS_MAX,
  type AvoidedIngredientsResponse,
  type MealEntryResponse,
  type RecipeDetail,
  type RecipeListResponse,
} from '@smartmat/shared';
import { applySeed, readSeedDirectory } from '../src/modules/recipes/seed';
import { createFakeClock } from '../src/test/fakes';
import { FIXTURE_SEED_DIR, seedFixtureRecipes } from './fixtureSeed';
import {
  call,
  captureLog,
  createTestApp,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { householdPath, join } from './householdHelpers';
import { createOwnRecipe, ingredientIdsByKey, ownRecipeBody, recipesPath } from './recipeHelpers';
import { recipeIdOf } from './shoppingHelpers';

/*
 * Spec 16, FR-ALG-001–003: ingredients a user does not tolerate, and the warnings they give – own and, by opt-in
 * (`share_allergens`), shared with the household without names. Treated like allergies (GDPR art. 9): voluntary,
 * deleted with the account, exported, never logged.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
const log = captureLog();
let app: FastifyInstance;
let kari: Client;
let ids: Map<string, string>;

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
  ids = await ingredientIdsByKey(app, kari);
});

const id = (key: string) => {
  const found = ids.get(key);
  if (!found) throw new Error(`no ingredient ${key}`);
  return found;
};

const avoid = (client: Client, keys: string[]) =>
  call(app, 'PUT', '/me/avoided-ingredients', {
    client,
    body: { ingredientIds: keys.map(id) },
  });

const share = (client: Client, on: boolean) =>
  call(app, 'PATCH', householdPath(client.user.householdId, '/members/me'), {
    client,
    body: { shareAllergens: on },
  });

async function recipeBySlug(client: Client, slug: string) {
  const list = await call(app, 'GET', recipesPath(client), { client });
  return list.json<RecipeListResponse>().recipes.find((r) => r.slug === slug);
}

describe('FR-ALG-001 the list of avoided ingredients', () => {
  it('saves and reads it in the order of the ingredient list; an empty list removes everything', async () => {
    const saved = await avoid(kari, ['tomat', 'egg']);
    expect(saved.statusCode).toBe(200);
    expect(saved.json<AvoidedIngredientsResponse>().ingredients.map((i) => i.name)).toEqual([
      'Egg',
      'Tomat',
    ]);
    const read = await call(app, 'GET', '/me/avoided-ingredients', { client: kari });
    expect(read.json()).toEqual(saved.json());
    await avoid(kari, []);
    expect(await db.userAvoidedIngredient.count()).toBe(0);
  });

  it('refuses an unknown ingredient, the same one twice and more than the limit; nothing is saved', async () => {
    const unknown = await call(app, 'PUT', '/me/avoided-ingredients', {
      client: kari,
      body: { ingredientIds: [id('egg'), '0199f0a0-0000-7000-8000-000000000001'] },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.fields).toEqual({
      'ingredientIds.1': 'validation.avoided.unknown',
    });
    const twice = await call(app, 'PUT', '/me/avoided-ingredients', {
      client: kari,
      body: { ingredientIds: [id('egg'), id('egg')] },
    });
    expect(twice.statusCode).toBe(400);
    const tooMany = await call(app, 'PUT', '/me/avoided-ingredients', {
      client: kari,
      body: {
        ingredientIds: Array.from(
          { length: AVOIDED_INGREDIENTS_MAX + 1 },
          (_, i) => `0199f0a0-0000-7000-8000-${String(i).padStart(12, '0')}`,
        ),
      },
    });
    expect(tooMany.statusCode).toBe(400);
    expect(await db.userAvoidedIngredient.count()).toBe(0);
  });

  it('is deleted with the account and is in the export', async () => {
    await avoid(kari, ['tomat']);
    const exported = await call(app, 'GET', '/me/export', { client: kari });
    expect(exported.json().avoidedIngredients).toEqual([{ id: id('tomat'), name: 'Tomat' }]);
    const deleted = await call(app, 'DELETE', '/me', {
      client: kari,
      body: { password: 'riktig hest batteri' },
    });
    expect(deleted.statusCode).toBe(204);
    expect(await db.userAvoidedIngredient.count()).toBe(0);
  });

  it('the seed script keeps an ingredient someone has registered', async () => {
    await avoid(kari, ['sesamfro']);
    const seed = readSeedDirectory(FIXTURE_SEED_DIR);
    try {
      const summary = await applySeed(db, {
        ingredients: seed.ingredients.filter((i) => i.key !== 'sesamfro'),
        recipes: seed.recipes.filter((r) =>
          r.ingredients.every((l) => l.ingredientKey !== 'sesamfro'),
        ),
      });
      expect(summary.keptIngredients).toEqual(['sesamfro']);
    } finally {
      await seedFixtureRecipes(db);
    }
    expect(await db.userAvoidedIngredient.count()).toBe(1);
  });

  it('NFR-SEC-004: what is registered never ends up in the log', async () => {
    await avoid(kari, ['tomat', 'sesamfro']);
    await call(app, 'GET', '/me/avoided-ingredients', { client: kari });
    await call(app, 'PUT', '/me/avoided-ingredients', {
      client: kari,
      body: { ingredientIds: ['ikke-en-uuid', id('tomat')] },
    });
    const text = log.text();
    for (const secret of [id('tomat'), id('sesamfro'), 'Tomat', 'Sesamfrø', 'ikke-en-uuid'])
      expect(text).not.toContain(secret);
  });
});

describe('FR-ALG-002 warnings for avoided ingredients', () => {
  it('own: the list, the recipe and the meal plan say which avoided ingredients the recipe has', async () => {
    await avoid(kari, ['tomat']);
    const pasta = await recipeBySlug(kari, 'testrett-pasta-med-tomat');
    expect(pasta).toMatchObject({ ingredientWarnings: ['Tomat'], householdIngredientWarnings: [] });
    expect((await recipeBySlug(kari, 'testrett-pannekaker'))?.ingredientWarnings).toEqual([]);

    const recipeId = await recipeIdOf(app, kari, 'testrett-pasta-med-tomat');
    const detail = await call(app, 'GET', recipesPath(kari, `/${recipeId}`), { client: kari });
    expect(detail.json<RecipeDetail>()).toMatchObject({
      ingredientWarnings: ['Tomat'],
      avoidedIngredients: ['Tomat'],
    });

    const entry = await call(
      app,
      'POST',
      householdPath(kari.user.householdId, '/meal-plan/entries'),
      {
        client: kari,
        body: { kind: 'recipe', recipeId, servings: 2, date: '2026-10-22', meal: 'dinner' },
      },
    );
    expect(entry.json<MealEntryResponse>().ingredientWarnings).toEqual(['Tomat']);
  });

  it('FR-ALG-003: a free-text line never counts – the recipe says how many lines were not checked', async () => {
    await avoid(kari, ['tomat']);
    const saved = await createOwnRecipe(
      app,
      kari,
      ownRecipeBody(ids, {
        lines: [
          { kind: 'ingredient', ingredientId: id('egg'), amount: '2', unit: 'stk' },
          { kind: 'freeText', text: 'Tomat fra hagen' },
        ],
      }),
    );
    const detail = await call(app, 'GET', recipesPath(kari, `/${saved.id}`), { client: kari });
    expect(detail.json<RecipeDetail>()).toMatchObject({ ingredientWarnings: [], freeTextCount: 1 });
  });

  it('household: only after the member has chosen to share, never with a name, never the caller’s own', async () => {
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    await avoid(ola, ['egg', 'tomat']);
    await avoid(kari, ['tomat']);
    // Not shared: Kari sees nothing of Ola's.
    expect((await recipeBySlug(kari, 'testrett-pannekaker'))?.householdIngredientWarnings).toEqual(
      [],
    );

    expect((await share(ola, true)).statusCode).toBe(200);
    const pancakes = await recipeBySlug(kari, 'testrett-pannekaker');
    expect(pancakes?.householdIngredientWarnings).toEqual(['Egg']);
    // Tomat is Kari's own as well: it is "yours", not the household's.
    const pasta = await recipeBySlug(kari, 'testrett-pasta-med-tomat');
    expect(pasta).toMatchObject({ ingredientWarnings: ['Tomat'], householdIngredientWarnings: [] });
    const list = await call(app, 'GET', recipesPath(kari), { client: kari });
    expect(list.json<RecipeListResponse>().householdAvoidedIngredients).toEqual(['Egg']);
    expect(list.body).not.toContain('Ola');

    // Turned off again, or no longer a member: gone.
    await share(ola, false);
    expect((await recipeBySlug(kari, 'testrett-pannekaker'))?.householdIngredientWarnings).toEqual(
      [],
    );
    await share(ola, true);
    await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: ola });
    expect((await recipeBySlug(kari, 'testrett-pannekaker'))?.householdIngredientWarnings).toEqual(
      [],
    );
  });
});
