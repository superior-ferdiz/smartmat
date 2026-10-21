import { z } from 'zod';
import { oreAmountSchema } from './common';
import {
  baseUnitSchema,
  categoryKeySchema,
  expirySchema,
  isoDateSchema,
  locationIdSchema,
  quantityBaseSchema,
} from './inventory';

/*
 * Request schemas for purchases and the food budget (phase 4, spec 04). Amounts arrive as whole øre
 * (ADR-0006); the forms turn "49,90" into 4990 with oreInputSchema before sending.
 * The limits are repeated as CHECK constraints in the migration. Messages are i18n keys.
 */

export const PURCHASE_LINE_KINDS = ['food', 'nonFood'] as const;
export type PurchaseLineKind = (typeof PURCHASE_LINE_KINDS)[number];

/** 100 000 kr per line. */
export const MAX_LINE_ORE = 10_000_000;
/** 1 000 000 kr per purchase (also the sum of its lines). */
export const MAX_PURCHASE_ORE = 100_000_000;
/** The monthly food budget: 1 kr – 1 000 000 kr. */
export const MIN_BUDGET_ORE = 100;
export const MAX_BUDGET_ORE = 100_000_000;
export const MAX_PURCHASE_LINES = 100;
export const STORE_NAME_MAX_LENGTH = 100;
export const LINE_DESCRIPTION_MAX_LENGTH = 100;
export const EARLIEST_PURCHASE_DATE = '2000-01-01';

/** Optional store name; empty text means "no store". */
export const storeNameSchema = z
  .string()
  .trim()
  .max(STORE_NAME_MAX_LENGTH, { error: 'validation.storeName.tooLong' })
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

export const purchaseDateSchema = isoDateSchema.refine((date) => date >= EARLIEST_PURCHASE_DATE, {
  error: 'validation.purchase.dateTooEarly',
});

export const lineDescriptionSchema = z
  .string({ error: 'validation.lineDescription.required' })
  .trim()
  .min(1, { error: 'validation.lineDescription.required' })
  .max(LINE_DESCRIPTION_MAX_LENGTH, { error: 'validation.lineDescription.tooLong' });

export const lineAmountSchema = oreAmountSchema.max(MAX_LINE_ORE, {
  error: 'validation.purchase.lineTooLarge',
});

/**
 * FR-BUD-002: put a food line into the inventory, as a new batch of an existing item (itemId) or as a new
 * item named after the line (then the unit is needed). The price and purchase date come from the purchase.
 */
export const lineToInventorySchema = z
  .object({
    itemId: z.uuid({ error: 'validation.purchase.itemNotFound' }).nullable().optional(),
    unit: baseUnitSchema.optional(),
    quantityBase: quantityBaseSchema,
    locationId: locationIdSchema,
    expiry: expirySchema.optional(),
  })
  .refine((value) => Boolean(value.itemId) || value.unit !== undefined, {
    error: 'validation.unit.required',
    path: ['unit'],
  });
export type LineToInventoryInput = z.input<typeof lineToInventorySchema>;

const lineFields = {
  description: lineDescriptionSchema,
  kind: z.enum(PURCHASE_LINE_KINDS, { error: 'validation.lineKind.required' }),
  categoryKey: categoryKeySchema.nullable().optional(),
  amountOre: lineAmountSchema,
  toInventory: lineToInventorySchema.nullable().optional(),
};

type LineShape = {
  kind: PurchaseLineKind;
  categoryKey?: string | null | undefined;
  toInventory?: unknown;
};

/** Food has a category and may go into the inventory; non-food has neither (CHECK in the database too). */
function checkLine(line: LineShape, ctx: z.RefinementCtx) {
  if (line.kind === 'food' && !line.categoryKey) {
    ctx.addIssue({
      code: 'custom',
      path: ['categoryKey'],
      message: 'validation.category.required',
    });
  }
  if (line.kind === 'nonFood' && line.categoryKey) {
    ctx.addIssue({
      code: 'custom',
      path: ['categoryKey'],
      message: 'validation.purchase.nonFoodCategory',
    });
  }
  if (line.kind === 'nonFood' && line.toInventory) {
    ctx.addIssue({
      code: 'custom',
      path: ['toInventory'],
      message: 'validation.purchase.nonFoodInventory',
    });
  }
}

