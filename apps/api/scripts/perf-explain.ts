import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CSRF_HEADER, type SessionResponse } from '@smartmat/shared';
import { API_PREFIX, buildApp } from '../src/app';
import { loadConfig, loadRootEnvFile } from '../src/config';
import { createDb } from '../src/db';
import { applySeed, readSeedDirectory } from '../src/modules/recipes/seed';
import { SESSION_COOKIE } from '../src/plugins/auth';
import { fakeKassalappFetch, testPriceProvider } from '../test/fakeKassalapp';

/*
 * Spec 13 (NFR-PERF-001): how the four heaviest reads behave with a realistic amount of data.
 *
 *   npm run perf:explain -w @smartmat/api
 *
 * 1. Empties and migrates its own database, smartmat_perf (refuses any other name), adds the real ingredient list and
 *    recipes, registers one made-up user and fills that household and 500 others with generated data
 *    (scripts/perf/generate.sql).
 * 2. Asks each endpoint 30 times through the real app and prints median and 95th percentile.
 * 3. auto_explain (switched on for smartmat_perf only) writes EXPLAIN ANALYZE of every query the endpoint ran to
 *    the Postgres log; the plans for one request per endpoint are printed after the timings.
 * Prices come from the fake Kassalapp (no network). Nothing here contains personal data.
 */

const ROUNDS = 30;
const CONTAINER = process.env.PERF_DB_CONTAINER ?? 'smartmat-postgres';

loadRootEnvFile();
const base = new URL(process.env.DATABASE_URL ?? '');
base.pathname = '/smartmat_perf';
const databaseUrl = base.toString();
if (!databaseUrl.endsWith('/smartmat_perf')) throw new Error('refusing: not smartmat_perf');
const user = decodeURIComponent(base.username);
const root = fileURLToPath(new URL('../../..', import.meta.url));

function psql(sql: string, database = 'postgres') {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER,
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      user,
      '-d',
      database,
    ],
    { input: sql, encoding: 'utf8' },
  );
}

console.log('# smartmat_perf: create, migrate, seed');
psql(`DROP DATABASE IF EXISTS smartmat_perf WITH (FORCE); CREATE DATABASE smartmat_perf;`);
psql(
  `ALTER DATABASE smartmat_perf SET session_preload_libraries = 'auto_explain';
   ALTER DATABASE smartmat_perf SET auto_explain.log_min_duration = 0;
   ALTER DATABASE smartmat_perf SET auto_explain.log_analyze = on;
   ALTER DATABASE smartmat_perf SET auto_explain.log_buffers = on;
   ALTER DATABASE smartmat_perf SET auto_explain.log_timing = on;`,
);
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'pipe',
});

const db = createDb(databaseUrl);
await applySeed(db, readSeedDirectory(`${root}/prisma/seed`));
const config = loadConfig({
  ...process.env,
  DATABASE_URL: databaseUrl,
  APP_ORIGINS: 'http://127.0.0.1:5173',
  LOG_LEVEL: 'silent',
});
const app = await buildApp({
  config,
  db,
  priceProvider: testPriceProvider(fakeKassalappFetch().fetchFn),
});
await app.ready();

const register = await app.inject({
  method: 'POST',
  url: `${API_PREFIX}/auth/register`,
  headers: { origin: 'http://127.0.0.1:5173' },
  payload: { displayName: 'Ytelse', email: 'ytelse@example.test', password: 'riktig hest batteri' },
});
const session = register.json<SessionResponse>();
const cookie = register.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '';
const householdId = session.user.householdId;

