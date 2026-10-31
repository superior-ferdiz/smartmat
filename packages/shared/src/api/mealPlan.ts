import { z } from 'zod';
import { EXPIRY_KINDS } from '../quantity/expiry';
import { BASE_UNITS } from '../quantity/quantity';
import { MEALS } from '../mealplan/needs';
import { ALLERGENS } from '../recipes/allergens';
import { LINE_STATUSES } from '../recipes/scoring';
import { SUGGESTION_REASONS } from '../shopping/list';
import { creatorRefSchema } from './household';

/* Response shapes for the meal plan (phase 9, spec 09). */

export const MEAL_ENTRY_KINDS = ['recipe', 'note'] as const;

export const mealEntryResponseSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  meal: z.enum(MEALS),
  kind: z.enum(MEAL_ENTRY_KINDS),
  /** Null for a note, and for a recipe that no longer exists (the title is kept). */
  recipeId: z.uuid().nullable(),
  recipeTitle: z.string().nullable(),
  /** The recipe's own number of servings, for scaling; null when it no longer exists. */
  recipeServings: z.number().int().nullable(),
  servings: z.number().int().nullable(),
  note: z.string().nullable(),
  /** The logged-in user's allergens registered for the recipe's ingredients (spec 05). */
  allergenWarnings: z.array(z.enum(ALLERGENS)),
  /** Spec 10 (FR-HH-006): allergens other members share with the household (never whose). */
  householdAllergenWarnings: z.array(z.enum(ALLERGENS)),
  /** Spec 16 (FR-ALG-002): avoided ingredients in the recipe – the user's, and those others share. */
  ingredientWarnings: z.array(z.string()),
  householdIngredientWarnings: z.array(z.string()),
  createdAt: z.string(),
  /** Spec 10 (FR-HH-007): who planned it. */
  createdBy: creatorRefSchema,
});
export type MealEntryResponse = z.infer<typeof mealEntryResponseSchema>;

/** GET /households/:householdId/meal-plan?from&to – entries in date and meal order. */
export const mealPlanResponseSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  entries: z.array(mealEntryResponseSchema),
});
export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;

export const entryNeedSchema = z.object({
  entryId: z.uuid(),
  date: z.iso.date(),
  meal: z.enum(MEALS),
  recipeTitle: z.string(),
  needBase: z.number().int().nullable(),
  rounded: z.boolean(),
  optional: z.boolean(),
  shortfallBase: z.number().int().nullable(),
  unmet: z.boolean(),
  addedBase: z.number().int().nullable(),
  added: z.boolean(),
});

export const ingredientNeedSchema = z.object({
  ingredientId: z.uuid(),
  ingredientName: z.string(),
  baseUnit: z.enum(BASE_UNITS),
  isStaple: z.boolean(),
  optional: z.boolean(),
  needBase: z.number().int(),
  untilTaste: z.boolean(),
  rounded: z.boolean(),
  coveredBase: z.number().int(),
  missingBase: z.number().int(),
  unknownAmount: z.boolean(),
  approximate: z.boolean(),
  status: z.enum(LINE_STATUSES),
  onListBase: z.number().int(),
  toBuyBase: z.number().int().nullable(),
  alreadyAdded: z.boolean(),
  itemNames: z.array(z.string()),
  excludedUseByItems: z.array(z.string()),
  entries: z.array(entryNeedSchema),
});
export type IngredientNeedResponse = z.infer<typeof ingredientNeedSchema>;

export const planSuggestionSchema = z.object({
  ingredientId: z.uuid(),
  ingredientName: z.string(),
  quantityBase: z.number().int().nullable(),
  baseUnit: z.enum(BASE_UNITS),
  reason: z.enum(SUGGESTION_REASONS),
  selected: z.boolean(),
});
export type PlanSuggestionResponse = z.infer<typeof planSuggestionSchema>;

export const unplannedExpiringSchema = z.object({
  itemId: z.uuid(),
  itemName: z.string(),
  expiryKind: z.enum(EXPIRY_KINDS),
  expiryDate: z.iso.date(),
  daysLeft: z.number().int(),
});

/** GET /households/:householdId/meal-plan/needs?from&to (FR-PLAN-003/004/005). */
export const mealPlanNeedsResponseSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** Planned recipes in the period that still exist. */
  recipeEntryCount: z.number().int(),
  ingredients: z.array(ingredientNeedSchema),
  suggestions: z.array(planSuggestionSchema),
  unplannedExpiring: z.array(unplannedExpiringSchema),
});
export type MealPlanNeedsResponse = z.infer<typeof mealPlanNeedsResponseSchema>;

export const addPlanToShoppingResponseSchema = z.object({
  created: z.number().int(),
  merged: z.number().int(),
  /** Nothing left to add: the plan had already added it (FR-PLAN-004). */
  skipped: z.number().int(),
});
export type AddPlanToShoppingResponse = z.infer<typeof addPlanToShoppingResponseSchema>;
