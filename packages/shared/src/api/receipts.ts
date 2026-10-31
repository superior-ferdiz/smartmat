import { z } from 'zod';
import { RECEIPT_CHAINS } from '../receipts/chains';
import { PARSED_LINE_FLAGS, PARSED_LINE_KINDS } from '../receipts/parse';
import { PURCHASE_LINE_KINDS } from '../schemas/purchases';

/* Response shapes for receipts (phase 8, spec 08). */

export const RECEIPT_STATUSES = ['queued', 'processing', 'review', 'failed', 'confirmed'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const RECEIPT_FAILURES = ['timeout', 'unavailable', 'invalidResponse', 'noText'] as const;
export type ReceiptFailure = (typeof RECEIPT_FAILURES)[number];

/** The form field the image is sent in (multipart/form-data). */
export const RECEIPT_IMAGE_FIELD = 'image';

const ore = z.number().int();

export const parsedReceiptLineSchema = z.object({
  description: z.string(),
  amountOre: ore.nonnegative().nullable(),
  kind: z.enum(PARSED_LINE_KINDS),
  discountOre: ore.nonnegative(),
  count: z.number().int().positive().nullable(),
  weightG: z.number().int().positive().nullable(),
  unitPriceOre: ore.nonnegative().nullable(),
  vatRate: z.number().int().nullable(),
  suggestedKind: z.enum(PURCHASE_LINE_KINDS),
  confidence: z.number().int().min(0).max(100),
  flags: z.array(z.enum(PARSED_LINE_FLAGS)),
  uncertain: z.boolean(),
});
export type ParsedReceiptLineResponse = z.infer<typeof parsedReceiptLineSchema>;

/**
 * What the form is filled in with. Spec 08 / ADR-0017: by default only store, date and total; the lines only
 * when line suggestions are switched on (`linesShown`).
 */
export const receiptSuggestionSchema = z.object({
  storeName: z.string().nullable(),
  /**
   * The chain could not be read (the logo is often a picture): storeName is the chain of the same receipt format
   * the household bought from last, and the page says it is a guess.
   */
  storeGuessed: z.boolean(),
  chain: z.enum(RECEIPT_CHAINS).nullable(),
  purchasedOn: z.iso.date().nullable(),
  totalOre: ore.nonnegative().nullable(),
  linesShown: z.boolean(),
  lines: z.array(parsedReceiptLineSchema),
  linesSumOre: ore,
  sumMatches: z.boolean(),
});
export type ReceiptSuggestion = z.infer<typeof receiptSuggestionSchema>;

export const receiptSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum(RECEIPT_STATUSES),
  failureCode: z.enum(RECEIPT_FAILURES).nullable(),
  createdAt: z.iso.datetime(),
  deleteAfter: z.iso.datetime(),
});
export type ReceiptSummary = z.infer<typeof receiptSummarySchema>;

export const receiptResponseSchema = receiptSummarySchema.extend({
  purchaseId: z.uuid().nullable(),
  suggestion: receiptSuggestionSchema.nullable(),
  /** The text OCR read, one entry per line, without the payment lines. Only while in review. */
  rawText: z.array(z.string()).nullable(),
  meanConfidence: z.number().int().min(0).max(100).nullable(),
});
export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

export const receiptListResponseSchema = z.object({
  /** False when no OCR is set up on the server: the page offers the manual form instead (NFR-REL-002). */
  ocrAvailable: z.boolean(),
  lineSuggestions: z.boolean(),
  receipts: z.array(receiptSummarySchema),
});
export type ReceiptListResponse = z.infer<typeof receiptListResponseSchema>;
