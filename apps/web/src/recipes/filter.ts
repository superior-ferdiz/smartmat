import type { RecipeSummary } from '@smartmat/shared';

/*
 * FR-REC-001/004: search, tag filter and the allergen switch for the recipe list, in the browser and in
 * the URL (?q=&tagg=&allergener=vis), like the inventory. The list comes ranked from the API; filtering
 * never changes the order.
 */

export interface RecipeFilter {
  q: string;
  tag: string;
  /** false (default) = recipes with the user's allergens, or the household's shared ones, are hidden. */
  showAllergens: boolean;
}

export function parseRecipeFilter(params: URLSearchParams): RecipeFilter {
  return {
    q: params.get('q') ?? '',
    tag: params.get('tagg') ?? '',
    showAllergens: params.get('allergener') === 'vis',
  };
}

/** Only non-default values go in the URL. */
export function recipeFilterToParams(filter: RecipeFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.tag) params.set('tagg', filter.tag);
  if (filter.showAllergens) params.set('allergener', 'vis');
  return params;
}

/** FR-REC-004 and spec 10 (FR-HH-006): one of the user's allergens, or one another member shares. */
export function hasRegisteredAllergens(
  recipe: Pick<RecipeSummary, 'allergenWarnings'> &
    Pick<RecipeSummary, 'householdAllergenWarnings'>,
): boolean {
  return recipe.allergenWarnings.length > 0 || recipe.householdAllergenWarnings.length > 0;
}

const normalize = (text: string, locale: string) => text.toLocaleLowerCase(locale).trim();

/** All tags in use, sorted in Norwegian order. */
export function allTags(recipes: readonly RecipeSummary[]): string[] {
  return [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'nb'));
}

export interface FilteredRecipes {
  shown: RecipeSummary[];
  /** Hidden only because of the user's allergens (the switch would show them). */
  hiddenByAllergens: number;
}

export function filterRecipes(
  recipes: readonly RecipeSummary[],
  filter: RecipeFilter,
  locale: string,
): FilteredRecipes {
  const q = normalize(filter.q, locale);
  const matching = recipes.filter(
    (r) =>
      (!filter.tag || r.tags.includes(filter.tag)) &&
      (!q ||
        normalize(r.title, locale).includes(q) ||
        r.ingredientNames.some((name) => normalize(name, locale).includes(q))),
  );
  if (filter.showAllergens) return { shown: matching, hiddenByAllergens: 0 };
  const shown = matching.filter((r) => !hasRegisteredAllergens(r));
  return { shown, hiddenByAllergens: matching.length - shown.length };
}

/** FR-DASH-001: the best-ranked recipe the user can see (not hidden by allergens), if it scores at all. */
export function dinnerSuggestion(recipes: readonly RecipeSummary[]): RecipeSummary | null {
  const best = recipes.find((r) => !hasRegisteredAllergens(r));
  return best && best.score.total > 0 ? best : null;
}
