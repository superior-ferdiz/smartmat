import { addMonths } from '../dates/dates';
import { sumOre } from '../money/budget';
import type { BaseUnit } from '../quantity/quantity';
import type { CategoryKey, WasteReason } from '../schemas/inventory';
import { BASE_UNITS } from '../quantity/quantity';
import { WASTE_REASONS } from '../schemas/inventory';

/*
 * Spec 11 (FR-WASTE-001–004): food waste statistics, computed on every read from the waste log (ADR-0007).
 * The database adds up the discards per month, reason, category, unit and value basis; these pure functions
 * turn those groups into the figures the page shows. Whole øre and whole base units only (ADR-0006).
 *
 * Honest figures: a discard with unknown value is counted but never given a value, and the share of the
 * known value that is only estimated is shown next to it.
 */

export const WASTE_VALUE_BASIS_KEYS = ['actual', 'estimated', 'unknown'] as const;
export type WasteValueBasisKey = (typeof WASTE_VALUE_BASIS_KEYS)[number];

/** The months the trend covers, the selected month included. */
export const WASTE_TREND_MONTHS = 12;

/** One group of discards, as summed by the database. */
export interface WasteGroup {
  /** "YYYY-MM" in Norwegian time. */
  month: string;
  reason: WasteReason;
  categoryKey: CategoryKey;
  unit: BaseUnit;
  basis: WasteValueBasisKey;
  count: number;
  /** Sum of the values; 0 for basis "unknown". */
  valueOre: number;
  /** Sum of the discarded quantities, positive. */
  quantityBase: number;
}

export interface WasteValue {
  count: number;
  actualOre: number;
  estimatedOre: number;
  /** actual + estimated */
  knownOre: number;
  unknownCount: number;
}

export interface WasteShare extends WasteValue {
  /** Share of the discards (by count), whole percent; all shares add up to 100. */
  percent: number;
}

export interface WasteMonthFigures extends WasteValue {
  /** floor(estimated × 100 / known), or null without a known value. */
  estimatedPercent: number | null;
  quantities: { unit: BaseUnit; quantityBase: number }[];
  byReason: ({ reason: WasteReason } & WasteShare)[];
  byCategory: ({ categoryKey: CategoryKey } & WasteShare)[];
}

export interface WasteTrendMonth extends WasteValue {
  month: string;
}

function emptyValue(): WasteValue {
  return { count: 0, actualOre: 0, estimatedOre: 0, knownOre: 0, unknownCount: 0 };
}

function addGroup(value: WasteValue, group: WasteGroup): WasteValue {
  const actualOre = group.basis === 'actual' ? group.valueOre : 0;
  const estimatedOre = group.basis === 'estimated' ? group.valueOre : 0;
  return {
    count: value.count + group.count,
    actualOre: sumOre([value.actualOre, actualOre]),
    estimatedOre: sumOre([value.estimatedOre, estimatedOre]),
    knownOre: sumOre([value.knownOre, actualOre, estimatedOre]),
    unknownCount: value.unknownCount + (group.basis === 'unknown' ? group.count : 0),
  };
}

/**
 * Whole percentages that add up to exactly 100 (largest remainder method). Each share starts at
 * floor(value × 100 / total); the points left over go to the largest remainders, ties to the earlier entry.
 * All zero when the total is 0.
 */
export function largestRemainderPercents(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return values.map(() => 0);
  const big = BigInt(total);
  const parts = values.map((value, index) => {
    const scaled = BigInt(value) * 100n;
    return { index, floor: Number(scaled / big), remainder: scaled % big };
  });
  let left = 100 - parts.reduce((sum, p) => sum + p.floor, 0);
  const order = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const result = parts.map((p) => p.floor);
  for (const part of order) {
    if (left <= 0) break;
    result[part.index] = (result[part.index] ?? 0) + 1;
    left -= 1;
  }
  return result;
}

/** floor(part × 100 / whole) in whole percent, or null when there is nothing to divide by. */
export function floorPercent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Number((BigInt(part) * 100n) / BigInt(whole));
}

/** "Under 1 %": there is something, but too little to show as a whole percent. */
export function isBelowOnePercent(part: number, whole: number): boolean {
  return part > 0 && floorPercent(part, whole) === 0;
}

function shares<K extends string>(
  groups: readonly WasteGroup[],
  keyOf: (g: WasteGroup) => K,
  order: readonly K[],
): { key: K; value: WasteShare }[] {
  const byKey = new Map<K, WasteValue>();
  for (const group of groups) {
    const key = keyOf(group);
    byKey.set(key, addGroup(byKey.get(key) ?? emptyValue(), group));
  }
  // Most discards first; equal counts by the larger known value, then in the fixed order.
  const entries = [...byKey.entries()].sort(
    ([ka, a], [kb, b]) =>
      b.count - a.count || b.knownOre - a.knownOre || order.indexOf(ka) - order.indexOf(kb),
  );
  const percents = largestRemainderPercents(entries.map(([, v]) => v.count));
  return entries.map(([key, value], i) => ({
    key,
    value: { ...value, percent: percents[i] ?? 0 },
  }));
}

/** FR-WASTE-001/002/004: the figures for one month. `groups` may contain other months; they are ignored. */
export function wasteMonthFigures(
  groups: readonly WasteGroup[],
  month: string,
  categoryOrder: readonly CategoryKey[],
): WasteMonthFigures {
  const own = groups.filter((g) => g.month === month);
  const total = own.reduce(addGroup, emptyValue());
  const quantities = BASE_UNITS.map((unit) => ({
    unit,
    quantityBase: own.filter((g) => g.unit === unit).reduce((sum, g) => sum + g.quantityBase, 0),
  })).filter((q) => q.quantityBase > 0);
  return {
    ...total,
    estimatedPercent: floorPercent(total.estimatedOre, total.knownOre),
    quantities,
    byReason: shares(own, (g) => g.reason, WASTE_REASONS).map(({ key, value }) => ({
      reason: key,
      ...value,
    })),
    byCategory: shares(own, (g) => g.categoryKey, categoryOrder).map(({ key, value }) => ({
      categoryKey: key,
      ...value,
    })),
  };
}

/** FR-WASTE-003: `months` months up to and including `endMonth`, oldest first; months without waste are 0. */
export function wasteTrend(
  groups: readonly WasteGroup[],
  endMonth: string,
  months = WASTE_TREND_MONTHS,
): WasteTrendMonth[] {
  const result: WasteTrendMonth[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const month = addMonths(endMonth, -i);
    const value = groups.filter((g) => g.month === month).reduce(addGroup, emptyValue());
    result.push({ month, ...value });
  }
  return result;
}

/** The first month of the trend that ends with `endMonth` (for the database query). */
export function wasteTrendStart(endMonth: string, months = WASTE_TREND_MONTHS): string {
  return addMonths(endMonth, -(months - 1));
}
