import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  recoveryCodesResponseSchema,
  twoFactorConfirmSchema,
  twoFactorEnableSchema,
  twoFactorSetupResponseSchema,
  twoFactorSetupSchema,
  twoFactorStatusSchema,
} from '@smartmat/shared';
import type { AppConfig } from '../../config';
import { rateLimit } from '../../lib/rateLimit';
import { authOf } from '../../plugins/auth';
import type { TwoFactorService } from './service';

export interface TwoFactorRoutesOptions {
  service: TwoFactorService;
  requireAuth: preHandlerAsyncHookHandler;
  rateLimits: AppConfig['rateLimits'];
}

/**
 * Spec 13 (FR-AUTH-010): /me/two-factor. Everything that checks a password or a code has the same per-IP limit as
 * password change and account deletion. The secret and the recovery codes are in the answer once, never in a log.
 */
export const twoFactorRoutes: FastifyPluginAsyncZod<TwoFactorRoutesOptions> = async (
  app,
  options,
) => {
  const { service, requireAuth, rateLimits } = options;
  app.addHook('preHandler', requireAuth);
  const limited = { config: rateLimit(rateLimits.sensitive) };

  app.get(
    '/me/two-factor',
    { schema: { response: { 200: twoFactorStatusSchema } } },
    async (request) => service.status(authOf(request).userId),
  );

  app.post(
    '/me/two-factor/setup',
    {
      ...limited,
      schema: { body: twoFactorSetupSchema, response: { 200: twoFactorSetupResponseSchema } },
    },
    async (request) => service.setup(authOf(request).userId, request.body.password),
  );

  app.post(
    '/me/two-factor/enable',
    {
      ...limited,
      schema: { body: twoFactorEnableSchema, response: { 200: recoveryCodesResponseSchema } },
    },
    async (request) => service.enable(authOf(request).userId, request.body.code),
  );

  app.post(
    '/me/two-factor/disable',
    { ...limited, schema: { body: twoFactorConfirmSchema } },
    async (request, reply) => {
      await service.disable(authOf(request).userId, request.body.password, request.body.code);
      return reply.status(204).send();
    },
  );

  app.post(
    '/me/two-factor/recovery-codes',
    {
      ...limited,
      schema: { body: twoFactorConfirmSchema, response: { 200: recoveryCodesResponseSchema } },
    },
    async (request) =>
      service.regenerateRecoveryCodes(
        authOf(request).userId,
        request.body.password,
        request.body.code,
      ),
  );
};
