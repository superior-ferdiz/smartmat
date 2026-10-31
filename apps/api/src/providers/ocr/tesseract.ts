import { spawn } from 'node:child_process';
import { paperIsLandscape, prepareForOcr, type OcrVariant } from './image';
import { parseTesseractTsv } from './tesseractTsv';
import type { OcrProvider, OcrResult, OcrText } from './types';

/*
 * Tesseract on our own server (ADR-0011, ADR-0017). It runs as a child process without a shell: the image goes in
 * on stdin and the text comes out on stdout, so nothing is written to disk. `command` is what starts it:
 * - the worker in the test environment: ["timeout", "55", "tesseract"] (Tesseract is in its image)
 * - locally: ["docker", "run", "--rm", "-i", "--network", "none", "smartmat-ocr", "timeout", "55", "tesseract"]
 *   (`timeout` inside the container, because killing the docker client does not stop the container)
 * stderr is never logged: it is only Tesseract's own notes, but we do not keep anything about the image.
 */

export interface TesseractOptions {
  command: readonly string[];
  language: string;
  /** Page segmentation mode. 4 = one column of text of varying size (a receipt). */
  psm: number;
  variant: OcrVariant;
  timeoutMs: number;
}

export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

type Rotation = 0 | 90 | 180 | 270;
const ALL_ROTATIONS: Rotation[] = [0, 90, 180, 270];
/** A reading with a lower mean confidence than this makes recognize() try the other two rotations as well. */
export const SURE_CONFIDENCE = 70;

export type RunResult = { ok: true; stdout: string } | { ok: false; reason: 'timeout' | 'failed' };

/** Runs `command + args` with `input` on stdin. Never throws. */
export function runWithInput(
  command: readonly string[],
  args: readonly string[],
  input: Buffer,
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const [file, ...prefix] = command;
    if (!file) {
      resolve({ ok: false, reason: 'failed' });
      return;
    }
    let settled = false;
    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(file, [...prefix, ...args], {
      stdio: ['pipe', 'pipe', 'ignore'],
      shell: false,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish({ ok: false, reason: 'failed' });
        return;
      }
      chunks.push(chunk);
    });
    child.on('error', () => finish({ ok: false, reason: 'failed' }));
    child.on('close', (code) =>
      finish(
        code === 0
          ? { ok: true, stdout: Buffer.concat(chunks).toString('utf8') }
          : { ok: false, reason: 'failed' },
      ),
    );
    // A process that exits before reading all of stdin gives EPIPE; the exit code decides the result.
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

export class TesseractOcr implements OcrProvider {
  constructor(private readonly options: TesseractOptions) {}

  get engine() {
    const { language, psm, variant } = this.options;
    return `tesseract ${language} psm${psm} ${variant}`;
  }

  /**
   * The paper's shape says whether the receipt lies on its side; Tesseract's own orientation detection (OSD) was
   * tried first and picked the wrong way on two of three real receipts. So the two rotations the shape points to
   * are read, and the one with the most confident words wins (then the higher mean). A short receipt is wider
   * than tall, so its shape can point the wrong way: when the better reading is still unsure, the other two
   * rotations are read as well.
   */
  async recognize(image: Buffer): Promise<OcrResult> {
    const started = Date.now();
    const remaining = () => Math.max(1, this.options.timeoutMs - (Date.now() - started));
    const { command, language, psm, variant } = this.options;

    let first: Rotation[];
    try {
      first = variant === 'raw' ? [0] : (await paperIsLandscape(image)) ? [90, 270] : [0, 180];
    } catch {
      return { ok: false, failure: 'invalidResponse' };
    }

    const args = ['stdin', 'stdout', '-l', language, '--psm', String(psm), 'tsv'];
    let best: { text: OcrText; weight: number } | null = null;
    const read = async (rotation: Rotation): Promise<OcrResult | null> => {
      let prepared: Buffer;
      try {
        prepared = await prepareForOcr(image, variant, rotation);
      } catch {
        return { ok: false, failure: 'invalidResponse' };
      }
      const run = await runWithInput(command, args, prepared, remaining());
      if (!run.ok) {
        return { ok: false, failure: run.reason === 'timeout' ? 'timeout' : 'unavailable' };
      }
      const parsed = parseTesseractTsv(run.stdout);
      if (!parsed.ok && parsed.reason === 'invalid')
        return { ok: false, failure: 'invalidResponse' };
      if (!parsed.ok) return null;
      // Confident words, not all words: a reading the wrong way up can give many low-confidence junk words.
      const weight = parsed.confidentWords * 100 + parsed.meanConfidence;
      if (!best || weight > best.weight) {
        best = {
          text: {
            lines: parsed.lines,
            meanConfidence: parsed.meanConfidence,
            engine: this.engine,
            rotation,
          },
          weight,
        };
      }
      return null;
    };

    for (const rotation of first) {
      const failed = await read(rotation);
      if (failed) return failed;
    }
    const unsure = (current: typeof best) =>
      !current || current.text.meanConfidence < SURE_CONFIDENCE;
    if (variant !== 'raw' && unsure(best)) {
      for (const rotation of ALL_ROTATIONS.filter((r) => !first.includes(r))) {
        const failed = await read(rotation);
        if (failed) return failed;
      }
    }
    const found = best as { text: OcrText; weight: number } | null;
    if (!found) return { ok: false, failure: 'noText' };
    return { ok: true, text: found.text };
  }
}
