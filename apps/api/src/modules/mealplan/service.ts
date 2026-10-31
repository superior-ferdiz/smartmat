import {
  ALLERGENS,
  API_ERRORS,
  allergenConflicts,
  buildAliasIndex,
  MEAL_PLAN_MAX_PER_DAY,
  osloDate,
  planNeeds,
  suggestFromPlan,
  unplannedExpiring,
  type AddPlanToShoppingBody,
  type AddPlanToShoppingResponse,
  type Allergen,
  type CreateMealEntryBody,
  type ItemResponse,
  type MealEntryResponse,
  type MealPlanNeedsResponse,
  type MealPlanRange,
  type MealPlanResponse,
  type PlanEntryInput,
  type PlanIngredient,
  type UpdateMealEntryBody,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError, notFound } from '../../lib/errors';
import type { CatalogIngredient, RecipeRecord, RecipeRepo } from '../recipes/repo';
import type { HouseholdAllergens } from '../recipes/service';
import type { ShoppingRepo } from '../shopping/repo';
import type { MealEntryRecord, MealPlanRepo } from './repo';

export interface MealPlanServiceDeps {
  repo: MealPlanRepo;
  recipes: Pick<RecipeRepo, 'catalog' | 'recipes' | 'recipe' | 'userAllergens'>;
  inventory: { listItems(householdId: string): Promise<ItemResponse[]> };
  shopping: Pick<ShoppingRepo, 'mealContributions' | 'addFromMealPlan'>;
  households: HouseholdAllergens;
  now: Clock;
}

/** "Går ut denne uka": at most this many lines (FR-PLAN-003). */
const UNPLANNED_EXPIRING_MAX = 10;

const fieldError = (fields: Record<string, string>) =>
  new AppError(400, API_ERRORS.validation, fields);
const dayFull = () => new AppError(409, API_ERRORS.mealPlanDayFull);

/** Business rules for the meal plan (FR-PLAN-001–005, spec 09). All methods are scoped to one household. */
export class MealPlanService {
  constructor(private readonly deps: MealPlanServiceDeps) {}

  async list(householdId: string, userId: string, range: MealPlanRange): Promise<MealPlanResponse> {
    const [entries, context] = await Promise.all([
      this.deps.repo.list(householdId, range.from, range.to),
      this.recipeContext(householdId, userId),
    ]);
    return { ...range, entries: entries.map((e) => this.toResponse(e, context)) };
  }

  async get(householdId: string, userId: string, entryId: string): Promise<MealEntryResponse> {
    const [entry, context] = await Promise.all([
      this.deps.repo.get(householdId, entryId),
      this.recipeContext(householdId, userId),
    ]);
    if (!entry) throw notFound();
    return this.toResponse(entry, context);
  }

  /** FR-PLAN-001. Returns the entry and whether it is new (false when the same form was sent before). */
  async create(
    householdId: string,
    actorId: string,
    body: CreateMealEntryBody,
  ): Promise<{ entry: MealEntryResponse; created: boolean }> {
    const { repo } = this.deps;
    const dedupeKey = body.clientRequestId ? `client:${body.clientRequestId}` : null;
    const existing = dedupeKey ? await repo.findByDedupeKey(householdId, dedupeKey) : null;
    if (existing) return { entry: await this.get(householdId, actorId, existing), created: false };

    if ((await repo.countOnDay(householdId, body.date)) >= MEAL_PLAN_MAX_PER_DAY) throw dayFull();
    let result;
    if (body.kind === 'recipe') {
      const recipe = await this.deps.recipes.recipe(body.recipeId);
      if (!recipe) throw fieldError({ recipeId: 'validation.mealPlan.recipeNotFound' });
      result = await repo.create(
        householdId,
        actorId,
        {
          date: body.date,
          meal: body.meal,
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          servings: body.servings,
        },
        dedupeKey,
      );
    } else {
      result = await repo.create(
        householdId,
        actorId,
        { date: body.date, meal: body.meal, note: body.note },
        dedupeKey,
      );
    }
    if (result.kind === 'duplicate') {
      // Lost the race against an identical request: answer with the one that was saved.
      const saved = dedupeKey ? await repo.findByDedupeKey(householdId, dedupeKey) : null;
      if (!saved) throw new AppError(409, API_ERRORS.changedMeanwhile);
      return { entry: await this.get(householdId, actorId, saved), created: false };
    }
    return { entry: await this.get(householdId, actorId, result.id), created: true };
  }

  /** Move, change servings (a recipe) or change the text (a note). */
  async update(
    householdId: string,
    userId: string,
    entryId: string,
    body: UpdateMealEntryBody,
  ): Promise<MealEntryResponse> {
    const { repo } = this.deps;
    const entry = await repo.get(householdId, entryId);
    if (!entry) throw notFound();
    const isNote = entry.note !== null;
    if (body.servings !== undefined && isNote)
      throw fieldError({ servings: 'validation.mealPlan.notARecipe' });
    if (body.note !== undefined && !isNote)
      throw fieldError({ note: 'validation.mealPlan.notANote' });
    if (
      body.date !== undefined &&
      body.date !== entry.date &&
      (await repo.countOnDay(householdId, body.date)) >= MEAL_PLAN_MAX_PER_DAY
    )
      throw dayFull();
    if (!(await repo.update(householdId, entryId, body))) throw notFound();
    return this.get(householdId, userId, entryId);
  }

  async remove(householdId: string, entryId: string) {
    if (!(await this.deps.repo.remove(householdId, entryId))) throw notFound();
  }

