import { describe, expect, it } from 'vitest';
import { buildAliasIndex } from '../recipes/matching';
import {
  entryDelta,
  planNeeds,
  scaleQuantity,
  suggestFromPlan,
  unplannedExpiring,
  type IngredientNeed,
  type PlanContribution,
  type PlanEntryInput,
  type PlanIngredient,
  type StockItemWithId,
} from './needs';

const today = '2026-10-24';

const ingredients = new Map<string, PlanIngredient>(
  (
    [
      { id: 'ris', name: 'Ris', baseUnit: 'g', isStaple: false, conversions: [] },
      { id: 'melk', name: 'Melk', baseUnit: 'ml', isStaple: false, conversions: [] },
      {
        id: 'lok',
        name: 'Løk',
        baseUnit: 'g',
        isStaple: false,
        conversions: [{ unit: 'stk', unitQty: 1, baseQty: 100 }],
      },
      { id: 'kylling', name: 'Kyllingfilet', baseUnit: 'g', isStaple: false, conversions: [] },
      { id: 'salt', name: 'Salt', baseUnit: 'g', isStaple: true, conversions: [] },
      { id: 'persille', name: 'Persille', baseUnit: 'g', isStaple: false, conversions: [] },
    ] satisfies PlanIngredient[]
  ).map((i) => [i.id, i]),
);
const ALIASES: Record<string, string[]> = { ris: ['jasminris'], melk: ['lettmelk'] };
const index = buildAliasIndex(
  [...ingredients.values()].map((i) => ({ id: i.id, name: i.name, aliases: ALIASES[i.id] ?? [] })),
);

let itemCounter = 0;
function item(
  name: string,
  unit: StockItemWithId['unit'],
  batches: StockItemWithId['batches'],
): StockItemWithId {
  return {
    id: `item-${++itemCounter}`,
    name,
    unit,
    batches,
    ingredientMatch: 'auto',
    ingredientId: null,
  };
}
const batch = (
  quantityBase: number,
  expiryKind: 'best_before' | 'use_by' | null = null,
  expiryDate: string | null = null,
) => ({ quantityBase, expiryKind, expiryDate });

function entry(
  id: string,
  date: string,
  lines: PlanEntryInput['lines'],
  overrides: Partial<PlanEntryInput> = {},
): PlanEntryInput {
  return {
    id,
    date,
    meal: 'dinner',
    recipeTitle: `Rett ${id}`,
    servings: 4,
    recipeServings: 4,
    lines,
    ...overrides,
  };
}
const line = (ingredientId: string, quantityBase: number | null, optional = false) => ({
  ingredientId,
  quantityBase,
  optional,
});

function needs(
  entries: PlanEntryInput[],
  items: StockItemWithId[] = [],
  contributions: PlanContribution[] = [],
) {
  return planNeeds({ entries, ingredients, items, index, today, contributions });
}
const need = (list: IngredientNeed[], id: string) => {
  const found = list.find((n) => n.ingredientId === id);
  if (!found) throw new Error(`no need for ${id}`);
  return found;
};

describe('spec 09 FR-PLAN-002 scaling', () => {
  it.each([
    [400, 2, 4, 200, false], // exact
    [100, 3, 4, 75, false], // exact
    [1, 6, 4, 2, true], // 1,5 egg → 2: rounded up, never down
    [1, 3, 4, 1, true], // 0,75 → 1
    [250, 1, 3, 84, true], // 83,3 → 84
    [500, 4, 4, 500, false], // as written
  ])('%i for %i of %i servings → %i (rounded: %s)', (q, servings, recipe, expected, rounded) => {
    expect(scaleQuantity(q, servings, recipe)).toEqual({ quantityBase: expected, rounded });
  });

  it('"etter smak" stays without an amount', () => {
    expect(scaleQuantity(null, 8, 4)).toEqual({ quantityBase: null, rounded: false });
  });

  it('never above the largest quantity the app stores', () => {
    expect(scaleQuantity(100_000_000, 50, 1).quantityBase).toBe(100_000_000);
  });
});

