import type { CategoryKey } from '../schemas/inventory';
import type { PurchaseLineKind } from '../schemas/purchases';

/*
 * FR-BUD-004: the month's figures, from sums the database has already added up per category.
 * Pure functions on whole øre (ADR-0006), so every rule can be unit tested. Percentages use BigInt so that
 * spent × 100 is exact however large the numbers get.
 */

/** Adds whole øre amounts; refuses anything that is not a safe integer instead of losing precision. */
export function sumOre(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount)) throw new RangeError('amount is not a whole number of øre');
    total += amount;
    if (!Number.isSafeInteger(total)) throw new RangeError('sum is too large');
  }
  return total;
}

/** floor(spent × 100 / budget): 99,99 % is 99 %, so "100 %" is only shown when the budget is really used up. */
export function usedPercent(spentOre: number, budgetOre: number): number {
  if (budgetOre <= 0) throw new RangeError('budget must be positive');
  return Number((BigInt(spentOre) * 100n) / BigInt(budgetOre));
}

export interface SpendingRow {
  kind: PurchaseLineKind;
  categoryKey: CategoryKey | null;
  amountOre: number;
}

export interface MonthFigures {
  budgetOre: number | null;
  spentOre: number;
  remainingOre: number | null;
  usedPercent: number | null;
  byCategory: { categoryKey: CategoryKey; amountOre: number }[];
  unallocatedOre: number;
  nonFoodOre: number;
}

/**
 * @param rows   sums of purchase lines per kind and category for the month
 * @param unallocatedOre  sum of purchases registered with only a total
 */
export function monthFigures(
  budgetOre: number | null,
  rows: readonly SpendingRow[],
  unallocatedOre: number,
): MonthFigures {
  const perCategory = new Map<CategoryKey, number>();
  const nonFood: number[] = [];
  for (const row of rows) {
    if (row.kind === 'nonFood' || row.categoryKey === null) {
      nonFood.push(row.amountOre);
    } else {
      perCategory.set(
        row.categoryKey,
        sumOre([perCategory.get(row.categoryKey) ?? 0, row.amountOre]),
      );
    }
  }
  const byCategory = [...perCategory.entries()]
    .map(([categoryKey, amountOre]) => ({ categoryKey, amountOre }))
    .filter((c) => c.amountOre > 0)
    .sort((a, b) => b.amountOre - a.amountOre || a.categoryKey.localeCompare(b.categoryKey));
  const spentOre = sumOre([...byCategory.map((c) => c.amountOre), unallocatedOre]);
  return {
    budgetOre,
    spentOre,
    remainingOre: budgetOre === null ? null : budgetOre - spentOre,
    usedPercent: budgetOre === null ? null : usedPercent(spentOre, budgetOre),
    byCategory,
    unallocatedOre,
    nonFoodOre: sumOre(nonFood),
  };
}
