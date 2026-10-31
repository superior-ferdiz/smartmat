import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWithInput, TesseractOcr } from './tesseract';

/*
 * A small Node program stands in for Tesseract, so these tests need neither Docker nor Tesseract. It is given as
 * the command, exactly like the real one, and gets the same arguments and stdin.
 */
const node = (script: string) => [process.execPath, '-e', script];

const TSV_HEADER =
  'level\\tpage_num\\tblock_num\\tpar_num\\tline_num\\tword_num\\tleft\\ttop\\twidth\\theight\\tconf\\ttext';
/** One made-up line per call, after reading all of stdin. */
const fakeTesseract = node(`
  process.stdin.resume();
  process.stdin.on('end', () => {
    process.stdout.write('${TSV_HEADER}\\n5\\t1\\t1\\t1\\t1\\t1\\t0\\t0\\t9\\t9\\t91\\tTESTVARE\\n');
  });
`);

/** Answers the n-th call with answers[n]: `words` words at `conf`. Counts calls in a temp file. */
function countingFake(answers: { words: number; conf: number }[]) {
  const counter = join(mkdtempSync(join(tmpdir(), 'ocr-fake-')), 'n');
  writeFileSync(counter, '0');
  return node(`
    const fs = require('node:fs');
    const n = Number(fs.readFileSync(${JSON.stringify(counter)}, 'utf8'));
    fs.writeFileSync(${JSON.stringify(counter)}, String(n + 1));
    const a = ${JSON.stringify(answers)}[n];
    process.stdin.resume();
    process.stdin.on('end', () => {
      let out = '${TSV_HEADER}\\n';
      for (let i = 1; i <= a.words; i++) out += '5\\t1\\t1\\t1\\t1\\t' + i + '\\t0\\t0\\t9\\t9\\t' + a.conf + '\\tORD' + n + '\\n';
      process.stdout.write(out);
    });
  `);
}

/** A white receipt on a dark table: standing (taller than wide) or lying on its side. */
const photo = (lying: boolean) =>
  sharp({ create: { width: 800, height: 800, channels: 3, background: '#202020' } })
    .composite([
      {
        input: {
          create: {
            width: lying ? 600 : 250,
            height: lying ? 250 : 600,
            channels: 3,
            background: '#f4f4f4',
          },
        },
        left: 100,
        top: 100,
      },
    ])
    .jpeg()
    .toBuffer();

const image = () =>
  sharp({ create: { width: 200, height: 120, channels: 3, background: '#ffffff' } })
    .jpeg()
    .toBuffer();

