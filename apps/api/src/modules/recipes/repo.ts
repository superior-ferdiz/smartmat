import type {
  Allergen,
  BaseUnit,
  CategoryKey,
  Conversion,
  RecipeOrigin,
  RecipeSource,
} from '@smartmat/shared';
import type { Db } from '../../db';
import type { Prisma } from '../../generated/prisma/client';
import { fromDbDate } from '../../lib/dbDates';

/*
 * Database access for recipes (spec 05). Recipes and ingredients are global and read-only here: they are
 * written only by the seed script. The only per-user data is the allergy list, always looked up by the
 * user id from the session.
 */

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

export interface RecipeLineRecord {
  position: number;
  ingredientId: string;
  quantityBase: number | null;
  displayText: string;
  optional: boolean;
}

export interface RecipeRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  steps: string[];
  tags: string[];
  source: RecipeSource;
  license: string;
  authors: string[];
  /** ADR-0016: null unless the recipe is external. */
  origin: RecipeOrigin | null;
  lines: RecipeLineRecord[];
}

export interface RecipeRepo {
  catalog(): Promise<CatalogIngredient[]>;
  recipes(): Promise<RecipeRecord[]>;
  recipe(recipeId: string): Promise<RecipeRecord | null>;
  ingredientExists(ingredientId: string): Promise<boolean>;
  userAllergens(userId: string): Promise<Allergen[]>;
  setUserAllergens(userId: string, allergens: readonly Allergen[]): Promise<void>;
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
  const { ingredients, sourceTitle, sourceUrl, retrievedOn, adaptation, ...rest } = row;
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
    lines: ingredients,
  };
}

export interface RecipeRepoOptions {
  /** ADR-0016 (spec 09): false hides external recipes that nobody in the team has checked. */
  includeUnreviewed: boolean;
}

export function createRecipeRepo(
  db: Db,
  options: RecipeRepoOptions = { includeUnreviewed: true },
): RecipeRepo {
  const visible: Prisma.RecipeWhereInput = options.includeUnreviewed
    ? {}
    : { NOT: { source: 'external', reviewedBy: { isEmpty: true } } };
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

    async recipes() {
      const rows = await db.recipe.findMany({ where: visible, select: recipeSelect });
      return rows.map(toRecipe);
    },

    async recipe(recipeId) {
      const row = await db.recipe.findFirst({
        where: { id: recipeId, ...visible },
        select: recipeSelect,
      });
      return row ? toRecipe(row) : null;
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
  };
}
