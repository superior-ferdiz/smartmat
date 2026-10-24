import { createHash } from 'node:crypto';
import {
  API_ERRORS,
  parsedReceiptLineSchema,
  RECEIPT_CHAINS,
  RECEIPT_FORMATS,
  type ConfirmReceiptBody,
  type PurchaseResponse,
  type ReceiptListResponse,
  type ReceiptResponse,
  type ReceiptSummary,
} from '@smartmat/shared';
import { z } from 'zod';
import type { AppConfig } from '../../config';
import type { Clock } from '../../lib/clock';
import { AppError, notFound } from '../../lib/errors';
import type { WindowLimiter } from '../../lib/windowLimiter';
import { normalizeReceiptImage } from '../../providers/ocr/image';
import { ReceiptNotInReviewError } from '../purchases/repo';
import { purchaseTotal, type PurchaseService } from '../purchases/service';
import type { ReceiptRepo, ReceiptRow } from './repo';

/*
 * Receipts (spec 08). The API takes the photo, rewrites it without metadata and queues it; the worker reads it
 * (processor.ts). Nothing becomes a purchase until the user has corrected and confirmed it (ADR-0007, ADR-0011).
 */

export const RECEIPT_RETENTION_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/** Where the API sends the receipt id for the worker (pg-boss in the app, a fake in tests). */
export interface ReceiptQueue {
  enqueue(receiptId: string): Promise<void>;
}

export interface ReceiptServiceDeps {
  repo: ReceiptRepo;
  purchases: PurchaseService;
  queue: ReceiptQueue;
  config: AppConfig['receipts'];
  uploadLimiter: WindowLimiter;
  now: Clock;
}

/** The stored parse, read back with a schema: a row written by an older version cannot break the page. */
const storedParseSchema = z.object({
  chain: z.enum(RECEIPT_CHAINS).nullable(),
  format: z.enum(RECEIPT_FORMATS),
  storeName: z.string().nullable(),
  date: z.iso.date().nullable(),
  time: z.string().nullable(),
  receiptNo: z.string().nullable(),
  totalOre: z.number().int().nonnegative().nullable(),
  linesSumOre: z.number().int(),
  sumMatches: z.boolean(),
  lines: z.array(parsedReceiptLineSchema),
});
type StoredParse = z.infer<typeof storedParseSchema>;

function readParse(row: ReceiptRow): StoredParse | null {
  const result = storedParseSchema.safeParse(row.extraction?.parsed);
  return result.success ? result.data : null;
}

/**
 * FR-RCPT-007, the strong key: the same receipt photographed twice gives the same key. Only when the receipt
 * number and the time were read; the date and the total are the ones the user confirmed. Hashed, so the
 * receipt number is not stored in clear on the purchase.
 */
export function receiptDedupeKey(parse: StoredParse | null, purchasedOn: string, totalOre: number) {
  if (!parse?.receiptNo || !parse.time) return null;
  const fingerprint = [
    parse.format,
    parse.chain ?? '',
    purchasedOn,
    parse.time,
    parse.receiptNo,
    totalOre,
  ].join('|');
  return `receipt:${createHash('sha256').update(fingerprint).digest('hex')}`;
}

export class ReceiptService {
  constructor(private readonly deps: ReceiptServiceDeps) {}

  private get ocrAvailable() {
    return this.deps.config.ocrProvider !== 'off';
  }

  async upload(householdId: string, userId: string, file: Buffer): Promise<ReceiptSummary> {
    const { repo, config, now } = this.deps;
    if (!this.ocrAvailable) throw new AppError(503, API_ERRORS.receiptOcrUnavailable);
    if (!this.deps.uploadLimiter.take(userId)) throw new AppError(429, API_ERRORS.rateLimited);
    if ((await repo.countWaiting()) >= config.maxQueued)
      throw new AppError(503, API_ERRORS.receiptBusy);

    const image = await normalizeReceiptImage(file);
    if (!image.ok) {
      if (image.reason === 'tooLarge') throw new AppError(413, API_ERRORS.receiptTooLarge);
      if (image.reason === 'unsupportedType')
        throw new AppError(415, API_ERRORS.receiptUnsupportedType);
      throw new AppError(400, API_ERRORS.receiptUnreadable);
    }
    const time = now();
    const existing = await repo.findOpenBySha(householdId, image.sha256, time);
    if (existing) throw new AppError(409, API_ERRORS.receiptAlreadyUploaded, undefined, existing);

    const deleteAfter = new Date(time.getTime() + RECEIPT_RETENTION_DAYS * DAY);
    const created = await repo.create(householdId, userId, image, deleteAfter);
    await this.deps.queue.enqueue(created.id);
    return {
      id: created.id,
      status: 'queued',
      failureCode: null,
      createdAt: created.createdAt.toISOString(),
      deleteAfter: deleteAfter.toISOString(),
    };
  }

  async list(householdId: string): Promise<ReceiptListResponse> {
    const rows = await this.deps.repo.list(householdId, this.deps.now());
    return {
      ocrAvailable: this.ocrAvailable,
      lineSuggestions: this.deps.config.lineSuggestions,
      receipts: rows.map(summary),
    };
  }

