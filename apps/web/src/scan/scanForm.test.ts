import { describe, expect, it } from 'vitest';
import type { BarcodeLookupResponse } from '@smartmat/shared';
import { initialScanValues, parseScanValues, withUnit } from './scanForm';

const FRIDGE = '0199f0a0-0000-7000-8000-0000000000f1';
const PANTRY = '0199f0a0-0000-7000-8000-0000000000f2';
const ITEM = '0199f0a0-0000-7000-8000-0000000000a1';
const EGG = '0199f0a0-0000-7000-8000-0000000000e1';
const REQUEST = '0199f0a0-0000-7000-8000-0000000000c1';

const empty: BarcodeLookupResponse['suggestion'] = {
  name: null,
  brand: null,
  categoryKey: null,
  unit: null,
  quantityBase: null,
  ingredient: null,
  locationId: null,
  expiryKind: null,
};

function lookup(overrides: Partial<BarcodeLookupResponse> = {}): BarcodeLookupResponse {
  return {
    gtin: '7038010000737',
    storeCode: false,
    source: 'openFoodFacts',
    providerStatus: 'found',
    suggestion: empty,
    existingItem: null,
    ...overrides,
  };
}

describe('FR-SCAN-002 the form as it starts', () => {
  it('from Open Food Facts: name, category, unit and amount; the first place; never a date', () => {
    const values = initialScanValues(
      lookup({
        suggestion: {
          ...empty,
          name: 'Lettmelk',
          categoryKey: 'dairy',
          unit: 'ml',
          quantityBase: 1500,
        },
      }),
      [FRIDGE, PANTRY],
    );
    expect(values).toEqual({
      mode: 'newItem',
      name: 'Lettmelk',
      categoryKey: 'dairy',
      unit: 'ml',
      ingredient: 'auto',
      batch: {
        amount: '1,5',
        displayUnit: 'l',
        locationId: FRIDGE,
        expiryKind: '',
        expiryDate: '',
        price: '',
        purchasedOn: '',
      },
    });
  });

  it('nothing known: an empty form in pieces', () => {
    const values = initialScanValues(lookup({ source: 'none', providerStatus: 'notFound' }), [
      FRIDGE,
    ]);
    expect(values).toMatchObject({
      name: '',
      categoryKey: '',
      unit: 'stk',
      batch: { amount: '', locationId: FRIDGE },
    });
  });

  it("the household's answers: place, kind of date and chosen ingredient", () => {
    const values = initialScanValues(
      lookup({
        source: 'household',
        suggestion: {
          ...empty,
          name: 'Egg',
          categoryKey: 'dairy',
          unit: 'stk',
          quantityBase: 12,
          ingredient: { match: 'manual', ingredientId: EGG },
          locationId: PANTRY,
          expiryKind: 'best_before',
        },
      }),
      [FRIDGE, PANTRY],
    );
    expect(values).toMatchObject({
      ingredient: EGG,
      batch: {
        amount: '12',
        displayUnit: 'stk',
        locationId: PANTRY,
        expiryKind: 'best_before',
        expiryDate: '',
      },
    });
  });

  it("'none' stays none; a remembered place that is gone becomes the first one", () => {
    const values = initialScanValues(
      lookup({
        suggestion: {
          ...empty,
          ingredient: { match: 'none', ingredientId: null },
          locationId: ITEM,
        },
      }),
      [FRIDGE],
    );
    expect(values.ingredient).toBe('none');
    expect(values.batch.locationId).toBe(FRIDGE);
  });

  it('the item from last time: new batch, in the item unit; an amount in another unit is not offered', () => {
    const values = initialScanValues(
      lookup({
        suggestion: { ...empty, unit: 'ml', quantityBase: 1000 },
        existingItem: { id: ITEM, name: 'Melk', unit: 'stk' },
      }),
      [FRIDGE],
    );
    expect(values).toMatchObject({
      mode: 'existingItem',
      unit: 'stk',
      batch: { amount: '', displayUnit: 'stk' },
    });
  });
});

describe('FR-SCAN-005 the body sent to the API', () => {
  const start = initialScanValues(
    lookup({
      suggestion: {
        ...empty,
        name: 'Lettmelk',
        categoryKey: 'dairy',
        unit: 'ml',
        quantityBase: 1000,
      },
    }),
    [FRIDGE],
  );

  it('new item, with the clientRequestId and whole base units', () => {
    expect(parseScanValues(start, REQUEST, null)).toEqual({
      errors: {},
      input: {
        mode: 'newItem',
        clientRequestId: REQUEST,
        name: 'Lettmelk',
        categoryKey: 'dairy',
        unit: 'ml',
        ingredient: { match: 'auto' },
        batch: {
          quantityBase: 1000,
          locationId: FRIDGE,
          expiry: null,
          priceOre: null,
          purchasedOn: null,
        },
      },
    });
  });

  it('a chosen ingredient and "not an ingredient"', () => {
    expect(parseScanValues({ ...start, ingredient: EGG }, REQUEST, null).input).toMatchObject({
      ingredient: { match: 'manual', ingredientId: EGG },
    });
    expect(parseScanValues({ ...start, ingredient: 'none' }, REQUEST, null).input).toMatchObject({
      ingredient: { match: 'none' },
    });
  });

  it('errors use the API field names', () => {
    const result = parseScanValues(
      { ...start, name: ' ', categoryKey: '', batch: { ...start.batch, amount: 'x' } },
      REQUEST,
      null,
    );
    expect(result.input).toBeUndefined();
    expect(result.errors).toEqual({
      name: 'validation.itemName.required',
      categoryKey: 'validation.category.required',
      'batch.quantityBase': expect.stringMatching(/^validation\.quantity\./),
    });
  });

  it('new batch on the existing item: only the batch, item fields are not checked', () => {
    const result = parseScanValues({ ...start, mode: 'existingItem', name: '' }, REQUEST, ITEM);
    expect(result.input).toEqual({
      mode: 'existingItem',
      clientRequestId: REQUEST,
      itemId: ITEM,
      batch: {
        quantityBase: 1000,
        locationId: FRIDGE,
        expiry: null,
        priceOre: null,
        purchasedOn: null,
      },
    });
  });

  it('changing the unit keeps the typed amount and picks a display unit for the new unit', () => {
    const changed = withUnit(start, 'g');
    expect(changed.unit).toBe('g');
    expect(changed.batch).toMatchObject({ amount: '1', displayUnit: 'g' });
  });
});
