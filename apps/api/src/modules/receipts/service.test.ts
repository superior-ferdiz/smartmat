import { describe, expect, it } from 'vitest';
import { receiptDedupeKey } from './service';

// Spec 08 FR-RCPT-007, the strong duplicate key. Made-up values.
const parse = {
  chain: 'kiwi' as const,
  format: 'ng' as const,
  storeName: 'Kiwi',
  date: '2026-03-11',
  time: '09:41',
  receiptNo: '123456',
  totalOre: 18970,
  linesSumOre: 18970,
  sumMatches: true,
  lines: [],
};

describe('FR-RCPT-007 receiptDedupeKey', () => {
  it('is the same for the same receipt read twice, and hides the receipt number', () => {
    const a = receiptDedupeKey(parse, '2026-03-11', 18970);
    expect(a).toMatch(/^receipt:[0-9a-f]{64}$/);
    expect(receiptDedupeKey({ ...parse, lines: [], storeName: null }, '2026-03-11', 18970)).toBe(a);
    expect(a).not.toContain('123456');
  });

  it('changes with the confirmed date or total, the time, the receipt number or the chain', () => {
    const a = receiptDedupeKey(parse, '2026-03-11', 18970);
    expect(receiptDedupeKey(parse, '2026-03-12', 18970)).not.toBe(a);
    expect(receiptDedupeKey(parse, '2026-03-11', 18971)).not.toBe(a);
    expect(receiptDedupeKey({ ...parse, time: '09:42' }, '2026-03-11', 18970)).not.toBe(a);
    expect(receiptDedupeKey({ ...parse, receiptNo: '123457' }, '2026-03-11', 18970)).not.toBe(a);
    expect(receiptDedupeKey({ ...parse, chain: 'meny' }, '2026-03-11', 18970)).not.toBe(a);
  });

  it('is null without a receipt number or a time (the weak check applies then)', () => {
    expect(receiptDedupeKey({ ...parse, receiptNo: null }, '2026-03-11', 18970)).toBeNull();
    expect(receiptDedupeKey({ ...parse, time: null }, '2026-03-11', 18970)).toBeNull();
    expect(receiptDedupeKey(null, '2026-03-11', 18970)).toBeNull();
  });
});
