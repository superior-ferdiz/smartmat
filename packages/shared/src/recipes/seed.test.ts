import { describe, expect, it } from 'vitest';
import { checkSeed, parseSeedAmount, seedQuantityBase } from './seed';

const meta = { writtenBy: 'Test', reviewedBy: [] };
const melk = {
  key: 'melk',
  name: 'Melk',
  baseUnit: 'ml',
  aliases: ['lettmelk'],
  allergens: ['milk'],
};
const mel = {
  key: 'hvetemel',
  name: 'Hvetemel',
  baseUnit: 'g',
  aliases: ['mel'],
  allergens: ['gluten'],
  conversions: [{ unit: 'ml', unitQty: 100, baseQty: 60 }],
};
const ingredients = { meta, ingredients: [melk, mel] };

function recipe(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'vafler',
    title: 'Vafler',
    description: 'Beskrivelse',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    source: 'team',
    license: 'egen',
    authors: ['Linus Saxe Huseby'],
    ingredients: [
      { ingredient: 'hvetemel', amount: '3', unit: 'dl', text: '3 dl hvetemel' },
      { ingredient: 'melk', amount: '1/2', unit: 'l', text: '1/2 l melk' },
    ],
    steps: ['Rør sammen.'],
    ...overrides,
  };
}

const errorsOf = (files: Record<string, unknown>, ingredientFile: unknown = ingredients) => {
  const result = checkSeed(ingredientFile, new Map(Object.entries(files)));
  return result.ok ? [] : result.errors;
};

describe('spec 05 parseSeedAmount', () => {
  it.each([
    ['2', { num: 2, den: 1 }],
    ['1,5', { num: 15, den: 10 }],
    ['0.25', { num: 25, den: 100 }],
    ['1/2', { num: 1, den: 2 }],
    ['0', null],
    ['0/3', null],
    ['-1', null],
    ['en klype', null],
    ['1 1/2', null],
  ])('%j → %j', (amount, expected) => {
    expect(parseSeedAmount(amount)).toEqual(expected);
  });
});

describe('spec 05 seedQuantityBase', () => {
  it.each([
    ['3', 'dl', mel, 180], // 300 ml × 60/100
    ['1/2', 'l', { baseUnit: 'ml', conversions: [] }, 500],
    ['2', 'ss', { baseUnit: 'ml', conversions: [] }, 30],
    ['1', 'ts', { baseUnit: 'ml', conversions: [] }, 5],
    ['1,5', 'kg', { baseUnit: 'g', conversions: [] }, 1500],
  ] as const)('%s %s → %i', (amount, unit, ingredient, expected) => {
    expect(seedQuantityBase(amount, unit, ingredient as never)).toBe(expected);
  });

  it('a unit of another kind without a conversion is an error, not a guess', () => {
    expect(seedQuantityBase('2', 'stk', { baseUnit: 'ml', conversions: [] })).toMatch(
      /kan ikke regnes om/,
    );
  });

  it('less than one base unit is an error', () => {
    expect(seedQuantityBase('1/4', 'krm', { baseUnit: 'ml', conversions: [] })).toMatch(
      /mindre enn 1/,
    );
  });
});

