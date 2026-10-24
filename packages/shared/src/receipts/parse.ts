import {
  CHAIN_NAMES,
  detectChain,
  detectFormat,
  type ReceiptChain,
  type ReceiptFormat,
} from './chains';
import type { PurchaseLineKind } from '../schemas/purchases';

/*
 * From OCR text to purchase lines (spec 08 FR-RCPT-004). Pure functions, all money in whole øre (ADR-0006).
 * The parser only *suggests*: every line can be wrong, and the user corrects and confirms (ADR-0007, ADR-0011).
 * It uses the cross-checks a receipt prints – count × unit price, weight × price per kg, the lines against the
 * total, the number of articles – to pick the right amount when OCR misread one of them, and flags what it could
 * not settle.
 *
 * The test texts in this folder are made up. Real receipts are never used in tests (spec 08).
 */

export interface OcrInputLine {
  text: string;
  /** 0–100 */
  confidence: number;
}

export const PARSED_LINE_KINDS = ['item', 'deposit'] as const;
export type ParsedLineKind = (typeof PARSED_LINE_KINDS)[number];

/** Why a line is marked "check this". */
export const PARSED_LINE_FLAGS = [
  'lowConfidence',
  'noAmount',
  'amountFromQuantity',
  'quantityMismatch',
  'discountApplied',
] as const;
export type ParsedLineFlag = (typeof PARSED_LINE_FLAGS)[number];

export interface ParsedReceiptLine {
  description: string;
  /** Net of any discount printed under the line. Null when no amount could be read. */
  amountOre: number | null;
  kind: ParsedLineKind;
  discountOre: number;
  count: number | null;
  weightG: number | null;
  unitPriceOre: number | null;
  vatRate: number | null;
  suggestedKind: PurchaseLineKind;
  confidence: number;
  flags: ParsedLineFlag[];
  uncertain: boolean;
}

export interface ParsedReceipt {
  chain: ReceiptChain | null;
  format: ReceiptFormat;
  storeName: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM */
  time: string | null;
  receiptNo: string | null;
  totalOre: number | null;
  linesSumOre: number;
  /** The lines add up to the total (false also when either is missing). */
  sumMatches: boolean;
  articleCount: number | null;
  lines: ParsedReceiptLine[];
}

export const LOW_CONFIDENCE = 70;
export const PARSED_DESCRIPTION_MAX_LENGTH = 100;

// ---------- amounts ----------

/** "151.38", "151,38", "-10,00" and "10,00-": the amount in øre, with its position. */
const AMOUNT = /(?<![\d.,])(-\s?)?(\d{1,6})[.,](\d{2})(-)?(?![\d.,])/g;

interface FoundAmount {
  ore: number;
  start: number;
  end: number;
}

export function findAmounts(text: string): FoundAmount[] {
  return [...text.matchAll(AMOUNT)].map((m) => {
    const value = Number(m[2]) * 100 + Number(m[3]);
    return {
      ore: m[1] || m[4] ? -value : value,
      start: m.index,
      end: m.index + m[0].length,
    };
  });
}

/** The last amount on the line, when only a little junk (no digits) follows it. */
function trailingAmount(text: string): { ore: number; before: string } | null {
  const last = findAmounts(text).at(-1);
  if (!last) return null;
  // A little OCR junk may follow ("30.50 å", "151,38 1"), but not another number or more text.
  const after = text.slice(last.end).trim();
  if (after.length > 6 || (/\d/.test(after) && after.length > 3)) return null;
  return { ore: last.ore, before: text.slice(0, last.start) };
}

const toOre = (kroner: string, decimals: string) => Number(kroner) * 100 + Number(decimals);

// ---------- line kinds ----------

