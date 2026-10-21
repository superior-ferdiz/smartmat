import { describe, expect, it } from 'vitest';
import { emptyBatchValues, parseBatchValues } from './batchForm';

const base = { ...emptyBatchValues('g', 'loc'), amount: '1,5', displayUnit: 'kg' as const };

describe('FR-INV-001 parseBatchValues (form text → API body)', () => {
  it('turns "1,5 kg" into 1500 g and "24,90" kr into 2490 øre', () => {
    expect(
      parseBatchValues({ ...base, price: '24,90', expiryKind: 'use_by', expiryDate: '2026-10-25' }),
    ).toEqual({
      errors: {},
      input: {
        quantityBase: 1500,
        locationId: 'loc',
        expiry: { kind: 'use_by', date: '2026-10-25' },
        priceOre: 2490,
        purchasedOn: null,
      },
    });
  });

  it('no kind of date → no date (expiry null)', () => {
    expect(parseBatchValues(base).input?.expiry).toBeNull();
  });

  it('collects every error with the same keys as the server', () => {
    expect(
      parseBatchValues({
        ...base,
        amount: '1,2345',
        locationId: '',
        expiryKind: 'best_before',
        expiryDate: '',
        price: '12,345',
      }).errors,
    ).toEqual({
      quantityBase: 'validation.quantity.notWhole',
      locationId: 'validation.location.required',
      'expiry.date': 'validation.expiry.dateRequired',
      priceOre: 'validation.ore.too_many_decimals',
    });
  });
});
