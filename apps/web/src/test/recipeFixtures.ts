import type { RecipeDetail, RecipeLine, RecipeSummary } from '@smartmat/shared';

/* Recipe responses for web tests (phase 5). Ids are fixed so tests can build URLs. */

let counter = 0;
const uuid = () => `0199f0a0-0000-7000-8000-${String(++counter).padStart(12, '0')}`;

export function recipeSummary(
  title: string,
  overrides: Partial<RecipeSummary> = {},
): RecipeSummary {
  return {
    id: uuid(),
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title,
    description: `${title} – beskrivelse`,
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ['middag'],
    source: 'team',
    ingredientNames: ['Kyllingfilet', 'Ris'],
    allergens: [],
    allergenWarnings: [],
    score: {
      total: 0,
      coverage: 0,
      expiringBonus: 0,
      requiredCount: 2,
      enoughCount: 0,
      partialCount: 0,
      missingCount: 2,
      reasons: [
        { code: 'nothing', points: 0 },
        { code: 'missing', points: 0, names: ['Kyllingfilet', 'Ris'] },
      ],
    },
    ...overrides,
  };
}

export function recipeLine(
  ingredientName: string,
  overrides: Partial<RecipeLine> = {},
): RecipeLine {
  return {
    position: 0,
    ingredientId: uuid(),
    ingredientName,
    displayText: ingredientName,
    quantityBase: 100,
    baseUnit: 'g',
    optional: false,
    status: 'missing',
    haveBase: null,
    missingBase: null,
    approximate: false,
    itemNames: [],
    expiring: null,
    excludedUseByItems: [],
    allergens: [],
    ...overrides,
  };
}

export function recipeDetail(
  title: string,
  lines: RecipeLine[],
  overrides: Partial<RecipeDetail> = {},
): RecipeDetail {
  return {
    ...recipeSummary(title),
    steps: ['Steg en.', 'Steg to.'],
    license: 'egen',
    authors: ['Linus Saxe Huseby'],
    lines: lines.map((line, position) => ({ ...line, position })),
    userAllergens: [],
    ...overrides,
  };
}
