import { describe, expect, it } from 'vitest';
import { displayNameSchema, localeSchema, oreAmountSchema, oreInputSchema } from './common';

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe('FR-SHR-001 oreAmountSchema', () => {
  it('accepts non-negative integers', () => {
    expect(oreAmountSchema.parse(0)).toBe(0);
    expect(oreAmountSchema.parse(4990)).toBe(4990);
  });

  it.each([
    [49.9, 'validation.ore.integer'],
    [-1, 'validation.ore.negative'],
    [Number.MAX_SAFE_INTEGER + 2, 'validation.ore.out_of_range'],
    ['4990', 'validation.ore.required'],
  ])('rejects %j with %s', (value, message) => {
    expect(firstMessage(oreAmountSchema.safeParse(value))).toBe(message);
  });
});

describe('FR-SHR-001 oreInputSchema', () => {
  it('turns typed text into øre', () => {
    expect(oreInputSchema.parse('49,90')).toBe(4990);
    expect(oreInputSchema.parse('1 234,50 kr')).toBe(123450);
  });

  it.each([
    ['', 'validation.ore.empty'],
    ['abc', 'validation.ore.invalid_format'],
    ['1,999', 'validation.ore.too_many_decimals'],
    ['-5', 'validation.ore.negative'],
  ])('rejects %j with %s', (value, message) => {
    expect(firstMessage(oreInputSchema.safeParse(value))).toBe(message);
  });
});

describe('displayNameSchema', () => {
  it('trims whitespace', () => {
    expect(displayNameSchema.parse('  Kari  ')).toBe('Kari');
  });

  it.each([
    ['', 'validation.displayName.required'],
    ['   ', 'validation.displayName.required'],
    ['x'.repeat(51), 'validation.displayName.tooLong'],
  ])('rejects %j', (value, message) => {
    expect(firstMessage(displayNameSchema.safeParse(value))).toBe(message);
  });

  it('accepts Norwegian letters', () => {
    expect(displayNameSchema.parse('Bjørn Ærøy Åsen')).toBe('Bjørn Ærøy Åsen');
  });
});

describe('localeSchema', () => {
  it('accepts only the supported languages', () => {
    expect(localeSchema.safeParse('nb-NO').success).toBe(true);
    expect(localeSchema.safeParse('en').success).toBe(true);
    expect(localeSchema.safeParse('sv').success).toBe(false);
  });
});
