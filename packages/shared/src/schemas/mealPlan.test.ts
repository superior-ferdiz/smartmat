import { describe, expect, it } from 'vitest';
import {
  addPlanToShoppingSchema,
  createMealEntrySchema,
  mealPlanRangeSchema,
  updateMealEntrySchema,
} from './mealPlan';

const RECIPE = '0199f0a0-0000-7000-8000-000000000001';
const issues = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  result.success ? [] : (result.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]);

describe('spec 09 createMealEntrySchema (shared by the form and the API)', () => {
  it('a recipe with servings, or a note', () => {
    expect(
      createMealEntrySchema.parse({
        kind: 'recipe',
        recipeId: RECIPE,
        servings: 4,
        date: '2026-10-26',
        meal: 'dinner',
      }),
    ).toMatchObject({ kind: 'recipe', servings: 4 });
    expect(
      createMealEntrySchema.parse({
        kind: 'note',
        note: '  Rester ',
        date: '2026-10-26',
        meal: 'lunch',
      }),
    ).toMatchObject({ kind: 'note', note: 'Rester' });
  });

  it.each([
    [{ kind: 'recipe', recipeId: RECIPE, servings: 0 }, 'servings', 'validation.mealPlan.servings'],
    [
      { kind: 'recipe', recipeId: RECIPE, servings: 51 },
      'servings',
      'validation.mealPlan.servings',
    ],
    [
      { kind: 'recipe', recipeId: RECIPE, servings: 1.5 },
      'servings',
      'validation.mealPlan.servings',
    ],
    [
      { kind: 'recipe', recipeId: RECIPE, servings: Number.NaN },
      'servings',
      'validation.mealPlan.servings',
    ],
    [{ kind: 'recipe', recipeId: '', servings: 2 }, 'recipeId', 'validation.mealPlan.recipe'],
    [{ kind: 'note', note: '   ' }, 'note', 'validation.mealPlan.noteRequired'],
    [{ kind: 'note', note: 'x'.repeat(101) }, 'note', 'validation.mealPlan.noteTooLong'],
    [{ kind: 'note', note: 'Rester', meal: 'supper' }, 'meal', 'validation.mealPlan.meal'],
    [{ kind: 'note', note: 'Rester', date: '2026-02-30' }, 'date', 'validation.date.invalid'],
  ])('%j → %s: %s', (body, path, message) => {
    const result = createMealEntrySchema.safeParse({ date: '2026-10-26', meal: 'dinner', ...body });
    expect(issues(result)).toContainEqual([path, message]);
  });

  it('servings from 1 to 50 are fine', () => {
    for (const servings of [1, 50])
      expect(
        createMealEntrySchema.safeParse({
          kind: 'recipe',
          recipeId: RECIPE,
          servings,
          date: '2026-10-26',
          meal: 'dinner',
        }).success,
      ).toBe(true);
  });
});

describe('spec 09 updateMealEntrySchema', () => {
  it('needs something to change', () => {
    expect(issues(updateMealEntrySchema.safeParse({}))).toContainEqual([
      '',
      'validation.nothingToUpdate',
    ]);
    expect(updateMealEntrySchema.parse({ meal: 'lunch' })).toEqual({ meal: 'lunch' });
  });
});

describe('spec 09 mealPlanRangeSchema', () => {
  it('from ≤ to, at most six weeks (42 days, both included)', () => {
    expect(mealPlanRangeSchema.safeParse({ from: '2026-10-26', to: '2026-12-06' }).success).toBe(
      true,
    );
    expect(issues(mealPlanRangeSchema.safeParse({ from: '2026-10-26', to: '2026-12-07' }))).toEqual(
      [['to', 'validation.mealPlan.rangeTooLong']],
    );
    expect(issues(mealPlanRangeSchema.safeParse({ from: '2026-10-27', to: '2026-10-26' }))).toEqual(
      [['to', 'validation.mealPlan.range']],
    );
    expect(mealPlanRangeSchema.safeParse({ from: '2026-10-26', to: '2026-10-26' }).success).toBe(
      true,
    );
  });
});

describe('spec 09 addPlanToShoppingSchema', () => {
  const line = (ingredientId = RECIPE, quantityBase: number | null = 100) => ({
    ingredientId,
    quantityBase,
  });
  it('lines with an amount or none, never the same ingredient twice, never empty', () => {
    const range = { from: '2026-10-26', to: '2026-11-01' };
    expect(
      addPlanToShoppingSchema.safeParse({
        ...range,
        lines: [line(), line('0199f0a0-0000-7000-8000-000000000002', null)],
      }).success,
    ).toBe(true);
    expect(issues(addPlanToShoppingSchema.safeParse({ ...range, lines: [] }))).toContainEqual([
      'lines',
      'validation.shopping.nothingSelected',
    ]);
    expect(
      issues(addPlanToShoppingSchema.safeParse({ ...range, lines: [line(), line()] })),
    ).toContainEqual(['lines', 'validation.shopping.duplicateLine']);
    expect(addPlanToShoppingSchema.safeParse({ ...range, lines: [line(RECIPE, 0)] }).success).toBe(
      false,
    );
    expect(
      issues(
        addPlanToShoppingSchema.safeParse({
          from: '2026-10-26',
          to: '2026-12-31',
          lines: [line()],
        }),
      ),
    ).toContainEqual(['to', 'validation.mealPlan.rangeTooLong']);
  });
});
