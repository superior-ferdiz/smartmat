import { z } from 'zod';
import { checkPurchase, linesSchema, newPurchaseLineSchema, purchaseFields } from './purchases';

/*
 * Confirming a receipt (spec 08 FR-RCPT-006): the same fields and rules as a manual purchase (spec 04), because
 * the user has corrected the suggestion into an ordinary purchase. Nothing from the OCR is trusted as is.
 */
export const confirmReceiptSchema = z
  .object({
    ...purchaseFields,
    lines: linesSchema(newPurchaseLineSchema),
    /** FR-RCPT-007: save even though a purchase with the same date and total exists. */
    allowPossibleDuplicate: z.boolean().default(false),
  })
  .superRefine(checkPurchase);
export type ConfirmReceiptInput = z.input<typeof confirmReceiptSchema>;
export type ConfirmReceiptBody = z.output<typeof confirmReceiptSchema>;
