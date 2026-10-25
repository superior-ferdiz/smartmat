import { Writable } from 'node:stream';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeEach } from 'vitest';
import { CSRF_HEADER, type SessionResponse } from '@smartmat/shared';
import { API_PREFIX, buildApp, type AppDeps } from '../src/app';
import type { AppConfig } from '../src/config';
import { createDb, type Db } from '../src/db';
import { SESSION_COOKIE } from '../src/plugins/auth';
import { testDatabaseUrl } from './testDatabase';

export const ORIGIN = 'http://127.0.0.1:5173';
export const PASSWORD = 'riktig hest batteri';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    databaseUrl: testDatabaseUrl(),
    host: '127.0.0.1',
    port: 0,
    allowedOrigins: [ORIGIN],
    cookieSecure: true,
    cookieHostPrefix: false,
    trustProxy: false,
    registrationOpen: true,
    webDistDir: null,
    logLevel: 'silent',
    rateLimits: {
      login: { max: 1000, windowMs: 60_000 },
      register: { max: 1000, windowMs: 60_000 },
      sensitive: { max: 1000, windowMs: 60_000 },
      invitation: { max: 1000, windowMs: 60_000 },
    },
    invitationAttemptsPerUser: 1000,
    // No User-Agent: Open Food Facts is never called from tests. Tests pass a fake provider instead.
    barcode: {
      offBaseUrl: 'https://world.openfoodfacts.net',
      offUserAgent: null,
      offTimeoutMs: 3000,
      offMaxPerMinute: 10,
      lookupsPerUserPerMinute: 1000,
    },
    // OCR "on" so uploads are accepted; the tests pass a fake queue and run the worker's job with a fake OCR.
    receipts: {
      ocrProvider: 'tesseract',
      tesseractCommand: ['tesseract'],
      ocrTimeoutMs: 60_000,
      lineSuggestions: false,
      uploadsPerUserPerHour: 1000,
      maxQueued: 1000,
    },
    recipes: { includeUnreviewed: true },
    ...overrides,
  };
}

/** One database connection per test file, emptied before every test. */
export function useTestDatabase(): Db {
  const db = createDb(testDatabaseUrl());
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE sessions, household_invitations, household_members, households, users RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  return db;
}

export async function createTestApp(
  db: Db,
  options: Omit<AppDeps, 'config' | 'db'> & { config?: Partial<AppConfig> } = {},
): Promise<FastifyInstance> {
  const { config, ...rest } = options;
  const app = await buildApp({ ...rest, db, config: testConfig(config) });
  await app.ready();
  return app;
}

/** Collects everything the API logs, to check that no personal data ends up there. */
export function captureLog() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { stream, text: () => lines.join('') };
}

export interface Client {
  cookie: string;
  csrfToken: string;
  user: SessionResponse['user'];
}

export function sessionCookie(response: LightMyRequestResponse): string | undefined {
  return response.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
}

/** A request as the web app sends it: same origin, session cookie and CSRF token when logged in. */
export function call(
  app: FastifyInstance,
  method: InjectOptions['method'],
  path: string,
  options: {
    client?: Client;
    body?: unknown;
    headers?: Record<string, string>;
    remoteAddress?: string;
  } = {},
) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (options.client) {
    headers.cookie = `${SESSION_COOKIE}=${options.client.cookie}`;
    headers[CSRF_HEADER] = options.client.csrfToken;
  }
  return app.inject({
    method,
    url: `${API_PREFIX}${path}`,
    headers: { ...headers, ...options.headers },
    ...(options.body === undefined ? {} : { payload: options.body as object }),
    ...(options.remoteAddress ? { remoteAddress: options.remoteAddress } : {}),
  });
}

export function toClient(response: LightMyRequestResponse): Client {
  const body = response.json<SessionResponse>();
  const cookie = sessionCookie(response);
  if (!cookie)
    throw new Error(`No session cookie (status ${response.statusCode}): ${response.body}`);
  return { cookie, csrfToken: body.csrfToken, user: body.user };
}

let counter = 0;
export async function registerUser(
  app: FastifyInstance,
  overrides: { email?: string; displayName?: string; password?: string } = {},
): Promise<Client> {
  counter++;
  const response = await call(app, 'POST', '/auth/register', {
    body: {
      displayName: overrides.displayName ?? `Bruker ${counter}`,
      email: overrides.email ?? `bruker${counter}@example.test`,
      password: overrides.password ?? PASSWORD,
    },
  });
  if (response.statusCode !== 201)
    throw new Error(`register failed: ${response.statusCode} ${response.body}`);
  return toClient(response);
}

export async function login(app: FastifyInstance, email: string, password = PASSWORD) {
  return call(app, 'POST', '/auth/login', { body: { email, password } });
}
