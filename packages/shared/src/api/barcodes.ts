import { z } from 'zod';
import { EXPIRY_KINDS } from '../quantity/expiry';
import { BASE_UNITS } from '../quantity/quantity';
import { INGREDIENT_MATCH_MODES } from '../recipes/matching';
import { CATEGORY_KEYS } from '../schemas/inventory';
import { itemResponseSchema } from './inventory';

/* Response shapes for barcode scanning (phase 7, spec 07). */

/** Where the suggestion came from: the household's own answer, Open Food Facts, or nowhere. */
export const SCAN_SOURCES = ['household', 'openFoodFacts', 'none'] as const;
export type ScanSource = (typeof SCAN_SOURCES)[number];

/**
 * What happened with Open Food Facts. notAsked: the household knew the code, or it is a store's own code.
 * unavailable: timeout, error, invalid answer or our own limit (NFR-REL-001) – the user fills in the form.
 */
export const PROVIDER_STATUSES = ['notAsked', 'found', 'notFound', 'unavailable'] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const scanSuggestionSchema = z.object({
  name: z.string().nullable(),
  /** Shown in the form, not saved on the item. */
  brand: z.string().nullable(),
  categoryKey: z.enum(CATEGORY_KEYS).nullable(),
  unit: z.enum(BASE_UNITS).nullable(),
  quantityBase: z.number().int().positive().nullable(),
  /** Only from the household's own answer. */
  ingredient: z
    .object({ match: z.enum(INGREDIENT_MATCH_MODES), ingredientId: z.uuid().nullable() })
    .nullable(),
  locationId: z.uuid().nullable(),
  expiryKind: z.enum(EXPIRY_KINDS).nullable(),
});
export type ScanSuggestion = z.infer<typeof scanSuggestionSchema>;

export const barcodeLookupResponseSchema = z.object({
  gtin: z.string(),
  storeCode: z.boolean(),
  source: z.enum(SCAN_SOURCES),
  providerStatus: z.enum(PROVIDER_STATUSES),
  suggestion: scanSuggestionSchema,
  /** The item the barcode was added to last time, if it still exists. */
  existingItem: z.object({ id: z.uuid(), name: z.string(), unit: z.enum(BASE_UNITS) }).nullable(),
});
export type BarcodeLookupResponse = z.infer<typeof barcodeLookupResponseSchema>;

export const confirmScanResponseSchema = z.object({ item: itemResponseSchema });
export type ConfirmScanResponse = z.infer<typeof confirmScanResponseSchema>;
