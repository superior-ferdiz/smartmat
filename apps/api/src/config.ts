import { existsSync } from 'node:fs';
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
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  rateLimits: {
    login: RateLimitRule;
    register: RateLimitRule;
    /** Password change and account deletion: both check a password. */
    sensitive: RateLimitRule;
  };
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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Playwright registers many users from the same address, so it raises these.
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().positive().default(10),
});

/** Reads and checks the environment. Fails at start-up with the names (not values) of bad variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid or missing environment variables: ${names} (see .env.example)`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    host: e.API_HOST,
    port: e.API_PORT,
    allowedOrigins: e.APP_ORIGINS,
    cookieSecure: e.COOKIE_SECURE === 'true',
    logLevel: e.LOG_LEVEL,
    rateLimits: {
      login: { max: e.RATE_LIMIT_LOGIN_MAX, windowMs: 15 * MINUTE },
      register: { max: e.RATE_LIMIT_REGISTER_MAX, windowMs: 60 * MINUTE },
      sensitive: { max: e.RATE_LIMIT_SENSITIVE_MAX, windowMs: 15 * MINUTE },
    },
  };
}
