import { z } from 'zod';
import {
  baseUnitSchema,
  categoryKeySchema,
  expirySchema,
  itemNameSchema,
  locationIdSchema,
  quantityBaseSchema,
} from './inventory';

/*
 * Request schemas for the shopping list (phase 6, spec 06). Quantities arrive as whole base units with
 * their unit (ADR-0006); the forms turn "1,5 kg" into { quantityBase: 1500, unit: 'g' } with parseQuantity.
 * Messages are i18n keys.
 */

export const SHOPPING_TEXT_MAX_LENGTH = 100;
/** Lines per request from a recipe, and per "Legg i matlageret". */
export const SHOPPING_MAX_LINES = 100;

export const shoppingTextSchema = z
  .string({ error: 'validation.shoppingText.required' })
  .trim()
  .min(1, { error: 'validation.shoppingText.required' })
  .max(SHOPPING_TEXT_MAX_LENGTH, { error: 'validation.shoppingText.tooLong' });

/** A quantity with its unit, or nothing ("melk" without an amount). Both or neither (CHECK in the database). */
export const shoppingQuantitySchema = z
  .object({ quantityBase: quantityBaseSchema, unit: baseUnitSchema })
  .nullable();

export const createShoppingItemSchema = z.object({
  text: shoppingTextSchema,
  quantity: shoppingQuantitySchema.optional(),
  /** A random id per form submit: the same id twice gives one line (NFR-DATA-002). */
  clientRequestId: z.uuid().optional(),
});
export type CreateShoppingItemInput = z.input<typeof createShoppingItemSchema>;
export type CreateShoppingItemBody = z.output<typeof createShoppingItemSchema>;

/** `checked` is set, never toggled, so the same request twice gives the same result. */
export const updateShoppingItemSchema = z
  .object({
    text: shoppingTextSchema.optional(),
    quantity: shoppingQuantitySchema.optional(),
    checked: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: 'validation.nothingToUpdate',
  });
export type UpdateShoppingItemBody = z.output<typeof updateShoppingItemSchema>;

function uniqueBy<T>(key: (value: T) => string) {
  return (list: readonly T[]) => new Set(list.map(key)).size === list.length;
}

/** FR-SHOP-002: the suggestions the user kept, with the amounts they chose (in the ingredient's base unit). */
export const addFromRecipeSchema = z.object({
  lines: z
    .array(
      z.object({
        ingredientId: z.uuid({ error: 'validation.ingredient.unknown' }),
        quantityBase: quantityBaseSchema.nullable(),
      }),
    )
    .min(1, { error: 'validation.shopping.nothingSelected' })
    .max(SHOPPING_MAX_LINES, { error: 'validation.shopping.tooManyLines' })
    .refine(
      uniqueBy((l: { ingredientId: string }) => l.ingredientId),
      { error: 'validation.shopping.duplicateLine' },
    ),
});
export type AddFromRecipeInput = z.input<typeof addFromRecipeSchema>;
export type AddFromRecipeBody = z.output<typeof addFromRecipeSchema>;

export const STOCK_TARGET_KINDS = ['existing', 'new'] as const;

/** FR-SHOP-003: where a checked line goes in the inventory. */
export const stockTargetSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('existing'),
      itemId: z.uuid({ error: 'validation.shopping.itemRequired' }),
    }),
    z.object({
      kind: z.literal('new'),
      name: itemNameSchema,
      categoryKey: categoryKeySchema,
      unit: baseUnitSchema,
    }),
  ],
  { error: 'validation.shopping.itemRequired' },
);
export type StockTarget = z.infer<typeof stockTargetSchema>;

export const stockLineSchema = z.object({
  shoppingItemId: z.uuid(),
  target: stockTargetSchema,
  /** In the unit of the target item. */
  quantityBase: quantityBaseSchema,
  locationId: locationIdSchema,
  expiry: expirySchema.optional(),
});
export type StockLineInput = z.input<typeof stockLineSchema>;

export const toInventorySchema = z.object({
  lines: z
    .array(stockLineSchema)
    .min(1, { error: 'validation.shopping.nothingSelected' })
    .max(SHOPPING_MAX_LINES, { error: 'validation.shopping.tooManyLines' })
    .refine(
      uniqueBy((l: { shoppingItemId: string }) => l.shoppingItemId),
      { error: 'validation.shopping.duplicateLine' },
    ),
});
export type ToInventoryInput = z.input<typeof toInventorySchema>;
export type ToInventoryBody = z.output<typeof toInventorySchema>;
