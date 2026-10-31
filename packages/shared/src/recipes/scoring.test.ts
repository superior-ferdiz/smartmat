import { describe, expect, it } from 'vitest';
import { buildAliasIndex } from './matching';
import {
  compareRanked,
  convertToBase,
  evaluateLine,
  scoreRecipe,
  stockByIngredient,
  type RecipeLineInput,
  type Stock,
  type StockIngredient,
  type StockItem,
} from './scoring';

const today = '2026-10-21';

const ingredients = new Map<string, StockIngredient>([
  ['melk', { id: 'melk', baseUnit: 'ml', conversions: [] }],
  ['egg', { id: 'egg', baseUnit: 'stk', conversions: [{ unit: 'g', unitQty: 60, baseQty: 1 }] }],
  ['lok', { id: 'lok', baseUnit: 'g', conversions: [{ unit: 'stk', unitQty: 1, baseQty: 150 }] }],
  ['kylling', { id: 'kylling', baseUnit: 'g', conversions: [] }],
]);
const index = buildAliasIndex([
  { id: 'melk', name: 'melk', aliases: ['lettmelk'] },
  { id: 'egg', name: 'egg', aliases: [] },
  { id: 'lok', name: 'løk', aliases: [] },
  { id: 'kylling', name: 'kyllingfilet', aliases: [] },
]);

function item(name: string, unit: StockItem['unit'], batches: StockItem['batches']): StockItem {
  return { name, unit, batches, ingredientMatch: 'auto', ingredientId: null };
}
const batch = (
  quantityBase: number,
  expiryKind: 'best_before' | 'use_by' | null = null,
  expiryDate: string | null = null,
) => ({ quantityBase, expiryKind, expiryDate });

describe('ADR-0006 convertToBase rounds down', () => {
  it('same unit: unchanged and exact', () => {
    expect(convertToBase(500, 'ml', ingredients.get('melk')!)).toEqual({
      quantityBase: 500,
      approximate: false,
    });
  });

  it('130 g of egg at 60 g per egg is 2 eggs, not 2.17 or 3', () => {
    expect(convertToBase(130, 'g', ingredients.get('egg')!)).toEqual({
      quantityBase: 2,
      approximate: true,
    });
  });

  it('2 onions at 150 g each is 300 g', () => {
    expect(convertToBase(2, 'stk', ingredients.get('lok')!)?.quantityBase).toBe(300);
  });

  it('no conversion → null', () => {
    expect(convertToBase(1, 'stk', ingredients.get('melk')!)).toBeNull();
  });
});

