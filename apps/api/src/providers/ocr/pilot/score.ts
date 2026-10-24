import type { ParsedReceipt } from '@smartmat/shared';
import { z } from 'zod';

/*
 * Scoring for the OCR pilot (spec 08, "Pilotmåling"), level 1: does each field of the answer key appear in what
 * Tesseract read? Pure functions; the script in scripts/ocr-pilot.ts reads the files. The answer keys and the real
 * receipts live outside the repo – the tests here only use made-up text.
 */

export const LINE_FOUND_MAX_CER = 0.25;

const ore = z.number().int().nonnegative();

export const answerKeySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  chain: z.enum(['extra', 'coop', 'kiwi', 'meny', 'spar', 'joker', 'rema', 'bunnpris', 'other']),
  date: z.iso.date(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  receiptNo: z.string().nullable(),
  totalOre: ore,
  articleCount: z.number().int().nonnegative().nullable(),
  lines: z
    .array(
      z.object({
        text: z.string().min(1),
        amountOre: ore,
        kind: z.enum(['item', 'deposit', 'discount']),
        count: z.number().int().positive().optional(),
        weightG: z.number().int().positive().optional(),
        unitPriceOre: ore.optional(),
        vatRate: z.number().int().optional(),
      }),
    )
    .min(1),
  vat: z.array(z.object({ rate: z.number().int(), baseOre: ore, vatOre: ore, totalOre: ore })),
  discountOre: ore,
  transcribedBy: z.string(),
  checkedBy: z.string().nullable(),
});
export type AnswerKey = z.infer<typeof answerKeySchema>;

/** Upper case, one space between words. The receipts print in capitals; Kiwi's "+ Pant" does not. */
export function normalizeText(text: string) {
  return text.toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Character error rate of `needle` against the best-matching part of `haystack`: the fewest edits that turn some
 * substring of the haystack into the needle, divided by the needle's length (semi-global edit distance).
 * 0 = found exactly, 1 = nothing alike.
 */
export function substringCer(needle: string, haystack: string) {
  const a = normalizeText(needle);
  const b = normalizeText(haystack);
  if (a.length === 0) return 0;
  // previous[j] = edits to match a[0..i) ending at b[j]; a free start anywhere in b (row 0 is all zeros).
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, (previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1);
    }
    previous = current;
  }
  return Math.min(1, Math.min(...previous) / a.length);
}

/** "151.38" and "151,38" both mean 15138 øre. Amounts on a line, in order. */
export function amountsOnLine(text: string) {
  return [...text.matchAll(/(?<![\d.,])(\d{1,6})[.,](\d{2})(?![\d.,])/g)].map(
    (match) => Number(match[1]) * 100 + Number(match[2]),
  );
}

export const CHAIN_MARKERS: Record<AnswerKey['chain'], RegExp> = {
  extra: /\bEXTRA\b|\bCOOP\b/,
  coop: /\bCOOP\b/,
  kiwi: /\bKIWI\b/,
  meny: /\bMENY\b/,
  spar: /\bSPAR\b/,
  joker: /\bJOKER\b/,
  rema: /\bREMA\b/,
  bunnpris: /\bBUNNPRIS\b/,
  other: /$^/,
};

const TOTAL_WORDS = /\b(TOTALT|SUM|TOTALBEL[ØO0]P|TOTAL)\b/;

export interface Level1Score {
  id: string;
  chain: boolean;
  date: boolean;
  total: boolean;
  items: { found: number; amountExact: number; of: number };
  deposits: { found: number; amountExact: number; of: number };
  /** Mean CER over all answer-key lines (best match each). */
  meanLineCer: number;
}

