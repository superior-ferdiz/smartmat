import { describe, expect, it } from 'vitest';
import { bestDisplayUnit, formatQuantity, parseQuantity, quantityNumber } from './quantity';

describe('FR-INV-001 parseQuantity (ADR-0006: whole base units, no floating point)', () => {
  it.each([
    ['1,5', 'kg', 1500],
    ['1.5', 'kg', 1500],
    ['0,25', 'l', 250],
    ['2', 'dl', 200],
    ['1,5', 'dl', 150],
    ['400', 'g', 400],
    ['1 000', 'g', 1000],
    ['1\u00A0000', 'ml', 1000],
    ['6', 'stk', 6],
    ['0,001', 'kg', 1],
    [' 3 ', 'stk', 3],
  ] as const)('"%s" %s → %i', (text, unit, expected) => {
    expect(parseQuantity(text, unit)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', 'kg', 'validation.quantity.required'],
    ['abc', 'g', 'validation.quantity.invalid'],
    ['-1', 'g', 'validation.quantity.invalid'],
    ['1,2,3', 'g', 'validation.quantity.invalid'],
    ['0', 'g', 'validation.quantity.notPositive'],
    ['0,0', 'kg', 'validation.quantity.notPositive'],
    ['1,5', 'g', 'validation.quantity.notWhole'],
    ['1,2345', 'kg', 'validation.quantity.notWhole'],
    ['0,5', 'stk', 'validation.quantity.notWhole'],
    ['100001', 'kg', 'validation.quantity.tooLarge'],
    ['1234567890123', 'g', 'validation.quantity.tooLarge'],
  ] as const)('"%s" %s → %s', (text, unit, error) => {
    expect(parseQuantity(text, unit)).toEqual({ ok: false, error });
  });

  it('0,1 + 0,2 kg style inputs stay exact (no 0.30000000000000004)', () => {
    expect(parseQuantity('0,3', 'kg')).toEqual({ ok: true, value: 300 });
    expect(parseQuantity('1,1', 'l')).toEqual({ ok: true, value: 1100 });
  });
});

describe('formatQuantity', () => {
  it('chooses a readable unit and trims zeros', () => {
    expect(formatQuantity(1500, 'g')).toEqual({ amount: '1,5', unit: 'kg' });
    expect(formatQuantity(1000, 'g')).toEqual({ amount: '1', unit: 'kg' });
    expect(formatQuantity(1250, 'ml')).toEqual({ amount: '1,25', unit: 'l' });
    expect(formatQuantity(400, 'g')).toEqual({ amount: '400', unit: 'g' });
    expect(formatQuantity(999, 'ml')).toEqual({ amount: '999', unit: 'ml' });
    expect(formatQuantity(1001, 'g')).toEqual({ amount: '1,001', unit: 'kg' });
    expect(formatQuantity(12, 'stk')).toEqual({ amount: '12', unit: 'stk' });
  });

  it('uses the given decimal separator (English)', () => {
    expect(formatQuantity(1500, 'g', '.')).toEqual({ amount: '1.5', unit: 'kg' });
  });

  it('round-trips: parse(format(x)) = x', () => {
    for (const base of [1, 5, 99, 100, 999, 1000, 1001, 1050, 12_345, 99_999_999]) {
      for (const unit of ['g', 'ml'] as const) {
        const { amount, unit: display } = formatQuantity(base, unit);
        expect(parseQuantity(amount, display)).toEqual({ ok: true, value: base });
      }
    }
  });

  it('quantityNumber in a given unit (for edit forms)', () => {
    expect(quantityNumber(150, 'dl')).toBe('1,5');
    expect(quantityNumber(5, 'kg')).toBe('0,005');
    expect(bestDisplayUnit(0, 'g')).toBe('g');
  });
});
