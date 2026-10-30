import {
  CHAIN_FORMAT,
  CHAIN_NAMES,
  parseReceiptText,
  withoutPaymentLines,
  type ParsedReceipt,
} from '@smartmat/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { OcrProvider } from '../../providers/ocr/types';
import type { ReceiptRepo } from './repo';

/*
 * The worker's job for one receipt (spec 08 FR-RCPT-003/004): read the image, drop the payment lines, parse, and
 * store the result for review. The log gets the receipt id, the outcome and the time – never any text, amount or
 * store (NFR-SEC-004).
 */

export const RAW_TEXT_MAX_LENGTH = 100_000;

export interface ReceiptProcessorDeps {
  repo: ReceiptRepo;
  ocr: OcrProvider;
  /**
   * Read again only when the first reading found no chain: a harder black-and-white image reads the logo more
   * often (the Extra logo in the pilot). Only the chain is taken from it, and only one of the format already found.
   */
  chainOcr?: OcrProvider;
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>;
  /** Milliseconds, for the duration. Tests pass a fake. */
  clock?: () => number;
}

export class ReceiptProcessor {
  constructor(private readonly deps: ReceiptProcessorDeps) {}

  async process(receiptId: string) {
    const { repo, ocr, log } = this.deps;
    const clock = this.deps.clock ?? Date.now;
    const claimed = await repo.claim(receiptId);
    if (!claimed) {
      log.info({ receiptId, outcome: 'skipped' }, 'receipt job');
      return;
    }
    const started = clock();
    let result;
    try {
      result = await ocr.recognize(claimed.jpeg);
    } catch {
      // A provider must not throw; if one does, the receipt fails instead of staying "processing".
      result = { ok: false as const, failure: 'unavailable' as const };
    }
    const durationMs = Math.max(0, Math.round(clock() - started));

    if (!result.ok) {
      await repo.fail(receiptId, result.failure);
      log.warn({ receiptId, outcome: result.failure, durationMs }, 'receipt job');
      return;
    }

    const lines = withoutPaymentLines(result.text.lines);
    if (lines.length === 0) {
      await repo.fail(receiptId, 'noText');
      log.warn({ receiptId, outcome: 'noText', durationMs }, 'receipt job');
      return;
    }
    const parsed = parseReceiptText(lines);
    if (!parsed.chain && this.deps.chainOcr) await this.findChain(claimed.jpeg, parsed);
    await repo.saveExtraction(receiptId, {
      engine: result.text.engine.slice(0, 60),
      rawText: lines
        .map((line) => line.text)
        .join('\n')
        .slice(0, RAW_TEXT_MAX_LENGTH),
      parsed: JSON.parse(JSON.stringify(parsed)) as object,
      meanConfidence: Math.max(0, Math.min(100, Math.round(result.text.meanConfidence))),
      durationMs,
    });
    log.info({ receiptId, outcome: 'review', durationMs }, 'receipt job');
  }

  private async findChain(jpeg: Buffer, parsed: ParsedReceipt) {
    let second;
    try {
      second = await this.deps.chainOcr!.recognize(jpeg);
    } catch {
      return;
    }
    if (!second.ok) return;
    const chain = parseReceiptText(withoutPaymentLines(second.text.lines)).chain;
    if (!chain) return;
    // A chain of another format is a misreading (an item name in a garbled header), not the store.
    if (parsed.format !== 'generic' && CHAIN_FORMAT[chain] !== parsed.format) return;
    parsed.chain = chain;
    parsed.format = CHAIN_FORMAT[chain];
    parsed.storeName = CHAIN_NAMES[chain];
  }
}
