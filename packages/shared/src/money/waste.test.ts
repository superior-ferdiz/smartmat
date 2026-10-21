import { describe, expect, it } from 'vitest';
import { estimateWasteValueOre } from './waste';

describe('FR-INV-007 estimateWasteValueOre (whole øre, half up)', () => {
  it.each([
    [2490, 250, 1000, 623], // 622,5 → 623
    [2490, 1000, 1000, 2490],
    [1000, 333, 1000, 333],
    [100, 1, 3, 33], // 33,33 → 33
    [100, 2, 3, 67], // 66,67 → 67
    [0, 500, 1000, 0],
    [1, 1, 2, 1], // 0,5 → 1
  ])('price %i, %i of %i → %i øre', (price, discarded, initial, expected) => {
    expect(estimateWasteValueOre(price, discarded, initial)).toBe(expected);
  });

  it('stays exact for very large numbers (BigInt)', () => {
    expect(estimateWasteValueOre(999_999_999, 99_999_999, 100_000_000)).toBe(999_999_989);
  });

  it('refuses an initial quantity of 0', () => {
    expect(() => estimateWasteValueOre(100, 1, 0)).toThrow(RangeError);
  });
});