describe('spec 09 FR-PLAN-003 needs and the inventory', () => {
  it('sums the scaled amounts of every entry and subtracts what the household has', () => {
    const result = needs(
      [
        entry('a', '2026-10-25', [line('ris', 200)]),
        entry('b', '2026-10-26', [line('ris', 300)], { servings: 2 }), // 150
      ],
      [item('Jasminris', 'g', [batch(250)])],
    );
    expect(need(result, 'ris')).toMatchObject({
      needBase: 350,
      coveredBase: 250,
      missingBase: 100,
      status: 'notEnough',
      toBuyBase: 100,
      itemNames: ['Jasminris'],
    });
    // The earliest meal gets the inventory first.
    expect(need(result, 'ris').entries.map((e) => [e.entryId, e.shortfallBase])).toEqual([
      ['a', 0],
      ['b', 100],
    ]);
  });

  it('a batch with a use-by date only counts for meals on or before that date', () => {
    const result = needs(
      [
        entry('a', '2026-10-25', [line('kylling', 300)]),
        entry('b', '2026-10-27', [line('kylling', 300)]),
      ],
      [item('Kyllingfilet', 'g', [batch(600, 'use_by', '2026-10-26')])],
    );
    const kylling = need(result, 'kylling');
    expect(kylling.entries.map((e) => e.shortfallBase)).toEqual([0, 300]);
    expect(kylling.missingBase).toBe(300);
  });

  it('shares out greedily: the batch that goes off first is used first', () => {
    // Using the undated batch on the 25th would leave only the use-by batch, which is too old on the 27th.
    const result = needs(
      [
        entry('a', '2026-10-25', [line('kylling', 200)]),
        entry('b', '2026-10-27', [line('kylling', 200)]),
      ],
      [
        item('Kyllingfilet', 'g', [batch(200)]),
        item('Kyllingfilet', 'g', [batch(200, 'use_by', '2026-10-26')]),
      ],
    );
    expect(need(result, 'kylling')).toMatchObject({ missingBase: 0, status: 'enough' });
  });

  it('use-by passed never counts and is named; best before passed still counts', () => {
    const result = needs(
      [entry('a', '2026-10-25', [line('melk', 500)])],
      [
        item('Lettmelk', 'ml', [batch(1000, 'use_by', '2026-10-23')]),
        item('Melk', 'ml', [batch(300, 'best_before', '2026-10-20')]),
      ],
    );
    expect(need(result, 'melk')).toMatchObject({
      coveredBase: 300,
      missingBase: 200,
      excludedUseByItems: ['Lettmelk'],
      itemNames: ['Melk'],
    });
  });

  it('converts batch by batch and rounds down (phase 5 rules)', () => {
    const result = needs(
      [entry('a', '2026-10-25', [line('lok', 250)])],
      [item('Gul løk', 'stk', [batch(2)])],
    );
    expect(need(result, 'lok')).toMatchObject({
      coveredBase: 200,
      missingBase: 50,
      approximate: true,
    });
  });

  it('present in a unit without a conversion: unknown amount, not "missing"', () => {
    const result = needs(
      [entry('a', '2026-10-25', [line('ris', 200)])],
      [item('Ris', 'stk', [batch(1)])],
    );
    expect(need(result, 'ris')).toMatchObject({ status: 'unknownAmount', unknownAmount: true });
  });

  it('a batch that cannot be used on the planned day does not make it "some"', () => {
    const result = needs(
      [entry('a', '2026-10-27', [line('kylling', 200)])],
      [item('Kyllingfilet', 'g', [batch(500, 'use_by', '2026-10-25')])],
    );
    expect(need(result, 'kylling').status).toBe('missing');
  });

  it('"etter smak": enough when it is there, missing without an amount when it is not', () => {
    const present = needs(
      [entry('a', '2026-10-25', [line('persille', null)])],
      [item('Persille', 'g', [batch(20)])],
    );
    expect(need(present, 'persille')).toMatchObject({ status: 'enough', untilTaste: true });
    const absent = needs([entry('a', '2026-10-25', [line('persille', null)])]);
    expect(need(absent, 'persille')).toMatchObject({ status: 'missing', toBuyBase: null });
  });

  it('staples are "sjekk at du har", and optional only when optional everywhere', () => {
    const result = needs([
      entry('a', '2026-10-25', [line('salt', 5), line('persille', 10, true)]),
      entry('b', '2026-10-26', [line('persille', 10)]),
    ]);
    expect(need(result, 'salt').status).toBe('staple');
    expect(need(result, 'persille').optional).toBe(false);
    const onlyOptional = needs([entry('a', '2026-10-25', [line('persille', 10, true)])]);
    expect(need(onlyOptional, 'persille').optional).toBe(true);
  });

  it('marks scaled amounts that were rounded up ("ca.")', () => {
    const result = needs([entry('a', '2026-10-25', [line('lok', 100)], { servings: 3 })]);
    expect(need(result, 'lok')).toMatchObject({ needBase: 75, rounded: false });
    const rounded = needs([entry('a', '2026-10-25', [line('lok', 250)], { servings: 1 })]);
    expect(need(rounded, 'lok')).toMatchObject({ needBase: 63, rounded: true });
  });

  it('ignores lines whose ingredient is unknown, and sorts by name', () => {
    const result = needs([
      entry('a', '2026-10-25', [line('ukjent', 1), line('ris', 1), line('kylling', 1)]),
    ]);
    expect(result.map((n) => n.ingredientName)).toEqual(['Kyllingfilet', 'Ris']);
  });
});

