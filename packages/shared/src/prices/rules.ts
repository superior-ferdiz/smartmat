import { daysBetween } from '../dates/dates';
import type { BaseUnit } from '../quantity/quantity';

/*
 * Prices (phase 12, spec 12, ADR-0020). Pure rules used by the API and the web app.
 * Money stays in whole øre (ADR-0006): divisions round half up with BigInt, like the waste value (FR-INV-007).
 * The only floating-point number is the kroner amount Kassalapp sends, turned into øre once by kronerToOre.
 */

/** Where an external price came from. Only Kassalapp for now. */
export const PRICE_SOURCES = ['kassalapp'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

/** What a unit price is per: grams give per kg, millilitres per litre, pieces per piece. */
export const UNIT_PRICE_PER = ['kg', 'l', 'stk'] as const;
export type UnitPricePer = (typeof UNIT_PRICE_PER)[number];

/** Kassalapp's own limit: a price not checked for 14 days is out of date (spec 12). */
export const STALE_PRICE_DAYS = 14;
/** Own prices older than this are marked (decision 6 in spec 12). */
export const OLD_OWN_PRICE_DAYS = 90;
/** 100 000 kr. Anything above is not a grocery price and is refused. */
export const MAX_PRICE_ORE = 10_000_000;

const DAY_MS = 24 * 60 * 60_000;

/** round(numerator / denominator), half up, for non-negative numbers. */
function divideHalfUp(numerator: bigint, denominator: bigint): number {
  return Number((2n * numerator + denominator) / (2n * denominator));
}

/** Øre per kg, per litre or per piece. Null without a positive quantity. */
export function unitPriceOre(
  priceOre: number,
  quantityBase: number | null,
  unit: BaseUnit | null,
): { ore: number; per: UnitPricePer } | null {
  if (quantityBase === null || unit === null || quantityBase <= 0 || priceOre < 0) return null;
  if (unit === 'stk')
    return { ore: divideHalfUp(BigInt(priceOre), BigInt(quantityBase)), per: 'stk' };
  const ore = divideHalfUp(BigInt(priceOre) * 1000n, BigInt(quantityBase));
  return { ore, per: unit === 'g' ? 'kg' : 'l' };
}

/** The price of `wanted` when `packageQuantity` costs `priceOre` (same unit), half up. */
export function scalePriceOre(priceOre: number, wanted: number, packageQuantity: number): number {
  if (packageQuantity <= 0) throw new RangeError('package quantity must be positive');
  return divideHalfUp(BigInt(priceOre) * BigInt(wanted), BigInt(packageQuantity));
}

/**
 * Kassalapp sends kroner as a JSON number (72.9). Multiplying by 100 gives 7290.000000000001, so the result is
 * rounded – but only when the number really has at most two decimals. Anything else is not a price we trust.
 */
export function kronerToOre(kroner: unknown): number | null {
  if (typeof kroner !== 'number' || !Number.isFinite(kroner) || kroner < 0) return null;
  const scaled = kroner * 100;
  const ore = Math.round(scaled);
  if (Math.abs(scaled - ore) > 1e-6 || ore > MAX_PRICE_ORE) return null;
  return ore;
}

/** Checked more than 14 days ago. Exactly 14 days is still fresh. */
export function isStalePrice(observedAt: Date, now: Date): boolean {
  return now.getTime() - observedAt.getTime() > STALE_PRICE_DAYS * DAY_MS;
}

/** An own price from more than 90 days before today (Norwegian dates). */
export function isOldOwnPrice(date: string, today: string): boolean {
  return daysBetween(date, today) > OLD_OWN_PRICE_DAYS;
}

/**
 * Chains whose prices Kassalapp no longer collects (Rema 1000, Kiwi and Coop, see integrations/kassalapp.md).
 * Their old prices stay in Kassalapp's database and must never look current.
 */
export function isUncollectedChain(chainCode: string): boolean {
  return chainCode === 'REMA_1000' || chainCode === 'KIWI' || chainCode.startsWith('COOP');
}

export interface FreshnessInput {
  chainCode: string;
  observedAt: Date;
}

/** Fresh = checked within 14 days, from a chain Kassalapp still collects. */
export function isFreshObservation(observation: FreshnessInput, now: Date): boolean {
  return !isUncollectedChain(observation.chainCode) && !isStalePrice(observation.observedAt, now);
}

/** FR-PRICE-004: the lowest fresh price; a tie goes to the chain first in the alphabet. */
export function cheapestFresh<T extends { chainName: string; priceOre: number; fresh: boolean }>(
  observations: readonly T[],
): T | null {
  let best: T | null = null;
  for (const observation of observations) {
    if (!observation.fresh) continue;
    if (
      !best ||
      observation.priceOre < best.priceOre ||
      (observation.priceOre === best.priceOre &&
        observation.chainName.localeCompare(best.chainName, 'nb') < 0)
    ) {
      best = observation;
    }
  }
  return best;
}

/** The lower median: the middle one, or the cheaper of the two in the middle. */
export function lowerMedian<T extends { priceOre: number }>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.priceOre - b.priceOre);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

