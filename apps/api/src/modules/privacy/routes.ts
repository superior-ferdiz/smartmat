import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { RateLimitRule } from '../../config';
import { rateLimit } from '../../lib/rateLimit';
import { authOf } from '../../plugins/auth';
import type { PrivacyService } from './service';

export interface PrivacyRoutesOptions {
  service: PrivacyService;
  requireAuth: preHandlerAsyncHookHandler;
  rateLimit: RateLimitRule;
}

/**
 * Spec 13 (FR-PRIV-001): GET /me/export. A download link (no fetch needed), so it is a GET; it changes nothing,
 * and another site cannot read the answer (no CORS). The log has the URL and status only.
 */
export const privacyRoutes: FastifyPluginAsyncZod<PrivacyRoutesOptions> = async (app, options) => {
  const { service, requireAuth } = options;

  app.get(
    '/me/export',
    { preHandler: requireAuth, config: rateLimit(options.rateLimit) },
    async (request, reply) => {
      const { fileName, body } = await service.export(authOf(request).userId);
      return reply
        .header('content-type', 'application/json; charset=utf-8')
        .header('content-disposition', `attachment; filename="${fileName}"`)
        .header('cache-control', 'no-store')
        .send(JSON.stringify(body, null, 2));
    },
  );
};
