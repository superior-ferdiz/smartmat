import type {
  AnyRecipeSource,
  Allergen,
  BaseUnit,
  CategoryKey,
  Conversion,
  CreatorRef,
  HouseholdRecipeEdit,
  RecipeOrigin,
  SeedUnit,
} from '@smartmat/shared';
import type { Db } from '../../db';
import type { Prisma } from '../../generated/prisma/client';
import { creatorSelect, toCreator } from '../../lib/creator';
import { fromDbDate } from '../../lib/dbDates';
import { isPrismaError } from '../purchases/repo';

/*
 * Database access for recipes (spec 05, spec 16). **Every recipe query in the API goes through this file**
 * (ADR-0023, FR-REC-009; `recipeQueries.test.ts` checks it). Global recipes are written only by the seed
 * script; a household's own recipes are written here, and every read takes the household from the URL:
 * a recipe is visible when it is global or belongs to that household – never another household's.
 * The per-user data (allergies, avoided ingredients) is always looked up by the user id from the session.
 */

/** ADR-0023: the seed script reads and writes only these. A household's own recipe is never touched by it. */
export const GLOBAL_RECIPES = { householdId: null } satisfies Prisma.RecipeWhereInput;

/** Global recipes and the household's own: the only way a recipe is ever read. */
function visibleTo(householdId: string): Prisma.RecipeWhereInput {
  return { OR: [GLOBAL_RECIPES, { householdId }] };
}

export interface CatalogIngredient {
  id: string;
  key: string;
  name: string;
  baseUnit: BaseUnit;
  isStaple: boolean;
  categoryKey: CategoryKey | null;
  aliases: string[];
  allergens: Allergen[];
  conversions: Conversion[];
}

/** A line with an ingredient. Free-text lines (spec 16) are kept apart, so nothing can count them by mistake. */
export interface RecipeLineRecord {
  position: number;
  ingredientId: string;
  quantityBase: number | null;
  displayText: string;
  optional: boolean;
}

export interface RecipeRecord {
  id: string;
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  steps: string[];
  tags: string[];
  source: AnyRecipeSource;
  /** Null for a household's own recipe. */
  slug: string | null;
  license: string | null;
  authors: string[];
  /** ADR-0016: null unless the recipe is external. */
  origin: RecipeOrigin | null;
  /** ADR-0023: set for a household's own recipe. */
  householdId: string | null;
  /** Spec 16: who added a household's own recipe (FR-HH-007); null for global recipes. */
  createdBy: CreatorRef | null;
  version: number;
  lines: RecipeLineRecord[];
  /** FR-REC-008: never counted anywhere – only shown. */
  freeTextLines: { position: number; displayText: string }[];
}

/** One line as the service has checked and converted it (spec 16, FR-REC-008). */
export type HouseholdRecipeLineData =
  | {
      ingredientId: string;
      quantityBase: number | null;
      displayText: string;
      optional: boolean;
      inputAmount: string | null;
      inputUnit: SeedUnit | null;
    }
  | { ingredientId: null; displayText: string };

export interface HouseholdRecipeData {
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  tags: string[];
  steps: string[];
  lines: HouseholdRecipeLineData[];
}

export type UpdateResult = { id: string; version: number } | 'notFound' | 'stale';

export interface RecipeRepo {
  catalog(): Promise<CatalogIngredient[]>;
  /** Global recipes and the household's own (ADR-0023). */
  recipes(householdId: string): Promise<RecipeRecord[]>;
  /** Null when the recipe does not exist, is hidden, or belongs to another household. */
  recipe(householdId: string, recipeId: string): Promise<RecipeRecord | null>;
  /** The household's own recipe as the form needs it; null for global recipes and other households'. */
  householdRecipeForEdit(
    householdId: string,
    recipeId: string,
  ): Promise<HouseholdRecipeEdit | null>;
  countHouseholdRecipes(householdId: string): Promise<number>;
  savedByDedupeKey(
    householdId: string,
    dedupeKey: string,
  ): Promise<{ id: string; version: number } | null>;
  /** Idempotent on `dedupeKey`: a repeat gives the saved recipe with `created: false`. */
  createHouseholdRecipe(
    householdId: string,
    actorId: string,
    data: HouseholdRecipeData,
    dedupeKey: string | null,
  ): Promise<{ id: string; version: number; created: boolean }>;
  updateHouseholdRecipe(
    householdId: string,
    recipeId: string,
    version: number,
    data: HouseholdRecipeData,
  ): Promise<UpdateResult>;
  deleteHouseholdRecipe(householdId: string, recipeId: string): Promise<boolean>;
  ingredientExists(ingredientId: string): Promise<boolean>;
  userAllergens(userId: string): Promise<Allergen[]>;
  setUserAllergens(userId: string, allergens: readonly Allergen[]): Promise<void>;
  /** FR-ALG-001: in the order of the ingredient list (by name). */
  avoidedIngredients(userId: string): Promise<{ id: string; name: string }[]>;
  setAvoidedIngredients(userId: string, ingredientIds: readonly string[]): Promise<void>;
}

const recipeSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  servings: true,
  prepMinutes: true,
  cookMinutes: true,
  steps: true,
  tags: true,
  source: true,
  license: true,
  authors: true,
  sourceTitle: true,
  sourceUrl: true,
  retrievedOn: true,
  adaptation: true,
  adaptationNote: true,
  aiAssisted: true,
  reviewedBy: true,
  reviewedOn: true,
  householdId: true,
  version: true,
  createdBy: creatorSelect,
  ingredients: {
    orderBy: { position: 'asc' },
    select: {
      position: true,
      ingredientId: true,
      quantityBase: true,
      displayText: true,
      optional: true,
    },
  },
} satisfies Prisma.RecipeSelect;

type RecipeRow = Prisma.RecipeGetPayload<{ select: typeof recipeSelect }>;

function toRecipe(row: RecipeRow): RecipeRecord {
  const { ingredients, sourceTitle, sourceUrl, retrievedOn, adaptation, createdBy, ...rest } = row;
  const origin =
    row.source === 'external' && sourceTitle && sourceUrl && retrievedOn && adaptation
      ? {
          title: sourceTitle,
          url: sourceUrl,
          // The seed check only lets ADR-0016 licences in for external recipes.
          license: row.license as RecipeOrigin['license'],
          retrievedOn: fromDbDate(retrievedOn),
          adaptation,
          adaptationNote: row.adaptationNote,
          aiAssisted: row.aiAssisted,
          reviewedBy: row.reviewedBy,
          reviewedOn: row.reviewedOn ? fromDbDate(row.reviewedOn) : null,
        }
      : null;
  return {
    id: rest.id,
    slug: rest.slug,
    title: rest.title,
    description: rest.description,
    servings: rest.servings,
    prepMinutes: rest.prepMinutes,
    cookMinutes: rest.cookMinutes,
    steps: rest.steps,
    tags: rest.tags,
    source: rest.source,
    license: rest.license,
    authors: rest.authors,
    origin,
    householdId: rest.householdId,
    createdBy: rest.householdId ? toCreator(rest.householdId, createdBy) : null,
    version: rest.version,
    lines: ingredients.flatMap((line) =>
      line.ingredientId === null ? [] : [{ ...line, ingredientId: line.ingredientId }],
    ),
    freeTextLines: ingredients
      .filter((line) => line.ingredientId === null)
      .map(({ position, displayText }) => ({ position, displayText })),
  };
}

function recipeColumns(data: HouseholdRecipeData) {
  return {
    title: data.title,
    description: data.description,
    servings: data.servings,
    prepMinutes: data.prepMinutes,
    cookMinutes: data.cookMinutes,
    tags: data.tags,
    steps: data.steps,
  };
}

/** The lines as rows. `household_id` is left out on purpose: the trigger copies it from the recipe. */
function lineRows(data: HouseholdRecipeData) {
  return data.lines.map((line, position) =>
    line.ingredientId === null
      ? { position, ingredientId: null, quantityBase: null, displayText: line.displayText }
      : {
          position,
          ingredientId: line.ingredientId,
          quantityBase: line.quantityBase,
          displayText: line.displayText,
          optional: line.optional,
          inputAmount: line.inputAmount,
          inputUnit: line.inputUnit,
        },
  );
}

export interface RecipeRepoOptions {
  /** ADR-0016 (spec 09): false hides external recipes that nobody in the team has checked. */
  includeUnreviewed: boolean;
}

