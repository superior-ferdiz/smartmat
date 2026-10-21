import { describe, expect, it } from 'vitest';
import {
  budgetInputSchema,
  createPurchaseSchema,
  deletePurchaseQuerySchema,
  MAX_LINE_ORE,
  MAX_PURCHASE_LINES,
  MAX_PURCHASE_ORE,
  monthSchema,
  updatePurchaseSchema,
} from './purchases';

const LOCATION = '0199f0a0-0000-7000-8000-000000000001';
const milk = { description: 'Lettmelk', kind: 'food', categoryKey: 'dairy', amountOre: 2490 };
const soap = { description: 'Oppvaskmiddel', kind: 'nonFood', amountOre: 3990 };

function firstMessage(result: { error?: { issues: { message: string; path: PropertyKey[] }[] } }) {
  const issue = result.error?.issues[0];
  return issue ? `${issue.path.join('.')}: ${issue.message}` : undefined;
}

describe('FR-BUD-001 createPurchaseSchema', () => {
  it('accepts lines; trims the store name and turns an empty one into null', () => {
    const parsed = createPurchaseSchema.parse({
      storeName: '  Rema 1000 ',
      purchasedOn: '2026-10-21',
      lines: [milk, soap],
    });
    expect(parsed.storeName).toBe('Rema 1000');
    expect(parsed.lines).toHaveLength(2);
    expect(
      createPurchaseSchema.parse({ storeName: '   ', purchasedOn: '2026-10-21', totalOre: 100 })
        .storeName,
    ).toBeNull();
  });

  it('accepts only a total, with no lines', () => {
    const parsed = createPurchaseSchema.parse({ purchasedOn: '2026-10-21', totalOre: 45_000 });
    expect(parsed).toMatchObject({ totalOre: 45_000, lines: [], storeName: null });
  });

  it('lines OR a total: neither or both is refused', () => {
    expect(firstMessage(createPurchaseSchema.safeParse({ purchasedOn: '2026-10-21' }))).toBe(
      'totalOre: validation.purchase.linesOrTotal',
    );
    expect(
      firstMessage(
        createPurchaseSchema.safeParse({ purchasedOn: '2026-10-21', lines: [milk], totalOre: 1 }),
      ),
    ).toBe('totalOre: validation.purchase.totalWithLines');
  });

  it('NFR-DATA-001: amounts are whole, non-negative øre within the limits', () => {
    const line = (amountOre: number) =>
      firstMessage(
        createPurchaseSchema.safeParse({
          purchasedOn: '2026-10-21',
          lines: [{ ...milk, amountOre }],
        }),
      );
    expect(line(24.9)).toBe('lines.0.amountOre: validation.ore.integer');
    expect(line(-1)).toBe('lines.0.amountOre: validation.ore.negative');
    expect(line(MAX_LINE_ORE + 1)).toBe('lines.0.amountOre: validation.purchase.lineTooLarge');
    expect(line(MAX_LINE_ORE)).toBeUndefined();
    expect(line(0)).toBeUndefined();
    expect(
      firstMessage(
        createPurchaseSchema.safeParse({
          purchasedOn: '2026-10-21',
          totalOre: MAX_PURCHASE_ORE + 1,
        }),
      ),
    ).toBe('totalOre: validation.purchase.totalTooLarge');
  });

  it('the lines may not add up to more than the purchase limit', () => {
    const lines = Array.from({ length: 11 }, () => ({ ...milk, amountOre: MAX_LINE_ORE }));
    expect(firstMessage(createPurchaseSchema.safeParse({ purchasedOn: '2026-10-21', lines }))).toBe(
      'lines: validation.purchase.totalTooLarge',
    );
    expect(
      createPurchaseSchema.safeParse({ purchasedOn: '2026-10-21', lines: lines.slice(1) }).success,
    ).toBe(true);
  });

  it(`at most ${MAX_PURCHASE_LINES} lines`, () => {
    const lines = Array.from({ length: MAX_PURCHASE_LINES + 1 }, () => ({ ...milk, amountOre: 1 }));
    expect(firstMessage(createPurchaseSchema.safeParse({ purchasedOn: '2026-10-21', lines }))).toBe(
      'lines: validation.purchase.tooManyLines',
    );
  });

  it('a real date, not before 2000', () => {
    for (const [purchasedOn, message] of [
      ['2026-02-30', 'validation.date.invalid'],
      ['21.10.2026', 'validation.date.invalid'],
      ['1999-12-31', 'validation.purchase.dateTooEarly'],
    ]) {
      expect(firstMessage(createPurchaseSchema.safeParse({ purchasedOn, totalOre: 1 }))).toBe(
        `purchasedOn: ${message}`,
      );
    }
    expect(createPurchaseSchema.safeParse({ purchasedOn: '2000-01-01', totalOre: 1 }).success).toBe(
      true,
    );
  });

  it('food needs a category; non-food may have neither a category nor go into the inventory', () => {
    const one = (line: object) =>
      firstMessage(createPurchaseSchema.safeParse({ purchasedOn: '2026-10-21', lines: [line] }));
    expect(one({ ...milk, categoryKey: undefined })).toBe(
      'lines.0.categoryKey: validation.category.required',
    );
    expect(one({ ...soap, categoryKey: 'other' })).toBe(
      'lines.0.categoryKey: validation.purchase.nonFoodCategory',
    );
    expect(
      one({ ...soap, toInventory: { unit: 'stk', quantityBase: 1, locationId: LOCATION } }),
    ).toBe('lines.0.toInventory: validation.purchase.nonFoodInventory');
    expect(one({ ...milk, description: '  ' })).toBe(
      'lines.0.description: validation.lineDescription.required',
    );
    expect(one({ ...milk, description: 'x'.repeat(101) })).toBe(
      'lines.0.description: validation.lineDescription.tooLong',
    );
    expect(one({ ...milk, kind: 'drink' })).toBe('lines.0.kind: validation.lineKind.required');
  });

  it('FR-BUD-002: into the inventory as a new item (needs a unit) or onto an existing item', () => {
    const one = (toInventory: object) =>
      firstMessage(
        createPurchaseSchema.safeParse({
          purchasedOn: '2026-10-21',
          lines: [{ ...milk, toInventory }],
        }),
      );
    expect(one({ unit: 'ml', quantityBase: 1000, locationId: LOCATION })).toBeUndefined();
    expect(one({ itemId: LOCATION, quantityBase: 1000, locationId: LOCATION })).toBeUndefined();
    expect(one({ quantityBase: 1000, locationId: LOCATION })).toBe(
      'lines.0.toInventory.unit: validation.unit.required',
    );
    expect(one({ unit: 'ml', quantityBase: 1.5, locationId: LOCATION })).toBe(
      'lines.0.toInventory.quantityBase: validation.quantity.notWhole',
    );
    expect(
      one({
        unit: 'ml',
        quantityBase: 1000,
        locationId: LOCATION,
        expiry: { kind: 'use_by', date: 'i morgen' },
      }),
    ).toBe('lines.0.toInventory.expiry.date: validation.date.invalid');
  });

  it('a new purchase drops line ids; the client request id must be a UUID', () => {
    const parsed = createPurchaseSchema.parse({
      purchasedOn: '2026-10-21',
      lines: [{ ...milk, id: LOCATION }],
    });
    expect(parsed.lines[0]).not.toHaveProperty('id');
    expect(
      createPurchaseSchema.safeParse({
        purchasedOn: '2026-10-21',
        totalOre: 1,
        clientRequestId: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('FR-BUD-005 updatePurchaseSchema', () => {
  it('keeps line ids and removes untouched batches by default', () => {
    const parsed = updatePurchaseSchema.parse({
      purchasedOn: '2026-10-21',
      lines: [{ ...milk, id: LOCATION }, soap],
    });
    expect(parsed.lines[0]?.id).toBe(LOCATION);
    expect(parsed.lines[1]?.id).toBeUndefined();
    expect(parsed.removeUntouchedBatches).toBe(true);
  });

  it('the same lines-or-total rule as a new purchase', () => {
    expect(updatePurchaseSchema.safeParse({ purchasedOn: '2026-10-21' }).success).toBe(false);
  });

  it('delete: removeUntouchedBatches is true unless "false" is given', () => {
    expect(deletePurchaseQuerySchema.parse({}).removeUntouchedBatches).toBe(true);
    expect(
      deletePurchaseQuerySchema.parse({ removeUntouchedBatches: 'false' }).removeUntouchedBatches,
    ).toBe(false);
    expect(deletePurchaseQuerySchema.safeParse({ removeUntouchedBatches: 'nei' }).success).toBe(
      false,
    );
  });
});

describe('FR-BUD-003 budgetInputSchema', () => {
  it('1 kr – 1 000 000 kr in whole øre, or null to remove', () => {
    expect(budgetInputSchema.parse({ amountOre: 500_000 }).amountOre).toBe(500_000);
    expect(budgetInputSchema.parse({ amountOre: null }).amountOre).toBeNull();
    const message = (amountOre: number) =>
      budgetInputSchema.safeParse({ amountOre }).error?.issues[0]?.message;
    expect(message(99)).toBe('validation.budget.tooSmall');
    expect(message(0)).toBe('validation.budget.tooSmall');
    expect(message(100_000_001)).toBe('validation.budget.tooLarge');
    expect(message(5000.5)).toBe('validation.ore.integer');
  });
});

describe('FR-BUD-004 monthSchema', () => {
  it('"YYYY-MM" with a real month', () => {
    expect(monthSchema.safeParse('2026-10').success).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-1', '10-2026', '2026-10-01']) {
      expect(monthSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});
