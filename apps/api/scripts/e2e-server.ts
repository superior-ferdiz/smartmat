import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { COOP_RECEIPT } from '@smartmat/shared/test-fixtures/receipts';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db';
import { pgBossReceiptQueue, RECEIPT_OCR_QUEUE, startJobs } from '../src/lib/receiptQueue';
import { ReceiptProcessor } from '../src/modules/receipts/processor';
import { createReceiptRepo } from '../src/modules/receipts/repo';
import type { OcrProvider } from '../src/providers/ocr/types';
import { fakeOffFetch, testBarcodeProvider } from '../test/fakeOff';
import { seedFixtureRecipes } from '../test/fixtureSeed';
import { testDatabaseUrl } from '../test/testDatabase';

/*
 * The API instance Playwright starts (playwright.config.ts): its own database (smartmat_e2e), emptied
 * at start and given the fictional test recipes, on port 3101, with the receipt worker and a fake OCR (spec 08), accepting requests from the preview server on 4173. Rate limits are raised
 * because every test registers users from the same address; the limits themselves are tested in
 * apps/api/test/security.api.test.ts.
 */
const databaseUrl = testDatabaseUrl('E2E_DATABASE_URL');
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: fileURLToPath(new URL('../../..', import.meta.url)),
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
});

const config = loadConfig({
  ...process.env,
  DATABASE_URL: databaseUrl,
  API_PORT: '3101',
  APP_ORIGINS: 'http://127.0.0.1:4173',
  LOG_LEVEL: 'warn',
  RATE_LIMIT_LOGIN_MAX: '10000',
  RATE_LIMIT_REGISTER_MAX: '10000',
  RATE_LIMIT_SENSITIVE_MAX: '10000',
  // Spec 08: receipts are accepted; the "OCR" below is a fake that never reads the image's text.
  OCR_PROVIDER: 'tesseract',
  RECEIPT_UPLOADS_PER_HOUR: '1000',
});
const db = createDb(databaseUrl);
await db.$executeRawUnsafe(
  'TRUNCATE TABLE sessions, household_members, households, users RESTART IDENTITY CASCADE',
);
await db.$executeRawUnsafe('TRUNCATE TABLE products, product_lookup_misses');
// Spec 05: the fictional test recipes, never the team's (the e2e tests must not depend on real content).
await seedFixtureRecipes(db);
// Spec 07: never the real Open Food Facts. The fake one answers for the made-up codes in test/fakeOff.ts.
// Spec 08: never a real OCR engine and never real receipts. Every image "reads" as the made-up Coop receipt in
// packages/shared/src/receipts/fixtures.ts, after a short pause so the "reading" state can be seen; an image
// narrower than 200 px reads as no text, for the failure state.
const fakeOcr: OcrProvider = {
  async recognize(image) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const { width = 0 } = await sharp(image).metadata();
    if (width < 200) return { ok: false, failure: 'noText' };
    return {
      ok: true,
      text: { lines: [...COOP_RECEIPT], meanConfidence: 91, engine: 'fake', rotation: 0 },
    };
  },
};
// The real job queue (pg-boss) on the e2e database, with the worker in this same process.
const jobs = await startJobs(databaseUrl, 'worker');
await jobs.deleteAllJobs();
const processor = new ReceiptProcessor({
  repo: createReceiptRepo(db),
  ocr: fakeOcr,
  log: { info: () => undefined, warn: () => undefined },
});
await jobs.work<{ receiptId: string }>(
  RECEIPT_OCR_QUEUE,
  { batchSize: 1, pollingIntervalSeconds: 0.5 },
  async ([job]) => {
    if (job) await processor.process(job.data.receiptId);
  },
);

const app = await buildApp({
  config,
  db,
  barcodeProvider: testBarcodeProvider(fakeOffFetch().fetchFn as typeof fetch),
  receiptQueue: pgBossReceiptQueue(jobs),
});
await app.listen({ host: config.host, port: config.port });
