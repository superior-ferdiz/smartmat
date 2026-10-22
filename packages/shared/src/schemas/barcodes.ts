import { z } from 'zod';
import { normalizeGtin } from '../barcode/gtin';
import {
  baseUnitSchema,
  batchInputSchema,
  categoryKeySchema,
  itemIngredientSchema,
  itemNameSchema,
} from './inventory';

/*
 * Request schemas for barcode scanning (phase 7, spec 07). Messages are i18n keys.
 */

/** A barcode as typed or scanned, turned into a normalized GTIN (FR-SCAN-003). Used for the URL parameter too. */
export const gtinSchema = z
  .string({ error: 'validation.barcode.required' })
  .transform((text, ctx) => {
    const result = normalizeGtin(text);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.error });
      return z.NEVER;
    }
    return { gtin: result.gtin, storeCode: result.storeCode };
  });

/**
 * FR-SCAN-005: what the user confirmed. Either a new item with its first batch, or a new batch on the item the
 * barcode was added to last time. clientRequestId is required here: a scan is easy to send twice.
 */
export const confirmScanSchema = z.discriminatedUnion(
  'mode',
  [
    z.object({
      mode: z.literal('newItem'),
      clientRequestId: z.uuid(),
      name: itemNameSchema,
      categoryKey: categoryKeySchema,
      unit: baseUnitSchema,
      ingredient: itemIngredientSchema,
      batch: batchInputSchema,
    }),
    z.object({
      mode: z.literal('existingItem'),
      clientRequestId: z.uuid(),
      itemId: z.uuid(),
      batch: batchInputSchema,
    }),
  ],
  { error: 'validation.unknown' },
);
export type ConfirmScanInput = z.input<typeof confirmScanSchema>;
export type ConfirmScanBody = z.output<typeof confirmScanSchema>;
