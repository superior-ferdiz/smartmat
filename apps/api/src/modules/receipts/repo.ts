import type { ReceiptFailure, ReceiptStatus } from '@smartmat/shared';
import type { Db } from '../../db';
import { toDbDate } from '../../lib/dbDates';
import type { Prisma } from '../../generated/prisma/client';

/*
 * Database access for receipts (spec 08). Functions called from a request take the household id and filter on it
 * (NFR-SEC-001). The worker's functions take only the receipt id: the job comes from our own queue, not from a
 * user, and carries nothing else.
 *
 * Unconfirmed receipts past `delete_after` are treated as gone even before the cleanup job has deleted them
 * (FR-RCPT-008): every read filters on it.
 */

export interface StoredImage {
  jpeg: Buffer;
  width: number;
  height: number;
  sha256: string;
}

export interface ReceiptRow {
  id: string;
  status: ReceiptStatus;
  failureCode: ReceiptFailure | null;
  purchaseId: string | null;
  createdAt: Date;
  deleteAfter: Date;
  extraction: {
    rawText: string;
    parsed: unknown;
    meanConfidence: number;
  } | null;
}

export interface NewExtraction {
  engine: string;
  rawText: string;
  parsed: Prisma.InputJsonValue;
  meanConfidence: number;
  durationMs: number;
}

export interface ReceiptRepo {
  /** Queued or being read, on the whole server. */
  countWaiting(): Promise<number>;
  /** An open receipt in the household with the same stored image. */
  findOpenBySha(householdId: string, sha256: string, now: Date): Promise<string | null>;
  create(
    householdId: string,
    uploadedById: string,
    image: StoredImage,
    deleteAfter: Date,
  ): Promise<{ id: string; createdAt: Date }>;
  list(householdId: string, now: Date): Promise<ReceiptRow[]>;
  get(householdId: string, receiptId: string, now: Date): Promise<ReceiptRow | null>;
  image(householdId: string, receiptId: string, now: Date): Promise<Buffer | null>;
  /** Deletes an unconfirmed receipt with its image and extraction. False if there is none. */
  remove(householdId: string, receiptId: string): Promise<boolean>;
  /** failed → queued. False if the receipt is not failed (or not there). */
  requeue(householdId: string, receiptId: string, now: Date): Promise<boolean>;
  /** A purchase on the same date with the same total (FR-RCPT-007, the weak check). */
  findSameDateAndTotal(
    householdId: string,
    purchasedOn: string,
    totalOre: number,
  ): Promise<string | null>;

  // ----- worker -----
  /** queued → processing, and the image to read. Null if the receipt is gone or not queued. */
  claim(receiptId: string): Promise<{ householdId: string; jpeg: Buffer } | null>;
  /** processing → review, with the extraction. */
  saveExtraction(receiptId: string, extraction: NewExtraction): Promise<void>;
  /** processing → failed. */
  fail(receiptId: string, failure: ReceiptFailure): Promise<void>;
  /** FR-RCPT-008: unconfirmed receipts past their deadline, with image and extraction (cascade). */
  deleteExpired(now: Date): Promise<number>;
  /** A worker that died mid-job leaves "processing" behind: after `olderThan` it counts as a timeout. */
  failStuck(olderThan: Date): Promise<number>;
}

const OPEN: ReceiptStatus[] = ['queued', 'processing', 'review', 'failed'];

const rowSelect = {
  id: true,
  status: true,
  failureCode: true,
  purchaseId: true,
  createdAt: true,
  deleteAfter: true,
  extraction: { select: { rawText: true, parsed: true, meanConfidence: true } },
} satisfies Prisma.ReceiptSelect;

type Row = Prisma.ReceiptGetPayload<{ select: typeof rowSelect }>;

const toRow = (row: Row): ReceiptRow => ({
  ...row,
  failureCode: row.failureCode as ReceiptFailure | null,
});

/** Confirmed receipts never expire (they have no image left); the others only until their deadline. */
const notExpired = (now: Date): Prisma.ReceiptWhereInput => ({
  OR: [{ status: 'confirmed' }, { deleteAfter: { gt: now } }],
});

