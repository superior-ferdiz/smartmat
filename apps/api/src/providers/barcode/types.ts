import type { BaseUnit, CategoryKey } from '@smartmat/shared';

/*
 * External barcode lookup (spec 07, ADR-0014). The API only talks to Open Food Facts through this interface,
 * so the tests use a fake one and the app keeps working when the service is down (NFR-REL-001).
 */

/** What we keep of a product: already cleaned and in our units. */
export interface ProviderProduct {
  name: string | null;
  brand: string | null;
  packageQuantityBase: number | null;
  packageUnit: BaseUnit | null;
  categoryKey: CategoryKey | null;
}

export const UNAVAILABLE_REASONS = [
  'disabled',
  'timeout',
  'network',
  'httpError',
  'invalidResponse',
  'rateLimited',
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export type BarcodeLookupResult =
  | { status: 'found'; product: ProviderProduct }
  | { status: 'notFound' }
  | { status: 'unavailable'; reason: UnavailableReason };

export interface BarcodeProvider {
  /** `gtin` is always a valid, normalized GTIN (8, 13 or 14 digits). */
  lookup(gtin: string): Promise<BarcodeLookupResult>;
}

/** Used when no User-Agent is configured (OFF requires one): every lookup is "unavailable". */
export const disabledBarcodeProvider: BarcodeProvider = {
  lookup: () => Promise.resolve({ status: 'unavailable', reason: 'disabled' }),
};
