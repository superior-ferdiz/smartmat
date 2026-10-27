import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  API_ERRORS,
  CSRF_HEADER,
  deviceFromUserAgent,
  loginResponseSchema,
  loginSchema,
  loginSecondStepSchema,
  registerSchema,
  sessionResponseSchema,
} from '@smartmat/shared';
import type { AppConfig } from '../../config';
import { AppError } from '../../lib/errors';
import { rateLimit } from '../../lib/rateLimit';
import { authOf, type SessionCookies } from '../../plugins/auth';
import { safeEqual } from './tokens';
import type { AuthService } from './service';

export interface AuthRoutesOptions {
  service: AuthService;
  cookies: SessionCookies;
  requireAuth: preHandlerAsyncHookHandler;
  rateLimits: AppConfig['rateLimits'];
  /** ADR-0015: false in the closed test environment. */
  registrationOpen: boolean;
}

/** FR-AUTH-001 (register), FR-AUTH-002 (log in/out), FR-AUTH-003 (rate limit). */
export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { service, cookies, requireAuth, rateLimits, registrationOpen } = options;

  app.post(
    '/auth/register',
    {
      schema: { body: registerSchema, response: { 201: sessionResponseSchema } },
      config: rateLimit(rateLimits.register),
      // Before the body is validated: a closed registration says so, whatever is sent.
      onRequest: async () => {
        if (!registrationOpen) throw new AppError(403, API_ERRORS.registrationClosed);
      },
    },
    async (request, reply) => {
      const { user, session } = await service.register(
        request.body,
        deviceFromUserAgent(request.headers['user-agent']),
      );
      cookies.set(reply, session);
      return reply.status(201).send({ user, csrfToken: session.csrfToken });
    },
  );

  app.post(
    '/auth/login',
    {
      schema: { body: loginSchema, response: { 200: loginResponseSchema } },
      config: rateLimit(rateLimits.login),
    },
    async (request, reply) => {
      const result = await service.login(
        request.body,
        deviceFromUserAgent(request.headers['user-agent']),
      );
      // Spec 13 (FR-AUTH-010): two-factor on – no session yet, only the challenge for the code.
      if (result.kind === 'challenge') {
        return { twoFactorRequired: true as const, challenge: result.challenge };
      }
      // Always a new session ID at login. A session this browser had before is ended.
      const previous = cookies.read(request);
      if (previous) await service.logout(previous);
      cookies.set(reply, result.session);
      return { user: result.user, csrfToken: result.session.csrfToken };
    },
  );

  // Spec 13 (FR-AUTH-010): the code after the password. The same per-IP limit as login; wrong codes also count
  // towards the account's lock.
  app.post(
    '/auth/login/two-factor',
    {
      schema: { body: loginSecondStepSchema, response: { 200: sessionResponseSchema } },
      config: rateLimit(rateLimits.login),
    },
    async (request, reply) => {
      const { user, session } = await service.loginSecondStep(
        request.body.challenge,
        request.body.code,
        deviceFromUserAgent(request.headers['user-agent']),
      );
      const previous = cookies.read(request);
      if (previous) await service.logout(previous);
      cookies.set(reply, session);
      return { user, csrfToken: session.csrfToken };
    },
  );

  // Not behind requireAuth: logging out with an expired session should still clear the cookie.
  // A valid session needs the CSRF token, so another site cannot log the user out.
  app.post('/auth/logout', async (request, reply) => {
    const token = cookies.read(request);
    const auth = await service.authenticate(token);
    if (auth && token) {
      const header = request.headers[CSRF_HEADER];
      if (typeof header !== 'string' || !safeEqual(header, auth.csrfToken)) {
        throw new AppError(403, API_ERRORS.invalidCsrf);
      }
      await service.logout(token);
    }
    cookies.clear(reply);
    return reply.status(204).send();
  });

  /** Who is logged in, plus the CSRF token. 401 when nobody is. */
  app.get(
    '/auth/session',
    { preHandler: requireAuth, schema: { response: { 200: sessionResponseSchema } } },
    async (request) => {
      const auth = authOf(request);
      return { user: await service.getSessionUser(auth.userId), csrfToken: auth.csrfToken };
    },
  );
};