export const newPurchaseLineSchema = z.object(lineFields).superRefine(checkLine);
/** When correcting a purchase, existing lines keep their id; lines without one are new. */
export const purchaseLineSchema = z
  .object({ id: z.uuid().optional(), ...lineFields })
  .superRefine(checkLine);
export type PurchaseLineInput = z.input<typeof purchaseLineSchema>;

const purchaseFields = {
  storeName: storeNameSchema,
  purchasedOn: purchaseDateSchema,
  /** Only for a purchase without lines; with lines the server computes the total. */
  totalOre: oreAmountSchema
    .max(MAX_PURCHASE_ORE, { error: 'validation.purchase.totalTooLarge' })
    .nullable()
    .optional(),
};

/** FR-BUD-001: lines OR a total, never both, and the lines may not add up to more than the limit. */
function checkPurchase(
  purchase: { lines: { amountOre: number }[]; totalOre?: number | null | undefined },
  ctx: z.RefinementCtx,
) {
  const hasTotal = purchase.totalOre !== null && purchase.totalOre !== undefined;
  if (purchase.lines.length === 0 && !hasTotal) {
    ctx.addIssue({
      code: 'custom',
      path: ['totalOre'],
      message: 'validation.purchase.linesOrTotal',
    });
  }
  if (purchase.lines.length > 0 && hasTotal) {
    ctx.addIssue({
      code: 'custom',
      path: ['totalOre'],
      message: 'validation.purchase.totalWithLines',
    });
  }
  // Each line is at most MAX_LINE_ORE and there are at most 100, so this sum is a safe integer.
  const sum = purchase.lines.reduce((total, line) => total + line.amountOre, 0);
  if (sum > MAX_PURCHASE_ORE) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'validation.purchase.totalTooLarge' });
  }
}

const linesSchema = <T extends z.ZodType>(line: T) =>
  z.array(line).max(MAX_PURCHASE_LINES, { error: 'validation.purchase.tooManyLines' }).default([]);

export const createPurchaseSchema = z
  .object({
    ...purchaseFields,
    lines: linesSchema(newPurchaseLineSchema),
    /** Random id from the form, so sending the same form twice gives one purchase (NFR-DATA-002). */
    clientRequestId: z.uuid().optional(),
  })
  .superRefine(checkPurchase);
export type CreatePurchaseInput = z.input<typeof createPurchaseSchema>;
export type CreatePurchaseBody = z.output<typeof createPurchaseSchema>;

export const updatePurchaseSchema = z
  .object({
    ...purchaseFields,
    lines: linesSchema(purchaseLineSchema),
    /** Spec 04 decision 2: untouched batches of removed lines are removed too, unless this is false. */
    removeUntouchedBatches: z.boolean().default(true),
  })
  .superRefine(checkPurchase);
export type UpdatePurchaseInput = z.input<typeof updatePurchaseSchema>;
export type UpdatePurchaseBody = z.output<typeof updatePurchaseSchema>;

export const deletePurchaseQuerySchema = z.object({
  removeUntouchedBatches: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

/** "2026-10". */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'validation.month.invalid' });

export const monthQuerySchema = z.object({ month: monthSchema.optional() });

/** FR-BUD-003: the monthly food budget, or null to remove it. */
export const budgetInputSchema = z.object({
  amountOre: oreAmountSchema
    .min(MIN_BUDGET_ORE, { error: 'validation.budget.tooSmall' })
    .max(MAX_BUDGET_ORE, { error: 'validation.budget.tooLarge' })
    .nullable(),
});
export type BudgetInput = z.input<typeof budgetInputSchema>;
