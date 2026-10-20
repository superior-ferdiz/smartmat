/**
 * Money in SmartMat is always an integer number of øre (ADR-0006): 49,90 kr = 4990.
 *
 * These helpers convert between what a person types ("49,90") and øre, and back for display.
 * They never go through floating point: parsing works on the digit string, and formatting
 * uses integer arithmetic only. That is why we do not use parseFloat or divide by 100.
 */

export type OreParseError = 'empty' | 'invalid_format' | 'too_many_decimals' | 'out_of_range';

export type OreParseResult = { ok: true; value: number } | { ok: false; error: OreParseError };

/** Regular space, no-break space (U+00A0) and narrow no-break space (U+202F) are allowed as thousands separators. */
const GROUP_SEPARATORS = /[ \u00A0\u202F]/;

/**
 * Accepts:
 *   - optional sign: "-" or the Unicode minus U+2212 (Intl uses it for nb-NO)
 *   - kroner: plain digits ("1234") or groups of three separated by spaces ("1 234")
 *   - optional decimals after "," or ".": one or two digits, or the Norwegian ",-" for whole kroner
 *   - optional "kr" before or after, so a formatted value can be parsed back
 */
const AMOUNT_PATTERN =
  /^(?<sign>[-\u2212])?(?<kroner>\d+|\d{1,3}(?:[ \u00A0\u202F]\d{3})+)(?:[,.](?<decimals>\d+|-))?$/;

export function parseOre(input: string): OreParseResult {
  let text = input.trim();
  if (text === '') return { ok: false, error: 'empty' };

  // Strip a currency label on either side ("kr 49,90", "49,90 kr", "49,90kr").
  text = text
    .replace(/^kr\.?\s*/i, '')
    .replace(/\s*kr\.?$/i, '')
    .trim();
  if (text === '') return { ok: false, error: 'invalid_format' };

  // Allow a space between the sign and the number ("- 12,50").
  text = text.replace(/^([-\u2212])\s+/, '$1');

  const match = AMOUNT_PATTERN.exec(text);
  if (!match?.groups) {
    return { ok: false, error: 'invalid_format' };
  }

  const { sign, kroner = '', decimals } = match.groups;

  let decimalDigits: string;
  if (decimals === undefined || decimals === '-') {
    decimalDigits = '00';
  } else if (decimals.length > 2) {
    return { ok: false, error: 'too_many_decimals' };
  } else {
    decimalDigits = decimals.padEnd(2, '0');
  }

  // "1 234" + "50" -> "123450". Converting a string of digits to a number is exact as long as
  // the result is a safe integer, which we check right after.
  const digits = (kroner.split(GROUP_SEPARATORS).join('') + decimalDigits).replace(/^0+(?=\d)/, '');
  const magnitude = Number(digits);
  if (!Number.isSafeInteger(magnitude)) {
    return { ok: false, error: 'out_of_range' };
  }

  // Avoid returning -0 for "-0,00".
  const value = sign && magnitude !== 0 ? -magnitude : magnitude;
  return { ok: true, value };
}

export interface FormatOreOptions {
  /** Append " kr" (default true). */
  currency?: boolean;
}

const groupFormatter = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });

/**
 * 4990 -> "49,90 kr", 123450 -> "1 234,50 kr" (no-break space as thousands separator), -1250 -> "−12,50 kr" (U+2212 minus).
 * Output follows Norwegian conventions (decimal comma, Unicode minus), matching Intl's nb-NO format.
 */
export function formatOre(ore: number, options: FormatOreOptions = {}): string {
  if (!Number.isSafeInteger(ore)) {
    throw new RangeError(`formatOre expects a safe integer number of øre, got ${String(ore)}`);
  }
  const { currency = true } = options;

  const negative = ore < 0;
  const abs = Math.abs(ore);
  const rest = abs % 100;
  // (abs - rest) is an exact multiple of 100, so this division is exact.
  const kroner = (abs - rest) / 100;

  const amount = `${groupFormatter.format(kroner)},${String(rest).padStart(2, '0')}`;
  const signed = negative ? `\u2212${amount}` : amount;
  return currency ? `${signed}\u00A0kr` : signed;
}