/** Coop: "Antall: 6 stk 11.90 kr/stk" under the item. */
const COUNT_LINE = /^\W*ANTALL\b/i;
const COUNT_VALUES = /(\d{1,3})\s*STK\W+(\d{1,5})[.,](\d{2})\s*KR\s*\/?\s*STK/i;
/** "0.946 kg 31.90 kr/kg" (Coop) or "0,946 kg x 31,90 kr/kg". */
const WEIGHT_LINE = /^\W*(\d{1,3})[.,](\d{3})\s*KG\b/i;
const WEIGHT_VALUES = /(\d{1,3})[.,](\d{3})\s*KG\W+(?:X\s*)?(\d{1,5})[.,](\d{2})\s*KR\s*\/\s*KG/i;
/** "2 x 24,90" or "2 * 24,90", on its own line or inside the item line. */
const TIMES = /(?<![\d.,])(\d{1,3})\s*[X×*]\s*(\d{1,5})[.,](\d{2})(?![\d.,])/i;
/** "PANT" or "+ Pant"; OCR has read it as "Part". */
const DEPOSIT = /^\W*\+?\s*P[A4][NRM]T\b/i;
const DISCOUNT_WORDS = /RABATT|KAMPANJE|TILBUD|MEDLEMSPRIS|MEDLEMSFORDEL|\bFORDEL\b|\bKUPONG/i;
/**
 * The end of the item list. OCR mixes up O/0 and l/1/I, so "Tota1t" counts, and so do the payment and total-amount
 * lines that follow the items when the total line itself is unreadable.
 */
const END =
  /\bT[O0]TA[L1I]T?\b|^\W*SUM\b|\b\d{1,3}\s+VARER\b|\(\s*\d{1,3}\s*ART|\bBANK\b|BEL[ØO0][PRF]\b/i;
/** Lines after the items that carry the total. */
const TOTAL_LINE = /\bT[O0]TA[L1I]T?\b|\bSUM\b|BEL[ØO0][PRF]\b|\bBANK\b|DAGLIGVARER/i;
/**
 * Lines only the header has: receipt number, company, phone, till, serial number, a date. The items start after
 * the last of them (before the total). A time alone is not enough: OCR reads "22.00" as "22:00".
 */
const STRONG_HEADER =
  /S[AE]L[GQ]S\s*KVITT|\bKVITT\w*\s*:|ORG\s*\.?\s*NR|\bTLF\b|TELEFON|\bKASSE\b|\bKASSERER\b|SERIENR|OPERNR|FORETAKSREG|\d{1,2}\.\d{1,2}\.\d{2,4}/i;
/** Header lines: never items. */
const HEADER =
  /SALGSKVITTERING|\bKVITT|\bORG\b|ORG\s*\.?\s*NR|\bTLF\b|TELEFON|\bKASSE\b|\bKASSERER\b|\bBUTIKK\b|SERIENR|OPERNR|FORETAKSREG|\bÅPENT\b|\bAPENT\b|\bID\s*:|\b\d{1,2}:\d{2}\b|\d{1,2}\.\d{1,2}\.\d{2,4}/i;
const SEPARATOR = /^[\s\-=_*.]{5,}$/;
/** Clearly not food, whatever the VAT says: shopping bags. */
const NON_FOOD_WORDS = /^\W*(PLASTPOSE|BÆREPOSE|BAEREPOSE|PAPIRPOSE|HANDLENETT|HANDLEPOSE)\b/i;
/** A VAT rate printed next to the amount (NorgesGruppen): "15%". */
const VAT_AT_END = /\s(\d{1,2})\s?%\s*$/;

// ---------- dates ----------

const DATE = /(?<!\d)(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4}|\d{2})(?!\d)/g;
const TIME = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/;

