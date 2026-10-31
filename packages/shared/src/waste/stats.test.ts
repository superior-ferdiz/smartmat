import { describe, expect, it } from 'vitest';
import { CATEGORY_KEYS } from '../schemas/inventory';
import {
  floorPercent,
  isBelowOnePercent,
  largestRemainderPercents,
  wasteMonthFigures,
  wasteTrend,
  wasteTrendStart,
  type WasteGroup,
} from './stats';

function group(partial: Partial<WasteGroup>): WasteGroup {
  return {
    month: '2026-10',
    reason: 'expired',
    categoryKey: 'dairy',
    unit: 'ml',
    basis: 'estimated',
    count: 1,
    valueOre: 0,
    quantityBase: 100,
    ...partial,
  };
}

describe('FR-WASTE-002 largestRemainderPercents', () => {
  it('always adds up to exactly 100', () => {
    expect(largestRemainderPercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(largestRemainderPercents([2, 1])).toEqual([67, 33]);
    expect(largestRemainderPercents([1, 2, 3, 4, 5, 6, 7])).toEqual([4, 7, 11, 14, 18, 21, 25]);
    for (const values of [[1, 1, 1], [7, 3, 1], [1, 1, 1, 1, 1, 1], [999, 1], [5]]) {
      expect(largestRemainderPercents(values).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it('gives the left-over points to the largest remainders, ties to the earlier entry', () => {
    // 1/6 = 16,67 % each: floor 16 × 6 = 96, four points left for the first four.
    expect(largestRemainderPercents([1, 1, 1, 1, 1, 1])).toEqual([17, 17, 17, 17, 16, 16]);
    // 99,9 % and 0,1 %: the one point left goes to the larger remainder (0,9 > 0,1).
    expect(largestRemainderPercents([999, 1])).toEqual([100, 0]);
    // 99,5 % and 0,5 %: equal remainders, so the earlier entry gets it.
    expect(largestRemainderPercents([995, 5])).toEqual([100, 0]);
    expect(largestRemainderPercents([5, 995])).toEqual([1, 99]);
  });

  it('is all zero when there is nothing', () => {
    expect(largestRemainderPercents([0, 0])).toEqual([0, 0]);
    expect(largestRemainderPercents([])).toEqual([]);
  });

  it('stays exact for very large numbers', () => {
    expect(largestRemainderPercents([Number.MAX_SAFE_INTEGER, 0])).toEqual([100, 0]);
  });
});

describe('FR-WASTE-004 floorPercent and "under 1 %"', () => {
  it('rounds down in whole percent', () => {
    expect(floorPercent(180_00, 312_00)).toBe(57); // 57,69 %
    expect(floorPercent(312_00, 312_00)).toBe(100);
    expect(floorPercent(0, 312_00)).toBe(0);
    expect(floorPercent(1, 0)).toBeNull();
  });

  it('says "under 1 %" only when there is something below one percent', () => {
    expect(isBelowOnePercent(1, 1000)).toBe(true);
    expect(isBelowOnePercent(10, 1000)).toBe(false);
    expect(isBelowOnePercent(0, 1000)).toBe(false);
    expect(isBelowOnePercent(1, 0)).toBe(false);
  });
});

describe('FR-WASTE-001/004 wasteMonthFigures', () => {
  const groups: WasteGroup[] = [
    group({ basis: 'actual', count: 2, valueOre: 5_000, quantityBase: 1_500 }),
    group({ basis: 'estimated', count: 3, valueOre: 7_990, quantityBase: 2_400, unit: 'g' }),
    group({
      basis: 'unknown',
      count: 4,
      valueOre: 0,
      quantityBase: 6,
      unit: 'stk',
      reason: 'spoiled',
      categoryKey: 'fruitVeg',
    }),
    // Another month: ignored.
    group({ month: '2026-09', basis: 'actual', count: 9, valueOre: 99_999 }),
  ];
  const figures = wasteMonthFigures(groups, '2026-10', CATEGORY_KEYS);

  it('keeps actual, estimated and unknown apart, and never gives unknown a value', () => {
    expect(figures).toMatchObject({
      count: 9,
      actualOre: 5_000,
      estimatedOre: 7_990,
      knownOre: 12_990,
      unknownCount: 4,
      estimatedPercent: 61, // 7990 / 12990 = 61,5 %
    });
  });

  it('keeps quantities per unit, never added across units', () => {
    expect(figures.quantities).toEqual([
      { unit: 'g', quantityBase: 2_400 },
      { unit: 'ml', quantityBase: 1_500 },
      { unit: 'stk', quantityBase: 6 },
    ]);
  });

  it('shares by count (value can be missing), most first, adding up to 100', () => {
    expect(figures.byReason.map((r) => [r.reason, r.count, r.knownOre, r.percent])).toEqual([
      ['expired', 5, 12_990, 56],
      ['spoiled', 4, 0, 44],
    ]);
    expect(figures.byCategory.map((c) => [c.categoryKey, c.percent])).toEqual([
      ['dairy', 56],
      ['fruitVeg', 44],
    ]);
  });

  it('breaks equal counts by known value, then by the fixed order', () => {
    const tie = wasteMonthFigures(
      [
        group({ reason: 'other', categoryKey: 'meat', valueOre: 100 }),
        group({ reason: 'leftovers', categoryKey: 'fish', valueOre: 100 }),
        group({ reason: 'tooMuch', categoryKey: 'bread', valueOre: 500 }),
      ],
      '2026-10',
      CATEGORY_KEYS,
    );
    expect(tie.byReason.map((r) => r.reason)).toEqual(['tooMuch', 'leftovers', 'other']);
    expect(tie.byCategory.map((c) => c.categoryKey)).toEqual(['bread', 'meat', 'fish']);
  });

  it('has no estimated share without a known value, and is empty for an empty month', () => {
    const onlyUnknown = wasteMonthFigures([group({ basis: 'unknown' })], '2026-10', CATEGORY_KEYS);
    expect(onlyUnknown.estimatedPercent).toBeNull();
    expect(wasteMonthFigures([], '2026-10', CATEGORY_KEYS)).toEqual({
      count: 0,
      actualOre: 0,
      estimatedOre: 0,
      knownOre: 0,
      unknownCount: 0,
      estimatedPercent: null,
      quantities: [],
      byReason: [],
      byCategory: [],
    });
  });

  it('refuses sums that are no longer exact (NFR-DATA-001)', () => {
    expect(() =>
      wasteMonthFigures(
        [
          group({ basis: 'actual', valueOre: Number.MAX_SAFE_INTEGER }),
          group({ basis: 'actual', valueOre: 1, reason: 'other' }),
        ],
        '2026-10',
        CATEGORY_KEYS,
      ),
    ).toThrow(RangeError);
  });
});

describe('FR-WASTE-003 wasteTrend', () => {
  it('covers 12 months up to the selected one, oldest first, with empty months as 0', () => {
    const trend = wasteTrend(
      [
        group({ month: '2026-10', basis: 'actual', valueOre: 1_000 }),
        group({ month: '2026-03', basis: 'estimated', valueOre: 250, count: 2 }),
        group({ month: '2026-03', basis: 'unknown', count: 1 }),
        group({ month: '2025-10', basis: 'actual', valueOre: 7 }), // 13 months back: outside
      ],
      '2026-10',
    );
    expect(trend).toHaveLength(12);
    expect(trend[0]?.month).toBe('2025-11');
    expect(trend[11]).toMatchObject({ month: '2026-10', count: 1, knownOre: 1_000 });
    expect(trend.find((m) => m.month === '2026-03')).toMatchObject({
      count: 3,
      estimatedOre: 250,
      knownOre: 250,
      unknownCount: 1,
    });
    expect(trend.find((m) => m.month === '2026-01')).toMatchObject({ count: 0, knownOre: 0 });
    expect(trend.every((m) => m.month !== '2025-10')).toBe(true);
  });

  it('crosses the turn of the year', () => {
    expect(wasteTrend([], '2026-02').map((m) => m.month)).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(wasteTrendStart('2026-02')).toBe('2025-03');
  });
});
