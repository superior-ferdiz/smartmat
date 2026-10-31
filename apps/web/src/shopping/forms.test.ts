import { describe, expect, it } from 'vitest';
import type { Suggestion } from '@smartmat/shared';
import { FRIDGE, item } from '../test/inventoryFixtures';
import { ingredient, shoppingItem } from '../test/shoppingFixtures';
import {
  amountValues,
  initialStockValues,
  itemChoices,
  NEW_ITEM,
  parseLineForm,
  parseOptionalAmount,
  parseStockValues,
  parseSuggestions,
  suggestionValues,
} from './forms';

describe('FR-SHOP-001 line form', () => {
  it('turns "1,5" kg into 1500 g, and an empty amount into no quantity', () => {
    expect(parseLineForm({ text: ' Mel ', amount: '1,5', displayUnit: 'kg' })).toEqual({
      errors: {},
      input: { text: 'Mel', quantity: { quantityBase: 1500, unit: 'g' } },
    });
    expect(
      parseLineForm({ text: 'Mel', amount: ' ', displayUnit: 'kg' }).input?.quantity,
    ).toBeNull();
  });

  it('reports the text and the amount as field errors', () => {
    expect(parseLineForm({ text: '', amount: '1,2345', displayUnit: 'kg' }).errors).toEqual({
      text: 'validation.shoppingText.required',
      quantity: 'validation.quantity.notWhole',
    });
    expect(parseOptionalAmount({ amount: '0', displayUnit: 'stk' }).error).toBe(
      'validation.quantity.notPositive',
    );
  });

  it('shows a stored amount in the unit that reads best', () => {
    expect(amountValues(1500, 'g')).toEqual({ amount: '1,5', displayUnit: 'kg' });
    expect(amountValues(250, 'ml')).toEqual({ amount: '250', displayUnit: 'ml' });
    expect(amountValues(null, null)).toEqual({ amount: '', displayUnit: 'stk' });
  });
});

const suggestion = (over: Partial<Suggestion>): Suggestion => ({
  ingredientId: 'melk',
  ingredientName: 'Melk',
  quantityBase: 500,
  baseUnit: 'ml',
  reason: 'missing',
  selected: true,
  ...over,
});

describe('FR-SHOP-002 suggestions form', () => {
  it('sends only ticked suggestions, in the ingredient base unit', () => {
    const suggestions = [
      suggestion({}),
      suggestion({ ingredientId: 'salt', reason: 'staple', selected: false, baseUnit: 'g' }),
      suggestion({ ingredientId: 'egg', baseUnit: 'stk', quantityBase: null }),
    ];
    const values = suggestions.map(suggestionValues);
    values[0] = { ...values[0]!, amount: '0,75', displayUnit: 'l' };
    expect(parseSuggestions(suggestions, values)).toEqual({
      errors: {},
      input: {
        lines: [
          { ingredientId: 'melk', quantityBase: 750 },
          { ingredientId: 'egg', quantityBase: null },
        ],
      },
    });
  });

  it('nothing ticked is an error for the whole form', () => {
    const suggestions = [suggestion({ selected: false })];
    expect(parseSuggestions(suggestions, suggestions.map(suggestionValues)).errors).toEqual({
      _form: 'validation.shopping.nothingSelected',
    });
  });
});

describe('FR-SHOP-003 stock form', () => {
  const melk = ingredient('Melk', { baseUnit: 'ml', aliases: ['lettmelk'], categoryKey: 'dairy' });
  const lettmelk = item('Tine lettmelk', { unit: 'ml' });
  const ost = item('Norvegia', { unit: 'g' });

  it('items linked to the line ingredient come first', () => {
    const line = shoppingItem('Melk', { ingredientId: melk.id });
    expect(itemChoices(line, [ost, lettmelk], [melk])).toEqual({
      linked: [lettmelk],
      others: [ost],
    });
    expect(itemChoices(shoppingItem('Tannkrem'), [ost], [melk]).linked).toEqual([]);
  });

  it('guesses the linked item, with the amount from the line', () => {
    const line = shoppingItem('Melk', { ingredientId: melk.id, quantityBase: 1500, unit: 'ml' });
    expect(initialStockValues(line, [lettmelk], [melk], FRIDGE)).toMatchObject({
      target: lettmelk.id,
      unit: 'ml',
      amount: '1,5',
      displayUnit: 'l',
      locationId: FRIDGE,
    });
  });

  it('without a linked item: a new item named like the line, in the ingredient category', () => {
    const line = shoppingItem('Melk', { ingredientId: melk.id });
    expect(initialStockValues(line, [ost], [melk], FRIDGE)).toMatchObject({
      target: NEW_ITEM,
      name: 'Melk',
      categoryKey: 'dairy',
      unit: 'ml',
      amount: '',
    });
    expect(initialStockValues(shoppingItem('Tannkrem'), [], [], FRIDGE)).toMatchObject({
      categoryKey: 'other',
      unit: 'stk',
    });
  });

  it('builds the request, or field errors named like the API', () => {
    const line = shoppingItem('Melk', { ingredientId: melk.id, quantityBase: 1000, unit: 'ml' });
    const value = initialStockValues(line, [], [melk], FRIDGE);
    expect(
      parseStockValues([{ ...value, expiryKind: 'use_by', expiryDate: '2026-10-25' }], []),
    ).toEqual({
      errors: {},
      input: {
        lines: [
          {
            shoppingItemId: line.id,
            target: { kind: 'new', name: 'Melk', categoryKey: 'dairy', unit: 'ml' },
            quantityBase: 1000,
            locationId: FRIDGE,
            expiry: { kind: 'use_by', date: '2026-10-25' },
          },
        ],
      },
    });
    expect(
      parseStockValues(
        [{ ...value, amount: '', locationId: '', name: '', expiryKind: 'best_before' }],
        [],
      ).errors,
    ).toEqual({
      'lines.0.quantityBase': 'validation.quantity.required',
      'lines.0.locationId': 'validation.location.required',
      'lines.0.target.name': 'validation.itemName.required',
      'lines.0.expiry.date': 'validation.expiry.dateRequired',
    });
  });

  it('onto an existing item: the amount is in that item’s unit', () => {
    const line = shoppingItem('Ost');
    const value = {
      ...initialStockValues(line, [], [], FRIDGE),
      target: ost.id,
      amount: '0,5',
      displayUnit: 'kg' as const,
    };
    expect(parseStockValues([value], [ost]).input?.lines[0]).toMatchObject({
      target: { kind: 'existing', itemId: ost.id },
      quantityBase: 500,
    });
  });
});
