import type { Allergen, BaseUnit, Conversion, RecipeSource } from '@smartmat/shared';
import type { Db } from '../../db';
import type { Prisma } from '../../generated/prisma/client';

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

function toRecipe({ ingredients, ...row }: RecipeRow): RecipeRecord {
  return { ...row, lines: ingredients };
}

export function createRecipeRepo(db: Db): RecipeRepo {
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
          aliases: { select: { alias: true }, orderBy: { alias: 'asc' } },
          allergens: { select: { allergen: true } },
          conversions: { select: { unit: true, unitQty: true, baseQty: true } },
        },
      });
      return rows.map((row) => ({
        ...row,
        aliases: row.aliases.map((a) => a.alias),
        allergens: row.allergens.map((a) => a.allergen),
      }));
    },

    async recipes() {
      const rows = await db.recipe.findMany({ select: recipeSelect });
      return rows.map(toRecipe);
    },

    async recipe(recipeId) {
      const row = await db.recipe.findUnique({ where: { id: recipeId }, select: recipeSelect });
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
