import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  changePasswordSchema,
  deleteAccountSchema,
  sessionUserSchema,
  updateProfileSchema,
} from '@smartmat/shared';
import type { AppConfig } from '../../config';
import { rateLimit } from '../../lib/rateLimit';
import { authOf, type SessionCookies } from '../../plugins/auth';
import type { ProfileService } from './service';

export interface ProfileRoutesOptions {
  service: ProfileService;
  cookies: SessionCookies;
  requireAuth: preHandlerAsyncHookHandler;
  rateLimits: AppConfig['rateLimits'];
}

/**
 * /me – the logged-in user's own profile (FR-AUTH-004, FR-AUTH-005).
 * There is no /users/:id: the user is always taken from the session, so one user cannot address another.
 */
export const profileRoutes: FastifyPluginAsyncZod<ProfileRoutesOptions> = async (app, options) => {
  const { service, cookies, requireAuth, rateLimits } = options;

  app.addHook('preHandler', requireAuth);

  app.get('/me', { schema: { response: { 200: sessionUserSchema } } }, async (request) =>
    service.get(authOf(request).userId),
  );

  app.patch(
    '/me',
    { schema: { body: updateProfileSchema, response: { 200: sessionUserSchema } } },
    async (request) => service.update(authOf(request).userId, request.body),
  );

  app.post(
    '/me/password',
    { schema: { body: changePasswordSchema }, config: rateLimit(rateLimits.sensitive) },
    async (request, reply) => {
      const auth = authOf(request);
      await service.changePassword(auth.userId, auth.sessionId, request.body);
      return reply.status(204).send();
    },
  );

  app.delete(
    '/me',
    { schema: { body: deleteAccountSchema }, config: rateLimit(rateLimits.sensitive) },
    async (request, reply) => {
      await service.deleteAccount(authOf(request).userId, request.body);
      cookies.clear(reply);
      return reply.status(204).send();
    },
  );
};
