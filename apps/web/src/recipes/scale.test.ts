import { describe, expect, it } from 'vitest';
import { recipeLine } from '../test/recipeFixtures';
import { scaleLines } from './scale';

describe('spec 09 FR-PLAN-002 scaling on the recipe page', () => {
  it('keeps everything as it is for the recipe’s own servings', () => {
    const line = recipeLine('Ris', { quantityBase: 250, status: 'enough', haveBase: 300 });
    expect(scaleLines([line], 4, 4)[0]).toMatchObject({ quantityBase: 250, status: 'enough' });
  });

  it('scales up, rounds up, and works out have/missing again', () => {
    const [ris, kylling, lok] = scaleLines(
      [
        recipeLine('Ris', { quantityBase: 250, status: 'enough', haveBase: 300 }),
        recipeLine('Kylling', { quantityBase: 400, status: 'enough', haveBase: 500 }),
        recipeLine('Løk', { quantityBase: 1, baseUnit: 'stk', status: 'missing' }),
      ],
      6,
      4,
    );
    expect(ris).toMatchObject({
      quantityBase: 375,
      rounded: false,
      status: 'notEnough',
      missingBase: 75,
    });
    expect(kylling).toMatchObject({ quantityBase: 600, status: 'notEnough', missingBase: 100 });
    expect(lok).toMatchObject({ quantityBase: 2, rounded: true, status: 'missing' });
  });

  it('scales down: what was too little can become enough', () => {
    const [line] = scaleLines(
      [
        recipeLine('Fløte', {
          quantityBase: 200,
          status: 'notEnough',
          haveBase: 150,
          missingBase: 50,
        }),
      ],
      2,
      4,
    );
    expect(line).toMatchObject({ quantityBase: 100, status: 'enough', missingBase: null });
  });

  it('"etter smak", staples and unknown amounts keep their status', () => {
    const lines = scaleLines(
      [
        recipeLine('Salt', { quantityBase: 5, status: 'staple' }),
        recipeLine('Pepper', { quantityBase: null, status: 'missing' }),
        recipeLine('Ost', { quantityBase: 100, status: 'unknownAmount' }),
      ],
      8,
      4,
    );
    expect(lines.map((l) => [l.quantityBase, l.status])).toEqual([
      [10, 'staple'],
      [null, 'missing'],
      [200, 'unknownAmount'],
    ]);
  });
});
