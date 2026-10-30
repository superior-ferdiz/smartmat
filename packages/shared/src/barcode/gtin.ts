/*
 * GTIN rules (spec 07, FR-SCAN-003): the number behind EAN-8, EAN-13, UPC-A, UPC-E and GTIN-14 barcodes.
 * Pure functions, used by the web form, the scanner and the API, so the same code is accepted everywhere.
 */

/** Formats the camera can report (the names BarcodeDetector uses). */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
export type ScanFormat = (typeof SCAN_FORMATS)[number];

export const GTIN_ERRORS = {
  required: 'validation.barcode.required',
  digits: 'validation.barcode.digits',
  length: 'validation.barcode.length',
  checkDigit: 'validation.barcode.checkDigit',
} as const;

export type GtinResult =
  | {
      ok: true;
      /** 8, 13 or 14 digits. */
      gtin: string;
      /** A store's own or variable-measure code (spec 07): never looked up or remembered. */
      storeCode: boolean;
    }
  | { ok: false; error: (typeof GTIN_ERRORS)[keyof typeof GTIN_ERRORS] };

/** The GS1 check digit for the digits in front of it: weights 3, 1, 3, … from the right. */
export function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function hasValidCheckDigit(code: string): boolean {
  return /^\d{2,}$/.test(code) && checkDigit(code.slice(0, -1)) === Number(code.at(-1));
}

/**
 * UPC-E (8 digits: number system 0/1, six data digits, check digit) written out as UPC-A (12 digits).
 * Returns null for anything that is not a UPC-E code.
 */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const system = code.charAt(0);
  const d = code.slice(1, 7);
  const check = code.charAt(7);
  const last = d.charAt(5);
  let body: string;
  if (last <= '2') body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === '3') body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === '4') body = `${d.slice(0, 4)}00000${d.charAt(4)}`;
  else body = `${d.slice(0, 5)}0000${last}`;
  return `${system}${body}${check}`;
}

/** Restricted-circulation prefixes (GS1): weighed goods, prices in the code, a store's internal numbers. */
export function isStoreCode(gtin: string): boolean {
  if (gtin.length === 8) return gtin.startsWith('0') || gtin.startsWith('2');
  const gtin13 = gtin.length === 14 ? gtin.slice(1) : gtin;
  return gtin13.startsWith('02') || gtin13.startsWith('04') || gtin13.startsWith('2');
}

/**
 * GS1 prefixes 98 and 99: coupons and refund receipts – also the barcode printed at the bottom of a till receipt.
 * Never a product, so never looked up or remembered; the scan page points to receipt upload instead.
 */
export function isReceiptCode(gtin: string): boolean {
  const gtin13 = gtin.length === 14 ? gtin.slice(1) : gtin;
  return gtin13.length === 13 && (gtin13.startsWith('98') || gtin13.startsWith('99'));
}

/**
 * Turns what was typed or scanned into a GTIN, or says what is wrong with it.
 * Spaces and hyphens are removed. UPC-A gets a leading 0 (13 digits); a GTIN-14 that starts with 0 is the
 * GTIN-13 after it. Eight digits are EAN-8, unless the camera said the code is UPC-E.
 */
export function normalizeGtin(input: string, format?: ScanFormat): GtinResult {
  const code = input.replace(/[\s-]/g, '');
  if (code === '') return { ok: false, error: GTIN_ERRORS.required };
  if (!/^\d+$/.test(code)) return { ok: false, error: GTIN_ERRORS.digits };

  let full = code;
  if (format === 'upc_e') {
    const expanded = expandUpcE(code);
    if (!expanded) return { ok: false, error: GTIN_ERRORS.length };
    full = expanded;
  }
  if (![8, 12, 13, 14].includes(full.length)) return { ok: false, error: GTIN_ERRORS.length };
  if (!hasValidCheckDigit(full)) return { ok: false, error: GTIN_ERRORS.checkDigit };

  let gtin = full;
  if (gtin.length === 12) gtin = `0${gtin}`;
  if (gtin.length === 14 && gtin.startsWith('0')) gtin = gtin.slice(1);
  return { ok: true, gtin, storeCode: isStoreCode(gtin) || isReceiptCode(gtin) };
}
