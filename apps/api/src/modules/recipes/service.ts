import {
  ALLERGENS,
  allergenConflicts,
  buildAliasIndex,
  compareRanked,
  evaluateLine,
  osloDate,
  scoreRecipe,
  stockByIngredient,
  type Allergen,
  type IngredientResponse,
  type ItemResponse,
  type LineResult,
  type RecipeDetail,
  type RecipeLineInput,
  type RecipeListResponse,
  type RecipeSummary,
  type Stock,
  type StockIngredient,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import type { CatalogIngredient, RecipeRecord, RecipeRepo } from './repo';

export interface RecipeServiceDeps {
  repo: RecipeRepo;
  /** The household's inventory (the same list the inventory page shows). */
  inventory: { listItems(householdId: string): Promise<ItemResponse[]> };
  /** Spec 10 (FR-HH-006): allergens other members share with the household, minus the caller's own. */
  households: HouseholdAllergens;
  now: Clock;
}

export interface HouseholdAllergens {
  sharedAllergens(
    householdId: string,
    userId: string,
    own: readonly Allergen[],
  ): Promise<Allergen[]>;
}

interface Evaluated {
  recipe: RecipeRecord;
  inputs: RecipeLineInput[];
  results: LineResult[];
  summary: RecipeSummary;
}

/**
 * FR-REC-001–004. Recipes are global; the ranking uses the inventory of the household in the URL, the
 * allergies of the logged-in user and those other members share with the household (spec 10, FR-HH-006). The pure rules live in @smartmat/shared (matching.ts, scoring.ts).
 */
export class RecipeService {
  constructor(private readonly deps: RecipeServiceDeps) {}

  async ingredients(): Promise<IngredientResponse[]> {
    const catalog = await this.deps.repo.catalog();
    return catalog.map(({ id, key, name, baseUnit, isStaple, categoryKey, aliases }) => ({
      id,
      key,
      name,
      baseUnit,
      isStaple,
      categoryKey,
      aliases,
    }));
  }

  /** FR-REC-002; with `usableOn` (FR-PLAN-005) ranked for a planned day instead of today. */
  async list(householdId: string, userId: string, usableOn?: string): Promise<RecipeListResponse> {
    const [recipes, context] = await Promise.all([
      this.deps.repo.recipes(),
      this.context(householdId, userId, usableOn),
    ]);
    return {
      recipes: recipes.map((recipe) => this.evaluate(recipe, context).summary).sort(compareRanked),
      userAllergens: context.userAllergens,
      householdAllergens: context.householdAllergens,
    };
  }

  async get(householdId: string, userId: string, recipeId: string): Promise<RecipeDetail> {
    const [recipe, context] = await Promise.all([
      this.deps.repo.recipe(recipeId),
      this.context(householdId, userId),
    ]);
    if (!recipe) throw notFound();
    const { inputs, results, summary } = this.evaluate(recipe, context);
    return {
      ...summary,
      steps: recipe.steps,
      license: recipe.license,
      authors: recipe.authors,
      userAllergens: context.userAllergens,
      householdAllergens: context.householdAllergens,
      lines: recipe.lines.map((line, i) => {
        const ingredient = context.catalog.get(line.ingredientId);
        const result = results[i];
        const input = inputs[i];
        if (!ingredient || !result || !input) throw new Error('recipe line without ingredient');
        return {
          position: line.position,
          ingredientId: line.ingredientId,
          ingredientName: ingredient.name,
          displayText: line.displayText,
          quantityBase: line.quantityBase,
          baseUnit: ingredient.baseUnit,
          optional: line.optional,
          allergens: ALLERGENS.filter((a) => ingredient.allergens.includes(a)),
          ...result,
        };
      }),
    };
  }

  async allergens(userId: string): Promise<{ allergens: Allergen[] }> {
    const list = await this.deps.repo.userAllergens(userId);
    return { allergens: ALLERGENS.filter((a) => list.includes(a)) };
  }

  async setAllergens(userId: string, allergens: readonly Allergen[]) {
    await this.deps.repo.setUserAllergens(userId, allergens);
    return this.allergens(userId);
  }

  private async context(householdId: string, userId: string, usableOn?: string) {
    const [catalogRows, items, userAllergens] = await Promise.all([
      this.deps.repo.catalog(),
      this.deps.inventory.listItems(householdId),
      this.allergens(userId),
    ]);
    const catalog = new Map<string, CatalogIngredient>(catalogRows.map((i) => [i.id, i]));
    const today = osloDate(this.deps.now());
    const stock = stockByIngredient(
      items,
      buildAliasIndex(catalogRows),
      catalog as ReadonlyMap<string, StockIngredient>,
      today,
      // A day in the past is ranked as today: use-by passed already never counts.
      usableOn !== undefined && usableOn > today ? usableOn : today,
    );
    const householdAllergens = await this.deps.households.sharedAllergens(
      householdId,
      userId,
      userAllergens.allergens,
    );
    return { catalog, stock, userAllergens: userAllergens.allergens, householdAllergens };
  }

  private evaluate(
    recipe: RecipeRecord,
    context: {
      catalog: Map<string, CatalogIngredient>;
      stock: Map<string, Stock>;
      userAllergens: Allergen[];
      householdAllergens: Allergen[];
    },
  ): Evaluated {
    const ingredientsOf = recipe.lines.map((line) => {
      const ingredient = context.catalog.get(line.ingredientId);
      if (!ingredient) throw new Error('recipe line without ingredient');
      return ingredient;
    });
    const inputs: RecipeLineInput[] = recipe.lines.map((line, i) => ({
      ingredientId: line.ingredientId,
      ingredientName: ingredientsOf[i]?.name ?? '',
      isStaple: ingredientsOf[i]?.isStaple ?? false,
      quantityBase: line.quantityBase,
      optional: line.optional,
    }));
    const results = inputs.map((input) =>
      evaluateLine(input, context.stock.get(input.ingredientId)),
    );
    // FR-REC-004: every ingredient counts, also optional ones and staples.
    const registered = ingredientsOf.flatMap((i) => i.allergens);

    return {
      recipe,
      inputs,
      results,
      summary: {
        id: recipe.id,
        slug: recipe.slug,
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: recipe.cookMinutes,
        tags: recipe.tags,
        source: recipe.source,
        origin: recipe.origin,
        ingredientNames: ingredientsOf.map((i) => i.name),
        allergens: ALLERGENS.filter((a) => registered.includes(a)),
        allergenWarnings: allergenConflicts(registered, context.userAllergens),
        householdAllergenWarnings: allergenConflicts(registered, context.householdAllergens),
        score: scoreRecipe(inputs, results),
      },
    };
  }
}
