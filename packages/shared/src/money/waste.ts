/**
 * FR-INV-007: the estimated value of discarded food, from the price of the whole batch:
 *   round(price × discarded / initial quantity), rounded half up, in whole øre.
 * BigInt keeps the multiplication exact even for large numbers (ADR-0006: no floating point).
 */
export function estimateWasteValueOre(
  batchPriceOre: number,
  discardedBase: number,
  initialBase: number,
): number {
  if (initialBase <= 0) throw new RangeError('initial quantity must be positive');
  const numerator = 2n * BigInt(batchPriceOre) * BigInt(discardedBase) + BigInt(initialBase);
  return Number(numerator / (2n * BigInt(initialBase)));
}