/* Shopping list estimate (FR-PRICE-003). */

export const PRICE_ESTIMATE_SOURCES = ['own', 'kassalapp'] as const;
export type PriceEstimateSource = (typeof PRICE_ESTIMATE_SOURCES)[number];

/** scaled: from the line's amount. lastTime: the whole price paid last time. onePackage: one package. */
export const PRICE_ESTIMATE_BASES = ['scaled', 'lastTime', 'onePackage'] as const;
export type PriceEstimateBasis = (typeof PRICE_ESTIMATE_BASES)[number];

/** noMatch: no item in the household for the line. noPrice: items, but no price. unitMismatch: other unit. */
export const PRICE_MISSING_REASONS = ['noMatch', 'noPrice', 'unitMismatch'] as const;
export type PriceMissingReason = (typeof PRICE_MISSING_REASONS)[number];

export interface EstimateLineInput {
  quantityBase: number | null;
  unit: BaseUnit | null;
}

/** The newest own batch with a price among the items that match the line. */
export interface OwnPriceCandidate {
  priceOre: number;
  quantityBase: number;
  unit: BaseUnit;
  date: string;
}

/** A fresh external observation for a barcode on one of the matching items. */
export interface ExternalPriceCandidate {
  priceOre: number;
  packageQuantityBase: number | null;
  packageUnit: BaseUnit | null;
  date: string;
}

export type LineEstimate =
  | {
      estimateOre: number;
      source: PriceEstimateSource;
      basis: PriceEstimateBasis;
      date: string;
      missing: null;
    }
  | { estimateOre: null; source: null; basis: null; date: null; missing: PriceMissingReason };

const missing = (reason: PriceMissingReason): LineEstimate => ({
  estimateOre: null,
  source: null,
  basis: null,
  date: null,
  missing: reason,
});

/**
 * One line: own price first, then Kassalapp (lower median of the fresh prices). Without an amount on the line,
 * the whole price from last time or one package. A different unit cannot be compared and gives no estimate.
 */
export function estimateLine(
  line: EstimateLineInput,
  matched: boolean,
  own: OwnPriceCandidate | null,
  external: readonly ExternalPriceCandidate[],
): LineEstimate {
  if (!matched) return missing('noMatch');
  let unitMismatch = false;

  if (own) {
    if (line.quantityBase === null) {
      return {
        estimateOre: own.priceOre,
        source: 'own',
        basis: 'lastTime',
        date: own.date,
        missing: null,
      };
    }
    if (line.unit === own.unit) {
      return {
        estimateOre: scalePriceOre(own.priceOre, line.quantityBase, own.quantityBase),
        source: 'own',
        basis: 'scaled',
        date: own.date,
        missing: null,
      };
    }
    unitMismatch = true;
  }

  const chosen = lowerMedian(external);
  if (chosen) {
    if (line.quantityBase === null) {
      return {
        estimateOre: chosen.priceOre,
        source: 'kassalapp',
        basis: 'onePackage',
        date: chosen.date,
        missing: null,
      };
    }
    if (
      chosen.packageQuantityBase !== null &&
      chosen.packageQuantityBase > 0 &&
      chosen.packageUnit === line.unit
    ) {
      return {
        estimateOre: scalePriceOre(chosen.priceOre, line.quantityBase, chosen.packageQuantityBase),
        source: 'kassalapp',
        basis: 'scaled',
        date: chosen.date,
        missing: null,
      };
    }
    unitMismatch = true;
  }
  return missing(unitMismatch ? 'unitMismatch' : 'noPrice');
}

export interface ShoppingEstimateSummary {
  openLines: number;
  estimatedLines: number;
  missingLines: number;
  /** The sum of the lines that have an estimate. Never a total for the whole list. */
  estimatedOre: number;
  fromOwn: number;
  fromKassalapp: number;
}

/** Sums only the lines with an estimate; a missing price is unknown, never 0. */
export function summarizeEstimates(lines: readonly LineEstimate[]): ShoppingEstimateSummary {
  let estimatedOre = 0;
  let estimatedLines = 0;
  let fromOwn = 0;
  let fromKassalapp = 0;
  for (const line of lines) {
    if (line.estimateOre === null) continue;
    estimatedOre += line.estimateOre;
    estimatedLines += 1;
    if (line.source === 'own') fromOwn += 1;
    else fromKassalapp += 1;
  }
  return {
    openLines: lines.length,
    estimatedLines,
    missingLines: lines.length - estimatedLines,
    estimatedOre,
    fromOwn,
    fromKassalapp,
  };
}
