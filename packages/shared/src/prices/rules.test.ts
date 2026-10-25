import { describe, expect, it } from 'vitest';
import {
  cheapestFresh,
  estimateLine,
  isFreshObservation,
  isOldOwnPrice,
  isStalePrice,
  isUncollectedChain,
  kronerToOre,
  lowerMedian,
  scalePriceOre,
  summarizeEstimates,
  unitPriceOre,
  type ExternalPriceCandidate,
  type OwnPriceCandidate,
} from './rules';

describe('spec 12 unitPriceOre (whole øre, half up)', () => {
  it.each([
    [2490, 1000, 'ml', 2490, 'l'], // 1 l milk
    [2990, 500, 'g', 5980, 'kg'],
    [1990, 400, 'g', 4975, 'kg'],
    [100, 3, 'g', 33_333, 'kg'], // 33 333,33 → 33 333
    [1, 2000, 'g', 1, 'kg'], // 0,5 → 1 (half up)
    [3990, 6, 'stk', 665, 'stk'],
    [1000, 3, 'stk', 333, 'stk'],
    [0, 500, 'g', 0, 'kg'],
  ] as const)('%i øre for %i %s → %i øre per %s', (price, quantity, unit, ore, per) => {
    expect(unitPriceOre(price, quantity, unit)).toEqual({ ore, per });
  });

  it('gives nothing without a positive quantity or a unit', () => {
    expect(unitPriceOre(1000, 0, 'g')).toBeNull();
    expect(unitPriceOre(1000, null, 'g')).toBeNull();
    expect(unitPriceOre(1000, 500, null)).toBeNull();
  });

  it('stays exact for large numbers (BigInt)', () => {
    expect(unitPriceOre(10_000_000, 1, 'g')).toEqual({ ore: 10_000_000_000, per: 'kg' });
  });
});

describe('spec 12 scalePriceOre', () => {
  it.each([
    [2490, 500, 1000, 1245],
    [2490, 250, 1000, 623], // 622,5 → 623
    [1000, 1, 3, 333],
    [1000, 2, 3, 667],
    [2490, 2000, 1000, 4980],
  ])('%i øre × %i / %i → %i', (price, wanted, pack, expected) => {
    expect(scalePriceOre(price, wanted, pack)).toBe(expected);
  });

  it('refuses a package of 0', () => {
    expect(() => scalePriceOre(100, 1, 0)).toThrow(RangeError);
  });
});

describe('spec 12 kronerToOre (the one floating-point number, from Kassalapp)', () => {
  it.each([
    [72.9, 7290],
    [0.1, 10],
    [0.29, 29],
    [1.005, null], // three decimals
    [49, 4900],
    [0, 0],
    [99_999.99, 9_999_999],
    [100_000, 10_000_000],
  ])('%s kr → %s', (kroner, ore) => {
    expect(kronerToOre(kroner)).toBe(ore);
  });

  it.each([-1, 100_000.01, Number.NaN, Number.POSITIVE_INFINITY, '72.9', null, undefined])(
    'refuses %s',
    (value) => {
      expect(kronerToOre(value)).toBeNull();
    },
  );
});

describe('spec 12 stale prices (14 days, Kassalapp’s own limit)', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const daysAgo = (days: number, extraMs = 0) =>
    new Date(now.getTime() - days * 24 * 60 * 60_000 - extraMs);

  it('exactly 14 days is fresh, a millisecond more is stale', () => {
    expect(isStalePrice(daysAgo(14), now)).toBe(false);
    expect(isStalePrice(daysAgo(14, 1), now)).toBe(true);
  });

  it('today and a little in the future are fresh', () => {
    expect(isStalePrice(now, now)).toBe(false);
    expect(isStalePrice(new Date(now.getTime() + 60_000), now)).toBe(false);
  });

  it('an old price from 2024 is stale', () => {
    expect(isStalePrice(new Date('2024-03-12T09:00:00Z'), now)).toBe(true);
  });

  it('chains Kassalapp no longer collects are never fresh, however new the date', () => {
    for (const chainCode of ['REMA_1000', 'KIWI', 'COOP_EXTRA', 'COOP_MEGA']) {
      expect(isUncollectedChain(chainCode)).toBe(true);
      expect(isFreshObservation({ chainCode, observedAt: now }, now)).toBe(false);
    }
    expect(isUncollectedChain('MENY_NO')).toBe(false);
    expect(isFreshObservation({ chainCode: 'MENY_NO', observedAt: daysAgo(1) }, now)).toBe(true);
    expect(isFreshObservation({ chainCode: 'MENY_NO', observedAt: daysAgo(15) }, now)).toBe(false);
  });
});

describe('spec 12 old own prices (90 days)', () => {
  it('90 days is not old, 91 is', () => {
    expect(isOldOwnPrice('2026-07-27', '2026-10-25')).toBe(false); // 90
    expect(isOldOwnPrice('2026-07-26', '2026-10-25')).toBe(true); // 91
  });
});

describe('FR-PRICE-004 cheapestFresh', () => {
  const obs = (chainName: string, priceOre: number, fresh = true) => ({
    chainName,
    priceOre,
    fresh,
  });

  it('picks the lowest fresh price and never a stale one', () => {
    expect(cheapestFresh([obs('Meny', 2990), obs('Kiwi', 1990, false), obs('Oda', 2490)])).toEqual(
      obs('Oda', 2490),
    );
  });

  it('a tie goes to the chain first in the alphabet', () => {
    expect(cheapestFresh([obs('Spar', 2490), obs('Bunnpris', 2490)])?.chainName).toBe('Bunnpris');
  });

  it('nothing fresh gives no cheapest at all', () => {
    expect(cheapestFresh([obs('Kiwi', 1990, false)])).toBeNull();
    expect(cheapestFresh([])).toBeNull();
  });
});

