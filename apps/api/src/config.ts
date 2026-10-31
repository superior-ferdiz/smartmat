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
    /** Spec 10: previewing and accepting invitations, per IP address. */
    invitation: RateLimitRule;
    /** Spec 13 (FR-PRIV-001): data exports, per IP address. */
    export: RateLimitRule;
    /** Spec 17 (FR-AUTH-006a): asking for a reset link and setting the new password, per IP address. */
    passwordReset: RateLimitRule;
  };
  /** Spec 10 (FR-HH-002): invitation previews and accepts per logged-in user, in 15 minutes. */
  invitationAttemptsPerUser: number;
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
  /** Spec 13 (NFR-OPS-003, ADR-0021): the status file the backup check writes, mounted read-only; null locally. */
  backupStatusFile: string | null;
  /**
   * Spec 13 (FR-AUTH-010): 32 bytes for AES-256-GCM that seals the TOTP secrets. Null: two-factor cannot be set up,
   * and an account that has it cannot log in (fails closed). Secret: only in .env, never logged.
   */
  totpEncryptionKey: Buffer | null;
  /** Spec 13 (FR-AUTH-008): Pwned Passwords at registration and password change. Off unless switched on. */
  pwnedPasswords: { enabled: boolean; baseUrl: string; timeoutMs: number };
  /**
   * Spec 17 (ADR-0024): e-mail through SMTP, sent by the mailer (src/mailer.ts). Null unless host, user, password and
   * sender are all set – then "Glemt passord" answers 503 and nothing is sent.
   */
  mail: MailSettings | null;
  /** FR-AUTH-006a: e-mails with a reset link per account per hour. Requests over it get the same answer, no e-mail. */
  passwordResetsPerHour: number;
  /** Prices (spec 12, ADR-0020). Without an API key, Kassalapp is never asked and only own prices are shown. */
  prices: {
    kassalappBaseUrl: string;
    /** Secret: only in .env, never logged. */
    kassalappApiKey: string | null;
    kassalappTimeoutMs: number;
    /** Our calls to Kassalapp per minute, for the whole server (Kassalapp allows 60 per account). */
    kassalappMaxPerMinute: number;
    lookupsPerUserPerMinute: number;
  };
}

export interface MailSettings {
  host: string;
  port: number;
  user: string;
  /** Secret (an app password): only in the env file, never logged or shown. */
  password: string;
  from: { address: string; name: string };
  /** Where the links in e-mails point: the first of APP_ORIGINS. */
  linkOrigin: string;
}

/** Spec 17: all four are needed for e-mail to be on. */
export const MAIL_VARIABLES = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'] as const;

/** The names (never the values) of the mail settings that are missing, for the mailer's start-up log. */
export function missingMailVariables(env: NodeJS.ProcessEnv = process.env): string[] {
  return MAIL_VARIABLES.filter((name) => !env[name]?.trim());
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
  RATE_LIMIT_INVITATION_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_EXPORT_MAX: z.coerce.number().int().positive().default(5),
  INVITATION_ATTEMPTS_PER_USER: z.coerce.number().int().positive().default(10),
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
  // Spec 12. No key = no external prices. The key is sent only to this https address.
  KASSALAPP_BASE_URL: z.url({ protocol: /^https$/ }).default('https://kassal.app/api/v1'),
  KASSALAPP_API_KEY: z.string().trim().min(1).optional(),
  KASSALAPP_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
  KASSALAPP_MAX_PER_MINUTE: z.coerce.number().int().positive().max(60).default(30),
  PRICE_LOOKUPS_PER_MINUTE: z.coerce.number().int().positive().default(30),
  // Spec 13. Only the first 5 characters of the password's SHA-1 are sent (integrations/pwned-passwords.md).
  PWNED_PASSWORDS: z.enum(['on', 'off']).default('off'),
  BACKUP_STATUS_FILE: z.string().trim().min(1).optional(),
  // Spec 13. Make one with: openssl rand -base64 32
  TOTP_ENCRYPTION_KEY: z
    .string()
    .trim()
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'must be 32 bytes in base64',
    })
    .optional(),
  PWNED_PASSWORDS_URL: z.url({ protocol: /^https$/ }).default('https://api.pwnedpasswords.com'),
  PWNED_PASSWORDS_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2000),
  // Spec 17 (ADR-0024). The password is an app password; it is only read here and handed to the SMTP client.
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.email().optional(),
  MAIL_FROM_NAME: z.string().trim().min(1).max(60).default('SmartMat'),
  RATE_LIMIT_PASSWORD_RESET_MAX: z.coerce.number().int().positive().default(5),
  PASSWORD_RESET_PER_HOUR: z.coerce.number().int().positive().default(3),
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
  // `KASSALAPP_API_KEY=` in an env file means "not set" (the staging example has such lines), not an empty key.
  const set = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = envSchema.safeParse(set);
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
      invitation: { max: e.RATE_LIMIT_INVITATION_MAX, windowMs: 15 * MINUTE },
      export: { max: e.RATE_LIMIT_EXPORT_MAX, windowMs: 60 * MINUTE },
      passwordReset: { max: e.RATE_LIMIT_PASSWORD_RESET_MAX, windowMs: 15 * MINUTE },
    },
    invitationAttemptsPerUser: e.INVITATION_ATTEMPTS_PER_USER,
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
    backupStatusFile: e.BACKUP_STATUS_FILE ?? null,
    totpEncryptionKey: e.TOTP_ENCRYPTION_KEY ? Buffer.from(e.TOTP_ENCRYPTION_KEY, 'base64') : null,
    pwnedPasswords: {
      enabled: e.PWNED_PASSWORDS === 'on',
      baseUrl: e.PWNED_PASSWORDS_URL,
      timeoutMs: e.PWNED_PASSWORDS_TIMEOUT_MS,
    },
    mail:
      e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD && e.MAIL_FROM
        ? {
            host: e.SMTP_HOST,
            port: e.SMTP_PORT,
            user: e.SMTP_USER,
            password: e.SMTP_PASSWORD,
            from: { address: e.MAIL_FROM, name: e.MAIL_FROM_NAME },
            linkOrigin: e.APP_ORIGINS[0] ?? '',
          }
        : null,
    passwordResetsPerHour: e.PASSWORD_RESET_PER_HOUR,
    prices: {
      kassalappBaseUrl: e.KASSALAPP_BASE_URL,
      kassalappApiKey: e.KASSALAPP_API_KEY ?? null,
      kassalappTimeoutMs: e.KASSALAPP_TIMEOUT_MS,
      kassalappMaxPerMinute: e.KASSALAPP_MAX_PER_MINUTE,
      lookupsPerUserPerMinute: e.PRICE_LOOKUPS_PER_MINUTE,
    },
  };
}
