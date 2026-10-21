import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  batchInputSchema,
  consumeSchema,
  createItemSchema,
  discardSchema,
  historyResponseSchema,
  inventoryResponseSchema,
  itemResponseSchema,
  updateBatchSchema,
  updateItemSchema,
  wasteSummarySchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { authOf } from '../../plugins/auth';
import type { InventoryService } from './service';

export interface InventoryRoutesOptions {
  service: InventoryService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const itemParams = household.extend({ itemId: z.uuid() });
const batchParams = household.extend({ batchId: z.uuid() });
const BASE = '/households/:householdId/inventory';

/**
 * FR-INV-001–008. Every route: logged in + member of the household in the URL (NFR-SEC-001).
 * Item and batch ids are then looked up *within* that household by the repo.
 */
export const inventoryRoutes: FastifyPluginAsyncZod<InventoryRoutesOptions> = async (
  app,
  options,
) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];
  const item = { 200: itemResponseSchema };

  app.get(
    BASE,
    { preHandler, schema: { params: household, response: { 200: inventoryResponseSchema } } },
    async (request) => ({
      items: await service.list(householdOf(request).id),
    }),
  );

  app.get(
    `${BASE}/waste-summary`,
    { preHandler, schema: { params: household, response: { 200: wasteSummarySchema } } },
    async (request) => service.wasteSummary(householdOf(request).id),
  );

  app.post(
    `${BASE}/items`,
    {
      preHandler,
      schema: { params: household, body: createItemSchema, response: { 201: itemResponseSchema } },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await service.create(householdOf(request).id, authOf(request).userId, request.body)),
  );

  app.get(
    `${BASE}/items/:itemId`,
    { preHandler, schema: { params: itemParams, response: item } },
    async (request) => service.get(householdOf(request).id, request.params.itemId),
  );

  app.patch(
    `${BASE}/items/:itemId`,
    { preHandler, schema: { params: itemParams, body: updateItemSchema, response: item } },
    async (request) => service.update(householdOf(request).id, request.params.itemId, request.body),
  );

  app.delete(
    `${BASE}/items/:itemId`,
    { preHandler, schema: { params: itemParams } },
    async (request, reply) => {
      await service.remove(householdOf(request).id, request.params.itemId);
      return reply.status(204).send();
    },
  );

  app.post(
    `${BASE}/items/:itemId/batches`,
    {
      preHandler,
      schema: { params: itemParams, body: batchInputSchema, response: { 201: itemResponseSchema } },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.addBatch(
            householdOf(request).id,
            authOf(request).userId,
            request.params.itemId,
            request.body,
          ),
        ),
  );

  app.get(
    `${BASE}/items/:itemId/history`,
    { preHandler, schema: { params: itemParams, response: { 200: historyResponseSchema } } },
    async (request) => service.history(householdOf(request).id, request.params.itemId),
  );

  app.post(
    `${BASE}/items/:itemId/undo`,
    { preHandler, schema: { params: itemParams, response: item } },
    async (request) =>
      service.undo(householdOf(request).id, authOf(request).userId, request.params.itemId),
  );

  app.patch(
    `${BASE}/batches/:batchId`,
    { preHandler, schema: { params: batchParams, body: updateBatchSchema, response: item } },
    async (request) =>
      service.updateBatch(
        householdOf(request).id,
        authOf(request).userId,
        request.params.batchId,
        request.body,
      ),
  );

  app.delete(
    `${BASE}/batches/:batchId`,
    { preHandler, schema: { params: batchParams, response: item } },
    async (request) => service.deleteBatch(householdOf(request).id, request.params.batchId),
  );

  app.post(
    `${BASE}/batches/:batchId/consume`,
    { preHandler, schema: { params: batchParams, body: consumeSchema, response: item } },
    async (request) =>
      service.consume(
        householdOf(request).id,
        authOf(request).userId,
        request.params.batchId,
        request.body,
      ),
  );

  app.post(
    `${BASE}/batches/:batchId/discard`,
    { preHandler, schema: { params: batchParams, body: discardSchema, response: item } },
    async (request) =>
      service.discard(
        householdOf(request).id,
        authOf(request).userId,
        request.params.batchId,
        request.body,
      ),
  );
};
