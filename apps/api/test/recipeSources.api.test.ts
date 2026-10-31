import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RecipeDetail, RecipeListResponse } from '@smartmat/shared';
import { createFakeClock } from '../src/test/fakes';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { createItem } from './inventoryHelpers';

/*
 * Spec 09: FR-REC-006 (source and licence, ADR-0016) and FR-PLAN-005 (ranking for a planned day), against
 * the real test database. Two external recipes are added for this file only and removed afterwards, so the
 * other files keep seeing just the fictional fixtures. "Today" is 2026-10-21 in Norway.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
let app: FastifyInstance;
let hidingApp: FastifyInstance;
let kari: Client;
const SLUGS = ['testkilde-ukontrollert', 'testkilde-kontrollert'];

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
  hidingApp = await createTestApp(db, {
    now: clock.now,
    config: { recipes: { includeUnreviewed: false } },
  });
  const rice = await db.ingredient.findUniqueOrThrow({ where: { key: 'ris' } });
  for (const [i, slug] of SLUGS.entries()) {
    const reviewed = i === 1;
    await db.recipe.create({
      data: {
        slug,
        title: reviewed ? 'Testkilde: kontrollert' : 'Testkilde: ukontrollert',
        description: 'Fiktiv ekstern oppskrift for testene.',
        servings: 2,
        prepMinutes: 5,
        cookMinutes: 10,
        steps: ['Trinn.'],
        tags: [],
        source: 'external',
        license: 'CC-BY-SA-4.0',
        authors: ['Bidragsytere til Wikibooks'],
        sourceTitle: 'Test Recipe',
        sourceUrl: 'https://en.wikibooks.org/w/index.php?oldid=1',
        retrievedOn: new Date('2026-10-24T00:00:00Z'),
        adaptation: 'translated',
        aiAssisted: true,
        reviewedBy: reviewed ? ['Linus Saxe Huseby'] : [],
        reviewedOn: reviewed ? new Date('2026-10-30T00:00:00Z') : null,
        ingredients: {
          create: [{ position: 0, ingredientId: rice.id, quantityBase: 100, displayText: 'Ris' }],
        },
      },
    });
  }
});
afterAll(async () => {
  await db.recipe.deleteMany({ where: { slug: { in: SLUGS } } });
  await Promise.all([app.close(), hidingApp.close()]);
});
beforeEach(async () => {
  kari = await registerUser(app);
});

const recipesPath = (path = '') => `/households/${kari.user.householdId}/recipes${path}`;

async function list(on = app, query = '') {
  const response = await call(on, 'GET', recipesPath(query), { client: kari });
  expect(response.statusCode).toBe(200);
  return response.json<RecipeListResponse>().recipes;
}

describe('FR-REC-006 source and licence', () => {
  it('an external recipe carries its origin; the test fixtures have none', async () => {
    const recipes = await list();
    const external = recipes.find((r) => r.slug === 'testkilde-ukontrollert');
    expect(external?.origin).toEqual({
      title: 'Test Recipe',
      url: 'https://en.wikibooks.org/w/index.php?oldid=1',
      license: 'CC-BY-SA-4.0',
      retrievedOn: '2026-10-24',
      adaptation: 'translated',
      adaptationNote: null,
      aiAssisted: true,
      reviewedBy: [],
      reviewedOn: null,
    });
    expect(recipes.find((r) => r.slug === 'testrett-pannekaker')?.origin).toBeNull();

    const detail = await call(app, 'GET', recipesPath(`/${external?.id}`), { client: kari });
    expect(detail.json<RecipeDetail>().origin?.url).toBe(
      'https://en.wikibooks.org/w/index.php?oldid=1',
    );
  });

  it('RECIPES_INCLUDE_UNREVIEWED=false hides unchecked external recipes, also by id', async () => {
    const all = await list();
    const unchecked = all.find((r) => r.slug === 'testkilde-ukontrollert');
    const shown = (await list(hidingApp)).map((r) => r.slug);
    expect(shown).toContain('testkilde-kontrollert');
    expect(shown).toContain('testrett-pannekaker');
    expect(shown).not.toContain('testkilde-ukontrollert');
    const byId = await call(hidingApp, 'GET', recipesPath(`/${unchecked?.id}`), { client: kari });
    expect(byId.statusCode).toBe(404);
  });

  it('a planned recipe that is hidden as unreviewed is shown like a removed one (title kept, no link)', async () => {
    const unchecked = (await list()).find((r) => r.slug === 'testkilde-ukontrollert');
    const created = await call(
      app,
      'POST',
      `/households/${kari.user.householdId}/meal-plan/entries`,
      {
        client: kari,
        body: {
          kind: 'recipe',
          recipeId: unchecked?.id,
          servings: 2,
          date: '2026-10-26',
          meal: 'dinner',
        },
      },
    );
    expect(created.statusCode).toBe(201);
    const path = `/households/${kari.user.householdId}/meal-plan?from=2026-10-26&to=2026-10-26`;
    const shown = (await call(app, 'GET', path, { client: kari })).json().entries[0];
    expect(shown).toMatchObject({ recipeId: unchecked?.id, recipeServings: 2 });
    const hidden = (await call(hidingApp, 'GET', path, { client: kari })).json().entries[0];
    expect(hidden).toMatchObject({
      recipeId: null,
      recipeTitle: 'Testkilde: ukontrollert',
      recipeServings: null,
      servings: 2,
    });
  });

  it('the database refuses an external recipe without its source (CHECK)', async () => {
    await expect(
      db.recipe.create({
        data: {
          slug: 'testkilde-uten-kilde',
          title: 'Uten kilde',
          description: 'x',
          servings: 1,
          prepMinutes: 0,
          cookMinutes: 0,
          steps: ['x'],
          tags: [],
          source: 'external',
          license: 'CC-BY-SA-4.0',
          authors: ['x'],
        },
      }),
    ).rejects.toThrow(/recipes_external_source_check/);
  });
});

describe('FR-PLAN-005 ranking for a planned day', () => {
  it('a batch whose use-by date is before the day does not count for that day', async () => {
    // Rice with use-by 2026-10-23: enough today and on the 23rd, not on the 24th.
    await createItem(app, kari, {
      name: 'Jasminris',
      unit: 'g',
      quantityBase: 1000,
      expiry: { kind: 'use_by', date: '2026-10-23' },
    });
    const riceLine = async (query: string) => {
      const recipe = (await list(app, query)).find((r) => r.slug === 'testkilde-ukontrollert');
      return recipe?.score.enoughCount;
    };
    expect(await riceLine('')).toBe(1);
    expect(await riceLine('?for=2026-10-23')).toBe(1);
    expect(await riceLine('?for=2026-10-24')).toBe(0);
    // A day in the past is ranked as today.
    expect(await riceLine('?for=2026-10-01')).toBe(1);
  });

  it('an invalid date is refused', async () => {
    const response = await call(app, 'GET', recipesPath('?for=2026-02-30'), { client: kari });
    expect(response.statusCode).toBe(400);
  });

  it('IDOR: another household gives 404', async () => {
    const ola = await registerUser(app);
    const response = await call(
      app,
      'GET',
      `/households/${kari.user.householdId}/recipes?for=2026-10-24`,
      { client: ola },
    );
    expect(response.statusCode).toBe(404);
  });
});