describe('FR-REC-003 stockByIngredient', () => {
  it('sums every linked item and batch, in the ingredient’s base unit', () => {
    const stock = stockByIngredient(
      [
        item('Lettmelk', 'ml', [batch(1000), batch(500)]),
        item('Melk', 'ml', [batch(250)]),
        item('Oppvaskmiddel', 'ml', [batch(500)]),
      ],
      index,
      ingredients,
      today,
    );
    expect(stock.get('melk')).toMatchObject({
      quantityBase: 1750,
      unconvertible: false,
      approximate: false,
      itemNames: ['Lettmelk', 'Melk'],
    });
    expect(stock.size).toBe(1);
  });

  it('NEVER counts a batch past its use-by date, and says which item it was', () => {
    const stock = stockByIngredient(
      [item('Kyllingfilet', 'g', [batch(400, 'use_by', '2026-10-20'), batch(200)])],
      index,
      ingredients,
      today,
    );
    expect(stock.get('kylling')).toMatchObject({
      quantityBase: 200,
      excludedUseByItems: ['Kyllingfilet'],
    });
  });

  it('an item with ONLY use-by-passed batches is not present at all', () => {
    const stock = stockByIngredient(
      [item('Kyllingfilet', 'g', [batch(400, 'use_by', '2026-10-01')])],
      index,
      ingredients,
      today,
    );
    expect(stock.get('kylling')).toMatchObject({ quantityBase: 0, itemNames: [] });
    expect(evaluateLine(line('kylling', 300), stock.get('kylling')).status).toBe('missing');
  });

  it('use-by today is still usable; best before passed is counted', () => {
    const stock = stockByIngredient(
      [
        item('Kyllingfilet', 'g', [batch(400, 'use_by', today)]),
        item('Lettmelk', 'ml', [batch(1000, 'best_before', '2026-10-15')]),
      ],
      index,
      ingredients,
      today,
    );
    expect(stock.get('kylling')?.quantityBase).toBe(400);
    expect(stock.get('melk')?.quantityBase).toBe(1000);
    expect(stock.get('melk')?.expiring).toEqual({
      itemName: 'Lettmelk',
      expiryKind: 'best_before',
      daysLeft: -6,
    });
  });

  it('"going off" = today, within 3 days, or best before passed; the most urgent one is kept', () => {
    const stock = stockByIngredient(
      [
        item('Melk', 'ml', [batch(100, 'best_before', '2026-10-24')]),
        item('Lettmelk', 'ml', [
          batch(100, 'use_by', '2026-10-22'),
          batch(100, 'use_by', '2026-10-30'),
        ]),
      ],
      index,
      ingredients,
      today,
    );
    expect(stock.get('melk')?.expiring).toEqual({
      itemName: 'Lettmelk',
      expiryKind: 'use_by',
      daysLeft: 1,
    });
  });

  it('4 days left or no date is not going off', () => {
    const stock = stockByIngredient(
      [item('Melk', 'ml', [batch(100, 'use_by', '2026-10-25'), batch(100)])],
      index,
      ingredients,
      today,
    );
    expect(stock.get('melk')?.expiring).toBeNull();
  });

  it('two items with the same name are added up but named once', () => {
    const stock = stockByIngredient(
      [item('Melk', 'ml', [batch(100)]), item('Melk', 'ml', [batch(200)])],
      index,
      ingredients,
      today,
    );
    expect(stock.get('melk')).toMatchObject({ quantityBase: 300, itemNames: ['Melk'] });
  });

  it('a unit without conversion makes the amount unknown, not zero', () => {
    const stock = stockByIngredient(
      [item('Lettmelk', 'stk', [batch(2)]), item('Melk', 'ml', [batch(100)])],
      index,
      ingredients,
      today,
    );
    expect(stock.get('melk')).toMatchObject({ quantityBase: 100, unconvertible: true });
  });

  it('converted amounts are approximate; empty batches are skipped', () => {
    const stock = stockByIngredient(
      [item('Egg', 'g', [batch(130), batch(0)])],
      index,
      ingredients,
      today,
    );
    expect(stock.get('egg')).toMatchObject({ quantityBase: 2, approximate: true });
  });

  it('a manual link counts, a "none" link does not', () => {
    const stock = stockByIngredient(
      [
        {
          ...item('Hjemmelaget', 'g', [batch(300)]),
          ingredientMatch: 'manual',
          ingredientId: 'kylling',
        },
        { ...item('Lettmelk', 'ml', [batch(300)]), ingredientMatch: 'none' },
      ],
      index,
      ingredients,
      today,
    );
    expect(stock.get('kylling')?.quantityBase).toBe(300);
    expect(stock.has('melk')).toBe(false);
  });
});

function line(
  ingredientId: string,
  quantityBase: number | null,
  extra: Partial<RecipeLineInput> = {},
): RecipeLineInput {
  return {
    ingredientId,
    ingredientName: ingredientId,
    isStaple: false,
    quantityBase,
    optional: false,
    ...extra,
  };
}

function stockOf(quantityBase: number, extra: Partial<Stock> = {}): Stock {
  return {
    quantityBase,
    unconvertible: false,
    approximate: false,
    itemNames: ['Vare'],
    expiring: null,
    excludedUseByItems: [],
    ...extra,
  };
}

describe('FR-REC-003 evaluateLine', () => {
  it.each([
    ['enough when the amount is reached', line('melk', 500), stockOf(500), 'enough', null],
    ['notEnough with how much is missing', line('melk', 500), stockOf(200), 'notEnough', 300],
    ['missing without stock', line('melk', 500), undefined, 'missing', null],
    [
      '"etter smak" (no amount) is enough when present',
      line('melk', null),
      stockOf(1),
      'enough',
      null,
    ],
    [
      'unknownAmount when part of it cannot be converted and the rest is not enough',
      line('melk', 500),
      stockOf(100, { unconvertible: true }),
      'unknownAmount',
      null,
    ],
    [
      'enough even with an unconvertible part, when the convertible part is enough',
      line('melk', 500),
      stockOf(600, { unconvertible: true }),
      'enough',
      null,
    ],
    ['staple whatever the stock', line('salt', 5, { isStaple: true }), undefined, 'staple', null],
  ] as const)('%s', (_name, input, stock, status, missingBase) => {
    const result = evaluateLine(input, stock);
    expect(result.status).toBe(status);
    expect(result.missingBase).toBe(missingBase);
  });

  it('an entry with no usable items (only use-by passed) is missing, and tells why', () => {
    const result = evaluateLine(
      line('kylling', 300),
      stockOf(0, { itemNames: [], excludedUseByItems: ['Kyllingfilet'] }),
    );
    expect(result).toMatchObject({ status: 'missing', excludedUseByItems: ['Kyllingfilet'] });
  });
});

