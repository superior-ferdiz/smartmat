import { PgBoss } from 'pg-boss';
import type { ReceiptQueue } from '../modules/receipts/service';

/*
 * Background jobs with pg-boss (CLAUDE.md: no Redis until justified). The jobs live in their own schema
 * "pgboss" in the same database. A job carries only the receipt id; the image stays in receipt_images.
 */

export const RECEIPT_OCR_QUEUE = 'receipt-ocr';
export const RECEIPT_CLEANUP_QUEUE = 'receipt-cleanup';
/** Spec 13 (FR-PRIV-002): expired sessions, every night. */
export const SESSION_CLEANUP_QUEUE = 'session-cleanup';
const SCHEMA = 'pgboss';

/**
 * The API only sends jobs: no maintenance or schedules there (the worker does those).
 * One retry if a worker dies mid-job; a job not finished in 3 minutes counts as failed.
 */
export async function startJobs(databaseUrl: string, role: 'api' | 'worker') {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: SCHEMA,
    max: 3,
    supervise: role === 'worker',
    schedule: role === 'worker',
  });
  // Errors are logged by the caller without details: a connection string can be in the message.
  await boss.start();
  await boss.createQueue(RECEIPT_OCR_QUEUE, {
    retryLimit: 1,
    expireInSeconds: 180,
    retentionSeconds: 24 * 60 * 60,
    deleteAfterSeconds: 60 * 60,
  });
  await boss.createQueue(RECEIPT_CLEANUP_QUEUE, { retryLimit: 0, expireInSeconds: 300 });
  await boss.createQueue(SESSION_CLEANUP_QUEUE, { retryLimit: 0, expireInSeconds: 300 });
  return boss;
}

export function pgBossReceiptQueue(boss: PgBoss): ReceiptQueue {
  return {
    async enqueue(receiptId) {
      // A second job for the same receipt (a retry) is harmless: the worker claims a receipt only while it is
      // queued, so a job that finds it already read is skipped (processor.ts).
      await boss.send(RECEIPT_OCR_QUEUE, { receiptId });
    },
  };
}
