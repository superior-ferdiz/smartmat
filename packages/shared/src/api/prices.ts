import { z } from 'zod';
import { BASE_UNITS } from '../quantity/quantity';
import {
  PRICE_ESTIMATE_BASES,
  PRICE_ESTIMATE_SOURCES,
  PRICE_MISSING_REASONS,
  PRICE_SOURCES,
  UNIT_PRICE_PER,
} from '../prices/rules';

/* Response shapes for prices (phase 12, spec 12). Own and external prices are always kept apart. */

export const unitPriceSchema = z.object({ ore: z.number().int(), per: z.enum(UNIT_PRICE_PER) });
export type UnitPrice = z.infer<typeof unitPriceSchema>;

/** FR-PRICE-002: where an own price came from – a purchase line, or typed on the item. */
export const OWN_PRICE_ORIGINS = ['purchase', 'item'] as const;
export type OwnPriceOrigin = (typeof OWN_PRICE_ORIGINS)[number];

export const ownPriceEntrySchema = z.object({
  batchId: z.uuid(),
  priceOre: z.number().int(),
  quantityBase: z.number().int(),
  unit: z.enum(BASE_UNITS),
  unitPrice: unitPriceSchema.nullable(),
  /** The purchase date, otherwise the day the batch was added (Norwegian date). */
  date: z.iso.date(),
  /** More than 90 days before today. */
  old: z.boolean(),
  origin: z.enum(OWN_PRICE_ORIGINS),
  storeName: z.string().nullable(),
  purchaseId: z.uuid().nullable(),
});
export type OwnPriceEntry = z.infer<typeof ownPriceEntrySchema>;

export const ownPricesSchema = z.object({
  /** The item the prices are for; null when the household has no item for the barcode. */
  item: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Newest first, at most 10. */
  entries: z.array(ownPriceEntrySchema),
});
export type OwnPrices = z.infer<typeof ownPricesSchema>;

/**
 * off: no API key (Kassalapp is never asked). notAsked: no barcode, or a store's own code.
 * unavailable: timeout, error, invalid answer or a limit (NFR-REL-001).
 */
export const EXTERNAL_PRICE_STATUSES = [
  'off',
  'notAsked',
  'found',
  'notFound',
  'unavailable',
] as const;
export type ExternalPriceStatus = (typeof EXTERNAL_PRICE_STATUSES)[number];

export const priceObservationSchema = z.object({
  source: z.enum(PRICE_SOURCES),
  chainCode: z.string(),
  chainName: z.string(),
  priceOre: z.number().int(),
  packageQuantityBase: z.number().int().nullable(),
  packageUnit: z.enum(BASE_UNITS).nullable(),
  unitPrice: unitPriceSchema.nullable(),
  /** When Kassalapp last checked the price (not when we fetched it). */
  observedAt: z.string(),
  /** Checked more than 14 days ago. */
  stale: z.boolean(),
  /** Rema 1000, Kiwi or Coop: Kassalapp no longer collects their prices. */
  uncollected: z.boolean(),
  fresh: z.boolean(),
  /** The product page on kassal.app, or null. */
  sourceUrl: z.string().nullable(),
});
export type PriceObservation = z.infer<typeof priceObservationSchema>;

export const externalPricesSchema = z.object({
  status: z.enum(EXTERNAL_PRICE_STATUSES),
  /** When we fetched what is shown; null when nothing is stored. */
  fetchedAt: z.string().nullable(),
  /** Fresh ones first (cheapest first), then the rest (newest first). */
  observations: z.array(priceObservationSchema),
  /** FR-PRICE-004: only among fresh prices. */
  cheapest: priceObservationSchema.nullable(),
  freshCount: z.number().int(),
});
export type ExternalPrices = z.infer<typeof externalPricesSchema>;

/** GET /households/:householdId/prices/:gtin */
export const barcodePricesResponseSchema = z.object({
  gtin: z.string(),
  storeCode: z.boolean(),
  own: ownPricesSchema,
  external: externalPricesSchema,
});
export type BarcodePricesResponse = z.infer<typeof barcodePricesResponseSchema>;

/** GET /households/:householdId/items/:itemId/prices */
export const itemPricesResponseSchema = z.object({
  own: ownPricesSchema,
  /** The barcode the household last put on the item, or null (then external is notAsked). */
  gtin: z.string().nullable(),
  external: externalPricesSchema,
});
export type ItemPricesResponse = z.infer<typeof itemPricesResponseSchema>;

export const lineEstimateSchema = z.object({
  shoppingItemId: z.uuid(),
  estimateOre: z.number().int().nullable(),
  source: z.enum(PRICE_ESTIMATE_SOURCES).nullable(),
  basis: z.enum(PRICE_ESTIMATE_BASES).nullable(),
  date: z.iso.date().nullable(),
  missing: z.enum(PRICE_MISSING_REASONS).nullable(),
});
export type LineEstimateResponse = z.infer<typeof lineEstimateSchema>;

/** GET /households/:householdId/shopping-list/price-estimate – open lines only (FR-PRICE-003). */
export const shoppingPriceEstimateResponseSchema = z.object({
  lines: z.array(lineEstimateSchema),
  summary: z.object({
    openLines: z.number().int(),
    estimatedLines: z.number().int(),
    missingLines: z.number().int(),
    estimatedOre: z.number().int(),
    fromOwn: z.number().int(),
    fromKassalapp: z.number().int(),
  }),
});
export type ShoppingPriceEstimateResponse = z.infer<typeof shoppingPriceEstimateResponseSchema>;
