import { describe, expect, it } from 'vitest';
import { OCR_LINE_MAX_LENGTH, parseTesseractTsv } from './tesseractTsv';

const HEADER =
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const word = (line: number, n: number, conf: number, text: string) =>
  `5\t1\t1\t1\t${line}\t${n}\t0\t0\t10\t10\t${conf}\t${text}`;

describe('Tesseract TSV (spec 08)', () => {
  it('joins words into lines with their mean confidence', () => {
    const tsv = [
      HEADER,
      '1\t1\t0\t0\t0\t0\t0\t0\t900\t300\t-1\t',
      '4\t1\t1\t1\t1\t0\t21\t39\t351\t30\t-1\t',
      word(1, 1, 96.5, 'GULROT'),
      word(1, 2, 90, 'POSE'),
      word(1, 3, 61.5, '24,90'),
      word(2, 1, 80, '+'),
      word(2, 2, 70, 'Pant'),
      '',
    ].join('\n');
    expect(parseTesseractTsv(tsv)).toEqual({
      ok: true,
      lines: [
        { text: 'GULROT POSE 24,90', confidence: 83 },
        { text: '+ Pant', confidence: 75 },
      ],
      meanConfidence: 80,
      words: 5,
      confidentWords: 5,
    });
  });

  it('skips empty words and words without a confidence', () => {
    const tsv = [HEADER, word(1, 1, -1, 'x'), word(1, 2, 50, ' '), word(1, 3, 88, 'MELK')].join(
      '\n',
    );
    expect(parseTesseractTsv(tsv)).toMatchObject({
      ok: true,
      lines: [{ text: 'MELK', confidence: 88 }],
    });
  });

  it('says "empty" when there are no words and "invalid" for anything that is not Tesseract TSV', () => {
    expect(parseTesseractTsv(`${HEADER}\n`)).toEqual({ ok: false, reason: 'empty' });
    expect(parseTesseractTsv('GULROT 24,90\n')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseTesseractTsv(`${HEADER}\n5\t1\t1`)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseTesseractTsv('')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('cuts very long lines', () => {
    const long = 'A'.repeat(OCR_LINE_MAX_LENGTH + 50);
    const result = parseTesseractTsv([HEADER, word(1, 1, 90, long)].join('\n'));
    expect(result.ok && result.lines[0]?.text.length).toBe(OCR_LINE_MAX_LENGTH);
  });
});
