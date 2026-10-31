/*
 * The payment part of a receipt is never stored (spec 08, "Sikkerhet og personvern"): masked card numbers,
 * terminal and AID, authorisation codes and the payment reference. Lines that look like them are dropped from the
 * raw text before it is saved. The parser never reads them either.
 */

const PAYMENT_LINE = [
  /[x*]{4,}\s*-?\s*\d{2,4}/i, // masked card number: xxxxxxxxxxxx1234-01
  /\bAID\b/i,
  /AUTHORI[SZ]ATION|AUTORISASJON|\bAUTH\b/i,
  /\bTERMINAL\b/i,
  /\bBAX\b/i,
  /CONTACTLESS|KONTAKTL[ØO]S|\bCHIP\b/i,
  /BANKAXEPT|\bVISA\b|MASTERCARD|MAESTRO|AMERICAN EXPRESS|\bAMEX\b/i,
  /\bREF\.?\s*(NR\.?)?\s*:/i,
  /\bGODKJENT\b/i,
  /^\W*\(?[A-Z]\d{5}\/[A-Z]{2}\d+\)?\W*$/, // "(M00000/AE000000)"
];

export function isPaymentLine(text: string) {
  return PAYMENT_LINE.some((pattern) => pattern.test(text));
}

export function withoutPaymentLines<T extends { text: string }>(lines: readonly T[]): T[] {
  return lines.filter((line) => !isPaymentLine(line.text));
}
