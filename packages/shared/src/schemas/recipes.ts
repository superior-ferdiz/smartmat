import { z } from 'zod';
import { AVOIDED_INGREDIENTS_MAX, RECIPE_LINES_MAX, RECIPE_STEPS_MAX } from '../recipes/household';
import { SEED_UNIT_KEYS, type SeedUnit } from '../recipes/seed';

/*
 * Request schemas for a household's own recipes (spec 16, FR-REC-007/008) and the avoided ingredients
 * (FR-ALG-001), shared by the web form and the API. Messages are i18n keys.
 */

/** Literal keys (not built from a name), so `locales.test.ts` can find them in the source. */
const text = (max: number, required: string, tooLong: string) =>
  z.string({ error: required }).trim().min(1, { error: required }).max(max, { error: tooLong });

const minutes = z
  .number({ error: 'validation.recipe.minutes' })
  .int({ error: 'validation.recipe.minutes' })
  .min(0, { error: 'validation.recipe.minutes' })
  .max(1440, { error: 'validation.recipe.minutes' });

/** An ingredient from the list, with an amount and unit or none ("etter smak"). */
const ingredientLineSchema = z
  .object({
    kind: z.literal('ingredient'),
    ingredientId: z.uuid({ error: 'validation.recipe.ingredient' }),
    amount: z
      .string()
      .trim()
      .max(12, { error: 'validation.recipe.amount' })
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .default(null),
    unit: z
      .enum(SEED_UNIT_KEYS as [SeedUnit, ...SeedUnit[]], { error: 'validation.recipe.unit' })
      .nullable()
      .default(null),
    /** Empty: the server writes "2 dl melk". */
    text: z.string().trim().max(120, { error: 'validation.recipe.lineTextTooLong' }).default(''),
    optional: z.boolean().default(false),
  })
  .refine((line) => (line.amount === null) === (line.unit === null), {
    error: 'validation.recipe.amountAndUnit',
    path: ['amount'],
  });

/** FR-REC-008: text only. Never counts in the inventory, shopping list, meal plan, prices or allergy warnings. */
const freeTextLineSchema = z.object({
  kind: z.literal('freeText'),
  text: text(120, 'validation.recipe.lineText', 'validation.recipe.lineTextTooLong'),
});

export const householdRecipeLineSchema = z.discriminatedUnion('kind', [
  ingredientLineSchema,
  freeTextLineSchema,
]);
export type HouseholdRecipeLineInput = z.input<typeof householdRecipeLineSchema>;
export type HouseholdRecipeLine = z.output<typeof householdRecipeLineSchema>;

const recipeFields = {
  title: text(120, 'validation.recipe.title', 'validation.recipe.titleTooLong'),
  description: z
    .string()
    .trim()
    .max(500, { error: 'validation.recipe.descriptionTooLong' })
    .default(''),
  servings: z
    .number({ error: 'validation.recipe.servings' })
    .int({ error: 'validation.recipe.servings' })
    .min(1, { error: 'validation.recipe.servings' })
    .max(50, { error: 'validation.recipe.servings' }),
  prepMinutes: minutes,
  cookMinutes: minutes,
  tags: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .min(1, { error: 'validation.recipe.tag' })
        .max(30, { error: 'validation.recipe.tag' }),
    )
    .max(10, { error: 'validation.recipe.tooManyTags' })
    .default([])
    .transform((tags) => [...new Set(tags)]),
  lines: z
    .array(householdRecipeLineSchema)
    .min(1, { error: 'validation.recipe.noLines' })
    .max(RECIPE_LINES_MAX, { error: 'validation.recipe.tooManyLines' })
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach((line, i) => {
        if (line.kind !== 'ingredient') return;
        if (seen.has(line.ingredientId))
          ctx.addIssue({
            code: 'custom',
            path: [i, 'ingredientId'],
            message: 'validation.recipe.duplicateIngredient',
          });
        seen.add(line.ingredientId);
      });
    }),
  steps: z
    .array(text(1000, 'validation.recipe.step', 'validation.recipe.stepTooLong'))
    .min(1, { error: 'validation.recipe.noSteps' })
    .max(RECIPE_STEPS_MAX, { error: 'validation.recipe.tooManySteps' }),
};

/** POST /households/:householdId/recipes */
export const createHouseholdRecipeSchema = z.object({
  ...recipeFields,
  /** A random id per form submit: the same id twice gives one recipe (NFR-DATA-002). */
  clientRequestId: z.uuid().optional(),
});
export type CreateHouseholdRecipeInput = z.input<typeof createHouseholdRecipeSchema>;
export type CreateHouseholdRecipeBody = z.output<typeof createHouseholdRecipeSchema>;

/** PUT /households/:householdId/recipes/:recipeId: the whole recipe and the version the form opened. */
export const updateHouseholdRecipeSchema = z.object({
  ...recipeFields,
  version: z.number().int().min(1),
});
export type UpdateHouseholdRecipeInput = z.input<typeof updateHouseholdRecipeSchema>;
export type UpdateHouseholdRecipeBody = z.output<typeof updateHouseholdRecipeSchema>;

/** PUT /me/avoided-ingredients (FR-ALG-001). */
export const avoidedIngredientsBodySchema = z.object({
  ingredientIds: z
    .array(z.uuid({ error: 'validation.avoided.unknown' }))
    .max(AVOIDED_INGREDIENTS_MAX, { error: 'validation.avoided.tooMany' })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'validation.avoided.duplicate' }),
});
export type AvoidedIngredientsBody = z.infer<typeof avoidedIngredientsBodySchema>;
