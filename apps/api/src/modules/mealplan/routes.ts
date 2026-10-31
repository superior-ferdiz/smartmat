import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  addPlanToShoppingResponseSchema,
  addPlanToShoppingSchema,
  createMealEntrySchema,
  mealEntryResponseSchema,
  mealPlanNeedsResponseSchema,
  mealPlanRangeSchema,
  mealPlanResponseSchema,
  updateMealEntrySchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { authOf } from '../../plugins/auth';
import type { MealPlanService } from './service';

export interface MealPlanRoutesOptions {
  service: MealPlanService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const entryParams = household.extend({ entryId: z.uuid() });
const BASE = '/households/:householdId/meal-plan';

/**
 * FR-PLAN-001–005 (spec 09). Every route: logged in + member of the household in the URL (NFR-SEC-001).
 * Entries are then looked up *within* that household, so another household's entry id is a 404.
 */
export const mealPlanRoutes: FastifyPluginAsyncZod<MealPlanRoutesOptions> = async (
  app,
  options,
) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  app.get(
    BASE,
    {
      preHandler,
      schema: {
        params: household,
        querystring: mealPlanRangeSchema,
        response: { 200: mealPlanResponseSchema },
      },
    },
    async (request) => service.list(householdOf(request).id, authOf(request).userId, request.query),
  );

  app.post(
    `${BASE}/entries`,
    {
      preHandler,
      schema: {
        params: household,
        body: createMealEntrySchema,
        response: { 200: mealEntryResponseSchema, 201: mealEntryResponseSchema },
      },
    },
    async (request, reply) => {
      const { entry, created } = await service.create(
        householdOf(request).id,
        authOf(request).userId,
        request.body,
      );
      // 200 when the same form was sent before (NFR-DATA-002): nothing new was created.
      return reply.status(created ? 201 : 200).send(entry);
    },
  );

  app.patch(
    `${BASE}/entries/:entryId`,
    {
      preHandler,
      schema: {
        params: entryParams,
        body: updateMealEntrySchema,
        response: { 200: mealEntryResponseSchema },
      },
    },
    async (request) =>
      service.update(
        householdOf(request).id,
        authOf(request).userId,
        request.params.entryId,
        request.body,
      ),
  );

  app.delete(
    `${BASE}/entries/:entryId`,
    { preHandler, schema: { params: entryParams } },
    async (request, reply) => {
      await service.remove(householdOf(request).id, request.params.entryId);
      return reply.status(204).send();
    },
  );

  app.get(
    `${BASE}/needs`,
    {
      preHandler,
      schema: {
        params: household,
        querystring: mealPlanRangeSchema,
        response: { 200: mealPlanNeedsResponseSchema },
      },
    },
    async (request) => service.needs(householdOf(request).id, request.query),
  );

  app.post(
    `${BASE}/shopping`,
    {
      preHandler,
      schema: {
        params: household,
        body: addPlanToShoppingSchema,
        response: { 200: addPlanToShoppingResponseSchema },
      },
    },
    async (request) =>
      service.addToShopping(householdOf(request).id, authOf(request).userId, request.body),
  );
};
