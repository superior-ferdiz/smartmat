import { z } from 'zod';
import { daysBetween } from '../dates/dates';
import { MEALS } from '../mealplan/needs';
import { isoDateSchema, quantityBaseSchema } from './inventory';
import { SHOPPING_MAX_LINES } from './shopping';

/*
 * Request schemas for the meal plan (phase 9, spec 09), shared by the web forms and the API.
 * Messages are i18n keys.
 */

export const MEAL_NOTE_MAX_LENGTH = 100;
export const SERVINGS_MIN = 1;
export const SERVINGS_MAX = 50;
/** FR-PLAN-001: entries per day. */
export const MEAL_PLAN_MAX_PER_DAY = 20;
/** Longest period one request may read (six weeks). */
export const MEAL_PLAN_MAX_DAYS = 42;

export const mealSchema = z.enum(MEALS, { error: 'validation.mealPlan.meal' });

export const mealNoteSchema = z
  .string({ error: 'validation.mealPlan.noteRequired' })
  .trim()
  .min(1, { error: 'validation.mealPlan.noteRequired' })
  .max(MEAL_NOTE_MAX_LENGTH, { error: 'validation.mealPlan.noteTooLong' });

export const servingsSchema = z
  .number({ error: 'validation.mealPlan.servings' })
  .int({ error: 'validation.mealPlan.servings' })
  .min(SERVINGS_MIN, { error: 'validation.mealPlan.servings' })
  .max(SERVINGS_MAX, { error: 'validation.mealPlan.servings' });

const entryBase = {
  date: isoDateSchema,
  meal: mealSchema,
  /** A random id per form submit: the same id twice gives one entry (NFR-DATA-002). */
  clientRequestId: z.uuid().optional(),
};

/** FR-PLAN-001: a recipe with servings, or free text ("Rester", "Spise ute"). */
export const createMealEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    ...entryBase,
    kind: z.literal('recipe'),
    recipeId: z.uuid({ error: 'validation.mealPlan.recipe' }),
    servings: servingsSchema,
  }),
  z.object({ ...entryBase, kind: z.literal('note'), note: mealNoteSchema }),
]);
export type CreateMealEntryInput = z.input<typeof createMealEntrySchema>;
export type CreateMealEntryBody = z.output<typeof createMealEntrySchema>;

/** Move (date and meal), change servings (recipe) or text (note). */
export const updateMealEntrySchema = z
  .object({
    date: isoDateSchema.optional(),
    meal: mealSchema.optional(),
    servings: servingsSchema.optional(),
    note: mealNoteSchema.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: 'validation.nothingToUpdate',
  });
export type UpdateMealEntryBody = z.output<typeof updateMealEntrySchema>;

const rangeShape = { from: isoDateSchema, to: isoDateSchema };

function checkRange(range: { from: string; to: string }, ctx: z.RefinementCtx) {
  if (range.from > range.to)
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'validation.mealPlan.range' });
  else if (daysBetween(range.from, range.to) >= MEAL_PLAN_MAX_DAYS)
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'validation.mealPlan.rangeTooLong' });
}

/** `from` to `to`, both included, at most six weeks. */
export const mealPlanRangeSchema = z.object(rangeShape).superRefine(checkRange);
export type MealPlanRange = z.output<typeof mealPlanRangeSchema>;

/** FR-PLAN-004: the suggestions the user kept. The server works out the needs again itself. */
export const addPlanToShoppingSchema = z
  .object({
    ...rangeShape,
    lines: z
      .array(
        z.object({
          ingredientId: z.uuid({ error: 'validation.ingredient.unknown' }),
          /** The amount the user chose, in the ingredient's base unit; null = without an amount. */
          quantityBase: quantityBaseSchema.nullable(),
        }),
      )
      .min(1, { error: 'validation.shopping.nothingSelected' })
      .max(SHOPPING_MAX_LINES, { error: 'validation.shopping.tooManyLines' })
      .refine((lines) => new Set(lines.map((l) => l.ingredientId)).size === lines.length, {
        error: 'validation.shopping.duplicateLine',
      }),
  })
  .superRefine(checkRange);
export type AddPlanToShoppingInput = z.input<typeof addPlanToShoppingSchema>;
export type AddPlanToShoppingBody = z.output<typeof addPlanToShoppingSchema>;