  /**
   * FR-PLAN-003/004/005: what the planned recipes need from today (days that are over do not count) to
   * `to`, what the inventory covers, what to suggest for the shopping list, and what goes off unplanned.
   */
  async needs(householdId: string, range: MealPlanRange): Promise<MealPlanNeedsResponse> {
    const computed = await this.computeNeeds(householdId, range);
    return {
      from: computed.from,
      to: computed.to,
      recipeEntryCount: computed.entryCount,
      ingredients: computed.needs,
      suggestions: suggestFromPlan(computed.needs),
      unplannedExpiring: computed.unplanned,
    };
  }

  /**
   * FR-PLAN-004: the chosen ingredients onto the shopping list. The needs are worked out again here; the
   * browser's numbers are only the amounts the user chose for the lines.
   */
  async addToShopping(
    householdId: string,
    actorId: string,
    body: AddPlanToShoppingBody,
  ): Promise<AddPlanToShoppingResponse> {
    const { needs } = await this.computeNeeds(householdId, body);
    const byIngredient = new Map(needs.map((n) => [n.ingredientId, n]));
    const fields: Record<string, string> = {};
    const lines = body.lines.flatMap((line, index) => {
      const need = byIngredient.get(line.ingredientId);
      if (!need) {
        fields[`lines.${index}.ingredientId`] = 'validation.mealPlan.notInPlan';
        return [];
      }
      return [
        {
          ingredientId: need.ingredientId,
          text: need.ingredientName,
          unit: need.baseUnit,
          quantityOverride: line.quantityBase,
          shortfalls: need.entries.map((e) => ({
            entryId: e.entryId,
            shortfallBase: e.shortfallBase,
            unmet: e.unmet,
          })),
        },
      ];
    });
    if (Object.keys(fields).length > 0) throw fieldError(fields);
    return this.deps.shopping.addFromMealPlan(householdId, actorId, lines);
  }

  private async computeNeeds(householdId: string, range: MealPlanRange) {
    const today = osloDate(this.deps.now());
    const from = range.from > today ? range.from : today;
    const to = range.to;
    const [entries, recipes, catalog, items] = await Promise.all([
      from <= to ? this.deps.repo.list(householdId, from, to) : Promise.resolve([]),
      this.deps.recipes.recipes(),
      this.deps.recipes.catalog(),
      this.deps.inventory.listItems(householdId),
    ]);
    const recipeById = new Map(recipes.map((r) => [r.id, r]));
    const planned: PlanEntryInput[] = entries.flatMap((entry) => {
      const recipe = entry.recipeId ? recipeById.get(entry.recipeId) : undefined;
      if (!recipe || entry.servings === null) return [];
      return [
        {
          id: entry.id,
          date: entry.date,
          meal: entry.meal,
          recipeTitle: recipe.title,
          servings: entry.servings,
          recipeServings: recipe.servings,
          lines: recipe.lines.map((l) => ({
            ingredientId: l.ingredientId,
            quantityBase: l.quantityBase,
            optional: l.optional,
          })),
        },
      ];
    });
    const ingredients = new Map<string, PlanIngredient>(
      catalog.map((i) => [
        i.id,
        {
          id: i.id,
          name: i.name,
          baseUnit: i.baseUnit,
          isStaple: i.isStaple,
          conversions: i.conversions,
        },
      ]),
    );
    const index = buildAliasIndex(catalog);
    const contributions = await this.deps.shopping.mealContributions(
      householdId,
      planned.map((p) => p.id),
    );
    const needs = planNeeds({ entries: planned, ingredients, items, index, today, contributions });
    const unplanned =
      from <= to
        ? unplannedExpiring({
            items,
            index,
            plannedIngredientIds: new Set(needs.map((n) => n.ingredientId)),
            today,
            to,
            limit: UNPLANNED_EXPIRING_MAX,
          })
        : [];
    return { from, to, entryCount: planned.length, needs, unplanned };
  }

  private async recipeContext(householdId: string, userId: string) {
    const [recipes, catalog, ownList] = await Promise.all([
      this.deps.recipes.recipes(),
      this.deps.recipes.catalog(),
      this.deps.recipes.userAllergens(userId),
    ]);
    const userAllergens = ALLERGENS.filter((a) => ownList.includes(a));
    return {
      recipes: new Map(recipes.map((r) => [r.id, r])),
      catalog: new Map<string, CatalogIngredient>(catalog.map((i) => [i.id, i])),
      userAllergens,
      // Spec 10 (FR-HH-006): what other current members share with this household.
      householdAllergens: await this.deps.households.sharedAllergens(
        householdId,
        userId,
        userAllergens,
      ),
    };
  }

  private toResponse(
    entry: MealEntryRecord,
    context: {
      recipes: Map<string, RecipeRecord>;
      catalog: Map<string, CatalogIngredient>;
      userAllergens: Allergen[];
      householdAllergens: Allergen[];
    },
  ): MealEntryResponse {
    const recipe = entry.recipeId ? context.recipes.get(entry.recipeId) : undefined;
    const registered = recipe
      ? recipe.lines.flatMap((l) => context.catalog.get(l.ingredientId)?.allergens ?? [])
      : [];
    return {
      id: entry.id,
      date: entry.date,
      meal: entry.meal,
      kind: entry.note !== null ? 'note' : 'recipe',
      // A recipe the app no longer shows (removed, or hidden as unreviewed) is like a removed one.
      recipeId: recipe ? recipe.id : null,
      recipeTitle: recipe?.title ?? entry.recipeTitle,
      recipeServings: recipe?.servings ?? null,
      servings: entry.servings,
      note: entry.note,
      allergenWarnings: allergenConflicts(registered, context.userAllergens),
      householdAllergenWarnings: allergenConflicts(registered, context.householdAllergens),
      createdAt: entry.createdAt.toISOString(),
      createdBy: entry.createdBy,
    };
  }
}