describe('lowerMedian', () => {
  const p = (priceOre: number) => ({ priceOre });
  it.each([
    [[], null],
    [[3000], 3000],
    [[3000, 2000], 2000],
    [[3000, 1000, 2000], 2000],
    [[4000, 1000, 3000, 2000], 2000],
  ])('%j → %s', (prices, expected) => {
    expect(lowerMedian(prices.map(p))?.priceOre ?? null).toBe(expected);
  });
});

describe('FR-PRICE-003 estimateLine', () => {
  const own: OwnPriceCandidate = {
    priceOre: 2490,
    quantityBase: 1000,
    unit: 'ml',
    date: '2026-10-20',
  };
  const ext = (priceOre: number, pack: number | null = 1000, unit: 'g' | 'ml' | null = 'ml') =>
    ({
      priceOre,
      packageQuantityBase: pack,
      packageUnit: unit,
      date: '2026-10-24',
    }) satisfies ExternalPriceCandidate;

  it('no matching item → noMatch, even with prices around', () => {
    expect(estimateLine({ quantityBase: 1000, unit: 'ml' }, false, own, [ext(2000)]).missing).toBe(
      'noMatch',
    );
  });

  it('own price first, scaled to the line', () => {
    expect(estimateLine({ quantityBase: 500, unit: 'ml' }, true, own, [ext(1000)])).toEqual({
      estimateOre: 1245,
      source: 'own',
      basis: 'scaled',
      date: '2026-10-20',
      missing: null,
    });
  });

  it('own price without an amount on the line → the whole price from last time', () => {
    expect(estimateLine({ quantityBase: null, unit: null }, true, own, [])).toMatchObject({
      estimateOre: 2490,
      basis: 'lastTime',
    });
  });

  it('own price in another unit falls back to Kassalapp', () => {
    expect(
      estimateLine({ quantityBase: 2000, unit: 'g' }, true, own, [ext(3000, 1000, 'g')]),
    ).toMatchObject({
      estimateOre: 6000,
      source: 'kassalapp',
      basis: 'scaled',
    });
  });

  it('Kassalapp: the lower median of the fresh prices', () => {
    const result = estimateLine({ quantityBase: 1000, unit: 'ml' }, true, null, [
      ext(3000),
      ext(1000),
      ext(2000),
    ]);
    expect(result).toMatchObject({ estimateOre: 2000, source: 'kassalapp' });
  });

  it('Kassalapp without an amount on the line → one package', () => {
    expect(
      estimateLine({ quantityBase: null, unit: null }, true, null, [ext(1990, null, null)]),
    ).toMatchObject({
      estimateOre: 1990,
      basis: 'onePackage',
    });
  });

  it('Kassalapp without a package size cannot be scaled → unitMismatch', () => {
    expect(
      estimateLine({ quantityBase: 500, unit: 'ml' }, true, null, [ext(1990, null, null)]).missing,
    ).toBe('unitMismatch');
  });

  it('matched, but no price anywhere → noPrice (unknown, not 0)', () => {
    expect(estimateLine({ quantityBase: 500, unit: 'ml' }, true, null, [])).toEqual({
      estimateOre: null,
      source: null,
      basis: null,
      date: null,
      missing: 'noPrice',
    });
  });

  it('own price in another unit and nothing else → unitMismatch', () => {
    expect(estimateLine({ quantityBase: 2, unit: 'stk' }, true, own, []).missing).toBe(
      'unitMismatch',
    );
  });
});

describe('FR-PRICE-003 summarizeEstimates (honest coverage)', () => {
  it('sums only the lines with an estimate and counts the rest as missing', () => {
    const lines = [
      estimateLine(
        { quantityBase: 500, unit: 'ml' },
        true,
        { priceOre: 2490, quantityBase: 1000, unit: 'ml', date: '2026-10-20' },
        [],
      ),
      estimateLine({ quantityBase: null, unit: null }, true, null, [
        { priceOre: 1990, packageQuantityBase: null, packageUnit: null, date: '2026-10-24' },
      ]),
      estimateLine({ quantityBase: 500, unit: 'g' }, true, null, []),
      estimateLine({ quantityBase: null, unit: null }, false, null, []),
    ];
    expect(summarizeEstimates(lines)).toEqual({
      openLines: 4,
      estimatedLines: 2,
      missingLines: 2,
      estimatedOre: 1245 + 1990,
      fromOwn: 1,
      fromKassalapp: 1,
    });
  });

  it('an empty list has nothing estimated and nothing missing', () => {
    expect(summarizeEstimates([])).toEqual({
      openLines: 0,
      estimatedLines: 0,
      missingLines: 0,
      estimatedOre: 0,
      fromOwn: 0,
      fromKassalapp: 0,
    });
  });

  it('no line with a price gives 0 estimated lines, not a total of 0 kr for the list', () => {
    const summary = summarizeEstimates([
      estimateLine({ quantityBase: 1, unit: 'stk' }, true, null, []),
    ]);
    expect(summary.estimatedLines).toBe(0);
    expect(summary.missingLines).toBe(1);
  });
});