describe('spec 05 checkSeed', () => {
  it('a valid recipe resolves to base units, and the ingredient name is stored as an alias', () => {
    const result = checkSeed(ingredients, new Map([['vafler.json', recipe()]]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recipes[0]?.ingredients).toEqual([
      {
        ingredientKey: 'hvetemel',
        quantityBase: 180,
        displayText: '3 dl hvetemel',
        optional: false,
      },
      { ingredientKey: 'melk', quantityBase: 500, displayText: '1/2 l melk', optional: false },
    ]);
    expect(result.data.ingredients[0]?.aliases).toEqual(['melk', 'lettmelk']);
  });

  it('"etter smak" has no quantity', () => {
    const result = checkSeed(
      ingredients,
      new Map([
        ['vafler.json', recipe({ ingredients: [{ ingredient: 'melk', text: 'Melk etter smak' }] })],
      ]),
    );
    expect(result.ok && result.data.recipes[0]?.ingredients[0]?.quantityBase).toBeNull();
  });

  it('ADR-0009: a recipe without authors is refused', () => {
    expect(errorsOf({ 'vafler.json': recipe({ authors: [] }) }).join()).toMatch(/authors/);
    expect(errorsOf({ 'vafler.json': recipe({ authors: undefined }) }).join()).toMatch(/authors/);
  });

  it('only team and test are valid sources', () => {
    expect(errorsOf({ 'vafler.json': recipe({ source: 'ai' }) }).join()).toMatch(/source/);
  });

  it('lists every problem at once', () => {
    const errors = errorsOf({
      'feil-navn.json': recipe({
        ingredients: [
          { ingredient: 'sukker', amount: '1', unit: 'dl', text: 'sukker' },
          { ingredient: 'melk', amount: '1', unit: 'dl', text: 'melk' },
          { ingredient: 'melk', amount: '2', unit: 'dl', text: 'mer melk' },
          { ingredient: 'hvetemel', amount: '2', unit: 'stk', text: 'mel' },
        ],
      }),
    });
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/filnavnet må være slug/);
    expect(errors.join('\n')).toMatch(/«sukker» finnes ikke/);
    expect(errors.join('\n')).toMatch(/står flere ganger i oppskriften/);
    expect(errors.join('\n')).toMatch(/kan ikke regnes om/);
  });

  it('amount without unit (or the other way round) is refused', () => {
    const errors = errorsOf({
      'vafler.json': recipe({ ingredients: [{ ingredient: 'melk', amount: '2', text: 'melk' }] }),
    });
    expect(errors.join()).toMatch(/amount og unit/);
  });

  it('the same slug twice is refused', () => {
    const errors = errorsOf({ 'vafler.json': recipe(), 'vafler-2.json': recipe() });
    expect(errors.join('\n')).toMatch(/finnes allerede/);
  });

  it('an alias may belong to only one ingredient (also via the name)', () => {
    const errors = errorsOf({}, { meta, ingredients: [melk, { ...mel, aliases: ['Lettmelk'] }] });
    expect(errors.join()).toMatch(/«lettmelk» brukes av både melk og hvetemel/);
    const viaName = errorsOf(
      {},
      { meta, ingredients: [melk, { ...mel, key: 'melk-2', name: 'melk', aliases: [] }] },
    );
    expect(viaName.join()).toMatch(/«melk» brukes av både/);
  });

  it('allergens must be given for every ingredient, also when there are none', () => {
    const withoutAllergens: Partial<typeof melk> = { ...melk };
    delete withoutAllergens.allergens;
    expect(errorsOf({}, { meta, ingredients: [withoutAllergens] }).join()).toMatch(/allergens/);
    expect(errorsOf({}, { meta, ingredients: [{ ...melk, allergens: [] }] })).toEqual([]);
  });

  it('unknown allergens and duplicate keys are refused', () => {
    expect(errorsOf({}, { meta, ingredients: [{ ...melk, allergens: ['laktose'] }] })).not.toEqual(
      [],
    );
    expect(errorsOf({}, { meta, ingredients: [melk, { ...melk, aliases: [] }] }).join()).toMatch(
      /står flere ganger/,
    );
  });

  it('a conversion from the base unit itself is refused', () => {
    const errors = errorsOf(
      {},
      { meta, ingredients: [{ ...melk, conversions: [{ unit: 'ml', unitQty: 1, baseQty: 1 }] }] },
    );
    expect(errors.join()).toMatch(/grunnenheten selv/);
  });

  it('the ingredient file must say who wrote it', () => {
    expect(errorsOf({}, { ingredients: [melk] }).join()).toMatch(/meta/);
  });
});
