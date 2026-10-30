import { describe, expect, it } from 'vitest';
import type { ParsedReceiptLineResponse, ReceiptSuggestion } from '@smartmat/shared';
import { fromSuggestion, lineFlags, shrinkImage } from './receiptForm';

// Spec 08 FR-RCPT-005. Made-up values.
const line = (patch: Partial<ParsedReceiptLineResponse>): ParsedReceiptLineResponse => ({
  description: 'GULROT 1KG',
  amountOre: 1990,
  kind: 'item',
  discountOre: 0,
  count: null,
  weightG: null,
  unitPriceOre: null,
  vatRate: null,
  suggestedKind: 'food',
  confidence: 90,
  flags: [],
  uncertain: false,
  ...patch,
});

const suggestion: ReceiptSuggestion = {
  storeName: 'Extra',
  storeGuessed: false,
  chain: 'extra',
  purchasedOn: '2026-02-03',
  totalOre: 13232,
  linesShown: false,
  lines: [],
  linesSumOre: 0,
  sumMatches: false,
};

describe('FR-RCPT-005 fromSuggestion', () => {
  it('ADR-0017: without line suggestions the form starts as "only a total" with store, date and total', () => {
    const start = fromSuggestion(suggestion, '2026-10-24');
    expect(start.values).toMatchObject({
      storeName: 'Extra',
      purchasedOn: '2026-02-03',
      mode: 'total',
      total: '132,32',
    });
    expect(start.dateGuessed).toBe(false);
  });

  it('ADR-0017: lines the server sent are not filled in while line suggestions are off', () => {
    const start = fromSuggestion(
      { ...suggestion, linesShown: false, lines: [line({ description: 'GULROT 1KG' })] },
      '2026-10-24',
    );
    expect(start.values.mode).toBe('total');
    expect(start.values.lines.map((l) => l.description)).toEqual(['']);
    expect(start.parsedByKey.size).toBe(0);
  });

  it('a date that was not read starts as today, and says so', () => {
    const start = fromSuggestion(
      { ...suggestion, purchasedOn: null, totalOre: null, storeName: null },
      '2026-10-24',
    );
    expect(start.values).toMatchObject({ storeName: '', purchasedOn: '2026-10-24', total: '' });
    expect(start.dateGuessed).toBe(true);
  });

  it('with line suggestions: lines with amount and kind, weight or count as the quantity, food ticked for the inventory', () => {
    const start = fromSuggestion(
      {
        ...suggestion,
        linesShown: true,
        lines: [
          line({ description: 'BANAN KG', amountOre: 2392, weightG: 1196, unitPriceOre: 2000 }),
          line({ description: 'YOGHURT', amountOre: 5960, count: 4, unitPriceOre: 1490 }),
          line({ description: 'PANT', amountOre: 200, kind: 'deposit', suggestedKind: 'nonFood' }),
          line({ description: 'UKJENT', amountOre: null, flags: ['noAmount'], uncertain: true }),
        ],
      },
      '2026-10-24',
      'fridge-id',
    );
    expect(start.values.mode).toBe('lines');
    expect(
      start.values.lines.map((l) => [
        l.description,
        l.amount,
        l.kind,
        l.unit,
        l.quantity,
        l.locationId,
        l.toInventory,
      ]),
    ).toEqual([
      ['BANAN KG', '23,92', 'food', 'g', '1196', 'fridge-id', true],
      ['YOGHURT', '59,60', 'food', 'stk', '4', 'fridge-id', true],
      ['PANT', '2,00', 'nonFood', 'stk', '1', 'fridge-id', false],
      ['UKJENT', '', 'food', 'stk', '1', 'fridge-id', true],
    ]);
    // No category is guessed: the user decides (and can untick a line).
    expect(start.values.lines.every((l) => l.categoryKey === '')).toBe(true);
    const unknown = start.values.lines[3]!;
    expect(lineFlags(start.parsedByKey.get(unknown.key))).toEqual(['noAmount']);
  });
});

describe('FR-RCPT-005 without a storage place', () => {
  it('nothing is ticked for the inventory (the form would have nowhere to put it)', () => {
    const start = fromSuggestion(
      { ...suggestion, linesShown: true, lines: [line({ description: 'MELK', amountOre: 2490 })] },
      '2026-10-24',
    );
    expect(start.values.lines[0]?.toInventory).toBe(false);
  });
});

describe('shrinkImage', () => {
  it('gives the file back when the browser cannot draw it (jsdom has no createImageBitmap)', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'k.jpg', { type: 'image/jpeg' });
    expect(await shrinkImage(file)).toBe(file);
  });
});
