import { z } from 'zod';
import { BASE_UNITS } from '../quantity/quantity';

/* Response shapes for the shopping list (phase 6, spec 06). */

export const shoppingRecipeShareSchema = z.object({
  recipeId: z.uuid(),
  title: z.string(),
  /** What the recipe added, in the ingredient's base unit (null = no amount). */
  quantityBase: z.number().int().nullable(),
});

export const shoppingItemResponseSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  /** Set from a recipe, or when the text matched one ingredient (spec 06). */
  ingredientId: z.uuid().nullable(),
  quantityBase: z.number().int().nullable(),
  unit: z.enum(BASE_UNITS).nullable(),
  checked: z.boolean(),
  checkedAt: z.string().nullable(),
  createdAt: z.string(),
  recipes: z.array(shoppingRecipeShareSchema),
});
export type ShoppingItemResponse = z.infer<typeof shoppingItemResponseSchema>;

/** GET /households/:householdId/shopping-list – open lines first, then checked ones. */
export const shoppingListResponseSchema = z.object({ items: z.array(shoppingItemResponseSchema) });
export type ShoppingListResponse = z.infer<typeof shoppingListResponseSchema>;

export const createShoppingItemResponseSchema = z.object({
  item: shoppingItemResponseSchema,
  /** An open line for the same ingredient that was already there (the new one is then not linked). */
  similarItemId: z.uuid().nullable(),
});
export type CreateShoppingItemResponse = z.infer<typeof createShoppingItemResponseSchema>;

export const addFromRecipeResponseSchema = z.object({
  created: z.number().int(),
  merged: z.number().int(),
  /** Lines this recipe had already added to. */
  skipped: z.number().int(),
});
export type AddFromRecipeResponse = z.infer<typeof addFromRecipeResponseSchema>;

export const toInventoryResponseSchema = z.object({
  added: z.number().int(),
  itemIds: z.array(z.uuid()),
});
export type ToInventoryResponse = z.infer<typeof toInventoryResponseSchema>;

export const clearCheckedResponseSchema = z.object({ removed: z.number().int() });
export type ClearCheckedResponse = z.infer<typeof clearCheckedResponseSchema>;
