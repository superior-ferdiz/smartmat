import { z } from 'zod';
import { EXPIRY_KINDS } from '../quantity/expiry';
import { BASE_UNITS } from '../quantity/quantity';
import { ALLERGENS } from '../recipes/allergens';
import { LINE_STATUSES } from '../recipes/scoring';
import {
  RECIPE_ADAPTATIONS,
  RECIPE_LICENSES,
  RECIPE_SEED_SOURCES,
  SEED_UNIT_KEYS,
  type SeedUnit,
} from '../recipes/seed';
import {
  PRICE_ESTIMATE_BASES,
  PRICE_ESTIMATE_SOURCES,
  PRICE_MISSING_REASONS,
} from '../prices/rules';
import { creatorRefSchema } from './household';
import { CATEGORY_KEYS } from '../schemas/inventory';

/* Request and response shapes for recipes and allergens (phase 5, spec 05). */

export const allergenListSchema = z
  .array(z.enum(ALLERGENS, { error: 'validation.allergen.unknown' }))
  .max(ALLERGENS.length)
  .refine((list) => new Set(list).size === list.length, { error: 'validation.allergen.duplicate' });

/** PUT /me/allergens and its response. */
export const allergensBodySchema = z.object({ allergens: allergenListSchema });
export type AllergensBody = z.infer<typeof allergensBodySchema>;

/** Every source a recipe in the app can have: the seed sources and a household's own (ADR-0023, spec 16). */
export const RECIPE_SOURCES = [...RECIPE_SEED_SOURCES, 'household'] as const;
export type AnyRecipeSource = (typeof RECIPE_SOURCES)[number];

const seedUnitSchema = z.enum(SEED_UNIT_KEYS as [SeedUnit, ...SeedUnit[]]);

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
  /** Spec 16 (FR-REC-008): the units a recipe line for this ingredient may be written in. */
  units: z.array(seedUnitSchema),
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
  /** Null for a household's own recipe. */
  slug: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  servings: z.number().int(),
  prepMinutes: z.number().int(),
  cookMinutes: z.number().int(),
  tags: z.array(z.string()),
  source: z.enum(RECIPE_SOURCES),
  origin: recipeOriginSchema.nullable(),
  /** Spec 16: who added a household's own recipe (name only for current members). Null for global recipes. */
  createdBy: creatorRefSchema.nullable(),
  /** For the search field: the names of the recipe's ingredients. */
  ingredientNames: z.array(z.string()),
  /** Allergens registered for the recipe's ingredients (all of them). */
  allergens: z.array(z.enum(ALLERGENS)),
  /** The ones the user has registered. Non-empty → hidden by default, or shown with a warning. */
  allergenWarnings: z.array(z.enum(ALLERGENS)),
  /**
   * Spec 10 (FR-HH-006): allergens other members share with the household, registered for this recipe and not
   * among the user's own. Never says whose.
   */
  householdAllergenWarnings: z.array(z.enum(ALLERGENS)),
  /** FR-ALG-002: ingredients the user does not tolerate that the recipe has (names). */
  ingredientWarnings: z.array(z.string()),
  /** FR-ALG-002: the same for what other members share, minus the user's own. Never says whose. */
  householdIngredientWarnings: z.array(z.string()),
  /** FR-ALG-003: free-text lines are not checked against allergies. */
  freeTextCount: z.number().int(),
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
  /** Spec 10: the household's shared allergens that are not the user's own. */
  householdAllergens: z.array(z.enum(ALLERGENS)),
  /** Spec 16: names of the avoided ingredients – the user's, and those shared by others (not the user's). */
  avoidedIngredients: z.array(z.string()),
  householdAvoidedIngredients: z.array(z.string()),
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
  /** Null for a household's own recipe. */
  license: z.string().nullable(),
  authors: z.array(z.string()),
  lines: z.array(recipeLineSchema),
  /** FR-REC-008: free-text lines of a household's own recipe, placed among `lines` by `position`. */
  freeTextLines: z.array(z.object({ position: z.number().int(), displayText: z.string() })),
  userAllergens: z.array(z.enum(ALLERGENS)),
  householdAllergens: z.array(z.enum(ALLERGENS)),
  avoidedIngredients: z.array(z.string()),
  householdAvoidedIngredients: z.array(z.string()),
});
export type RecipeDetail = z.infer<typeof recipeDetailSchema>;

/** GET /households/:householdId/recipes/:recipeId/edit: a household's own recipe as the form needs it. */
export const householdRecipeEditSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  title: z.string(),
  description: z.string(),
  servings: z.number().int(),
  prepMinutes: z.number().int(),
  cookMinutes: z.number().int(),
  tags: z.array(z.string()),
  lines: z.array(
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('ingredient'),
        ingredientId: z.uuid(),
        amount: z.string().nullable(),
        unit: seedUnitSchema.nullable(),
        text: z.string(),
        optional: z.boolean(),
      }),
      z.object({ kind: z.literal('freeText'), text: z.string() }),
    ]),
  ),
  steps: z.array(z.string()),
});
export type HouseholdRecipeEdit = z.infer<typeof householdRecipeEditSchema>;

/** POST/PUT answer: enough for the form to go to the recipe. */
export const householdRecipeSavedSchema = z.object({ id: z.uuid(), version: z.number().int() });
export type HouseholdRecipeSaved = z.infer<typeof householdRecipeSavedSchema>;

/** GET/PUT /me/avoided-ingredients (FR-ALG-001), in the order of the ingredient list. */
export const avoidedIngredientsResponseSchema = z.object({
  ingredients: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type AvoidedIngredientsResponse = z.infer<typeof avoidedIngredientsResponseSchema>;

/**
 * FR-PRICE-007: why a recipe line has no estimate at all. freeText/staple/noAmount are left out on purpose;
 * the reasons from the shopping list (noMatch, noPrice, unitMismatch) mean it was tried.
 */
export const RECIPE_PRICE_SKIPPED = ['freeText', 'staple', 'noAmount'] as const;
export type RecipePriceSkipped = (typeof RECIPE_PRICE_SKIPPED)[number];

export const recipePriceLineSchema = z.object({
  position: z.number().int(),
  text: z.string(),
  estimateOre: z.number().int().nullable(),
  source: z.enum(PRICE_ESTIMATE_SOURCES).nullable(),
  basis: z.enum(PRICE_ESTIMATE_BASES).nullable(),
  date: z.iso.date().nullable(),
  missing: z.enum(PRICE_MISSING_REASONS).nullable(),
  skipped: z.enum(RECIPE_PRICE_SKIPPED).nullable(),
});
export type RecipePriceLine = z.infer<typeof recipePriceLineSchema>;

/** GET /households/:householdId/recipes/:recipeId/price-estimate. Never a total (ADR-0010). */
export const recipePriceEstimateSchema = z.object({
  /** Whether Kassalapp prices can be in the estimate at all (false without KASSALAPP_API_KEY). */
  externalEnabled: z.boolean(),
  lines: z.array(recipePriceLineSchema),
  summary: z.object({
    /** Lines that were tried (not skipped). */
    pricedLines: z.number().int(),
    estimatedLines: z.number().int(),
    missingLines: z.number().int(),
    skippedLines: z.number().int(),
    /** The sum of the lines that have an estimate – never a price for the recipe. */
    estimatedOre: z.number().int(),
    fromOwn: z.number().int(),
    fromKassalapp: z.number().int(),
  }),
});
export type RecipePriceEstimate = z.infer<typeof recipePriceEstimateSchema>;