export function createRecipeRepo(
  db: Db,
  options: RecipeRepoOptions = { includeUnreviewed: true },
): RecipeRepo {
  const reviewed: Prisma.RecipeWhereInput = options.includeUnreviewed
    ? {}
    : { NOT: { source: 'external', reviewedBy: { isEmpty: true } } };
  const visible = (householdId: string): Prisma.RecipeWhereInput => ({
    AND: [visibleTo(householdId), reviewed],
  });
  const own = (householdId: string, recipeId: string) =>
    ({ id: recipeId, householdId }) satisfies Prisma.RecipeWhereInput;
  const savedByDedupeKey = (householdId: string, dedupeKey: string) =>
    db.recipe.findUnique({
      where: { householdId_dedupeKey: { householdId, dedupeKey } },
      select: { id: true, version: true },
    });
  return {
    async catalog() {
      const rows = await db.ingredient.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          key: true,
          name: true,
          baseUnit: true,
          isStaple: true,
          categoryKey: true,
          aliases: { select: { alias: true }, orderBy: { alias: 'asc' } },
          allergens: { select: { allergen: true } },
          conversions: { select: { unit: true, unitQty: true, baseQty: true } },
        },
      });
      return rows.map((row) => ({
        ...row,
        categoryKey: row.categoryKey as CategoryKey | null,
        aliases: row.aliases.map((a) => a.alias),
        allergens: row.allergens.map((a) => a.allergen),
      }));
    },

    async recipes(householdId) {
      const rows = await db.recipe.findMany({ where: visible(householdId), select: recipeSelect });
      return rows.map(toRecipe);
    },

    async recipe(householdId, recipeId) {
      const row = await db.recipe.findFirst({
        where: { AND: [{ id: recipeId }, visible(householdId)] },
        select: recipeSelect,
      });
      return row ? toRecipe(row) : null;
    },

    async householdRecipeForEdit(householdId, recipeId) {
      const row = await db.recipe.findFirst({
        where: own(householdId, recipeId),
        select: {
          id: true,
          version: true,
          title: true,
          description: true,
          servings: true,
          prepMinutes: true,
          cookMinutes: true,
          tags: true,
          steps: true,
          ingredients: {
            orderBy: { position: 'asc' },
            select: {
              ingredientId: true,
              displayText: true,
              optional: true,
              inputAmount: true,
              inputUnit: true,
            },
          },
        },
      });
      if (!row) return null;
      const { ingredients, ...rest } = row;
      return {
        ...rest,
        lines: ingredients.map((line) =>
          line.ingredientId === null
            ? { kind: 'freeText' as const, text: line.displayText }
            : {
                kind: 'ingredient' as const,
                ingredientId: line.ingredientId,
                amount: line.inputAmount,
                // Written only by this file, from the shared unit list.
                unit: line.inputUnit as SeedUnit | null,
                text: line.displayText,
                optional: line.optional,
              },
        ),
      };
    },

    async countHouseholdRecipes(householdId) {
      return db.recipe.count({ where: { householdId } });
    },

    savedByDedupeKey,

    async createHouseholdRecipe(householdId, actorId, data, dedupeKey) {
      const existing = async () => {
        const row = dedupeKey ? await savedByDedupeKey(householdId, dedupeKey) : null;
        return row && { ...row, created: false };
      };
      const repeat = await existing();
      if (repeat) return repeat;
      try {
        const row = await db.recipe.create({
          data: {
            ...recipeColumns(data),
            source: 'household',
            authors: [],
            householdId,
            createdById: actorId,
            dedupeKey,
            ingredients: { createMany: { data: lineRows(data) } },
          },
          select: { id: true, version: true },
        });
        return { ...row, created: true };
      } catch (error) {
        // The same form sent twice at once: the other request saved it.
        const raced = isPrismaError(error, 'P2002') ? await existing() : null;
        if (raced) return raced;
        throw error;
      }
    },

    async updateHouseholdRecipe(householdId, recipeId, version, data) {
      return db.$transaction(async (tx) => {
        const updated = await tx.recipe.updateMany({
          where: { ...own(householdId, recipeId), version },
          data: { ...recipeColumns(data), version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          const exists = await tx.recipe.count({ where: own(householdId, recipeId) });
          return exists === 1 ? 'stale' : 'notFound';
        }
        await tx.recipeIngredient.deleteMany({ where: { recipeId } });
        await tx.recipeIngredient.createMany({
          data: lineRows(data).map((line) => ({ ...line, recipeId })),
        });
        return { id: recipeId, version: version + 1 };
      });
    },

    async deleteHouseholdRecipe(householdId, recipeId) {
      const deleted = await db.recipe.deleteMany({ where: own(householdId, recipeId) });
      return deleted.count === 1;
    },

    async ingredientExists(ingredientId) {
      return (await db.ingredient.count({ where: { id: ingredientId } })) === 1;
    },

    async userAllergens(userId) {
      const rows = await db.userAllergen.findMany({
        where: { userId },
        select: { allergen: true },
      });
      return rows.map((r) => r.allergen);
    },

    async setUserAllergens(userId, allergens) {
      await db.$transaction([
        db.userAllergen.deleteMany({ where: { userId } }),
        db.userAllergen.createMany({ data: allergens.map((allergen) => ({ userId, allergen })) }),
      ]);
    },

    async avoidedIngredients(userId) {
      const rows = await db.userAvoidedIngredient.findMany({
        where: { userId },
        orderBy: { ingredient: { name: 'asc' } },
        select: { ingredient: { select: { id: true, name: true } } },
      });
      return rows.map((r) => r.ingredient);
    },

    async setAvoidedIngredients(userId, ingredientIds) {
      await db.$transaction([
        db.userAvoidedIngredient.deleteMany({ where: { userId } }),
        db.userAvoidedIngredient.createMany({
          data: ingredientIds.map((ingredientId) => ({ userId, ingredientId })),
        }),
      ]);
    },
  };
}
