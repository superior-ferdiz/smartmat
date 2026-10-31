/**
 * Quantities are stored as whole numbers in a base unit: grams, millilitres or pieces (ADR-0006).
 * People type them in a display unit ("1,5" kg). These helpers convert both ways without floating point:
 * parsing works on the digit string, formatting uses integer division.
 */

export const BASE_UNITS = ['g', 'ml', 'stk'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const DISPLAY_UNITS = ['g', 'kg', 'ml', 'dl', 'l', 'stk'] as const;
export type DisplayUnit = (typeof DISPLAY_UNITS)[number];

/** How many base units one display unit is. */
export const UNIT_FACTOR: Record<DisplayUnit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  dl: 100,
  l: 1000,
  stk: 1,
};

/** Which display units can be used for each base unit, in the order they are offered. */
export const DISPLAY_UNITS_FOR: Record<BaseUnit, readonly DisplayUnit[]> = {
  g: ['g', 'kg'],
  ml: ['ml', 'dl', 'l'],
  stk: ['stk'],
};

export function baseUnitOf(unit: DisplayUnit): BaseUnit {
  if (unit === 'g' || unit === 'kg') return 'g';
  if (unit === 'stk') return 'stk';
  return 'ml';
}

/** 100 tonnes / 100 000 litres / 100 million pieces: far above any kitchen, far below unsafe integers. */
export const MAX_QUANTITY_BASE = 100_000_000;

export type QuantityParseResult = { ok: true; value: number } | { ok: false; error: string };

const PATTERN = /^(?<whole>\d+)(?:[,.](?<fraction>\d+))?$/;

/**
 * "1,5" kg → 1500 (g). Accepts a decimal comma or point and spaces as thousands separators.
 * Errors are i18n keys. The result must be a whole, positive number of base units:
 * "1,2345" kg would be 1234.5 g and is refused rather than rounded.
 */
export function parseQuantity(input: string, unit: DisplayUnit): QuantityParseResult {
  const text = input.trim().replace(/[ \u00A0\u202F]/g, '');
  if (text === '') return { ok: false, error: 'validation.quantity.required' };
  const match = PATTERN.exec(text);
  if (!match?.groups) return { ok: false, error: 'validation.quantity.invalid' };

  const whole = match.groups.whole ?? '0';
  const fraction = match.groups.fraction ?? '';
  if (whole.length + fraction.length > 12)
    return { ok: false, error: 'validation.quantity.tooLarge' };

  const factor = UNIT_FACTOR[unit];
  const scale = 10 ** fraction.length;
  // (whole + fraction/scale) × factor must be an integer, i.e. fraction × factor divisible by scale.
  const fractionPart = Number(fraction || '0') * factor;
  if (fractionPart % scale !== 0) return { ok: false, error: 'validation.quantity.notWhole' };

  const value = Number(whole) * factor + fractionPart / scale;
  if (value <= 0) return { ok: false, error: 'validation.quantity.notPositive' };
  if (value > MAX_QUANTITY_BASE) return { ok: false, error: 'validation.quantity.tooLarge' };
  return { ok: true, value };
}

/** The display unit that reads best: 1500 g → kg, 400 g → g, 1500 ml → l. */
export function bestDisplayUnit(base: number, unit: BaseUnit): DisplayUnit {
  if (unit === 'g') return base >= 1000 ? 'kg' : 'g';
  if (unit === 'ml') return base >= 1000 ? 'l' : 'ml';
  return 'stk';
}

/**
 * The number part of a quantity in a display unit, with the given decimal separator, without trailing zeros:
 * (1500, 'kg') → "1,5", (1250, 'l') → "1,25", (400, 'g') → "400".
 */
export function quantityNumber(
  base: number,
  displayUnit: DisplayUnit,
  decimalSeparator = ',',
): string {
  const factor = UNIT_FACTOR[displayUnit];
  const whole = Math.floor(base / factor);
  const rest = base % factor;
  if (rest === 0) return String(whole);
  const digits = String(factor).length - 1;
  const fraction = String(rest).padStart(digits, '0').replace(/0+$/, '');
  return `${whole}${decimalSeparator}${fraction}`;
}

/** For display: number in the best unit. The unit label is translated by the app ("stk" → "pcs"). */
export function formatQuantity(base: number, unit: BaseUnit, decimalSeparator = ',') {
  const displayUnit = bestDisplayUnit(base, unit);
  return { amount: quantityNumber(base, displayUnit, decimalSeparator), unit: displayUnit };
}
