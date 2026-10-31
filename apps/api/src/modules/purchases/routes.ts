import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createPurchaseSchema,
  deletePurchaseQuerySchema,
  deletePurchaseResponseSchema,
  monthQuerySchema,
  purchaseListResponseSchema,
  purchaseResponseSchema,
  updatePurchaseSchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { authOf } from '../../plugins/auth';
import type { PurchaseService } from './service';

export interface PurchaseRoutesOptions {
  service: PurchaseService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const purchaseParams = household.extend({ purchaseId: z.uuid() });
const BASE = '/households/:householdId/purchases';

/**
 * FR-BUD-001/002/005. Every route: logged in + member of the household in the URL (NFR-SEC-001).
 * Purchase, line, item and location ids are then looked up *within* that household.
 */
export const purchaseRoutes: FastifyPluginAsyncZod<PurchaseRoutesOptions> = async (
  app,
  options,
) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];
  const purchase = { 200: purchaseResponseSchema };

  app.get(
    BASE,
    {
      preHandler,
      schema: {
        params: household,
        querystring: monthQuerySchema,
        response: { 200: purchaseListResponseSchema },
      },
    },
    async (request) => service.list(householdOf(request).id, request.query.month),
  );

  app.post(
    BASE,
    {
      preHandler,
      schema: {
        params: household,
        body: createPurchaseSchema,
        response: { 200: purchaseResponseSchema, 201: purchaseResponseSchema },
      },
    },
    async (request, reply) => {
      const { purchase: saved, created } = await service.create(
        householdOf(request).id,
        authOf(request).userId,
        request.body,
      );
      // 200 when the same form was sent before (NFR-DATA-002): nothing new was created.
      return reply.status(created ? 201 : 200).send(saved);
    },
  );

  app.get(
    `${BASE}/:purchaseId`,
    { preHandler, schema: { params: purchaseParams, response: purchase } },
    async (request) => service.get(householdOf(request).id, request.params.purchaseId),
  );

  app.put(
    `${BASE}/:purchaseId`,
    {
      preHandler,
      schema: { params: purchaseParams, body: updatePurchaseSchema, response: purchase },
    },
    async (request) =>
      service.update(
        householdOf(request).id,
        authOf(request).userId,
        request.params.purchaseId,
        request.body,
      ),
  );

  app.delete(
    `${BASE}/:purchaseId`,
    {
      preHandler,
      schema: {
        params: purchaseParams,
        querystring: deletePurchaseQuerySchema,
        response: { 200: deletePurchaseResponseSchema },
      },
    },
    async (request) =>
      service.remove(
        householdOf(request).id,
        request.params.purchaseId,
        request.query.removeUntouchedBatches,
      ),
  );
};
