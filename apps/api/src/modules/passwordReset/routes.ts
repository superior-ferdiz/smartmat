import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { passwordResetConfirmSchema, passwordResetRequestSchema } from '@smartmat/shared';
import type { RateLimitRule } from '../../config';
import { rateLimit } from '../../lib/rateLimit';
import type { PasswordResetService } from './service';

export interface PasswordResetRoutesOptions {
  service: PasswordResetService;
  /** FR-AUTH-006a: per IP address, shared by both steps. */
  rateLimit: RateLimitRule;
}

/**
 * Spec 17 (FR-AUTH-006). Not behind requireAuth: the person cannot log in. The Origin check applies as for login.
 * The token is only ever in the body (never in a URL the server logs).
 */
export const passwordResetRoutes: FastifyPluginAsyncZod<PasswordResetRoutesOptions> = async (
  app,
  options,
) => {
  const { service } = options;
  const limit = rateLimit(options.rateLimit);

  app.post(
    '/auth/password-reset',
    { schema: { body: passwordResetRequestSchema }, config: limit },
    async (request, reply) => {
      await service.request(request.body.email);
      return reply.status(202).send();
    },
  );

  app.post(
    '/auth/password-reset/confirm',
    { schema: { body: passwordResetConfirmSchema }, config: limit },
    async (request, reply) => {
      await service.confirm(request.body);
      return reply.status(204).send();
    },
  );
};
