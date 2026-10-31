import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkSeed, type ResolvedSeed } from '@smartmat/shared';
import type { Db } from '../../db';
import { toDbDate } from '../../lib/dbDates';
import { GLOBAL_RECIPES } from './repo';

/*
 * Seeding the global recipe tables (spec 05, ADR-0016) from a directory with ingredients.json and
 * recipes/*.json: prisma/seed/ for development (`npm run db:seed`), apps/api/test/fixtures/seed/ for the
 * test databases. Everything is checked first; the database is only touched when all files are valid.
 *
 * ADR-0023 (spec 16, FR-REC-010): a household's own recipes are never read, changed or removed here – every
 * recipe query below is limited to GLOBAL_RECIPES.
 */

export class SeedError extends Error {
  constructor(readonly errors: string[]) {
    super(`The seed files have ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
    this.name = 'SeedError';
  }
}

function readJson(path: string, name: string, errors: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    errors.push(`${name}: ikke gyldig JSON (${(error as Error).message})`);
    return undefined;
  }
}

/** Reads and checks a seed directory. Throws SeedError with every problem found. */
export function readSeedDirectory(dir: string): ResolvedSeed {
  const errors: string[] = [];
  const ingredients = readJson(join(dir, 'ingredients.json'), 'ingredients.json', errors);
  const recipeDir = join(dir, 'recipes');
  const recipes = new Map<string, unknown>();
  for (const name of readdirSync(recipeDir).sort()) {
    if (!name.endsWith('.json')) continue;
    recipes.set(name, readJson(join(recipeDir, name), name, errors));
  }
  if (errors.length > 0) throw new SeedError(errors);

  const result = checkSeed(ingredients, recipes);
  if (!result.ok) throw new SeedError(result.errors);
  return result.data;
}

export interface SeedSummary {
  ingredients: number;
  recipes: number;
  removedRecipes: number;
  removedIngredients: number;
  /**
   * Ingredients no longer in the files that are kept because an inventory item, a shopping list line (spec 06),
   * a household's own recipe or someone's avoided-ingredient list (spec 16) is linked to them.
   */
  keptIngredients: string[];
}

/**
 * Writes the seed in one transaction: upsert on key/slug (ids survive a re-seed, so links from inventory
 * items and URLs keep working), replace aliases/allergens/conversions/recipe lines, and remove recipes and
 * unused ingredients that are no longer in the files.
 */
export async function applySeed(db: Db, seed: ResolvedSeed): Promise<SeedSummary> {
  return db.$transaction(
    async (tx) => {
      const ingredientIds = new Map<string, string>();
      for (const ingredient of seed.ingredients) {
        const data = {
          name: ingredient.name,
          baseUnit: ingredient.baseUnit,
          isStaple: ingredient.isStaple,
          categoryKey: ingredient.category ?? null,
        };
        const row = await tx.ingredient.upsert({
          where: { key: ingredient.key },
          create: { key: ingredient.key, ...data },
          update: data,
          select: { id: true },
        });
        ingredientIds.set(ingredient.key, row.id);
      }
      const ids = [...ingredientIds.values()];
      const idOf = (key: string) => {
        const id = ingredientIds.get(key);
        if (!id) throw new Error(`unknown ingredient ${key}`);
        return id;
      };

      // All aliases first, so an alias can move from one ingredient to another without a unique conflict.
      await tx.ingredientAlias.deleteMany({});
      await tx.ingredientAllergen.deleteMany({ where: { ingredientId: { in: ids } } });
      await tx.unitConversion.deleteMany({ where: { ingredientId: { in: ids } } });
      await tx.ingredientAlias.createMany({
        data: seed.ingredients.flatMap((i) =>
          i.aliases.map((alias) => ({ alias, ingredientId: idOf(i.key) })),
        ),
      });
      await tx.ingredientAllergen.createMany({
        data: seed.ingredients.flatMap((i) =>
          i.allergens.map((allergen) => ({ allergen, ingredientId: idOf(i.key) })),
        ),
      });
      await tx.unitConversion.createMany({
        data: seed.ingredients.flatMap((i) =>
          i.conversions.map((c) => ({
            ingredientId: idOf(i.key),
            unit: c.unit,
            unitQty: c.unitQty,
            baseQty: c.baseQty,
          })),
        ),
      });

      for (const recipe of seed.recipes) {
        const data = {
          title: recipe.title,
          description: recipe.description,
          servings: recipe.servings,
          prepMinutes: recipe.prepMinutes,
          cookMinutes: recipe.cookMinutes,
          steps: recipe.steps,
          tags: recipe.tags,
          source: recipe.source,
          license: recipe.license,
          authors: recipe.authors,
          sourceTitle: recipe.sourceTitle ?? null,
          sourceUrl: recipe.sourceUrl ?? null,
          retrievedOn: recipe.retrievedOn ? toDbDate(recipe.retrievedOn) : null,
          adaptation: recipe.adaptation ?? null,
          adaptationNote: recipe.adaptationNote ?? null,
          aiAssisted: recipe.aiAssisted ?? false,
          reviewedBy: recipe.reviewedBy,
          reviewedOn: recipe.reviewedOn ? toDbDate(recipe.reviewedOn) : null,
        };
        // A slug is never on a household's own recipe (CHECK), so this can only find a global one.
        const row = await tx.recipe.upsert({
          where: { slug: recipe.slug, ...GLOBAL_RECIPES },
          create: { slug: recipe.slug, ...data },
          update: data,
          select: { id: true },
        });
        await tx.recipeIngredient.deleteMany({ where: { recipeId: row.id } });
        await tx.recipeIngredient.createMany({
          data: recipe.ingredients.map((line, position) => ({
            recipeId: row.id,
            position,
            ingredientId: idOf(line.ingredientKey),
            quantityBase: line.quantityBase,
            displayText: line.displayText,
            optional: line.optional,
          })),
        });
      }

      const removedRecipes = await tx.recipe.deleteMany({
        where: { ...GLOBAL_RECIPES, slug: { notIn: seed.recipes.map((r) => r.slug) } },
      });
      const stale = await tx.ingredient.findMany({
        where: { id: { notIn: ids } },
        select: {
          id: true,
          key: true,
          _count: {
            select: {
              items: true,
              shoppingItems: true,
              barcodes: true,
              // Only household recipes are left: the global ones not in the files were removed above.
              recipes: true,
              avoidedBy: true,
            },
          },
        },
      });
      const inUse = ({ _count: c }: (typeof stale)[number]) =>
        c.items + c.shoppingItems + c.barcodes + c.recipes + c.avoidedBy > 0;
      const unused = stale.filter((i) => !inUse(i));
      await tx.ingredient.deleteMany({ where: { id: { in: unused.map((i) => i.id) } } });

      return {
        ingredients: seed.ingredients.length,
        recipes: seed.recipes.length,
        removedRecipes: removedRecipes.count,
        removedIngredients: unused.length,
        keptIngredients: stale.filter(inUse).map((i) => i.key),
      };
    },
    { timeout: 60_000 },
  );
}