function validDate(day: number, month: number, year: number) {
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The first valid date in the header, else the one printed most often (Coop prints it twice). */
function findDate(lines: readonly string[], headerEnd: number) {
  const found: { date: string; line: number; end: number }[] = [];
  lines.forEach((text, line) => {
    for (const m of text.matchAll(DATE)) {
      const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const date = validDate(Number(m[1]), Number(m[2]), year);
      if (date) found.push({ date, line, end: m.index + m[0].length });
    }
  });
  const inHeader = found.find((f) => f.line < headerEnd);
  if (inHeader) return inHeader;
  const counts = new Map<string, number>();
  for (const f of found) counts.set(f.date, (counts.get(f.date) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? found.find((f) => f.date === best[0])! : null;
}

// ---------- parsing ----------

function newLine(
  description: string,
  amountOre: number | null,
  kind: ParsedLineKind,
  confidence: number,
): ParsedReceiptLine {
  return {
    description,
    amountOre,
    kind,
    discountOre: 0,
    count: null,
    weightG: null,
    unitPriceOre: null,
    vatRate: null,
    suggestedKind: 'food',
    confidence,
    flags: [],
    uncertain: false,
  };
}

function cleanDescription(text: string) {
  return text
    .replace(/[|_~^`´¨"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\W]+(?=[\p{L}\d])/u, (m) => (m.includes('+') ? '+ ' : ''))
    .replace(/[\s.,:;!?(-]+$/, '')
    .trim()
    .slice(0, PARSED_DESCRIPTION_MAX_LENGTH)
    .trim();
}

const letters = (text: string) => (text.match(/\p{L}/gu) ?? []).length;

/**
 * Applies a quantity (count × unit, or weight × price per kg) to the line it belongs to. When the amount read on
 * the line disagrees with the receipt's own arithmetic, the arithmetic wins (two numbers that agree with each
 * other beat one), and the line is flagged for checking.
 */
function applyQuantity(
  line: ParsedReceiptLine,
  quantity: { count?: number; weightG?: number; unitPriceOre: number },
  amountOnQuantityLine: number | null,
) {
  line.count = quantity.count ?? null;
  line.weightG = quantity.weightG ?? null;
  line.unitPriceOre = quantity.unitPriceOre;
  const computed =
    quantity.count !== undefined
      ? quantity.count * quantity.unitPriceOre
      : Math.round(((quantity.weightG ?? 0) * quantity.unitPriceOre) / 1000);

  if (line.amountOre === computed) return;
  if (
    amountOnQuantityLine === computed ||
    (line.amountOre === null && amountOnQuantityLine === null)
  ) {
    // The amount slid down to the quantity line, or was not read: the receipt's own sum settles it.
    line.amountOre = computed;
    if (amountOnQuantityLine !== computed) line.flags.push('amountFromQuantity');
    return;
  }
  line.amountOre = computed;
  line.flags.push('quantityMismatch');
}

/**
 * Undoes OCR habits seen in the pilot (spec 08): a space inside an amount ("79, 90"), the letter O for a zero
 * before "%", and short junk "words" from the table at the left edge of the paper ("HÅ + Pant").
 */
export function cleanOcrLine(text: string) {
  let line = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d)([.,]) (\d{2})(?![\d.,])/g, '$1$2$3')
    .replace(/(^|\s)[Oo](?=\s?%)/g, '$10');
  for (;;) {
    const [first, ...rest] = line.split(' ');
    const remaining = rest.join(' ');
    if (!first || !/^[^\d+\s]{1,2}$/u.test(first) || letters(remaining) < 3) break;
    line = remaining;
  }
  return line;
}

export function parseReceiptText(input: readonly OcrInputLine[]): ParsedReceipt {
  const raw = input
    .map((line) => ({ text: cleanOcrLine(line.text), confidence: line.confidence }))
    .filter((line) => line.text !== '');
  const texts = raw.map((line) => line.text);

  // The items start after the last sure header line before the total. Without one, at the first line with an
  // amount at the end, or at the item-like lines just above it (an item whose amount slid onto the next line).
  const firstEnd = texts.findIndex((text) => END.test(text));
  // Without a readable end, the date printed under the payment must not count as header: stop at the first line
  // that looks like an item.
  const firstItemLike = texts.findIndex(
    (text) => !STRONG_HEADER.test(text) && trailingAmount(text),
  );
  const searchTo = firstEnd >= 0 ? firstEnd : firstItemLike >= 0 ? firstItemLike : texts.length;
  let start = -1;
  for (let i = 0; i < searchTo; i++) if (STRONG_HEADER.test(texts[i]!)) start = i + 1;
  if (start < 0) {
    start = texts.findIndex(
      (text) => !HEADER.test(text) && !END.test(text) && trailingAmount(text),
    );
    if (start < 0) start = texts.length;
    while (start > 0) {
      const above = texts[start - 1]!;
      if (HEADER.test(above) || SEPARATOR.test(above) || letters(above) < 3) break;
      start -= 1;
    }
  }

  const chain = detectChain(texts.slice(0, start));
  const format = detectFormat(chain, texts);
  const lines: ParsedReceiptLine[] = [];
  const withQuantity = new Set<ParsedReceiptLine>();
  let endIndex = texts.length;

  for (let i = start; i < raw.length; i++) {
    const { text, confidence } = raw[i]!;
    const last = lines.at(-1);
    if (END.test(text)) {
      endIndex = i;
      break;
    }
    if (SEPARATOR.test(text)) continue;
    const trailing = trailingAmount(text);

    // A quantity line under the item.
    const countMatch = COUNT_LINE.test(text) ? COUNT_VALUES.exec(text) : null;
    const weightMatch = WEIGHT_LINE.test(text) ? WEIGHT_VALUES.exec(text) : null;
    const timesAlone = TIMES.exec(text);
    const isTimesLine = timesAlone !== null && letters(text.slice(0, timesAlone.index)) === 0;
    if (COUNT_LINE.test(text) || WEIGHT_LINE.test(text) || isTimesLine) {
      if (last && !withQuantity.has(last)) {
        withQuantity.add(last);
        // Only an amount after the unit price can be the line's amount (the unit price is not).
        const values = countMatch ?? weightMatch ?? (isTimesLine ? timesAlone : null);
        const valuesEnd = values ? values.index + values[0].length : 0;
        const amountHere =
          findAmounts(text)
            .filter((a) => a.start >= valuesEnd)
            .at(-1)?.ore ?? null;
        if (countMatch) {
          applyQuantity(
            last,
            { count: Number(countMatch[1]), unitPriceOre: toOre(countMatch[2]!, countMatch[3]!) },
            amountHere,
          );
        } else if (weightMatch) {
          applyQuantity(
            last,
            {
              weightG: Number(weightMatch[1]) * 1000 + Number(weightMatch[2]),
              unitPriceOre: toOre(weightMatch[3]!, weightMatch[4]!),
            },
            amountHere,
          );
        } else if (isTimesLine) {
          applyQuantity(
            last,
            { count: Number(timesAlone[1]), unitPriceOre: toOre(timesAlone[2]!, timesAlone[3]!) },
            amountHere,
          );
        } else {
          // "Antall …" that OCR garbled: keep the amount if it slid down here, flag the line.
          if (last.amountOre === null && amountHere !== null) last.amountOre = amountHere;
          last.flags.push('quantityMismatch');
        }
        last.confidence = Math.min(last.confidence, confidence);
      }
      continue;
    }

    // A discount under the item: subtracted from it (net amounts, no negative lines – spec 04, decision 5).
    if (trailing && (trailing.ore < 0 || DISCOUNT_WORDS.test(text))) {
      const discount = Math.abs(trailing.ore);
      if (last && last.amountOre !== null && last.amountOre >= discount && discount > 0) {
        last.amountOre -= discount;
        last.discountOre += discount;
        last.flags.push('discountApplied');
      }
      continue;
    }

    // Only an amount (and a little junk): the amount of the line above, when it has none.
    if (trailing && letters(trailing.before) <= 2) {
      if (last && last.amountOre === null) {
        last.amountOre = trailing.ore;
        last.confidence = Math.min(last.confidence, confidence);
      }
      continue;
    }
    if (letters(text) < 3) continue;

    let description = trailing ? trailing.before : text;
    let vatRate: number | null = null;
    const vat = VAT_AT_END.exec(description);
    if (vat) {
      vatRate = Number(vat[1]);
      description = description.slice(0, vat.index);
    }
    const inlineTimes = TIMES.exec(description);
    if (inlineTimes && letters(description.slice(0, inlineTimes.index)) >= 3) {
      description = description.slice(0, inlineTimes.index);
    }

    const kind: ParsedLineKind = DEPOSIT.test(text) ? 'deposit' : 'item';
    const line = newLine(
      cleanDescription(description),
      trailing ? trailing.ore : null,
      kind,
      confidence,
    );
    line.vatRate = vatRate;
    if (inlineTimes && letters(text.slice(0, inlineTimes.index)) >= 3) {
      withQuantity.add(line);
      applyQuantity(
        line,
        { count: Number(inlineTimes[1]), unitPriceOre: toOre(inlineTimes[2]!, inlineTimes[3]!) },
        null,
      );
    }
    lines.push(line);
  }

  // ---------- total, articles, date ----------
  const after = texts.slice(endIndex);
  const totalCandidates = after
    .filter((text) => TOTAL_LINE.test(text) && !/%/.test(text.slice(0, 20)))
    .flatMap((text) => {
      const t = trailingAmount(text);
      return t && t.ore > 0 ? [t.ore] : [];
    });
  const linesSumOre = lines.reduce((sum, line) => sum + (line.amountOre ?? 0), 0);
  const votes = new Map<number, number>();
  for (const ore of totalCandidates) votes.set(ore, (votes.get(ore) ?? 0) + 1);
  const ranked = [...votes.entries()].sort(
    (a, b) => b[1] - a[1] || Number(b[0] === linesSumOre) - Number(a[0] === linesSumOre),
  );
  const totalOre = ranked[0]?.[0] ?? null;

  let articleCount: number | null = null;
  for (const text of after.slice(0, 3)) {
    const m = /\((\d{1,3})\s*ART/i.exec(text) ?? /\bSUM\s+(\d{1,3})\s+VARE/i.exec(text);
    if (m) {
      articleCount = Number(m[1]);
      break;
    }
  }

  const dateFound = findDate(texts, start);
  const timeMatch = dateFound ? TIME.exec(texts[dateFound.line]!.slice(dateFound.end)) : null;
  let receiptNo: string | null = null;
  for (const text of texts.slice(0, Math.max(start, 1))) {
    const m =
      /SALGSKVITTERING\s*(?:NR\.?)?\s*:?\s*(\d{3,10})\b/i.exec(text) ??
      /\bKVITT\w*\s*(?:NR\.?)?\s*:\s*(\d{3,10})\b/i.exec(text);
    if (m) {
      receiptNo = m[1]!;
      break;
    }
  }

  // ---------- finishing the lines ----------
  const finished: ParsedReceiptLine[] = lines
    .filter((line) => line.description !== '' || line.amountOre !== null)
    .map((line) => {
      if (line.amountOre === null) line.flags.push('noAmount');
      if (line.confidence < LOW_CONFIDENCE) line.flags.push('lowConfidence');
      line.suggestedKind =
        line.kind === 'deposit' ||
        line.vatRate === 25 ||
        line.vatRate === 0 ||
        NON_FOOD_WORDS.test(line.description)
          ? 'nonFood'
          : 'food';
      line.uncertain = line.flags.some((flag) => flag !== 'discountApplied');
      return line;
    });

  return {
    chain,
    format,
    storeName: chain ? CHAIN_NAMES[chain] : null,
    date: dateFound?.date ?? null,
    time: timeMatch ? `${timeMatch[1]!.padStart(2, '0')}:${timeMatch[2]}` : null,
    receiptNo,
    totalOre,
    linesSumOre,
    sumMatches: totalOre !== null && finished.length > 0 && linesSumOre === totalOre,
    articleCount,
    lines: finished,
  };
}
