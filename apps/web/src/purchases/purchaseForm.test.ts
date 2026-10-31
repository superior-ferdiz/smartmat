import { describe, expect, it } from 'vitest';
import { purchase, line } from '../test/purchaseFixtures';
import {
  emptyLine,
  emptyPurchase,
  fromPurchase,
  oreToInput,
  parsePurchaseValues,
  runningTotal,
  type LineFormValues,
  type PurchaseFormValues,
} from './purchaseForm';

const FRIDGE = '0199f0a0-0000-7000-8000-00000000f001';
const RICE = '0199f0a0-0000-7000-8000-00000000a001';
const noItems = () => undefined;

function form(lines: Partial<LineFormValues>[], extra: Partial<PurchaseFormValues> = {}) {
  return {
    ...emptyPurchase('2026-10-21'),
    lines: lines.map((l) => ({ ...emptyLine(), ...l })),
    ...extra,
  };
}

describe('FR-BUD-001 parsePurchaseValues', () => {
  it('Norwegian amounts become whole øre; the store is trimmed, empty means none', () => {
    const { body, errors } = parsePurchaseValues(
      form(
        [
          { description: 'Lettmelk', categoryKey: 'dairy', amount: '24,90' },
          { description: 'Oppvask', kind: 'nonFood', amount: '39,-' },
        ],
        { storeName: '  ' },
      ),
      noItems,
    );
    expect(errors).toEqual({});
    expect(body).toEqual({
      storeName: null,
      purchasedOn: '2026-10-21',
      lines: [
        {
          description: 'Lettmelk',
          kind: 'food',
          categoryKey: 'dairy',
          amountOre: 2490,
          toInventory: null,
        },
        {
          description: 'Oppvask',
          kind: 'nonFood',
          categoryKey: null,
          amountOre: 3900,
          toInventory: null,
        },
      ],
    });
  });

  it('only a total: no lines are sent, whatever is in them', () => {
    const { body } = parsePurchaseValues(
      form([{ description: 'glemt', amount: 'x' }], { mode: 'total', total: '1 234,50' }),
      noItems,
    );
    expect(body).toMatchObject({ totalOre: 123_450, lines: [] });
  });

  it('error keys are the API field names, so server errors land on the same fields', () => {
    const { errors, body } = parsePurchaseValues(
      form(
        [
          { description: '', amount: '24,999' },
          { description: 'Kjøttdeig', amount: '-5' },
        ],
        { purchasedOn: '' },
      ),
      noItems,
    );
    expect(body).toBeUndefined();
    expect(errors).toEqual({
      purchasedOn: 'validation.purchase.dateRequired',
      'lines.0.amountOre': 'validation.ore.too_many_decimals',
      'lines.0.description': 'validation.lineDescription.required',
      'lines.0.categoryKey': 'validation.category.required',
      'lines.1.amountOre': 'validation.ore.negative',
      'lines.1.categoryKey': 'validation.category.required',
    });
  });

  it('the same limits as the server (shared schema): a line above 100 000 kr', () => {
    const { errors } = parsePurchaseValues(
      form([{ description: 'Biff', categoryKey: 'meat', amount: '100 000,01' }]),
      noItems,
    );
    expect(errors).toEqual({ 'lines.0.amountOre': 'validation.purchase.lineTooLarge' });
  });

  it('only a total, but nothing typed', () => {
    const { errors } = parsePurchaseValues(form([], { mode: 'total', total: '' }), noItems);
    expect(errors).toEqual({ totalOre: 'validation.ore.empty' });
  });
});

