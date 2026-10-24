/*
 * Norwegian grocery chains and their receipt formats (spec 08, docs/development/kjedeformater.md).
 * The chain is only looked for in the header (before the first item line): item names can contain a chain's name
 * – "KIWI GRØNN" is a fruit on a Coop receipt.
 */

export const RECEIPT_CHAINS = [
  'extra',
  'coopPrix',
  'coopMega',
  'obs',
  'coop',
  'kiwi',
  'meny',
  'spar',
  'joker',
  'rema',
  'bunnpris',
] as const;
export type ReceiptChain = (typeof RECEIPT_CHAINS)[number];

/** How the receipt is laid out: decides how quantity lines and deposit lines are read. */
export const RECEIPT_FORMATS = ['coop', 'ng', 'rema', 'generic'] as const;
export type ReceiptFormat = (typeof RECEIPT_FORMATS)[number];

/** Shown as the suggested store name. */
export const CHAIN_NAMES: Record<ReceiptChain, string> = {
  extra: 'Extra',
  coopPrix: 'Coop Prix',
  coopMega: 'Coop Mega',
  obs: 'Obs',
  coop: 'Coop',
  kiwi: 'Kiwi',
  meny: 'Meny',
  spar: 'Spar',
  joker: 'Joker',
  rema: 'Rema 1000',
  bunnpris: 'Bunnpris',
};

export const CHAIN_FORMAT: Record<ReceiptChain, ReceiptFormat> = {
  extra: 'coop',
  coopPrix: 'coop',
  coopMega: 'coop',
  obs: 'coop',
  coop: 'coop',
  kiwi: 'ng',
  meny: 'ng',
  spar: 'ng',
  joker: 'ng',
  rema: 'rema',
  bunnpris: 'generic',
};

/** Most specific first: "COOP PRIX" before "COOP". Matched on upper-case text. */
const CHAIN_PATTERNS: [ReceiptChain, RegExp][] = [
  ['coopPrix', /\bCOOP\s+PRIX\b|\bPRIX\b/],
  ['coopMega', /\bCOOP\s+MEGA\b/],
  ['obs', /\bCOOP\s+OBS\b/],
  ['extra', /\bEXTRA\b/],
  ['kiwi', /\bKIWI\b/],
  ['meny', /\bMENY\b/],
  ['spar', /\bSPAR\b/],
  ['joker', /\bJOKER\b/],
  ['rema', /\bREMA\b/],
  ['bunnpris', /\bBUNNPRIS\b/],
  ['coop', /\bCOOP\b/],
];

/**
 * Layout clues that survive when the logo (often a picture, not text) is not read. Coop prints
 * "Totalt (N Artikler)", "Herav Dagligvarer" and "Antall: N stk" under an item; NorgesGruppen prints
 * "Sum N varer", "Kvitt:" and a company "NG …".
 */
const FORMAT_CLUES: [ReceiptFormat, RegExp][] = [
  ['coop', /\bARTIKLER\b|\bHERAV\b|\bDAGLIGVARER\b|\bCOOP\b|^\W*ANTALL\s*:/],
  ['ng', /^\s*NG\s+[A-ZÆØÅ]|\bSUM\s+\d+\s+VARER\b|\bKVITT\s*:/],
  ['rema', /\bREMA\b/],
];

export function detectChain(headerLines: readonly string[]): ReceiptChain | null {
  const header = headerLines.map((line) => line.toUpperCase());
  for (const [chain, pattern] of CHAIN_PATTERNS) {
    if (header.some((line) => pattern.test(line))) return chain;
  }
  return null;
}

/** From the chain when it is known; otherwise from clues anywhere on the receipt (they are not item names). */
export function detectFormat(
  chain: ReceiptChain | null,
  allLines: readonly string[],
): ReceiptFormat {
  if (chain) return CHAIN_FORMAT[chain];
  const text = allLines.map((line) => line.toUpperCase());
  for (const [format, pattern] of FORMAT_CLUES) {
    if (text.some((line) => pattern.test(line))) return format;
  }
  return 'generic';
}
