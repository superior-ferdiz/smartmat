import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimitPlugin from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { DestinationStream } from 'pino';
import { API_ERRORS } from '@smartmat/shared';
import type { AppConfig } from './config';
import type { Db } from './db';
import { createHouseholdAccess } from './authz/household';
import { systemClock, type Clock } from './lib/clock';
import { AppError } from './lib/errors';
import { createAuthRepo } from './modules/auth/repo';
import { authRoutes } from './modules/auth/routes';
import { argon2Hasher, type PasswordHasher } from './modules/auth/password';
import { AuthService } from './modules/auth/service';
import { healthRoutes } from './modules/health/routes';
import { createHouseholdRepo } from './modules/households/repo';
import { householdRoutes } from './modules/households/routes';
import { createProfileRepo } from './modules/profile/repo';
import { profileRoutes } from './modules/profile/routes';
import { ProfileService } from './modules/profile/service';
import { createRequireAuth, createSessionCookies, registerAuthDecorations } from './plugins/auth';
import { registerErrorHandling } from './plugins/errors';
import { registerOriginCheck } from './plugins/origin';

export interface AppDeps {
  config: AppConfig;
  db: Db;
  /** Tests pass a fake clock to move time forward. */
  now?: Clock;
  hasher?: PasswordHasher;
  /** Tests capture the log here to check that it contains no personal data. */
  logStream?: DestinationStream;
}

export const API_PREFIX = '/api/v1';

/** Builds the API without starting it (server.ts listens; tests use app.inject). */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const now = deps.now ?? systemClock;
  const hasher = deps.hasher ?? argon2Hasher;

  const app = Fastify({
    // Rate limits count the socket's address. X-Forwarded-For is NOT trusted: any client can set it,
    // and trusting it would let an attacker get a fresh limit per request. (A reverse proxy is phase 13.)
    trustProxy: false,
    bodyLimit: 64 * 1024,
    logger: {
      level: config.logLevel,
      // NFR-SEC-004: no personal data in logs. Request bodies are never logged. The IP address is
      // personal data and is left out; headers that carry secrets are censored if anything logs them.
      serializers: {
        req: (request) => ({ method: request.method, url: request.url }),
      },
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          `req.headers["x-csrf-token"]`,
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      ...(deps.logStream ? { stream: deps.logStream } : {}),
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);
  registerAuthDecorations(app);

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimitPlugin, {
    global: false,
    errorResponseBuilder: () => new AppError(429, API_ERRORS.rateLimited),
  });
  registerOriginCheck(app, config.allowedOrigins);

  const cookies = createSessionCookies(config.cookieSecure);
  const authService = new AuthService({ repo: createAuthRepo(db), hasher, now });
  const profileService = new ProfileService({ repo: createProfileRepo(db), hasher });
  const householdRepo = createHouseholdRepo(db);
  const requireAuth = createRequireAuth(authService, cookies);
  const householdAccess = createHouseholdAccess(householdRepo);

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { db });
      await api.register(authRoutes, {
        service: authService,
        cookies,
        requireAuth,
        rateLimits: config.rateLimits,
      });
      await api.register(profileRoutes, {
        service: profileService,
        cookies,
        requireAuth,
        rateLimits: config.rateLimits,
      });
      await api.register(householdRoutes, { repo: householdRepo, requireAuth, householdAccess });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
