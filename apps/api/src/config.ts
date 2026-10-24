import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The repo root's .env (local secrets, ignored by Git). Variables already set in the environment win. */
export function loadRootEnvFile() {
  const path = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

export interface RateLimitRule {
  /** Requests allowed per IP address within the window. */
  max: number;
  windowMs: number;
}

export interface AppConfig {
  databaseUrl: string;
  host: string;
  port: number;
  /** Origins allowed to send POST/PATCH/DELETE (NFR-SEC-005). */
  allowedOrigins: string[];
  cookieSecure: boolean;
  /** ADR-0015: cookie name with the __Host- prefix (no Domain; another subdomain cannot set it). */
  cookieHostPrefix: boolean;
  /**
   * ADR-0015: the reverse proxy whose X-Forwarded-For is believed (IP addresses or CIDR ranges), or false.
   * False locally: any client can set the header, and trusting it would give a fresh rate limit per request.
   */
  trustProxy: string[] | false;
  /** ADR-0015: false in the closed test environment (accounts are made with the create-user script). */
  registrationOpen: boolean;
  /** ADR-0015: the built web app to serve from the API (same origin), or null when Vite serves it. */
  webDistDir: string | null;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  rateLimits: {
    login: RateLimitRule;
    register: RateLimitRule;
    /** Password change and account deletion: both check a password. */
    sensitive: RateLimitRule;
  };
  /** Barcode lookups (spec 07). Without a User-Agent, Open Food Facts is not asked at all. */
  barcode: {
    offBaseUrl: string;
    offUserAgent: string | null;
    offTimeoutMs: number;
    /** Our calls to OFF per minute, for the whole server (OFF allows 15 per IP address). */
    offMaxPerMinute: number;
    lookupsPerUserPerMinute: number;
  };
  /** Receipt OCR (spec 08, ADR-0017). The API only queues jobs; the worker (src/worker.ts) runs Tesseract. */
  receipts: {
    /** "off": no OCR on this server – the upload page offers the manual form (NFR-REL-002). */
    ocrProvider: 'off' | 'tesseract';
    /** What starts Tesseract, split on spaces and run without a shell (providers/ocr/tesseract.ts). */
    tesseractCommand: string[];
    ocrTimeoutMs: number;
    /** ADR-0017: off until a new measurement shows the amounts per line can be trusted. */
    lineSuggestions: boolean;
    uploadsPerUserPerHour: number;
    /** Receipts waiting or being read on the whole server; more gives 503. */
    maxQueued: number;
  };
  /** ADR-0016 (spec 09): false hides external recipes nobody in the team has checked yet. */
  recipes: { includeUnreviewed: boolean };
}

const MINUTE = 60_000;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  APP_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  COOKIE_HOST_PREFIX: z.enum(['true', 'false']).default('false'),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .refine((entries) => entries.every(isAddressOrRange), {
      message: 'not an IP address or CIDR range',
    }),
  REGISTRATION_OPEN: z.enum(['true', 'false']).default('true'),
  WEB_DIST_DIR: z.string().trim().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Playwright registers many users from the same address, so it raises these.
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().positive().default(10),
  // Spec 07. OFF asks developers to use its staging server; the test environment sets world.openfoodfacts.org.
  OFF_BASE_URL: z.url({ protocol: /^https$/ }).default('https://world.openfoodfacts.net'),
  OFF_USER_AGENT: z.string().trim().min(1).optional(),
  OFF_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
  OFF_MAX_PER_MINUTE: z.coerce.number().int().positive().max(15).default(10),
  SCAN_LOOKUPS_PER_MINUTE: z.coerce.number().int().positive().default(30),
  // Spec 08. Locally Tesseract runs in Docker: OCR_TESSERACT_COMMAND="docker run --rm -i --network none
  // smartmat-ocr timeout 55 tesseract". In the test environment's worker image it is "timeout 55 tesseract".
  OCR_PROVIDER: z.enum(['off', 'tesseract']).default('off'),
  OCR_TESSERACT_COMMAND: z.string().trim().min(1).default('timeout 55 tesseract'),
  OCR_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(60_000),
  RECEIPT_LINE_SUGGESTIONS: z.enum(['true', 'false']).default('false'),
  RECEIPT_UPLOADS_PER_HOUR: z.coerce.number().int().positive().default(10),
  RECEIPT_MAX_QUEUED: z.coerce.number().int().positive().default(20),
  RECIPES_INCLUDE_UNREVIEWED: z.enum(['true', 'false']).default('true'),
});

/** "172.26.0.0/16" or "127.0.0.1". */
function isAddressOrRange(entry: string): boolean {
  const [address = '', bits, ...rest] = entry.split('/');
  const version = isIP(address);
  if (version === 0 || rest.length > 0) return false;
  if (bits === undefined) return true;
  const n = Number(bits);
  return /^\d+$/.test(bits) && n >= 0 && n <= (version === 4 ? 32 : 128);
}

/** Reads and checks the environment. Fails at start-up with the names (not values) of bad variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid or missing environment variables: ${names} (see .env.example)`);
  }
  const e = parsed.data;
  // Browsers only accept a __Host- cookie with Secure; better to stop at start-up than to have no sessions.
  if (e.COOKIE_HOST_PREFIX === 'true' && e.COOKIE_SECURE !== 'true') {
    throw new Error(
      'Invalid or missing environment variables: COOKIE_HOST_PREFIX needs COOKIE_SECURE=true',
    );
  }
  return {
    databaseUrl: e.DATABASE_URL,
    host: e.API_HOST,
    port: e.API_PORT,
    allowedOrigins: e.APP_ORIGINS,
    cookieSecure: e.COOKIE_SECURE === 'true',
    cookieHostPrefix: e.COOKIE_HOST_PREFIX === 'true',
    trustProxy: e.TRUST_PROXY.length > 0 ? e.TRUST_PROXY : false,
    registrationOpen: e.REGISTRATION_OPEN === 'true',
    webDistDir: e.WEB_DIST_DIR ?? null,
    logLevel: e.LOG_LEVEL,
    rateLimits: {
      login: { max: e.RATE_LIMIT_LOGIN_MAX, windowMs: 15 * MINUTE },
      register: { max: e.RATE_LIMIT_REGISTER_MAX, windowMs: 60 * MINUTE },
      sensitive: { max: e.RATE_LIMIT_SENSITIVE_MAX, windowMs: 15 * MINUTE },
    },
    barcode: {
      offBaseUrl: e.OFF_BASE_URL,
      offUserAgent: e.OFF_USER_AGENT ?? null,
      offTimeoutMs: e.OFF_TIMEOUT_MS,
      offMaxPerMinute: e.OFF_MAX_PER_MINUTE,
      lookupsPerUserPerMinute: e.SCAN_LOOKUPS_PER_MINUTE,
    },
    receipts: {
      ocrProvider: e.OCR_PROVIDER,
      tesseractCommand: e.OCR_TESSERACT_COMMAND.split(/\s+/),
      ocrTimeoutMs: e.OCR_TIMEOUT_MS,
      lineSuggestions: e.RECEIPT_LINE_SUGGESTIONS === 'true',
      uploadsPerUserPerHour: e.RECEIPT_UPLOADS_PER_HOUR,
      maxQueued: e.RECEIPT_MAX_QUEUED,
    },
    recipes: { includeUnreviewed: e.RECIPES_INCLUDE_UNREVIEWED === 'true' },
  };
}