export function scoreLevel1(key: AnswerKey, ocrLines: readonly string[]): Level1Score {
  const lines = ocrLines.map(normalizeText);
  const all = lines.join('\n');

  const [year, month, day] = key.date.split('-');
  const dates = [`${day}.${month}.${year}`, `${day}.${month}.${year?.slice(2)}`];
  const date = lines.some((line) =>
    dates.some((d) => new RegExp(`(?<!\\d)${escape(d)}(?!\\d)`).test(line)),
  );

  const total = lines.some(
    (line) => TOTAL_WORDS.test(line) && amountsOnLine(line).includes(key.totalOre),
  );

  const cers: number[] = [];
  const tally = (kind: 'item' | 'deposit') => {
    const wanted = key.lines.filter((line) => line.kind === kind);
    let found = 0;
    let amountExact = 0;
    // Deposit lines all read "PANT": each must use its own OCR line, so they are matched in order.
    let from = 0;
    for (const line of wanted) {
      let best = { cer: 1, index: -1 };
      lines.forEach((ocr, index) => {
        if (kind === 'deposit' && index < from) return;
        const cer = substringCer(line.text, ocr);
        if (cer < best.cer) best = { cer, index };
      });
      cers.push(best.cer);
      if (best.index < 0 || best.cer > LINE_FOUND_MAX_CER) continue;
      found += 1;
      if (kind === 'deposit') from = best.index + 1;
      // On crumpled paper the amount can land on the line above or below the text.
      const near = [best.index - 1, best.index, best.index + 1].flatMap((i) =>
        amountsOnLine(lines[i] ?? ''),
      );
      if (near.includes(line.amountOre)) amountExact += 1;
    }
    return { found, amountExact, of: wanted.length };
  };

  const items = tally('item');
  const deposits = tally('deposit');
  return {
    id: key.id,
    chain: CHAIN_MARKERS[key.chain].test(all),
    date,
    total,
    items,
    deposits,
    meanLineCer: cers.length ? cers.reduce((s, c) => s + c, 0) / cers.length : 0,
  };
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
 * Level 2: the whole chain, OCR and parser, against the answer key. This is the level "good enough" is judged on
 * (spec 08). A parsed line counts as found when its description is within LINE_FOUND_MAX_CER of the key's line;
 * each parsed line is used at most once, in receipt order.
 */
export interface Level2Score {
  id: string;
  chain: boolean;
  format: boolean;
  date: boolean;
  time: boolean;
  receiptNo: boolean;
  total: boolean;
  sumMatches: boolean;
  items: { found: number; amountExact: number; of: number };
  deposits: { found: number; amountExact: number; of: number };
  /** Parsed lines that match no line in the key (header or footer text taken for an item). */
  extraLines: number;
  /** Lines the parser marked "check this". */
  flagged: number;
}

const KEY_FORMAT: Record<AnswerKey['chain'], ParsedReceipt['format']> = {
  extra: 'coop',
  coop: 'coop',
  kiwi: 'ng',
  meny: 'ng',
  spar: 'ng',
  joker: 'ng',
  rema: 'rema',
  bunnpris: 'generic',
  other: 'generic',
};

export function scoreLevel2(key: AnswerKey, parsed: ParsedReceipt): Level2Score {
  const used = new Set<number>();
  const tally = (kind: 'item' | 'deposit') => {
    const wanted = key.lines.filter((line) => line.kind === kind);
    let found = 0;
    let amountExact = 0;
    let from = 0;
    for (const line of wanted) {
      let best = { cer: 1, index: -1 };
      parsed.lines.forEach((p, index) => {
        if (used.has(index) || p.kind !== kind || index < from) return;
        const cer = substringCer(line.text, p.description);
        // The whole parsed description should match, not just a part of it.
        const lengthPenalty =
          Math.max(0, p.description.length - line.text.length) / line.text.length;
        const score = Math.min(1, cer + lengthPenalty);
        if (score < best.cer) best = { cer: score, index };
      });
      if (best.index < 0 || best.cer > LINE_FOUND_MAX_CER) continue;
      used.add(best.index);
      from = best.index + 1;
      found += 1;
      if (parsed.lines[best.index]!.amountOre === line.amountOre) amountExact += 1;
    }
    return { found, amountExact, of: wanted.length };
  };
  const items = tally('item');
  const deposits = tally('deposit');
  return {
    id: key.id,
    chain: parsed.chain === key.chain,
    format: parsed.format === KEY_FORMAT[key.chain],
    date: parsed.date === key.date,
    time: parsed.time === key.time,
    receiptNo: parsed.receiptNo === key.receiptNo,
    total: parsed.totalOre === key.totalOre,
    sumMatches: parsed.sumMatches,
    items,
    deposits,
    extraLines: parsed.lines.length - used.size,
    flagged: parsed.lines.filter((line) => line.uncertain).length,
  };
}
