import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  accountSessionsResponseSchema,
  endedSessionsResponseSchema,
  loginNoticesResponseSchema,
  sessionParamsSchema,
} from '@smartmat/shared';
import { authOf } from '../../plugins/auth';
import type { SessionsService } from './service';

export interface SessionsRoutesOptions {
  service: SessionsService;
  requireAuth: preHandlerAsyncHookHandler;
}

/** Spec 13 (FR-AUTH-009). Only under /me: the user comes from the session, so nobody can name another user. */
export const sessionsRoutes: FastifyPluginAsyncZod<SessionsRoutesOptions> = async (
  app,
  options,
) => {
  const { service, requireAuth } = options;
  app.addHook('preHandler', requireAuth);

  app.get(
    '/me/sessions',
    { schema: { response: { 200: accountSessionsResponseSchema } } },
    async (request) => {
      const auth = authOf(request);
      return service.list(auth.userId, auth.sessionId);
    },
  );

  app.delete(
    '/me/sessions/:sessionId',
    { schema: { params: sessionParamsSchema } },
    async (request, reply) => {
      const auth = authOf(request);
      await service.endOther(auth.userId, request.params.sessionId, auth.sessionId);
      return reply.status(204).send();
    },
  );

  app.post(
    '/me/sessions/end-others',
    { schema: { response: { 200: endedSessionsResponseSchema } } },
    async (request) => {
      const auth = authOf(request);
      return service.endAllOthers(auth.userId, auth.sessionId);
    },
  );

  app.get(
    '/me/login-notices',
    { schema: { response: { 200: loginNoticesResponseSchema } } },
    async (request) => {
      const auth = authOf(request);
      return service.loginNotices(auth.userId, auth.sessionId);
    },
  );

  app.post(
    '/me/login-notices/:sessionId/dismiss',
    { schema: { params: sessionParamsSchema } },
    async (request, reply) => {
      const auth = authOf(request);
      await service.dismissNotice(auth.userId, request.params.sessionId, auth.sessionId);
      return reply.status(204).send();
    },
  );
};
