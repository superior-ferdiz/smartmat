import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  API_ERRORS,
  type MealEntryResponse,
  type MealPlanNeedsResponse,
  type MealPlanResponse,
  type RecipeListResponse,
  type ShoppingListResponse,
} from '@smartmat/shared';
import { createFakeClock } from '../src/test/fakes';
import {
  call,
  captureLog,
  createTestApp,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { createMealPlanRepo } from '../src/modules/mealplan/repo';
import { createShoppingRepo } from '../src/modules/shopping/repo';
import { createItem } from './inventoryHelpers';

/*
 * Spec 09, FR-PLAN-001–004, against the real test database with the fictional test recipes. "Today" is
 * Saturday 2026-10-24 in Norway; week 44 is 26 October – 1 November.
 * "Testrett: kylling og ris" (4 servings): 400 g kyllingfilet, 250 g ris, 1 løk (100 g), 2 dl fløte,
 * sesamfrø (optional), salt (staple).
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-24T10:00:00Z'));
const log = captureLog();
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let recipeId: string;

beforeAll(async () => {
  app = await createTestApp(db, {
    now: clock.now,
    logStream: log.stream,
    config: { logLevel: 'info' },
  });
});
afterAll(() => app.close());
beforeEach(async () => {
  kari = await registerUser(app);
  ola = await registerUser(app);
  const recipes = await call(app, 'GET', `/households/${kari.user.householdId}/recipes`, {
    client: kari,
  });
  recipeId = recipes
    .json<RecipeListResponse>()
    .recipes.find((r) => r.slug === 'testrett-kylling-og-ris')!.id;
});

const planPath = (client: Client, path = '') =>
  `/households/${client.user.householdId}/meal-plan${path}`;

async function addRecipe(
  client: Client,
  overrides: Record<string, unknown> = {},
): Promise<MealEntryResponse> {
  const response = await call(app, 'POST', planPath(client, '/entries'), {
    client,
    body: {
      kind: 'recipe',
      recipeId,
      servings: 4,
      date: '2026-10-26',
      meal: 'dinner',
      ...overrides,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<MealEntryResponse>();
}

async function week(client = kari, from = '2026-10-26', to = '2026-11-01') {
  const response = await call(app, 'GET', planPath(client, `?from=${from}&to=${to}`), { client });
  expect(response.statusCode).toBe(200);
  return response.json<MealPlanResponse>().entries;
}

async function needs(client = kari, from = '2026-10-26', to = '2026-11-01') {
  const response = await call(app, 'GET', planPath(client, `/needs?from=${from}&to=${to}`), {
    client,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<MealPlanNeedsResponse>();
}

async function toShopping(lines: { ingredientId: string; quantityBase: number | null }[]) {
  return call(app, 'POST', planPath(kari, '/shopping'), {
    client: kari,
    body: { from: '2026-10-26', to: '2026-11-01', lines },
  });
}

async function shoppingList(client = kari) {
  const response = await call(app, 'GET', `/households/${client.user.householdId}/shopping-list`, {
    client,
  });
  return response.json<ShoppingListResponse>().items;
}

const needOf = (n: MealPlanNeedsResponse, name: string) =>
  n.ingredients.find((i) => i.ingredientName === name)!;

describe('FR-PLAN-001 week plan', () => {
  it('adds a recipe and a note, and lists them by date and meal', async () => {
    const dinner = await addRecipe(kari, { date: '2026-10-27' });
    expect(dinner).toMatchObject({
      kind: 'recipe',
      recipeId,
      recipeTitle: 'Testrett: kylling og ris',
      recipeServings: 4,
      servings: 4,
      note: null,
    });
    const note = await call(app, 'POST', planPath(kari, '/entries'), {
      client: kari,
      body: { kind: 'note', note: '  Rester  ', date: '2026-10-27', meal: 'lunch' },
    });
    expect(note.statusCode).toBe(201);
    expect(note.json<MealEntryResponse>()).toMatchObject({ kind: 'note', note: 'Rester' });
    await addRecipe(kari, { date: '2026-10-26', meal: 'breakfast' });

    const entries = await week();
    expect(entries.map((e) => [e.date, e.meal, e.kind])).toEqual([
      ['2026-10-26', 'breakfast', 'recipe'],
      ['2026-10-27', 'lunch', 'note'],
      ['2026-10-27', 'dinner', 'recipe'],
    ]);
    // Another week does not show them.
    expect(await week(kari, '2026-11-02', '2026-11-08')).toEqual([]);
  });

  it('the same form twice gives one entry (200 the second time)', async () => {
    const body = {
      kind: 'note',
      note: 'Spise ute',
      date: '2026-10-28',
      meal: 'dinner',
      clientRequestId: '0199f0a0-0000-7000-8000-0000000000aa',
    };
    const first = await call(app, 'POST', planPath(kari, '/entries'), { client: kari, body });
    const second = await call(app, 'POST', planPath(kari, '/entries'), { client: kari, body });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json<MealEntryResponse>().id).toBe(first.json<MealEntryResponse>().id);
    expect(await week()).toHaveLength(1);
  });

  it('moves an entry, changes servings and text, and removes it', async () => {
    const entry = await addRecipe(kari);
    const moved = await call(app, 'PATCH', planPath(kari, `/entries/${entry.id}`), {
      client: kari,
      body: { date: '2026-10-30', meal: 'lunch', servings: 6 },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json<MealEntryResponse>()).toMatchObject({
      date: '2026-10-30',
      meal: 'lunch',
      servings: 6,
    });

    const removed = await call(app, 'DELETE', planPath(kari, `/entries/${entry.id}`), {
      client: kari,
    });
    expect(removed.statusCode).toBe(204);
    expect(await week()).toEqual([]);
    const again = await call(app, 'DELETE', planPath(kari, `/entries/${entry.id}`), {
      client: kari,
    });
    expect(again.statusCode).toBe(404);
  });

  it('servings belong to recipes and text to notes', async () => {
    const entry = await addRecipe(kari);
    const noteOnRecipe = await call(app, 'PATCH', planPath(kari, `/entries/${entry.id}`), {
      client: kari,
      body: { note: 'Rester' },
    });
    expect(noteOnRecipe.statusCode).toBe(400);
    expect(noteOnRecipe.json().error.fields).toEqual({ note: 'validation.mealPlan.notANote' });

    const note = await call(app, 'POST', planPath(kari, '/entries'), {
      client: kari,
      body: { kind: 'note', note: 'Rester', date: '2026-10-26', meal: 'dinner' },
    });
    const servingsOnNote = await call(
      app,
      'PATCH',
      planPath(kari, `/entries/${note.json<MealEntryResponse>().id}`),
      { client: kari, body: { servings: 2 } },
    );
    expect(servingsOnNote.json().error.fields).toEqual({
      servings: 'validation.mealPlan.notARecipe',
    });
  });

  it.each([
    [{ kind: 'recipe', recipeId: '0199f0a0-0000-7000-8000-000000000001', servings: 4 }, 'recipeId'],
    [{ kind: 'recipe', servings: 0 }, 'servings'],
    [{ kind: 'recipe', servings: 51 }, 'servings'],
    [{ kind: 'recipe', servings: 2.5 }, 'servings'],
    [{ kind: 'note', note: '   ' }, 'note'],
    [{ kind: 'note', note: 'x'.repeat(101) }, 'note'],
    [{ kind: 'note', note: 'Rester', date: '2026-02-30' }, 'date'],
    [{ kind: 'note', note: 'Rester', meal: 'supper' }, 'meal'],
    [{ kind: 'snack', note: 'Rester' }, 'kind'],
  ])('refuses %j (field %s)', async (body, field) => {
    const response = await call(app, 'POST', planPath(kari, '/entries'), {
      client: kari,
      body: { recipeId, date: '2026-10-26', meal: 'dinner', ...body },
    });
    expect(response.statusCode).toBe(400);
    expect(Object.keys(response.json().error.fields ?? {}).join()).toContain(field);
  });

  it('at most 20 entries per day, also when moving one there', async () => {
    for (let i = 0; i < 20; i++) {
      await call(app, 'POST', planPath(kari, '/entries'), {
        client: kari,
        body: { kind: 'note', note: `Rett ${i}`, date: '2026-10-29', meal: 'dinner' },
      });
    }
    const full = await call(app, 'POST', planPath(kari, '/entries'), {
      client: kari,
      body: { kind: 'note', note: 'En til', date: '2026-10-29', meal: 'lunch' },
    });
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe(API_ERRORS.mealPlanDayFull);
    const other = await addRecipe(kari, { date: '2026-10-30' });
    const move = await call(app, 'PATCH', planPath(kari, `/entries/${other.id}`), {
      client: kari,
      body: { date: '2026-10-29' },
    });
    expect(move.statusCode).toBe(409);
  });

  it('a period longer than six weeks, or backwards, is refused', async () => {
    for (const query of [
      '?from=2026-10-26&to=2026-12-07',
      '?from=2026-10-27&to=2026-10-26',
      '?from=x&to=y',
    ]) {
      const response = await call(app, 'GET', planPath(kari, query), { client: kari });
      expect(response.statusCode, query).toBe(400);
    }
    const sixWeeks = await call(app, 'GET', planPath(kari, '?from=2026-10-26&to=2026-12-06'), {
      client: kari,
    });
    expect(sixWeeks.statusCode).toBe(200);
  });

  it('a removed recipe leaves the entry with its title, and it no longer counts in the needs', async () => {
    const temp = await db.recipe.create({
      data: {
        slug: 'testrett-midlertidig',
        title: 'Testrett: midlertidig',
        description: 'x',
        servings: 2,
        prepMinutes: 0,
        cookMinutes: 0,
        steps: ['x'],
        tags: [],
        source: 'test',
        license: 'test',
        authors: ['Testdata'],
      },
    });
    try {
      const entry = await addRecipe(kari, { recipeId: temp.id, servings: 2 });
      await db.recipe.delete({ where: { id: temp.id } });
      const [after] = await week();
      expect(after).toMatchObject({
        id: entry.id,
        kind: 'recipe',
        recipeId: null,
        recipeTitle: 'Testrett: midlertidig',
        recipeServings: null,
        servings: 2,
      });
      expect((await needs()).recipeEntryCount).toBe(0);
    } finally {
      await db.recipe.deleteMany({ where: { slug: 'testrett-midlertidig' } });
    }
  });

  it('notes and titles never reach the log', async () => {
    await call(app, 'POST', planPath(kari, '/entries'), {
      client: kari,
      body: { kind: 'note', note: 'Bursdag til Hemmelig Navn', date: '2026-10-26', meal: 'dinner' },
    });
    await call(app, 'POST', planPath(kari, '/entries'), {
      client: kari,
      body: {
        kind: 'note',
        note: 'x'.repeat(200) + 'Hemmelig',
        date: '2026-10-26',
        meal: 'dinner',
      },
    });
    expect(log.text()).not.toContain('Hemmelig');
  });
});

describe('FR-PLAN-003 needs', () => {
  it('scales, subtracts the inventory and counts only from today', async () => {
    // 2 servings of 4: 200 g kylling, 125 g ris, 50 g løk, 100 ml fløte.
    await addRecipe(kari, { servings: 2 });
    // A day that is over in the same week does not count.
    await addRecipe(kari, { date: '2026-10-23' });
    await createItem(app, kari, {
      name: 'Kyllingfilet',
      unit: 'g',
      quantityBase: 150,
      expiry: { kind: 'use_by', date: '2026-10-30' },
    });
    await createItem(app, kari, { name: 'Gul løk', unit: 'stk', quantityBase: 1, expiry: null });

    const result = await needs(kari, '2026-10-19', '2026-11-01');
    expect(result.from).toBe('2026-10-24');
    expect(result.recipeEntryCount).toBe(1);
    expect(needOf(result, 'Kyllingfilet')).toMatchObject({
      needBase: 200,
      coveredBase: 150,
      missingBase: 50,
      status: 'notEnough',
      toBuyBase: 50,
    });
    expect(needOf(result, 'Ris')).toMatchObject({ needBase: 125, status: 'missing' });
    expect(needOf(result, 'Løk')).toMatchObject({
      needBase: 50,
      status: 'enough',
      approximate: true,
    });
    expect(needOf(result, 'Salt').status).toBe('staple');
    expect(needOf(result, 'Sesamfrø').optional).toBe(true);
    expect(result.suggestions.filter((s) => s.selected).map((s) => s.ingredientName)).toEqual([
      'Fløte',
      'Kyllingfilet',
      'Ris',
    ]);
  });

  it('a batch with use-by before the planned day does not count; unplanned expiring food is listed', async () => {
    await addRecipe(kari, { date: '2026-10-30' });
    await createItem(app, kari, {
      name: 'Kyllingfilet',
      unit: 'g',
      quantityBase: 1000,
      expiry: { kind: 'use_by', date: '2026-10-28' },
    });
    await createItem(app, kari, {
      name: 'Lettmelk',
      unit: 'ml',
      quantityBase: 1000,
      expiry: { kind: 'best_before', date: '2026-10-27' },
    });
    const result = await needs();
    expect(needOf(result, 'Kyllingfilet')).toMatchObject({ coveredBase: 0, status: 'missing' });
    expect(result.unplannedExpiring.map((u) => [u.itemName, u.expiryKind])).toEqual([
      ['Lettmelk', 'best_before'],
    ]);
  });
});

describe('FR-PLAN-004 from the plan to the shopping list', () => {
  it('adds what is missing, and the same need twice never doubles', async () => {
    const entry = await addRecipe(kari, { servings: 2 });
    const kylling = needOf(await needs(), 'Kyllingfilet');

    const first = await toShopping([{ ingredientId: kylling.ingredientId, quantityBase: 200 }]);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toEqual({ created: 1, merged: 0, skipped: 0 });
    let [line] = await shoppingList();
    expect(line).toMatchObject({ text: 'Kyllingfilet', quantityBase: 200, unit: 'g' });
    expect(line?.meals).toEqual([
      {
        entryId: entry.id,
        date: '2026-10-26',
        meal: 'dinner',
        title: 'Testrett: kylling og ris',
        quantityBase: 200,
      },
    ]);
    expect(needOf(await needs(), 'Kyllingfilet')).toMatchObject({
      toBuyBase: 0,
      alreadyAdded: true,
    });

    const second = await toShopping([{ ingredientId: kylling.ingredientId, quantityBase: 200 }]);
    expect(second.json()).toEqual({ created: 0, merged: 0, skipped: 1 });
    [line] = await shoppingList();
    expect(line?.quantityBase).toBe(200);

    // More servings: only the increase (400 - 200) is added.
    await call(app, 'PATCH', planPath(kari, `/entries/${entry.id}`), {
      client: kari,
      body: { servings: 4 },
    });
    expect(needOf(await needs(), 'Kyllingfilet').toBuyBase).toBe(200);
    const third = await toShopping([{ ingredientId: kylling.ingredientId, quantityBase: 200 }]);
    expect(third.json()).toEqual({ created: 0, merged: 1, skipped: 0 });
    [line] = await shoppingList();
    expect(line).toMatchObject({ quantityBase: 400 });
    expect(line?.meals[0]?.quantityBase).toBe(400);
  });

  it('two requests at the same time add once', async () => {
    await addRecipe(kari);
    const kylling = needOf(await needs(), 'Kyllingfilet');
    const lines = [{ ingredientId: kylling.ingredientId, quantityBase: 400 }];
    const results = await Promise.all([toShopping(lines), toShopping(lines)]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    const items = await shoppingList();
    expect(items).toHaveLength(1);
    expect(items[0]?.quantityBase).toBe(400);
  });

  it('merges with an open line for the same ingredient (spec 06 rules)', async () => {
    await addRecipe(kari);
    await call(app, 'POST', `/households/${kari.user.householdId}/shopping-list/items`, {
      client: kari,
      body: { text: 'Kyllingfilet', quantity: { quantityBase: 100, unit: 'g' } },
    });
    const kylling = needOf(await needs(), 'Kyllingfilet');
    const result = await toShopping([{ ingredientId: kylling.ingredientId, quantityBase: 400 }]);
    expect(result.json()).toEqual({ created: 0, merged: 1, skipped: 0 });
    const items = await shoppingList();
    expect(items).toHaveLength(1);
    expect(items[0]?.quantityBase).toBe(500);
  });

  it('removing the line or the entry: the line stays / the need comes back', async () => {
    const entry = await addRecipe(kari);
    const kylling = needOf(await needs(), 'Kyllingfilet');
    await toShopping([{ ingredientId: kylling.ingredientId, quantityBase: 400 }]);

    // Removing the entry removes its share, not the line.
    await call(app, 'DELETE', planPath(kari, `/entries/${entry.id}`), { client: kari });
    const [line] = await shoppingList();
    expect(line).toMatchObject({ text: 'Kyllingfilet', meals: [] });

    // Removing the line: a new entry needs it again.
    await addRecipe(kari);
    await call(
      app,
      'DELETE',
      `/households/${kari.user.householdId}/shopping-list/items/${line!.id}`,
      {
        client: kari,
      },
    );
    expect(needOf(await needs(), 'Kyllingfilet').toBuyBase).toBe(400);
  });

  it('an ingredient the plan does not need is refused, and nothing is added', async () => {
    await addRecipe(kari);
    const egg = await db.ingredient.findUniqueOrThrow({ where: { key: 'egg' } });
    const kylling = needOf(await needs(), 'Kyllingfilet');
    const response = await toShopping([
      { ingredientId: kylling.ingredientId, quantityBase: 400 },
      { ingredientId: egg.id, quantityBase: 2 },
    ]);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'lines.1.ingredientId': 'validation.mealPlan.notInPlan',
    });
    expect(await shoppingList()).toEqual([]);
  });
});

describe('NFR-SEC-001 IDOR: another household gets 404 everywhere and changes nothing', () => {
  it('every endpoint under someone else’s household id', async () => {
    const entry = await addRecipe(kari);
    const kylling = needOf(await needs(), 'Kyllingfilet');
    const requests: [string, string, unknown?][] = [
      ['GET', planPath(kari, '?from=2026-10-26&to=2026-11-01')],
      [
        'POST',
        planPath(kari, '/entries'),
        { kind: 'note', note: 'Inntrenger', date: '2026-10-26', meal: 'dinner' },
      ],
      ['PATCH', planPath(kari, `/entries/${entry.id}`), { servings: 9 }],
      ['DELETE', planPath(kari, `/entries/${entry.id}`)],
      ['GET', planPath(kari, '/needs?from=2026-10-26&to=2026-11-01')],
      [
        'POST',
        planPath(kari, '/shopping'),
        {
          from: '2026-10-26',
          to: '2026-11-01',
          lines: [{ ingredientId: kylling.ingredientId, quantityBase: 1 }],
        },
      ],
    ];
    for (const [method, path, body] of requests) {
      const response = await call(app, method as 'GET', path, { client: ola, body });
      expect(response.statusCode, `${method} ${path}`).toBe(404);
    }
    const [unchanged] = await week();
    expect(unchanged).toMatchObject({ id: entry.id, servings: 4 });
    expect(await week()).toHaveLength(1);
    expect(await shoppingList()).toEqual([]);
  });

  it('someone else’s entry id under one’s own household', async () => {
    const entry = await addRecipe(kari);
    const patch = await call(app, 'PATCH', planPath(ola, `/entries/${entry.id}`), {
      client: ola,
      body: { servings: 9 },
    });
    const remove = await call(app, 'DELETE', planPath(ola, `/entries/${entry.id}`), {
      client: ola,
    });
    expect([patch.statusCode, remove.statusCode]).toEqual([404, 404]);
    expect((await week())[0]).toMatchObject({ id: entry.id, servings: 4 });
    // Ola's own needs do not see Kari's plan.
    expect((await needs(ola)).recipeEntryCount).toBe(0);
  });

  it('the repos filter on the household themselves (not only the routes and the service)', async () => {
    const entry = await addRecipe(kari);
    const kylling = needOf(await needs(), 'Kyllingfilet');
    await toShopping([{ ingredientId: kylling.ingredientId, quantityBase: 400 }]);
    const repo = createMealPlanRepo(db);
    const other = ola.user.householdId;
    expect(await repo.get(other, entry.id)).toBeNull();
    expect(await repo.list(other, '2026-10-26', '2026-11-01')).toEqual([]);
    expect(await repo.update(other, entry.id, { servings: 9 })).toBe(false);
    expect(await repo.remove(other, entry.id)).toBe(false);
    expect(await createShoppingRepo(db).mealContributions(other, [entry.id])).toEqual([]);
    // Kari's own household still sees all of it, unchanged.
    expect((await repo.get(kari.user.householdId, entry.id))?.servings).toBe(4);
    expect(
      await createShoppingRepo(db).mealContributions(kari.user.householdId, [entry.id]),
    ).toEqual([{ entryId: entry.id, ingredientId: kylling.ingredientId, quantityBase: 400 }]);
  });

  it('logged out: 401', async () => {
    const response = await call(app, 'GET', planPath(kari, '?from=2026-10-26&to=2026-11-01'));
    expect(response.statusCode).toBe(401);
  });
});
