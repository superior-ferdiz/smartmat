import { buildApp } from './app';
import { loadConfig, loadRootEnvFile } from './config';
import { createDb } from './db';
import { pgBossReceiptQueue, startJobs } from './lib/receiptQueue';

loadRootEnvFile();
const config = loadConfig();
const db = createDb(config.databaseUrl);
// Spec 08: only with OCR set up are receipts accepted and sent to the worker (src/worker.ts).
const jobs =
  config.receipts.ocrProvider === 'off' ? null : await startJobs(config.databaseUrl, 'api');
const app = await buildApp({
  config,
  db,
  ...(jobs ? { receiptQueue: pgBossReceiptQueue(jobs) } : {}),
});

async function shutdown() {
  await app.close();
  await jobs?.stop({ graceful: true, timeout: 5000 });
  await db.$disconnect();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

// 127.0.0.1 only: this machine also runs production sites, and the API must not be reachable from outside.
await app.listen({ host: config.host, port: config.port });
