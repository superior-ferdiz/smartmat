import type { OcrLine } from './types';

/*
 * Tesseract's TSV output: one row per page, block, paragraph, line and word, with a confidence on the words.
 * We keep the words (level 5), joined into their lines in the order Tesseract wrote them.
 */

const HEADER = [
  'level',
  'page_num',
  'block_num',
  'par_num',
  'line_num',
  'word_num',
  'left',
  'top',
  'width',
  'height',
  'conf',
  'text',
];

const WORD_LEVEL = '5';
/** Lines longer than this are not receipt lines; cut so a broken answer cannot grow the extraction. */
export const OCR_LINE_MAX_LENGTH = 200;
export const OCR_MAX_LINES = 400;
/** A word Tesseract is fairly sure of. Garbage read from an image the wrong way up has almost none. */
export const CONFIDENT_WORD = 60;

export type TsvParseResult =
  | { ok: true; lines: OcrLine[]; meanConfidence: number; words: number; confidentWords: number }
  | { ok: false; reason: 'invalid' | 'empty' };

export function parseTesseractTsv(tsv: string): TsvParseResult {
  const rows = tsv.split(/\r?\n/);
  const header = rows[0]?.split('\t');
  if (!header || header.length !== HEADER.length || header.some((name, i) => name !== HEADER[i])) {
    return { ok: false, reason: 'invalid' };
  }

  const lines = new Map<string, { words: string[]; confidences: number[] }>();
  const allConfidences: number[] = [];
  for (const row of rows.slice(1)) {
    if (row === '') continue;
    const cells = row.split('\t');
    if (cells.length !== HEADER.length) return { ok: false, reason: 'invalid' };
    if (cells[0] !== WORD_LEVEL) continue;
    const confidence = Number(cells[10]);
    const word = (cells[11] ?? '').trim();
    if (!Number.isFinite(confidence) || confidence < 0 || word === '') continue;
    const key = cells.slice(1, 5).join('.');
    const line = lines.get(key) ?? { words: [], confidences: [] };
    line.words.push(word);
    line.confidences.push(Math.min(confidence, 100));
    lines.set(key, line);
    allConfidences.push(Math.min(confidence, 100));
  }

  if (allConfidences.length === 0) return { ok: false, reason: 'empty' };
  return {
    ok: true,
    lines: [...lines.values()].slice(0, OCR_MAX_LINES).map((line) => ({
      text: line.words.join(' ').slice(0, OCR_LINE_MAX_LENGTH),
      confidence: Math.round(mean(line.confidences)),
    })),
    meanConfidence: Math.round(mean(allConfidences)),
    words: allConfidences.length,
    confidentWords: allConfidences.filter((c) => c >= CONFIDENT_WORD).length,
  };
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
