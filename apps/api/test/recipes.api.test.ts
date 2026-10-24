import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  API_ERRORS,
  type IngredientResponse,
  type ItemResponse,
  type RecipeDetail,
  type RecipeListResponse,
} from '@smartmat/shared';
import { createFakeClock } from '../src/test/fakes';
import {
  call,
  captureLog,
  createTestApp,
  PASSWORD,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { createItem, inventoryPath } from './inventoryHelpers';

/*
 * FR-REC-001–004 against the real test database, with the fictional test recipes from
 * test/fixtures/seed/ (seeded by globalSetup). "Today" is 2026-10-21 in Norway.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
const log = captureLog();
let app: FastifyInstance;
let kari: Client;

beforeAll(async () => {
  app = await createTestApp(db, {
    now: clock.now,
    logStream: log.stream,
    config: { logLevel: 'info' },
  });
});
afterAll(() => app.close());

const recipesPath = (client: Client, path = '') =>
  `/households/${client.user.householdId}/recipes${path}`;

async function list(client = kari) {
  const response = await call(app, 'GET', recipesPath(client), { client });
  expect(response.statusCode).toBe(200);
  return response.json<RecipeListResponse>();
}

async function detail(slug: string, client = kari) {
  const recipe = (await list(client)).recipes.find((r) => r.slug === slug);
  if (!recipe) throw new Error(`no recipe ${slug}`);
  const response = await call(app, 'GET', recipesPath(client, `/${recipe.id}`), { client });
  expect(response.statusCode).toBe(200);
  return response.json<RecipeDetail>();
}

const line = (recipe: RecipeDetail, ingredientName: string) =>
  recipe.lines.find((l) => l.ingredientName === ingredientName);

async function setIngredient(item: ItemResponse, ingredient: unknown) {
  return call(app, 'PATCH', inventoryPath(kari, `/items/${item.id}`), {
    client: kari,
    body: { ingredient },
  });
}

async function ingredientId(name: string) {
  const response = await call(app, 'GET', '/ingredients', { client: kari });
  const found = response.json<IngredientResponse[]>().find((i) => i.name === name);
  if (!found) throw new Error(`no ingredient ${name}`);
  return found.id;
}

const useBy = (date: string) => ({ kind: 'use_by', date });

describe('FR-REC-001 browse', () => {
  it('an empty inventory lists every recipe with score 0, fewest missing first', async () => {
    kari = await registerUser(app);
    const { recipes, userAllergens } = await list();
    // Missing 2 (pasta, tomat; løk is optional), 3 (mel, melk, egg) and 4 (kylling, ris, løk, fløte).
    expect(recipes.map((r) => r.title)).toEqual([
      'Testrett: pasta med tomat',
      'Testrett: pannekaker',
      'Testrett: kylling og ris',
    ]);
    expect(recipes.every((r) => r.score.total === 0 && r.source === 'test')).toBe(true);
    expect(recipes[0]?.score.reasons[0]).toEqual({ code: 'nothing', points: 0 });
    expect(userAllergens).toEqual([]);
  });

  it('the detail has steps, authors and every ingredient line in order', async () => {
    kari = await registerUser(app);
    const recipe = await detail('testrett-pannekaker');
    expect(recipe).toMatchObject({
      title: 'Testrett: pannekaker',
      servings: 4,
      authors: ['Testdata (laget av KI for testene)'],
      license: 'test',
      steps: ['Testtrinn 1.'],
    });
    expect(recipe.lines.map((l) => [l.ingredientName, l.quantityBase, l.baseUnit])).toEqual([
      ['Hvetemel', 150, 'g'],
      ['Melk', 500, 'ml'],
      ['Egg', 3, 'stk'],
      ['Salt', 3, 'g'], // ½ ts × 6/5 g per ml, rounded once (spec 09)
    ]);
  });

  it('an unknown recipe id is 404, a malformed one is 400', async () => {
    kari = await registerUser(app);
    const unknown = await call(
      app,
      'GET',
      recipesPath(kari, '/0199f0a0-0000-7000-8000-000000000000'),
      { client: kari },
    );
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: { code: API_ERRORS.notFound } });
    const malformed = await call(app, 'GET', recipesPath(kari, '/abc'), { client: kari });
    expect(malformed.statusCode).toBe(400);
  });

  it('GET /ingredients lists the global ingredients with their aliases', async () => {
    kari = await registerUser(app);
    const response = await call(app, 'GET', '/ingredients', { client: kari });
    const melk = response.json<IngredientResponse[]>().find((i) => i.key === 'melk');
    expect(melk).toMatchObject({ name: 'Melk', baseUnit: 'ml', isStaple: false });
    expect(melk?.aliases.sort()).toEqual(['lettmelk', 'melk']);
  });
});

describe('FR-REC-002/003 ranking from the inventory', () => {
  it('an item in the inventory ranks the recipe first and shows what is missing', async () => {
    kari = await registerUser(app);
    await createItem(app, kari, {
      name: 'Kyllingfilet',
      unit: 'g',
      quantityBase: 400,
      expiry: useBy('2026-10-22'),
    });
    const [first] = (await list()).recipes;
    // Required: kylling, ris, løk, fløte (salt is a staple). 1 enough → floor(100 × 2 / 8) = 25, +10 going off.
    expect(first?.slug).toBe('testrett-kylling-og-ris');
    expect(first?.score).toMatchObject({
      total: 35,
      coverage: 25,
      expiringBonus: 10,
      requiredCount: 4,
      enoughCount: 1,
      missingCount: 3,
    });
    expect(first?.score.reasons).toEqual([
      { code: 'coverage', points: 25, enough: 1, partial: 0, required: 4 },
      {
        code: 'expiring',
        points: 10,
        ingredientName: 'Kyllingfilet',
        itemName: 'Kyllingfilet',
        expiryKind: 'use_by',
        daysLeft: 1,
      },
      { code: 'missing', points: 0, names: ['Ris', 'Løk', 'Fløte'] },
    ]);

    const recipe = await detail('testrett-kylling-og-ris');
    expect(recipe.lines.map((l) => [l.ingredientName, l.status])).toEqual([
      ['Kyllingfilet', 'enough'],
      ['Ris', 'missing'],
      ['Løk', 'missing'],
      ['Fløte', 'missing'],
      ['Sesamfrø', 'missing'],
      ['Salt', 'staple'],
    ]);
    expect(line(recipe, 'Kyllingfilet')).toMatchObject({
      haveBase: 400,
      itemNames: ['Kyllingfilet'],
    });
  });

  it('not enough shows how much is missing; another unit is converted (rounded down, approximate)', async () => {
    kari = await registerUser(app);
    await createItem(app, kari, { name: 'Matfløte', unit: 'ml', quantityBase: 150 });
    await createItem(app, kari, { name: 'Gul løk', unit: 'stk', quantityBase: 1 });
    const recipe = await detail('testrett-kylling-og-ris');
    expect(line(recipe, 'Fløte')).toMatchObject({
      status: 'notEnough',
      haveBase: 150,
      missingBase: 50,
      approximate: false,
    });
    expect(line(recipe, 'Løk')).toMatchObject({
      status: 'enough',
      haveBase: 100,
      approximate: true,
    });
    // 1 enough (2) + 1 partial (1) of 4 → floor(300 / 8) = 37
    expect(recipe.score).toMatchObject({ coverage: 37, enoughCount: 1, partialCount: 1 });
  });

  it('several items of the same ingredient are added up', async () => {
    kari = await registerUser(app);
    await createItem(app, kari, { name: 'Lettmelk', unit: 'ml', quantityBase: 250 });
    await createItem(app, kari, { name: 'Tine melk 1 l', unit: 'ml', quantityBase: 250 });
    expect(line(await detail('testrett-pannekaker'), 'Melk')).toMatchObject({
      status: 'enough',
      haveBase: 500,
      itemNames: ['Lettmelk', 'Tine melk 1 l'],
    });
  });

  it('food past its use-by date is NEVER counted, and the recipe says so', async () => {
    kari = await registerUser(app);
    await createItem(app, kari, {
      name: 'Kyllingfilet',
      unit: 'g',
      quantityBase: 400,
      expiry: useBy('2026-10-20'),
    });
    const recipe = await detail('testrett-kylling-og-ris');
    expect(line(recipe, 'Kyllingfilet')).toMatchObject({
      status: 'missing',
      haveBase: null,
      excludedUseByItems: ['Kyllingfilet'],
    });
    expect(recipe.score.total).toBe(0);
  });

  it('food past its best-before date is counted and gives the going-off bonus', async () => {
    kari = await registerUser(app);
    await createItem(app, kari, {
      name: 'Spagetti',
      unit: 'g',
      quantityBase: 500,
      expiry: { kind: 'best_before', date: '2026-09-01' },
    });
    const recipe = await detail('testrett-pasta-med-tomat');
    expect(line(recipe, 'Pasta')).toMatchObject({
      status: 'enough',
      expiring: { itemName: 'Spagetti', expiryKind: 'best_before', daysLeft: -50 },
    });
    // Required: pasta, tomat (løk is optional) → 50 + 10
    expect(recipe.score).toMatchObject({ coverage: 50, expiringBonus: 10, total: 60 });
  });

  it('a used-up item counts for nothing', async () => {
    kari = await registerUser(app);
    const item = await createItem(app, kari, {
      name: 'Kyllingfilet',
      unit: 'g',
      quantityBase: 400,
    });
    await call(app, 'POST', inventoryPath(kari, `/batches/${item.batches[0]!.id}/consume`), {
      client: kari,
      body: { quantityBase: 400 },
    });
    expect(line(await detail('testrett-kylling-og-ris'), 'Kyllingfilet')?.status).toBe('missing');
  });
});

describe('spec 05 linking an item to an ingredient', () => {
  it('a new item is linked automatically by its name', async () => {
    kari = await registerUser(app);
    const item = await createItem(app, kari, { name: 'Prior kyllingbryst', unit: 'g' });
    expect(item).toMatchObject({ ingredientMatch: 'auto', ingredientId: null });
    expect(line(await detail('testrett-kylling-og-ris'), 'Kyllingfilet')?.status).toBe('enough');
  });

  it('manual: the chosen ingredient wins over the name; auto puts it back', async () => {
    kari = await registerUser(app);
    const item = await createItem(app, kari, {
      name: 'Hjemmelaget saus',
      unit: 'ml',
      quantityBase: 500,
    });
    expect(line(await detail('testrett-kylling-og-ris'), 'Fløte')?.status).toBe('missing');

    const flote = await ingredientId('Fløte');
    const linked = await setIngredient(item, { match: 'manual', ingredientId: flote });
    expect(linked.statusCode).toBe(200);
    expect(linked.json<ItemResponse>()).toMatchObject({
      ingredientMatch: 'manual',
      ingredientId: flote,
    });
    expect(line(await detail('testrett-kylling-og-ris'), 'Fløte')?.status).toBe('enough');

    const reset = await setIngredient(item, { match: 'auto' });
    expect(reset.json<ItemResponse>()).toMatchObject({
      ingredientMatch: 'auto',
      ingredientId: null,
    });
    expect(line(await detail('testrett-kylling-og-ris'), 'Fløte')?.status).toBe('missing');
  });

  it('none: a wrong automatic match can be switched off', async () => {
    kari = await registerUser(app);
    const item = await createItem(app, kari, { name: 'Kyllingfilet', unit: 'g' });
    await setIngredient(item, { match: 'none' });
    expect(line(await detail('testrett-kylling-og-ris'), 'Kyllingfilet')?.status).toBe('missing');
  });

  it('an ingredient id that does not exist is a field error, and nothing changes', async () => {
    kari = await registerUser(app);
    const item = await createItem(app, kari, { name: 'Kyllingfilet', unit: 'g' });
    const response = await setIngredient(item, {
      match: 'manual',
      ingredientId: '0199f0a0-0000-7000-8000-000000000000',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: API_ERRORS.validation,
        fields: { 'ingredient.ingredientId': 'validation.ingredient.unknown' },
      },
    });
    const row = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect([row.ingredientMatch, row.ingredientId]).toEqual(['auto', null]);
  });

  it('manual without an ingredient id is refused by the schema', async () => {
    kari = await registerUser(app);
    const item = await createItem(app, kari, { name: 'Kyllingfilet', unit: 'g' });
    expect((await setIngredient(item, { match: 'manual' })).statusCode).toBe(400);
    expect((await setIngredient(item, { match: 'maybe' })).statusCode).toBe(400);
  });

  it('the database refuses an ingredient id without "manual" (CHECK)', async () => {
    kari = await registerUser(app);
    const item = await createItem(app, kari, { name: 'Kyllingfilet', unit: 'g' });
    const flote = await ingredientId('Fløte');
    await expect(
      db.inventoryItem.update({ where: { id: item.id }, data: { ingredientId: flote } }),
    ).rejects.toThrow();
    await expect(
      db.inventoryItem.update({ where: { id: item.id }, data: { ingredientMatch: 'manual' } }),
    ).rejects.toThrow();
  });
});

describe('FR-REC-004 allergens', () => {
  it('starts empty; PUT replaces the list and GET returns it in the fixed order', async () => {
    kari = await registerUser(app);
    expect((await call(app, 'GET', '/me/allergens', { client: kari })).json()).toEqual({
      allergens: [],
    });
    const put = await call(app, 'PUT', '/me/allergens', {
      client: kari,
      body: { allergens: ['milk', 'gluten'] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ allergens: ['gluten', 'milk'] });
    await call(app, 'PUT', '/me/allergens', { client: kari, body: { allergens: ['egg'] } });
    expect((await call(app, 'GET', '/me/allergens', { client: kari })).json()).toEqual({
      allergens: ['egg'],
    });
  });

  it('recipes with the user’s allergens get a warning; the others do not', async () => {
    kari = await registerUser(app);
    await call(app, 'PUT', '/me/allergens', { client: kari, body: { allergens: ['milk'] } });
    const { recipes, userAllergens } = await list();
    expect(userAllergens).toEqual(['milk']);
    const bySlug = Object.fromEntries(recipes.map((r) => [r.slug, r]));
    // Fløte (optional or not, every ingredient counts) and melk carry milk; pasta med tomat has none.
    expect(bySlug['testrett-kylling-og-ris']).toMatchObject({
      allergens: ['milk', 'sesame'],
      allergenWarnings: ['milk'],
    });
    expect(bySlug['testrett-pannekaker']).toMatchObject({
      allergens: ['gluten', 'egg', 'milk'],
      allergenWarnings: ['milk'],
    });
    expect(bySlug['testrett-pasta-med-tomat']?.allergenWarnings).toEqual([]);

    const recipe = await detail('testrett-pannekaker');
    expect(line(recipe, 'Melk')?.allergens).toEqual(['milk']);
    expect(line(recipe, 'Egg')?.allergens).toEqual(['egg']);
    expect(recipe.userAllergens).toEqual(['milk']);
  });

  it('an allergen from an OPTIONAL ingredient still warns (the user may add it)', async () => {
    kari = await registerUser(app);
    await call(app, 'PUT', '/me/allergens', { client: kari, body: { allergens: ['sesame'] } });
    const { recipes } = await list();
    // Sesamfrø is the only sesame ingredient, and it is optional in kylling og ris.
    expect(recipes.find((r) => r.slug === 'testrett-kylling-og-ris')).toMatchObject({
      allergens: ['milk', 'sesame'],
      allergenWarnings: ['sesame'],
    });
    const recipe = await detail('testrett-kylling-og-ris');
    expect(line(recipe, 'Sesamfrø')).toMatchObject({ optional: true, allergens: ['sesame'] });
  });

  it.each([
    [{ allergens: ['milk', 'milk'] }, 'validation.allergen.duplicate'],
    [{ allergens: ['laktose'] }, 'validation.allergen.unknown'],
  ])('%j is refused (%s)', async (body, field) => {
    kari = await registerUser(app);
    const response = await call(app, 'PUT', '/me/allergens', { client: kari, body });
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain(field);
  });

  it('are deleted with the account (GDPR art. 9: may be health data)', async () => {
    kari = await registerUser(app);
    await call(app, 'PUT', '/me/allergens', { client: kari, body: { allergens: ['milk'] } });
    expect(await db.userAllergen.count({ where: { userId: kari.user.id } })).toBe(1);
    const deleted = await call(app, 'DELETE', '/me', {
      client: kari,
      body: { password: PASSWORD },
    });
    expect(deleted.statusCode).toBe(204);
    expect(await db.userAllergen.count({ where: { userId: kari.user.id } })).toBe(0);
  });

  it('NFR-SEC-004: allergens never end up in the log', async () => {
    kari = await registerUser(app);
    await call(app, 'PUT', '/me/allergens', {
      client: kari,
      body: { allergens: ['sesame', 'lupin'] },
    });
    await call(app, 'PUT', '/me/allergens', {
      client: kari,
      body: { allergens: ['sesame', 'sesame'] },
    });
    await list();
    expect(log.text()).toContain('/me/allergens');
    expect(log.text()).not.toMatch(/sesame|lupin/);
  });
});
