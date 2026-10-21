import { buildApp } from './app';
import { loadConfig, loadRootEnvFile } from './config';
import { createDb } from './db';

loadRootEnvFile();
const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = await buildApp({ config, db });

async function shutdown() {
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

// 127.0.0.1 only: this machine also runs production sites, and the API must not be reachable from outside.
await app.listen({ host: config.host, port: config.port });