  async get(householdId: string, receiptId: string): Promise<ReceiptResponse> {
    const row = await this.deps.repo.get(householdId, receiptId, this.deps.now());
    if (!row) throw notFound();
    const parse = row.status === 'review' ? readParse(row) : null;
    const linesShown = this.deps.config.lineSuggestions;
    return {
      ...summary(row),
      purchaseId: row.purchaseId,
      suggestion: parse && {
        storeName: parse.storeName,
        chain: parse.chain,
        purchasedOn: parse.date,
        totalOre: parse.totalOre,
        linesShown,
        lines: linesShown ? parse.lines : [],
        linesSumOre: parse.linesSumOre,
        sumMatches: parse.sumMatches,
      },
      rawText:
        row.status === 'review' && row.extraction ? row.extraction.rawText.split('\n') : null,
      meanConfidence: row.status === 'review' ? (row.extraction?.meanConfidence ?? null) : null,
    };
  }

  async image(householdId: string, receiptId: string): Promise<Buffer> {
    const bytes = await this.deps.repo.image(householdId, receiptId, this.deps.now());
    if (!bytes) throw notFound();
    return bytes;
  }

  async remove(householdId: string, receiptId: string) {
    const row = await this.deps.repo.get(householdId, receiptId, this.deps.now());
    if (!row) throw notFound();
    if (row.status === 'confirmed') throw new AppError(409, API_ERRORS.receiptAlreadyConfirmed);
    if (!(await this.deps.repo.remove(householdId, receiptId))) throw notFound();
  }

  async retry(householdId: string, receiptId: string): Promise<ReceiptSummary> {
    const { repo, now } = this.deps;
    const row = await repo.get(householdId, receiptId, now());
    if (!row) throw notFound();
    if (!(await repo.requeue(householdId, receiptId, now()))) {
      throw new AppError(409, API_ERRORS.receiptCannotRetry);
    }
    await this.deps.queue.enqueue(receiptId);
    return { ...summary(row), status: 'queued', failureCode: null };
  }

  /**
   * FR-RCPT-006/007. Returns the purchase and whether it is new: confirming the same receipt twice answers with
   * the purchase that was made the first time.
   */
  async confirm(
    householdId: string,
    actorId: string,
    receiptId: string,
    body: ConfirmReceiptBody,
  ): Promise<{ purchase: PurchaseResponse; created: boolean }> {
    const { repo, purchases, now } = this.deps;
    const row = await repo.get(householdId, receiptId, now());
    if (!row) throw notFound();
    const done = await this.alreadyConfirmed(householdId, row);
    if (done) return done;
    if (row.status !== 'review') throw new AppError(409, API_ERRORS.receiptNotReady);

    const totalOre = purchaseTotal(body.lines, body.totalOre);
    const strongKey = receiptDedupeKey(readParse(row), body.purchasedOn, totalOre);
    if (strongKey) {
      const existing = await purchases.findByDedupeKey(householdId, strongKey);
      if (existing) throw new AppError(409, API_ERRORS.receiptDuplicate, undefined, existing);
    } else if (!body.allowPossibleDuplicate) {
      const similar = await repo.findSameDateAndTotal(householdId, body.purchasedOn, totalOre);
      if (similar) throw new AppError(409, API_ERRORS.receiptPossibleDuplicate, undefined, similar);
    }
    // Without a strong key the receipt itself is the key: one receipt can still only give one purchase.
    const dedupeKey = strongKey ?? `receipt-id:${receiptId}`;

    let id: string | null;
    try {
      id = await purchases.createFromReceipt(householdId, actorId, body, dedupeKey, {
        id: receiptId,
        confirmedAt: now(),
      });
    } catch (error) {
      if (!(error instanceof ReceiptNotInReviewError)) throw error;
      id = null;
    }
    if (id) return { purchase: await purchases.get(householdId, id), created: true };

    // Lost a race: the same receipt confirmed at the same moment, or another receipt took the strong key.
    const after = await repo.get(householdId, receiptId, now());
    const confirmed = after && (await this.alreadyConfirmed(householdId, after));
    if (confirmed) return confirmed;
    const taken = await purchases.findByDedupeKey(householdId, dedupeKey);
    if (taken) throw new AppError(409, API_ERRORS.receiptDuplicate, undefined, taken);
    throw new AppError(409, API_ERRORS.receiptNotReady);
  }

  private async alreadyConfirmed(householdId: string, row: ReceiptRow) {
    if (row.status !== 'confirmed' || !row.purchaseId) return null;
    return { purchase: await this.deps.purchases.get(householdId, row.purchaseId), created: false };
  }
}

function summary(row: ReceiptRow): ReceiptSummary {
  return {
    id: row.id,
    status: row.status,
    failureCode: row.failureCode,
    createdAt: row.createdAt.toISOString(),
    deleteAfter: row.deleteAfter.toISOString(),
  };
}
