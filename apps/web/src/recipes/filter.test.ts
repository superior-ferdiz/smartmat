import { describe, expect, it } from 'vitest';
import { recipeSummary } from '../test/recipeFixtures';
import {
  allTags,
  dinnerSuggestion,
  filterRecipes,
  parseRecipeFilter,
  recipeFilterToParams,
} from './filter';
import { LINE_GROUPS, lineGroup } from './lines';

const score = (total: number) => ({ ...recipeSummary('x').score, total });

const wok = recipeSummary('Kyllingwok', { tags: ['middag', 'asiatisk'], score: score(80) });
const vafler = recipeSummary('Vafler', {
  tags: ['dessert'],
  ingredientNames: ['Hvetemel', 'Melk'],
  allergens: ['gluten', 'milk'],
  allergenWarnings: ['milk'],
  score: score(90),
});
const suppe = recipeSummary('Ertesuppe', { tags: ['middag'], score: score(0) });
const all = [vafler, wok, suppe];

describe('FR-REC-001 recipe filter in the URL', () => {
  it('defaults are left out of the URL, and read back the same', () => {
    expect(
      recipeFilterToParams({ q: '', tag: '', showAllergens: false, ownOnly: false }).toString(),
    ).toBe('');
    const filter = { q: 'wok', tag: 'middag', showAllergens: true, ownOnly: false };
    const params = recipeFilterToParams(filter);
    expect(params.toString()).toBe('q=wok&tagg=middag&allergener=vis');
    expect(parseRecipeFilter(params)).toEqual(filter);
  });

  it('tags are listed once, in Norwegian order', () => {
    expect(allTags(all)).toEqual(['asiatisk', 'dessert', 'middag']);
  });
});

describe('FR-REC-001/004 filterRecipes', () => {
  const none = { q: '', tag: '', showAllergens: false, ownOnly: false };

  it('FR-REC-004: hides recipes with the user’s allergens by default, and counts them', () => {
    expect(filterRecipes(all, none, 'nb-NO')).toEqual({
      shown: [wok, suppe],
      hiddenByAllergens: 1,
    });
  });

  it('the switch shows them again, in the ranked order from the API', () => {
    expect(filterRecipes(all, { ...none, showAllergens: true }, 'nb-NO')).toEqual({
      shown: all,
      hiddenByAllergens: 0,
    });
  });

  it('searches title and ingredient names, case-insensitive', () => {
    expect(filterRecipes(all, { ...none, q: 'WOK' }, 'nb-NO').shown).toEqual([wok]);
    expect(filterRecipes(all, { ...none, q: 'ris' }, 'nb-NO').shown).toEqual([wok, suppe]);
  });

  it('filters by tag; the hidden count only counts recipes the other filters let through', () => {
    expect(filterRecipes(all, { ...none, tag: 'middag' }, 'nb-NO')).toEqual({
      shown: [wok, suppe],
      hiddenByAllergens: 0,
    });
    expect(filterRecipes(all, { ...none, tag: 'dessert' }, 'nb-NO')).toEqual({
      shown: [],
      hiddenByAllergens: 1,
    });
  });
});

describe('FR-DASH-001 dinnerSuggestion', () => {
  it('the best-ranked recipe without the user’s allergens', () => {
    expect(dinnerSuggestion(all)).toBe(wok);
  });

  it('nothing when the best one scores 0, or when there are none', () => {
    expect(dinnerSuggestion([suppe])).toBeNull();
    expect(dinnerSuggestion([vafler])).toBeNull();
    expect(dinnerSuggestion([])).toBeNull();
  });
});

describe('FR-REC-003 lineGroup', () => {
  it.each([
    ['enough', 'have'],
    ['notEnough', 'short'],
    ['unknownAmount', 'short'],
    ['missing', 'missing'],
    ['staple', 'staple'],
  ] as const)('%s → %s', (status, group) => {
    expect(lineGroup({ status })).toBe(group);
  });

  it('groups are shown have → short → missing → staple', () => {
    expect(LINE_GROUPS).toEqual(['have', 'short', 'missing', 'staple']);
  });
});

describe('spec 10 FR-HH-006 allergens the household shares', () => {
  const eggy = recipeSummary('Omelett', { householdAllergenWarnings: ['egg'], score: score(90) });
  const filter = { q: '', tag: '', showAllergens: false, ownOnly: false };

  it('hides them by default, counts them, and the switch shows them', () => {
    expect(filterRecipes([eggy, wok], filter, 'nb')).toEqual({
      shown: [wok],
      hiddenByAllergens: 1,
    });
    expect(filterRecipes([eggy, wok], { ...filter, showAllergens: true }, 'nb').shown).toEqual([
      eggy,
      wok,
    ]);
  });

  it('is never the dinner suggestion', () => {
    expect(dinnerSuggestion([eggy, wok])).toBe(wok);
  });
});

describe('spec 16 own recipes and avoided ingredients', () => {
  const own = recipeSummary('Bestemors kjøttkaker', { source: 'household', score: score(40) });
  const kiwi = recipeSummary('Fruktsalat', { ingredientWarnings: ['Kiwi'], score: score(95) });
  const shared = recipeSummary('Kiwikake', {
    householdIngredientWarnings: ['Kiwi'],
    score: score(92),
  });
  const filter = { q: '', tag: '', showAllergens: false, ownOnly: false };

  it('FR-REC-007: ?egne=1 shows only the household’s own recipes, and goes back and forth through the URL', () => {
    expect(filterRecipes([wok, own], { ...filter, ownOnly: true }, 'nb').shown).toEqual([own]);
    const params = recipeFilterToParams({ ...filter, ownOnly: true });
    expect(params.toString()).toBe('egne=1');
    expect(parseRecipeFilter(params).ownOnly).toBe(true);
  });

  it('FR-ALG-002: own and shared avoided ingredients are hidden like allergens, and never the dinner suggestion', () => {
    expect(filterRecipes([kiwi, shared, wok], filter, 'nb')).toEqual({
      shown: [wok],
      hiddenByAllergens: 2,
    });
    expect(dinnerSuggestion([kiwi, shared, wok])).toBe(wok);
  });
});
