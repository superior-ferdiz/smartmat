import type { BaseUnit, PriceSource } from '@smartmat/shared';
import type { UnavailableReason } from '../barcode/types';

/*
 * External prices (spec 12, ADR-0020). The API only talks to Kassalapp through this interface, so the tests use a
 * fake fetch and the app keeps working without a key or when the service is down (NFR-REL-001).
 */

/** One chain's latest price for a GTIN, already validated and in our units. */
export interface ProviderPriceObservation {
  chainCode: string;
  chainName: string;
  priceOre: number;
  packageQuantityBase: number | null;
  packageUnit: BaseUnit | null;
  observedAt: Date;
  sourceUrl: string | null;
}

export type PriceLookupResult =
  | { status: 'found'; observations: ProviderPriceObservation[] }
  | { status: 'notFound' }
  | { status: 'unavailable'; reason: UnavailableReason };

export interface PriceProvider {
  readonly source: PriceSource;
  /** False when no key is configured: the service is never asked (status "off"). */
  readonly enabled: boolean;
  /** `gtin` is always a valid, normalized GTIN (8, 13 or 14 digits) and never a store's own code. */
  lookup(gtin: string): Promise<PriceLookupResult>;
}

/** Used when KASSALAPP_API_KEY is not set. */
export const disabledPriceProvider: PriceProvider = {
  source: 'kassalapp',
  enabled: false,
  lookup: () => Promise.resolve({ status: 'unavailable', reason: 'disabled' }),
};
