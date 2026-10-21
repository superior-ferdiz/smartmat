import { describe, expect, it } from 'vitest';
import { planUndo, wasteValue } from './service';

const base = { id: 'e', batchId: 'b', fromLocationId: null, toLocationId: null };

describe('FR-INV-008 planUndo', () => {
  it.each([
    ['add', 500, -500],
    ['consume', -200, 200],
    ['discard', -300, 300],
    ['adjust', 150, -150],
    ['adjust', -150, 150],
  ] as const)('%s %i → change the quantity by %i', (type, deltaBase, delta) => {
    expect(planUndo({ ...base, type, deltaBase })).toEqual({
      kind: 'quantity',
      batchId: 'b',
      delta,
    });
  });

  it('a move goes back to where it came from', () => {
    expect(
      planUndo({
        ...base,
        type: 'move',
        deltaBase: 0,
        fromLocationId: 'fridge',
        toLocationId: 'pantry',
      }),
    ).toEqual({ kind: 'move', batchId: 'b', toLocationId: 'fridge' });
  });

  it('cannot undo: an undo, an event whose batch is gone, a move whose old location is gone', () => {
    expect(planUndo({ ...base, type: 'undo', deltaBase: 100 })).toBeNull();
    expect(planUndo({ ...base, type: 'consume', deltaBase: -1, batchId: null })).toBeNull();
    expect(planUndo({ ...base, type: 'move', deltaBase: 0, fromLocationId: null })).toBeNull();
  });
});

describe('FR-INV-007 wasteValue', () => {
  it('actual if given (also 0), else estimated from the price, else unknown', () => {
    expect(wasteValue({ priceOre: 2490, initialQuantityBase: 1000 }, 250, 1500)).toEqual({
      valueOre: 1500,
      basis: 'actual',
    });
    expect(wasteValue({ priceOre: 2490, initialQuantityBase: 1000 }, 250, 0)).toEqual({
      valueOre: 0,
      basis: 'actual',
    });
    expect(wasteValue({ priceOre: 2490, initialQuantityBase: 1000 }, 250, null)).toEqual({
      valueOre: 623,
      basis: 'estimated',
    });
    expect(wasteValue({ priceOre: null, initialQuantityBase: 1000 }, 250)).toEqual({
      valueOre: null,
      basis: 'unknown',
    });
  });
});
