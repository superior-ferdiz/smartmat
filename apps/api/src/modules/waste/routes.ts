import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { monthQuerySchema, wasteStatsSchema } from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import type { WasteService } from './service';

export interface WasteRoutesOptions {
  service: WasteService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });

/** Spec 11 (FR-WASTE-001–004). Logged in + member of the household in the URL (NFR-SEC-001). */
export const wasteRoutes: FastifyPluginAsyncZod<WasteRoutesOptions> = async (app, options) => {
  const { service, requireAuth, householdAccess } = options;

  app.get(
    '/households/:householdId/waste-stats',
    {
      preHandler: [requireAuth, householdAccess],
      schema: {
        params: household,
        querystring: monthQuerySchema,
        response: { 200: wasteStatsSchema },
      },
    },
    async (request) => service.stats(householdOf(request).id, request.query.month),
  );
};
