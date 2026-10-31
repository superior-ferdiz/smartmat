import { describe, expect, it } from 'vitest';
import { createItemSchema, discardSchema, updateBatchSchema, updateItemSchema } from './inventory';

const valid = {
  name: 'Lettmelk',
  categoryKey: 'dairy',
  unit: 'ml',
  batch: { quantityBase: 1000, locationId: '0199f0a0-0000-7000-8000-000000000001' },
};

describe('FR-INV-001 createItemSchema', () => {
  it('accepts a minimal item and trims the name', () => {
    expect(createItemSchema.parse({ ...valid, name: '  Lettmelk ' }).name).toBe('Lettmelk');
  });

  it('a date needs its kind (best before or use by), and must be a real date', () => {
    const noKind = createItemSchema.safeParse({
      ...valid,
      batch: { ...valid.batch, expiry: { date: '2026-10-25' } },
    });
    expect(noKind.error?.issues[0]?.message).toBe('validation.expiry.kindRequired');
    const badDate = createItemSchema.safeParse({
      ...valid,
      batch: { ...valid.batch, expiry: { kind: 'use_by', date: '2026-02-30' } },
    });
    expect(badDate.error?.issues[0]?.message).toBe('validation.date.invalid');
  });

  it('refuses decimals, zero and negative quantities', () => {
    for (const quantityBase of [1.5, 0, -5]) {
      expect(
        createItemSchema.safeParse({ ...valid, batch: { ...valid.batch, quantityBase } }).success,
      ).toBe(false);
    }
  });

  it('refuses a negative price', () => {
    expect(
      createItemSchema.safeParse({ ...valid, batch: { ...valid.batch, priceOre: -1 } }).success,
    ).toBe(false);
  });
});

describe('updates need something to change', () => {
  it('item and batch', () => {
    expect(updateItemSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'validation.nothingToUpdate',
    );
    expect(updateBatchSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'validation.nothingToUpdate',
    );
    expect(updateBatchSchema.safeParse({ expiry: null }).success).toBe(true);
    expect(updateBatchSchema.safeParse({ quantityBase: 0 }).success).toBe(true);
  });
});

describe('FR-INV-007 discardSchema', () => {
  it('needs a known reason', () => {
    expect(
      discardSchema.safeParse({ quantityBase: 1, reason: 'boring' }).error?.issues[0]?.message,
    ).toBe('validation.wasteReason.required');
    expect(
      discardSchema.safeParse({ quantityBase: 1, reason: 'tooMuch', valueOre: 1990 }).success,
    ).toBe(true);
  });
});
