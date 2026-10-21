import { describe, expect, it } from 'vitest';
import { MAX_QUANTITY_BASE } from '../quantity/quantity';
import { buildAliasIndex } from '../recipes/matching';
import {
  mergeQuantity,
  newItemIngredientLink,
  sortShoppingItems,
  suggestFromRecipe,
  textIngredientId,
  type SuggestionSource,
} from './list';

describe('FR-SHOP-002 mergeQuantity', () => {
  it('adds amounts in the same unit', () => {
    expect(
      mergeQuantity({ quantityBase: 500, unit: 'ml' }, { quantityBase: 300, unit: 'ml' }),
    ).toEqual({ quantityBase: 800, unit: 'ml' });
  });

  it('a line without an amount stays without one', () => {
    expect(
      mergeQuantity({ quantityBase: null, unit: null }, { quantityBase: 300, unit: 'g' }),
    ).toEqual({ quantityBase: null, unit: null });
  });

  it('a recipe line without an amount ("etter smak") leaves the amount alone', () => {
    expect(
      mergeQuantity({ quantityBase: 2, unit: 'stk' }, { quantityBase: null, unit: 'stk' }),
    ).toEqual({ quantityBase: 2, unit: 'stk' });
  });

  it('another unit is not converted (nothing is rounded)', () => {
    expect(
      mergeQuantity({ quantityBase: 6, unit: 'stk' }, { quantityBase: 120, unit: 'g' }),
    ).toEqual({
      quantityBase: 6,
      unit: 'stk',
    });
  });

  it('keeps the amount instead of going above the largest quantity', () => {
    const existing = { quantityBase: MAX_QUANTITY_BASE, unit: 'g' as const };
    expect(mergeQuantity(existing, { quantityBase: 1, unit: 'g' })).toEqual(existing);
    expect(
      mergeQuantity(
        { quantityBase: MAX_QUANTITY_BASE - 1, unit: 'g' },
        { quantityBase: 1, unit: 'g' },
      ),
    ).toEqual({ quantityBase: MAX_QUANTITY_BASE, unit: 'g' });
  });

  it('stays whole numbers', () => {
    const { quantityBase } = mergeQuantity(
      { quantityBase: 1, unit: 'ml' },
      { quantityBase: 2, unit: 'ml' },
    );
    expect(Number.isInteger(quantityBase)).toBe(true);
    expect(quantityBase).toBe(3);
  });
});

const line = (over: Partial<SuggestionSource>): SuggestionSource => ({
  ingredientId: 'x',
  ingredientName: 'X',
  quantityBase: 200,
  baseUnit: 'g',
  optional: false,
  status: 'missing',
  missingBase: null,
  ...over,
});