describe('spec 09 FR-PLAN-004 adding the same need twice never doubles it', () => {
  const plan = [entry('a', '2026-10-25', [line('ris', 400)])];

  it('what an entry already added is subtracted', () => {
    const result = needs(plan, [], [{ entryId: 'a', ingredientId: 'ris', quantityBase: 400 }]);
    expect(need(result, 'ris')).toMatchObject({
      missingBase: 400,
      onListBase: 400,
      toBuyBase: 0,
      alreadyAdded: true,
    });
  });

  it('more servings later: only the increase is left to add', () => {
    const more = [entry('a', '2026-10-25', [line('ris', 400)], { servings: 6 })]; // 600
    const result = needs(more, [], [{ entryId: 'a', ingredientId: 'ris', quantityBase: 400 }]);
    expect(need(result, 'ris').toBuyBase).toBe(200);
  });

  it('fewer servings later: nothing is taken off the list', () => {
    expect(entryDelta({ shortfallBase: 100, addedBase: 400 })).toBe(0);
  });

  it('another entry with the same recipe is its own need', () => {
    const twice = [...plan, entry('b', '2026-10-26', [line('ris', 400)])];
    const result = needs(twice, [], [{ entryId: 'a', ingredientId: 'ris', quantityBase: 400 }]);
    expect(need(result, 'ris').toBuyBase).toBe(400);
  });

  it('"etter smak" added once without an amount is not suggested again', () => {
    const result = needs(
      [entry('a', '2026-10-25', [line('persille', null)])],
      [],
      [{ entryId: 'a', ingredientId: 'persille', quantityBase: null }],
    );
    expect(need(result, 'persille')).toMatchObject({ toBuyBase: 0, alreadyAdded: true });
  });
});

describe('spec 09 FR-PLAN-004 suggestions (spec 06 rules)', () => {
  it('ticks what is missing; staples, optional, unknown amounts and added ones are unticked', () => {
    const result = needs(
      [
        entry('a', '2026-10-25', [
          line('ris', 200),
          line('kylling', 400),
          line('salt', 5),
          line('persille', 10, true),
          line('lok', 100),
          line('melk', 100),
        ]),
      ],
      [
        item('Kyllingfilet', 'g', [batch(100)]),
        item('Gul løk', 'ml', [batch(1)]),
        item('Melk', 'ml', [batch(1000)]),
      ],
      [{ entryId: 'a', ingredientId: 'ris', quantityBase: 200 }],
    );
    const byName = Object.fromEntries(
      suggestFromPlan(result).map((s) => [
        s.ingredientName,
        [s.reason, s.selected, s.quantityBase],
      ]),
    );
    expect(byName).toEqual({
      Kyllingfilet: ['notEnough', true, 300],
      Løk: ['unknownAmount', false, null],
      Persille: ['optional', false, 10],
      Ris: ['onList', false, null],
      Salt: ['staple', false, 5],
    });
  });
});

describe('spec 09 FR-PLAN-003 / FR-INV-005 "går ut denne uka"', () => {
  it('lists what goes off in the period and no planned recipe uses, most urgent first', () => {
    const items = [
      item('Kyllingfilet', 'g', [batch(400, 'use_by', '2026-10-26')]),
      item('Yoghurt', 'g', [
        batch(500, 'best_before', '2026-10-27'),
        batch(500, 'best_before', '2026-10-25'),
      ]),
      item('Rømme', 'ml', [batch(300, 'use_by', '2026-10-24')]),
      item('Gammel melk', 'ml', [batch(1000, 'use_by', '2026-10-23')]),
      item('Ost', 'g', [batch(500, 'best_before', '2026-11-20')]),
      item('Tom pakke', 'g', [batch(0, 'use_by', '2026-10-25')]),
    ];
    const result = unplannedExpiring({
      items,
      index,
      plannedIngredientIds: new Set(['kylling']),
      today,
      to: '2026-10-28',
      limit: 10,
    });
    expect(result.map((r) => [r.itemName, r.expiryKind, r.daysLeft])).toEqual([
      ['Rømme', 'use_by', 0],
      ['Yoghurt', 'best_before', 1],
    ]);
  });

  it('stops at the limit', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item(`Vare ${i}`, 'g', [batch(1, 'best_before', '2026-10-25')]),
    );
    expect(
      unplannedExpiring({
        items,
        index,
        plannedIngredientIds: new Set(),
        today,
        to: '2026-10-25',
        limit: 10,
      }),
    ).toHaveLength(10);
  });
});
