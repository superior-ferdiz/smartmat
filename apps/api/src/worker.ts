import pino from 'pino';
import type { AppConfig } from './config';
import { loadConfig, loadRootEnvFile } from './config';
import { createDb } from './db';
import { RECEIPT_CLEANUP_QUEUE, RECEIPT_OCR_QUEUE, startJobs } from './lib/receiptQueue';
import { ReceiptProcessor } from './modules/receipts/processor';
import { createPriceRepo } from './modules/prices/repo';
import { PRICE_KEEP_MS } from './modules/prices/service';
import { createReceiptRepo } from './modules/receipts/repo';
import { TesseractOcr } from './providers/ocr/tesseract';
import { disabledOcrProvider, type OcrProvider } from './providers/ocr/types';

/*
 * The background worker (spec 08 FR-RCPT-003/008): reads queued receipts one at a time, and every 15 minutes
 * deletes unconfirmed receipts past their deadline and (spec 12) external prices not fetched for 30 days. It is a
 * second entry point of the API package because it uses the same database code and providers:
 *   npm run worker -w @smartmat/api
 * The log gets ids, outcomes and times only (NFR-SEC-004).
 */

/** ADR-0017: variant "clean" (turned, cropped, normalised) and psm 4 gave the best result in the pilot. */
export function ocrProviderFor(config: AppConfig['receipts']): OcrProvider {
  if (config.ocrProvider === 'off') return disabledOcrProvider;
  return new TesseractOcr({
    command: config.tesseractCommand,
    language: 'nor',
    psm: 4,
    variant: 'clean',
    timeoutMs: config.ocrTimeoutMs,
  });
}

loadRootEnvFile();
const config = loadConfig();
const log = pino({ level: config.logLevel });
const db = createDb(config.databaseUrl);
const repo = createReceiptRepo(db);
const priceRepo = createPriceRepo(db);
const processor = new ReceiptProcessor({ repo, ocr: ocrProviderFor(config.receipts), log });
const STUCK_MS = 10 * 60 * 1000;

const boss = await startJobs(config.databaseUrl, 'worker');
// pg-boss reports connection problems here; the message is not logged, as it can contain the database address.
boss.on('error', (error: Error) => log.error({ errorName: error.name }, 'job queue error'));

await boss.work<{ receiptId: string }>(
  RECEIPT_OCR_QUEUE,
  { batchSize: 1, pollingIntervalSeconds: 1 },
  async ([job]) => {
    if (job) await processor.process(job.data.receiptId);
  },
);
await boss.schedule(RECEIPT_CLEANUP_QUEUE, '*/15 * * * *');
await boss.work(RECEIPT_CLEANUP_QUEUE, async () => {
  const now = new Date();
  const deleted = await repo.deleteExpired(now);
  const stuck = await repo.failStuck(new Date(now.getTime() - STUCK_MS));
  log.info({ deleted, stuck }, 'receipt cleanup');
  const prices = await priceRepo.deleteFetchedBefore(new Date(now.getTime() - PRICE_KEEP_MS));
  log.info(prices, 'price cleanup');
});
log.info({ ocr: config.receipts.ocrProvider }, 'worker started');

async function shutdown() {
  await boss.stop({ graceful: true, timeout: 30_000 });
  await db.$disconnect();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
