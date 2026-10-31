import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { COOP_RECEIPT } from '@smartmat/shared/test-fixtures/receipts';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db';
import {
  MAIL_QUEUE,
  pgBossMailQueue,
  pgBossReceiptQueue,
  RECEIPT_OCR_QUEUE,
  startJobs,
} from '../src/lib/receiptQueue';
import type { MailJob } from '../src/modules/passwordReset/jobs';
import { MailProcessor } from '../src/modules/passwordReset/processor';
import { createPasswordResetRepo } from '../src/modules/passwordReset/repo';
import type { MailSender } from '../src/providers/mail/types';
import { ReceiptProcessor } from '../src/modules/receipts/processor';
import { createReceiptRepo } from '../src/modules/receipts/repo';
import type { OcrProvider } from '../src/providers/ocr/types';
import { fakeKassalappFetch, testPriceProvider } from '../test/fakeKassalapp';
import { fakeOffFetch, testBarcodeProvider } from '../test/fakeOff';
import { fakePwnedCheck } from '../test/fakePwned';
import { applySeed, readSeedDirectory } from '../src/modules/recipes/seed';
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
  RATE_LIMIT_INVITATION_MAX: '10000',
  INVITATION_ATTEMPTS_PER_USER: '10000',
  // Spec 08: receipts are accepted; the "OCR" below is a fake that never reads the image's text.
  OCR_PROVIDER: 'tesseract',
  RECEIPT_UPLOADS_PER_HOUR: '1000',
  RATE_LIMIT_EXPORT_MAX: '10000',
  PWNED_PASSWORDS: 'on',
  // Spec 13: a made-up key for the e2e database only, so two-factor can be set up in the tests.
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  // Spec 17: made-up settings so "Glemt passord" is on. Nothing connects to them: the sender below writes files.
  SMTP_HOST: 'smtp.example.test',
  SMTP_USER: 'smartmat@example.test',
  SMTP_PASSWORD: 'not-a-real-password',
  MAIL_FROM: 'smartmat@example.test',
  RATE_LIMIT_PASSWORD_RESET_MAX: '10000',
});
const db = createDb(databaseUrl);
await db.$executeRawUnsafe(
  'TRUNCATE TABLE sessions, household_invitations, household_members, households, users RESTART IDENTITY CASCADE',
);
await db.$executeRawUnsafe(
  'TRUNCATE TABLE products, product_lookup_misses, price_observations, price_lookups',
);
// Spec 05: the fictional test recipes, never the team's (the e2e tests must not depend on real content).
// Spec 09: only the screenshot run (E2E_RECIPE_SEED=repo) uses the recipes in prisma/seed/, so the report can
// show a translated Wikibooks recipe with its source and licence. The next normal run seeds the fixtures again.
if (process.env.E2E_RECIPE_SEED === 'repo') {
  await applySeed(
    db,
    readSeedDirectory(fileURLToPath(new URL('../../../prisma/seed', import.meta.url))),
  );
} else {
  await seedFixtureRecipes(db);
}
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

// Spec 17: never a real SMTP server. Each e-mail is written to e2e/.mail/<address>.txt (the latest one wins), where
// the Playwright test reads the link. Only made-up addresses from the tests ever end up there.
const mailDir = fileURLToPath(new URL('../../../e2e/.mail', import.meta.url));
rmSync(mailDir, { recursive: true, force: true });
mkdirSync(mailDir, { recursive: true });
const fileSender: MailSender = {
  async send(message) {
    const file = `${mailDir}/${message.to.replace(/[^a-z0-9@._-]/gi, '_')}.txt`;
    writeFileSync(`${file}.tmp`, `Subject: ${message.subject}\n\n${message.text}`);
    renameSync(`${file}.tmp`, file);
  },
};
const mailer = new MailProcessor({
  repo: createPasswordResetRepo(db),
  sender: fileSender,
  now: () => new Date(),
  linkOrigin: 'http://127.0.0.1:4173',
  perHour: 3,
});
await jobs.work<MailJob>(
  MAIL_QUEUE,
  { batchSize: 1, pollingIntervalSeconds: 0.5 },
  async ([job]) => {
    if (job) await mailer.process(job.data);
  },
);

const app = await buildApp({
  config,
  db,
  barcodeProvider: testBarcodeProvider(fakeOffFetch().fetchFn as typeof fetch),
  // Spec 12: never the real Kassalapp. The fake one has made-up prices for the codes in test/fakeKassalapp.ts.
  priceProvider: testPriceProvider(fakeKassalappFetch().fetchFn as typeof fetch),
  receiptQueue: pgBossReceiptQueue(jobs),
  mailQueue: pgBossMailQueue(jobs),
  // Spec 13: never the real Have I Been Pwned. The fake one lists only the made-up passwords in test/fakePwned.ts.
  pwnedPasswords: fakePwnedCheck(),
});
await app.listen({ host: config.host, port: config.port });
