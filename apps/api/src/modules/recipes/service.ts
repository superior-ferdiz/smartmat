import {
  ALLERGENS,
  API_ERRORS,
  HOUSEHOLD_RECIPES_MAX,
  buildAliasIndex,
  compareRanked,
  defaultLineText,
  dietWarnings,
  evaluateLine,
  lineQuantityBase,
  osloDate,
  scoreRecipe,
  stockByIngredient,
  unitsFor,
  type Allergen,
  type AvoidedIngredientsResponse,
  type CreateHouseholdRecipeBody,
  type HouseholdRecipeEdit,
  type HouseholdRecipeSaved,
  type IngredientResponse,
  type ItemResponse,
  type LineResult,
  type RecipeDetail,
  type RecipeLineInput,
  type RecipeListResponse,
  type RecipeSummary,
  type Stock,
  type StockIngredient,
  type UpdateHouseholdRecipeBody,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError, notFound } from '../../lib/errors';
import { loadDiet, type Diet, type SharedDiet } from './diet';
import type {
  CatalogIngredient,
  HouseholdRecipeData,
  HouseholdRecipeLineData,
  RecipeRecord,
  RecipeRepo,
} from './repo';

export interface RecipeServiceDeps {
  repo: RecipeRepo;
  /** The household's inventory (the same list the inventory page shows). */
  inventory: { listItems(householdId: string): Promise<ItemResponse[]> };
  /** Spec 10 (FR-HH-006) and spec 16 (FR-ALG-002): what other members share with the household. */
  households: SharedDiet;
  now: Clock;
}

interface Evaluated {
  recipe: RecipeRecord;
  inputs: RecipeLineInput[];
  results: LineResult[];
  summary: RecipeSummary;
}

interface Context {
  catalog: Map<string, CatalogIngredient>;
  stock: Map<string, Stock>;
  diet: Diet;
}

const fieldError = (fields: Record<string, string>) =>
  new AppError(400, API_ERRORS.validation, fields);

/**
 * FR-REC-001–004, spec 16 (FR-REC-007–009, FR-ALG-002/003). The recipes are the global ones and the household's
 * own (ADR-0023) – the repo never returns another household's. The ranking uses the inventory of the household in
 * the URL, the logged-in user's allergies and avoided ingredients, and what other members share with the household.
 * The pure rules live in @smartmat/shared (matching.ts, scoring.ts, household.ts).
 */
export class RecipeService {
  constructor(private readonly deps: RecipeServiceDeps) {}

  async ingredients(): Promise<IngredientResponse[]> {
    const catalog = await this.deps.repo.catalog();
    return catalog.map(
      ({ id, key, name, baseUnit, isStaple, categoryKey, aliases, conversions }) => ({
        id,
        key,
        name,
        baseUnit,
        isStaple,
        categoryKey,
        aliases,
        units: unitsFor({ baseUnit, conversions }),
      }),
    );
  }

  /** FR-REC-002; with `usableOn` (FR-PLAN-005) ranked for a planned day instead of today. */
  async list(householdId: string, userId: string, usableOn?: string): Promise<RecipeListResponse> {
    const [recipes, context] = await Promise.all([
      this.deps.repo.recipes(householdId),
      this.context(householdId, userId, usableOn),
    ]);
    return {
      recipes: recipes.map((recipe) => this.evaluate(recipe, context).summary).sort(compareRanked),
      ...dietLists(context.diet),
    };
  }

