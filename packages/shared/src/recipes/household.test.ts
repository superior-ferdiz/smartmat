import { describe, expect, it } from 'vitest';
import {
  avoidedIngredientsBodySchema,
  createHouseholdRecipeSchema,
  updateHouseholdRecipeSchema,
} from '../schemas/recipes';
import {
  AVOIDED_INGREDIENTS_MAX,
  RECIPE_LINES_MAX,
  defaultLineText,
  dietWarnings,
  ingredientConflicts,
  lineQuantityBase,
  unitsFor,
} from './household';

/* Spec 16: own recipes (FR-REC-008) and avoided ingredients (FR-ALG-002/003). */

const MILK = { baseUnit: 'ml' as const, conversions: [] };
const EGG = {
  baseUnit: 'stk' as const,
  conversions: [{ unit: 'g' as const, unitQty: 60, baseQty: 1 }],
};
const ONION = {
  baseUnit: 'g' as const,
  conversions: [{ unit: 'stk' as const, unitQty: 1, baseQty: 100 }],
};

const uuid = (n: number) => `0199f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe('FR-REC-008 units and amounts', () => {
  it('offers the units of the base unit and of every conversion', () => {
    expect(unitsFor(MILK)).toEqual(['ml', 'dl', 'l', 'ss', 'ts', 'krm']);
    expect(unitsFor(EGG)).toEqual(['g', 'kg', 'stk']);
    expect(unitsFor(ONION)).toEqual(['g', 'kg', 'stk']);
  });

  it('converts like the seed files (rounded once, at the end)', () => {
    expect(lineQuantityBase('2', 'dl', MILK)).toBe(200);
    expect(lineQuantityBase('1,5', 'l', MILK)).toBe(1500);
    expect(lineQuantityBase('1/2', 'stk', ONION)).toBe(50);
    expect(lineQuantityBase('120', 'g', EGG)).toBe(2);
  });

  it('says what is wrong: the amount or the unit', () => {
    expect(lineQuantityBase('mye', 'dl', MILK)).toBe('validation.recipe.amount');
    expect(lineQuantityBase('0', 'dl', MILK)).toBe('validation.recipe.amount');
    expect(lineQuantityBase('0,1', 'krm', MILK)).toBe('validation.recipe.amount'); // less than 1 ml
    expect(lineQuantityBase('1000000', 'l', MILK)).toBe('validation.recipe.amount');
    expect(lineQuantityBase('2', 'stk', MILK)).toBe('validation.recipe.unit');
    expect(lineQuantityBase('2', 'g', MILK)).toBe('validation.recipe.unit');
  });

  it('writes the line text when the user leaves it empty', () => {
    expect(defaultLineText('melk', '2', 'dl')).toBe('2 dl melk');
    expect(defaultLineText('salt', null, null)).toBe('salt');
  });
});

describe('FR-ALG-002 warnings', () => {
  const kiwi = { id: uuid(1), name: 'Kiwi' };
  const egg = { id: uuid(2), name: 'Egg' };

  it('lists the avoided ingredients a recipe has, in the order of the list', () => {
    expect(ingredientConflicts([uuid(2), uuid(1), uuid(9)], [kiwi, egg])).toEqual(['Kiwi', 'Egg']);
    expect(ingredientConflicts([uuid(9)], [kiwi, egg])).toEqual([]);
  });

  it('own and household warnings for allergens and ingredients, from every ingredient line', () => {
    const ingredients = [
      { id: uuid(1), allergens: [] },
      { id: uuid(2), allergens: ['egg' as const] },
      { id: uuid(3), allergens: ['milk' as const, 'gluten' as const] },
    ];
    expect(
      dietWarnings(
        ingredients,
        { allergens: ['milk', 'fish'], avoided: [kiwi] },
        { allergens: ['egg'], avoided: [egg] },
      ),
    ).toEqual({
      allergenWarnings: ['milk'],
      householdAllergenWarnings: ['egg'],
      ingredientWarnings: ['Kiwi'],
      householdIngredientWarnings: ['Egg'],
    });
  });

  it('nothing registered gives no warnings (never "free of")', () => {
    expect(
      dietWarnings(
        [{ id: uuid(1), allergens: ['milk'] }],
        { allergens: [], avoided: [] },
        { allergens: [], avoided: [] },
      ),
    ).toEqual({
      allergenWarnings: [],
      householdAllergenWarnings: [],
      ingredientWarnings: [],
      householdIngredientWarnings: [],
    });
  });
});

describe('spec 16 request schemas', () => {
  const base = {
    title: ' Omelett ',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 10,
    tags: ['Frokost', 'frokost'],
    lines: [
      { kind: 'ingredient', ingredientId: uuid(1), amount: '3', unit: 'stk' },
      { kind: 'ingredient', ingredientId: uuid(2), amount: '' },
      { kind: 'freeText', text: 'Gressløk' },
    ],
    steps: ['Stek.'],
  };

  it('trims, fills defaults, turns an empty amount into none and removes duplicate tags', () => {
    const parsed = createHouseholdRecipeSchema.parse(base);
    expect(parsed).toMatchObject({ title: 'Omelett', description: '', tags: ['frokost'] });
    expect(parsed.lines[1]).toEqual({
      kind: 'ingredient',
      ingredientId: uuid(2),
      amount: null,
      unit: null,
      text: '',
      optional: false,
    });
  });

  it('refuses an amount without a unit, the same ingredient twice and too many lines', () => {
    const issues = (input: unknown) =>
      createHouseholdRecipeSchema
        .safeParse(input)
        .error?.issues.map((i) => [i.path.join('.'), i.message]);
    expect(
      issues({ ...base, lines: [{ kind: 'ingredient', ingredientId: uuid(1), amount: '2' }] }),
    ).toEqual([['lines.0.amount', 'validation.recipe.amountAndUnit']]);
    expect(
      issues({
        ...base,
        lines: [
          { kind: 'ingredient', ingredientId: uuid(1) },
          { kind: 'ingredient', ingredientId: uuid(1) },
        ],
      }),
    ).toEqual([['lines.1.ingredientId', 'validation.recipe.duplicateIngredient']]);
    expect(
      issues({
        ...base,
        lines: Array.from({ length: RECIPE_LINES_MAX + 1 }, () => ({
          kind: 'freeText',
          text: 'x',
        })),
      }),
    ).toEqual([['lines', 'validation.recipe.tooManyLines']]);
  });

  it('an update needs the version it opened', () => {
    expect(updateHouseholdRecipeSchema.safeParse(base).success).toBe(false);
    expect(updateHouseholdRecipeSchema.safeParse({ ...base, version: 3 }).success).toBe(true);
  });

  it('the avoided list: unique ids, at most the limit', () => {
    expect(
      avoidedIngredientsBodySchema.safeParse({ ingredientIds: [uuid(1), uuid(1)] }).success,
    ).toBe(false);
    const many = Array.from({ length: AVOIDED_INGREDIENTS_MAX + 1 }, (_, i) => uuid(i));
    expect(avoidedIngredientsBodySchema.safeParse({ ingredientIds: many }).success).toBe(false);
    expect(avoidedIngredientsBodySchema.safeParse({ ingredientIds: many.slice(1) }).success).toBe(
      true,
    );
  });
});
