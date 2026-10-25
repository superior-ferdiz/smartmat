import { z } from 'zod';
import { creatorRefSchema } from './household';
import { CATEGORY_KEYS } from '../schemas/inventory';
import { PURCHASE_LINE_KINDS } from '../schemas/purchases';

/* Response shapes for purchases and the food budget (phase 4). Amounts are whole øre. */

export const PURCHASE_SOURCES = ['manual', 'receipt', 'barcode'] as const;

export const purchaseLineResponseSchema = z.object({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  description: z.string(),
  kind: z.enum(PURCHASE_LINE_KINDS),
  categoryKey: z.enum(CATEGORY_KEYS).nullable(),
  amountOre: z.number().int().nonnegative(),
  /** The inventory batch made from this line (FR-BUD-002), or null. */
  batch: z
    .object({
      id: z.uuid(),
      itemId: z.uuid(),
      itemName: z.string(),
      /**
       * Nothing has happened to it since it was added (no use, discard, move or adjustment):
       * it is removed together with the purchase or line unless the user keeps it (spec 04).
       */
      untouched: z.boolean(),
    })
    .nullable(),
});
export type PurchaseLineResponse = z.infer<typeof purchaseLineResponseSchema>;

export const purchaseResponseSchema = z.object({
  id: z.uuid(),
  storeName: z.string().nullable(),
  purchasedOn: z.string(),
  totalOre: z.number().int().nonnegative(),
  source: z.enum(PURCHASE_SOURCES),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Spec 10 (FR-HH-007): who registered the purchase. */
  createdBy: creatorRefSchema,
  /** Empty for a purchase registered with only a total. */
  lines: z.array(purchaseLineResponseSchema),
});
export type PurchaseResponse = z.infer<typeof purchaseResponseSchema>;

export const purchaseListItemSchema = z.object({
  id: z.uuid(),
  storeName: z.string().nullable(),
  purchasedOn: z.string(),
  totalOre: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
  /** How many inventory batches came from this purchase. */
  batchCount: z.number().int().nonnegative(),
});
export type PurchaseListItem = z.infer<typeof purchaseListItemSchema>;

export const purchaseListResponseSchema = z.object({
  /** "YYYY-MM". */
  month: z.string(),
  /** Latest purchase date first. */
  purchases: z.array(purchaseListItemSchema),
});
export type PurchaseListResponse = z.infer<typeof purchaseListResponseSchema>;

/** What happened to the inventory when a purchase was deleted (spec 04, FR-BUD-005). */
export const deletePurchaseResponseSchema = z.object({
  removedBatches: z.number().int().nonnegative(),
  keptBatches: z.number().int().nonnegative(),
});
export type DeletePurchaseResponse = z.infer<typeof deletePurchaseResponseSchema>;

export const budgetResponseSchema = z.object({
  /** The budget for the current month, or null if none is set. */
  amountOre: z.number().int().positive().nullable(),
  /** The first day of the month it has applied from ("YYYY-MM-DD"), or null. */
  validFrom: z.string().nullable(),
});
export type BudgetResponse = z.infer<typeof budgetResponseSchema>;

export const budgetSummarySchema = z.object({
  /** "YYYY-MM", in Norwegian time. */
  month: z.string(),
  budgetOre: z.number().int().positive().nullable(),
  /** Food lines + purchases with only a total. Not non-food. */
  spentOre: z.number().int().nonnegative(),
  /** Budget − spent; negative when over budget. null without a budget. */
  remainingOre: z.number().int().nullable(),
  /** floor(spent × 100 / budget). null without a budget. */
  usedPercent: z.number().int().nonnegative().nullable(),
  /** Food per category, largest first. */
  byCategory: z.array(
    z.object({ categoryKey: z.enum(CATEGORY_KEYS), amountOre: z.number().int().nonnegative() }),
  ),
  /** Purchases registered with only a total ("Ikke fordelt"). */
  unallocatedOre: z.number().int().nonnegative(),
  /** Non-food lines, shown on their own and not counted as spent. */
  nonFoodOre: z.number().int().nonnegative(),
  purchaseCount: z.number().int().nonnegative(),
});
export type BudgetSummary = z.infer<typeof budgetSummarySchema>;