// These tests start real child processes; on a busy machine that takes longer than the default 5 s.
describe('runWithInput', { timeout: 20_000 }, () => {
  it('passes stdin through and returns stdout', async () => {
    const result = await runWithInput(
      node('process.stdin.pipe(process.stdout)'),
      [],
      Buffer.from('hei'),
      5000,
    );
    expect(result).toEqual({ ok: true, stdout: 'hei' });
  });

  it('kills a process that runs too long', async () => {
    const started = Date.now();
    const result = await runWithInput(
      node('setTimeout(() => {}, 10000)'),
      [],
      Buffer.from(''),
      200,
    );
    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('fails on a non-zero exit, a missing program and too much output', async () => {
    expect(await runWithInput(node('process.exit(3)'), [], Buffer.from(''), 5000)).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(await runWithInput(['/nonexistent/tesseract'], [], Buffer.from(''), 5000)).toEqual({
      ok: false,
      reason: 'failed',
    });
    const flood = node(
      'const b = Buffer.alloc(65536, 65); (function w(){ process.stdout.write(b, w); })()',
    );
    expect(await runWithInput(flood, [], Buffer.from(''), 10000)).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('does not use a shell (metacharacters are plain arguments)', async () => {
    const result = await runWithInput(
      node('process.stdout.write(process.argv[1])'),
      ['$(id); echo x'],
      Buffer.from(''),
      5000,
    );
    expect(result).toEqual({ ok: true, stdout: '$(id); echo x' });
  });
});

describe('TesseractOcr (spec 08 FR-RCPT-003)', { timeout: 20_000 }, () => {
  const options = { language: 'nor', psm: 4, timeoutMs: 5000 } as const;

  it('returns the lines and the engine', async () => {
    const ocr = new TesseractOcr({ ...options, command: fakeTesseract, variant: 'clean' });
    expect(await ocr.recognize(await photo(false))).toEqual({
      ok: true,
      text: {
        lines: [{ text: 'TESTVARE', confidence: 91 }],
        meanConfidence: 91,
        engine: 'tesseract nor psm4 clean',
        rotation: 0,
      },
    });
  });

  it('reads a standing receipt at 0° and 180°, and keeps the more confident reading', async () => {
    const command = countingFake([
      { words: 3, conf: 40 },
      { words: 5, conf: 90 },
    ]);
    const result = await new TesseractOcr({ ...options, command, variant: 'clean' }).recognize(
      await photo(false),
    );
    expect(result.ok && result.text.rotation).toBe(180);
    expect(result.ok && result.text.lines[0]?.text).toMatch(/^ORD1/);
  });

  it('reads a receipt lying on its side at 90° and 270°', async () => {
    const first = countingFake([
      { words: 5, conf: 90 },
      { words: 5, conf: 20 },
    ]);
    const lying = await photo(true);
    const a = await new TesseractOcr({ ...options, command: first, variant: 'deskew' }).recognize(
      lying,
    );
    expect(a.ok && a.text.rotation).toBe(90);
    const second = countingFake([
      { words: 0, conf: 0 },
      { words: 2, conf: 80 },
    ]);
    const b = await new TesseractOcr({ ...options, command: second, variant: 'clean' }).recognize(
      lying,
    );
    expect(b.ok && b.text.rotation).toBe(270);
  });

  it('a short receipt on its side looks standing: when 0° and 180° are unsure, 90° and 270° are read too', async () => {
    const command = countingFake([
      { words: 4, conf: 30 },
      { words: 3, conf: 35 },
      { words: 6, conf: 92 },
      { words: 2, conf: 20 },
    ]);
    const result = await new TesseractOcr({ ...options, command, variant: 'clean' }).recognize(
      await photo(false),
    );
    expect(result.ok && result.text.rotation).toBe(90);
    expect(result.ok && result.text.meanConfidence).toBe(92);
  });

  it('many junk words with low confidence do not beat fewer confident ones (the pilot, psm 6)', async () => {
    const command = countingFake([
      { words: 5, conf: 65 },
      { words: 3, conf: 20 },
      { words: 2, conf: 15 },
      { words: 40, conf: 35 },
    ]);
    const result = await new TesseractOcr({ ...options, command, variant: 'clean' }).recognize(
      await photo(false),
    );
    expect(result.ok && result.text.rotation).toBe(0);
  });

  it('a sure first reading is not read again in the other rotations', async () => {
    const command = countingFake([
      { words: 6, conf: 90 },
      { words: 6, conf: 40 },
    ]);
    // A third call would find no answer in the list and fail the test.
    const result = await new TesseractOcr({ ...options, command, variant: 'clean' }).recognize(
      await photo(false),
    );
    expect(result.ok && result.text.rotation).toBe(0);
  });

  it('raw reads once, as the image is', async () => {
    const command = countingFake([{ words: 1, conf: 70 }]);
    const result = await new TesseractOcr({ ...options, command, variant: 'raw' }).recognize(
      await photo(true),
    );
    expect(result.ok && result.text.rotation).toBe(0);
  });

  it('maps failures to timeout, unavailable, invalidResponse and noText', async () => {
    const run = (command: string[]) =>
      new TesseractOcr({ ...options, command, variant: 'raw', timeoutMs: 300 });
    const img = await image();
    expect(await run(node('setTimeout(() => {}, 10000)')).recognize(img)).toEqual({
      ok: false,
      failure: 'timeout',
    });
    expect(await run(['/nonexistent/tesseract']).recognize(img)).toEqual({
      ok: false,
      failure: 'unavailable',
    });
    expect(await run(node("process.stdout.write('not tsv')")).recognize(img)).toEqual({
      ok: false,
      failure: 'invalidResponse',
    });
    expect(await run(node(`process.stdout.write('${TSV_HEADER}\\n')`)).recognize(img)).toEqual({
      ok: false,
      failure: 'noText',
    });
  });
});
