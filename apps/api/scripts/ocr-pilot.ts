/*
 * The OCR pilot (spec 08, "Pilotmåling"): runs Tesseract on real receipts and scores each field against an answer
 * key. The receipts, the answer keys and the output stay outside the repo; this script only takes their paths.
 *
 *   npx tsx apps/api/scripts/ocr-pilot.ts --images <dir> --keys <dir> --out <dir>
 *
 * For every answer key `<id>.json` it reads `<id>.jpg`. Per receipt and variant, the OCR text and the score go to
 * --out (private). The terminal only gets totals – no text from the receipts – so the output can be saved as
 * evidence. Tesseract runs in the smartmat-ocr image without a network (docker/ocr/Dockerfile).
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  normalizeReceiptImage,
  prepareForOcr,
  STORED_MAX_SIDE,
  type OcrVariant,
} from '../src/providers/ocr/image';
import { parseReceiptText, withoutPaymentLines } from '@smartmat/shared';
import {
  answerKeySchema,
  scoreLevel1,
  scoreLevel2,
  type Level1Score,
  type Level2Score,
} from '../src/providers/ocr/pilot/score';
import { TesseractOcr } from '../src/providers/ocr/tesseract';

const IMAGE = 'smartmat-ocr';
const DOCKER = ['docker', 'run', '--rm', '-i', '--network', 'none', '--memory', '2g', IMAGE];
const TIMEOUT_MS = 120_000;

/** A variant is a preparation plus how large the stored image may be. "full size" checks the 3000 px limit. */
const RUNS: { name: string; variant: OcrVariant; maxSide: number }[] = [
  { name: 'V1 raw', variant: 'raw', maxSide: STORED_MAX_SIDE },
  { name: 'V2 clean', variant: 'clean', maxSide: STORED_MAX_SIDE },
  { name: 'V3 threshold', variant: 'threshold', maxSide: STORED_MAX_SIDE },
  { name: 'V4 deskew', variant: 'deskew', maxSide: STORED_MAX_SIDE },
  { name: 'V4 deskew, full size', variant: 'deskew', maxSide: 100_000 },
];

const { values } = parseArgs({
  options: {
    images: { type: 'string' },
    keys: { type: 'string' },
    out: { type: 'string' },
    psm: { type: 'string', default: '4,6' },
  },
});
if (!values.images || !values.keys || !values.out) {
  console.error('Usage: ocr-pilot.ts --images <dir> --keys <dir> --out <dir> [--psm 4,6]');
  process.exit(2);
}
/*
 * Page segmentation modes to compare: 4 = one column of varying sizes, 6 = one uniform block. The self-test on a
 * made-up receipt showed psm 4 dropping the amount column when it stands far from the text, so both are measured.
 */
const PSMS = values.psm.split(',').map(Number);