describe('FR-SHOP-002 suggestFromRecipe', () => {
  const lines = [
    line({ ingredientId: 'mel', ingredientName: 'Hvetemel', status: 'enough' }),
    line({ ingredientId: 'melk', ingredientName: 'Melk', baseUnit: 'ml', quantityBase: 500 }),
    line({
      ingredientId: 'egg',
      ingredientName: 'Egg',
      baseUnit: 'stk',
      quantityBase: 3,
      status: 'notEnough',
      missingBase: 2,
    }),
    line({ ingredientId: 'smor', ingredientName: 'Smør', status: 'unknownAmount' }),
    line({ ingredientId: 'salt', ingredientName: 'Salt', status: 'staple', quantityBase: 5 }),
    line({ ingredientId: 'sukker', ingredientName: 'Sukker', optional: true, quantityBase: 30 }),
    line({ ingredientId: 'vanilje', ingredientName: 'Vanilje', quantityBase: null }),
  ];

  it('leaves out what the household has enough of', () => {
    const ids = suggestFromRecipe(lines, new Set()).map((s) => s.ingredientId);
    expect(ids).not.toContain('mel');
    expect(ids).toEqual(['melk', 'egg', 'smor', 'salt', 'sukker', 'vanilje']);
  });

  it('ticks only what is missing, with the missing amount', () => {
    const byId = new Map(suggestFromRecipe(lines, new Set()).map((s) => [s.ingredientId, s]));
    expect(byId.get('melk')).toMatchObject({
      reason: 'missing',
      quantityBase: 500,
      selected: true,
    });
    expect(byId.get('egg')).toMatchObject({ reason: 'notEnough', quantityBase: 2, selected: true });
    expect(byId.get('vanilje')).toMatchObject({
      reason: 'missing',
      quantityBase: null,
      selected: true,
    });
  });

  it('staples, optional ingredients and unknown amounts are shown unticked', () => {
    const byId = new Map(suggestFromRecipe(lines, new Set()).map((s) => [s.ingredientId, s]));
    expect(byId.get('salt')).toMatchObject({ reason: 'staple', selected: false });
    expect(byId.get('sukker')).toMatchObject({
      reason: 'optional',
      quantityBase: 30,
      selected: false,
    });
    expect(byId.get('smor')).toMatchObject({
      reason: 'unknownAmount',
      quantityBase: null,
      selected: false,
    });
  });

  it('an ingredient already on the list is unticked, whatever its status', () => {
    const byId = new Map(
      suggestFromRecipe(lines, new Set(['melk', 'salt'])).map((s) => [s.ingredientId, s]),
    );
    expect(byId.get('melk')).toMatchObject({ reason: 'onList', selected: false });
    expect(byId.get('salt')).toMatchObject({ reason: 'onList', selected: false });
  });

  it('an optional ingredient the household has enough of is not suggested', () => {
    expect(suggestFromRecipe([line({ optional: true, status: 'enough' })], new Set())).toEqual([]);
  });
});

describe('spec 06 sortShoppingItems', () => {
  it('open lines first (oldest first), then checked ones (last checked first)', () => {
    const items = [
      {
        id: 'c1',
        checked: true,
        checkedAt: '2026-10-21T10:00:00Z',
        createdAt: '2026-10-20T08:00:00Z',
      },
      { id: 'o2', checked: false, checkedAt: null, createdAt: '2026-10-21T09:00:00Z' },
      {
        id: 'c2',
        checked: true,
        checkedAt: '2026-10-21T11:00:00Z',
        createdAt: '2026-10-20T07:00:00Z',
      },
      { id: 'o1', checked: false, checkedAt: null, createdAt: '2026-10-21T08:00:00Z' },
    ];
    expect(sortShoppingItems(items).map((i) => i.id)).toEqual(['o1', 'o2', 'c2', 'c1']);
    expect(items[0]?.id).toBe('c1');
  });
});

const index = buildAliasIndex([
  { id: 'melk', name: 'Melk', aliases: ['lettmelk'] },
  { id: 'smor', name: 'Smør', aliases: [] },
]);

describe('FR-SHOP-001/003 ingredient links', () => {
  it('a text is linked only when it matches one ingredient', () => {
    expect(textIngredientId('Tine lettmelk 1 l', index)).toBe('melk');
    expect(textIngredientId('Melk og smør', index)).toBeNull();
    expect(textIngredientId('Tannkrem', index)).toBeNull();
  });

  it('a new item keeps the automatic link when its name already matches', () => {
    expect(newItemIngredientLink('Lettmelk', 'melk', index)).toEqual({
      ingredientMatch: 'auto',
      ingredientId: null,
    });
  });

  it('otherwise the ingredient is set by hand, so the item still matches the recipe', () => {
    expect(newItemIngredientLink('Q-melk fra butikken', 'smor', index)).toEqual({
      ingredientMatch: 'manual',
      ingredientId: 'smor',
    });
    expect(newItemIngredientLink('Melkesjokolade', 'melk', index)).toEqual({
      ingredientMatch: 'manual',
      ingredientId: 'melk',
    });
  });

  it('a line without an ingredient gives an ordinary item', () => {
    expect(newItemIngredientLink('Tannkrem', null, index)).toEqual({
      ingredientMatch: 'auto',
      ingredientId: null,
    });
  });
});
