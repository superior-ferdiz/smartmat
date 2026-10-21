import { z } from 'zod';
import { EXPIRY_KINDS } from '../quantity/expiry';
import { BASE_UNITS } from '../quantity/quantity';
import { INGREDIENT_MATCH_MODES } from '../recipes/matching';
import { CATEGORY_KEYS, LOCATION_KINDS, WASTE_REASONS } from '../schemas/inventory';

/* Response shapes for the inventory API (phase 3). */

export const locationResponseSchema = z.object({
  id: z.uuid(),
  kind: z.enum(LOCATION_KINDS),
  /** null for the three default locations: the app shows the translated kind ("Kjøleskap"/"Fridge"). */
  name: z.string().nullable(),
  /** Batches with something left in them. */
  batchCount: z.number().int().nonnegative(),
});
export type LocationResponse = z.infer<typeof locationResponseSchema>;

export const batchResponseSchema = z.object({
  id: z.uuid(),
  quantityBase: z.number().int().nonnegative(),
  initialQuantityBase: z.number().int().positive(),
  locationId: z.uuid(),
  expiryKind: z.enum(EXPIRY_KINDS).nullable(),
  expiryDate: z.string().nullable(),
  priceOre: z.number().int().nullable(),
  purchasedOn: z.string().nullable(),
  /** The purchase the batch came from (phase 4, FR-BUD-002), or null. */
  purchaseId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type BatchResponse = z.infer<typeof batchResponseSchema>;

export const itemResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  categoryKey: z.enum(CATEGORY_KEYS),
  unit: z.enum(BASE_UNITS),
  /** Spec 05: how the item is linked to a recipe ingredient; ingredientId only for manual. */
  ingredientMatch: z.enum(INGREDIENT_MATCH_MODES),
  ingredientId: z.uuid().nullable(),
  createdAt: z.string(),
  /** Only batches with something left. Empty items have an empty list. */
  batches: z.array(batchResponseSchema),
});
export type ItemResponse = z.infer<typeof itemResponseSchema>;

export const inventoryResponseSchema = z.object({ items: z.array(itemResponseSchema) });
export type InventoryResponse = z.infer<typeof inventoryResponseSchema>;

export const INVENTORY_EVENT_TYPES = [
  'add',
  'consume',
  'discard',
  'move',
  'adjust',
  'undo',
] as const;
export type InventoryEventType = (typeof INVENTORY_EVENT_TYPES)[number];

export const WASTE_VALUE_BASES = ['actual', 'estimated', 'unknown'] as const;

export const historyEventSchema = z.object({
  id: z.uuid(),
  type: z.enum(INVENTORY_EVENT_TYPES),
  deltaBase: z.number().int(),
  batchId: z.uuid().nullable(),
  fromLocationId: z.uuid().nullable(),
  toLocationId: z.uuid().nullable(),
  /** The member who did it; null if that account has been deleted. */
  actorName: z.string().nullable(),
  createdAt: z.string(),
  revertsEventId: z.uuid().nullable(),
  /** The type of the event an undo reverted, so the history can say "Angret: brukt 200 g". */
  revertedType: z.enum(INVENTORY_EVENT_TYPES).nullable(),
  wasteReason: z.enum(WASTE_REASONS).nullable(),
  wasteValueOre: z.number().int().nullable(),
  wasteValueBasis: z.enum(WASTE_VALUE_BASES).nullable(),
  undone: z.boolean(),
});
export type HistoryEvent = z.infer<typeof historyEventSchema>;

export const historyResponseSchema = z.object({
  events: z.array(historyEventSchema),
  /** The event "Angre" would revert, or null. */
  undoableEventId: z.uuid().nullable(),
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

export const wasteSummarySchema = z.object({
  /** "YYYY-MM", in Norwegian time. */
  month: z.string(),
  count: z.number().int().nonnegative(),
  /** Sum of actual and estimated values. */
  knownValueOre: z.number().int().nonnegative(),
  /** Discards with unknown value (counted, not in the sum). */
  unknownValueCount: z.number().int().nonnegative(),
});
export type WasteSummary = z.infer<typeof wasteSummarySchema>;
