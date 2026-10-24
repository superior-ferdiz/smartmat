import { afterAll, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { pgBossReceiptQueue, RECEIPT_OCR_QUEUE, startJobs } from '../src/lib/receiptQueue';
import { testDatabaseUrl } from './testDatabase';

/*
 * Spec 08 FR-RCPT-003: the real job queue (pg-boss) in the test database. The API sends the receipt id; the
 * worker fetches it. A job carries nothing else – the image stays in receipt_images.
 */

const started: PgBoss[] = [];
afterAll(async () => {
  for (const boss of started) await boss.stop({ graceful: false });
});

describe('FR-RCPT-003 job queue', () => {
  it('starts twice on the same database (queues already there) and passes only the receipt id', async () => {
    const api = await startJobs(testDatabaseUrl(), 'api');
    started.push(api);
    const worker = await startJobs(testDatabaseUrl(), 'worker');
    started.push(worker);
    await worker.deleteAllJobs(RECEIPT_OCR_QUEUE);

    const receiptId = '0199f0a0-0000-7000-8000-00000000abcd';
    await pgBossReceiptQueue(api).enqueue(receiptId);

    const jobs = await worker.fetch<{ receiptId: string }>(RECEIPT_OCR_QUEUE, { batchSize: 5 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.data).toEqual({ receiptId });
  });
});
