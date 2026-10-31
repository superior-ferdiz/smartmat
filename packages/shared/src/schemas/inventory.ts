import { z } from 'zod';
import { EXPIRY_KINDS } from '../quantity/expiry';
import { BASE_UNITS, MAX_QUANTITY_BASE } from '../quantity/quantity';
import { oreAmountSchema } from './common';

/*
 * Request schemas for the inventory (phase 3, spec 03). Quantities arrive as whole base units
 * (g/ml/stk); the forms turn "1,5 kg" into 1500 with parseQuantity before sending.
 * Messages are i18n keys.
 */

/** Fixed list, seeded by the migration in the same order (a test checks they match). */
export const CATEGORY_KEYS = [
  'dairy',
  'meat',
  'fish',
  'fruitVeg',
  'bread',
  'dryGoods',
  'canned',
  'frozen',
  'spreads',
  'spicesSauces',
  'drinks',
  'other',
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const LOCATION_KINDS = ['fridge', 'freezer', 'pantry', 'other'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const WASTE_REASONS = ['expired', 'spoiled', 'leftovers', 'tooMuch', 'other'] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const ITEM_NAME_MAX_LENGTH = 100;
export const LOCATION_NAME_MAX_LENGTH = 50;

export const itemNameSchema = z
  .string({ error: 'validation.itemName.required' })
  .trim()
  .min(1, { error: 'validation.itemName.required' })
  .max(ITEM_NAME_MAX_LENGTH, { error: 'validation.itemName.tooLong' });

export const categoryKeySchema = z.enum(CATEGORY_KEYS, { error: 'validation.category.required' });
export const baseUnitSchema = z.enum(BASE_UNITS, { error: 'validation.unit.required' });
export const locationIdSchema = z.uuid({ error: 'validation.location.required' });

/** A real calendar date "YYYY-MM-DD" (2026-02-30 is refused). */
export const isoDateSchema = z.iso.date({ error: 'validation.date.invalid' });

/** A positive whole number of base units. */
export const quantityBaseSchema = z
  .number({ error: 'validation.quantity.required' })
  .int({ error: 'validation.quantity.notWhole' })
  .positive({ error: 'validation.quantity.notPositive' })
  .max(MAX_QUANTITY_BASE, { error: 'validation.quantity.tooLarge' });

/** Best before OR use by – one kind of date per batch, or none (decision 2 in spec 03). */
export const expirySchema = z
  .object({
    kind: z.enum(EXPIRY_KINDS, { error: 'validation.expiry.kindRequired' }),
    date: isoDateSchema,
  })
  .nullable();

export const batchInputSchema = z.object({
  quantityBase: quantityBaseSchema,
  locationId: locationIdSchema,
  expiry: expirySchema.optional(),
  priceOre: oreAmountSchema.nullable().optional(),
  purchasedOn: isoDateSchema.nullable().optional(),
});
export type BatchInput = z.input<typeof batchInputSchema>;

export const createItemSchema = z.object({
  name: itemNameSchema,
  categoryKey: categoryKeySchema,
  unit: baseUnitSchema,
  batch: batchInputSchema,
});
export type CreateItemInput = z.input<typeof createItemSchema>;
export type CreateItemBody = z.output<typeof createItemSchema>;

function atLeastOne<T extends Record<string, unknown>>(value: T) {
  return Object.values(value).some((v) => v !== undefined);
}

/**
 * Spec 05: how an item is linked to a recipe ingredient. auto = by its name, none = "not an ingredient",
 * manual = the ingredient the user chose (checked against the ingredient table by the server).
 */
export const itemIngredientSchema = z.discriminatedUnion(
  'match',
  [
    z.object({ match: z.literal('auto') }),
    z.object({ match: z.literal('none') }),
    z.object({
      match: z.literal('manual'),
      ingredientId: z.uuid({ error: 'validation.ingredient.unknown' }),
    }),
  ],
  { error: 'validation.ingredient.unknown' },
);
export type ItemIngredientInput = z.infer<typeof itemIngredientSchema>;

export const updateItemSchema = z
  .object({
    name: itemNameSchema.optional(),
    categoryKey: categoryKeySchema.optional(),
    ingredient: itemIngredientSchema.optional(),
  })
  .refine(atLeastOne, { error: 'validation.nothingToUpdate' });
export type UpdateItemBody = z.output<typeof updateItemSchema>;

/**
 * Correcting a batch. A new quantity is recorded as an "adjust" event, a new location as "move".
 * Zero is allowed here (it empties the batch); use consume/discard for food that was eaten or thrown away.
 */
export const updateBatchSchema = z
  .object({
    quantityBase: z
      .number({ error: 'validation.quantity.required' })
      .int({ error: 'validation.quantity.notWhole' })
      .nonnegative({ error: 'validation.quantity.notPositive' })
      .max(MAX_QUANTITY_BASE, { error: 'validation.quantity.tooLarge' })
      .optional(),
    locationId: locationIdSchema.optional(),
    expiry: expirySchema.optional(),
    priceOre: oreAmountSchema.nullable().optional(),
    purchasedOn: isoDateSchema.nullable().optional(),
  })
  .refine(atLeastOne, { error: 'validation.nothingToUpdate' });
export type UpdateBatchBody = z.output<typeof updateBatchSchema>;

export const consumeSchema = z.object({ quantityBase: quantityBaseSchema });
export type ConsumeBody = z.output<typeof consumeSchema>;

export const discardSchema = z.object({
  quantityBase: quantityBaseSchema,
  reason: z.enum(WASTE_REASONS, { error: 'validation.wasteReason.required' }),
  /** The real value if the user knows it; otherwise it is estimated from the batch price. */
  valueOre: oreAmountSchema.nullable().optional(),
});
export type DiscardBody = z.output<typeof discardSchema>;

export const locationNameSchema = z
  .string({ error: 'validation.locationName.required' })
  .trim()
  .min(1, { error: 'validation.locationName.required' })
  .max(LOCATION_NAME_MAX_LENGTH, { error: 'validation.locationName.tooLong' });

export const createLocationSchema = z.object({
  name: locationNameSchema,
  kind: z.enum(LOCATION_KINDS, { error: 'validation.location.kindRequired' }).default('other'),
});
export type CreateLocationInput = z.input<typeof createLocationSchema>;

export const updateLocationSchema = z.object({ name: locationNameSchema });