/** Peak memory of the container while Tesseract reads `image`: memory.current polled every 50 ms (cgroup v2). */
function peakMemoryBytes(image: Buffer, psm: number): Promise<number | null> {
  const script =
    // A background job in sh reads /dev/null unless stdin is redirected explicitly (fd 3 = our stdin).
    // The word count is printed too, so a run that read nothing cannot pass as a measurement.
    `exec 3<&0; tesseract stdin /tmp/out -l nor --psm ${psm} tsv <&3 >/dev/null 2>&1 & p=$!; m=0; ` +
    'while kill -0 $p 2>/dev/null; do c=$(cat /sys/fs/cgroup/memory.current); [ "$c" -gt "$m" ] && m=$c; sleep 0.05; done; ' +
    'echo $m $(grep -c "^5" /tmp/out.tsv 2>/dev/null || echo 0)';
  return new Promise((resolve) => {
    const child = spawn(DOCKER[0]!, [...DOCKER.slice(1), 'sh', '-c', script], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('close', () => {
      const [peak, words] = out.trim().split(' ').map(Number);
      resolve(peak && words ? peak : null);
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(image);
  });
}

interface Row {
  id: string;
  run: string;
  ms: number;
  peakMb: number | null;
  meanConfidence: number | null;
  failure: string | null;
  score: Level1Score | null;
  score2: Level2Score | null;
}

const keyFiles = (await readdir(values.keys)).filter((f) => f.endsWith('.json')).sort();
await mkdir(values.out, { recursive: true, mode: 0o700 });
const rows: Row[] = [];

const runs = PSMS.flatMap((psm) =>
  RUNS.map((run) => ({ ...run, psm, name: `${run.name}, psm ${psm}` })),
);

for (const file of keyFiles) {
  const key = answerKeySchema.parse(JSON.parse(await readFile(join(values.keys, file), 'utf8')));
  const original = await readFile(join(values.images, `${key.id}.jpg`));
  for (const run of runs) {
    const stored = await normalizeReceiptImage(original, run.maxSide);
    if (!stored.ok) throw new Error(`${key.id}: could not read the image (${stored.reason})`);
    const ocr = new TesseractOcr({
      command: [...DOCKER, 'timeout', '110', 'tesseract'],
      language: 'nor',
      psm: run.psm,
      variant: run.variant,
      timeoutMs: TIMEOUT_MS,
    });
    const started = Date.now();
    const result = await ocr.recognize(stored.jpeg);
    const ms = Date.now() - started;

    // Memory is measured in a second run of the same prepared image (the first one has no way to report it).
    const rotation = result.ok ? result.text.rotation : 0;
    const peak = await peakMemoryBytes(
      await prepareForOcr(stored.jpeg, run.variant, rotation),
      run.psm,
    );

    const slug = `${key.id}.${run.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const score = result.ok
      ? scoreLevel1(
          key,
          result.text.lines.map((l) => l.text),
        )
      : null;
    // Level 2 reads what the app would store: the payment lines are dropped first.
    const parsed = result.ok ? parseReceiptText(withoutPaymentLines(result.text.lines)) : null;
    const score2 = parsed ? scoreLevel2(key, parsed) : null;
    if (result.ok) {
      const text = result.text.lines
        .map((l) => `${String(l.confidence).padStart(3)} | ${l.text}`)
        .join('\n');
      await writeFile(join(values.out, `${slug}.txt`), `${text}\n`, { mode: 0o600 });
      await writeFile(
        join(values.out, `${slug}.parsed.json`),
        `${JSON.stringify(parsed, null, 2)}\n`,
        { mode: 0o600 },
      );
    }
    await writeFile(
      join(values.out, `${slug}.score.json`),
      `${JSON.stringify({ score, score2, ms, rotation }, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
    rows.push({
      id: key.id,
      run: run.name,
      ms,
      peakMb: peak === null ? null : Math.round(peak / 1024 / 1024),
      meanConfidence: result.ok ? result.text.meanConfidence : null,
      failure: result.ok ? null : result.failure,
      score,
      score2,
    });
  }
}

// Totals only: field hit counts per variant, and time and memory. No receipt text.
const pct = (n: number, of: number) =>
  of === 0 ? '–' : `${n}/${of} (${Math.round((n / of) * 100)} %)`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
console.log(`OCR pilot. Tesseract, language nor, psm ${PSMS.join(' and ')}.`);
console.log(
  `Receipts: ${keyFiles.length}. Ids: ${keyFiles.map((f) => f.replace('.json', '')).join(', ')}\n`,
);

console.log('## Level 1: fields found in the OCR text\n');
console.log(
  '| Variant | Chain | Date | Total | Item lines found | Item amounts exact | Deposit found | Deposit amounts exact | Mean line CER | Mean conf. | Time (s) | Peak memory (MB) |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const run of runs) {
  const mine = rows.filter((r) => r.run === run.name);
  const scored = mine.flatMap((r) => (r.score ? [r.score] : []));
  const sum = (f: (s: Level1Score) => number) => scored.reduce((t, s) => t + f(s), 0);
  const count = (f: (s: Level1Score) => boolean) => scored.filter(f).length;
  const itemsFound = sum((s) => s.items.found);
  const depFound = sum((s) => s.deposits.found);
  const times = mine.map((r) => r.ms / 1000);
  const peaks = mine.flatMap((r) => (r.peakMb === null ? [] : [r.peakMb]));
  const confs = mine.flatMap((r) => (r.meanConfidence === null ? [] : [r.meanConfidence]));
  console.log(
    `| ${run.name} | ${pct(
      count((s) => s.chain),
      mine.length,
    )} | ${pct(
      count((s) => s.date),
      mine.length,
    )} | ` +
      `${pct(
        count((s) => s.total),
        mine.length,
      )} | ${pct(
        itemsFound,
        sum((s) => s.items.of),
      )} | ` +
      `${pct(
        sum((s) => s.items.amountExact),
        itemsFound,
      )} | ${pct(
        depFound,
        sum((s) => s.deposits.of),
      )} | ` +
      `${pct(
        sum((s) => s.deposits.amountExact),
        depFound,
      )} | ${avg(scored.map((s) => s.meanLineCer)).toFixed(2)} | ` +
      `${Math.round(avg(confs))} | ${avg(times).toFixed(1)} (max ${Math.max(...times).toFixed(1)}) | ` +
      `${peaks.length ? Math.max(...peaks) : '–'} |`,
  );
  for (const r of mine.filter((m) => m.failure)) console.log(`  ${r.id}: failed (${r.failure})`);
}

console.log('\n## Level 2: OCR + parser against the answer key ("good enough" is judged here)\n');
console.log(
  '| Variant | Chain | Layout | Date | Time | Receipt no. | Total | Lines = total | Item lines found | Item amounts exact | Deposit found | Deposit amounts exact | Extra lines | Flagged lines |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const run of runs) {
  const mine = rows.filter((r) => r.run === run.name);
  const scored = mine.flatMap((r) => (r.score2 ? [r.score2] : []));
  const sum = (f: (s: Level2Score) => number) => scored.reduce((t, s) => t + f(s), 0);
  const count = (f: (s: Level2Score) => boolean) => pct(scored.filter(f).length, mine.length);
  const itemsFound = sum((s) => s.items.found);
  const depFound = sum((s) => s.deposits.found);
  console.log(
    `| ${run.name} | ${count((s) => s.chain)} | ${count((s) => s.format)} | ${count((s) => s.date)} | ` +
      `${count((s) => s.time)} | ${count((s) => s.receiptNo)} | ${count((s) => s.total)} | ${count((s) => s.sumMatches)} | ` +
      `${pct(
        itemsFound,
        sum((s) => s.items.of),
      )} | ${pct(
        sum((s) => s.items.amountExact),
        itemsFound,
      )} | ` +
      `${pct(
        depFound,
        sum((s) => s.deposits.of),
      )} | ${pct(
        sum((s) => s.deposits.amountExact),
        depFound,
      )} | ` +
      `${sum((s) => s.extraLines)} | ${sum((s) => s.flagged)} |`,
  );
}

console.log('\nPer receipt, level 2 (found/of, amounts exact; no receipt text):');
for (const r of rows) {
  const s = r.score2;
  const yes = (b: boolean) => (b ? 'yes' : 'no');
  console.log(
    `  ${r.id.padEnd(10)} ${r.run.padEnd(30)} ` +
      (s
        ? `items ${s.items.found}/${s.items.of} amounts ${s.items.amountExact}, deposits ${s.deposits.found}/${s.deposits.of} amounts ${s.deposits.amountExact}, ` +
          `chain ${yes(s.chain)}, date ${yes(s.date)}, total ${yes(s.total)}, sum ok ${yes(s.sumMatches)}, extra ${s.extraLines}, flagged ${s.flagged}`
        : `failed (${r.failure})`),
  );
}