export function createReceiptRepo(db: Db): ReceiptRepo {
  return {
    countWaiting() {
      return db.receipt.count({ where: { status: { in: ['queued', 'processing'] } } });
    },

    async findOpenBySha(householdId, sha256, now) {
      const row = await db.receipt.findFirst({
        where: { householdId, imageSha256: sha256, status: { in: OPEN }, deleteAfter: { gt: now } },
        select: { id: true },
      });
      return row?.id ?? null;
    },

    create(householdId, uploadedById, image, deleteAfter) {
      return db.$transaction(async (tx) => {
        const receipt = await tx.receipt.create({
          data: { householdId, uploadedById, imageSha256: image.sha256, deleteAfter },
          select: { id: true, createdAt: true },
        });
        await tx.receiptImage.create({
          data: {
            receiptId: receipt.id,
            householdId,
            bytes: new Uint8Array(image.jpeg),
            width: image.width,
            height: image.height,
          },
        });
        return receipt;
      });
    },

    async list(householdId, now) {
      const rows = await db.receipt.findMany({
        where: { householdId, status: { in: OPEN }, deleteAfter: { gt: now } },
        orderBy: { createdAt: 'desc' },
        select: rowSelect,
      });
      return rows.map(toRow);
    },

    async get(householdId, receiptId, now) {
      const row = await db.receipt.findFirst({
        where: { id: receiptId, householdId, ...notExpired(now) },
        select: rowSelect,
      });
      return row ? toRow(row) : null;
    },

    async image(householdId, receiptId, now) {
      const row = await db.receiptImage.findFirst({
        where: { receiptId, householdId, receipt: { deleteAfter: { gt: now } } },
        select: { bytes: true },
      });
      return row ? Buffer.from(row.bytes) : null;
    },

    async remove(householdId, receiptId) {
      // The image and the extraction go with it (ON DELETE CASCADE).
      const { count } = await db.receipt.deleteMany({
        where: { id: receiptId, householdId, status: { not: 'confirmed' } },
      });
      return count > 0;
    },

    async requeue(householdId, receiptId, now) {
      const { count } = await db.receipt.updateMany({
        where: { id: receiptId, householdId, status: 'failed', deleteAfter: { gt: now } },
        data: { status: 'queued', failureCode: null },
      });
      return count > 0;
    },

    async findSameDateAndTotal(householdId, purchasedOn, totalOre) {
      const row = await db.purchase.findFirst({
        where: { householdId, purchasedOn: toDbDate(purchasedOn), totalOre },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return row?.id ?? null;
    },

    async claim(receiptId) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.receipt.updateMany({
          where: { id: receiptId, status: 'queued' },
          data: { status: 'processing' },
        });
        if (count === 0) return null;
        const image = await tx.receiptImage.findUnique({
          where: { receiptId },
          select: { householdId: true, bytes: true },
        });
        if (!image) {
          // An open receipt always has its image; if not, there is nothing to read.
          await tx.receipt.updateMany({
            where: { id: receiptId },
            data: { status: 'failed', failureCode: 'noText' },
          });
          return null;
        }
        return { householdId: image.householdId, jpeg: Buffer.from(image.bytes) };
      });
    },

    async saveExtraction(receiptId, extraction) {
      await db.$transaction(async (tx) => {
        const receipt = await tx.receipt.findFirst({
          where: { id: receiptId, status: 'processing' },
          select: { householdId: true },
        });
        // Deleted by the user while it was being read: drop the result.
        if (!receipt) return;
        await tx.receiptExtraction.upsert({
          where: { receiptId },
          create: { receiptId, householdId: receipt.householdId, ...extraction },
          update: extraction,
        });
        await tx.receipt.updateMany({
          where: { id: receiptId, status: 'processing' },
          data: { status: 'review' },
        });
      });
    },

    async fail(receiptId, failure) {
      await db.receipt.updateMany({
        where: { id: receiptId, status: 'processing' },
        data: { status: 'failed', failureCode: failure },
      });
    },

    async deleteExpired(now) {
      const { count } = await db.receipt.deleteMany({
        where: { status: { not: 'confirmed' }, deleteAfter: { lte: now } },
      });
      return count;
    },

    async failStuck(olderThan) {
      const { count } = await db.receipt.updateMany({
        where: { status: 'processing', updatedAt: { lt: olderThan } },
        data: { status: 'failed', failureCode: 'timeout' },
      });
      return count;
    },
  };
}
