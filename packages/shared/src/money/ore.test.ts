import { describe, expect, it } from 'vitest';
import { formatOre, parseOre } from './ore';

const NBSP = '\u00A0';
const MINUS = '\u2212';

describe('FR-SHR-001 parseOre', () => {
  it.each([
    ['49,90', 4990],
    ['49.90', 4990],
    ['49', 4900],
    ['49,9', 4990],
    ['0,05', 5],
    ['0', 0],
    ['49,-', 4900],
    ['1 234,50', 123450],
    [`1${NBSP}234,50`, 123450],
    ['1\u202F234,50', 123450],
    ['12 345 678,00', 1234567800],
    ['  49,90  ', 4990],
    ['007,50', 750],
    ['49,90 kr', 4990],
    ['kr 49,90', 4990],
    ['49,90kr', 4990],
    ['-12,5', -1250],
    [`${MINUS}12,50`, -1250],
    ['- 12,50', -1250],
  ])('parses %j as %i øre', (input, expected) => {
    expect(parseOre(input)).toEqual({ ok: true, value: expected });
  });

  it('returns 0, not -0, for a negative zero', () => {
    const result = parseOre('-0,00');
    expect(result.ok && Object.is(result.value, 0)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['kr', 'invalid_format'],
    ['abc', 'invalid_format'],
    ['49,90,10', 'invalid_format'],
    ['49,', 'invalid_format'],
    [',50', 'invalid_format'],
    ['1e3', 'invalid_format'],
    ['0x10', 'invalid_format'],
    ['1234 567', 'invalid_format'],
    ['1 23,00', 'invalid_format'],
    ['+5', 'invalid_format'],
    ['49,999', 'too_many_decimals'],
    ['0,001', 'too_many_decimals'],
    ['90071992547409,92', 'out_of_range'],
    ['99999999999999999999', 'out_of_range'],
  ])('rejects %j with %s', (input, error) => {
    expect(parseOre(input)).toEqual({ ok: false, error });
  });

  it('is exact where floating point is not (0,10 + 0,20)', () => {
    const a = parseOre('0,10');
    const b = parseOre('0,20');
    expect(a.ok && b.ok && a.value + b.value).toBe(30);
  });

  it('handles the largest safe amount', () => {
    expect(parseOre('90071992547409,91')).toEqual({ ok: true, value: Number.MAX_SAFE_INTEGER });
  });
});

describe('FR-SHR-001 formatOre', () => {
  it.each([
    [4990, `49,90${NBSP}kr`],
    [0, `0,00${NBSP}kr`],
    [5, `0,05${NBSP}kr`],
    [100, `1,00${NBSP}kr`],
    [123450, `1${NBSP}234,50${NBSP}kr`],
    [-1250, `${MINUS}12,50${NBSP}kr`],
    [-5, `${MINUS}0,05${NBSP}kr`],
  ])('formats %i øre as %j', (ore, expected) => {
    expect(formatOre(ore)).toBe(expected);
  });

  it('can leave out the currency', () => {
    expect(formatOre(4990, { currency: false })).toBe('49,90');
  });

  it('formats the largest safe amount exactly', () => {
    expect(formatOre(Number.MAX_SAFE_INTEGER)).toBe(
      `90${NBSP}071${NBSP}992${NBSP}547${NBSP}409,91${NBSP}kr`,
    );
  });

  it.each([0.5, 49.9, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'throws for %d, which is not a safe integer',
    (value) => {
      expect(() => formatOre(value)).toThrow(RangeError);
    },
  );
});

describe('FR-SHR-001 round trip', () => {
  it.each([0, 1, 99, 100, 4990, 123450, 1234567800, -1250, Number.MAX_SAFE_INTEGER])(
    'parseOre(formatOre(%i)) gives the same number back',
    (ore) => {
      expect(parseOre(formatOre(ore))).toEqual({ ok: true, value: ore });
    },
  );
});
