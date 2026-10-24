import { describe, expect, it } from 'vitest';
import { parseReceiptText } from '@smartmat/shared';
import {
  amountsOnLine,
  answerKeySchema,
  scoreLevel1,
  scoreLevel2,
  substringCer,
  type AnswerKey,
} from './score';

// Made-up receipt: no real store, number or purchase.
const key: AnswerKey = answerKeySchema.parse({
  id: 'fiktiv-1',
  chain: 'kiwi',
  date: '2026-01-15',
  time: '10:05',
  receiptNo: '1234',
  totalOre: 3290,
  articleCount: 2,
  lines: [
    { text: 'GULROT POSE 1KG', amountOre: 2490, kind: 'item' },
    { text: '+ Pant', amountOre: 300, kind: 'deposit' },
    { text: 'BRUS LIME 0,5L', amountOre: 500, kind: 'item' },
  ],
  vat: [],
  discountOre: 0,
  transcribedBy: 'test',
  checkedBy: null,
});

describe('OCR pilot scoring (spec 08)', () => {
  it('substringCer is 0 for an exact part of a longer line and grows with errors', () => {
    expect(substringCer('GULROT POSE', 'GULROT POSE 1KG 15% 24,90')).toBe(0);
    expect(substringCer('GULROT', 'GUIROT')).toBeCloseTo(1 / 6);
    expect(substringCer('gulrot', 'GULROT')).toBe(0);
    expect(substringCer('ABC', '')).toBe(1);
  });

  it('reads amounts with a point or a comma, but not parts of longer numbers', () => {
    expect(amountsOnLine('SUM 151.38 og 24,90')).toEqual([15138, 2490]);
    expect(amountsOnLine('ORG 984.981.384 12.3')).toEqual([]);
    expect(amountsOnLine('0.946 kg 31.90 kr/kg')).toEqual([3190]);
  });

  it('scores a clean reading as all found', () => {
    const score = scoreLevel1(key, [
      'KIWI 999 FIKTIV',
      '15.01.26 10:05',
      'GULROT POSE 1KG 15% 24,90',
      '+ Pant 0% 3,00',
      'BRUS LIME 0,5L 15% 5,00',
      'Sum 2 varer 32,90',
    ]);
    expect(score).toMatchObject({
      chain: true,
      date: true,
      total: true,
      items: { found: 2, amountExact: 2, of: 2 },
      deposits: { found: 1, amountExact: 1, of: 1 },
    });
  });

  it('accepts an amount on the next line, and counts a wrong amount as not exact', () => {
    const score = scoreLevel1(key, [
      'GULROT POSE 1KG',
      '24,90',
      '+ Pant 3,00',
      'BRUS LIME 0,5L 5,60',
    ]);
    expect(score.items).toEqual({ found: 2, amountExact: 1, of: 2 });
    expect(score.total).toBe(false);
    expect(score.chain).toBe(false);
  });

  it('a total needs a total word on the same line', () => {
    expect(scoreLevel1(key, ['32,90']).total).toBe(false);
    expect(scoreLevel1(key, ['TOTALT (2 Artikler) 32.90']).total).toBe(true);
  });

  it('a garbled line is not found', () => {
    const score = scoreLevel1(key, ['G#L%0T P0$E', 'xx']);
    expect(score.items.found).toBe(0);
    expect(score.meanLineCer).toBeGreaterThan(0.25);
  });

  it('rejects an answer key with amounts that are not whole øre', () => {
    expect(() => answerKeySchema.parse({ ...key, totalOre: 32.9 })).toThrow();
  });
});

describe('OCR pilot scoring, level 2 (spec 08)', () => {
  const parsedFrom = (rows: string[]) =>
    parseReceiptText(rows.map((text) => ({ text, confidence: 90 })));

  it('counts found lines, exact amounts, extra lines and the receipt fields', () => {
    const parsed = parsedFrom([
      'KIWI 999 FIKTIVBY',
      '15.01.26 10:05',
      'Kvitt:1234',
      'GULROT POSE 1KG 15% 24,90',
      '+ Pant 0% 3,00',
      'BRUS LIME 0,5L 15% 5,60',
      'TULL LINJE 1,00',
      'Sum 2 varer 32,90',
    ]);
    expect(scoreLevel2(key, parsed)).toEqual({
      id: 'fiktiv-1',
      chain: true,
      format: true,
      date: true,
      time: true,
      receiptNo: true,
      total: true,
      sumMatches: false,
      items: { found: 2, amountExact: 1, of: 2 },
      deposits: { found: 1, amountExact: 1, of: 1 },
      extraLines: 1,
      flagged: 0,
    });
  });

  it('a parsed line that only contains the key line plus a lot more is not a match', () => {
    const parsed = parsedFrom([
      'GULROT POSE 1KG OG MASSE ANNET SOM IKKE HØRER TIL 24,90',
      'SUM 24,90',
    ]);
    expect(scoreLevel2(key, parsed).items.found).toBe(0);
  });
});