execFileSync(
  'docker',
  [
    'exec',
    '-i',
    CONTAINER,
    'psql',
    '-X',
    '-q',
    '-U',
    user,
    '-d',
    'smartmat_perf',
    '-v',
    `hh=${householdId}`,
    '-v',
    `uid=${session.user.id}`,
  ],
  {
    input: readFileSync(new URL('./perf/generate.sql', import.meta.url), 'utf8'),
    stdio: ['pipe', 'pipe', 'inherit'],
  },
);
const counts = await db.$queryRawUnsafe<{ t: string; n: bigint }[]>(
  `SELECT 'inventory_items' t, count(*) n FROM inventory_items UNION ALL
   SELECT 'inventory_batches', count(*) FROM inventory_batches UNION ALL
   SELECT 'inventory_events', count(*) FROM inventory_events UNION ALL
   SELECT 'purchases', count(*) FROM purchases UNION ALL
   SELECT 'purchase_lines', count(*) FROM purchase_lines UNION ALL
   SELECT 'shopping_list_items', count(*) FROM shopping_list_items UNION ALL
   SELECT 'recipes', count(*) FROM recipes UNION ALL
   SELECT 'households', count(*) FROM households`,
);
console.log(counts.map((c) => `${c.t}: ${c.n}`).join(', '));

const month = new Date().toISOString().slice(0, 7);
const endpoints: [string, string][] = [
  ['waste (svinn, månedsoversikt)', `/households/${householdId}/waste-stats?month=${month}`],
  ['notifications (varsler)', `/households/${householdId}/notifications`],
  ['recipes ranking (oppskriftsrangering)', `/households/${householdId}/recipes`],
  [
    'price estimate (prisanslag, handleliste)',
    `/households/${householdId}/shopping-list/price-estimate`,
  ],
];

const call = (url: string) =>
  app.inject({
    method: 'GET',
    url: `${API_PREFIX}${url}`,
    headers: { cookie: `${SESSION_COOKIE}=${cookie}`, [CSRF_HEADER]: session.csrfToken },
  });

console.log(`\n# Response time through the app (${ROUNDS} rounds after 3 warm-up rounds), ms`);
console.log('endpoint | status | median | p95 | max');
for (const [name, url] of endpoints) {
  for (let i = 0; i < 3; i++) await call(url);
  const times: number[] = [];
  let status = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    status = (await call(url)).statusCode;
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const at = (q: number) =>
    times[Math.min(times.length - 1, Math.floor(q * times.length))]!.toFixed(1);
  console.log(`${name} | ${status} | ${at(0.5)} | ${at(0.95)} | ${times.at(-1)!.toFixed(1)}`);
}

console.log('\n# Query plans (auto_explain, one request per endpoint)');
for (const [name, url] of endpoints) {
  // A quiet second before and after, so the log window holds this one request only.
  await new Promise((r) => setTimeout(r, 1500));
  const since = new Date().toISOString();
  await call(url);
  await new Promise((r) => setTimeout(r, 1000));
  const until = new Date().toISOString();
  // Postgres writes its log to stderr; both streams are read.
  const log = execFileSync(
    'sh',
    ['-c', 'docker logs --since "$0" --until "$1" "$2" 2>&1', since, until, CONTAINER],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const plans = log
    .split(/\n(?=\S+ \S+ \S+ \[\d+\] LOG:)/)
    .filter((block) => block.includes('duration:') && block.includes('Query Text'))
    // The session's own bookkeeping (login check) is not what is measured here.
    .filter((block) => !/FROM "public"\."sessions"|UPDATE "public"\."sessions"/.test(block));
  console.log(`\n## ${name}: ${plans.length} queries`);
  for (const plan of plans) {
    const duration = /duration: ([\d.]+) ms/.exec(plan)?.[1];
    const text = /Query Text: ([^\n]*)/.exec(plan)?.[1]?.slice(0, 140);
    const rows = /\(actual time=[\d.]+\.\.[\d.]+ rows=(\d+)/.exec(plan)?.[1];
    const scans = [
      ...plan.matchAll(
        /(Seq Scan on \w+|Index (?:Only )?Scan using \w+ on \w+|Bitmap Index Scan on \w+)/g,
      ),
    ]
      .map((m) => m[1])
      .filter((v, i, all) => all.indexOf(v) === i);
    console.log(
      `- ${duration} ms, ${rows ?? '?'} rows · ${scans.join(', ') || '(no table)'}\n  ${text}`,
    );
    // PERF_FULL_PLANS=1 prints the whole plan of queries slower than 2 ms.
    if (process.env.PERF_FULL_PLANS === '1' && Number(duration) > 2) console.log(plan);
  }
}

await app.close();
await db.$disconnect();