  async get(householdId: string, userId: string, recipeId: string): Promise<RecipeDetail> {
    const [recipe, context] = await Promise.all([
      this.deps.repo.recipe(householdId, recipeId),
      this.context(householdId, userId),
    ]);
    if (!recipe) throw notFound();
    const { inputs, results, summary } = this.evaluate(recipe, context);
    return {
      ...summary,
      steps: recipe.steps,
      license: recipe.license,
      authors: recipe.authors,
      ...dietLists(context.diet),
      freeTextLines: recipe.freeTextLines,
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

  /** Spec 16: the form data of the household's own recipe. Global recipes cannot be edited (404). */
  async edit(householdId: string, recipeId: string): Promise<HouseholdRecipeEdit> {
    const recipe = await this.deps.repo.householdRecipeForEdit(householdId, recipeId);
    if (!recipe) throw notFound();
    return recipe;
  }

  /** FR-REC-007. `created` is false when the same form was sent before (`clientRequestId`). */
  async create(
    householdId: string,
    userId: string,
    body: CreateHouseholdRecipeBody,
  ): Promise<{ created: boolean; saved: HouseholdRecipeSaved }> {
    const data = await this.resolve(body);
    const dedupeKey = body.clientRequestId ?? null;
    // A repeat of a saved form answers 200 also when the household has reached the limit. The limit is a soft
    // one: two forms sent at the same moment by two members can both get in.
    const repeat = dedupeKey && (await this.deps.repo.savedByDedupeKey(householdId, dedupeKey));
    if (repeat) return { created: false, saved: repeat };
    if ((await this.deps.repo.countHouseholdRecipes(householdId)) >= HOUSEHOLD_RECIPES_MAX)
      throw new AppError(409, API_ERRORS.recipeTooMany);
    const result = await this.deps.repo.createHouseholdRecipe(householdId, userId, data, dedupeKey);
    return { created: result.created, saved: savedOf(result) };
  }

  async update(
    householdId: string,
    recipeId: string,
    body: UpdateHouseholdRecipeBody,
  ): Promise<HouseholdRecipeSaved> {
    const data = await this.resolve(body);
    const result = await this.deps.repo.updateHouseholdRecipe(
      householdId,
      recipeId,
      body.version,
      data,
    );
    if (result === 'notFound') throw notFound();
    if (result === 'stale') throw new AppError(409, API_ERRORS.recipeChangedMeanwhile);
    return result;
  }

  async remove(householdId: string, recipeId: string): Promise<void> {
    if (!(await this.deps.repo.deleteHouseholdRecipe(householdId, recipeId))) throw notFound();
  }

  async allergens(userId: string): Promise<{ allergens: Allergen[] }> {
    const list = await this.deps.repo.userAllergens(userId);
    return { allergens: ALLERGENS.filter((a) => list.includes(a)) };
  }

  async setAllergens(userId: string, allergens: readonly Allergen[]) {
    await this.deps.repo.setUserAllergens(userId, allergens);
    return this.allergens(userId);
  }

  /** FR-ALG-001 */
  async avoided(userId: string): Promise<AvoidedIngredientsResponse> {
    return { ingredients: await this.deps.repo.avoidedIngredients(userId) };
  }

  async setAvoided(userId: string, ingredientIds: readonly string[]) {
    const known = new Set((await this.deps.repo.catalog()).map((i) => i.id));
    const unknown = ingredientIds.findIndex((id) => !known.has(id));
    if (unknown >= 0)
      throw fieldError({ [`ingredientIds.${unknown}`]: 'validation.avoided.unknown' });
    await this.deps.repo.setAvoidedIngredients(userId, ingredientIds);
    return this.avoided(userId);
  }

  /** FR-REC-008: checks every line against the ingredient list and converts amounts to base units. */
  private async resolve(
    body: CreateHouseholdRecipeBody | UpdateHouseholdRecipeBody,
  ): Promise<HouseholdRecipeData> {
    const catalog = new Map((await this.deps.repo.catalog()).map((i) => [i.id, i]));
    const fields: Record<string, string> = {};
    const lines = body.lines.map((line, i): HouseholdRecipeLineData => {
      if (line.kind === 'freeText') return { ingredientId: null, displayText: line.text };
      const ingredient = catalog.get(line.ingredientId);
      if (!ingredient) {
        fields[`lines.${i}.ingredientId`] = 'validation.recipe.ingredient';
        return { ingredientId: null, displayText: line.text || '-' };
      }
      let quantityBase: number | null = null;
      if (line.amount !== null && line.unit !== null) {
        const value = lineQuantityBase(line.amount, line.unit, ingredient);
        if (typeof value === 'number') quantityBase = value;
        else
          fields[value === 'validation.recipe.unit' ? `lines.${i}.unit` : `lines.${i}.amount`] =
            value;
      }
      return {
        ingredientId: ingredient.id,
        quantityBase,
        displayText: line.text || defaultLineText(ingredient.name, line.amount, line.unit),
        optional: line.optional,
        inputAmount: line.amount,
        inputUnit: line.unit,
      };
    });
    if (Object.keys(fields).length > 0) throw fieldError(fields);
    return {
      title: body.title,
      description: body.description,
      servings: body.servings,
      prepMinutes: body.prepMinutes,
      cookMinutes: body.cookMinutes,
      tags: body.tags,
      steps: body.steps,
      lines,
    };
  }

  private async context(householdId: string, userId: string, usableOn?: string): Promise<Context> {
    const [catalogRows, items, diet] = await Promise.all([
      this.deps.repo.catalog(),
      this.deps.inventory.listItems(householdId),
      loadDiet(this.deps.repo, this.deps.households, householdId, userId),
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
    return { catalog, stock, diet };
  }

  private evaluate(recipe: RecipeRecord, context: Context): Evaluated {
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
    // FR-REC-004 / FR-ALG-002: every ingredient counts, also optional ones and staples. Free text never does.
    const registered = new Set(ingredientsOf.flatMap((i) => i.allergens));

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
        createdBy: recipe.createdBy,
        ingredientNames: ingredientsOf.map((i) => i.name),
        allergens: ALLERGENS.filter((a) => registered.has(a)),
        ...dietWarnings(ingredientsOf, context.diet.own, context.diet.household),
        freeTextCount: recipe.freeTextLines.length,
        score: scoreRecipe(inputs, results),
      },
    };
  }
}

function savedOf(row: { id: string; version: number }): HouseholdRecipeSaved {
  return { id: row.id, version: row.version };
}

function dietLists(diet: Diet) {
  return {
    userAllergens: diet.own.allergens,
    householdAllergens: diet.household.allergens,
    avoidedIngredients: diet.own.avoided.map((i) => i.name),
    householdAvoidedIngredients: diet.household.avoided.map((i) => i.name),
  };
}
