import { z } from 'zod';
import { EXPIRY_KINDS } from '../quantity/expiry';
import { BASE_UNITS } from '../quantity/quantity';
import { ALLERGENS } from '../recipes/allergens';
import { LINE_STATUSES } from '../recipes/scoring';
import { RECIPE_ADAPTATIONS, RECIPE_LICENSES, RECIPE_SEED_SOURCES } from '../recipes/seed';
import { CATEGORY_KEYS } from '../schemas/inventory';

/* Request and response shapes for recipes and allergens (phase 5, spec 05). */

export const allergenListSchema = z
  .array(z.enum(ALLERGENS, { error: 'validation.allergen.unknown' }))
  .max(ALLERGENS.length)
  .refine((list) => new Set(list).size === list.length, { error: 'validation.allergen.duplicate' });

/** PUT /me/allergens and its response. */
export const allergensBodySchema = z.object({ allergens: allergenListSchema });
export type AllergensBody = z.infer<typeof allergensBodySchema>;

/** GET /ingredients: the global list, with aliases so the web app can show how an item is linked. */
export const ingredientResponseSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  baseUnit: z.enum(BASE_UNITS),
  isStaple: z.boolean(),
  /** Suggested category for a new inventory item made from a shopping line (spec 06). */
  categoryKey: z.enum(CATEGORY_KEYS).nullable(),
  aliases: z.array(z.string()),
});
export type IngredientResponse = z.infer<typeof ingredientResponseSchema>;

const expiringSchema = z.object({
  itemName: z.string(),
  expiryKind: z.enum(EXPIRY_KINDS),
  daysLeft: z.number().int(),
});

const points = z.number().int();
export const scoreReasonSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('coverage'),
    points,
    enough: z.number().int(),
    partial: z.number().int(),
    required: z.number().int(),
  }),
  z.object({ code: z.literal('nothing'), points }),
  z.object({
    code: z.literal('expiring'),
    points,
    ingredientName: z.string(),
    ...expiringSchema.shape,
  }),
  z.object({ code: z.literal('missing'), points, names: z.array(z.string()) }),
]);
export type ScoreReasonResponse = z.infer<typeof scoreReasonSchema>;

export const recipeScoreSchema = z.object({
  total: z.number().int(),
  coverage: z.number().int(),
  expiringBonus: z.number().int(),
  requiredCount: z.number().int(),
  enoughCount: z.number().int(),
  partialCount: z.number().int(),
  missingCount: z.number().int(),
  reasons: z.array(scoreReasonSchema),
});

/**
 * ADR-0016 (spec 09, FR-REC-006): where an external recipe comes from. Null for the team's own recipes and
 * the test fixtures. `reviewedBy` empty = shown as "KI-utkast – ikke kontrollert av teamet".
 */
export const recipeOriginSchema = z.object({
  title: z.string(),
  url: z.url(),
  license: z.enum(RECIPE_LICENSES),
  retrievedOn: z.iso.date(),
  adaptation: z.enum(RECIPE_ADAPTATIONS),
  adaptationNote: z.string().nullable(),
  aiAssisted: z.boolean(),
  reviewedBy: z.array(z.string()),
  reviewedOn: z.iso.date().nullable(),
});
export type RecipeOrigin = z.infer<typeof recipeOriginSchema>;

export const recipeSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  servings: z.number().int(),
  prepMinutes: z.number().int(),
  cookMinutes: z.number().int(),
  tags: z.array(z.string()),
  source: z.enum(RECIPE_SEED_SOURCES),
  origin: recipeOriginSchema.nullable(),
  /** For the search field: the names of the recipe's ingredients. */
  ingredientNames: z.array(z.string()),
  /** Allergens registered for the recipe's ingredients (all of them). */
  allergens: z.array(z.enum(ALLERGENS)),
  /** The ones the user has registered. Non-empty → hidden by default, or shown with a warning. */
  allergenWarnings: z.array(z.enum(ALLERGENS)),
  score: recipeScoreSchema,
});
export type RecipeSummary = z.infer<typeof recipeSummarySchema>;

/**
 * FR-PLAN-005 (spec 09): `?for=YYYY-MM-DD` ranks for a planned day – batches whose use-by date is before
 * that day do not count. Without it, the ranking is for today.
 */
export const recipeListQuerySchema = z.object({ for: z.iso.date().optional() });

/** GET /households/:householdId/recipes: ranked, best first. */
export const recipeListResponseSchema = z.object({
  recipes: z.array(recipeSummarySchema),
  userAllergens: z.array(z.enum(ALLERGENS)),
});
export type RecipeListResponse = z.infer<typeof recipeListResponseSchema>;

export const recipeLineSchema = z.object({
  position: z.number().int(),
  ingredientId: z.uuid(),
  ingredientName: z.string(),
  displayText: z.string(),
  quantityBase: z.number().int().nullable(),
  baseUnit: z.enum(BASE_UNITS),
  optional: z.boolean(),
  status: z.enum(LINE_STATUSES),
  haveBase: z.number().int().nullable(),
  missingBase: z.number().int().nullable(),
  approximate: z.boolean(),
  itemNames: z.array(z.string()),
  expiring: expiringSchema.nullable(),
  excludedUseByItems: z.array(z.string()),
  allergens: z.array(z.enum(ALLERGENS)),
});
export type RecipeLine = z.infer<typeof recipeLineSchema>;

/** GET /households/:householdId/recipes/:recipeId */
export const recipeDetailSchema = recipeSummarySchema.extend({
  steps: z.array(z.string()),
  license: z.string(),
  authors: z.array(z.string()),
  lines: z.array(recipeLineSchema),
  userAllergens: z.array(z.enum(ALLERGENS)),
});
export type RecipeDetail = z.infer<typeof recipeDetailSchema>;