describe('FR-BUD-002 parsePurchaseValues: into the inventory', () => {
  const milk = { description: 'Lettmelk', categoryKey: 'dairy' as const, amount: '24,90' };

  it('a new item: "1,75" l → 1750 ml, with place and date', () => {
    const { body, errors } = parsePurchaseValues(
      form([
        {
          ...milk,
          toInventory: true,
          unit: 'ml',
          quantity: '1,75',
          displayUnit: 'l',
          locationId: FRIDGE,
          expiryKind: 'best_before',
          expiryDate: '2026-10-28',
        },
      ]),
      noItems,
    );
    expect(errors).toEqual({});
    expect(body?.lines[0]?.toInventory).toEqual({
      unit: 'ml',
      quantityBase: 1750,
      locationId: FRIDGE,
      expiry: { kind: 'best_before', date: '2026-10-28' },
    });
  });

  it('an existing item is read in its own unit (kg for an item in grams)', () => {
    const { body } = parsePurchaseValues(
      form([
        {
          ...milk,
          toInventory: true,
          itemId: RICE,
          quantity: '1,5',
          displayUnit: 'kg',
          locationId: FRIDGE,
        },
      ]),
      (id) => (id === RICE ? 'g' : undefined),
    );
    expect(body?.lines[0]?.toInventory).toEqual({
      itemId: RICE,
      quantityBase: 1500,
      locationId: FRIDGE,
      expiry: null,
    });
  });

  it('missing quantity, place and date are field errors under toInventory', () => {
    const { errors } = parsePurchaseValues(
      form([{ ...milk, toInventory: true, expiryKind: 'use_by' }]),
      noItems,
    );
    expect(errors).toEqual({
      'lines.0.toInventory.quantityBase': 'validation.quantity.required',
      'lines.0.toInventory.locationId': 'validation.location.required',
      'lines.0.toInventory.expiry.date': 'validation.expiry.dateRequired',
    });
  });

  it('non-food and lines already in the inventory send no toInventory', () => {
    const { body } = parsePurchaseValues(
      form([
        { description: 'Såpe', kind: 'nonFood', amount: '10', toInventory: true, quantity: '1' },
        { ...milk, id: 'x', linkedItemName: 'Lettmelk', toInventory: true, quantity: '1' },
      ]),
      noItems,
    );
    expect(body?.lines.map((l) => l.toInventory)).toEqual([null, null]);
    expect(body?.lines[1]).toMatchObject({ id: 'x' });
  });
});

describe('runningTotal', () => {
  it('adds the amounts that can be read, and says when some could not', () => {
    const lines = [
      { ...emptyLine(), amount: '24,90' },
      { ...emptyLine(), amount: '59,90' },
    ];
    expect(runningTotal(lines)).toEqual({ ore: 8480, complete: true });
    expect(runningTotal([...lines, { ...emptyLine(), amount: '' }])).toEqual({
      ore: 8480,
      complete: false,
    });
    // 0.1 + 0.2 in kroner is exactly 0,30 kr here.
    expect(
      runningTotal([
        { ...emptyLine(), amount: '0,1' },
        { ...emptyLine(), amount: '0,2' },
      ]).ore,
    ).toBe(30);
  });
});

describe('FR-BUD-005 fromPurchase', () => {
  it('a saved purchase becomes form values that parse back to the same lines', () => {
    const saved = purchase({
      storeName: null,
      lines: [
        line('Lettmelk', {
          amountOre: 2490,
          batch: { id: 'b', itemId: 'i', itemName: 'Lettmelk', untouched: true },
        }),
        line('Oppvask', { kind: 'nonFood', categoryKey: null, amountOre: 3900 }),
      ],
    });
    const values = fromPurchase(saved);
    expect(values).toMatchObject({ storeName: '', mode: 'lines', total: '' });
    expect(values.lines.map((l) => [l.amount, l.linkedItemName])).toEqual([
      ['24,90', 'Lettmelk'],
      ['39,00', null],
    ]);
    const { body } = parsePurchaseValues(values, noItems);
    expect(body?.lines.map((l) => [l.id, l.amountOre])).toEqual(
      saved.lines.map((l) => [l.id, l.amountOre]),
    );
  });

  it('a purchase with only a total opens in total mode', () => {
    const values = fromPurchase(purchase({ lines: [], totalOre: 123_405 }));
    expect(values).toMatchObject({ mode: 'total', total: '1234,05', lines: [] });
  });

  it('oreToInput', () => {
    expect([oreToInput(0), oreToInput(5), oreToInput(2490), oreToInput(100_000)]).toEqual([
      '0,00',
      '0,05',
      '24,90',
      '1000,00',
    ]);
  });
});
