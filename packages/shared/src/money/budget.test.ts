import { describe, expect, it } from 'vitest';
import { addMonths, firstOfMonth, monthRange, osloDate } from '../dates/dates';
import { monthFigures, sumOre, usedPercent, type SpendingRow } from './budget';

describe('NFR-DATA-001 sumOre', () => {
  it('adds whole øre exactly (no 0.1 + 0.2 problem)', () => {
    expect(sumOre([10, 20])).toBe(30);
    expect(sumOre([4990, 1990, 2490, 3490])).toBe(12_960);
    expect(sumOre([])).toBe(0);
  });

  it('refuses decimals and sums that are no longer exact', () => {
    expect(() => sumOre([49.9])).toThrow(RangeError);
    expect(() => sumOre([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
    expect(sumOre([Number.MAX_SAFE_INTEGER - 1, 1])).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('FR-BUD-004 usedPercent', () => {
  it('rounds down, so 100 % means the budget is really used up', () => {
    expect(usedPercent(0, 500_000)).toBe(0);
    expect(usedPercent(324_550, 500_000)).toBe(64); // 64,91 %
    expect(usedPercent(499_999, 500_000)).toBe(99); // 99,9998 %
    expect(usedPercent(500_000, 500_000)).toBe(100);
    expect(usedPercent(750_000, 500_000)).toBe(150);
    expect(usedPercent(1, 300)).toBe(0); // 0,33 %
  });

  it('stays exact for very large numbers (spent × 100 beyond safe integers)', () => {
    expect(usedPercent(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(100);
    expect(usedPercent(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER)).toBe(99);
  });

  it('needs a positive budget', () => {
    expect(() => usedPercent(100, 0)).toThrow(RangeError);
  });
});

describe('FR-BUD-004 monthFigures', () => {
  const rows: SpendingRow[] = [
    { kind: 'food', categoryKey: 'dairy', amountOre: 4990 },
    { kind: 'food', categoryKey: 'meat', amountOre: 12_990 },
    { kind: 'food', categoryKey: 'dairy', amountOre: 2490 },
    { kind: 'nonFood', categoryKey: null, amountOre: 3990 },
    { kind: 'nonFood', categoryKey: null, amountOre: 300 },
  ];

  it('spent = food lines + purchases with only a total; non-food is separate', () => {
    const figures = monthFigures(500_000, rows, 25_000);
    expect(figures.spentOre).toBe(4990 + 12_990 + 2490 + 25_000);
    expect(figures.nonFoodOre).toBe(4290);
    expect(figures.unallocatedOre).toBe(25_000);
    expect(figures.remainingOre).toBe(500_000 - 45_470);
    expect(figures.usedPercent).toBe(9);
  });

  it('per category: one row per category, largest first', () => {
    expect(monthFigures(null, rows, 0).byCategory).toEqual([
      { categoryKey: 'meat', amountOre: 12_990 },
      { categoryKey: 'dairy', amountOre: 7480 },
    ]);
  });

  it('equal amounts are sorted by key so the order is stable; zero-sum categories are left out', () => {
    const figures = monthFigures(
      null,
      [
        { kind: 'food', categoryKey: 'meat', amountOre: 100 },
        { kind: 'food', categoryKey: 'bread', amountOre: 100 },
        { kind: 'food', categoryKey: 'fish', amountOre: 0 },
      ],
      0,
    );
    expect(figures.byCategory.map((c) => c.categoryKey)).toEqual(['bread', 'meat']);
  });

  it('without a budget: no remaining and no percentage, but spent is still counted', () => {
    const figures = monthFigures(null, rows, 0);
    expect(figures).toMatchObject({ budgetOre: null, remainingOre: null, usedPercent: null });
    expect(figures.spentOre).toBe(20_470);
  });

  it('over budget gives a negative remaining amount', () => {
    const figures = monthFigures(10_000, rows, 0);
    expect(figures.remainingOre).toBe(-10_470);
    expect(figures.usedPercent).toBe(204);
  });

  it('an empty month is all zeros', () => {
    expect(monthFigures(500_000, [], 0)).toEqual({
      budgetOre: 500_000,
      spentOre: 0,
      remainingOre: 500_000,
      usedPercent: 0,
      byCategory: [],
      unallocatedOre: 0,
      nonFoodOre: 0,
    });
  });
});

describe('FR-BUD-004 months in Norwegian time', () => {
  it('addMonths crosses year boundaries both ways', () => {
    expect(addMonths('2026-10', 1)).toBe('2026-11');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-03', -15)).toBe('2024-12');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
  });

  it('firstOfMonth', () => {
    expect(firstOfMonth('2026-02')).toBe('2026-02-01');
  });

  it('a purchase at 00:30 on 1 November in Norway is in November, though it is still October in UTC', () => {
    const moment = new Date('2026-10-31T23:30:00Z'); // 00:30 Norwegian winter time
    expect(osloDate(moment)).toBe('2026-11-01');
    expect(monthRange(osloDate(moment))).toEqual({ start: '2026-11-01', next: '2026-12-01' });
  });

  it('23:30 on 31 December in Norway is still the old year', () => {
    expect(osloDate(new Date('2026-12-31T22:30:00Z'))).toBe('2026-12-31');
    expect(osloDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});