describe('FR-REC-002 scoreRecipe', () => {
  const evaluate = (lines: RecipeLineInput[], stocks: (Stock | undefined)[]) =>
    scoreRecipe(
      lines,
      lines.map((l, i) => evaluateLine(l, stocks[i])),
    );

  it('coverage = floor(100 × points / (2 × required)): 2 enough + 1 partial + 1 missing → 62', () => {
    const score = evaluate(
      [line('a', 1), line('b', 1), line('c', 10), line('d', 1)],
      [stockOf(1), stockOf(1), stockOf(5), undefined],
    );
    // points = 2 + 2 + 1 + 0 = 5, required = 4 → floor(500 / 8) = 62
    expect(score).toMatchObject({
      total: 62,
      coverage: 62,
      expiringBonus: 0,
      requiredCount: 4,
      enoughCount: 2,
      partialCount: 1,
      missingCount: 1,
    });
    expect(score.reasons).toEqual([
      { code: 'coverage', points: 62, enough: 2, partial: 1, required: 4 },
      { code: 'missing', points: 0, names: ['d'] },
    ]);
  });

  it('everything there → 100, nothing there → 0 with the "nothing" reason', () => {
    expect(evaluate([line('a', 1), line('b', 1)], [stockOf(1), stockOf(1)]).total).toBe(100);
    const none = evaluate([line('a', 1), line('b', 1)], [undefined, undefined]);
    expect(none.total).toBe(0);
    expect(none.reasons[0]).toEqual({ code: 'nothing', points: 0 });
  });

  it('staples and optional ingredients are not counted', () => {
    const score = evaluate(
      [line('a', 1), line('salt', 1, { isStaple: true }), line('b', 1, { optional: true })],
      [stockOf(1), undefined, undefined],
    );
    expect(score).toMatchObject({ total: 100, requiredCount: 1, missingCount: 0 });
  });

  it('only staples → 0 (no required ingredients)', () => {
    expect(evaluate([line('salt', 1, { isStaple: true })], [undefined]).total).toBe(0);
  });

  it('+10 per required ingredient going off, at most 3, most urgent first', () => {
    const going = (itemName: string, daysLeft: number) =>
      stockOf(1, { expiring: { itemName, expiryKind: 'use_by', daysLeft } });
    const score = evaluate(
      [line('a', 1), line('b', 1), line('c', 1), line('d', 1), line('e', 1)],
      [going('A', 3), going('B', 0), going('C', 2), going('D', 1), stockOf(1)],
    );
    expect(score).toMatchObject({ coverage: 100, expiringBonus: 30, total: 130 });
    expect(score.reasons.filter((r) => r.code === 'expiring').map((r) => r.points)).toEqual([
      10, 10, 10,
    ]);
    expect(score.reasons.flatMap((r) => (r.code === 'expiring' ? [r.itemName] : []))).toEqual([
      'B',
      'D',
      'C',
    ]);
  });

  it('a going-off item only counts for a required ingredient', () => {
    const score = evaluate(
      [line('a', 1, { optional: true })],
      [stockOf(1, { expiring: { itemName: 'A', expiryKind: 'use_by', daysLeft: 0 } })],
    );
    expect(score.expiringBonus).toBe(0);
  });

  it('partial amounts going off still count (the food is there and should be used)', () => {
    const score = evaluate(
      [line('a', 10)],
      [stockOf(5, { expiring: { itemName: 'A', expiryKind: 'best_before', daysLeft: -2 } })],
    );
    expect(score).toMatchObject({ coverage: 50, expiringBonus: 10, total: 60 });
  });
});

describe('FR-REC-002 compareRanked', () => {
  const r = (title: string, total: number, missingCount: number) => ({
    title,
    score: { total, missingCount },
  });

  it('highest score, then fewest missing, then title in Norwegian order (å last)', () => {
    const sorted = [
      r('Ål', 50, 1),
      r('Wok', 50, 1),
      r('Aaa', 50, 2),
      r('Taco', 90, 3),
      r('Øl-brød', 50, 1),
    ].sort(compareRanked);
    expect(sorted.map((x) => x.title)).toEqual(['Taco', 'Wok', 'Øl-brød', 'Ål', 'Aaa']);
  });
});
