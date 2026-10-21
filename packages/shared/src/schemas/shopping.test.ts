import { describe, expect, it } from 'vitest';
import {
  addFromRecipeSchema,
  createShoppingItemSchema,
  toInventorySchema,
  updateShoppingItemSchema,
} from './shopping';

const id = (n: number) => `0199f0a0-0000-7000-8000-00000000000${n}`;
const message = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('FR-SHOP-001 createShoppingItemSchema', () => {
  it('accepts a text alone and trims it', () => {
    expect(createShoppingItemSchema.parse({ text: '  Melk ' })).toEqual({ text: 'Melk' });
  });

  it('refuses an empty or too long text', () => {
    expect(message(createShoppingItemSchema.safeParse({ text: '  ' }))).toBe(
      'validation.shoppingText.required',
    );
    expect(message(createShoppingItemSchema.safeParse({ text: 'x'.repeat(101) }))).toBe(
      'validation.shoppingText.tooLong',
    );
  });

  it('a quantity is a positive whole number of base units, with its unit', () => {
    expect(
      createShoppingItemSchema.parse({ text: 'Melk', quantity: { quantityBase: 1000, unit: 'ml' } })
        .quantity,
    ).toEqual({ quantityBase: 1000, unit: 'ml' });
    for (const quantityBase of [1.5, 0, -1]) {
      expect(
        createShoppingItemSchema.safeParse({ text: 'Melk', quantity: { quantityBase, unit: 'ml' } })
          .success,
      ).toBe(false);
    }
    expect(
      message(createShoppingItemSchema.safeParse({ text: 'Melk', quantity: { quantityBase: 1 } })),
    ).toBe('validation.unit.required');
  });
});

describe('FR-SHOP-001 updateShoppingItemSchema', () => {
  it('needs at least one field; null clears the quantity', () => {
    expect(message(updateShoppingItemSchema.safeParse({}))).toBe('validation.nothingToUpdate');
    expect(updateShoppingItemSchema.parse({ quantity: null })).toEqual({ quantity: null });
    expect(updateShoppingItemSchema.parse({ checked: false })).toEqual({ checked: false });
  });
});

describe('FR-SHOP-002 addFromRecipeSchema', () => {
  it('needs at least one line and no ingredient twice', () => {
    expect(message(addFromRecipeSchema.safeParse({ lines: [] }))).toBe(
      'validation.shopping.nothingSelected',
    );
    const twice = { lines: [1, 1].map((n) => ({ ingredientId: id(n), quantityBase: 1 })) };
    expect(message(addFromRecipeSchema.safeParse(twice))).toBe('validation.shopping.duplicateLine');
  });

  it('a line may have no amount', () => {
    expect(
      addFromRecipeSchema.safeParse({ lines: [{ ingredientId: id(1), quantityBase: null }] })
        .success,
    ).toBe(true);
  });
});

describe('FR-SHOP-003 toInventorySchema', () => {
  const base = { shoppingItemId: id(1), quantityBase: 500, locationId: id(2) };

  it('accepts an existing item or a new one', () => {
    expect(
      toInventorySchema.safeParse({
        lines: [{ ...base, target: { kind: 'existing', itemId: id(3) } }],
      }).success,
    ).toBe(true);
    expect(
      toInventorySchema.safeParse({
        lines: [
          { ...base, target: { kind: 'new', name: 'Melk', categoryKey: 'dairy', unit: 'ml' } },
        ],
      }).success,
    ).toBe(true);
  });

  it('refuses a missing target, the same line twice and an empty list', () => {
    expect(message(toInventorySchema.safeParse({ lines: [base] }))).toBe(
      'validation.shopping.itemRequired',
    );
    const line = { ...base, target: { kind: 'existing', itemId: id(3) } };
    expect(message(toInventorySchema.safeParse({ lines: [line, line] }))).toBe(
      'validation.shopping.duplicateLine',
    );
    expect(message(toInventorySchema.safeParse({ lines: [] }))).toBe(
      'validation.shopping.nothingSelected',
    );
  });
});
